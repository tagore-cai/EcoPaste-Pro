use super::ProcessInfo;

struct ProcessHandle(windows::Win32::Foundation::HANDLE);

impl ProcessHandle {
    fn new(handle: windows::Win32::Foundation::HANDLE) -> Self {
        Self(handle)
    }

    fn raw(&self) -> windows::Win32::Foundation::HANDLE {
        self.0
    }
}

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

fn process_info_from_window(hwnd: windows::Win32::Foundation::HWND) -> Result<ProcessInfo, String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    unsafe {
        if hwnd.is_invalid() || hwnd == HWND::default() {
            return Err("Invalid window handle".to_string());
        }

        let mut process_id: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id as *mut u32));

        if process_id == 0 {
            return Err("Failed to get process ID".to_string());
        }

        let process_handle = ProcessHandle::new(
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
                .map_err(|e| e.to_string())?,
        );

        let mut exe_path = vec![0u16; 32768];
        let mut exe_path_len = exe_path.len() as u32;

        QueryFullProcessImageNameW(
            process_handle.raw(),
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(exe_path.as_mut_ptr()),
            &mut exe_path_len,
        )
        .map_err(|e| e.to_string())?;

        let exe_path_str = String::from_utf16_lossy(&exe_path[..exe_path_len as usize]);
        Ok(ProcessInfo::from_path(exe_path_str))
    }
}

pub(super) fn infer_clipboard_owner_process_info() -> Result<ProcessInfo, String> {
    use windows::Win32::System::DataExchange::GetClipboardOwner;

    let hwnd_owner = unsafe { GetClipboardOwner().map_err(|e| e.to_string())? };
    process_info_from_window(hwnd_owner).map_err(|e| {
        if e == "Invalid window handle" {
            "Failed to get clipboard owner".to_string()
        } else {
            e
        }
    })
}

pub(super) fn infer_active_window_process_info() -> Result<ProcessInfo, String> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return Err("No active window".to_string());
    }

    process_info_from_window(hwnd)
}
