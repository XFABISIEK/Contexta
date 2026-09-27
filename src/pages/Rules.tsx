import { useCallback, useEffect, useState } from "react";
import { ScrollText, Plus, Trash2, Power } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import { Select } from "../components/Select";
import type { Project, Rule } from "../types";

export function Rules() {
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [items, setItems] = useState<Rule[]>([]);
  const [projectId, setProjectId] = useState("all");
  const [projects, setProjects] = useState<Project[]>([]);

  const load = useCallback(async (pid: string) => {
    try {
      const page = await api.rules.list(pid === "all" ? null : pid, 200, 0);
      setItems(page.items);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load rules");
    }
  }, [toast]);

  useEffect(() => {
    api.projects.list(undefined, 200, 0).then((p) => setProjects(p.items)).catch(() => {});
  }, []);

  useEffect(() => {
    load(projectId);
  }, [projectId, load]);

  useEffect(() => {
    const onChange = () => load(projectId);
    window.addEventListener("contexa:changed", onChange);
    return () => window.removeEventListener("contexa:changed", onChange);
  }, [load, projectId]);

  const toggle = async (r: Rule) => {
    try {
      await api.rules.update(r.id, {
        project_id: r.project_id,
        title: r.title,
        content: r.content,
        priority: r.priority,
        enabled: !r.enabled,
      });
      load(projectId);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = (r: Rule) => {
    askDelete(`Delete rule "${r.title}"?`, undefined, async () => {
      try {
        await api.rules.remove(r.id);
        toast("success", "Rule deleted");
        refreshStats();
        load(projectId);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Rules</h1>
        <div className="sub">Critical rules are always included in AI project context.</div>
      </div>
      <div className="toolbar">
        <Select
          label="Project filter"
          value={projectId}
          onChange={setProjectId}
          options={[{ value: "all", label: "All projects + global" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <button className="btn primary" onClick={() => setComposer({ kind: "rule", projectId: projectId === "all" ? null : projectId })}>
          <Plus /> New Rule
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No rules found."
          hint="Rules steer AI behavior per project."
          action={
            <button className="btn primary sm" onClick={() => setComposer({ kind: "rule" })}>
              <Plus /> New rule
            </button>
          }
        />
      ) : (
        <div className="list">
          {items.map((r) => (
            <div key={r.id} className="row" onClick={() => setComposer({ kind: "rule", editId: r.id })}>
              <div className="row-icon"><ScrollText /></div>
              <div className="row-main">
                <div className="row-title">{r.title}</div>
                <div className="row-sub">{truncate(r.content, 120)}</div>
              </div>
              <div className="row-meta">
                <span className={`badge ${r.enabled ? "b-on" : "b-off"}`}>{r.enabled ? "on" : "off"}</span>
                <span className={`badge b-${r.priority}`}>{r.priority}</span>
                <span className="row-time">{timeAgo(r.updated_at)}</span>
                <span className="row-actions">
                  <button className="icon-btn" title={r.enabled ? "Disable" : "Enable"} onClick={(e) => { e.stopPropagation(); toggle(r); }}>
                    <Power />
                  </button>
                  <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(r); }}>
                    <Trash2 />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
