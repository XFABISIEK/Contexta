import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Folder,
  Brain,
  ScrollText,
  Wrench,
  Network,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import { useContexaChanged } from "../lib/hooks";
import type { ActivityDay, Memory, Project } from "../types";

const STATS = [
  { key: "projects", label: "Projects", icon: Folder, to: "projects" },
  { key: "memories", label: "Memories", icon: Brain, to: "memories" },
  { key: "rules", label: "Rules", icon: ScrollText, to: "rules" },
  { key: "skills", label: "Skills", icon: Wrench, to: "skills" },
  { key: "connections", label: "Connections", icon: Network, to: "graph" },
] as const;

export function Dashboard() {
  const stats = useApp((s) => s.stats);
  const refreshStats = useApp((s) => s.refreshStats);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const toast = useApp((s) => s.toast);
  const [recent, setRecent] = useState<Memory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);

  const load = useCallback(async () => {
    await refreshStats();
    try {
      const [mem, proj, act] = await Promise.all([
        api.memories.list({ limit: 6, offset: 0 }),
        api.projects.list(undefined, 5, 0),
        api.activity(14),
      ]);
      setRecent(mem.items);
      setProjects(proj.items);
      setActivity(act);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load dashboard");
    }
  }, [refreshStats, toast]);

  useEffect(() => {
    load();
  }, [load]);
  useContexaChanged(load);

  return (
    <div className="page">
      <div className="hero">
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          Context<span className="accent">a</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: 0.05 }}>
          Your local memory layer for AI — fast hybrid retrieval over projects, rules and skills.
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <button className="btn primary" onClick={() => setComposer({ kind: "memory" })}>
            <Plus /> New Memory
          </button>
          <button className="btn" onClick={() => go("graph")}>
            <Network /> Explore graph
          </button>
        </motion.div>
      </div>

      <div className="stat-grid">
        {STATS.map((s, i) => (
          <motion.div
            key={s.key}
            className="stat-card clickable"
            role="button"
            tabIndex={0}
            title={`Open ${s.label.toLowerCase()}`}
            onClick={() => go(s.to)}
            onKeyDown={(e) => { if (e.key === "Enter") go(s.to); }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 + i * 0.04 }}
          >
            <div className="stat-label">
              <span className="stat-ico"><s.icon /></span> {s.label}
            </div>
            <div className="stat-value">{stats ? stats[s.key] : "—"}</div>
          </motion.div>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Recent Memories</span>
          <span className="section-action">
            <button className="btn ghost sm" onClick={() => go("memories")}>
              View all <ChevronRight size={13} />
            </button>
          </span>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="No memories yet."
            hint="Start building your AI memory."
            action={
              <button className="btn primary sm" onClick={() => setComposer({ kind: "memory" })}>
                <Plus /> Create first memory
              </button>
            }
          />
        ) : (
          <div className="list">
            {recent.map((m) => (
              <div key={m.id} className="row" onClick={() => setComposer({ kind: "memory", editId: m.id })}>
                <div className="row-icon"><Brain /></div>
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
        <div className="section-head">
          <span className="section-title">Recently Modified Projects</span>
          <span className="section-action">
            <button className="btn ghost sm" onClick={() => go("projects")}>
              View all <ChevronRight size={13} />
            </button>
          </span>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon={Folder}
            title="No projects yet."
            hint="Group memories and rules per project."
            action={
              <button className="btn primary sm" onClick={() => setComposer({ kind: "project" })}>
                <Plus /> New project
              </button>
            }
          />
        ) : (
          <div className="list">
            {projects.map((p) => (
              <div key={p.id} className="row" onClick={() => go("projects", p.id)}>
                <div className="row-icon"><Folder /></div>
                <div className="row-main">
                  <div className="row-title">{p.name}</div>
                  <div className="row-sub">{truncate(p.description, 110) || "—"}</div>
                </div>
                <div className="row-meta">
                  <span className="row-time">{timeAgo(p.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Activity — last 14 days</span>
        </div>
        <div className="card">
          {activity.length === 0 ? (
            <div className="mono-dim">No activity recorded yet.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 72 }}>
              {activity.map((d) => {
                const max = Math.max(1, ...activity.map((x) => x.count));
                return (
                  <div key={d.date} title={`${d.date}: ${d.count}`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                    <div style={{ width: "100%", maxWidth: 24, height: `${Math.max(6, (d.count / max) * 50)}px`, background: d.count ? "var(--accent)" : "var(--panel-active)", borderRadius: 3 }} />
                    <span className="mono-dim" style={{ fontSize: 9 }}>{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <span className="section-title">Quick Actions</span>
        </div>
        <div className="quick-grid">
          <button className="quick-btn" onClick={() => setComposer({ kind: "project" })}>
            <Plus /> <span><span className="qb-t">New Project</span><small>Group memories and rules</small></span>
          </button>
          <button className="quick-btn" onClick={() => setComposer({ kind: "memory" })}>
            <Brain /> <span><span className="qb-t">Add Memory</span><small>Capture a fact or decision</small></span>
          </button>
          <button className="quick-btn" onClick={() => setComposer({ kind: "skill" })}>
            <Wrench /> <span><span className="qb-t">Add Skill</span><small>Save a reusable playbook</small></span>
          </button>
          <button className="quick-btn" onClick={() => go("graph")}>
            <Network /> <span><span className="qb-t">Open Graph</span><small>See how things connect</small></span>
          </button>
        </div>
      </div>
    </div>
  );
}
