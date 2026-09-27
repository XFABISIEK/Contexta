import { useCallback, useEffect, useState } from "react";
import { Wrench, Plus, Trash2, Search } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { debounce, timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import { SkillIcon } from "../components/SkillIcon";
import type { Skill } from "../types";

export function Skills() {
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [items, setItems] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async (q: string) => {
    try {
      const page = await api.skills.list(q.trim() || null, null, 200, 0);
      setItems(page.items);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load skills");
    }
  }, [toast]);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const onChange = () => load(query);
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load, query]);

  const onQuery = (q: string) => {
    setQuery(q);
    debounce(() => load(q), 300)();
  };

  const remove = (s: Skill) => {
    askDelete(`Delete skill "${s.name}"?`, undefined, async () => {
      try {
        await api.skills.remove(s.id);
        toast("success", "Skill deleted");
        refreshStats();
        load(query);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Skills</h1>
        <div className="sub">Reusable capabilities attached to AI context.</div>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search skills..." aria-label="Search skills" />
        </div>
        <button className="btn primary" onClick={() => setComposer({ kind: "skill" })}>
          <Plus /> New Skill
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No skills found."
          hint="Skills bundle know-how AI can reuse."
          action={
            <button className="btn primary sm" onClick={() => setComposer({ kind: "skill" })}>
              <Plus /> New skill
            </button>
          }
        />
      ) : (
        <div className="list">
          {items.map((s) => (
            <div key={s.id} className="row" onClick={() => setComposer({ kind: "skill", editId: s.id })}>
              <div className="row-icon"><SkillIcon name={s.name} icon={s.icon} /></div>
              <div className="row-main">
                <div className="row-title">{s.name}</div>
                <div className="row-sub">{truncate(s.description, 120) || "—"}</div>
              </div>
              <div className="row-meta">
                <span className="badge b-type">{s.category}</span>
                <span className="row-time">{timeAgo(s.updated_at)}</span>
                <span className="row-actions">
                  <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(s); }}>
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
