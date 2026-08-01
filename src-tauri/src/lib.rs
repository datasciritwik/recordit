pub mod ffi;
pub mod state;
pub mod commands;

use state::AppState;
use std::fs;
use std::path::Path;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let state = app.state::<AppState>();
            let folder = state.recordings_folder.lock().unwrap().clone();
            let path = Path::new(&folder);
            if !path.exists() {
                let _ = fs::create_dir_all(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::devices::list_devices,
            commands::devices::select_camera,
            commands::devices::select_microphone,
            commands::devices::request_permissions,
            commands::recording::start_recording,
            commands::recording::stop_recording,
            commands::recording::get_recording_status,
            commands::effects::get_effects,
            commands::effects::toggle_effect,
            commands::files::list_recordings,
            commands::files::rename_recording,
            commands::files::delete_recording,
            commands::files::open_recording,
            commands::files::reveal_in_finder,
            commands::files::set_recordings_folder,
            commands::files::get_recordings_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
