use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Local folder linked to the project (optional, user-picked).
    #[serde(default)]
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewProject {
    pub name: String,
    pub description: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub memory_type: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub tags: Vec<Tag>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMemory {
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    pub memory_type: Option<String>,
    pub priority: Option<String>,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemory {
    pub title: Option<String>,
    pub content: Option<String>,
    /// None = keep, Some(None) = detach, Some(Some(id)) = assign.
    pub project_id: Option<Option<String>>,
    pub memory_type: Option<String>,
    pub priority: Option<String>,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub priority: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewRule {
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    pub priority: Option<String>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub icon: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSkill {
    pub name: String,
    pub description: Option<String>,
    pub content: Option<String>,
    pub category: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalInfo {
    pub id: String,
    pub key: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPersonalInfo {
    pub key: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub source_id: String,
    pub source_type: String,
    pub target_id: String,
    pub target_type: String,
    #[serde(default)]
    pub relationship: String,
    #[serde(default)]
    pub weight: f64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewConnection {
    pub source_id: String,
    pub source_type: String,
    pub target_id: String,
    pub target_type: String,
    pub relationship: Option<String>,
    pub weight: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub projects: i64,
    pub memories: i64,
    pub rules: i64,
    pub skills: i64,
    pub connections: i64,
    pub personal: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub entity_type: String,
    pub entity_id: String,
    pub title: String,
    pub snippet: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub priority: Option<String>,
    pub score: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub project_id: Option<String>,
    pub priority: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub relationship: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub truncated: bool,
    pub counts: std::collections::HashMap<String, i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project: Option<Project>,
    pub rules: Vec<Rule>,
    pub memories: Vec<Memory>,
    pub skills: Vec<Skill>,
    pub personal: Vec<PersonalInfo>,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paged<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub project: String,
    pub memories: i64,
    pub rules: i64,
}

pub fn now_ts() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Priority rank: lower = more important (critical always included first).
pub fn priority_rank(p: &str) -> i64 {
    match p {
        "critical" => 0,
        "high" => 1,
        "normal" => 2,
        "low" => 3,
        _ => 2,
    }
}

pub fn normalize_priority(p: Option<String>) -> String {
    match p.as_deref() {
        Some("critical") | Some("high") | Some("normal") | Some("low") => p.unwrap(),
        _ => "normal".to_string(),
    }
}
