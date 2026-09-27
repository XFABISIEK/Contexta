import { useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { Database, Copy, Download, Upload, Cpu, Plug } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { AIProviderPicker } from "../components/AIProviderPicker";
import { Select } from "../components/Select";
import { UpdateModal } from "../components/UpdateModal";
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
  { name: "simplememory_get_graph", description: "Capped relation graph with edges.", mapsTo: "get_graph" },
  { name: "simplememory_add_memory", description: "AI: store a memory (priority controls context inclusion).", mapsTo: "create_memory" },
  { name: "simplememory_update_memory", description: "AI: patch a memory; tags replace.", mapsTo: "update_memory" },
  { name: "simplememory_delete_memory", description: "AI: delete a memory.", mapsTo: "delete_memory" },
  { name: "simplememory_add_rule", description: "AI: add a project or global rule.", mapsTo: "create_rule" },
  { name: "simplememory_update_rule", description: "AI: replace a rule.", mapsTo: "update_rule" },
  { name: "simplememory_delete_rule", description: "AI: delete a rule.", mapsTo: "delete_rule" },
  { name: "simplememory_add_skill", description: "AI: add a reusable skill.", mapsTo: "create_skill" },
  { name: "simplememory_update_skill", description: "AI: replace a skill.", mapsTo: "update_skill" },
  { name: "simplememory_delete_skill", description: "AI: delete a skill.", mapsTo: "delete_skill" },
  { name: "simplememory_add_project", description: "AI: create a project.", mapsTo: "create_project" },
  { name: "simplememory_update_project", description: "AI: rename / re-describe a project.", mapsTo: "update_project" },
  { name: "simplememory_delete_project", description: "AI: delete a project.", mapsTo: "delete_project" },
  { name: "simplememory_add_personal", description: "AI: store a personal entry (stays local).", mapsTo: "create_personal" },
  { name: "simplememory_update_personal", description: "AI: replace a personal entry.", mapsTo: "update_personal" },
  { name: "simplememory_delete_personal", description: "AI: delete a personal entry.", mapsTo: "delete_personal" },
  { name: "simplememory_link", description: "AI: relate two entities (project uses skill…).", mapsTo: "create_connection" },
  { name: "simplememory_unlink", description: "AI: remove a relation.", mapsTo: "delete_connection" },
];

const mcpClientConfig = (path: string) => JSON.stringify({
  mcpServers: {
    simplememory: {
      command: "<path-to>\\simplememory-mcp.exe",
      env: { SIMPLEMEMORY_DB: path },
    },
  },
}, null, 2);

export function Settings() {
  const toast = useApp((s) => s.toast);
  const refreshStats = useApp((s) => s.refreshStats);
  const stats = useApp((s) => s.stats);
  const aiProvider = useApp((s) => s.aiProvider);
  const setAiProvider = useApp((s) => s.setAiProvider);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const clientConfig = mcpClientConfig(dbInfo?.path ?? "<database path>");
  const [density, setDensity] = useState("comfortable");
  const [projects, setProjects] = useState<Project[]>([]);
  const [ctxProject, setCtxProject] = useState("");
  const [ctxQuery, setCtxQuery] = useState("");
  const [ctxOut, setCtxOut] = useState<string | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("Updates are checked only when you request them.");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [dlProgress, setDlProgress] = useState<number | null>(null);
  const [dlDone, setDlDone] = useState(false);
  const [dlError, setDlError] = useState("");
  const [curVersion, setCurVersion] = useState("");
  const updateRef = useRef<Update | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { updateRef.current?.close().catch(() => {}); }, []);

  useEffect(() => {
    api.dbInfo().then(setDbInfo).catch(() => {});
    getVersion().then(setCurVersion).catch(() => {});
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

  const checkUpdate = async () => {
    setUpdateBusy(true);
    setUpdateStatus("Checking GitHub Releases…");
    try {
      const previous = updateRef.current;
      updateRef.current = null;
      await previous?.close().catch(() => {});
      updateRef.current = await check();
      if (updateRef.current) {
        setPendingUpdate(updateRef.current);
        setDlProgress(null);
        setDlDone(false);
        setDlError("");
        setUpdateStatus(`Version ${updateRef.current.version} is available.`);
      } else {
        setUpdateStatus("You have the latest version.");
        toast("success", "You have the latest version");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setUpdateStatus(message.includes("404") ? "No release has been published yet." : message);
      toast("error", message.includes("404") ? "No release published yet" : message);
    } finally {
      setUpdateBusy(false);
    }
  };

  const downloadUpdate = async () => {
    if (!updateRef.current) return;
    setUpdateBusy(true);
    setDlError("");
    let downloaded = 0;
    let total = 0;
    try {
      await updateRef.current.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        setDlProgress(total ? Math.round((downloaded / total) * 100) : null);
      });
      setDlDone(true);
      setDlProgress(100);
      setUpdateStatus("Update installed. Restart Contexta.");
    } catch (e) {
      setDlError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setUpdateBusy(false);
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
      transport: "stdio (simplememory-mcp binary)",
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
    <div className="page settings-page">
      <div className="page-head">
        <h1>Settings</h1>
        <div className="sub">Choose your AI, adjust the interface and manage local data.</div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">AI provider</span></div>
        <AIProviderPicker value={aiProvider ?? null} onSaved={setAiProvider} />
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
          <div className="kv"><span className="k">Theme</span><span className="mono-dim">Dark</span></div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Updates</span></div>
        <div className="card">
          <div className="toolbar" style={{ alignItems: "center", marginBottom: 4 }}>
            <button className="btn sm" onClick={checkUpdate} disabled={updateBusy}>Check for updates</button>
          </div>
          <div className="mono-dim" role="status">{updateStatus}</div>
        </div>
      </div>
      <UpdateModal
        open={pendingUpdate !== null}
        currentVersion={curVersion}
        newVersion={pendingUpdate?.version ?? ""}
        notes={(pendingUpdate?.body ?? "").slice(0, 1200)}
        busy={updateBusy}
        progress={dlProgress}
        done={dlDone}
        error={dlError}
        onDownload={downloadUpdate}
        onClose={() => {
          if (!updateBusy) setPendingUpdate(null);
        }}
      />

      <div className="section">
        <div className="section-head"><span className="section-title">Database</span></div>
        <div className="card">
          <div className="kv"><span className="k">Location</span><span className="mono-dim settings-path">{dbInfo?.path ?? "…"}</span></div>
          <div className="kv"><span className="k">Size</span><span>{dbInfo ? `${(dbInfo.size_bytes / 1024).toFixed(1)} KB` : "…"}</span></div>
          <div className="kv"><span className="k">Totals</span><span>{stats ? `${stats.projects} projects · ${stats.memories} memories · ${stats.rules} rules · ${stats.skills} skills` : "…"}</span></div>
          <div className="settings-actions">
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
      </div>

      <details className="settings-advanced">
        <summary>Developer tools</summary>
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
            <Plug size={12} style={{ display: "inline", verticalAlign: -1 }} /> Model Context Protocol over stdio —
            read <em>and</em> write. Build: <span className="code">cargo build --release --bin simplememory-mcp</span>,
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
                <div className="row-meta"><span className="mono-dim">→ {t.mapsTo}</span></div>
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
      </details>
    </div>
  );
}
