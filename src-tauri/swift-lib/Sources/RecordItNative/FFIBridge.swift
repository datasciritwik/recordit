import AVFoundation
import Foundation
import SwiftRs

func makeResponse(success: Bool, data: Any? = nil, error: String? = nil) -> SRString {
    var dict: [String: Any] = ["success": success]
    if let data = data {
        dict["data"] = data
    }
    if let error = error {
        dict["error"] = error
    }

    // Serialize to JSON, return as SRString
    if JSONSerialization.isValidJSONObject(dict),
       let jsonData = try? JSONSerialization.data(withJSONObject: dict),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        return SRString(jsonString)
    }
    return SRString("{\"success\": false, \"error\": \"Failed to encode response\"}")
}

@_cdecl("discover_devices")
public func discoverDevices() -> SRString {
    let devices = DeviceDiscovery.getDevices()
    return makeResponse(success: true, data: devices.map { device -> [String: Any] in
        return [
            "id": device.id,
            "name": device.name,
            "type": device.type,
            "deviceType": device.deviceType,
            "position": device.position,
            "isConnected": device.isConnected
        ]
    })
}

@_cdecl("start_video_recording")
public func startVideoRecording(_ path: SRString) -> SRString {
    do {
        try CameraManager.shared.startRecording(outputPath: path.toString(), mode: "video_audio")
        return makeResponse(success: true)
    } catch {
        return makeResponse(success: false, error: error.localizedDescription)
    }
}

@_cdecl("start_audio_recording")
public func startAudioRecording(_ path: SRString) -> SRString {
    do {
        try CameraManager.shared.startRecording(outputPath: path.toString(), mode: "audio_only")
        return makeResponse(success: true)
    } catch {
        return makeResponse(success: false, error: error.localizedDescription)
    }
}

@_cdecl("stop_recording")
public func stopRecording() -> SRString {
    CameraManager.shared.stopRecording()
    return makeResponse(success: true)
}

@_cdecl("get_effects_status")
public func getEffectsStatus() -> SRString {
    let status = EffectsManager.getEffectsStatus()
    return makeResponse(success: true, data: status.map { effect -> [String: Any] in
        return [
            "id": effect.id,
            "name": effect.name,
            "supported": effect.supported,
            "enabled": effect.enabled,
            "active": effect.active,
            "canToggle": effect.canToggle
        ]
    })
}

@_cdecl("toggle_effect")
public func toggleEffect(_ name: SRString, _ enabled: Bool) -> SRString {
    let success = EffectsManager.toggleEffect(name: name.toString(), enabled: enabled)
    if success {
        return makeResponse(success: true)
    } else {
        return makeResponse(success: false, error: "Effect not found or not supported")
    }
}

@_cdecl("select_device")
public func selectDevice(_ deviceId: SRString, _ mediaType: SRString) -> SRString {
    do {
        if mediaType.toString() == "video" {
            try CameraManager.shared.switchCamera(deviceId: deviceId.toString())
        } else if mediaType.toString() == "audio" {
            try CameraManager.shared.switchMicrophone(deviceId: deviceId.toString())
        } else {
            return makeResponse(success: false, error: "Invalid media type")
        }
        return makeResponse(success: true)
    } catch {
        return makeResponse(success: false, error: error.localizedDescription)
    }
}

@_cdecl("get_recording_status")
public func getRecordingStatus() -> SRString {
    let status = CameraManager.shared.getStatus()
    return makeResponse(success: true, data: status)
}

@_cdecl("trash_file")
public func trashFile(_ path: SRString) -> SRString {
    let url = URL(fileURLWithPath: path.toString())
    var resultingItemURL: NSURL?
    do {
        try FileManager.default.trashItem(at: url, resultingItemURL: &resultingItemURL)
        return makeResponse(success: true)
    } catch {
        return makeResponse(success: false, error: error.localizedDescription)
    }
}

@_cdecl("request_permissions")
public func requestPermissions() -> SRString {
    let videoStatus = AVCaptureDevice.authorizationStatus(for: .video)
    let audioStatus = AVCaptureDevice.authorizationStatus(for: .audio)

    if videoStatus == .authorized && audioStatus == .authorized {
        CameraManager.shared.setupSessionAsync()
        return makeResponse(success: true, data: "authorized")
    }

    if videoStatus == .denied || audioStatus == .denied {
        return makeResponse(success: false, error: "Permissions denied in System Settings")
    }

    // Request permissions asynchronously without blocking the thread
    CameraManager.shared.requestPermissionsAsync { granted in
        if granted {
            CameraManager.shared.setupSessionAsync()
        }
    }

    return makeResponse(success: true, data: "requesting")
}
