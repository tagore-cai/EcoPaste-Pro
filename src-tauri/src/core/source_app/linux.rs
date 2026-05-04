use super::ProcessInfo;

fn parse_xprop_active_window(output: &str) -> Option<String> {
    let window_id = output.split('#').nth(1)?.trim();
    if window_id.is_empty() || window_id == "0x0" {
        return None;
    }
    Some(window_id.to_string())
}

fn parse_xprop_window_pid(output: &str) -> Option<u32> {
    output
        .split('=')
        .nth(1)?
        .trim()
        .parse::<u32>()
        .ok()
        .filter(|pid| *pid > 0)
}

fn linux_x11_unavailable_reason(
    display: Option<&str>,
    session_type: Option<&str>,
) -> Option<String> {
    if display.filter(|value| !value.trim().is_empty()).is_some() {
        return None;
    }

    if session_type
        .map(|value| value.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
    {
        return Some("Wayland source app detection requires XWayland DISPLAY".to_string());
    }

    Some("X11 DISPLAY is not available".to_string())
}

fn xprop_spawn_error_message(error: &std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        "xprop is required for X11 source app detection".to_string()
    } else {
        format!("Failed to run xprop: {error}")
    }
}

#[allow(dead_code)]
pub(super) fn infer_clipboard_owner_process_info() -> Result<ProcessInfo, String> {
    infer_active_window_process_info()
}

#[allow(dead_code)]
pub(super) fn infer_active_window_process_info() -> Result<ProcessInfo, String> {
    use std::process::Command;

    let display = std::env::var("DISPLAY").ok();
    let session_type = std::env::var("XDG_SESSION_TYPE").ok();
    if let Some(reason) = linux_x11_unavailable_reason(display.as_deref(), session_type.as_deref())
    {
        return Err(reason);
    }

    let active_window_output = Command::new("xprop")
        .args(["-root", "_NET_ACTIVE_WINDOW"])
        .output()
        .map_err(|e| xprop_spawn_error_message(&e))?;

    if !active_window_output.status.success() {
        return Err("Failed to get active X11 window".to_string());
    }

    let active_window_stdout = String::from_utf8_lossy(&active_window_output.stdout);
    let window_id = parse_xprop_active_window(&active_window_stdout)
        .ok_or_else(|| "Failed to parse active X11 window".to_string())?;

    let pid_output = Command::new("xprop")
        .args(["-id", &window_id, "_NET_WM_PID"])
        .output()
        .map_err(|e| xprop_spawn_error_message(&e))?;

    if !pid_output.status.success() {
        return Err("Failed to get active X11 window PID".to_string());
    }

    let pid_stdout = String::from_utf8_lossy(&pid_output.stdout);
    let pid = parse_xprop_window_pid(&pid_stdout)
        .ok_or_else(|| "Failed to parse active X11 window PID".to_string())?;

    let exe_path = std::fs::read_link(format!("/proc/{pid}/exe"))
        .map_err(|e| format!("Failed to read process executable path: {e}"))?;
    let exe_path = exe_path.to_string_lossy().into_owned();

    Ok(ProcessInfo::from_path(exe_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_xprop_active_window_reads_window_id() {
        assert_eq!(
            parse_xprop_active_window("_NET_ACTIVE_WINDOW(WINDOW): window id # 0x4a00007"),
            Some("0x4a00007".to_string())
        );
        assert_eq!(
            parse_xprop_active_window("_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"),
            None
        );
    }

    #[test]
    fn parse_xprop_window_pid_reads_positive_pid() {
        assert_eq!(
            parse_xprop_window_pid("_NET_WM_PID(CARDINAL) = 12345"),
            Some(12345)
        );
        assert_eq!(parse_xprop_window_pid("_NET_WM_PID(CARDINAL) = 0"), None);
    }

    #[test]
    fn linux_x11_unavailable_reason_allows_non_empty_display() {
        assert_eq!(
            linux_x11_unavailable_reason(Some(":0"), Some("wayland")),
            None
        );
    }

    #[test]
    fn linux_x11_unavailable_reason_distinguishes_wayland_without_display() {
        assert_eq!(
            linux_x11_unavailable_reason(None, Some("wayland")),
            Some("Wayland source app detection requires XWayland DISPLAY".to_string())
        );
    }

    #[test]
    fn xprop_spawn_error_message_explains_missing_binary() {
        let error = std::io::Error::new(std::io::ErrorKind::NotFound, "xprop");
        assert_eq!(
            xprop_spawn_error_message(&error),
            "xprop is required for X11 source app detection"
        );
    }
}
