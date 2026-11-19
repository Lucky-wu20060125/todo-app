use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Window};

#[derive(Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|directory| directory.join("window.json"))
}

pub fn restore(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(path) = state_path(app) else {
        return;
    };
    let Ok(contents) = std::fs::read_to_string(path) else {
        return;
    };
    let Ok(state) = serde_json::from_str::<WindowState>(&contents) else {
        return;
    };

    let _ = window.set_size(PhysicalSize::new(state.width.max(720), state.height.max(540)));
    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_position.x + monitor_size.width as i32 - state.width as i32;
        let max_y = monitor_position.y + monitor_size.height as i32 - state.height as i32;
        let x = state.x.clamp(monitor_position.x, max_x.max(monitor_position.x));
        let y = state.y.clamp(monitor_position.y, max_y.max(monitor_position.y));
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

pub fn save(window: &Window) {
    let Some(path) = state_path(window.app_handle()) else {
        return;
    };
    let (Ok(size), Ok(position)) = (window.inner_size(), window.outer_position()) else {
        return;
    };
    let state = WindowState {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
    };
    if let Ok(contents) = serde_json::to_string(&state) {
        let _ = std::fs::write(path, contents);
    }
}
