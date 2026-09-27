//! Contexa MCP server (stdio).
//!
//! Lets any MCP-compatible AI client read AND write the local knowledge base:
//!
//! ```bash
//! cargo build --release --bin simplememory-mcp
//! SIMPLEMEMORY_DB="%APPDATA%/com.simplememory.app/simplememory.db" simplememory-mcp
//! ```
//!
//! Protocol: newline-delimited JSON-RPC 2.0 over stdin/stdout
//! (`initialize`, `tools/list`, `tools/call`, `ping`).
//! Reuses the exact same `db` / `repos` / `search` / `context` layers as the
//! desktop app, so AI writes go through identical validation and FTS indexing.

use rusqlite::Connection;
use serde_json::{json, Value};
use simplememory::{context, db, graph, models, repos, search, storage};
use std::io::{BufRead, Write};
use std::path::PathBuf;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn db_path() -> PathBuf {
    if let Ok(p) = std::env::var("SIMPLEMEMORY_DB") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        let default = PathBuf::from(base).join("com.simplememory.app").join("simplememory.db");
        return storage::db_path(&default).expect("configured Contexta database unavailable");
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let default = PathBuf::from(home).join(".local/share/com.simplememory.app/simplememory.db");
        return storage::db_path(&default).expect("configured Contexta database unavailable");
    }
}

// ---------- JSON-RPC plumbing ----------

fn ok(id: &Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn fail(id: &Value, code: i64, message: String) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn text_result(v: Value) -> Value {
    json!({"content": [{"type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default()}]})
}

fn text_error(msg: String) -> Value {
    json!({"content": [{"type": "text", "text": msg}], "isError": true})
}

// ---------- tool definitions ----------

fn schema(props: Value, required: &[&str]) -> Value {
    json!({"type": "object", "properties": props, "required": required})
}

fn tools_list() -> Value {
    let t = |name: &str, description: &str, input_schema: Value| {
        json!({"name": name, "description": description, "inputSchema": input_schema})
    };
    let priority_prop = json!({"type": "string", "enum": ["critical", "high", "normal", "low"]});
    let project_prop = json!({"type": "string", "description": "Project id or name (memories/rules) / name (context)"});
    json!([
        // ---- read ----
        t("simplememory_search", "Hybrid FTS search across projects, memories, rules, skills and personal info.",
            schema(json!({"query": {"type": "string"}, "entity_types": {"type": "array", "items": {"type": "string"}},
                "project_id": {"type": "string"}, "limit": {"type": "integer"}, "offset": {"type": "integer"}}), &["query"])),
        t("simplememory_get_project", "Fetch one project by id or name.",
            schema(json!({"project": {"type": "string"}}), &["project"])),
        t("simplememory_get_project_context", "Assemble optimized AI context: critical rules first, ranked memories, skills, conditional personal info, token-budgeted markdown.",
            schema(json!({"project": project_prop, "query": {"type": "string"}, "max_results": {"type": "integer"}, "max_tokens": {"type": "integer"}}), &["project"])),
        t("simplememory_get_rules", "List rules (critical first). Filter by project.",
            schema(json!({"project_id": {"type": "string"}, "limit": {"type": "integer"}}), &[])),
        t("simplememory_get_memories", "Ranked memory retrieval with project/type/priority/query filters.",
            schema(json!({"project_id": {"type": "string"}, "memory_type": {"type": "string"}, "priority": priority_prop,
                "query": {"type": "string"}, "limit": {"type": "integer"}}), &[])),
        t("simplememory_get_skills", "List skills by keyword/category.",
            schema(json!({"query": {"type": "string"}, "category": {"type": "string"}}), &[])),
        t("simplememory_get_personal_context", "Personal info matching a query (only returned on match, stays local).",
            schema(json!({"query": {"type": "string"}}), &["query"])),
        t("simplememory_get_graph", "Relation graph: capped, priority-sampled nodes + explicit and belongs_to edges.",
            schema(json!({"entity_types": {"type": "array", "items": {"type": "string"}}, "project_id": {"type": "string"}, "limit": {"type": "integer"}}), &[])),
        // ---- write: projects ----
        t("simplememory_add_project", "Create a project.",
            schema(json!({"name": {"type": "string"}, "description": {"type": "string"}, "path": {"type": "string"}}), &["name"])),
        t("simplememory_update_project", "Rename / re-describe a project (by id).",
            schema(json!({"id": {"type": "string"}, "name": {"type": "string"}, "description": {"type": "string"}, "path": {"type": "string"}}), &["id", "name"])),
        t("simplememory_delete_project", "Delete a project (memories detach, rules cascade).",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        // ---- write: memories ----
        t("simplememory_add_memory", "Store a memory. Priority controls AI-context inclusion (critical always in).",
            schema(json!({"title": {"type": "string"}, "content": {"type": "string"}, "project_id": {"type": "string"},
                "memory_type": {"type": "string", "enum": ["fact", "decision", "note", "reference", "todo"]},
                "priority": priority_prop, "source": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}}), &["title"])),
        t("simplememory_update_memory", "Patch a memory by id (only given fields change; tags replace).",
            schema(json!({"id": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"},
                "project_id": {"type": ["string", "null"]}, "memory_type": {"type": "string"}, "priority": priority_prop,
                "source": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}}), &["id"])),
        t("simplememory_delete_memory", "Delete a memory by id.",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        // ---- write: rules ----
        t("simplememory_add_rule", "Add a rule (project-scoped or global when project_id omitted).",
            schema(json!({"title": {"type": "string"}, "content": {"type": "string"}, "project_id": {"type": "string"},
                "priority": priority_prop, "enabled": {"type": "boolean"}}), &["title"])),
        t("simplememory_update_rule", "Replace a rule by id.",
            schema(json!({"id": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"},
                "priority": priority_prop, "enabled": {"type": "boolean"}}), &["id", "title"])),
        t("simplememory_delete_rule", "Delete a rule by id.",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        // ---- write: skills ----
        t("simplememory_add_skill", "Add a reusable skill.",
            schema(json!({"name": {"type": "string"}, "description": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}), &["name"])),
        t("simplememory_update_skill", "Replace a skill by id.",
            schema(json!({"id": {"type": "string"}, "name": {"type": "string"}, "description": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}), &["id", "name"])),
        t("simplememory_delete_skill", "Delete a skill by id.",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        // ---- write: personal ----
        t("simplememory_add_personal", "Store a personal entry (stays local).",
            schema(json!({"key": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"}}), &["key", "title"])),
        t("simplememory_update_personal", "Replace a personal entry by id.",
            schema(json!({"id": {"type": "string"}, "key": {"type": "string"}, "title": {"type": "string"}, "content": {"type": "string"}}), &["id", "key", "title"])),
        t("simplememory_delete_personal", "Delete a personal entry by id.",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        // ---- write: links ----
        t("simplememory_link", "Create a relation between two entities (e.g. project uses skill).",
            schema(json!({"source_id": {"type": "string"}, "source_type": {"type": "string"},
                "target_id": {"type": "string"}, "target_type": {"type": "string"},
                "relationship": {"type": "string"}, "weight": {"type": "number"}}),
                &["source_id", "source_type", "target_id", "target_type"])),
        t("simplememory_unlink", "Delete a relation by id.",
            schema(json!({"id": {"type": "string"}}), &["id"])),
        t("simplememory_scan_project", "Read agent instruction files (AGENTS.md, CLAUDE.md, Cursor rules…) from the project's local folder into memories.",
            schema(json!({"project": project_prop}), &["project"])),
    ])
}

// ---------- argument helpers ----------

fn s(args: &Value, key: &str) -> Option<String> {
    args.get(key)?.as_str().map(|v| v.to_string())
}

fn req(args: &Value, key: &str) -> Result<String, String> {
    s(args, key)
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| format!("missing required argument: {}", key))
}

fn opt_str(args: &Value, key: &str) -> Option<String> {
    s(args, key).filter(|v| !v.is_empty())
}

fn opt_int(args: &Value, key: &str) -> Option<i64> {
    args.get(key)?.as_i64()
}

fn opt_bool(args: &Value, key: &str) -> Option<bool> {
    args.get(key)?.as_bool()
}

fn opt_tags(args: &Value) -> Option<Vec<String>> {
    args.get("tags")?.as_array().map(|a| {
        a.iter().filter_map(|v| v.as_str().map(|x| x.to_string())).collect()
    })
}

fn str_vec(v: &Value) -> Option<Vec<String>> {
    v.as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
}

// ---------- dispatch ----------

fn handle_call(conn: &Connection, name: &str, args: &Value) -> Result<Value, String> {
    let args = if args.is_null() { &Value::Null } else { args };
    match name {
        "simplememory_search" => {
            let p = search::SearchParams {
                query: req(args, "query")?,
                entity_types: args.get("entity_types").and_then(str_vec),
                project_id: opt_str(args, "project_id"),
                limit: opt_int(args, "limit").unwrap_or(30).clamp(1, 100),
                offset: opt_int(args, "offset").unwrap_or(0).max(0),
            };
            let (items, total) = search::search_hybrid(conn, &p, &[]).map_err(|e| e.to_string())?;
            Ok(text_result(json!({"results": items, "total": total})))
        }
        "simplememory_get_project" => {
            let q = req(args, "project")?;
            let found = repos::get_project(conn, &q)
                .map_err(|e| e.to_string())?
                .or_else(|| {
                    let mut stmt = conn
                        .prepare("SELECT id, name, description, path, created_at, updated_at FROM projects WHERE name = ?1")
                        .ok()?;
                    stmt.query_row([&q], |r| {
                        Ok(models::Project {
                            id: r.get(0)?, name: r.get(1)?, description: r.get(2)?, path: r.get(3)?,
                            created_at: r.get(4)?, updated_at: r.get(5)?,
                        })
                    })
                    .ok()
                });
            found.map(|p| text_result(json!(p))).ok_or_else(|| format!("project '{}' not found", q))
        }
        "simplememory_get_project_context" => {
            let opts = context::ContextOptions {
                project: req(args, "project")?,
                query: s(args, "query").unwrap_or_default(),
                max_results: opt_int(args, "max_results").unwrap_or(10),
                max_tokens: opt_int(args, "max_tokens").unwrap_or(4000),
            };
            let ctx = context::build_project_context(conn, &opts).map_err(|e| e.to_string())?;
            Ok(text_result(json!(ctx)))
        }
        "simplememory_get_rules" => {
            let page = repos::list_rules(conn, opt_str(args, "project_id"), opt_int(args, "limit"), Some(0))
                .map_err(|e| e.to_string())?;
            Ok(text_result(json!(page)))
        }
        "simplememory_get_memories" => {
            let page = repos::list_memories(
                conn, opt_str(args, "project_id"), opt_str(args, "memory_type"),
                opt_str(args, "priority"), opt_str(args, "query"), opt_int(args, "limit"), Some(0),
            )?;
            Ok(text_result(json!(page)))
        }
        "simplememory_get_skills" => {
            let page = repos::list_skills(conn, opt_str(args, "query"), opt_str(args, "category"), Some(100), Some(0))
                .map_err(|e| e.to_string())?;
            Ok(text_result(json!(page)))
        }
        "simplememory_get_personal_context" => {
            let p = search::SearchParams {
                query: req(args, "query")?,
                entity_types: Some(vec!["personal".to_string()]),
                project_id: None, limit: 5, offset: 0,
            };
            let (items, _) = search::search_hybrid(conn, &p, &[]).map_err(|e| e.to_string())?;
            Ok(text_result(json!({"results": items})))
        }
        "simplememory_get_graph" => {
            let f = graph::GraphFilter {
                entity_types: args.get("entity_types").and_then(str_vec),
                project_id: opt_str(args, "project_id"),
                limit: opt_int(args, "limit").unwrap_or(300),
            };
            let g = graph::get_graph(conn, &f).map_err(|e| e.to_string())?;
            Ok(text_result(json!(g)))
        }
        "simplememory_add_project" => {
            let p = repos::create_project(conn, models::NewProject {
                name: req(args, "name")?, description: s(args, "description"), path: opt_str(args, "path"),
            })?;
            Ok(text_result(json!(p)))
        }
        "simplememory_update_project" => {
            let p = repos::update_project(conn, &req(args, "id")?, models::NewProject {
                name: req(args, "name")?, description: s(args, "description"), path: opt_str(args, "path"),
            })?;
            Ok(text_result(json!(p)))
        }
        "simplememory_delete_project" => {
            repos::delete_project(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_add_memory" => {
            let m = repos::create_memory(conn, models::NewMemory {
                project_id: opt_str(args, "project_id"),
                title: req(args, "title")?,
                content: s(args, "content").unwrap_or_default(),
                memory_type: opt_str(args, "memory_type"),
                priority: opt_str(args, "priority"),
                source: Some(s(args, "source").unwrap_or_else(|| "mcp".to_string())),
                tags: opt_tags(args),
            })?;
            Ok(text_result(json!(m)))
        }
        "simplememory_update_memory" => {
            let project_id = match args.get("project_id") {
                None => None,
                Some(Value::Null) => Some(None),
                Some(v) => Some(v.as_str().map(|x| x.to_string())),
            };
            let m = repos::update_memory(conn, &req(args, "id")?, models::UpdateMemory {
                title: opt_str(args, "title"),
                content: opt_str(args, "content"),
                project_id,
                memory_type: opt_str(args, "memory_type"),
                priority: opt_str(args, "priority"),
                source: opt_str(args, "source"),
                tags: opt_tags(args),
            })?;
            Ok(text_result(json!(m)))
        }
        "simplememory_delete_memory" => {
            repos::delete_memory(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_add_rule" => {
            let r = repos::create_rule(conn, models::NewRule {
                project_id: opt_str(args, "project_id"),
                title: req(args, "title")?,
                content: s(args, "content").unwrap_or_default(),
                priority: opt_str(args, "priority"),
                enabled: opt_bool(args, "enabled"),
            })?;
            Ok(text_result(json!(r)))
        }
        "simplememory_update_rule" => {
            let r = repos::update_rule(conn, &req(args, "id")?, models::NewRule {
                project_id: opt_str(args, "project_id"),
                title: req(args, "title")?,
                content: s(args, "content").unwrap_or_default(),
                priority: opt_str(args, "priority"),
                enabled: opt_bool(args, "enabled"),
            })?;
            Ok(text_result(json!(r)))
        }
        "simplememory_delete_rule" => {
            repos::delete_rule(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_add_skill" => {
            let sk = repos::create_skill(conn, models::NewSkill {
                name: req(args, "name")?,
                description: s(args, "description"),
                content: s(args, "content"),
                category: opt_str(args, "category"),
                icon: opt_str(args, "icon"),
            })?;
            Ok(text_result(json!(sk)))
        }
        "simplememory_update_skill" => {
            let sk = repos::update_skill(conn, &req(args, "id")?, models::NewSkill {
                name: req(args, "name")?,
                description: s(args, "description"),
                content: s(args, "content"),
                category: opt_str(args, "category"),
                icon: opt_str(args, "icon"),
            })?;
            Ok(text_result(json!(sk)))
        }
        "simplememory_delete_skill" => {
            repos::delete_skill(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_add_personal" => {
            let p = repos::create_personal(conn, models::NewPersonalInfo {
                key: req(args, "key")?,
                title: req(args, "title")?,
                content: s(args, "content").unwrap_or_default(),
            })?;
            Ok(text_result(json!(p)))
        }
        "simplememory_update_personal" => {
            let p = repos::update_personal(conn, &req(args, "id")?, models::NewPersonalInfo {
                key: req(args, "key")?,
                title: req(args, "title")?,
                content: s(args, "content").unwrap_or_default(),
            })?;
            Ok(text_result(json!(p)))
        }
        "simplememory_delete_personal" => {
            repos::delete_personal(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_link" => {
            let c = repos::create_connection(conn, models::NewConnection {
                source_id: req(args, "source_id")?,
                source_type: req(args, "source_type")?,
                target_id: req(args, "target_id")?,
                target_type: req(args, "target_type")?,
                relationship: opt_str(args, "relationship"),
                weight: args.get("weight").and_then(|v| v.as_f64()),
            })?;
            Ok(text_result(json!(c)))
        }
        "simplememory_unlink" => {
            repos::delete_connection(conn, &req(args, "id")?)?;
            Ok(text_result(json!({"deleted": true})))
        }
        "simplememory_scan_project" => {
            let q = req(args, "project")?;
            let id = match repos::get_project(conn, &q).map_err(|e| e.to_string())? {
                Some(p) => p.id,
                None => {
                    let mut stmt = conn
                        .prepare("SELECT id FROM projects WHERE name = ?1")
                        .map_err(|e| e.to_string())?;
                    stmt.query_row([&q], |r| r.get::<_, String>(0))
                        .map_err(|_| format!("project '{}' not found", q))?
                }
            };
            let r = repos::scan_project_files(conn, &id)?;
            Ok(text_result(json!(r)))
        }
        other => Err(format!("unknown tool: {}", other)),
    }
}

fn handle_message(conn: &Connection, msg: &Value) -> Option<Value> {
    let method = msg.get("method")?.as_str()?;
    // Notifications carry no id and get no response.
    let id = msg.get("id").cloned().unwrap_or(Value::Null);
    let is_notification = msg.get("id").is_none();
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    let result = match method {
        "initialize" => Some(ok(&id, json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "simplememory-mcp", "version": VERSION}
        }))),
        "ping" => Some(ok(&id, json!({}))),
        "tools/list" => Some(ok(&id, json!({"tools": tools_list()}))),
        "tools/call" => {
            let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(Value::Null);
            Some(match handle_call(conn, name, &args) {
                Ok(v) => ok(&id, v),
                Err(e) => ok(&id, text_error(e)),
            })
        }
        _ if method.starts_with("notifications/") => None,
        _ => Some(fail(&id, -32601, format!("method not found: {}", method))),
    };
    if is_notification {
        None
    } else {
        result
    }
}

fn main() {
    let path = db_path();
    let mut conn = db::open_db(&path).expect("cannot open Contexa database");
    db::run_migrations(&mut conn).expect("migrations failed");

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&line) {
            Ok(m) => m,
            Err(e) => {
                let _ = writeln!(out, "{}", json!({"jsonrpc": "2.0", "id": null,
                    "error": {"code": -32700, "message": format!("parse error: {}", e)}}));
                let _ = out.flush();
                continue;
            }
        };
        if let Some(resp) = handle_message(&conn, &msg) {
            let _ = writeln!(out, "{}", serde_json::to_string(&resp).unwrap_or_default());
            let _ = out.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    fn test_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        db::run_migrations(&mut conn).unwrap();
        db::seed_dev_data(&mut conn).unwrap();
        conn
    }

    #[test]
    fn tools_list_covers_read_and_write() {
        let names: Vec<String> = tools_list()
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap().to_string())
            .collect();
        for must in [
            "simplememory_search",
            "simplememory_get_project_context",
            "simplememory_add_memory",
            "simplememory_update_memory",
            "simplememory_delete_memory",
            "simplememory_add_rule",
            "simplememory_add_skill",
            "simplememory_add_project",
            "simplememory_add_personal",
            "simplememory_link",
            "simplememory_unlink",
        ] {
            assert!(names.contains(&must.to_string()), "missing tool {}", must);
        }
    }

    #[test]
    fn mcp_add_then_search_then_delete_memory() {
        let conn = test_conn();
        let added = handle_call(
            &conn,
            "simplememory_add_memory",
            &json!({"title": "MCP roundtrip probe", "content": "written by the mcp test", "priority": "high"}),
        )
        .unwrap();
        let text = added["content"][0]["text"].as_str().unwrap();
        let id = serde_json::from_str::<Value>(text).unwrap()["id"].as_str().unwrap().to_string();

        let found = handle_call(&conn, "simplememory_search", &json!({"query": "MCP roundtrip probe"})).unwrap();
        assert!(found["content"][0]["text"].as_str().unwrap().contains("MCP roundtrip probe"));

        let patched = handle_call(
            &conn, "simplememory_update_memory",
            &json!({"id": id, "priority": "low"}),
        )
        .unwrap();
        let ptext = patched["content"][0]["text"].as_str().unwrap();
        assert!(serde_json::from_str::<Value>(ptext).unwrap()["priority"] == "low");

        handle_call(&conn, "simplememory_delete_memory", &json!({"id": id})).unwrap();
        let n: i64 = conn
            .query_row("SELECT COUNT(*) FROM memories WHERE id = ?1", params![id], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn mcp_unknown_tool_and_bad_method() {
        let conn = test_conn();
        assert!(handle_call(&conn, "nope", &json!({})).is_err());
        let resp = handle_message(&conn, &json!({"jsonrpc": "2.0", "id": 1, "method": "bogus", "params": {}})).unwrap();
        assert_eq!(resp["error"]["code"], -32601);
        // Notifications get no response.
        assert!(handle_message(&conn, &json!({"jsonrpc": "2.0", "method": "notifications/initialized"})).is_none());
    }

    #[test]
    fn mcp_context_tool_returns_markdown() {
        let conn = test_conn();
        let out = handle_call(
            &conn, "simplememory_get_project_context",
            &json!({"project": "Axiom", "query": "auth", "max_results": 5}),
        )
        .unwrap();
        let text = out["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("Critical Rules"));
    }
}
