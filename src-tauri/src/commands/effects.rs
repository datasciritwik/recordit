use swift_rs::SRString;
use crate::ffi;

#[tauri::command]
pub fn get_effects() -> Result<String, String> {
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::get_effects_status() };
        s.to_string()
    });
    Ok(result)
}

#[tauri::command]
pub fn toggle_effect(name: String, enabled: bool) -> Result<String, String> {
    let s_name = SRString::from(name.as_str());
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::toggle_effect(&s_name, enabled) };
        s.to_string()
    });
    Ok(result)
}
