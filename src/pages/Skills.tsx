import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Wrench, Plus, Trash2, Search, Folder, FolderOpen, ChevronDown, LayoutTemplate, Link2 } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, debounce, timeAgo, truncate } from "../lib/utils";
import { EmptyState, ListSkeleton } from "../components/Modal";
import { SKILL_TEMPLATES, type SkillTemplate } from "../lib/templates";
import { useContexaChanged } from "../lib/hooks";
import { SkillIcon } from "../components/SkillIcon";
import type { Skill } from "../types";

export function Skills() {
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [items, setItems] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const addTemplate = async (t: SkillTemplate) => {
    try {
      await api.skills.create({ name: t.name, description: t.description, content: t.content, category: t.category });
      toast("success", `Skill "${t.name}" added`);
      refreshStats();
      load(query);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Add failed");
    }
  };

  const importFromUrl = async () => {
    const url = importUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setImportMsg("Paste an https:// URL to a raw markdown file.");
      return;
    }
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 200_000) throw new Error("File too large (200 KB cap).");
      if (!text.trim()) throw new Error("File is empty.");
      const name = decodeURIComponent(url.split("?")[0].split("/").pop() || "imported-skill")
        .replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim() || "imported-skill";
      await api.skills.create({ name, description: `Imported from ${url}`, content: text });
      toast("success", `Skill "${name}" imported`);
      refreshStats();
      setImportUrl("");
      load(query);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  const load = useCallback(async (q: string) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const page = await api.skills.list(q.trim() || null, null, 200, 0);
      if (seq.current !== id) return;
      setItems(page.items);
    } catch (e) {
      if (seq.current !== id) return;
      toast("error", e instanceof Error ? e.message : "Failed to load skills");
    } finally {
      if (seq.current === id) setLoading(false);
    }
  }, [toast]);

  const debouncedLoad = useMemo(() => debounce((q: string) => load(q), 300), [load]);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => () => debouncedLoad.cancel(), [debouncedLoad]);

  const reload = useCallback(() => load(query), [load, query]);
  useContexaChanged(reload);

  const onQuery = (q: string) => {
    setQuery(q);
    debouncedLoad(q);
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
        <button className="btn" onClick={() => setShowTemplates((v) => !v)}>
          <LayoutTemplate size={14} /> Templates
        </button>
        <button className="btn" onClick={() => setShowImport((v) => !v)}>
          <Link2 size={14} /> From URL
        </button>
        <button className="btn primary" onClick={() => setComposer({ kind: "skill" })}>
          <Plus /> New Skill
        </button>
      </div>
      {showTemplates && (
        <div className="list" style={{ marginBottom: 12 }}>
          {SKILL_TEMPLATES.map((t) => (
            <div key={t.name} className="row" style={{ cursor: "default" }}>
              <div className="row-main">
                <div className="row-title">{t.name}</div>
                <div className="row-sub">{t.description}</div>
              </div>
              <div className="row-meta">
                <button className="btn sm" style={{ opacity: 1 }} onClick={() => addTemplate(t)}>
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showImport && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="search-input" style={{ flex: 1 }}>
              <Link2 size={14} />
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/…/SKILL.md"
                aria-label="Skill file URL"
              />
            </div>
            <button className="btn primary sm" disabled={importing} onClick={importFromUrl}>
              {importing ? "Importing…" : "Import"}
            </button>
          </div>
          {importMsg && <div className="mono-dim" style={{ marginTop: 8 }}>{importMsg}</div>}
        </div>
      )}
      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
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
