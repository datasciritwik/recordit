use swift_rs::SRString;
use chrono::Local;
use std::path::Path;
use crate::state::AppState;
use crate::ffi;

#[tauri::command]
pub fn start_recording(mode: String, state: tauri::State<AppState>) -> Result<String, String> {
    let folder = state.recordings_folder.lock().map_err(|_| "Mutex error".to_string())?;
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();

    let (ext, is_video) = if mode == "audio" {
        ("m4a", false)
    } else {
        ("mov", true)
    };

    let filename = format!("Recording_{}.{}", timestamp, ext);
    let path = Path::new(&*folder).join(&filename);
    let path_str = path.to_string_lossy().to_string();

    // Ensure the folder exists
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let sr_path = SRString::from(path_str.as_str());

    let result = swift_rs::autoreleasepool!({
        let s = unsafe {
            if is_video {
                ffi::start_video_recording(&sr_path)
            } else {
                ffi::start_audio_recording(&sr_path)
            }
        };
        s.to_string()
    });

    Ok(result)
}

#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::stop_recording() };
        s.to_string()
    });
    Ok(result)
}

#[tauri::command]
pub fn get_recording_status() -> Result<String, String> {
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::get_recording_status() };
        s.to_string()
    });
    Ok(result)
}
