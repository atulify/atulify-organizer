mod commands;
mod models;
mod storage;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn toggle_window_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create the global shortcut for Cmd+Shift+B
    let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyB);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, key, event| {
                    if key == &shortcut && event.state == ShortcutState::Pressed {
                        toggle_window_visibility(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is launched, show the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Ensure data directories exist
            if let Err(e) = storage::ensure_directories() {
                eprintln!("Failed to create data directories: {}", e);
            }

            // Create daily backup on startup
            if let Err(e) = storage::create_backup() {
                eprintln!("Failed to create backup: {}", e);
            }

            // Hide from dock on macOS
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // Register the global shortcut
            let shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyB);
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Failed to register global shortcut: {}", e);
            }

            // Setup macOS sleep/wake notifications
            #[cfg(target_os = "macos")]
            {
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    setup_sleep_wake_listener(app_handle);
                });
            }

            // Create tray menu
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window_visibility(tray.app_handle());
                    }
                })
                .build(app)?;

            // Show window on first launch
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide window instead of closing (close to tray)
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_all_data,
            commands::save_all_data,
            commands::create_backup,
            commands::get_backups,
            commands::restore_backup,
            commands::save_image,
            commands::delete_image,
            commands::get_app_data_path,
            commands::run_code_review,
            commands::fetch_pr_info,
            commands::fetch_issue_info,
            commands::fetch_high_priority_prs,
            commands::fetch_medium_priority_prs,
            commands::fetch_low_priority_prs,
            commands::fetch_my_approved_prs,
            commands::fetch_my_changes_requested_prs,
            commands::fetch_my_needs_review_prs,
            commands::fetch_github_stats,
            commands::invalidate_pr_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Sets up a listener for macOS sleep/wake events using IOKit.
///
/// Note: This function intentionally runs forever via CFRunLoopRun().
/// The CallbackContext allocation lives for the app's entire lifetime,
/// which is by design (not a memory leak). The OS cleans up on app exit.
#[cfg(target_os = "macos")]
fn setup_sleep_wake_listener(app_handle: tauri::AppHandle) {
    use std::ffi::c_void;
    use std::ptr;

    // IOKit FFI bindings
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IORegisterForSystemPower(
            refcon: *mut c_void,
            the_port_ref: *mut *mut c_void,
            callback: extern "C" fn(*mut c_void, u32, u32, *mut c_void),
            notifier: *mut *mut c_void,
        ) -> u32;

        fn IONotificationPortGetRunLoopSource(notify_port: *mut c_void) -> *mut c_void;

        fn IODeregisterForSystemPower(notifier: *mut *mut c_void) -> u32;

        fn IOServiceClose(connect: u32) -> u32;

        fn IOAllowPowerChange(root_port: u32, notification_id: isize) -> u32;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
    }

    // Power event types
    const K_IO_MESSAGE_SYSTEM_WILL_SLEEP: u32 = 0xe0000280;
    const K_IO_MESSAGE_SYSTEM_HAS_POWERED_ON: u32 = 0xe0000300;
    const K_IO_MESSAGE_CAN_SYSTEM_SLEEP: u32 = 0xe0000270;

    // Callback context to pass app handle
    struct CallbackContext {
        app_handle: tauri::AppHandle,
        root_port: u32,
    }

    extern "C" fn power_callback(
        refcon: *mut c_void,
        _service: u32,
        message_type: u32,
        message_argument: *mut c_void,
    ) {
        let ctx = unsafe { &*(refcon as *const CallbackContext) };

        match message_type {
            K_IO_MESSAGE_SYSTEM_HAS_POWERED_ON => {
                // System woke from sleep - emit event to frontend
                let _ = ctx.app_handle.emit("system-wake", ());
            }
            K_IO_MESSAGE_SYSTEM_WILL_SLEEP => {
                // Allow the sleep to proceed
                unsafe {
                    IOAllowPowerChange(ctx.root_port, message_argument as isize);
                }
            }
            K_IO_MESSAGE_CAN_SYSTEM_SLEEP => {
                // Allow the sleep to proceed
                unsafe {
                    IOAllowPowerChange(ctx.root_port, message_argument as isize);
                }
            }
            _ => {}
        }
    }

    // Box the context so it lives for the lifetime of the callback
    let ctx = Box::new(CallbackContext {
        app_handle,
        root_port: 0,
    });
    let ctx_ptr = Box::into_raw(ctx);

    let mut notify_port_ref: *mut c_void = ptr::null_mut();
    let mut notifier_object: *mut c_void = ptr::null_mut();

    unsafe {
        // Register for system power notifications
        let root_port = IORegisterForSystemPower(
            ctx_ptr as *mut c_void,
            &mut notify_port_ref,
            power_callback,
            &mut notifier_object,
        );

        if root_port == 0 {
            eprintln!("Failed to register for system power notifications");
            let _ = Box::from_raw(ctx_ptr);
            return;
        }

        // Update the root_port in context
        (*ctx_ptr).root_port = root_port;

        // Add the notification port to the run loop
        let run_loop_source = IONotificationPortGetRunLoopSource(notify_port_ref);
        let run_loop = CFRunLoopGetCurrent();

        // Get the default mode string
        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            static kCFRunLoopDefaultMode: *const c_void;
        }

        CFRunLoopAddSource(run_loop, run_loop_source, kCFRunLoopDefaultMode);

        // Run the run loop - this will block and handle power events
        CFRunLoopRun();

        // Cleanup (this code is only reached if the run loop is stopped)
        IODeregisterForSystemPower(&mut notifier_object);
        IOServiceClose(root_port);
        let _ = Box::from_raw(ctx_ptr);
    }
}
