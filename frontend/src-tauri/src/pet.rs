use crate::settings::{self, SettingsState};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, Submenu},
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;

const COLLAPSED_WIDTH: f64 = 100.0;
const COLLAPSED_HEIGHT: f64 = 130.0;
const EDGE_THRESHOLD: f64 = 24.0;

#[derive(Default)]
pub struct PetState {
    pub collapsed: bool,
    pub side: Option<String>,
    pub notebook_size: Option<PhysicalSize<u32>>,
    pub notebook_position: Option<PhysicalPosition<i32>>,
}

pub struct PetRuntime(pub Mutex<PetState>);

#[derive(Serialize, Clone)]
pub struct PetMode {
    pub mode: String,
    pub side: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct PetPreferences {
    pub color: String,
    pub width: u32,
}

pub fn preferences(app: &AppHandle) -> PetPreferences {
    let state = app.state::<SettingsState>();
    let settings = state.0.lock().unwrap();
    PetPreferences {
        color: settings.pet_color.clone(),
        width: settings.pet_width,
    }
}

impl PetMode {
    fn notebook() -> Self {
        Self {
            mode: "notebook".into(),
            side: None,
        }
    }

    fn edge(side: &str) -> Self {
        Self {
            mode: "edge".into(),
            side: Some(side.into()),
        }
    }
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let Some(pet) = app.get_webview_window("pet") else {
        return Ok(());
    };
    let settings = app.state::<SettingsState>().0.lock().unwrap().clone();

    let (width, height) = settings::custom_pet_logical_size(settings.pet_width)
        .unwrap_or((220.0, 275.0));
    pet.set_size(LogicalSize::new(width, height))?;

    if let (Some(x), Some(y)) = (settings.pet_x, settings.pet_y) {
        let _ = pet.set_position(PhysicalPosition::new(x, y));
    } else if let Ok(Some(monitor)) = pet.primary_monitor() {
        let scale = pet.scale_factor()?;
        let physical_width = (width * scale).round() as i32;
        let physical_height = (height * scale).round() as i32;
        let position = monitor.position();
        let size = monitor.size();
        let margin = (48.0 * scale).round() as i32;
        let x = position.x + size.width as i32 - physical_width - margin;
        let y = position.y + size.height as i32 - physical_height - margin;
        let _ = pet.set_position(PhysicalPosition::new(x.max(position.x), y.max(position.y)));
    }

    Ok(())
}

pub fn show_pet(app: &AppHandle) {
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = expand(app, &pet);
        let _ = pet.show();
        let _ = pet.unminimize();
        let _ = pet.set_focus();
        let _ = pet.emit("pet-mode", PetMode::notebook());
    }
}

pub fn open_main(app: &AppHandle) -> tauri::Result<()> {
    if let Some(main) = app.get_webview_window("main") {
        main.show()?;
        main.unminimize()?;
        main.set_focus()?;
    }
    if let Some(pet) = app.get_webview_window("pet") {
        pet.hide()?;
    }
    Ok(())
}

pub fn close_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    show_pet(app);
}

pub fn snap(app: &AppHandle, pet: &WebviewWindow) -> tauri::Result<PetMode> {
    {
        let state = app.state::<PetRuntime>();
        let runtime = state.0.lock().unwrap();
        if runtime.collapsed {
            let side = runtime.side.clone().unwrap_or_else(|| "right".into());
            let mode = PetMode::edge(&side);
            let _ = pet.emit("pet-mode", mode.clone());
            return Ok(mode);
        }
    }

    let position = pet.outer_position()?;
    let size = pet.outer_size()?;
    let monitor = pet
        .current_monitor()?
        .or(pet.primary_monitor()?);
    let Some(monitor) = monitor else {
        save_notebook_position(app, position);
        let mode = PetMode::notebook();
        let _ = pet.emit("pet-mode", mode.clone());
        return Ok(mode);
    };

    let scale = pet.scale_factor()?;
    let threshold = (EDGE_THRESHOLD * scale) as i32;
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let left_edge = monitor_position.x;
    let right_edge = monitor_position.x + monitor_size.width as i32;

    let side = if position.x <= left_edge + threshold {
        Some("left")
    } else if position.x + size.width as i32 >= right_edge - threshold {
        Some("right")
    } else {
        None
    };

    let Some(side) = side else {
        save_notebook_position(app, position);
        let mode = PetMode::notebook();
        let _ = pet.emit("pet-mode", mode.clone());
        return Ok(mode);
    };

    {
        let state = app.state::<PetRuntime>();
        let mut runtime = state.0.lock().unwrap();
        runtime.notebook_size = Some(size);
        runtime.notebook_position = Some(position);
        runtime.collapsed = true;
        runtime.side = Some(side.to_string());
    }
    save_notebook_position(app, position);

    let collapsed_width = (COLLAPSED_WIDTH * scale).round() as u32;
    let collapsed_height = (COLLAPSED_HEIGHT * scale).round() as u32;
    let x = if side == "left" {
        monitor_position.x
    } else {
        right_edge - collapsed_width as i32
    };
    let centered_y = position.y + size.height as i32 / 2 - collapsed_height as i32 / 2;
    let max_y = monitor_position.y + monitor_size.height as i32 - collapsed_height as i32;
    let y = centered_y.clamp(monitor_position.y, max_y.max(monitor_position.y));

    pet.set_size(PhysicalSize::new(collapsed_width, collapsed_height))?;
    pet.set_position(PhysicalPosition::new(x, y))?;

    let mode = PetMode::edge(side);
    let _ = pet.emit("pet-mode", mode.clone());
    Ok(mode)
}

pub fn expand(app: &AppHandle, pet: &WebviewWindow) -> tauri::Result<PetMode> {
    let (notebook_size, notebook_position) = {
        let state = app.state::<PetRuntime>();
        let mut runtime = state.0.lock().unwrap();
        if !runtime.collapsed {
            return Ok(PetMode::notebook());
        }
        let size = runtime.notebook_size;
        let position = runtime.notebook_position;
        runtime.collapsed = false;
        runtime.side = None;
        (size, position)
    };

    if let Some(size) = notebook_size {
        pet.set_size(size)?;
    }
    if let Some(position) = notebook_position {
        pet.set_position(position)?;
    } else {
        let settings = app.state::<SettingsState>().0.lock().unwrap().clone();
        let (width, height) = settings::custom_pet_logical_size(settings.pet_width)
            .unwrap_or((220.0, 275.0));
        pet.set_size(LogicalSize::new(width, height))?;
    }

    let mode = PetMode::notebook();
    let _ = pet.emit("pet-mode", mode.clone());
    Ok(mode)
}

#[derive(Serialize, Clone)]
pub struct CursorDirection {
    pub x: f64,
    pub y: f64,
}

pub fn cursor_direction(app: &AppHandle) -> Result<CursorDirection, String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "小幽灵窗口不存在".to_string())?;
    let cursor = pet.cursor_position().map_err(|error| error.to_string())?;
    let position = pet.outer_position().map_err(|error| error.to_string())?;
    let size = pet.outer_size().map_err(|error| error.to_string())?;
    let center_x = position.x as f64 + size.width as f64 / 2.0;
    let center_y = position.y as f64 + size.height as f64 / 2.0;

    Ok(CursorDirection {
        x: ((cursor.x - center_x) / (size.width as f64 / 2.0)).clamp(-1.0, 1.0),
        y: ((cursor.y - center_y) / (size.height as f64 / 2.0)).clamp(-1.0, 1.0),
    })
}

pub fn show_menu(app: &AppHandle, pet: &WebviewWindow) -> tauri::Result<()> {
    let state = app.state::<SettingsState>();
    let pet_color = state.0.lock().unwrap().pet_color.clone();
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);

    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "开机自启动",
        true,
        autostart_enabled,
        None::<&str>,
    )?;
    let custom_size = MenuItem::with_id(
        app,
        "size:custom",
        "自定义大小…",
        true,
        None::<&str>,
    )?;

    let white = CheckMenuItem::with_id(
        app,
        "color:white",
        "白色",
        true,
        pet_color == settings::COLOR_WHITE,
        None::<&str>,
    )?;
    let yellow = CheckMenuItem::with_id(
        app,
        "color:yellow",
        "淡黄",
        true,
        pet_color == settings::COLOR_YELLOW,
        None::<&str>,
    )?;
    let green = CheckMenuItem::with_id(
        app,
        "color:green",
        "淡绿",
        true,
        pet_color == settings::COLOR_GREEN,
        None::<&str>,
    )?;
    let red = CheckMenuItem::with_id(
        app,
        "color:red",
        "淡红",
        true,
        pet_color == settings::COLOR_RED,
        None::<&str>,
    )?;
    let color_menu =
        Submenu::with_items(app, "小幽灵颜色", true, &[&white, &yellow, &green, &red])?;

    let quit = MenuItem::with_id(app, "quit", "关闭应用", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&autostart, &custom_size, &color_menu, &quit])?;

    pet.popup_menu(&menu)
}

fn set_color(app: &AppHandle, color: &str) {
    if !settings::is_valid_color(color) {
        return;
    }
    let width = {
        let state = app.state::<SettingsState>();
        let mut settings = state.0.lock().unwrap();
        settings.pet_color = color.to_string();
        settings::save(app, &settings);
        settings.pet_width
    };
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.emit(
            "pet-color",
            PetPreferences {
                color: color.to_string(),
                width,
            },
        );
    }
}

pub fn install_menu_handler(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let handle = app.clone();
    pet.on_menu_event(move |_window, event| {
        match event.id().as_ref() {
            "autostart" => {
                let autolaunch = handle.autolaunch();
                if autolaunch.is_enabled().unwrap_or(false) {
                    let _ = autolaunch.disable();
                } else {
                    let _ = autolaunch.enable();
                }
            }
            "size:custom" => {
                let width = handle.state::<SettingsState>().0.lock().unwrap().pet_width;
                if let Some(pet) = handle.get_webview_window("pet") {
                    let _ = expand(&handle, &pet);
                    let _ = pet.emit("pet-size-dialog", width);
                }
            }
            "color:white" => set_color(&handle, settings::COLOR_WHITE),
            "color:yellow" => set_color(&handle, settings::COLOR_YELLOW),
            "color:green" => set_color(&handle, settings::COLOR_GREEN),
            "color:red" => set_color(&handle, settings::COLOR_RED),
            "quit" => handle.exit(0),
            _ => {}
        }
    });
}

pub fn set_size(app: &AppHandle, width: u32) -> Result<(), String> {
    let Some((width, height)) = settings::custom_pet_logical_size(width) else {
        return Err(format!(
            "请输入 {}～{} 之间的整数像素宽度",
            settings::MIN_PET_WIDTH,
            settings::MAX_PET_WIDTH
        ));
    };
    {
        let state = app.state::<SettingsState>();
        let mut settings = state.0.lock().unwrap();
        settings.pet_width = width as u32;
        settings::save(app, &settings);
    }
    if let Some(pet) = app.get_webview_window("pet") {
        let collapsed = app.state::<PetRuntime>().0.lock().unwrap().collapsed;
        if !collapsed {
            let _ = pet.set_size(LogicalSize::new(width, height));
        }
    }
    Ok(())
}

fn save_notebook_position(app: &AppHandle, position: PhysicalPosition<i32>) {
    let state = app.state::<SettingsState>();
    let mut settings = state.0.lock().unwrap();
    settings.pet_x = Some(position.x);
    settings.pet_y = Some(position.y);
    settings::save(app, &settings);
}
