mod commands;
mod context;
mod db;
mod graph;
mod models;
mod repos;
mod search;

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

pub struct AppState {
    pub conn: Mutex<rusqlite::Connection>,
}

pub fn db_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("simplememory.db")
}

pub fn backup_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("app data dir unavailable")
        .join("backups")
}

fn io_err(msg: String) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, msg)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = db_path(app.handle());
            let mut conn = db::open_db(&path).map_err(|e| io_err(e.to_string()))?;
            db::run_migrations(&mut conn).map_err(|e| io_err(e.to_string()))?;
            app.manage(AppState { conn: Mutex::new(conn) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard_stats,
            commands::get_db_info,
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::get_project,
            commands::list_memories,
            commands::get_memory,
            commands::create_memory,
            commands::update_memory,
            commands::delete_memory,
            commands::list_rules,
            commands::create_rule,
            commands::update_rule,
            commands::delete_rule,
            commands::list_skills,
            commands::create_skill,
            commands::update_skill,
            commands::delete_skill,
            commands::list_personal,
            commands::create_personal,
            commands::update_personal,
            commands::delete_personal,
            commands::list_tags,
            commands::list_connections,
            commands::create_connection,
            commands::delete_connection,
            commands::search_everything,
            commands::get_graph,
            commands::get_project_context,
            commands::get_settings,
            commands::set_setting,
            commands::export_database,
            commands::export_project,
            commands::import_project,
            commands::backup_database,
            commands::seed_dev_data,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run SimpleMemory");
}
