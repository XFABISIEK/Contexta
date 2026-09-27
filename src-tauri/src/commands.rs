use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::models::{
    Connection as ConnectionModel, DashboardStats, GraphData, ImportResult, Memory,
    NewConnection, NewMemory, NewPersonalInfo, NewProject, NewRule, NewSkill, Paged,
    PersonalInfo, Project, ProjectContext, Rule, SearchResult, Skill, Tag, UpdateMemory,
};
use crate::{db_path, default_db_path, storage, AppState};

fn lock<'a>(state: &'a State<'_, AppState>) -> std::sync::MutexGuard<'a, rusqlite::Connection> {
    state.conn.lock().expect("database lock poisoned")
}

#[derive(Debug, Clone, Serialize)]
pub struct DbInfo {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageSetup {
    pub configured: bool,
    pub default_path: String,
}

#[tauri::command]
pub fn get_storage_setup(app: tauri::AppHandle) -> Result<StorageSetup, String> {
    let default = default_db_path(&app);
    Ok(StorageSetup {
        configured: storage::configured_path(&default)?.is_some(),
        default_path: default.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn complete_storage_setup(app: tauri::AppHandle, state: State<'_, AppState>, directory: Option<String>) -> Result<String, String> {
    let path = storage::finish_setup(&mut lock(&state), &default_db_path(&app), directory.as_deref().map(std::path::Path::new))?;
    Ok(path.to_string_lossy().into_owned())
}

// ---------- dashboard ----------

#[tauri::command]
pub fn get_dashboard_stats(state: State<'_, AppState>) -> Result<DashboardStats, String> {
    crate::repos::stats(&lock(&state)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activity_stats(state: State<'_, AppState>, days: Option<i64>) -> Result<Vec<crate::models::ActivityDay>, String> {
    crate::repos::activity(&lock(&state), days.unwrap_or(365)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_db_info(app: tauri::AppHandle) -> Result<DbInfo, String> {
    let path = db_path(&app)?;
    let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(DbInfo { path: path.to_string_lossy().to_string(), size_bytes: size })
}

// ---------- projects ----------

#[tauri::command]
pub fn list_projects(
    state: State<'_, AppState>,
    query: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<Project>, String> {
    crate::repos::list_projects(&lock(&state), query, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_project(state: State<'_, AppState>, input: NewProject) -> Result<Project, String> {
    crate::repos::create_project(&lock(&state), input)
}

#[tauri::command]
pub fn update_project(state: State<'_, AppState>, id: String, input: NewProject) -> Result<Project, String> {
    crate::repos::update_project(&lock(&state), &id, input)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_project(&lock(&state), &id)
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, id: String) -> Result<Option<Project>, String> {
    crate::repos::get_project(&lock(&state), &id).map_err(|e| e.to_string())
}

// ---------- memories ----------

#[tauri::command]
pub fn list_memories(
    state: State<'_, AppState>,
    project_id: Option<String>,
    memory_type: Option<String>,
    priority: Option<String>,
    query: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<Memory>, String> {
    crate::repos::list_memories(&lock(&state), project_id, memory_type, priority, query, limit, offset)
}

#[tauri::command]
pub fn get_memory(state: State<'_, AppState>, id: String) -> Result<Option<Memory>, String> {
    crate::repos::get_memory(&lock(&state), &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_memory(state: State<'_, AppState>, input: NewMemory) -> Result<Memory, String> {
    crate::repos::create_memory(&lock(&state), input)
}

#[tauri::command]
pub fn update_memory(state: State<'_, AppState>, id: String, input: UpdateMemory) -> Result<Memory, String> {
    crate::repos::update_memory(&lock(&state), &id, input)
}

#[tauri::command]
pub fn delete_memory(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_memory(&lock(&state), &id)
}

// ---------- rules ----------

#[tauri::command]
pub fn list_rules(
    state: State<'_, AppState>,
    project_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<Rule>, String> {
    crate::repos::list_rules(&lock(&state), project_id, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_rule(state: State<'_, AppState>, input: NewRule) -> Result<Rule, String> {
    crate::repos::create_rule(&lock(&state), input)
}

#[tauri::command]
pub fn update_rule(state: State<'_, AppState>, id: String, input: NewRule) -> Result<Rule, String> {
    crate::repos::update_rule(&lock(&state), &id, input)
}

#[tauri::command]
pub fn delete_rule(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_rule(&lock(&state), &id)
}

// ---------- skills ----------

#[tauri::command]
pub fn list_skills(
    state: State<'_, AppState>,
    query: Option<String>,
    category: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<Skill>, String> {
    crate::repos::list_skills(&lock(&state), query, category, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_skill(state: State<'_, AppState>, input: NewSkill) -> Result<Skill, String> {
    crate::repos::create_skill(&lock(&state), input)
}

#[tauri::command]
pub fn update_skill(state: State<'_, AppState>, id: String, input: NewSkill) -> Result<Skill, String> {
    crate::repos::update_skill(&lock(&state), &id, input)
}

#[tauri::command]
pub fn delete_skill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_skill(&lock(&state), &id)
}

// ---------- personal ----------

#[tauri::command]
pub fn list_skill_categories(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    crate::repos::skill_categories(&lock(&state)).map_err(|e| e.to_string())
}

// ---------- personal ----------

#[tauri::command]
pub fn list_personal(state: State<'_, AppState>) -> Result<Vec<PersonalInfo>, String> {
    crate::repos::list_personal(&lock(&state)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_personal(state: State<'_, AppState>, input: NewPersonalInfo) -> Result<PersonalInfo, String> {
    crate::repos::create_personal(&lock(&state), input)
}

#[tauri::command]
pub fn update_personal(state: State<'_, AppState>, id: String, input: NewPersonalInfo) -> Result<PersonalInfo, String> {
    crate::repos::update_personal(&lock(&state), &id, input)
}

#[tauri::command]
pub fn delete_personal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_personal(&lock(&state), &id)
}

// ---------- tags & connections ----------

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> Result<Vec<Tag>, String> {
    crate::repos::list_tags(&lock(&state)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_connections(
    state: State<'_, AppState>,
    entity_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<ConnectionModel>, String> {
    crate::repos::list_connections(&lock(&state), entity_id, limit, offset).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_connection(state: State<'_, AppState>, input: NewConnection) -> Result<ConnectionModel, String> {
    crate::repos::create_connection(&lock(&state), input)
}

#[tauri::command]
pub fn delete_connection(state: State<'_, AppState>, id: String) -> Result<(), String> {
    crate::repos::delete_connection(&lock(&state), &id)
}

// ---------- search / graph / context ----------

#[tauri::command]
pub fn search_everything(
    state: State<'_, AppState>,
    query: String,
    entity_types: Option<Vec<String>>,
    project_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<SearchResult>, String> {
    let params = crate::search::SearchParams {
        query,
        entity_types,
        project_id,
        limit: limit.unwrap_or(30).clamp(1, 100),
        offset: offset.unwrap_or(0).max(0),
    };
    // Vector hits merge here once an embedding backend exists (see VectorHit).
    let (results, total) = crate::search::search_hybrid(&lock(&state), &params, &[]).map_err(|e| e.to_string())?;
    Ok(Paged { items: results, total, limit: params.limit, offset: params.offset })
}

#[tauri::command]
pub fn get_graph(
    state: State<'_, AppState>,
    entity_types: Option<Vec<String>>,
    project_id: Option<String>,
    limit: Option<i64>,
) -> Result<GraphData, String> {
    let f = crate::graph::GraphFilter {
        entity_types,
        project_id,
        limit: limit.unwrap_or(300),
    };
    crate::graph::get_graph(&lock(&state), &f).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project_context(
    state: State<'_, AppState>,
    project: String,
    query: String,
    max_results: Option<i64>,
    max_tokens: Option<i64>,
) -> Result<ProjectContext, String> {
    let opts = crate::context::ContextOptions {
        project,
        query,
        max_results: max_results.unwrap_or(10),
        max_tokens: max_tokens.unwrap_or(4000),
    };
    crate::context::build_project_context(&lock(&state), &opts).map_err(|e| e.to_string())
}

// ---------- settings / maintenance ----------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    crate::repos::get_settings(&lock(&state)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    crate::repos::set_setting(&lock(&state), &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_database(state: State<'_, AppState>) -> Result<String, String> {
    crate::repos::export_all(&lock(&state))
}

#[tauri::command]
pub fn export_project(state: State<'_, AppState>, id: String) -> Result<String, String> {
    crate::repos::export_project(&lock(&state), &id)
}

#[tauri::command]
pub fn import_project(state: State<'_, AppState>, json: String) -> Result<ImportResult, String> {
    crate::repos::import_project(&lock(&state), &json)
}

#[tauri::command]
pub fn backup_database(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<String, String> {
    let dir = crate::backup_dir(&app)?;
    let name = format!("simplememory-{}.db", chrono::Utc::now().format("%Y%m%d-%H%M%S"));
    let dest: PathBuf = dir.join(name);
    crate::repos::backup_db(&lock(&state), &dest)?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn seed_dev_data(state: State<'_, AppState>) -> Result<String, String> {
    let mut conn = state.conn.lock().expect("database lock poisoned");
    crate::db::seed_dev_data(&mut conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_project_files(state: State<'_, AppState>, project_id: String) -> Result<crate::models::ScanResult, String> {
    crate::repos::scan_project_files(&lock(&state), &project_id)
}
