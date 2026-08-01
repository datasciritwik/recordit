import AVFoundation
import Foundation

public struct EffectState: Codable {
    let id: String
    let name: String
    let supported: Bool
    let enabled: Bool
    let active: Bool
    let canToggle: Bool
}

public class EffectsManager {
    
    /// Returns the current status of all available camera/mic effects.
    /// Most effects are system-controlled via macOS Control Center.
    /// Centre Stage can be toggled programmatically via `isCenterStageEnabled`.
    public static func getEffectsStatus() -> [EffectState] {
        var effects = [EffectState]()
        let defaultVideoDevice = AVCaptureDevice.systemPreferredCamera ?? AVCaptureDevice.default(for: .video)
        
        // Centre Stage
        if #available(macOS 12.3, *) {
            let enabled = AVCaptureDevice.isCenterStageEnabled
            let active = defaultVideoDevice?.isCenterStageActive ?? false
            effects.append(EffectState(
                id: "centerStage", name: "Centre Stage",
                supported: true, enabled: enabled, active: active,
                canToggle: true
            ))
        } else {
            effects.append(EffectState(
                id: "centerStage", name: "Centre Stage",
                supported: false, enabled: false, active: false,
                canToggle: false
            ))
        }
        
        // Portrait Effect (instance property on AVCaptureDevice)
        if #available(macOS 12.0, *) {
            let active = defaultVideoDevice?.isPortraitEffectActive ?? false
            effects.append(EffectState(
                id: "portrait", name: "Portrait",
                supported: true, enabled: active, active: active,
                canToggle: false
            ))
        }
        
        // Studio Light (class & instance properties)
        if #available(macOS 13.0, *) {
            let enabled = AVCaptureDevice.isStudioLightEnabled
            let active = defaultVideoDevice?.isStudioLightActive ?? false
            effects.append(EffectState(
                id: "studioLight", name: "Studio Light",
                supported: true, enabled: enabled, active: active,
                canToggle: false
            ))
        }
        
        // Reactions (class property)
        if #available(macOS 14.0, *) {
            let enabled = AVCaptureDevice.reactionEffectsEnabled
            effects.append(EffectState(
                id: "reactions", name: "Reactions",
                supported: true, enabled: enabled, active: enabled,
                canToggle: false
            ))
        }
        
        // Mic Mode (system-wide setting)
        if #available(macOS 14.0, *) {
            let micMode = AVCaptureDevice.preferredMicrophoneMode
            let micModeName: String
            switch micMode {
            case .standard: micModeName = "Standard"
            case .voiceIsolation: micModeName = "Voice Isolation"
            case .wideSpectrum: micModeName = "Wide Spectrum"
            @unknown default: micModeName = "Standard"
            }
            effects.append(EffectState(
                id: "micMode", name: "Mic: \(micModeName)",
                supported: true, enabled: true, active: true,
                canToggle: false
            ))
        }
        
        return effects
    }
    
    /// Toggle a camera effect. Centre Stage can be toggled programmatically.
    public static func toggleEffect(name: String, enabled: Bool) -> Bool {
        switch name {
        case "centerStage":
            if #available(macOS 12.3, *) {
                AVCaptureDevice.centerStageControlMode = .cooperative
                AVCaptureDevice.isCenterStageEnabled = enabled
                return true
            }
        default:
            break
        }
        return false
    }
}
