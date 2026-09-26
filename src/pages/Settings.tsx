import { useEffect, useRef, useState } from "react";
import { Database, Copy, Download, Upload, ShieldCheck, Cpu, Plug, Info } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { downloadText, readFileText } from "../lib/utils";
import type { DbInfo, Project } from "../types";

const MCP_TOOLS = [
  { name: "simplememory_search", description: "Hybrid FTS search across projects, memories, rules, skills.", mapsTo: "search_everything" },
  { name: "simplememory_get_project", description: "Fetch a single project by id or name.", mapsTo: "get_project" },
  { name: "simplememory_get_project_context", description: "Assemble optimized AI context: critical rules, memories, skills, markdown.", mapsTo: "get_project_context" },
  { name: "simplememory_get_rules", description: "List enabled rules, critical first.", mapsTo: "list_rules" },
  { name: "simplememory_get_memories", description: "Ranked memory retrieval with filters.", mapsTo: "list_memories" },
  { name: "simplememory_get_skills", description: "List skills by keyword/category.", mapsTo: "list_skills" },
  { name: "simplememory_get_personal_context", description: "Personal info, only on query match.", mapsTo: "search (personal scope)" },
];

export function Settings() {
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const stats = useApp((s) => s.stats);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const [density, setDensity] = useState("comfortable");
  const [projects, setProjects] = useState<Project[]>([]);
  const [ctxProject, setCtxProject] = useState("");
  const [ctxQuery, setCtxQuery] = useState("");
  const [ctxOut, setCtxOut] = useState<string | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.dbInfo().then(setDbInfo).catch(() => {});
    api.projects.list(undefined, 200, 0).then((p) => {
      setProjects(p.items);
      if (p.items[0]) setCtxProject((cur) => cur || p.items[0].name);
    }).catch(() => {});
    api.settings.all().then((s) => {
      if (s.density) {
        setDensity(s.density);
        document.documentElement.dataset.density = s.density;
      }
    }).catch(() => {});
  }, []);

  const setDensityPref = async (v: string) => {
    setDensity(v);
    document.documentElement.dataset.density = v;
    try {
      await api.settings.set("density", v);
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
      downloadText(`simplememory-export-${Date.now()}.json`, json);
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

  const doSeed = async () => {
    try {
      const msg = await api.seed();
      toast("info", msg);
      refreshStats();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Seed failed");
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
      transport: "stdio (planned)",
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, mapsTo: t.mapsTo })),
      example: {
        tool: "simplememory_get_project_context",
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
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <div className="sub">Local configuration. Nothing here phones home.</div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">General</span></div>
        <div className="card">
          <div className="kv"><span className="k">Database</span><span className="mono-dim">{dbInfo?.path ?? "…"}</span></div>
          <div className="kv"><span className="k">Size</span><span>{dbInfo ? `${(dbInfo.size_bytes / 1024).toFixed(1)} KB` : "…"}</span></div>
          <div className="kv"><span className="k">Totals</span><span>{stats ? `${stats.projects} projects · ${stats.memories} memories · ${stats.rules} rules · ${stats.skills} skills` : "…"}</span></div>
        </div>
      </div>

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
          <div className="kv"><span className="k">Theme</span><span className="mono-dim">Dark (JetBrains Mono) — the only theme, by design.</span></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Database</span></div>
        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={doBackup}><Database size={14} /> Backup now</button>
          <button className="btn sm" onClick={doExport}><Download size={14} /> Export database (JSON)</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import project (JSON)</button>
          <button className="btn sm ghost" onClick={doSeed}>Seed demo data</button>
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

      <div className="section">
        <div className="section-head"><span className="section-title">AI Integration — context preview</span></div>
        <div className="card">
          <div className="toolbar">
            <select className="input" value={ctxProject} onChange={(e) => setCtxProject(e.target.value)} aria-label="Context project">
              {projects.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
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
            <Plug size={12} style={{ display: "inline", verticalAlign: -1 }} /> Model Context Protocol over stdio.
            Each tool maps 1:1 to a local Tauri command — no HTTP server, no network.
          </p>
          <div className="list" style={{ marginBottom: 10 }}>
            {MCP_TOOLS.map((t) => (
              <div key={t.name} className="row" style={{ cursor: "default" }}>
                <div className="row-main">
                  <div className="row-title code" style={{ display: "inline-block" }}>{t.name}</div>
                  <div className="row-sub">{t.description}</div>
                </div>
                <div className="row-meta"><span className="mono-dim">→ {t.mapsTo}</span></div>
              </div>
            ))}
          </div>
          <button className="btn sm" onClick={copyMcpSpec}><Copy size={14} /> Copy tool spec (JSON)</button>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Privacy</span></div>
        <div className="card">
          <div className="kv"><span className="k"><ShieldCheck size={13} /></span><span>No cloud sync, no telemetry, no analytics, no external requests.</span></div>
          <div className="kv"><span className="k">Storage</span><span className="mono-dim">Single SQLite file on this machine. Delete it and everything is gone.</span></div>
          <div className="kv"><span className="k">Encryption</span><span className="mono-dim">At-rest encryption is on the roadmap (SQLCipher); schema is ready for it.</span></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">About</span></div>
        <div className="card">
          <div className="kv"><span className="k"><Info size={13} /></span><span>SimpleMemory 0.1.0 — Tauri 2 · React · Rust · SQLite FTS5</span></div>
        </div>
      </div>
    </div>
  );
}
