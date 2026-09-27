import { useCallback, useEffect, useState } from "react";
import { User, Plus, Trash2, ShieldCheck } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { timeAgo, truncate } from "../lib/utils";
import { EmptyState } from "../components/Modal";
import type { PersonalInfo } from "../types";

export function Personal() {
  const setComposer = useApp((s) => s.setComposer);
  const askDelete = useApp((s) => s.askDelete);
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const [items, setItems] = useState<PersonalInfo[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api.personal.list());
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to load personal info");
    }
  }, [toast]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("contexa:changed", onChange);
    return () => window.removeEventListener("contexa:changed", onChange);
  }, [load]);

  const remove = (p: PersonalInfo) => {
    askDelete(`Delete entry "${p.title}"?`, undefined, async () => {
      try {
        await api.personal.remove(p.id);
        toast("success", "Entry deleted");
        refreshStats();
        load();
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Personal</h1>
        <div className="sub">
          <ShieldCheck size={12} style={{ display: "inline", verticalAlign: -1 }} /> Stored locally. Only added to AI context when relevant to the query.
        </div>
      </div>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setComposer({ kind: "personal" })}>
          <Plus /> New Entry
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={User}
          title="No personal information."
          hint="Timezone, preferences, editor setup — kept on this machine."
          action={
            <button className="btn primary sm" onClick={() => setComposer({ kind: "personal" })}>
              <Plus /> New entry
            </button>
          }
        />
      ) : (
        <div className="list">
          {items.map((p) => (
            <div key={p.id} className="row" onClick={() => setComposer({ kind: "personal", editId: p.id })}>
              <div className="row-icon"><User /></div>
              <div className="row-main">
                <div className="row-title">{p.title} <span className="code">{p.key}</span></div>
                <div className="row-sub">{truncate(p.content, 120)}</div>
              </div>
              <div className="row-meta">
                <span className="row-time">{timeAgo(p.updated_at)}</span>
                <span className="row-actions">
                  <button className="icon-btn danger" title="Delete" onClick={(e) => { e.stopPropagation(); remove(p); }}>
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
