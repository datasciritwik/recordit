use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AppState {
    pub recordings_folder: Mutex<String>,
}

impl Default for AppState {
    fn default() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        let default_folder = home.join("Movies").join("RecordIt");
        Self {
            recordings_folder: Mutex::new(default_folder.to_string_lossy().to_string()),
        }
    }
}
