import {
  LayoutDashboard,
  Network,
  Folder,
  Brain,
  ScrollText,
  Wrench,
  User,
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
        >
          <item.icon />
          {item.label}
        </button>
      ))}
      <div className="side-spacer" />
      <div className="side-foot">
        <button
          className={cx("side-item", view === "settings" && "active")}
          onClick={() => go("settings")}
          title="Settings"
        >
          <Settings />
          Settings
        </button>
      </div>
    </nav>
  );
}
