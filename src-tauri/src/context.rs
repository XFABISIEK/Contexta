use rusqlite::{params, Connection};

use crate::models::{
    priority_rank, Memory, PersonalInfo, Project, ProjectContext, Rule, Skill, Tag,
};
use crate::search::{fts_memory_ids, SearchParams};

pub struct ContextOptions {
    pub project: String,
    pub query: String,
    pub max_results: i64,
    pub max_tokens: i64,
}

fn tags_for(conn: &Connection, memory_id: &str) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM tags t JOIN memory_tags mt ON mt.tag_id = t.id WHERE mt.memory_id = ?1 ORDER BY t.name",
    )?;
    let rows = stmt.query_map(params![memory_id], |r| {
        Ok(Tag { id: r.get(0)?, name: r.get(1)? })
    })?;
    rows.collect()
}

fn read_memory(conn: &Connection, id: &str) -> rusqlite::Result<Option<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, content, memory_type, priority, source, created_at, updated_at FROM memories WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], |r| {
        Ok(Memory {
            id: r.get(0)?,
            project_id: r.get(1)?,
            title: r.get(2)?,
            content: r.get(3)?,
            memory_type: r.get(4)?,
            priority: r.get(5)?,
            source: r.get(6)?,
            tags: Vec::new(),
            created_at: r.get(7)?,
            updated_at: r.get(8)?,
        })
    })?;
    match rows.next() {
        None => Ok(None),
        Some(r) => {
            let mut m = r?;
            m.tags = tags_for(conn, &m.id)?;
            Ok(Some(m))
        }
    }
}

fn top_memories_by_priority(conn: &Connection, project_id: &str, limit: i64) -> rusqlite::Result<Vec<Memory>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM memories WHERE project_id = ?1 ORDER BY \
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, \
        updated_at DESC LIMIT ?2",
    )?;
    let ids: Vec<String> = stmt
        .query_map(params![project_id, limit], |r| r.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    let mut out = Vec::new();
    for id in ids {
        if let Some(m) = read_memory(conn, &id)? {
            out.push(m);
        }
    }
    Ok(out)
}

fn project_rules(conn: &Connection, project_id: &Option<String>) -> rusqlite::Result<Vec<Rule>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, content, priority, enabled, created_at, updated_at FROM rules \
        WHERE enabled = 1 AND (?1 IS NULL OR project_id = ?1 OR project_id IS NULL) \
        ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT 20",
    )?;
    let rows = stmt.query_map(params![project_id], |r| {
        Ok(Rule {
            id: r.get(0)?,
            project_id: r.get(1)?,
            title: r.get(2)?,
            content: r.get(3)?,
            priority: r.get(4)?,
            enabled: r.get::<_, i64>(5)? != 0,
            created_at: r.get(6)?,
            updated_at: r.get(7)?,
        })
    })?;
    rows.collect()
}

fn matching_skills(conn: &Connection, query: &str, limit: i64) -> rusqlite::Result<Vec<Skill>> {
    if query.trim().is_empty() {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, content, category, created_at, updated_at FROM skills ORDER BY updated_at DESC LIMIT ?1",
        )?;
        return stmt
            .query_map(params![limit.min(5)], |r| {
                Ok(Skill {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    description: r.get(2)?,
                    content: r.get(3)?,
                    category: r.get(4)?,
                    created_at: r.get(5)?,
                    updated_at: r.get(6)?,
                    icon: String::new(),
                })
            })?
            .collect();
    }
    let words: Vec<String> = query
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
        .filter(|w| w.len() > 2)
        .take(6)
        .collect();
    if words.is_empty() {
        return Ok(Vec::new());
    }
    let conds = words
        .iter()
        .map(|_| "(LOWER(name) LIKE '%' || ? || '%' OR LOWER(description) LIKE '%' || ? || '%' OR LOWER(content) LIKE '%' || ? || '%')")
        .collect::<Vec<_>>()
        .join(" OR ");
    let sql = format!(
        "SELECT id, name, description, content, category, created_at, updated_at FROM skills WHERE {} LIMIT ?",
        conds
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut values: Vec<String> = Vec::new();
    for w in &words {
        values.push(w.clone());
        values.push(w.clone());
        values.push(w.clone());
    }
    values.push(limit.to_string());
    let refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(refs.as_slice(), |r| {
        Ok(Skill {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            content: r.get(3)?,
            category: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
            icon: String::new(),
        })
    })?;
    rows.collect::<rusqlite::Result<Vec<Skill>>>()
}

fn matching_personal(conn: &Connection, query: &str) -> rusqlite::Result<Vec<PersonalInfo>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    // Personal info is only included when the query actually matches it.
    let p = SearchParams {
        query: query.to_string(),
        entity_types: Some(vec!["personal".to_string()]),
        project_id: None,
        limit: 3,
        offset: 0,
    };
    let (hits, _) = crate::search::search_hybrid(conn, &p, &[])?;
    let mut out = Vec::new();
    for h in hits {
        let mut stmt = conn.prepare(
            "SELECT id, key, title, content, created_at, updated_at FROM personal_information WHERE id = ?1",
        )?;
        let mut rows = stmt.query_map(params![h.entity_id], |r| {
            Ok(PersonalInfo {
                id: r.get(0)?,
                key: r.get(1)?,
                title: r.get(2)?,
                content: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        if let Some(r) = rows.next() {
            out.push(r?);
        }
    }
    Ok(out)
}

fn expand_neighbors(conn: &Connection, memory_ids: &[String], cap: i64) -> rusqlite::Result<Vec<Memory>> {
    if memory_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ph = memory_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT DISTINCT CASE WHEN source_id IN ({0}) THEN target_id ELSE source_id END AS nid, \
        CASE WHEN source_id IN ({0}) THEN target_type ELSE source_type END AS nt \
        FROM connections WHERE (source_id IN ({0}) OR target_id IN ({0})) LIMIT ?",
        ph
    );
    let mut stmt = conn.prepare(&sql)?;
    // The id list appears 4x in the SQL (two CASE arms + two WHERE arms), so bind it 4x.
    let mut refs: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(memory_ids.len() * 4 + 1);
    for _ in 0..4 {
        refs.extend(memory_ids.iter().map(|v| v as &dyn rusqlite::ToSql));
    }
    let cap_s = cap.to_string();
    refs.push(&cap_s);
    let rows = stmt.query_map(refs.as_slice(), |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let mut out = Vec::new();
    let already: std::collections::HashSet<&String> = memory_ids.iter().collect();
    for r in rows {
        let (nid, nt) = r?;
        if nt != "memory" || already.contains(&nid) || out.len() as i64 >= cap {
            continue;
        }
        if let Some(m) = read_memory(conn, &nid)? {
            out.push(m);
        }
    }
    Ok(out)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    format!("{}...", s[..max].trim_end())
}

fn build_markdown(
    project: &Option<Project>,
    rules: &[Rule],
    memories: &[Memory],
    skills: &[Skill],
    personal: &[PersonalInfo],
    budget_chars: usize,
) -> String {
    let mut md = String::new();
    md.push_str(&format!(
        "# Project\n{}\n\n",
        project.as_ref().map(|p| p.name.as_str()).unwrap_or("General")
    ));
    if let Some(p) = project {
        if !p.description.is_empty() {
            md.push_str(&format!("## Project Information\n{}\n\n", truncate(&p.description, 1200)));
        }
    }
    let critical: Vec<&Rule> = rules.iter().filter(|r| r.priority == "critical").collect();
    let other: Vec<&Rule> = rules.iter().filter(|r| r.priority != "critical").collect();
    if !critical.is_empty() {
        md.push_str("## Critical Rules\n");
        for r in critical {
            md.push_str(&format!("- **{}**: {}\n", r.title, truncate(&r.content, 800)));
        }
        md.push('\n');
    }
    if !other.is_empty() {
        md.push_str("## Rules\n");
        for r in other {
            md.push_str(&format!("- **[{}] {}**: {}\n", r.priority, r.title, truncate(&r.content, 800)));
        }
        md.push('\n');
    }
    if !memories.is_empty() {
        md.push_str("## Relevant Memories\n");
        for m in memories {
            md.push_str(&format!("- **[{}] {}**: {}\n", m.priority, m.title, truncate(&m.content, 1000)));
        }
        md.push('\n');
    }
    if !skills.is_empty() {
        md.push_str("## Relevant Skills\n");
        for s in skills {
            md.push_str(&format!("- **{}** ({}): {}\n", s.name, s.category, truncate(&s.description, 600)));
        }
        md.push('\n');
    }
    if !personal.is_empty() {
        md.push_str("## Personal Context\n");
        for p in personal {
            md.push_str(&format!("- **{}**: {}\n", p.title, truncate(&p.content, 600)));
        }
        md.push('\n');
    }
    if md.len() > budget_chars {
        md.truncate(budget_chars);
        md.push_str("\n\n...[truncated to token budget]");
    }
    let _ = priority_rank("normal");
    md
}

/// ContextBuilder: assembles the minimal high-signal context for an AI agent.
pub fn build_project_context(conn: &Connection, opts: &ContextOptions) -> rusqlite::Result<ProjectContext> {
    let project: Option<Project> = {
        let mut stmt = conn.prepare(
            "SELECT id, name, description, path, created_at, updated_at FROM projects WHERE id = ?1 OR name = ?1",
        )?;
        let mut rows = stmt.query_map(params![opts.project], |r| {
            Ok(Project {
                id: r.get(0)?,
                name: r.get(1)?,
                description: r.get(2)?,
                path: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        rows.next().transpose()?
    };
    let pid = project.as_ref().map(|p| p.id.clone());
    let max_results = opts.max_results.clamp(1, 50);

    // 1. Rules: critical always first, enabled only.
    let rules = project_rules(conn, &pid)?;

    // 2. Memories: hybrid retrieval scoped to the project, or top-priority fallback.
    let mut memories = if opts.query.trim().is_empty() {
        match pid.clone() {
            Some(id) => top_memories_by_priority(conn, &id, max_results)?,
            None => Vec::new(),
        }
    } else {
        let (ids, _) = fts_memory_ids(conn, &opts.query, &pid, max_results)?;
        let mut out = Vec::new();
        for id in ids {
            if let Some(m) = read_memory(conn, &id)? {
                // Low priority memories only join on strong textual match (already FTS-filtered).
                out.push(m);
            }
        }
        out
    };
    // 3. Expand one hop over explicit connections.
    let ids: Vec<String> = memories.iter().map(|m| m.id.clone()).collect();
    let extra = expand_neighbors(conn, &ids, 5)?;
    memories.extend(extra);

    // 4. Skills by keyword overlap (semantic backend plugs in here later).
    let skills = matching_skills(conn, &opts.query, 10)?;

    // 5. Personal context only when the query matches it.
    let personal = matching_personal(conn, &opts.query)?;

    let budget = (opts.max_tokens.clamp(256, 64000) as usize) * 4;
    let markdown = build_markdown(&project, &rules, &memories, &skills, &personal, budget);

    Ok(ProjectContext { project, rules, memories, skills, personal, markdown })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{run_migrations, seed_dev_data};
    use rusqlite::Connection;

    fn seeded() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&mut conn).unwrap();
        seed_dev_data(&mut conn).unwrap();
        conn
    }

    #[test]
    fn context_includes_critical_rules_first() {
        let conn = seeded();
        let ctx = build_project_context(
            &conn,
            &ContextOptions { project: "Axiom".to_string(), query: "authentication".to_string(), max_results: 10, max_tokens: 4000 },
        )
        .unwrap();
        assert!(ctx.project.is_some());
        assert!(!ctx.rules.is_empty());
        assert_eq!(ctx.rules[0].priority, "critical");
        assert!(ctx.markdown.contains("Critical Rules"));
    }

    #[test]
    fn context_respects_empty_query() {
        let conn = seeded();
        let ctx = build_project_context(
            &conn,
            &ContextOptions { project: "Axiom".to_string(), query: "".to_string(), max_results: 5, max_tokens: 4000 },
        )
        .unwrap();
        assert!(!ctx.memories.is_empty());
        assert!(ctx.personal.is_empty());
    }

    #[test]
    fn context_budget_truncates_markdown() {
        let conn = seeded();
        let ctx = build_project_context(
            &conn,
            &ContextOptions { project: "Axiom".to_string(), query: "auth".to_string(), max_results: 10, max_tokens: 256 },
        )
        .unwrap();
        assert!(ctx.markdown.len() <= 256 * 4 + 64);
    }
}
