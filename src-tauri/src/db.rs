use rusqlite::{params, Connection};
use std::path::Path;

use crate::models::{new_id, now_ts};

const MIGRATION_001: &str = r#"
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    memory_type TEXT NOT NULL DEFAULT 'fact',
    priority TEXT NOT NULL DEFAULT 'normal',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'general',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_information (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS memory_tags (
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (memory_id, tag_id)
);
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT 'related',
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    embedding TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_priority ON memories(priority);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_rules_project ON rules(project_id);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(priority);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_connections_source ON connections(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_connections_target ON connections(target_id, target_type);
"#;

const MIGRATION_002: &str = r#"
CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts USING fts5(
    entity_type UNINDEXED,
    entity_id UNINDEXED,
    project_id UNINDEXED,
    title,
    content,
    tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('memory', NEW.id, NEW.project_id, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'memory' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'memory' AND entity_id = OLD.id;
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('memory', NEW.id, NEW.project_id, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS rules_ai AFTER INSERT ON rules BEGIN
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('rule', NEW.id, NEW.project_id, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS rules_ad AFTER DELETE ON rules BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'rule' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS rules_au AFTER UPDATE ON rules BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'rule' AND entity_id = OLD.id;
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('rule', NEW.id, NEW.project_id, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS projects_ai AFTER INSERT ON projects BEGIN
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('project', NEW.id, NEW.id, NEW.name, NEW.description);
END;
CREATE TRIGGER IF NOT EXISTS projects_ad AFTER DELETE ON projects BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'project' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS projects_au AFTER UPDATE ON projects BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'project' AND entity_id = OLD.id;
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('project', NEW.id, NEW.id, NEW.name, NEW.description);
END;
CREATE TRIGGER IF NOT EXISTS skills_ai AFTER INSERT ON skills BEGIN
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('skill', NEW.id, NULL, NEW.name, NEW.description || ' ' || NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS skills_ad AFTER DELETE ON skills BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'skill' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS skills_au AFTER UPDATE ON skills BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'skill' AND entity_id = OLD.id;
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('skill', NEW.id, NULL, NEW.name, NEW.description || ' ' || NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS personal_ai AFTER INSERT ON personal_information BEGIN
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('personal', NEW.id, NULL, NEW.title, NEW.content);
END;
CREATE TRIGGER IF NOT EXISTS personal_ad AFTER DELETE ON personal_information BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'personal' AND entity_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS personal_au AFTER UPDATE ON personal_information BEGIN
    DELETE FROM search_index_fts WHERE entity_type = 'personal' AND entity_id = OLD.id;
    INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    VALUES ('personal', NEW.id, NULL, NEW.title, NEW.content);
END;
INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    SELECT 'memory', id, project_id, title, content FROM memories;
INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    SELECT 'rule', id, project_id, title, content FROM rules;
INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    SELECT 'project', id, id, name, description FROM projects;
INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    SELECT 'skill', id, NULL, name, description || ' ' || content FROM skills;
INSERT INTO search_index_fts(entity_type, entity_id, project_id, title, content)
    SELECT 'personal', id, NULL, title, content FROM personal_information;
"#;

const MIGRATION_003: &str = r#"
CREATE INDEX IF NOT EXISTS idx_memories_project_priority ON memories(project_id, priority);
CREATE INDEX IF NOT EXISTS idx_rules_project_enabled ON rules(project_id, enabled);
CREATE INDEX IF NOT EXISTS idx_connections_types ON connections(source_type, target_type);
CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag_id);
"#;

const MIGRATION_004: &str = "ALTER TABLE skills ADD COLUMN icon TEXT NOT NULL DEFAULT '';";

const MIGRATIONS: [(i64, &str); 4] = [(1, MIGRATION_001), (2, MIGRATION_002), (3, MIGRATION_003), (4, MIGRATION_004)];

pub fn open_db(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(e.to_string()),
            )
        })?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;",
    )?;
    Ok(conn)
}

pub fn run_migrations(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
    )?;
    let applied: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT version FROM _migrations")?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        out
    };
    for (version, sql) in MIGRATIONS {
        if !applied.contains(&version) {
            let tx = conn.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO _migrations (version, applied_at) VALUES (?1, ?2)",
                params![version, now_ts()],
            )?;
            tx.commit()?;
        }
    }
    Ok(())
}

pub fn is_empty(conn: &Connection) -> rusqlite::Result<bool> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
    Ok(n == 0)
}

/// Development seed: two demo projects with rules, memories, skills and links.
/// Only inserts when the database has no projects yet. Returns rows note.
pub fn seed_dev_data(conn: &mut Connection) -> rusqlite::Result<String> {
    if !is_empty(conn)? {
        return Ok("database already contains data, seed skipped".to_string());
    }
    let tx = conn.transaction()?;
    let ts = now_ts();

    let sm_id = new_id();
    let ax_id = new_id();
    tx.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![sm_id, "Contexta", "Local memory layer for AI agents. Tauri 2 + React + Rust + SQLite FTS5.", ts, ts],
    )?;
    tx.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![ax_id, "Axiom", "Demo project used to showcase rules, memories and skills retrieval.", ts, ts],
    )?;

    let rules: Vec<(String, &str, &str, &str)> = vec![
        (ax_id.clone(), "Always use TypeScript strict mode", "All frontend code must compile under strict TypeScript. No implicit any.", "critical"),
        (ax_id.clone(), "Rust logic lives in services", "Database logic must go through service and repository layers, never directly in Tauri commands.", "high"),
        (sm_id.clone(), "Global search uses FTS5", "All global search queries must use the SQLite FTS5 index, never full table scans.", "critical"),
        (ax_id.clone(), "Conventional commits", "Use conventional commit messages for every change.", "low"),
    ];
    for (pid, title, content, prio) in rules {
        tx.execute(
            "INSERT INTO rules (id, project_id, title, content, priority, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
            params![new_id(), pid, title, content, prio, ts, ts],
        )?;
    }

    let memories: Vec<(String, &str, &str, &str, &str, &str)> = vec![
        (ax_id.clone(), "Auth uses JWT with refresh rotation", "Authentication is implemented with short-lived JWT access tokens and rotating refresh tokens stored httpOnly.", "decision", "critical", "manual"),
        (ax_id.clone(), "Postgres chosen over SQLite for Axiom server", "Axiom server component uses Postgres because it needs concurrent writers. Local client cache stays SQLite.", "fact", "high", "manual"),
        (sm_id.clone(), "FTS5 uses porter tokenizer", "The search_index_fts virtual table uses porter + unicode61 tokenizers for stemming.", "fact", "high", "manual"),
        (sm_id.clone(), "Context budget default 4000 tokens", "Project context builder defaults to a 4000 token budget, critical rules always included first.", "fact", "normal", "manual"),
        (ax_id.clone(), "Meeting notes 2026-09-20", "Discussed auth scopes. Agreed: minimal scopes by default, elevate only per endpoint.", "note", "low", "manual"),
    ];
    let mut memory_ids: Vec<(String, String)> = Vec::new();
    for (pid, title, content, mtype, prio, source) in memories {
        let id = new_id();
        tx.execute(
            "INSERT INTO memories (id, project_id, title, content, memory_type, priority, source, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, pid, title, content, mtype, prio, source, ts, ts],
        )?;
        memory_ids.push((id, title.to_string()));
    }

    for tag in ["architecture", "auth", "tauri", "rust", "decision"] {
        tx.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![tag])?;
    }
    if let Some((first_id, _)) = memory_ids.first() {
        for tag in ["auth", "decision", "architecture"] {
            tx.execute(
                "INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) SELECT ?1, id FROM tags WHERE name = ?2",
                params![first_id, tag],
            )?;
        }
    }

    let skills: Vec<(&str, &str, &str, &str)> = vec![
        ("tauri-ipc", "Tauri 2 IPC patterns", "Use invoke() from @tauri-apps/api/core with #[tauri::command] handlers. Keep commands thin, logic in services.", "tauri"),
        ("sqlite-fts", "SQLite FTS5 search", "External-content FTS5 table with triggers. Sanitize MATCH queries, use bm25() for ranking.", "database"),
        ("react-patterns", "React + Zustand patterns", "Co-locate feature state in zustand stores. Debounce search inputs, paginate every list.", "frontend"),
    ];
    let mut skill_ids: Vec<String> = Vec::new();
    for (name, desc, content, cat) in skills {
        let id = new_id();
        tx.execute(
            "INSERT INTO skills (id, name, description, content, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, name, desc, content, cat, ts, ts],
        )?;
        skill_ids.push(id);
    }

    tx.execute(
        "INSERT INTO personal_information (id, key, title, content, created_at, updated_at) VALUES (?1, 'timezone', 'Timezone', 'Europe/Warsaw (CET/CEST).', ?2, ?3)",
        params![new_id(), ts, ts],
    )?;
    tx.execute(
        "INSERT INTO personal_information (id, key, title, content, created_at, updated_at) VALUES (?1, 'editor', 'Preferred editor', 'VS Code with JetBrains Mono, dark theme.', ?2, ?3)",
        params![new_id(), ts, ts],
    )?;

    // Link skills to projects + relate two memories.
    for sid in &skill_ids {
        tx.execute(
            "INSERT INTO connections (id, source_id, source_type, target_id, target_type, relationship, weight, created_at) VALUES (?1, ?2, 'project', ?3, 'skill', 'uses', 1.0, ?4)",
            params![new_id(), sm_id, sid, ts],
        )?;
    }
    if memory_ids.len() >= 2 {
        tx.execute(
            "INSERT INTO connections (id, source_id, source_type, target_id, target_type, relationship, weight, created_at) VALUES (?1, ?2, 'memory', ?3, 'memory', 'related', 0.8, ?4)",
            params![new_id(), memory_ids[0].0, memory_ids[1].0, ts],
        )?;
    }
    tx.commit()?;
    Ok("seed data inserted".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn test_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        run_migrations(&mut conn).unwrap();
        conn
    }

    #[test]
    fn migrations_apply_cleanly_on_empty_db() {
        let conn = test_db();
        let v: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 4);
    }

    #[test]
    fn migrations_are_idempotent() {
        let mut conn = test_db();
        run_migrations(&mut conn).unwrap();
        let v: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 4);
    }

    #[test]
    fn seed_inserts_demo_data_and_skips_when_not_empty() {
        let mut conn = test_db();
        assert_eq!(seed_dev_data(&mut conn).unwrap(), "seed data inserted");
        let second = seed_dev_data(&mut conn).unwrap();
        assert!(second.contains("skipped"));
        let projects: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(projects, 2);
    }

    #[test]
    fn skill_icons_survive_save_and_load() {
        let conn = test_db();
        let icon = "data:image/png;base64,AA==".to_string();
        let skill = crate::repos::create_skill(&conn, crate::models::NewSkill {
            name: "Ponytail".into(), description: None, content: None, category: None, icon: Some(icon.clone()),
        }).unwrap();
        assert_eq!(skill.icon, icon);
        assert_eq!(crate::repos::get_skill(&conn, &skill.id).unwrap().unwrap().icon, icon);
        assert_eq!(crate::repos::list_skills(&conn, None, None, None, None).unwrap().items[0].icon, icon);
        let graph = crate::graph::get_graph(&conn, &crate::graph::GraphFilter { entity_types: None, project_id: None, limit: 300 }).unwrap();
        assert_eq!(graph.nodes.iter().find(|node| node.id == skill.id).unwrap().icon.as_deref(), Some(icon.as_str()));
        assert!(crate::repos::create_skill(&conn, crate::models::NewSkill {
            name: "Invalid".into(), description: None, content: None, category: None, icon: Some("javascript:alert(1)".into()),
        }).is_err());
    }

    #[test]
    fn fts_triggers_keep_index_in_sync() {
        let conn = test_db();
        let id = new_id();
        let ts = now_ts();
        conn.execute(
            "INSERT INTO memories (id, project_id, title, content, memory_type, priority, source, created_at, updated_at) VALUES (?1, NULL, 'UniqueWidgetTitle', 'Some content', 'fact', 'normal', 'manual', ?2, ?3)",
            params![id, ts, ts],
        )
        .unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM search_index_fts WHERE entity_type='memory' AND entity_id=?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
        conn.execute("DELETE FROM memories WHERE id=?1", params![id])
            .unwrap();
        let n2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM search_index_fts WHERE entity_type='memory' AND entity_id=?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n2, 0);
    }
}
