import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Folder,
  FolderGit2,
  Copy,
  Plus,
  Pencil,
  Trash2,
  Brain,
  ScrollText,
  Wrench,
  Link2,
  Unlink,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import { Select } from "../components/Select";
import type { Connection, Memory, Project, Rule, Skill } from "../types";
import { SkillIcon } from "../components/SkillIcon";

const GraphViewLazy = lazy(() =>
  import("./GraphView").then((m) => ({ default: m.GraphView })),
);

type Tab = "overview" | "memories" | "rules" | "graph";

export function Projects() {
  const selectedId = useApp((s) => s.selectedProjectId);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const p = await api.projects.list(query.trim() || undefined, 100, 0);
      setProjects(p.items);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load projects");
    }
  }, [query, toast]);

  useEffect(() => {
    if (!selectedId) load();
  }, [selectedId, load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load]);

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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter projects..." aria-label="Filter projects" />
        </div>
        <button className="btn primary" onClick={() => setComposer({ kind: "project" })}>
          <Plus /> New Project
        </button>
      </div>
      {projects.length === 0 ? (
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
    const onChange = () => load();
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load]);

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
        {(["overview", "memories", "rules", "graph"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
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
