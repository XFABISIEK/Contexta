import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Database, Copy, Download, Upload, Cpu, Plug, Command, Search, Plus } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import {
  SHORTCUT_ACTIONS,
  FIXED_SHORTCUTS,
  formatBinding,
  bindingFromEvent,
  loadBindings,
  saveBinding,
  defaultBindings,
  type ShortcutAction,
  type ShortcutBinding,
} from "../lib/shortcuts";
import { ColorPicker } from "../components/ColorPicker";
import { Select } from "../components/Select";
import { downloadText, readFileText, ACCENTS, DEFAULT_ACCENT, applyAccent, applyMotion, flashContent } from "../lib/utils";
import type { DbInfo, Project } from "../types";

const MCP_TOOLS = [
  { name: "contexa_search", description: "Hybrid FTS search across projects, memories, rules, skills.", mapsTo: "search_everything" },
  { name: "contexa_get_project", description: "Fetch a single project by id or name.", mapsTo: "get_project" },
  { name: "contexa_get_project_context", description: "Assemble optimized AI context: critical rules, memories, skills, markdown.", mapsTo: "get_project_context" },
  { name: "contexa_get_rules", description: "List enabled rules, critical first.", mapsTo: "list_rules" },
  { name: "contexa_get_memories", description: "Ranked memory retrieval with filters.", mapsTo: "list_memories" },
  { name: "contexa_get_skills", description: "List skills by keyword/category.", mapsTo: "list_skills" },
  { name: "contexa_get_personal_context", description: "Personal info, only on query match.", mapsTo: "search (personal scope)" },
  { name: "contexa_get_graph", description: "Capped relation graph with edges.", mapsTo: "get_graph" },
  { name: "contexa_add_memory", description: "AI: store a memory (priority controls context inclusion).", mapsTo: "create_memory" },
  { name: "contexa_update_memory", description: "AI: patch a memory; tags replace.", mapsTo: "update_memory" },
  { name: "contexa_delete_memory", description: "AI: delete a memory.", mapsTo: "delete_memory" },
  { name: "contexa_add_rule", description: "AI: add a project or global rule.", mapsTo: "create_rule" },
  { name: "contexa_update_rule", description: "AI: replace a rule.", mapsTo: "update_rule" },
  { name: "contexa_delete_rule", description: "AI: delete a rule.", mapsTo: "delete_rule" },
  { name: "contexa_add_skill", description: "AI: add a reusable skill.", mapsTo: "create_skill" },
  { name: "contexa_update_skill", description: "AI: replace a skill.", mapsTo: "update_skill" },
  { name: "contexa_delete_skill", description: "AI: delete a skill.", mapsTo: "delete_skill" },
  { name: "contexa_add_project", description: "AI: create a project.", mapsTo: "create_project" },
  { name: "contexa_update_project", description: "AI: rename / re-describe a project.", mapsTo: "update_project" },
  { name: "contexa_delete_project", description: "AI: delete a project.", mapsTo: "delete_project" },
  { name: "contexa_add_personal", description: "AI: store a personal entry (stays local).", mapsTo: "create_personal" },
  { name: "contexa_update_personal", description: "AI: replace a personal entry.", mapsTo: "update_personal" },
  { name: "contexa_delete_personal", description: "AI: delete a personal entry.", mapsTo: "delete_personal" },
  { name: "contexa_link", description: "AI: relate two entities (project uses skill...).", mapsTo: "create_connection" },
  { name: "contexa_unlink", description: "AI: remove a relation.", mapsTo: "delete_connection" },
  { name: "contexa_scan_project", description: "AI: import agent instruction files from the project folder.", mapsTo: "scan_project_files" },
];

export const mcpClientConfig = (path: string) => JSON.stringify({
  mcpServers: {
    contexa: {
      command: "<path-to>\\contexa-mcp.exe",
      env: { CONTEXA_DB: path },
    },
  },
}, null, 2);

const ACTION_ICONS = { palette: Command, search: Search, newMemory: Plus } as const;

function sameBinding(x: ShortcutBinding, y: ShortcutBinding): boolean {
  return x.ctrl === y.ctrl && x.shift === y.shift && x.alt === y.alt && x.key.toLowerCase() === y.key.toLowerCase();
}

export function Settings() {
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const showStatus = useApp((s) => s.showStatus);
  const setShowStatus = useApp((s) => s.setShowStatus);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const clientConfig = mcpClientConfig(dbInfo?.path ?? "<database path>");
  const [density, setDensity] = useState("comfortable");
  const [projects, setProjects] = useState<Project[]>([]);
  const [ctxProject, setCtxProject] = useState("");
  const [ctxQuery, setCtxQuery] = useState("");
  const [ctxOut, setCtxOut] = useState<string | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [bindings, setBindings] = useState<Record<ShortcutAction["id"], ShortcutBinding>>(defaultBindings());
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [motion, setMotion] = useState(true);
  const [zoom, setZoom] = useState("100");
  const isCustom = !ACCENTS.some((a) => a.value === accent);
  const hexForPicker = /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_ACCENT;
  const [capturing, setCapturing] = useState<ShortcutAction["id"] | null>(null);
  const [tab, setTab] = useState<"ui" | "keybinds" | "advanced">("ui");
  const fileRef = useRef<HTMLInputElement>(null);
  const snapRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.dbInfo().then(setDbInfo).catch(() => {});
    loadBindings().then(setBindings).catch(() => {});
    api.projects.list(undefined, 200, 0).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setCtxProject((cur) => cur || p.items[0].name);
    }).catch(() => {});
    api.settings.all().then((s) => {
      if (s.density) {
        setDensity(s.density);
        document.documentElement.dataset.density = s.density;
      }
      if (s.accent) {
        setAccent(s.accent);
        applyAccent(s.accent);
      }
      if (s.motion === "0") {
        setMotion(false);
        applyMotion(false);
      }
      if (s.zoom) {
        setZoom(s.zoom);
        if (s.zoom !== "100") document.documentElement.dataset.zoom = s.zoom;
      }
      if (s.statusbar === "0") setShowStatus(false);
    }).catch(() => {});
  }, []);

  // Shortcut capture: runs in the capture phase so the shell handler
  // never sees the pressed keys. Esc cancels.
  useEffect(() => {
    if (!capturing) return;
    const onCap = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const b = bindingFromEvent(e);
      if (!b) return;
      if (!b.ctrl && !b.alt) {
        toast("error", "Use at least Ctrl or Alt so typing still works");
        return;
      }
      if (SHORTCUT_ACTIONS.some((a) => a.id !== capturing && sameBinding(bindings[a.id], b))) {
        toast("error", "That combination is already used");
        return;
      }
      saveBinding(capturing, b).then(() => {
        setBindings((prev) => ({ ...prev, [capturing]: b }));
        setCapturing(null);
        window.dispatchEvent(new CustomEvent("contexa:shortcuts"));
        toast("success", "Shortcut updated");
      }).catch(() => toast("error", "Could not save shortcut"));
    };
    window.addEventListener("keydown", onCap, true);
    return () => window.removeEventListener("keydown", onCap, true);
  }, [capturing, toast, bindings]);

  const resetShortcuts = async () => {
    const d = defaultBindings();
    try {
      await Promise.all(SHORTCUT_ACTIONS.map((a) => saveBinding(a.id, d[a.id])));
      setBindings(d);
      setCapturing(null);
      window.dispatchEvent(new CustomEvent("contexa:shortcuts"));
      toast("success", "Shortcuts reset");
    } catch {
      toast("error", "Could not reset shortcuts");
    }
  };
  const setDensityPref = async (v: string) => {
    setDensity(v);
    document.documentElement.dataset.density = v;
    flashContent();
    try {
      await api.settings.set("density", v);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save preference");
    }
  };
  const setAccentPref = async (v: string) => {
    setAccent(v);
    applyAccent(v);
    flashContent();
    try {
      await api.settings.set("accent", v);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save preference");
    }
  };
  const setMotionPref = async (v: boolean) => {
    setMotion(v);
    applyMotion(v);
    try {
      await api.settings.set("motion", v ? "1" : "0");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save preference");
    }
  };
  const setZoomPref = async (v: string) => {
    setZoom(v);
    if (v === "100") delete document.documentElement.dataset.zoom;
    else document.documentElement.dataset.zoom = v;
    flashContent();
    try {
      await api.settings.set("zoom", v);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save preference");
    }
  };
  const setStatusPref = async (v: boolean) => {
    setShowStatus(v);
    try {
      await api.settings.set("statusbar", v ? "1" : "0");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save preference");
    }
  };

  const doBackup = async () => {
    try {
      const path = await api.backup();
      toast("success", `Backup written: ${path}`);
      api.dbInfo().then(setDbInfo).catch(() => {});
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Backup failed");
    }
  };

  const doExport = async () => {
    try {
      const json = await api.exportDb();
      downloadText(`contexta-export-${Date.now()}.json`, json);
      toast("success", "Database exported");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Export failed");
    }
  };

  const doImport = async (f: File) => {
    try {
      const text = await readFileText(f);
      const res = await api.importProject(text);
      toast("success", `Imported "${res.project}": ${res.memories} memories, ${res.rules} rules`);
      refreshStats();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Import failed");
    }
  };

  // Sync snapshot: full export merged insert-or-ignore (never duplicates,
  // never overwrites). Copy the file to another machine and import it there.
  const doExportSnapshot = async () => {
    try {
      const json = await api.exportDb();
      downloadText(`contexta-sync-${Date.now()}.json`, json);
      toast("success", "Sync snapshot exported");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Export failed");
    }
  };

  const doImportSnapshot = async (f: File) => {
    try {
      const text = await readFileText(f);
      const counts = await api.importSnapshot(text);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast("success", total === 0 ? "Snapshot already merged — nothing new" : `Merged snapshot: ${total} new rows`);
      refreshStats();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Import failed");
    }
  };

  const previewContext = async () => {
    if (!ctxProject.trim()) {
      toast("error", "Pick a project first");
      return;
    }
    setCtxLoading(true);
    try {
      const ctx = await api.context(ctxProject.trim(), ctxQuery, 10, 4000);
      setCtxOut(
        `rules=${ctx.rules.length} memories=${ctx.memories.length} skills=${ctx.skills.length} personal=${ctx.personal.length}\n\n${ctx.markdown}`,
      );
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Context failed");
    } finally {
      setCtxLoading(false);
    }
  };

  const copyMcpSpec = async () => {
    const spec = {
      transport: "stdio (contexa-mcp binary)",
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, mapsTo: t.mapsTo })),
      example: {
        tool: "contexa_get_project_context",
        input: { project: "Axiom", query: "How should I implement authentication?", max_results: 10 },
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
      toast("success", "MCP tool spec copied");
    } catch {
      toast("error", "Clipboard unavailable");
    }
  };

  return (
    <div className="page settings-page">
      <div className="page-head">
        <h1>Settings</h1>
        <div className="sub">Adjust the interface and manage local data.</div>
      </div>

      <div className="tabs" role="tablist" aria-label="Settings sections" style={{ marginBottom: 18 }}>
        {(["ui", "keybinds", "advanced"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "tab active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t === "ui" ? "UI" : t === "keybinds" ? "Keybinds" : "Advanced"}
          </button>
        ))}
      </div>

      {tab === "ui" && (
      <>
      <div className="section">
        <div className="section-head"><span className="section-title">Appearance</span></div>
        <div className="card">
          <div className="kv">
            <span className="k">Density</span>
            <span className="seg">
              <button className={density === "compact" ? "active" : ""} onClick={() => setDensityPref("compact")}>Compact</button>
              <button className={density === "comfortable" ? "active" : ""} onClick={() => setDensityPref("comfortable")}>Comfortable</button>
            </span>
          </div>
          <div className="kv">
            <span className="k">Interface scale</span>
            <span className="seg">
              {(["90", "100", "110", "125"] as const).map((z) => (
                <button key={z} className={zoom === z ? "active" : ""} onClick={() => setZoomPref(z)}>{z}%</button>
              ))}
            </span>
          </div>
          <div className="kv">
            <span className="k">Accent color</span>
            <span className="swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  role="radio"
                  aria-checked={accent === a.value}
                  title={a.label}
                  aria-label={a.label}
                  className={accent === a.value ? "swatch active" : "swatch"}
                  style={{ "--sw": a.value } as CSSProperties}
                  onClick={() => setAccentPref(a.value)}
                />
              ))}
              <ColorPicker
                value={hexForPicker}
                active={isCustom}
                onLive={(v) => { setAccent(v); applyAccent(v); }}
                onCommit={setAccentPref}
              />
            </span>
          </div>
          <div className="kv">
            <span className="k">Animations</span>
            <label className="check"><input type="checkbox" checked={motion} onChange={(e) => setMotionPref(e.target.checked)} /> Enable transitions and effects</label>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-head"><span className="section-title">Workspace</span></div>
        <div className="card">
          <div className="kv">
            <span className="k">Status bar</span>
            <label className="check"><input type="checkbox" checked={showStatus} onChange={(e) => setStatusPref(e.target.checked)} /> Show the bottom status bar</label>
          </div>
        </div>
      </div>
      </>
      )}

      {tab === "advanced" && (
      <div className="section">
        <div className="section-head"><span className="section-title">Updates</span></div>
        <div className="card">
          <p className="mono-dim" style={{ marginTop: 0 }}>
            Contexta checks GitHub releases automatically on launch. You can also check now.
          </p>
          <div className="settings-actions" style={{ borderTop: "none", paddingTop: 0, marginTop: 0 }}>
            <button className="btn sm" onClick={() => window.dispatchEvent(new CustomEvent("contexa:check-updates"))}>
              <Download size={14} /> Check for updates
            </button>
          </div>
        </div>
      </div>
      )}

      {tab === "advanced" && (
      <div className="section">
        <div className="section-head"><span className="section-title">Database</span></div>
        <div className="card">
          <div className="kv"><span className="k">Location</span><span className="mono-dim settings-path">{dbInfo?.path ?? "…"}</span></div>
          <div className="kv"><span className="k">Size</span><span>{dbInfo ? `${(dbInfo.size_bytes / 1024).toFixed(1)} KB` : "…"}</span></div>
          <div className="settings-actions">
            <button className="btn sm" onClick={doBackup}><Database size={14} /> Backup now</button>
            <button className="btn sm" onClick={doExport}><Download size={14} /> Export database (JSON)</button>
            <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import project (JSON)</button>
            <button className="btn sm" onClick={doExportSnapshot}><Download size={14} /> Sync snapshot (export)</button>
            <button className="btn sm" onClick={() => snapRef.current?.click()}><Upload size={14} /> Sync snapshot (import)</button>
            <input
              ref={snapRef}
              type="file"
              accept="application/json"
              className="file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImportSnapshot(f);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
      )}

      {tab === "keybinds" && (
      <>
      <div className="section">
        <div className="section-head">
          <span className="section-title">Shortcuts</span>
          <span className="section-action">
            <button className="btn sm ghost" onClick={resetShortcuts}>Reset all</button>
          </span>
        </div>
        <div className="kb-list">
          {SHORTCUT_ACTIONS.map((a) => {
            const Icon = ACTION_ICONS[a.id];
            const active = capturing === a.id;
            return (
              <div className={active ? "kb-row capturing" : "kb-row"} key={a.id}>
                <span className="kb-ico"><Icon size={15} /></span>
                <span className="kb-info">
                  <span className="kb-label">{a.label}</span>
                  <span className="kb-hint">{a.hint}</span>
                </span>
                <span className="kbd kb-key">{active ? "press keys…" : formatBinding(bindings[a.id])}</span>
                <button
                  className="btn sm"
                  onClick={() => setCapturing(active ? null : a.id)}
                >
                  {active ? "Cancel" : "Change"}
                </button>
              </div>
            );
          })}
        </div>
        {capturing
          ? <p className="mono-dim kb-note">Press a combination (Ctrl or Alt required) — Esc cancels.</p>
          : <p className="mono-dim kb-note">Duplicates are rejected so typing keeps working everywhere.</p>}
      </div>
      <div className="section">
        <div className="section-head"><span className="section-title">Fixed shortcuts</span></div>
        <div className="kb-list">
          {FIXED_SHORTCUTS.map((f) => (
            <div className="kb-row fixed" key={f.keys} title={f.keys}>
              <span className="kb-label">{f.label}</span>
              <span className="kbd kb-key">{f.keys}</span>
            </div>
          ))}
        </div>
      </div>
      </>
      )}

      {tab === "advanced" && (
      <>
      <div className="section">
        <div className="section-head"><span className="section-title">AI Integration — context preview</span></div>
        <div className="card">
          <div className="toolbar">
            <Select
              label="Context project"
              value={ctxProject}
              onChange={setCtxProject}
              options={projects.map((p) => ({ value: p.name, label: p.name }))}
            />
            <div className="search-input" style={{ minWidth: 220 }}>
              <Cpu size={14} />
              <input value={ctxQuery} onChange={(e) => setCtxQuery(e.target.value)} placeholder="Query, e.g. how to implement auth?" aria-label="Context query" />
            </div>
            <button className="btn primary sm" onClick={previewContext} disabled={ctxLoading}>
              {ctxLoading ? "Building…" : "Build context"}
            </button>
          </div>
          {ctxOut && <div className="md-preview">{ctxOut}</div>}
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">MCP</span></div>
        <div className="card">
          <p className="mono-dim" style={{ marginTop: 0 }}>
            <Plug size={12} style={{ display: "inline", verticalAlign: -1 }} /> Model Context Protocol over stdio -
            read <em>and</em> write. Build: <span className="code">cargo build --release --bin contexa-mcp</span>,
            then point any MCP client at the exe. No HTTP server, no network.
          </p>
          <div className="md-preview" style={{ marginBottom: 10 }}>{clientConfig}</div>
          <div className="list" style={{ marginBottom: 10 }}>
            {MCP_TOOLS.map((t) => (
              <div key={t.name} className="row" style={{ cursor: "default" }}>
                <div className="row-main">
                  <div className="row-title code" style={{ display: "inline-block" }}>{t.name}</div>
                  <div className="row-sub">{t.description}</div>
                </div>
                <div className="row-meta"><span className="mono-dim">- {t.mapsTo}</span></div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sm" onClick={copyMcpSpec}><Copy size={14} /> Copy tool spec (JSON)</button>
            <button
              className="btn sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(clientConfig);
                  toast("success", "Client config copied");
                } catch {
                  toast("error", "Clipboard unavailable");
                }
              }}
            >
              <Copy size={14} /> Copy client config
            </button>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
