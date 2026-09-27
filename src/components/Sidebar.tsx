import {
  LayoutDashboard,
  Network,
  Folder,
  Brain,
  ScrollText,
  Wrench,
  User,
  Info,
  Settings,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { cx } from "../lib/utils";
import type { View } from "../types";

const NAV: Array<{ view: View; label: string; icon: typeof Folder }> = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "graph", label: "Graph", icon: Network },
  { view: "projects", label: "Projects", icon: Folder },
  { view: "memories", label: "Memories", icon: Brain },
  { view: "rules", label: "Rules", icon: ScrollText },
  { view: "skills", label: "Skills", icon: Wrench },
  { view: "personal", label: "Personal", icon: User },
];

export function Sidebar() {
  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="side-label">Memory</div>
      {NAV.map((item) => (
        <button
          key={item.view}
          className={cx("side-item", view === item.view && "active")}
          onClick={() => go(item.view)}
          title={item.label}
          aria-label={item.label}
        >
          <item.icon />
          <span className="side-text">{item.label}</span>
        </button>
      ))}
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
