use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::path::Path;

use crate::models::{
    new_id, normalize_priority, now_ts, Connection as ConnectionModel, DashboardStats,
    ImportResult, Memory, NewConnection, NewMemory, NewPersonalInfo, NewProject, NewRule,
    NewSkill, Paged, PersonalInfo, Project, Rule, Skill, Tag, UpdateMemory,
};
use crate::search::fts_memory_ids;

fn clamp_page(limit: Option<i64>, offset: Option<i64>) -> (i64, i64) {
    (limit.unwrap_or(50).clamp(1, 500), offset.unwrap_or(0).max(0))
}

fn like(q: &str) -> String {
    format!("%{}%", q.replace('%', "").replace('_', ""))
}

// ---------- stats ----------

pub fn stats(conn: &Connection) -> rusqlite::Result<DashboardStats> {
    let c = |sql: &str| -> rusqlite::Result<i64> {
        conn.query_row(sql, [], |r| r.get(0))
    };
    Ok(DashboardStats {
        projects: c("SELECT COUNT(*) FROM projects")?,
        memories: c("SELECT COUNT(*) FROM memories")?,
        rules: c("SELECT COUNT(*) FROM rules")?,
        skills: c("SELECT COUNT(*) FROM skills")?,
        connections: c("SELECT COUNT(*) FROM connections")?,
        personal: c("SELECT COUNT(*) FROM personal_information")?,
    })
}

// ---------- projects ----------

pub fn list_projects(
    conn: &Connection,
    query: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Paged<Project>> {
    let (limit, offset) = clamp_page(limit, offset);
    let filter = query.map(|q| like(&q));
    let total: i64 = match &filter {
        None => conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?,
        Some(f) => conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE name LIKE ?1 OR description LIKE ?1",
            params![f],
            |r| r.get(0),
        )?,
    };
    let items: Vec<Project> = match &filter {
        None => {
            let mut stmt = conn.prepare("SELECT id, name, description, created_at, updated_at FROM projects ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2")?;
            let rows = stmt.query_map(params![limit, offset], row_to_project)?;
            rows.collect::<rusqlite::Result<Vec<Project>>>()?
        }
        Some(f) => {
            let mut stmt = conn.prepare("SELECT id, name, description, created_at, updated_at FROM projects WHERE name LIKE ?3 OR description LIKE ?3 ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2")?;
            let rows = stmt.query_map(params![limit, offset, f], row_to_project)?;
            rows.collect::<rusqlite::Result<Vec<Project>>>()?
        }
    };
    Ok(Paged { items, total, limit, offset })
}

fn row_to_project(r: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, created_at: r.get(3)?, updated_at: r.get(4)? })
}

pub fn create_project(conn: &Connection, input: NewProject) -> Result<Project, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Project name must not be empty".to_string());
    }
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects WHERE name = ?1", params![name], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        return Err(format!("Project '{}' already exists", name));
    }
    let ts = now_ts();
    let p = Project {
        id: new_id(),
        name,
        description: input.description.unwrap_or_default(),
        created_at: ts.clone(),
        updated_at: ts,
    };
    conn.execute(
        "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![p.id, p.name, p.description, p.created_at, p.updated_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(p)
}

pub fn update_project(conn: &Connection, id: &str, input: NewProject) -> Result<Project, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Project name must not be empty".to_string());
    }
    let clash: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects WHERE name = ?1 AND id != ?2", params![name, id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if clash > 0 {
        return Err(format!("Project '{}' already exists", name));
    }
    let ts = now_ts();
    let n = conn
        .execute(
            "UPDATE projects SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
            params![name, input.description.unwrap_or_default(), ts, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Project not found".to_string());
    }
    get_project(conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Project not found".to_string())
}

pub fn delete_project(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn.execute("DELETE FROM projects WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Project not found".to_string());
    }
    Ok(())
}

pub fn get_project(conn: &Connection, id: &str) -> rusqlite::Result<Option<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |r| {
        Ok(Project { id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, created_at: r.get(3)?, updated_at: r.get(4)? })
    })?;
    match rows.next() {
        None => Ok(None),
        Some(r) => Ok(Some(r?)),
    }
}

fn touch_project(conn: &Connection, project_id: &Option<String>) {
    if let Some(pid) = project_id {
        let _ = conn.execute(
            "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
            params![now_ts(), pid],
        );
    }
}

// ---------- tags ----------

fn ensure_tag(conn: &Connection, name: &str) -> rusqlite::Result<()> {
    conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", params![name])?;
    Ok(())
}

fn set_memory_tags(conn: &Connection, memory_id: &str, tags: &[String]) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM memory_tags WHERE memory_id = ?1", params![memory_id])?;
    for t in tags {
        let name = t.trim().to_lowercase();
        if name.is_empty() {
            continue;
        }
        ensure_tag(conn, &name)?;
        conn.execute(
            "INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) SELECT ?1, id FROM tags WHERE name = ?2",
            params![memory_id, name],
        )?;
    }
    Ok(())
}

pub fn tags_for_memory(conn: &Connection, memory_id: &str) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM tags t JOIN memory_tags mt ON mt.tag_id = t.id WHERE mt.memory_id = ?1 ORDER BY t.name",
    )?;
    let rows = stmt.query_map(params![memory_id], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)? }))?;
    rows.collect::<rusqlite::Result<Vec<Tag>>>()
}

pub fn list_tags(conn: &Connection) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name FROM tags ORDER BY name")?;
    let rows = stmt.query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)? }))?;
    rows.collect::<rusqlite::Result<Vec<Tag>>>()
}

// ---------- memories ----------

fn read_memory(conn: &Connection, id: &str) -> rusqlite::Result<Option<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, content, memory_type, priority, source, created_at, updated_at FROM memories WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |r| {
        Ok(Memory {
            id: r.get(0)?, project_id: r.get(1)?, title: r.get(2)?, content: r.get(3)?,
            memory_type: r.get(4)?, priority: r.get(5)?, source: r.get(6)?,
            tags: Vec::new(), created_at: r.get(7)?, updated_at: r.get(8)?,
        })
    })?;
    match rows.next() {
        None => Ok(None),
        Some(r) => {
            let mut m = r?;
            m.tags = tags_for_memory(conn, &m.id)?;
            Ok(Some(m))
        }
    }
}

pub fn get_memory(conn: &Connection, id: &str) -> rusqlite::Result<Option<Memory>> {
    read_memory(conn, id)
}

#[allow(clippy::too_many_arguments)]
pub fn list_memories(
    conn: &Connection,
    project_id: Option<String>,
    memory_type: Option<String>,
    priority: Option<String>,
    query: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Paged<Memory>, String> {
    let (limit, offset) = clamp_page(limit, offset);
    if let Some(q) = query.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        // Full-text ranked path (never a table scan + JS filter).
        let (ids, _) = fts_memory_ids(conn, &q, &project_id, 500).map_err(|e| e.to_string())?;
        if ids.is_empty() {
            return Ok(Paged { items: Vec::new(), total: 0, limit, offset });
        }
        let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT id, memory_type, priority FROM memories WHERE id IN ({})", ph);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let refs: Vec<&String> = ids.iter().collect();
        let meta: HashMap<String, (String, String)> = stmt
            .query_map(rusqlite::params_from_iter(refs), |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|(a, b, c)| (a, (b, c)))
            .collect();
        let filtered: Vec<String> = ids
            .into_iter()
            .filter(|id| match meta.get(id) {
                None => false,
                Some((t, p)) => {
                    memory_type.as_ref().map(|f| f == t).unwrap_or(true)
                        && priority.as_ref().map(|f| f == p).unwrap_or(true)
                }
            })
            .collect();
        let total = filtered.len() as i64;
        let mut items = Vec::new();
        for id in filtered.into_iter().skip(offset as usize).take(limit as usize) {
            if let Some(m) = read_memory(conn, &id).map_err(|e| e.to_string())? {
                items.push(m);
            }
        }
        return Ok(Paged { items, total, limit, offset });
    }
    // Build positional params in fixed order.
    let mut vals: Vec<String> = Vec::new();
    let mut where_sql = String::new();
    {
        let mut parts: Vec<String> = Vec::new();
        if let Some(p) = project_id {
            parts.push("project_id = ?".to_string());
            vals.push(p);
        }
        if let Some(t) = memory_type {
            parts.push("memory_type = ?".to_string());
            vals.push(t);
        }
        if let Some(p) = priority {
            parts.push("priority = ?".to_string());
            vals.push(p);
        }
        if !parts.is_empty() {
            where_sql = format!(" WHERE {}", parts.join(" AND "));
        }
    }
    let total_sql = format!("SELECT COUNT(*) FROM memories{}", where_sql);
    let mut stmt = conn.prepare(&total_sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let total: i64 = stmt.query_row(refs.as_slice(), |r| r.get(0)).map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT id FROM memories{} ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT {} OFFSET {}",
        where_sql, limit, offset
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map(refs.as_slice(), |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<_>>()
        .map_err(|e| e.to_string())?;
    let mut items = Vec::new();
    for id in ids {
        if let Some(m) = read_memory(conn, &id).map_err(|e| e.to_string())? {
            items.push(m);
        }
    }
    Ok(Paged { items, total, limit, offset })
}

pub fn create_memory(conn: &Connection, input: NewMemory) -> Result<Memory, String> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err("Memory title must not be empty".to_string());
    }
    if let Some(pid) = input.project_id.clone().filter(|s| !s.is_empty()) {
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects WHERE id = ?1", params![pid], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("Selected project does not exist".to_string());
        }
    }
    let ts = now_ts();
    let m = Memory {
        id: new_id(),
        project_id: input.project_id.filter(|s| !s.is_empty()),
        title,
        content: input.content,
        memory_type: input.memory_type.unwrap_or_else(|| "fact".to_string()),
        priority: normalize_priority(input.priority),
        source: input.source.unwrap_or_else(|| "manual".to_string()),
        tags: Vec::new(),
        created_at: ts.clone(),
        updated_at: ts,
    };
    conn.execute(
        "INSERT INTO memories (id, project_id, title, content, memory_type, priority, source, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![m.id, m.project_id, m.title, m.content, m.memory_type, m.priority, m.source, m.created_at, m.updated_at],
    )
    .map_err(|e| e.to_string())?;
    if let Some(tags) = input.tags {
        set_memory_tags(conn, &m.id, &tags).map_err(|e| e.to_string())?;
    }
    touch_project(conn, &m.project_id);
    read_memory(conn, &m.id).map_err(|e| e.to_string())?.ok_or_else(|| "Memory not found after insert".to_string())
}

pub fn update_memory(conn: &Connection, id: &str, input: UpdateMemory) -> Result<Memory, String> {
    let cur = read_memory(conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Memory not found".to_string())?;
    if let Some(t) = input.title.clone().filter(|s| s.trim().is_empty()) {
        let _ = t;
        return Err("Memory title must not be empty".to_string());
    }
    let project_id: Option<String> = match input.project_id {
        None => cur.project_id.clone(),
        Some(v) => v.filter(|s| !s.is_empty()),
    };
    let ts = now_ts();
    let n = conn
        .execute(
            "UPDATE memories SET title = COALESCE(?1, title), content = COALESCE(?2, content), project_id = ?3, \
            memory_type = COALESCE(?4, memory_type), priority = COALESCE(?5, priority), source = COALESCE(?6, source), updated_at = ?7 WHERE id = ?8",
            params![
                input.title, input.content, project_id,
                input.memory_type, Some(normalize_priority(input.priority)), input.source, ts, id
            ],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Memory not found".to_string());
    }
    if let Some(tags) = input.tags {
        set_memory_tags(conn, id, &tags).map_err(|e| e.to_string())?;
    }
    touch_project(conn, &project_id);
    read_memory(conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Memory not found".to_string())
}

pub fn delete_memory(conn: &Connection, id: &str) -> Result<(), String> {
    let cur = read_memory(conn, id).map_err(|e| e.to_string())?;
    let n = conn.execute("DELETE FROM memories WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Memory not found".to_string());
    }
    if let Some(m) = cur {
        touch_project(conn, &m.project_id);
    }
    Ok(())
}

// ---------- rules ----------

pub fn list_rules(
    conn: &Connection,
    project_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Paged<Rule>> {
    let (limit, offset) = clamp_page(limit, offset);
    let total: i64 = match &project_id {
        None => conn.query_row("SELECT COUNT(*) FROM rules", [], |r| r.get(0))?,
        Some(_) => conn.query_row("SELECT COUNT(*) FROM rules WHERE project_id = ?1", params![project_id], |r| r.get(0))?,
    };
    let sql = "SELECT id, project_id, title, content, priority, enabled, created_at, updated_at FROM rules \
        WHERE (?1 IS NULL OR project_id = ?1) ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT ?2 OFFSET ?3";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![project_id, limit, offset], |r| {
        Ok(Rule {
            id: r.get(0)?, project_id: r.get(1)?, title: r.get(2)?, content: r.get(3)?,
            priority: r.get(4)?, enabled: r.get::<_, i64>(5)? != 0, created_at: r.get(6)?, updated_at: r.get(7)?,
        })
    })?;
    Ok(Paged { items: rows.collect::<rusqlite::Result<_>>()?, total, limit, offset })
}

pub fn create_rule(conn: &Connection, input: NewRule) -> Result<Rule, String> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err("Rule title must not be empty".to_string());
    }
    let ts = now_ts();
    let id = new_id();
    let pid = input.project_id.clone().filter(|s| !s.is_empty());
    conn.execute(
        "INSERT INTO rules (id, project_id, title, content, priority, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, pid, title, input.content, normalize_priority(input.priority), input.enabled.unwrap_or(true) as i64, ts, ts],
    )
    .map_err(|e| e.to_string())?;
    touch_project(conn, &pid);
    let mut stmt = conn.prepare("SELECT id, project_id, title, content, priority, enabled, created_at, updated_at FROM rules WHERE id = ?1").map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |r| {
        Ok(Rule {
            id: r.get(0)?, project_id: r.get(1)?, title: r.get(2)?, content: r.get(3)?,
            priority: r.get(4)?, enabled: r.get::<_, i64>(5)? != 0, created_at: r.get(6)?, updated_at: r.get(7)?,
        })
    })
    .map_err(|e| e.to_string())
}

pub fn update_rule(conn: &Connection, id: &str, input: NewRule) -> Result<Rule, String> {
    if input.title.trim().is_empty() {
        return Err("Rule title must not be empty".to_string());
    }
    let ts = now_ts();
    let n = conn
        .execute(
            "UPDATE rules SET title = ?1, content = ?2, priority = ?3, enabled = ?4, updated_at = ?5 WHERE id = ?6",
            params![input.title, input.content, normalize_priority(input.priority), input.enabled.unwrap_or(true) as i64, ts, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Rule not found".to_string());
    }
    touch_project(conn, &input.project_id);
    let mut stmt = conn.prepare("SELECT id, project_id, title, content, priority, enabled, created_at, updated_at FROM rules WHERE id = ?1").map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |r| {
        Ok(Rule {
            id: r.get(0)?, project_id: r.get(1)?, title: r.get(2)?, content: r.get(3)?,
            priority: r.get(4)?, enabled: r.get::<_, i64>(5)? != 0, created_at: r.get(6)?, updated_at: r.get(7)?,
        })
    })
    .map_err(|e| e.to_string())
}

pub fn delete_rule(conn: &Connection, id: &str) -> Result<(), String> {
    let pid: Option<String> = conn
        .query_row("SELECT project_id FROM rules WHERE id = ?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())
        .ok();
    let n = conn.execute("DELETE FROM rules WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Rule not found".to_string());
    }
    touch_project(conn, &pid);
    Ok(())
}

// ---------- skills ----------

pub fn list_skills(
    conn: &Connection,
    query: Option<String>,
    category: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Paged<Skill>> {
    let (limit, offset) = clamp_page(limit, offset);
    let q = query.map(|s| like(&s));
    let total: i64 = conn.query_row(
        "SELECT COUNT(*) FROM skills WHERE (?1 IS NULL OR name LIKE ?1 OR description LIKE ?1) AND (?2 IS NULL OR category = ?2)",
        params![q, category],
        |r| r.get(0),
    )?;
    let mut stmt = conn.prepare(
        "SELECT id, name, description, content, category, created_at, updated_at FROM skills \
        WHERE (?1 IS NULL OR name LIKE ?1 OR description LIKE ?1) AND (?2 IS NULL OR category = ?2) \
        ORDER BY updated_at DESC LIMIT ?3 OFFSET ?4",
    )?;
    let rows = stmt.query_map(params![q, category, limit, offset], |r| {
        Ok(Skill {
            id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, content: r.get(3)?,
            category: r.get(4)?, created_at: r.get(5)?, updated_at: r.get(6)?,
        })
    })?;
    Ok(Paged { items: rows.collect::<rusqlite::Result<_>>()?, total, limit, offset })
}

pub fn create_skill(conn: &Connection, input: NewSkill) -> Result<Skill, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Skill name must not be empty".to_string());
    }
    let ts = now_ts();
    let id = new_id();
    conn.execute(
        "INSERT INTO skills (id, name, description, content, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, name, input.description.unwrap_or_default(), input.content.unwrap_or_default(), input.category.unwrap_or_else(|| "general".to_string()), ts, ts],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Skill '{}' already exists", name)
        } else {
            e.to_string()
        }
    })?;
    get_skill(conn, &id).map_err(|e| e.to_string())?.ok_or_else(|| "Skill not found after insert".to_string())
}

pub fn get_skill(conn: &Connection, id: &str) -> rusqlite::Result<Option<Skill>> {
    let mut stmt = conn.prepare("SELECT id, name, description, content, category, created_at, updated_at FROM skills WHERE id = ?1")?;
    let mut rows = stmt.query_map(params![id], |r| {
        Ok(Skill {
            id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, content: r.get(3)?,
            category: r.get(4)?, created_at: r.get(5)?, updated_at: r.get(6)?,
        })
    })?;
    match rows.next() {
        None => Ok(None),
        Some(r) => Ok(Some(r?)),
    }
}

pub fn update_skill(conn: &Connection, id: &str, input: NewSkill) -> Result<Skill, String> {
    if input.name.trim().is_empty() {
        return Err("Skill name must not be empty".to_string());
    }
    let ts = now_ts();
    let n = conn
        .execute(
            "UPDATE skills SET name = ?1, description = ?2, content = ?3, category = ?4, updated_at = ?5 WHERE id = ?6",
            params![input.name, input.description.unwrap_or_default(), input.content.unwrap_or_default(), input.category.unwrap_or_else(|| "general".to_string()), ts, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Skill not found".to_string());
    }
    get_skill(conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Skill not found".to_string())
}

pub fn delete_skill(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn.execute("DELETE FROM skills WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Skill not found".to_string());
    }
    Ok(())
}

// ---------- personal ----------

pub fn list_personal(conn: &Connection) -> rusqlite::Result<Vec<PersonalInfo>> {
    let mut stmt = conn.prepare("SELECT id, key, title, content, created_at, updated_at FROM personal_information ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], |r| {
        Ok(PersonalInfo { id: r.get(0)?, key: r.get(1)?, title: r.get(2)?, content: r.get(3)?, created_at: r.get(4)?, updated_at: r.get(5)? })
    })?;
    rows.collect::<rusqlite::Result<Vec<PersonalInfo>>>()
}

pub fn create_personal(conn: &Connection, input: NewPersonalInfo) -> Result<PersonalInfo, String> {
    if input.key.trim().is_empty() || input.title.trim().is_empty() {
        return Err("Key and title must not be empty".to_string());
    }
    let ts = now_ts();
    let id = new_id();
    conn.execute(
        "INSERT INTO personal_information (id, key, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.key.trim(), input.title.trim(), input.content, ts, ts],
    )
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Key '{}' already exists", input.key)
        } else {
            e.to_string()
        }
    })?;
    Ok(PersonalInfo { id, key: input.key, title: input.title, content: input.content, created_at: ts.clone(), updated_at: ts })
}

pub fn update_personal(conn: &Connection, id: &str, input: NewPersonalInfo) -> Result<PersonalInfo, String> {
    let ts = now_ts();
    let n = conn
        .execute(
            "UPDATE personal_information SET key = ?1, title = ?2, content = ?3, updated_at = ?4 WHERE id = ?5",
            params![input.key.trim(), input.title.trim(), input.content, ts, id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Entry not found".to_string());
    }
    Ok(PersonalInfo { id: id.to_string(), key: input.key, title: input.title, content: input.content, created_at: String::new(), updated_at: ts })
}

pub fn delete_personal(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn.execute("DELETE FROM personal_information WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Entry not found".to_string());
    }
    Ok(())
}

// ---------- connections ----------

fn entity_exists(conn: &Connection, id: &str, t: &str) -> bool {
    let table = match t {
        "project" => "projects",
        "memory" => "memories",
        "rule" => "rules",
        "skill" => "skills",
        "personal" => "personal_information",
        "tag" => "tags",
        _ => return false,
    };
    let sql = format!("SELECT COUNT(*) FROM {} WHERE id = ?1", table);
    if t == "tag" {
        return conn
            .query_row("SELECT COUNT(*) FROM tags WHERE id = ?1", params![id.parse::<i64>().unwrap_or(-1)], |r| r.get::<_, i64>(0))
            .unwrap_or(0)
            > 0;
    }
    conn.query_row(&sql, params![id], |r| r.get::<_, i64>(0)).unwrap_or(0) > 0
}

pub fn list_connections(
    conn: &Connection,
    entity_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> rusqlite::Result<Paged<ConnectionModel>> {
    let (limit, offset) = clamp_page(limit, offset);
    let total: i64 = match &entity_id {
        None => conn.query_row("SELECT COUNT(*) FROM connections", [], |r| r.get(0))?,
        Some(_) => conn.query_row(
            "SELECT COUNT(*) FROM connections WHERE source_id = ?1 OR target_id = ?1",
            params![entity_id], |r| r.get(0))?,
    };
    let mut stmt = conn.prepare(
        "SELECT id, source_id, source_type, target_id, target_type, relationship, weight, created_at FROM connections \
        WHERE (?1 IS NULL OR source_id = ?1 OR target_id = ?1) ORDER BY created_at DESC LIMIT ?2 OFFSET ?3",
    )?;
    let rows = stmt.query_map(params![entity_id, limit, offset], |r| {
        Ok(ConnectionModel {
            id: r.get(0)?, source_id: r.get(1)?, source_type: r.get(2)?, target_id: r.get(3)?,
            target_type: r.get(4)?, relationship: r.get(5)?, weight: r.get(6)?, created_at: r.get(7)?,
        })
    })?;
    Ok(Paged { items: rows.collect::<rusqlite::Result<_>>()?, total, limit, offset })
}

pub fn create_connection(conn: &Connection, input: NewConnection) -> Result<ConnectionModel, String> {
    if input.source_id == input.target_id {
        return Err("Cannot connect an entity to itself".to_string());
    }
    if !entity_exists(conn, &input.source_id, &input.source_type) {
        return Err("Source entity does not exist".to_string());
    }
    if !entity_exists(conn, &input.target_id, &input.target_type) {
        return Err("Target entity does not exist".to_string());
    }
    let ts = now_ts();
    let c = ConnectionModel {
        id: new_id(),
        source_id: input.source_id,
        source_type: input.source_type,
        target_id: input.target_id,
        target_type: input.target_type,
        relationship: input.relationship.unwrap_or_else(|| "related".to_string()),
        weight: input.weight.unwrap_or(1.0),
        created_at: ts,
    };
    conn.execute(
        "INSERT INTO connections (id, source_id, source_type, target_id, target_type, relationship, weight, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![c.id, c.source_id, c.source_type, c.target_id, c.target_type, c.relationship, c.weight, c.created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(c)
}

pub fn delete_connection(conn: &Connection, id: &str) -> Result<(), String> {
    let n = conn.execute("DELETE FROM connections WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("Connection not found".to_string());
    }
    Ok(())
}

// ---------- settings ----------

pub fn get_settings(conn: &Connection) -> rusqlite::Result<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut map = HashMap::new();
    for r in rows {
        let (k, v) = r?;
        map.insert(k, v);
    }
    Ok(map)
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

// ---------- export / import / backup ----------

pub fn export_all(conn: &Connection) -> Result<String, String> {
    let projects = list_projects(conn, None, Some(10000), Some(0)).map_err(|e| e.to_string())?;
    let memories = list_memories(conn, None, None, None, None, Some(100000), Some(0))?;
    let rules = list_rules(conn, None, Some(100000), Some(0)).map_err(|e| e.to_string())?;
    let skills = list_skills(conn, None, None, Some(10000), Some(0)).map_err(|e| e.to_string())?;
    let personal = list_personal(conn).map_err(|e| e.to_string())?;
    let connections = list_connections(conn, None, Some(100000), Some(0)).map_err(|e| e.to_string())?;
    let tags = list_tags(conn).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&serde_json::json!({
        "version": 1,
        "exported_at": now_ts(),
        "projects": projects.items,
        "memories": memories.items,
        "rules": rules.items,
        "skills": skills.items,
        "personal": personal,
        "connections": connections.items,
        "tags": tags,
    }))
    .map_err(|e| e.to_string())
}

pub fn export_project(conn: &Connection, id: &str) -> Result<String, String> {
    let project = get_project(conn, id).map_err(|e| e.to_string())?.ok_or_else(|| "Project not found".to_string())?;
    let memories = list_memories(conn, Some(id.to_string()), None, None, None, Some(100000), Some(0))?;
    let rules = list_rules(conn, Some(id.to_string()), Some(100000), Some(0)).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&serde_json::json!({
        "version": 1,
        "exported_at": now_ts(),
        "project": project,
        "memories": memories.items,
        "rules": rules.items,
    }))
    .map_err(|e| e.to_string())
}

pub fn import_project(conn: &Connection, json: &str) -> Result<ImportResult, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|e| format!("Invalid JSON: {}", e))?;
    let name = v.get("project").and_then(|p| p.get("name")).and_then(|n| n.as_str()).unwrap_or("").trim().to_string();
    if name.is_empty() {
        return Err("Import JSON has no project.name".to_string());
    }
    let exists: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects WHERE name = ?1", params![name], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        return Err(format!("Project '{}' already exists", name));
    }
    let description = v.get("project").and_then(|p| p.get("description")).and_then(|d| d.as_str()).unwrap_or("").to_string();
    let project = create_project(conn, NewProject { name: name.clone(), description: Some(description) })?;
    let mut mem_count = 0i64;
    if let Some(arr) = v.get("memories").and_then(|m| m.as_array()) {
        for m in arr {
            let title = m.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if title.trim().is_empty() {
                continue;
            }
            let tags: Vec<String> = m.get("tags").and_then(|t| t.as_array()).map(|a| {
                a.iter().filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(|s| s.to_string())).collect()
            }).unwrap_or_default();
            create_memory(conn, NewMemory {
                project_id: Some(project.id.clone()),
                title,
                content: m.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                memory_type: m.get("memory_type").and_then(|t| t.as_str()).map(|s| s.to_string()),
                priority: m.get("priority").and_then(|t| t.as_str()).map(|s| s.to_string()),
                source: Some("import".to_string()),
                tags: Some(tags),
            })?;
            mem_count += 1;
        }
    }
    let mut rule_count = 0i64;
    if let Some(arr) = v.get("rules").and_then(|r| r.as_array()) {
        for r in arr {
            let title = r.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if title.trim().is_empty() {
                continue;
            }
            create_rule(conn, NewRule {
                project_id: Some(project.id.clone()),
                title,
                content: r.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string(),
                priority: r.get("priority").and_then(|t| t.as_str()).map(|s| s.to_string()),
                enabled: Some(true),
            })?;
            rule_count += 1;
        }
    }
    Ok(ImportResult { project: project.name, memories: mem_count, rules: rule_count })
}

pub fn backup_db(conn: &Connection, dest: &Path) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // VACUUM INTO does not accept bound parameters, so the literal is escaped.
    let lit = dest.to_string_lossy().replace('\'', "''");
    conn.execute_batch(&format!("VACUUM INTO '{}';", lit)).map_err(|e| e.to_string())?;
    Ok(())
}
