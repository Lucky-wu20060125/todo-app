use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub const MIN_PET_WIDTH: u32 = 120;
pub const MAX_PET_WIDTH: u32 = 480;

pub const COLOR_WHITE: &str = "white";
pub const COLOR_YELLOW: &str = "yellow";
pub const COLOR_GREEN: &str = "green";
pub const COLOR_RED: &str = "red";

fn default_pet_width() -> u32 {
    220
}

fn default_pet_color() -> String {
    COLOR_WHITE.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "default_pet_width")]
    pub pet_width: u32,
    #[serde(default = "default_pet_color")]
    pub pet_color: String,
    pub pet_x: Option<i32>,
    pub pet_y: Option<i32>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            pet_width: default_pet_width(),
            pet_color: default_pet_color(),
            pet_x: None,
            pet_y: None,
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(directory) = std::env::var_os("TODO_DATA_DIR") {
        return Some(PathBuf::from(directory).join("settings.json"));
    }
    app.path()
        .app_data_dir()
        .ok()
        .map(|directory| directory.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    let Some(path) = path(app) else {
        return Settings::default();
    };
    std::fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) {
    let Some(path) = path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(contents) = serde_json::to_string(settings) {
        let _ = std::fs::write(path, contents);
    }
}

pub fn custom_pet_logical_size(width: u32) -> Option<(f64, f64)> {
    if !(MIN_PET_WIDTH..=MAX_PET_WIDTH).contains(&width) {
        return None;
    }
    let width = width as f64;
    Some((width, width * 1.25))
}

pub fn is_valid_color(color: &str) -> bool {
    matches!(
        color,
        COLOR_WHITE | COLOR_YELLOW | COLOR_GREEN | COLOR_RED
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn custom_width_scales_the_window_and_reserves_bubble_space() {
        assert_eq!(custom_pet_logical_size(120), Some((120.0, 150.0)));
        assert_eq!(custom_pet_logical_size(220), Some((220.0, 275.0)));
        assert_eq!(custom_pet_logical_size(480), Some((480.0, 600.0)));
    }

    #[test]
    fn custom_width_rejects_values_outside_the_usable_range() {
        assert_eq!(custom_pet_logical_size(119), None);
        assert_eq!(custom_pet_logical_size(481), None);
    }

    #[test]
    fn legacy_settings_keep_color_and_position_with_the_default_custom_width() {
        let settings: Settings = serde_json::from_str(
            r#"{"pet_size":"large","pet_color":"yellow","pet_x":12,"pet_y":34}"#,
        )
        .unwrap();

        assert_eq!(settings.pet_width, 220);
        assert_eq!(settings.pet_color, "yellow");
        assert_eq!(settings.pet_x, Some(12));
        assert_eq!(settings.pet_y, Some(34));
    }
}
