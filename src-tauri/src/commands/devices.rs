use crate::ffi;

#[tauri::command]
pub fn list_devices() -> Result<String, String> {
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::discover_devices() };
        s.to_string()
    });
    Ok(result)
}

#[tauri::command]
pub fn select_camera(device_id: String) -> Result<String, String> {
    use swift_rs::SRString;
    let did = SRString::from(device_id.as_str());
    let media = SRString::from("video");
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::select_device(&did, &media) };
        s.to_string()
    });
    Ok(result)
}

#[tauri::command]
pub fn select_microphone(device_id: String) -> Result<String, String> {
    use swift_rs::SRString;
    let did = SRString::from(device_id.as_str());
    let media = SRString::from("audio");
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::select_device(&did, &media) };
        s.to_string()
    });
    Ok(result)
}

#[tauri::command]
pub fn request_permissions() -> Result<String, String> {
    let result = swift_rs::autoreleasepool!({
        let s = unsafe { ffi::request_permissions() };
        s.to_string()
    });
    Ok(result)
}
