use super::ProcessInfo;

#[link(name = "AppKit", kind = "framework")]
extern "C" {}

type ObjcId = *mut objc::runtime::Object;

struct AutoreleasePool(ObjcId);

impl AutoreleasePool {
    fn new() -> Self {
        use objc::{class, msg_send, sel, sel_impl};

        Self(unsafe { msg_send![class!(NSAutoreleasePool), new] })
    }
}

impl Drop for AutoreleasePool {
    fn drop(&mut self) {
        use objc::{msg_send, sel, sel_impl};

        if !self.0.is_null() {
            unsafe {
                let _: () = msg_send![self.0, drain];
            }
        }
    }
}

fn ns_string_to_string(value: ObjcId) -> Option<String> {
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::CStr;
    use std::os::raw::c_char;

    if value.is_null() {
        return None;
    }

    let c_string: *const c_char = unsafe { msg_send![value, UTF8String] };
    if c_string.is_null() {
        return None;
    }

    Some(
        unsafe { CStr::from_ptr(c_string) }
            .to_string_lossy()
            .into_owned(),
    )
}

fn ns_url_path(value: ObjcId) -> Option<String> {
    use objc::{msg_send, sel, sel_impl};

    if value.is_null() {
        return None;
    }

    let path: ObjcId = unsafe { msg_send![value, path] };
    ns_string_to_string(path)
}

fn frontmost_application() -> ObjcId {
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};

    let workspace: *mut Object = unsafe { msg_send![class!(NSWorkspace), sharedWorkspace] };
    unsafe { msg_send![workspace, frontmostApplication] }
}

pub(super) fn infer_clipboard_owner_process_info() -> Result<ProcessInfo, String> {
    infer_active_window_process_info()
}

pub(super) fn infer_active_window_process_info() -> Result<ProcessInfo, String> {
    use objc::{msg_send, sel, sel_impl};

    let _pool = AutoreleasePool::new();
    let app = frontmost_application();

    if app.is_null() {
        return Err("No active application".to_string());
    }

    let bundle_url: ObjcId = unsafe { msg_send![app, bundleURL] };
    let executable_url: ObjcId = unsafe { msg_send![app, executableURL] };
    let localized_name: ObjcId = unsafe { msg_send![app, localizedName] };

    let path = ns_url_path(bundle_url)
        .or_else(|| ns_url_path(executable_url))
        .ok_or_else(|| "Failed to get active application path".to_string())?;
    let app_name = ns_string_to_string(localized_name);

    let info = if let Some(name) = app_name.filter(|name| !name.trim().is_empty()) {
        ProcessInfo { name, path }
    } else {
        ProcessInfo::from_path(path)
    };

    Ok(info)
}
