use rusqlite::{params, Connection};
use std::collections::HashMap;

use crate::models::{
    Memory, PersonalInfo, Project, ProjectContext, Rule, Skill, Tag,
};
use crate::search::{fts_memory_ids, SearchParams};

pub struct ContextOptions {
    pub project: String,
    pub query: String,
    pub max_results: i64,
    pub max_tokens: i64,
}

fn tags_for_many(conn: &Connection, memory_ids: &[String]) -> rusqlite::Result<HashMap<String, Vec<Tag>>> {
    let mut map: HashMap<String, Vec<Tag>> = HashMap::new();
    if memory_ids.is_empty() {
        return Ok(map);
    }
    let ph = memory_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT mt.memory_id, t.id, t.name FROM tags t JOIN memory_tags mt ON mt.tag_id = t.id WHERE mt.memory_id IN ({}) ORDER BY t.name",
        ph
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = memory_ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let rows = stmt.query_map(refs.as_slice(), |r| {
        Ok((r.get::<_, String>(0)?, Tag { id: r.get(1)?, name: r.get(2)? }))
    })?;
    for r in rows {
        let (mid, tag) = r?;
        map.entry(mid).or_default().push(tag);
    }
    Ok(map)
}

// Batched memory load: one IN query plus one tags query, no N+1.
// Keeps the input order (FTS rank or priority), skips missing ids.
fn read_memories_batch(conn: &Connection, ids: &[String]) -> rusqlite::Result<Vec<Memory>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, project_id, title, content, memory_type, priority, source, created_at, updated_at FROM memories WHERE id IN ({})",
        ph
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let mut by_id: HashMap<String, Memory> = HashMap::new();
    let rows = stmt.query_map(refs.as_slice(), |r| {
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
    for r in rows {
        let m = r?;
        by_id.insert(m.id.clone(), m);
    }
    let tags = tags_for_many(conn, ids)?;
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(mut m) = by_id.remove(id) {
            m.tags = tags.get(id).cloned().unwrap_or_default();
            out.push(m);
        }
    }
    Ok(out)
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
    read_memories_batch(conn, &ids)
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
    // FTS-ranked through the shared hybrid search (no LIKE full scan, no string-bound LIMIT);
    // an empty query falls back to recency inside search_hybrid.
    let p = SearchParams {
        query: query.to_string(),
        entity_types: Some(vec!["skill".to_string()]),
        project_id: None,
        limit: limit.clamp(1, 20),
        offset: 0,
    };
    let (hits, _) = crate::search::search_hybrid(conn, &p, &[])?;
    let ids: Vec<String> = hits.into_iter().map(|h| h.entity_id).collect();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    // One batched load keeping FTS rank order, icons included.
    let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, name, description, content, category, created_at, updated_at, icon FROM skills WHERE id IN ({})",
        ph
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let mut by_id: HashMap<String, Skill> = HashMap::new();
    let rows = stmt.query_map(refs.as_slice(), |r| {
        Ok(Skill {
            id: r.get(0)?,
            name: r.get(1)?,
            description: r.get(2)?,
            content: r.get(3)?,
            category: r.get(4)?,
            created_at: r.get(5)?,
            updated_at: r.get(6)?,
            icon: r.get(7)?,
        })
    })?;
    for r in rows {
        let s = r?;
        by_id.insert(s.id.clone(), s);
    }
    let mut out = Vec::with_capacity(ids.len());
    for id in &ids {
        if let Some(s) = by_id.remove(id) {
            out.push(s);
        }
    }
    Ok(out)
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
    let ids: Vec<String> = hits.into_iter().map(|h| h.entity_id).collect();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    // One batched load keeping hit order instead of one query per hit.
    let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, key, title, content, created_at, updated_at FROM personal_information WHERE id IN ({})",
        ph
    );
    let mut stmt = conn.prepare(&sql)?;
    let refs: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    let mut by_id: HashMap<String, PersonalInfo> = HashMap::new();
    let rows = stmt.query_map(refs.as_slice(), |r| {
        Ok(PersonalInfo {
            id: r.get(0)?,
            key: r.get(1)?,
            title: r.get(2)?,
            content: r.get(3)?,
            created_at: r.get(4)?,
            updated_at: r.get(5)?,
        })
    })?;
    for r in rows {
        let p = r?;
        by_id.insert(p.id.clone(), p);
    }
    let mut out = Vec::with_capacity(ids.len());
    for id in &ids {
        if let Some(p) = by_id.remove(id) {
            out.push(p);
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
    refs.push(&cap);
    let rows = stmt.query_map(refs.as_slice(), |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    let already: std::collections::HashSet<&String> = memory_ids.iter().collect();
    let mut nids: Vec<String> = Vec::new();
    for r in rows {
        let (nid, nt) = r?;
        if nt != "memory" || already.contains(&nid) || nids.contains(&nid) || nids.len() as i64 >= cap {
            continue;
        }
        nids.push(nid);
    }
    read_memories_batch(conn, &nids)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max.min(s.len());
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", s[..end].trim_end())
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
            let head = "## Project Information\n";
            // Whole block only: skip the description when the budget is already spent.
            let room = budget_chars.saturating_sub(md.len() + head.len() + 2);
            if room > 0 {
                md.push_str(head);
                md.push_str(&format!("{}\n\n", truncate(&p.description, room.min(1200))));
            }
        }
    }
    // Budget-aware sections: whole items only, never a mid-item cut.
    // Stops adding items once the budget is reached and reports the remainder.
    let mut omitted = 0usize;
    let push_section = |md: &mut String, omitted: &mut usize, header: &str, items: Vec<String>| {
        if items.is_empty() {
            return;
        }
        let mut kept: Vec<&String> = Vec::with_capacity(items.len());
        let mut kept_len = 0usize;
        for item in &items {
            if md.len() + header.len() + kept_len + item.len() + 1 > budget_chars {
                *omitted += 1;
            } else {
                kept_len += item.len() + 1;
                kept.push(item);
            }
        }
        if kept.is_empty() {
            return;
        }
        md.push_str(header);
        for item in kept {
            md.push_str(item);
            md.push('\n');
        }
        md.push('\n');
    };
    let critical: Vec<String> = rules
        .iter()
        .filter(|r| r.priority == "critical")
        .map(|r| format!("- **{}**: {}", r.title, truncate(&r.content, 800)))
        .collect();
    let other: Vec<String> = rules
        .iter()
        .filter(|r| r.priority != "critical")
        .map(|r| format!("- **[{}] {}**: {}", r.priority, r.title, truncate(&r.content, 800)))
        .collect();
    let mems: Vec<String> = memories
        .iter()
        .map(|m| format!("- **[{}] {}**: {}", m.priority, m.title, truncate(&m.content, 1000)))
        .collect();
    let sks: Vec<String> = skills
        .iter()
        .map(|s| format!("- **{}** ({}): {}", s.name, s.category, truncate(&s.description, 600)))
        .collect();
    let pers: Vec<String> = personal
        .iter()
        .map(|p| format!("- **{}**: {}", p.title, truncate(&p.content, 600)))
        .collect();
    push_section(&mut md, &mut omitted, "## Critical Rules\n", critical);
    push_section(&mut md, &mut omitted, "## Rules\n", other);
    push_section(&mut md, &mut omitted, "## Relevant Memories\n", mems);
    push_section(&mut md, &mut omitted, "## Relevant Skills\n", sks);
    push_section(&mut md, &mut omitted, "## Personal Context\n", pers);
    if omitted > 0 {
        md.push_str(&format!("\n...[{} more item(s) omitted for token budget]", omitted));
    }
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
        // FTS already filtered; keep its rank order with one batched load.
        read_memories_batch(conn, &ids)?
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

    #[test]
    fn budget_keeps_whole_items_and_reports_omitted() {
        let mem = |t: &str| Memory {
            id: t.to_string(),
            project_id: None,
            title: t.to_string(),
            content: "x".repeat(500),
            memory_type: String::new(),
            priority: "normal".to_string(),
            source: String::new(),
            tags: Vec::new(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let md = build_markdown(&None, &[], &[mem("a"), mem("b"), mem("c")], &[], &[], 600);
        assert!(md.contains("- **[normal] a**"));
        assert!(!md.contains("- **[normal] c**"));
        assert!(md.contains("omitted for token budget"));
    }

    #[test]
    fn skills_come_from_fts_rank_with_empty_query_fallback() {
        let conn = seeded();
        let mk = |name: &str, desc: &str| {
            crate::repos::create_skill(&conn, crate::models::NewSkill {
                name: name.to_string(),
                description: Some(desc.to_string()),
                content: None,
                category: None,
                icon: None,
            })
            .unwrap()
        };
        mk("React Patterns", "Reusable React component patterns");
        mk("Rust Lifetimes", "Understanding borrow checker lifetimes");
        let got = matching_skills(&conn, "react patterns", 10).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].name, "React Patterns");
        let recent = matching_skills(&conn, "", 10).unwrap();
        assert_eq!(recent.len(), 2);
    }
}
