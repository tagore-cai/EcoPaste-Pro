use base64::{engine::general_purpose, Engine as _};
use image::codecs::png::PngEncoder;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

#[cfg(any(target_os = "linux", test))]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAppInfo {
    pub app_name: String,
    pub app_icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ProcessInfo {
    pub(super) name: String,
    pub(super) path: String,
}

impl ProcessInfo {
    pub(super) fn from_path(path: String) -> Self {
        let name = process_name_from_path(&path);
        Self { name, path }
    }
}

fn source_app_info_from_process(process: ProcessInfo) -> SourceAppInfo {
    let app_icon = get_icon_from_path(&process.path);
    SourceAppInfo {
        app_name: process.name,
        app_icon,
    }
}

pub(super) fn process_name_from_path(path: &str) -> String {
    let normalized_path = path.replace('\\', "/");
    Path::new(&normalized_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string()
}

fn get_icon_from_path(app_path: &str) -> Option<String> {
    let icon_result = file_icon_provider::get_file_icon(app_path, 64).ok()?;
    let img =
        image::RgbaImage::from_raw(icon_result.width, icon_result.height, icon_result.pixels)?;

    let mut buffer = Cursor::new(Vec::new());
    let encoder = PngEncoder::new(&mut buffer);
    img.write_with_encoder(encoder).ok()?;

    let base64_str = general_purpose::STANDARD.encode(buffer.get_ref());
    Some(format!("data:image/png;base64,{}", base64_str))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn process_name_from_unix_app_bundle_path_uses_bundle_name() {
        assert_eq!(
            process_name_from_path("/Applications/Visual Studio Code.app"),
            "Visual Studio Code"
        );
    }

    #[test]
    fn process_name_from_executable_path_uses_file_stem() {
        assert_eq!(process_name_from_path("/usr/bin/firefox"), "firefox");
        assert_eq!(
            process_name_from_path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            "chrome"
        );
    }
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub fn get_clipboard_owner_process() -> Result<(String, String), String> {
    windows::infer_clipboard_owner_process_info().map(|process| (process.name, process.path))
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub fn get_clipboard_owner_process() -> Result<(String, String), String> {
    macos::infer_clipboard_owner_process_info().map(|process| (process.name, process.path))
}

#[cfg(target_os = "linux")]
#[allow(dead_code)]
pub fn get_clipboard_owner_process() -> Result<(String, String), String> {
    linux::infer_clipboard_owner_process_info().map(|process| (process.name, process.path))
}

#[cfg(all(
    not(target_os = "windows"),
    not(target_os = "macos"),
    not(target_os = "linux")
))]
pub fn get_clipboard_owner_process() -> Result<(String, String), String> {
    Err("Clipboard owner process is not supported on this platform".to_string())
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub fn get_active_window_process() -> Result<(String, String), String> {
    windows::infer_active_window_process_info().map(|process| (process.name, process.path))
}

#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub fn get_active_window_process() -> Result<(String, String), String> {
    macos::infer_active_window_process_info().map(|process| (process.name, process.path))
}

#[cfg(target_os = "linux")]
#[allow(dead_code)]
pub fn get_active_window_process() -> Result<(String, String), String> {
    linux::infer_active_window_process_info().map(|process| (process.name, process.path))
}

#[cfg(all(
    not(target_os = "windows"),
    not(target_os = "macos"),
    not(target_os = "linux")
))]
pub fn get_active_window_process() -> Result<(String, String), String> {
    Err("Active window process is not supported on this platform".to_string())
}

fn infer_source_process() -> Result<ProcessInfo, String> {
    #[cfg(target_os = "windows")]
    {
        windows::infer_clipboard_owner_process_info()
            .or_else(|_| windows::infer_active_window_process_info())
    }

    #[cfg(target_os = "macos")]
    {
        macos::infer_clipboard_owner_process_info()
    }

    #[cfg(target_os = "linux")]
    {
        linux::infer_clipboard_owner_process_info()
    }

    #[cfg(all(
        not(target_os = "windows"),
        not(target_os = "macos"),
        not(target_os = "linux")
    ))]
    {
        Err("Source process inference is not supported on this platform".to_string())
    }
}

#[tauri::command]
pub fn get_clipboard_sequence_number() -> u32 {
    #[cfg(target_os = "windows")]
    unsafe {
        ::windows::Win32::System::DataExchange::GetClipboardSequenceNumber()
    }
    #[cfg(not(target_os = "windows"))]
    0
}

#[tauri::command]
pub fn get_source_app_info() -> Result<SourceAppInfo, String> {
    infer_source_process()
        .map(source_app_info_from_process)
        .map_err(|_| "Failed to get source app info".to_string())
}
