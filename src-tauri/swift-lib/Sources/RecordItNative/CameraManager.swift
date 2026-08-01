import AVFoundation
import Foundation

public enum RecordingMode: String {
    case videoAudio = "video_audio"
    case audioOnly = "audio_only"
}

public class CameraManager: NSObject, AVCaptureFileOutputRecordingDelegate {
    public static let shared = CameraManager()
    
    private let captureSession = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "com.recordit.capture", qos: .userInitiated)
    
    private var movieFileOutput: AVCaptureMovieFileOutput?
    
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    
    // Keep reference to video device for re-adding after audio-only recording
    private var currentVideoDevice: AVCaptureDevice?
    
    private var state: String = "idle"
    private var isSessionConfigured = false
    private var currentMode: RecordingMode = .videoAudio
    
    private override init() {
        super.init()
    }
    
    public func setupSessionAsync() {
        sessionQueue.async {
            guard !self.isSessionConfigured else { return }
            
            self.captureSession.beginConfiguration()
            
            if self.captureSession.canSetSessionPreset(.high) {
                self.captureSession.sessionPreset = .high
            }
            
            // Add video input
            if let videoDevice = AVCaptureDevice.systemPreferredCamera ?? AVCaptureDevice.default(for: .video) {
                self.currentVideoDevice = videoDevice
                if let videoDeviceInput = try? AVCaptureDeviceInput(device: videoDevice) {
                    if self.captureSession.canAddInput(videoDeviceInput) {
                        self.captureSession.addInput(videoDeviceInput)
                        self.videoInput = videoDeviceInput
                    }
                }
            }
            
            // Add audio input
            if let audioDevice = AVCaptureDevice.default(for: .audio),
               let audioDeviceInput = try? AVCaptureDeviceInput(device: audioDevice) {
                if self.captureSession.canAddInput(audioDeviceInput) {
                    self.captureSession.addInput(audioDeviceInput)
                    self.audioInput = audioDeviceInput
                }
            }
            
            // Add movie file output
            let movieOutput = AVCaptureMovieFileOutput()
            movieOutput.movieFragmentInterval = CMTime.invalid // Write as single file
            if self.captureSession.canAddOutput(movieOutput) {
                self.captureSession.addOutput(movieOutput)
                self.movieFileOutput = movieOutput
            }
            
            self.captureSession.commitConfiguration()
            self.captureSession.startRunning()
            self.isSessionConfigured = true
            print("[RecordIt] AVCaptureSession successfully initialized & running")
        }
    }
    
    public func switchCamera(deviceId: String) throws {
        try switchDevice(deviceId: deviceId, mediaType: .video)
    }
    
    public func switchMicrophone(deviceId: String) throws {
        try switchDevice(deviceId: deviceId, mediaType: .audio)
    }
    
    private func switchDevice(deviceId: String, mediaType: AVMediaType) throws {
        guard let device = AVCaptureDevice(uniqueID: deviceId) else {
            throw NSError(domain: "CameraManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Device not found: \(deviceId)"])
        }
        
        guard device.hasMediaType(mediaType) else {
            throw NSError(domain: "CameraManager", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid media type for device"])
        }
        
        let newInput = try AVCaptureDeviceInput(device: device)
        
        sessionQueue.async {
            self.captureSession.beginConfiguration()
            
            if mediaType == .video {
                if let oldInput = self.videoInput {
                    self.captureSession.removeInput(oldInput)
                }
                if self.captureSession.canAddInput(newInput) {
                    self.captureSession.addInput(newInput)
                    self.videoInput = newInput
                    self.currentVideoDevice = device
                } else if let oldInput = self.videoInput {
                    // Rollback
                    self.captureSession.addInput(oldInput)
                }
            } else {
                if let oldInput = self.audioInput {
                    self.captureSession.removeInput(oldInput)
                }
                if self.captureSession.canAddInput(newInput) {
                    self.captureSession.addInput(newInput)
                    self.audioInput = newInput
                } else if let oldInput = self.audioInput {
                    // Rollback
                    self.captureSession.addInput(oldInput)
                }
            }
            
            self.captureSession.commitConfiguration()
        }
    }
    
    public func startRecording(outputPath: String, mode: String) throws {
        guard isSessionConfigured else {
            // Auto setup session if not done yet
            setupSessionAsync()
            throw NSError(domain: "CameraManager", code: 500, userInfo: [NSLocalizedDescriptionKey: "Capture session is initializing, please try again in a moment."])
        }
        
        guard let movieFileOutput = movieFileOutput else {
            throw NSError(domain: "CameraManager", code: 500, userInfo: [NSLocalizedDescriptionKey: "Movie output not configured."])
        }
        
        guard !movieFileOutput.isRecording else {
            throw NSError(domain: "CameraManager", code: 409, userInfo: [NSLocalizedDescriptionKey: "Already recording"])
        }
        
        let recordingMode = RecordingMode(rawValue: mode) ?? .videoAudio
        self.currentMode = recordingMode
        self.state = "recording"
        
        let url = URL(fileURLWithPath: outputPath)
        
        // Ensure parent directory exists
        let dir = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        
        // Remove file if it already exists
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.removeItem(at: url)
        }
        
        sessionQueue.async {
            // For audio-only, temporarily remove video input
            if recordingMode == .audioOnly {
                if let videoIn = self.videoInput {
                    self.captureSession.beginConfiguration()
                    self.captureSession.removeInput(videoIn)
                    self.captureSession.commitConfiguration()
                }
            } else {
                // Ensure video input is present for video recording
                if self.videoInput == nil || !self.captureSession.inputs.contains(where: { ($0 as? AVCaptureDeviceInput)?.device.hasMediaType(.video) == true }) {
                    if let device = self.currentVideoDevice,
                       let input = try? AVCaptureDeviceInput(device: device) {
                        self.captureSession.beginConfiguration()
                        if self.captureSession.canAddInput(input) {
                            self.captureSession.addInput(input)
                            self.videoInput = input
                        }
                        self.captureSession.commitConfiguration()
                    }
                }
            }
            
            movieFileOutput.startRecording(to: url, recordingDelegate: self)
        }
    }
    
    public func stopRecording() {
        guard let movieFileOutput = movieFileOutput, movieFileOutput.isRecording else {
            return
        }
        self.state = "stopping"
        sessionQueue.async {
            movieFileOutput.stopRecording()
        }
    }
    
    public func getStatus() -> String {
        return self.state
    }
    
    public func requestPermissionsAsync(completion: @escaping (Bool) -> Void) {
        AVCaptureDevice.requestAccess(for: .video) { videoGranted in
            AVCaptureDevice.requestAccess(for: .audio) { audioGranted in
                completion(videoGranted && audioGranted)
            }
        }
    }
    
    // MARK: - AVCaptureFileOutputRecordingDelegate
    
    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            print("[RecordIt] Recording finished with error: \(error.localizedDescription)")
        } else {
            print("[RecordIt] Recording saved: \(outputFileURL.path)")
        }
        
        // Re-add video input if it was removed for audio-only recording
        if self.currentMode == .audioOnly {
            sessionQueue.async {
                if let device = self.currentVideoDevice,
                   let input = try? AVCaptureDeviceInput(device: device) {
                    self.captureSession.beginConfiguration()
                    if self.captureSession.canAddInput(input) {
                        self.captureSession.addInput(input)
                        self.videoInput = input
                    }
                    self.captureSession.commitConfiguration()
                }
            }
        }
        
        self.state = "idle"
    }
}
