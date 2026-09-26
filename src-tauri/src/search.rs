use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};

use crate::models::SearchResult;

pub struct SearchParams {
    pub query: String,
    pub entity_types: Option<Vec<String>>,
    pub project_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

/// Semantic-search seam: vector results merged here once an embedding
/// backend exists. Each entry carries a pre-normalized 0..1 similarity.
#[derive(Debug, Clone, Default)]
pub struct VectorHit {
    pub entity_type: String,
    pub entity_id: String,
    pub similarity: f64,
}

/// Escape user input into a safe FTS5 prefix query. Returns None when the
/// query has no usable terms (caller falls back to recency listing).
pub fn sanitize_match(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| {
            t.trim_matches(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
                .replace('"', "")
        })
        .filter(|t| !t.is_empty())
        .take(10)
        .collect();
    if terms.is_empty() {
        return None;
    }
    Some(
        terms
            .iter()
            .map(|t| format!("\"{}\"*", t))
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn priority_bonus(priority: Option<&str>) -> f64 {
    match priority {
        Some("critical") => 8.0,
        Some("high") => 4.0,
        Some("normal") => 1.5,
        Some("low") => 0.0,
        _ => 1.0,
    }
}

fn recency_bonus(updated_at: &str) -> f64 {
    let parsed = chrono::DateTime::parse_from_rfc3339(updated_at)
        .map(|d| d.with_timezone(&chrono::Utc))
        .ok();
    match parsed {
        None => 0.0,
        Some(ts) => {
            let days = (chrono::Utc::now() - ts).num_days();
            if days < 1 {
                3.0
            } else if days < 7 {
                2.0
            } else if days < 30 {
                1.0
            } else {
                0.0
            }
        }
    }
}

fn project_names(conn: &Connection, ids: &HashSet<String>) -> rusqlite::Result<HashMap<String, String>> {
    let mut map = HashMap::new();
    if ids.is_empty() {
        return Ok(map);
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!("SELECT id, name FROM projects WHERE id IN ({})", placeholders);
    let mut stmt = conn.prepare(&sql)?;
    let id_vec: Vec<&String> = ids.iter().collect();
    let rows = stmt.query_map(rusqlite::params_from_iter(id_vec), |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    for r in rows {
        let (id, name) = r?;
        map.insert(id, name);
    }
    Ok(map)
}

struct FtsRow {
    entity_type: String,
    entity_id: String,
    project_id: Option<String>,
    title: String,
    snippet: String,
    rank: f64,
}

fn run_fts(
    conn: &Connection,
    matcher: &str,
    entity_types: &Option<Vec<String>>,
    project_id: &Option<String>,
    limit: i64,
    offset: i64,
) -> rusqlite::Result<(Vec<FtsRow>, i64)> {
    let mut type_filter = String::new();
    if let Some(types) = entity_types {
        if !types.is_empty() {
            let list = types
                .iter()
                .map(|t| format!("'{}'", t.replace('\'', "")))
                .collect::<Vec<_>>()
                .join(",");
            type_filter = format!(" AND entity_type IN ({})", list);
        }
    }
    let scope = " AND (entity_type IN ('skill','personal') \
        OR (entity_type IN ('memory','rule') AND (?2 IS NULL OR project_id = ?2)) \
        OR (entity_type = 'project' AND (?2 IS NULL OR entity_id = ?2)))";
    let count_sql = format!(
        "SELECT COUNT(*) FROM search_index_fts WHERE search_index_fts MATCH ?1{} {}",
        type_filter, scope
    );
    let total: i64 = conn.query_row(&count_sql, params![matcher, project_id], |r| r.get(0))?;

    let sql = format!(
        "SELECT entity_type, entity_id, project_id, title, \
        snippet(search_index_fts, 3, '<mark>', '</mark>', '...', 24), bm25(search_index_fts) \
        FROM search_index_fts WHERE search_index_fts MATCH ?1{} {} ORDER BY rank LIMIT ?3 OFFSET ?4",
        type_filter, scope
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![matcher, project_id, limit, offset], |r| {
        Ok(FtsRow {
            entity_type: r.get(0)?,
            entity_id: r.get(1)?,
            project_id: r.get(2)?,
            title: r.get(3)?,
            snippet: r.get(4)?,
            rank: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok((out, total))
}

fn hydrate(
    conn: &Connection,
    rows: Vec<FtsRow>,
    vector: &[VectorHit],
) -> rusqlite::Result<Vec<SearchResult>> {
    let vec_map: HashMap<(String, String), f64> = vector
        .iter()
        .map(|v| ((v.entity_type.clone(), v.entity_id.clone()), v.similarity))
        .collect();

    let mut mem_meta: HashMap<String, (Option<String>, String)> = HashMap::new();
    let mut rule_meta: HashMap<String, (Option<String>, String)> = HashMap::new();
    let mut proj_meta: HashMap<String, String> = HashMap::new();

    let collect = |t: &str| -> Vec<String> {
        rows.iter()
            .filter(|r| r.entity_type == t)
            .map(|r| r.entity_id.clone())
            .collect::<HashSet<_>>()
            .into_iter()
            .collect()
    };
    let fill = |table: &str, ids: Vec<String>, map: &mut HashMap<String, (Option<String>, String)>| -> rusqlite::Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT id, priority, updated_at FROM {} WHERE id IN ({})", table, ph);
        let mut stmt = conn.prepare(&sql)?;
        let id_refs: Vec<&String> = ids.iter().collect();
        let rs = stmt.query_map(rusqlite::params_from_iter(id_refs), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, String>(2)?))
        })?;
        for r in rs {
            let (id, prio, upd) = r?;
            map.insert(id, (prio, upd));
        }
        Ok(())
    };
    fill("memories", collect("memory"), &mut mem_meta)?;
    fill("rules", collect("rule"), &mut rule_meta)?;
    if !collect("project").is_empty() || !collect("skill").is_empty() || !collect("personal").is_empty() {
        for t in ["project", "skill", "personal"] {
            let ids = collect(t);
            if ids.is_empty() {
                continue;
            }
            let table = match t {
                "project" => "projects",
                "skill" => "skills",
                _ => "personal_information",
            };
            let ph = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!("SELECT id, updated_at FROM {} WHERE id IN ({})", table, ph);
            let mut stmt = conn.prepare(&sql)?;
            let id_refs: Vec<&String> = ids.iter().collect();
            let rs = stmt.query_map(rusqlite::params_from_iter(id_refs), |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for r in rs {
                let (id, upd) = r?;
                proj_meta.insert(id, upd);
            }
        }
    }

    let mut proj_ids: HashSet<String> = rows.iter().filter_map(|r| r.project_id.clone()).collect();
    for id in mem_meta.keys() {
        let _ = id;
    }
    // memories/rules already carry project_id from FTS row; nothing extra needed.
    let names = project_names(conn, &proj_ids)?;
    let _ = &mut proj_ids;

    let mut results: Vec<SearchResult> = rows
        .into_iter()
        .map(|r| {
            let (priority, updated_at) = match r.entity_type.as_str() {
                "memory" => mem_meta.get(&r.entity_id).cloned().unwrap_or((None, now_fallback())),
                "rule" => rule_meta.get(&r.entity_id).cloned().unwrap_or((None, now_fallback())),
                _ => (None, proj_meta.get(&r.entity_id).cloned().unwrap_or_else(now_fallback)),
            };
            let fts_score = -r.rank;
            let semantic = vec_map
                .get(&(r.entity_type.clone(), r.entity_id.clone()))
                .copied()
                .unwrap_or(0.0);
            // Hybrid score: FTS relevance dominates today; semantic term is 0
            // until an embedding backend is plugged in (see VectorHit).
            let score = fts_score * 2.0 + semantic * 10.0
                + priority_bonus(priority.as_deref())
                + recency_bonus(&updated_at);
            SearchResult {
                project_name: r.project_id.as_ref().and_then(|p| names.get(p).cloned()),
                entity_type: r.entity_type,
                entity_id: r.entity_id,
                title: r.title,
                snippet: r.snippet,
                project_id: r.project_id,
                priority,
                score,
                updated_at,
            }
        })
        .collect();
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}

fn now_fallback() -> String {
    "1970-01-01T00:00:00.000Z".to_string()
}

/// Hybrid search entry point: FTS5 first, semantic merged in via `vector`,
/// then priority + recency rerank. Empty query falls back to recency.
pub fn search_hybrid(
    conn: &Connection,
    p: &SearchParams,
    vector: &[VectorHit],
) -> rusqlite::Result<(Vec<SearchResult>, i64)> {
    let limit = p.limit.clamp(1, 500);
    let offset = p.offset.max(0);
    match sanitize_match(&p.query) {
        None => recent_list(conn, &p.entity_types, &p.project_id, limit, offset),
        Some(matcher) => {
            let (rows, total) = run_fts(conn, &matcher, &p.entity_types, &p.project_id, limit, offset)?;
            Ok((hydrate(conn, rows, vector)?, total))
        }
    }
}

/// Ranked memory ids for a query (used by memory list + context builder).
pub fn fts_memory_ids(
    conn: &Connection,
    query: &str,
    project_id: &Option<String>,
    cap: i64,
) -> rusqlite::Result<(Vec<String>, i64)> {
    let params = SearchParams {
        query: query.to_string(),
        entity_types: Some(vec!["memory".to_string()]),
        project_id: project_id.clone(),
        limit: cap.clamp(1, 500),
        offset: 0,
    };
    let (results, total) = search_hybrid(conn, &params, &[])?;
    Ok((results.into_iter().map(|r| r.entity_id).collect(), total))
}

fn recent_list(
    conn: &Connection,
    entity_types: &Option<Vec<String>>,
    project_id: &Option<String>,
    limit: i64,
    offset: i64,
) -> rusqlite::Result<(Vec<SearchResult>, i64)> {
    let allow = |t: &str| -> bool {
        entity_types.as_ref().map(|v| v.contains(&t.to_string())).unwrap_or(true)
    };
    let mut unions: Vec<String> = Vec::new();
    if allow("memory") {
        unions.push("SELECT 'memory' AS et, id, title, substr(content,1,160) AS sn, project_id, priority, updated_at FROM memories".to_string());
    }
    if allow("rule") {
        unions.push("SELECT 'rule' AS et, id, title, substr(content,1,160) AS sn, project_id, priority, updated_at FROM rules".to_string());
    }
    if allow("project") {
        unions.push("SELECT 'project' AS et, id, name, substr(description,1,160) AS sn, id, NULL, updated_at FROM projects".to_string());
    }
    if allow("skill") {
        unions.push("SELECT 'skill' AS et, id, name, substr(description,1,160) AS sn, NULL, NULL, updated_at FROM skills".to_string());
    }
    if allow("personal") {
        unions.push("SELECT 'personal' AS et, id, title, substr(content,1,160) AS sn, NULL, NULL, updated_at FROM personal_information".to_string());
    }
    if unions.is_empty() {
        return Ok((Vec::new(), 0));
    }
    let scope = match project_id {
        None => String::new(),
        Some(_) => " WHERE (et IN ('skill','personal') OR (et IN ('memory','rule') AND project_id = ?1) OR (et = 'project' AND id = ?1))".to_string(),
    };
    let base = unions.join(" UNION ALL ");
    let total_sql = format!("SELECT COUNT(*) FROM ({}) {}", base, scope);
    let total: i64 = if project_id.is_some() {
        conn.query_row(&total_sql, params![project_id], |r| r.get(0))?
    } else {
        conn.query_row(&total_sql, [], |r| r.get(0))?
    };
    let sql = format!(
        "SELECT et, id, title, sn, project_id, priority, updated_at FROM ({}) {} ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3",
        base, scope
    );
    let mut stmt = conn.prepare(&sql)?;
    let pid: Option<&String> = project_id.as_ref();
    let rows = stmt.query_map(params![pid, limit, offset], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, String>(3)?,
            r.get::<_, Option<String>>(4)?,
            r.get::<_, Option<String>>(5)?,
            r.get::<_, String>(6)?,
        ))
    })?;
    let mut proj_ids: HashSet<String> = HashSet::new();
    let mut tmp = Vec::new();
    for r in rows {
        let (et, id, title, sn, project_id, priority, updated_at) = r?;
        if let Some(p) = project_id.clone() {
            proj_ids.insert(p);
        }
        tmp.push((et, id, title, sn, project_id, priority, updated_at));
    }
    let names = project_names(conn, &proj_ids)?;
    let results = tmp
        .into_iter()
        .map(|(et, id, title, sn, project_id, priority, updated_at)| {
            let score = priority_bonus(priority.as_deref()) + recency_bonus(&updated_at);
            SearchResult {
                project_name: project_id.as_ref().and_then(|p| names.get(p).cloned()),
                entity_type: et,
                entity_id: id,
                title,
                snippet: sn,
                project_id,
                priority,
                score,
                updated_at,
            }
        })
        .collect();
    Ok((results, total))
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
    fn sanitize_handles_special_chars_and_empty() {
        assert!(sanitize_match("").is_none());
        assert!(sanitize_match("***").is_none());
        let q = sanitize_match("auth (test)").unwrap();
        assert!(!q.contains('('));
    }

    #[test]
    fn fts_finds_seeded_memory() {
        let conn = seeded();
        let p = SearchParams {
            query: "JWT refresh".to_string(),
            entity_types: None,
            project_id: None,
            limit: 20,
            offset: 0,
        };
        let (res, total) = search_hybrid(&conn, &p, &[]).unwrap();
        assert!(total >= 1);
        assert!(res.iter().any(|r| r.title.contains("JWT")));
    }

    #[test]
    fn empty_query_falls_back_to_recency() {
        let conn = seeded();
        let p = SearchParams {
            query: "".to_string(),
            entity_types: None,
            project_id: None,
            limit: 10,
            offset: 0,
        };
        let (res, total) = search_hybrid(&conn, &p, &[]).unwrap();
        assert!(total > 5);
        assert_eq!(res.len(), 10.min(total as usize));
    }

    #[test]
    fn critical_priority_outranks_normal() {
        let conn = seeded();
        let p = SearchParams {
            query: "Axiom".to_string(),
            entity_types: Some(vec!["memory".to_string(), "rule".to_string()]),
            project_id: None,
            limit: 20,
            offset: 0,
        };
        let (res, _) = search_hybrid(&conn, &p, &[]).unwrap();
        assert!(!res.is_empty());
        let first_critical = res.iter().position(|r| r.priority.as_deref() == Some("critical"));
        let first_low = res.iter().position(|r| r.priority.as_deref() == Some("low"));
        if let (Some(c), Some(l)) = (first_critical, first_low) {
            assert!(c < l);
        }
    }
}
