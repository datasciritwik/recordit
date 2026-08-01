use swift_rs::{swift, SRString};

swift!(pub fn discover_devices() -> SRString);
swift!(pub fn start_video_recording(path: &SRString) -> SRString);
swift!(pub fn start_audio_recording(path: &SRString) -> SRString);
swift!(pub fn stop_recording() -> SRString);
swift!(pub fn get_effects_status() -> SRString);
swift!(pub fn toggle_effect(name: &SRString, enabled: bool) -> SRString);
swift!(pub fn select_device(device_id: &SRString, media_type: &SRString) -> SRString);
swift!(pub fn get_recording_status() -> SRString);
swift!(pub fn trash_file(path: &SRString) -> SRString);
swift!(pub fn request_permissions() -> SRString);
