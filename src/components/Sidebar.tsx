import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Network,
  Folder,
  Brain,
  ScrollText,
  Wrench,
  User,
  Info,
  Plug,
  Settings,
  ChevronDown,
  CircleUserRound,
  Database,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { cx } from "../lib/utils";
import type { View } from "../types";

const PROJECT_VIEWS: View[] = ["projects", "memories", "rules", "skills", "personal", "database"];

const PROJECT_SUBS: Array<{ view: View; label: string; icon: typeof Folder; all?: boolean }> = [
  { view: "projects", label: "All projects", icon: Folder, all: true },
  { view: "memories", label: "Memories", icon: Brain },
  { view: "rules", label: "Rules", icon: ScrollText },
  { view: "skills", label: "Skills", icon: Wrench },
  { view: "personal", label: "Personal", icon: User },
  { view: "database", label: "Database", icon: Database },
];

export function Sidebar() {
  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);
  const inProjects = PROJECT_VIEWS.includes(view);
  const [open, setOpen] = useState(inProjects);

  useEffect(() => {
    if (inProjects) setOpen(true);
  }, [inProjects]);

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="side-label">Memory</div>
      <button
        className={cx("side-item", view === "dashboard" && "active")}
        onClick={() => go("dashboard")}
        title="Dashboard"
      >
        <LayoutDashboard />
        <span className="side-text">Dashboard</span>
      </button>

      <button
        className={cx("side-item", inProjects && "active")}
        onClick={() => (inProjects && open ? go("projects", null) : setOpen(!open))}
        title="Projects"
        aria-expanded={open}
      >
        <Folder />
        <span className="side-text">Projects</span>
        <ChevronDown size={13} className={cx("side-chevron", open && "open")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            {PROJECT_SUBS.map((s) => (
              <button
                key={s.view}
                className={cx("side-item", "side-sub", view === s.view && "active")}
                onClick={() => go(s.view, s.all ? null : undefined)}
                title={s.label}
                aria-label={s.label}
              >
                <s.icon />
                <span className="side-text">{s.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        className={cx("side-item", view === "graph" && "active")}
        onClick={() => go("graph")}
        title="Graph"
      >
        <Network />
        <span className="side-text">Graph</span>
      </button>
      <button
        className={cx("side-item", view === "mcp" && "active")}
        onClick={() => go("mcp")}
        title="Contexa-MCP"
        aria-label="Contexa-MCP"
      >
        <Plug />
        <span className="side-text">MCP</span>
      </button>
      <button
        className={cx("side-item", view === "profile" && "active")}
        onClick={() => go("profile")}
        title="Profile"
      >
        <CircleUserRound />
        <span className="side-text">Profile</span>
      </button>

      <div className="side-spacer" />
      <div className="side-foot">
        <button
          className={cx("side-item", view === "information" && "active")}
          onClick={() => go("information")}
          title="Information"
          aria-label="Information"
        >
          <Info />
          <span className="side-text">Information</span>
        </button>
        <button
          className={cx("side-item", view === "settings" && "active")}
          onClick={() => go("settings")}
          title="Settings"
          aria-label="Settings"
        >
          <Settings />
          <span className="side-text">Settings</span>
        </button>
      </div>
    </nav>
  );
}
