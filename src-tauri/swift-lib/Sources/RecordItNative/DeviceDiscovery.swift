import AVFoundation
import Foundation

public struct DeviceInfo: Codable {
    let id: String
    let name: String
    let type: String
    let deviceType: String
    let position: String
    let isConnected: Bool
}

public class DeviceDiscovery {
    public static func getDevices() -> [DeviceInfo] {
        var devicesInfo = [DeviceInfo]()
        
        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInWideAngleCamera,
                .continuityCamera,
                .external,
                .microphone
            ],
            mediaType: nil,
            position: .unspecified
        )
        
        for device in discoverySession.devices {
            let mediaType: String
            if device.hasMediaType(.video) {
                mediaType = "video"
            } else if device.hasMediaType(.audio) {
                mediaType = "audio"
            } else {
                mediaType = "unknown"
            }
            
            let devTypeStr: String
            switch device.deviceType {
            case .builtInWideAngleCamera, .microphone:
                devTypeStr = "builtin"
            case .continuityCamera:
                devTypeStr = "continuity"
            case .external:
                devTypeStr = "external"
            default:
                devTypeStr = "unknown"
            }
            
            let posStr: String
            switch device.position {
            case .front: posStr = "front"
            case .back: posStr = "back"
            default: posStr = "unspecified"
            }
            
            let info = DeviceInfo(
                id: device.uniqueID,
                name: device.localizedName,
                type: mediaType,
                deviceType: devTypeStr,
                position: posStr,
                isConnected: device.isConnected
            )
            devicesInfo.append(info)
        }
        
        return devicesInfo
    }
}
