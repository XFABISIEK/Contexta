import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wrench, Plus, Trash2, Search, Folder, FolderOpen, ChevronDown } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, debounce, timeAgo, truncate } from "../lib/utils";
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
    window.addEventListener("contexa:changed", onChange);
    return () => window.removeEventListener("contexa:changed", onChange);
  }, [load, query]);

  const onQuery = (q: string) => {
    setQuery(q);
    debounce(() => load(q), 300)();
  };

  const groups = useMemo(() => {
    const map = new Map<string, Skill[]>();
    for (const s of items) {
      const cat = s.category.trim().toLowerCase() || "general";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

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

  const searching = query.trim().length > 0;

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
        <div className="folder-list">
          {groups.map(([cat, skills]) => {
            const closed = !searching && collapsed.has(cat);
            return (
              <div key={cat} className="folder">
                <button
                  type="button"
                  className="folder-head"
                  aria-expanded={!closed}
                  onClick={() => toggle(cat)}
                >
                  {closed ? <Folder size={14} /> : <FolderOpen size={14} />}
                  <span className="folder-name">{cat}</span>
                  <span className="badge">{skills.length}</span>
                  <ChevronDown size={13} className={cx("side-chevron", !closed && "open")} />
                </button>
                <AnimatePresence initial={false}>
                  {!closed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="list folder-body">
                        {skills.map((s) => (
                          <div key={s.id} className="row" onClick={() => setComposer({ kind: "skill", editId: s.id })}>
                            <div className="row-icon"><SkillIcon name={s.name} icon={s.icon} /></div>
                            <div className="row-main">
                              <div className="row-title">{s.name}</div>
                              <div className="row-sub">{truncate(s.description, 120) || "—"}</div>
                            </div>
                            <div className="row-meta">
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
