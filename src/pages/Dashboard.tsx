import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
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
import type { Memory, Project } from "../types";

const STATS = [
  { key: "projects", label: "Projects", icon: Folder },
  { key: "memories", label: "Memories", icon: Brain },
  { key: "rules", label: "Rules", icon: ScrollText },
  { key: "skills", label: "Skills", icon: Wrench },
  { key: "connections", label: "Connections", icon: Network },
] as const;

export function Dashboard() {
  const stats = useApp((s) => s.stats);
  const refreshStats = useApp((s) => s.refreshStats);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const setSearch = useApp((s) => s.setSearch);
  const toast = useApp((s) => s.toast);
  const [recent, setRecent] = useState<Memory[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const load = useCallback(async () => {
    await refreshStats();
    try {
      const [mem, proj] = await Promise.all([
        api.memories.list({ limit: 6, offset: 0 }),
        api.projects.list(undefined, 5, 0),
      ]);
      setRecent(mem.items);
      setProjects(proj.items);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load dashboard");
    }
  }, [refreshStats, toast]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("simplememory:changed", onChange);
    return () => window.removeEventListener("simplememory:changed", onChange);
  }, [load]);

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
          <div className="search-input" onClick={() => setSearch(true)}>
            <Search />
            <input placeholder="Search memory...  (Ctrl+Shift+F)" readOnly />
          </div>
          <button className="btn primary" onClick={() => setComposer({ kind: "memory" })}>
            <Plus /> New Memory
          </button>
        </motion.div>
      </div>

      <div className="stat-grid">
        {STATS.map((s, i) => (
          <motion.div
            key={s.key}
            className="stat-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05 + i * 0.04 }}
          >
            <div className="stat-label">
              <s.icon /> {s.label}
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
          <span className="section-title">Quick Actions</span>
        </div>
        <div className="quick-grid">
          <button className="quick-btn" onClick={() => setComposer({ kind: "project" })}>
            <Plus /> New Project
          </button>
          <button className="quick-btn" onClick={() => setComposer({ kind: "memory" })}>
            <Brain /> Add Memory
          </button>
          <button className="quick-btn" onClick={() => setComposer({ kind: "skill" })}>
            <Wrench /> Add Skill
          </button>
          <button className="quick-btn" onClick={() => go("graph")}>
            <Network /> Open Graph
          </button>
        </div>
      </div>
    </div>
  );
}
