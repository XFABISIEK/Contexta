import { useEffect, useMemo, useState } from "react";
import { Folder, Brain, ScrollText, Wrench, Network, User } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { AIProviderPicker } from "../components/AIProviderPicker";
import type { ActivityDay } from "../types";

const DAYS = 365;

function isoLocal(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function level(count: number): string {
  if (count <= 0) return "#21262d";
  if (count <= 2) return "#0e4429";
  if (count <= 5) return "#006d32";
  if (count <= 9) return "#26a641";
  return "#39d353";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ActivityHeatmap({ days }: { days: ActivityDay[] }) {
  const [hovered, setHovered] = useState<{ date: string; count: number } | null>(null);
  const { weeks, months, total } = useMemo(() => {
    const counts = new Map(days.map((d) => [d.date, d.count]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (DAYS - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    const weeks: Array<Array<{ date: string; count: number } | null>> = [];
    const cursor = new Date(start);
    let total = 0;
    while (cursor <= today || weeks.length === 0) {
      const col: Array<{ date: string; count: number } | null> = [];
      for (let i = 0; i < 7; i++) {
        if (cursor > today) {
          col.push(null);
        } else {
          const date = isoLocal(cursor);
          const count = counts.get(date) ?? 0;
          total += count;
          col.push({ date, count });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
      if (cursor > today) break;
    }
    const months: Array<string | null> = [];
    let prev = -1;
    for (const col of weeks) {
      const first = col.find((c) => c !== null);
      const m = first ? Number(first.date.slice(5, 7)) - 1 : -1;
      months.push(m !== prev && m >= 0 ? MONTHS[m] : null);
      if (m >= 0) prev = m;
    }
    return { weeks, months, total };
  }, [days]);

  return (
    <div>
      <div className="heat-dist">
        <div className="heat-r">
          <div className="heat-gutter" aria-hidden="true" />
          <div className="heat-months" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i}>{m ?? ""}</span>
            ))}
          </div>
        </div>
        <div className="heat-r">
          <div className="heat-gutter heat-daylabels" aria-hidden="true">
            {["Mon", "", "Wed", "", "Fri", "", ""].map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </div>
          <div className="heat-grid" role="img" aria-label={`${total} contributions in the last year`}>
            {weeks.map((col, wi) => (
              <div key={wi} className="heat-col">
                {col.map((cell, di) =>
                  cell ? (
                    <span
                      key={di}
                      className="heat-cell"
                      style={{ background: level(cell.count) }}
                      title={`${cell.count} contribution${cell.count === 1 ? "" : "s"} on ${cell.date}`}
                      onMouseEnter={() => setHovered(cell)}
                      onMouseLeave={() => setHovered(null)}
                    />
                  ) : (
                    <span key={di} className="heat-cell heat-future" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heat-legend">
        <span>
          {hovered
            ? `${hovered.count} contribution${hovered.count === 1 ? "" : "s"} on ${hovered.date}`
            : `${total} contributions in the last year`}
        </span>
        <span className="heat-scale">
          Less
          {[0, 1, 4, 7, 12].map((c) => (
            <span key={c} className="heat-cell" style={{ background: level(c) }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

const STATS = [
  { key: "projects", label: "Projects", icon: Folder },
  { key: "memories", label: "Memories", icon: Brain },
  { key: "rules", label: "Rules", icon: ScrollText },
  { key: "skills", label: "Skills", icon: Wrench },
  { key: "connections", label: "Connections", icon: Network },
  { key: "personal", label: "Personal", icon: User },
] as const;

export function Profile() {
  const stats = useApp((s) => s.stats);
  const refreshStats = useApp((s) => s.refreshStats);
  const aiProvider = useApp((s) => s.aiProvider);
  const setAiProvider = useApp((s) => s.setAiProvider);
  const toast = useApp((s) => s.toast);
  const [days, setDays] = useState<ActivityDay[]>([]);

  useEffect(() => {
    refreshStats();
    api.activity(DAYS).then(setDays).catch(() => {});
  }, [refreshStats]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Profile</h1>
        <div className="sub">Your memory space at a glance.</div>
      </div>

      <div className="stat-grid">
        {STATS.map((s) => (
          <div key={s.key} className="stat-card">
            <div className="stat-label">
              <s.icon /> {s.label}
            </div>
            <div className="stat-value">{stats ? stats[s.key] : "—"}</div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Activity</span></div>
        <div className="card heat-card">
          <ActivityHeatmap days={days} />
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">AI provider</span></div>
        <AIProviderPicker
          value={aiProvider ?? null}
          onSaved={(v) => {
            setAiProvider(v);
            toast("success", `AI assistant set to ${v}`);
          }}
        />
      </div>
    </div>
  );
}
