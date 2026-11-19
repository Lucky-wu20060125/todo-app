pub mod db;
mod window_state;

use tauri::{Manager, State, WindowEvent};

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
fn reorder_todos(database: State<'_, db::Database>, ids: Vec<i64>) -> Result<Vec<db::Todo>, String> {
    database.reorder(&ids)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            let database = db::Database::open(&data_directory.join("todo.db"))?;
            app.manage(database);
            window_state::restore(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                window_state::save(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_todos,
            create_todo,
            update_todo,
            delete_todo,
            reorder_todos
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
