import { Database, ShieldCheck } from "lucide-react";
import { useApp } from "../stores/app-store";

export function StatusBar() {
  const stats = useApp((s) => s.stats);
  const dbOk = useApp((s) => s.dbOk);

  return (
    <div className="statusbar">
      <span className="st-item">
        <span className={dbOk ? "st-dot" : "st-dot bad"} />
        Contexta
      </span>
      <span className="st-item">
        <Database />
        {dbOk ? "Database: Connected" : "Database: Offline"}
      </span>
      {stats && <span className="st-item">{stats.memories} Memories</span>}
      {stats && <span className="st-item">{stats.projects} Projects</span>}
      <span className="st-right">
        <span className="st-item">
          <ShieldCheck />
          Local-only
        </span>
      </span>
    </div>
  );
}
