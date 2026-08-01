use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::process::Command;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct RecordingFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: u64,
}

#[tauri::command]
pub fn list_recordings(state: tauri::State<AppState>) -> Result<String, String> {
    let folder = state.recordings_folder.lock().map_err(|_| "Mutex error".to_string())?;
    let path = Path::new(&*folder);

    if !path.exists() {
        return Ok(json!({"success": true, "data": []}).to_string());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext == "mov" || ext == "m4a" || ext == "mp4" {
                    if let Ok(metadata) = entry.metadata() {
                        let modified = metadata.modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(0);

                        files.push(RecordingFile {
                            name: entry.file_name().to_string_lossy().to_string(),
                            path: path.to_string_lossy().to_string(),
                            size: metadata.len(),
                            modified,
                        });
                    }
                }
            }
        }
    }

    // Sort by modified date, newest first
    files.sort_by(|a, b| b.modified.cmp(&a.modified));

    let response = json!({"success": true, "data": files});
    Ok(response.to_string())
}

#[tauri::command]
pub fn rename_recording(old_path: String, new_name: String) -> Result<String, String> {
    let path = Path::new(&old_path);
    let parent = path.parent().ok_or("Invalid path")?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let new_filename = if new_name.ends_with(&format!(".{}", ext)) || ext.is_empty() {
        new_name
    } else {
        format!("{}.{}", new_name, ext)
    };

    let new_path = parent.join(&new_filename);
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;

    Ok(json!({"success": true, "data": new_path.to_string_lossy().to_string()}).to_string())
}

#[tauri::command]
pub fn delete_recording(path: String) -> Result<String, String> {
    use swift_rs::SRString;
    let sr_path = SRString::from(path.as_str());
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { crate::ffi::trash_file(&sr_path) };
        s.to_string()
    });
    // Parse the response to check success
    let data: serde_json::Value = serde_json::from_str(&result).map_err(|e| e.to_string())?;
    if data.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        Ok(json!({"success": true}).to_string())
    } else {
        Err(data.get("error").and_then(|v| v.as_str()).unwrap_or("Failed to move to trash").to_string())
    }
}

#[tauri::command]
pub fn open_recording(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_recordings_folder(path: String, state: tauri::State<AppState>) -> Result<String, String> {
    // Create folder if it doesn't exist
    let folder_path = Path::new(&path);
    if !folder_path.exists() {
        fs::create_dir_all(folder_path).map_err(|e| e.to_string())?;
    }

    let mut folder = state.recordings_folder.lock().map_err(|_| "Mutex error".to_string())?;
    *folder = path;
    Ok(json!({"success": true}).to_string())
}

#[tauri::command]
pub fn get_recordings_folder(state: tauri::State<AppState>) -> Result<String, String> {
    let folder = state.recordings_folder.lock().map_err(|_| "Mutex error".to_string())?;
    Ok(json!({"success": true, "data": folder.clone()}).to_string())
}
