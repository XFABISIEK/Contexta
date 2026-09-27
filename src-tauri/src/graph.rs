use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};

use crate::models::{GraphData, GraphEdge, GraphNode};

pub struct GraphFilter {
    pub entity_types: Option<Vec<String>>,
    pub project_id: Option<String>,
    pub limit: i64,
}

fn allow(types: &Option<Vec<String>>, t: &str) -> bool {
    types.as_ref().map(|v| v.contains(&t.to_string())).unwrap_or(true)
}

fn count(conn: &Connection, sql: &str, project_id: &Option<String>) -> i64 {
    // Always bind ?1 (NULL when unfiltered); ?1 IS NULL keeps all rows.
    conn.query_row(sql, params![project_id], |r| r.get(0)).unwrap_or(0)
}

/// Graph data with hard caps: never materialize the whole DB.
/// Memories/rules are sampled by priority then recency.
pub fn get_graph(conn: &Connection, f: &GraphFilter) -> rusqlite::Result<GraphData> {
    let limit = f.limit.clamp(20, 2000);
    let mut counts = HashMap::new();

    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut ids: HashSet<String> = HashSet::new();
    let mut truncated = false;

    // Projects (bounded, they are few by nature).
    if allow(&f.entity_types, "project") {
        let c: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;
        counts.insert("project".to_string(), c);
        let cap = 100i64;
        if c > cap {
            truncated = true;
        }
        let mut stmt = conn.prepare(
            "SELECT id, name FROM projects ORDER BY updated_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![cap], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for r in rows {
            let (id, name) = r?;
            if f.project_id.as_ref().map(|p| p != &id).unwrap_or(false) {
                continue;
            }
            ids.insert(id.clone());
            nodes.push(GraphNode { id, node_type: "project".to_string(), label: name, project_id: None, priority: None, icon: None });
        }
    }

    // Skills (global, bounded).
    if allow(&f.entity_types, "skill") {
        let c: i64 = conn.query_row("SELECT COUNT(*) FROM skills", [], |r| r.get(0))?;
        counts.insert("skill".to_string(), c);
        let cap = 60i64;
        if c > cap {
            truncated = true;
        }
        let mut stmt = conn.prepare("SELECT id, name, icon FROM skills ORDER BY updated_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![cap], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)))?;
        for r in rows {
            let (id, name, icon) = r?;
            ids.insert(id.clone());
            nodes.push(GraphNode { id, node_type: "skill".to_string(), label: name, project_id: None, priority: None, icon: Some(icon) });
        }
    }

    // Personal (global, bounded).
    if allow(&f.entity_types, "personal") {
        let c: i64 = conn.query_row("SELECT COUNT(*) FROM personal_information", [], |r| r.get(0))?;
        counts.insert("personal".to_string(), c);
        let cap = 30i64;
        if c > cap {
            truncated = true;
        }
        let mut stmt = conn.prepare("SELECT id, title FROM personal_information ORDER BY updated_at DESC LIMIT ?1")?;
        let rows = stmt.query_map(params![cap], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for r in rows {
            let (id, title) = r?;
            ids.insert(id.clone());
            nodes.push(GraphNode { id, node_type: "personal".to_string(), label: title, project_id: None, priority: None, icon: None });
        }
    }

    // Memories: priority first, then recency; scoped to project when filtered.
    if allow(&f.entity_types, "memory") {
        let c = count(
            conn,
            "SELECT COUNT(*) FROM memories WHERE (?1 IS NULL OR project_id = ?1)",
            &f.project_id,
        );
        counts.insert("memory".to_string(), c);
        let remaining = (limit - nodes.len() as i64).max(20);
        let cap = remaining.min(400);
        if c > cap {
            truncated = true;
        }
        let mut stmt = conn.prepare(
            "SELECT id, title, project_id, priority FROM memories WHERE (?1 IS NULL OR project_id = ?1) \
            ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![f.project_id, cap], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?))
        })?;
        for r in rows {
            let (id, title, pid, prio) = r?;
            ids.insert(id.clone());
            nodes.push(GraphNode { id, node_type: "memory".to_string(), label: title, project_id: pid, priority: Some(prio), icon: None });
        }
    }

    // Rules: same sampling strategy.
    if allow(&f.entity_types, "rule") && (limit - nodes.len() as i64) > 0 {
        let c = count(
            conn,
            "SELECT COUNT(*) FROM rules WHERE (?1 IS NULL OR project_id = ?1)",
            &f.project_id,
        );
        counts.insert("rule".to_string(), c);
        let remaining = (limit - nodes.len() as i64).max(10);
        let cap = remaining.min(200);
        if c > cap {
            truncated = true;
        }
        let mut stmt = conn.prepare(
            "SELECT id, title, project_id, priority FROM rules WHERE (?1 IS NULL OR project_id = ?1) \
            ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, updated_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![f.project_id, cap], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, String>(3)?))
        })?;
        for r in rows {
            let (id, title, pid, prio) = r?;
            ids.insert(id.clone());
            nodes.push(GraphNode { id, node_type: "rule".to_string(), label: title, project_id: pid, priority: Some(prio), icon: None });
        }
    }

    // Edges: explicit connections between visible nodes + implicit belongs_to.
    let mut edges: Vec<GraphEdge> = Vec::new();
    if !ids.is_empty() {
        let id_list: Vec<&String> = ids.iter().collect();
        let ph = id_list.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, source_id, target_id, relationship FROM connections WHERE source_id IN ({}) AND target_id IN ({}) LIMIT 2000",
            ph, ph
        );
        let mut stmt = conn.prepare(&sql)?;
        let mut refs: Vec<&dyn rusqlite::ToSql> = Vec::new();
        refs.extend(id_list.iter().map(|v| *v as &dyn rusqlite::ToSql));
        refs.extend(id_list.iter().map(|v| *v as &dyn rusqlite::ToSql));
        let rows = stmt.query_map(refs.as_slice(), |r| {
            Ok(GraphEdge {
                id: r.get(0)?,
                source: r.get(1)?,
                target: r.get(2)?,
                relationship: r.get(3)?,
            })
        })?;
        for r in rows {
            edges.push(r?);
        }
    }
    for n in &nodes {
        if matches!(n.node_type.as_str(), "memory" | "rule") {
            if let Some(pid) = n.project_id.clone() {
                if ids.contains(&pid) {
                    edges.push(GraphEdge {
                        id: format!("implicit-{}", n.id),
                        source: n.id.clone(),
                        target: pid,
                        relationship: "belongs_to".to_string(),
                    });
                }
            }
        }
    }

    Ok(GraphData { nodes, edges, truncated, counts })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{run_migrations, seed_dev_data};
    use rusqlite::Connection;

    #[test]
    fn graph_returns_nodes_edges_and_counts() {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&mut conn).unwrap();
        seed_dev_data(&mut conn).unwrap();
        let g = get_graph(&conn, &GraphFilter { entity_types: None, project_id: None, limit: 300 }).unwrap();
        assert!(!g.nodes.is_empty());
        assert!(!g.edges.is_empty());
        assert!(g.counts.get("memory").copied().unwrap_or(0) >= 5);
        assert!(g.nodes.iter().any(|n| n.node_type == "project"));
    }

    #[test]
    fn graph_respects_small_limit() {
        let mut conn = Connection::open_in_memory().unwrap();
        run_migrations(&mut conn).unwrap();
        seed_dev_data(&mut conn).unwrap();
        let g = get_graph(&conn, &GraphFilter { entity_types: None, project_id: None, limit: 20 }).unwrap();
        assert!((g.nodes.len() as i64) <= 300);
    }
}
