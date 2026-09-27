import { useCallback, useEffect, useState } from "react";
import { Brain, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { debounce, timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import { Select } from "../components/Select";
import type { Memory, Project } from "../types";

const PAGE_SIZE = 30;

export function Memories() {
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [items, setItems] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [memoryType, setMemoryType] = useState("all");
  const [priority, setPriority] = useState("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (o: number, q: string, pid: string, mt: string, pr: string) => {
      setLoading(true);
      try {
        const page = await api.memories.list({
          projectId: pid === "all" ? null : pid,
          memoryType: mt === "all" ? null : mt,
          priority: pr === "all" ? null : pr,
          query: q.trim() || null,
          limit: PAGE_SIZE,
          offset: o,
        });
        setItems(page.items);
        setTotal(page.total);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Failed to load memories");
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  const debounced = useCallback(
    (fn: () => void) => debounce(fn, 300)(),
    [],
  );

  useEffect(() => {
    api.projects.list(undefined, 200, 0).then((p) => setProjects(p.items)).catch(() => {});
  }, []);

  useEffect(() => {
    load(offset, query, projectId, memoryType, priority);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, projectId, memoryType, priority]);

  useEffect(() => {
    const onChange = () => load(offset, query, projectId, memoryType, priority);
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load, offset, query, projectId, memoryType, priority]);

  const onQuery = (q: string) => {
    setQuery(q);
    setOffset(0);
    debounced(() => load(0, q, projectId, memoryType, priority));
  };

  const remove = (m: Memory) => {
    askDelete(`Delete memory "${m.title}"?`, undefined, async () => {
      try {
        await api.memories.remove(m.id);
        toast("success", "Memory deleted");
        refreshStats();
        load(offset, query, projectId, memoryType, priority);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Memories</h1>
        <div className="sub">Full-text search over titles and content (SQLite FTS5).</div>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Search />
          <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search memories..." aria-label="Search memories" />
        </div>
        <Select
          label="Project filter"
          value={projectId}
          onChange={(v) => { setProjectId(v); setOffset(0); }}
          options={[{ value: "all", label: "All projects" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <Select
          label="Type filter"
          value={memoryType}
          onChange={(v) => { setMemoryType(v); setOffset(0); }}
          options={[{ value: "all", label: "All types" }, ...["fact", "decision", "note", "reference", "todo"].map((t) => ({ value: t, label: t }))]}
        />
        <Select
          label="Priority filter"
          value={priority}
          onChange={(v) => { setPriority(v); setOffset(0); }}
          options={[{ value: "all", label: "All priorities" }, ...["critical", "high", "normal", "low"].map((p) => ({ value: p, label: p }))]}
        />
        <button className="btn primary" onClick={() => setComposer({ kind: "memory" })}>
          <Plus /> New
        </button>
      </div>

      {loading ? (
        <>
          <div className="skeleton" style={{ height: 46, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 46, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 46 }} />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No memories found."
          hint="Adjust filters or create a new memory."
          action={
            <button className="btn primary sm" onClick={() => setComposer({ kind: "memory" })}>
              <Plus /> New memory
            </button>
          }
        />
      ) : (
        <>
          <div className="list">
            {items.map((m) => (
              <div key={m.id} className="row" onClick={() => setComposer({ kind: "memory", editId: m.id })}>
                <div className="row-icon"><Brain /></div>
                <div className="row-main">
                  <div className="row-title">{m.title}</div>
                  <div className="row-sub">{truncate(m.content, 120) || "—"}</div>
                </div>
                <div className="row-meta">
                  <span className={`badge b-${m.priority}`}>{m.priority}</span>
                  <span className="badge b-type">{m.memory_type}</span>
                  <span className="row-time">{timeAgo(m.updated_at)}</span>
                  <span className="row-actions">
                    <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); setComposer({ kind: "memory", editId: m.id }); }}>
                      <Pencil />
                    </button>
                    <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(m); }}>
                      <Trash2 />
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="pagination">
            <button className="btn sm ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              <ChevronLeft /> Prev
            </button>
            <span>{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
            <button className="btn sm ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next <ChevronRight />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
