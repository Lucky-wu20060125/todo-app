pub mod db;
mod pet;
mod settings;

use std::sync::Mutex;
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

#[tauri::command]
fn list_todos(database: State<'_, db::Database>) -> Result<Vec<db::Todo>, String> {
    database.list()
}

#[tauri::command]
fn create_todo(database: State<'_, db::Database>, title: String) -> Result<db::Todo, String> {
    database.create(&title)
}

#[tauri::command]
fn update_todo(
    database: State<'_, db::Database>,
    id: i64,
    patch: db::TodoPatch,
) -> Result<db::Todo, String> {
    database.update(id, patch)
}

#[tauri::command]
fn delete_todo(database: State<'_, db::Database>, id: i64) -> Result<(), String> {
    database.delete(id)
}

#[tauri::command]
fn delete_completed_todos(database: State<'_, db::Database>) -> Result<usize, String> {
    database.delete_completed()
}

#[tauri::command]
fn reorder_todos(database: State<'_, db::Database>, ids: Vec<i64>) -> Result<Vec<db::Todo>, String> {
    database.reorder(&ids)
}

#[tauri::command]
fn open_main(app: AppHandle) -> Result<(), String> {
    pet::open_main(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn close_main(app: AppHandle) {
    pet::close_main(&app);
}

#[tauri::command]
fn snap_pet(app: AppHandle, window: WebviewWindow) -> Result<pet::PetMode, String> {
    pet::snap(&app, &window).map_err(|error| error.to_string())
}

#[tauri::command]
fn expand_pet(app: AppHandle, window: WebviewWindow) -> Result<pet::PetMode, String> {
    pet::expand(&app, &window).map_err(|error| error.to_string())
}

#[tauri::command]
fn show_pet_menu(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    pet::show_menu(&app, &window).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_pet_preferences(app: AppHandle) -> pet::PetPreferences {
    pet::preferences(&app)
}

#[tauri::command]
fn set_pet_size(app: AppHandle, width: u32) -> Result<(), String> {
    pet::set_size(&app, width)
}

#[tauri::command]
fn pet_cursor_direction(app: AppHandle) -> Result<pet::CursorDirection, String> {
    pet::cursor_direction(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().app_name("小鬼清单").build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(main) = app.get_webview_window("main") {
                if main.is_visible().unwrap_or(false) {
                    let _ = main.show();
                    let _ = main.unminimize();
                    let _ = main.set_focus();
                    return;
                }
            }
            pet::show_pet(app);
        }))
        .setup(|app| {
            let settings = settings::load(app.handle());
            app.manage(settings::SettingsState(Mutex::new(settings)));
            app.manage(pet::PetRuntime(Mutex::new(pet::PetState::default())));

            let data_directory = match std::env::var_os("TODO_DATA_DIR") {
                Some(directory) => std::path::PathBuf::from(directory),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&data_directory)?;
            let database = db::Database::open(&data_directory.join("todo.db"))?;
            app.manage(database);

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("小鬼清单")
                .inner_size(820.0, 780.0)
                .min_inner_size(288.0, 300.0)
                .resizable(true)
                .decorations(false)
                .transparent(true)
                .shadow(true)
                .visible(false)
                .center()
                .build()?;

            WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html".into()))
                .title("待办小幽灵")
                .inner_size(220.0, 260.0)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .visible(true)
                .build()?;

            pet::setup(app.handle())?;
            pet::install_menu_handler(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    pet::show_pet(window.app_handle());
                } else if window.label() == "pet" {
                    api.prevent_close();
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_todos,
            create_todo,
            update_todo,
            delete_todo,
            delete_completed_todos,
            reorder_todos,
            open_main,
            close_main,
            snap_pet,
            expand_pet,
            show_pet_menu,
            get_pet_preferences,
            set_pet_size,
            pet_cursor_direction
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
