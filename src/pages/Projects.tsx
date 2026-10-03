import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderTree,
  FileText,
  FileSearch,
  Search,
  Copy,
  Plus,
  Pencil,
  Trash2,
  Brain,
  ScrollText,
  Wrench,
  Link2,
  Unlink,
  LayoutDashboard,
  Network,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, debounce, formatBytes, timeAgo, truncate } from "../lib/utils";
import { EmptyState, ListSkeleton, Modal } from "../components/Modal";
import { useContexaChanged } from "../lib/hooks";
import { Select } from "../components/Select";
import type { Connection, FileEntry, GrepHit, Memory, Project, Rule, Skill } from "../types";
import { SkillIcon } from "../components/SkillIcon";

const GraphViewLazy = lazy(() =>
  import("./GraphView").then((m) => ({ default: m.GraphView })),
);

type Tab = "overview" | "memories" | "rules" | "files" | "graph";

const TABS: Array<{ id: Tab; label: string; icon: typeof Folder }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "rules", label: "Rules", icon: ScrollText },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "graph", label: "Graph", icon: Network },
];

export function Projects() {
  const selectedId = useApp((s) => s.selectedProjectId);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const queryRef = useRef("");
  queryRef.current = query;

  const load = useCallback(async (q?: string) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const needle = (q ?? queryRef.current).trim() || undefined;
      const p = await api.projects.list(needle, 100, 0);
      if (seq.current !== id) return;
      setProjects(p.items);
    } catch (e) {
      if (seq.current !== id) return;
      toast("error", e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      if (seq.current === id) setLoading(false);
    }
  }, [toast]);

  const debouncedLoad = useMemo(() => debounce((q: string) => load(q), 250), [load]);

  useEffect(() => () => debouncedLoad.cancel(), [debouncedLoad]);

  useEffect(() => {
    if (!selectedId) load(queryRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const reloadList = useCallback(() => load(queryRef.current), [load]);
  useContexaChanged(reloadList);

  if (selectedId) {
    return <ProjectDetail id={selectedId} onBack={() => go("projects", null)} />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Projects</h1>
        <div className="sub">Group memories, rules and skills per project.</div>
      </div>
      <div className="toolbar">
        <div className="search-input">
          <Folder />
          <input value={query} onChange={(e) => { setQuery(e.target.value); debouncedLoad(e.target.value); }} placeholder="Filter projects..." aria-label="Filter projects" />
        </div>
        <button className="btn primary" onClick={() => setComposer({ kind: "project" })}>
          <Plus /> New Project
        </button>
      </div>
      {loading ? (
        <ListSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No projects found."
          hint="Create your first project to organize memory."
          action={
            <button className="btn primary sm" onClick={() => setComposer({ kind: "project" })}>
              <Plus /> New project
            </button>
          }
        />
      ) : (
        <div className="list">
          {projects.map((p) => (
            <div key={p.id} className={cx("row", p.id === selectedId && "selected")} onClick={() => go("projects", p.id)}>
              <div className="row-icon"><Folder /></div>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{truncate(p.description, 120) || "—"}</div>
              </div>
              <div className="row-meta">
                <span className="row-time">{timeAgo(p.updated_at)}</span>
                <span className="row-actions">
                  <button
                    className="icon-btn"
                    title="Edit"
                    onClick={(e) => { e.stopPropagation(); setComposer({ kind: "project", editId: p.id }); }}
                  >
                    <Pencil />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      askDelete(`Delete project "${p.name}"?`, "Memories become unassigned, rules are removed.", async () => {
                        try {
                          await api.projects.remove(p.id);
                          toast("success", "Project deleted");
                          refreshStats();
                          load();
                        } catch (err) {
                          toast("error", err instanceof Error ? err.message : "Delete failed");
                        }
                      });
                    }}
                  >
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

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const setComposer = useApp((s) => s.setComposer);
  const toast = useApp((s) => s.toast);
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memTotal, setMemTotal] = useState(0);
  const [rules, setRules] = useState<Rule[]>([]);
  const [linkedSkills, setLinkedSkills] = useState<Skill[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [linkId, setLinkId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [copyingCtx, setCopyingCtx] = useState(false);
  const [ctxMsg, setCtxMsg] = useState("");

  const copyContext = async () => {
    if (!project) return;
    setCopyingCtx(true);
    setCtxMsg("");
    try {
      const ctx = await api.context(project.name, "", 10, 4000);
      await navigator.clipboard.writeText(ctx.markdown);
      setCtxMsg(`${ctx.rules.length} rules · ${ctx.memories.length} memories · ${ctx.skills.length} skills copied`);
      toast("success", "Project context copied");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Copy failed");
    } finally {
      setCopyingCtx(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [p, mem, rul, conns, sk] = await Promise.all([
        api.projects.get(id),
        api.memories.list({ projectId: id, limit: 8, offset: 0 }),
        api.rules.list(id, 20, 0),
        api.connections.list(id, 100, 0),
        api.skills.list(null, null, 200, 0),
      ]);
      setProject(p);
      setMemories(mem.items);
      setMemTotal(mem.total);
      setRules(rul.items);
      setConnections(conns.items);
      setAllSkills(sk.items);
      const skillIds = new Set(
        conns.items.filter((c) => c.target_type === "skill").map((c) => c.target_id),
      );
      setLinkedSkills(sk.items.filter((s) => skillIds.has(s.id)));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load project");
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useContexaChanged(load);

  const linkSkill = async () => {
    if (!linkId) return;
    try {
      await api.connections.create({
        source_id: id,
        source_type: "project",
        target_id: linkId,
        target_type: "skill",
        relationship: "uses",
        weight: 1,
      });
      setLinkId("");
      toast("success", "Skill linked");
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Link failed");
    }
  };

  const scanFiles = async () => {
    setScanning(true);
    setScanMsg("");
    try {
      const r = await api.scanProject(id);
      setScanMsg(`Scanned ${r.scanned} files — imported ${r.imported}, skipped ${r.skipped}.`);
      toast("success", `Imported ${r.imported} AI context files`);
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const unlinkSkill = async (skillId: string) => {
    const edge = connections.find((c) => c.target_id === skillId && c.target_type === "skill");
    if (!edge) return;
    try {
      await api.connections.remove(edge.id);
      toast("success", "Skill unlinked");
      load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Unlink failed");
    }
  };

  if (!project) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 14, width: 400 }} />
      </div>
    );
  }

  const critical = rules.filter((r) => r.priority === "critical" && r.enabled);

  return (
    <div className="page">
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 10 }}>
        <ArrowLeft /> Projects
      </button>
      <div className="page-head">
        <h1>{project.name}</h1>
        <div className="sub">{project.description || "No description."}</div>
        {project.path ? (
          <div className="sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <FolderGit2 size={12} />
            <span className="code">{project.path}</span>
            <button
              className="icon-btn"
              title="Copy path"
              style={{ width: 20, height: 20 }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(project.path);
                  toast("success", "Path copied");
                } catch {
                  toast("error", "Clipboard unavailable");
                }
              }}
            >
              <Copy size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="stat-card">
              <div className="stat-label"><Brain /> Memories</div>
              <div className="stat-value">{memTotal}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><ScrollText /> Rules</div>
              <div className="stat-value">{rules.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label"><Wrench /> Skills</div>
              <div className="stat-value">{linkedSkills.length}</div>
            </div>
          </div>

          <div className="section">
            <div className="section-head"><span className="section-title">AI context files</span></div>
            <div className="card">
              <p className="mono-dim" style={{ marginTop: 0 }}>
                Reads AGENTS.md, CLAUDE.md, MUSE.md, GEMINI.md, CODEX.md, .muserules, .cursorrules,
                .cursor/rules and skills/ from the project folder into reference memories.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn sm" onClick={scanFiles} disabled={scanning || !project.path}>
                  <FileSearch size={14} /> {scanning ? "Scanning…" : "Scan project folder"}
                </button>
                {!project.path && (
                  <span className="mono-dim">Set the project folder first (edit project → Local folder).</span>
                )}
                {scanMsg && <span className="mono-dim">{scanMsg}</span>}
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-head"><span className="section-title">Share context</span></div>
            <div className="card">
              <p className="mono-dim" style={{ marginTop: 0 }}>
                Copy this project's AI context (critical rules, ranked memories, skills) as Markdown.
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn sm" disabled={copyingCtx} onClick={copyContext}>
                  <Copy size={14} /> {copyingCtx ? "Building…" : "Copy context Markdown"}
                </button>
                {ctxMsg && <span className="mono-dim">{ctxMsg}</span>}
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-head"><span className="section-title">Recent memories</span></div>
            {memories.length === 0 ? (
              <div className="mono-dim">No memories in this project yet.</div>
            ) : (
              <div className="list">
                {memories.map((m) => (
                  <div key={m.id} className="row" onClick={() => setComposer({ kind: "memory", editId: m.id })}>
                    <div className="row-main">
                      <div className="row-title">{m.title}</div>
                      <div className="row-sub">{truncate(m.content, 110) || "—"}</div>
                    </div>
                    <div className="row-meta">
                      <span className={`badge b-${m.priority}`}>{m.priority}</span>
                      <span className="row-time">{timeAgo(m.updated_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-head"><span className="section-title">Critical rules</span></div>
            {critical.length === 0 ? (
              <div className="mono-dim">No critical rules. Critical rules are always included in AI context.</div>
            ) : (
              <div className="list">
                {critical.map((r) => (
                  <div key={r.id} className="row" onClick={() => setComposer({ kind: "rule", editId: r.id })}>
                    <div className="row-main">
                      <div className="row-title">{r.title}</div>
                      <div className="row-sub">{truncate(r.content, 110)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <div className="section-head"><span className="section-title">Connected skills</span></div>
            <div className="toolbar">
              <Select
                label="Skill to link"
                value={linkId}
                onChange={setLinkId}
                options={[{ value: "", label: "Link a skill…" }, ...allSkills.filter((s) => !linkedSkills.some((l) => l.id === s.id)).map((s) => ({ value: s.id, label: s.name }))]}
              />
              <button className="btn sm" onClick={linkSkill} disabled={!linkId}>
                <Link2 /> Link
              </button>
            </div>
            {linkedSkills.length === 0 ? (
              <div className="mono-dim">No skills linked to this project.</div>
            ) : (
              <div className="list">
                {linkedSkills.map((s) => (
                  <div key={s.id} className="row" onClick={() => setComposer({ kind: "skill", editId: s.id })}>
                    <div className="row-icon"><SkillIcon name={s.name} icon={s.icon} /></div>
                    <div className="row-main">
                      <div className="row-title">{s.name}</div>
                      <div className="row-sub">{truncate(s.description, 110)}</div>
                    </div>
                    <div className="row-meta">
                      <span className="row-actions">
                        <button
                          className="icon-btn"
                          title="Unlink"
                          onClick={(e) => { e.stopPropagation(); unlinkSkill(s.id); }}
                        >
                          <Unlink />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "memories" && (
        <>
          <div className="toolbar">
            <button className="btn primary sm" onClick={() => setComposer({ kind: "memory", projectId: id })}>
              <Plus /> New memory
            </button>
          </div>
          <div className="list">
            {memories.map((m) => (
              <div key={m.id} className="row" onClick={() => setComposer({ kind: "memory", editId: m.id })}>
                <div className="row-main">
                  <div className="row-title">{m.title}</div>
                  <div className="row-sub">{truncate(m.content, 110) || "—"}</div>
                </div>
                <div className="row-meta">
                  <span className={`badge b-${m.priority}`}>{m.priority}</span>
                  <span className="badge b-type">{m.memory_type}</span>
                </div>
              </div>
            ))}
          </div>
          {memories.length === 0 && <div className="mono-dim" style={{ marginTop: 8 }}>No memories yet.</div>}
        </>
      )}

      {tab === "rules" && (
        <>
          <div className="toolbar">
            <button className="btn primary sm" onClick={() => setComposer({ kind: "rule", projectId: id })}>
              <Plus /> New rule
            </button>
          </div>
          <div className="list">
            {rules.map((r) => (
              <div key={r.id} className="row" onClick={() => setComposer({ kind: "rule", editId: r.id })}>
                <div className="row-main">
                  <div className="row-title">{r.title}</div>
                  <div className="row-sub">{truncate(r.content, 110)}</div>
                </div>
                <div className="row-meta">
                  <span className={`badge ${r.enabled ? "b-on" : "b-off"}`}>{r.enabled ? "on" : "off"}</span>
                  <span className={`badge b-${r.priority}`}>{r.priority}</span>
                </div>
              </div>
            ))}
          </div>
          {rules.length === 0 && <div className="mono-dim" style={{ marginTop: 8 }}>No rules yet.</div>}
        </>
      )}

      {tab === "files" && (
        project.path ? (
          <FileExplorer key={id} projectId={id} />
        ) : (
          <div className="mono-dim">Set the project folder first (edit project - Local folder).</div>
        )
      )}

      {tab === "graph" && (
        <div style={{ height: 480, border: "1px solid var(--border-soft)", borderRadius: 6, overflow: "hidden" }}>
          <Suspense fallback={<div className="mono-dim" style={{ padding: 16 }}>Loading graph…</div>}>
            <GraphViewLazy projectId={id} />
          </Suspense>
        </div>
      )}
    </div>
  );
}


function FileExplorer({ projectId }: { projectId: string }) {
  const toast = useApp((s) => s.toast);
  const [tree, setTree] = useState<FileEntry[] | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<{ path: string; text: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState("");
  const [needle, setNeedle] = useState("");
  const [hits, setHits] = useState<GrepHit[] | null>(null);
  const [grepBusy, setGrepBusy] = useState(false);

  const runGrep = useCallback(async (q: string) => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    setGrepBusy(true);
    try {
      setHits(await api.files.grep(projectId, q.trim(), 50));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Search failed");
      setHits([]);
    } finally {
      setGrepBusy(false);
    }
  }, [projectId, toast]);
  const debouncedGrep = useMemo(() => debounce((q: string) => runGrep(q), 300), [runGrep]);
  useEffect(() => () => debouncedGrep.cancel(), [debouncedGrep]);

  useEffect(() => {
    setTree(null);
    api.files
      .list(projectId)
      .then(setTree)
      .catch((e) => {
        setTree([]);
        toast("error", e instanceof Error ? e.message : "Could not list files");
      });
  }, [projectId, toast]);

  const toggle = (path: string) => setOpen((o) => ({ ...o, [path]: !o[path] }));

  const openPreview = async (path: string) => {
    setPreviewLoading(path);
    try {
      const text = await api.files.read(projectId, path);
      setPreview({ path, text });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not preview file");
    } finally {
      setPreviewLoading("");
    }
  };

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(preview?.text ?? "");
      toast("success", "File content copied");
    } catch {
      toast("error", "Clipboard unavailable");
    }
  };

  const renderEntries = (entries: FileEntry[], depth: number) => (
    <>
      {entries.map((e) => (
        <div key={e.path}>
          <div
            className="file-row"
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => (e.is_dir ? toggle(e.path) : openPreview(e.path))}
            title={e.is_dir ? (open[e.path] ? "Collapse" : "Expand") : `${formatBytes(e.size)} - preview`}
          >
            {e.is_dir ? (
              open[e.path] ? <ChevronDown size={13} /> : <ChevronRight size={13} />
            ) : (
              <FileText size={13} />
            )}
            <span className="file-name">{e.name}</span>
            {!e.is_dir && <span className="file-meta">{formatBytes(e.size)}</span>}
            {previewLoading === e.path && <span className="mono-dim">...</span>}
          </div>
          {e.is_dir && open[e.path] && e.children && renderEntries(e.children, depth + 1)}
        </div>
      ))}
    </>
  );

  if (tree === null) {
    return (
      <>
        <ListSkeleton height={30} />
      </>
    );
  }
  if (tree.length === 0) {
    return <div className="mono-dim">Folder is empty or unavailable.</div>;
  }
  return (
    <>
      <div className="search-input" style={{ marginBottom: 8 }}>
        <Search size={14} />
        <input
          value={needle}
          onChange={(e) => { setNeedle(e.target.value); debouncedGrep(e.target.value); }}
          placeholder="Search in project files…"
          aria-label="Search in project files"
        />
      </div>
      {hits !== null && (
        <div className="list" style={{ marginBottom: 8 }}>
          {grepBusy ? (
            <ListSkeleton rows={2} height={34} />
          ) : hits.length === 0 ? (
            <div className="mono-dim" style={{ padding: 8 }}>No matches.</div>
          ) : (
            hits.map((h, i) => (
              <div key={`${h.file}:${h.line}:${i}`} className="row" onClick={() => openPreview(h.file)}>
                <div className="row-main">
                  <div className="row-title">{h.file}<span className="mono-dim">:{h.line}</span></div>
                  <div className="row-sub">{h.text || "—"}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      <div className="file-tree" role="tree" aria-label="Project files">
        {renderEntries(tree, 0)}
      </div>
      <Modal
        open={preview !== null}
        title={preview?.path ?? ""}
        wide
        onClose={() => setPreview(null)}
        footer={
          <button className="btn sm" onClick={copyPreview}>
            <Copy size={14} /> Copy
          </button>
        }
      >
        <pre className="file-preview">{preview?.text}</pre>
      </Modal>
    </>
  );
}