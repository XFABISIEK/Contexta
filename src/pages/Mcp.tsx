import { useEffect, useState } from "react";
import { Copy, Plug, Database } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { MCP_BINARY, MCP_PRESETS, MCP_SERVER_NAME, MCP_TOOLS } from "../lib/mcp";
import appIcon from "../../src-tauri/icons/128x128.png";
import type { DbInfo } from "../types";

export function Mcp() {
  const toast = useApp((s) => s.toast);
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);
  const reads = MCP_TOOLS.filter((t) => t.kind === "read");
  const writes = MCP_TOOLS.filter((t) => t.kind === "write");
  const [exe, setExe] = useState("");
  const [presetId, setPresetId] = useState(MCP_PRESETS[0].id);
  const preset = MCP_PRESETS.find((pr) => pr.id === presetId) ?? MCP_PRESETS[0];
  const snippet = preset.json(exe.trim(), dbInfo?.path ?? "<database path>");
  const [writeMode, setWriteMode] = useState<"allow" | "readonly">("allow");

  useEffect(() => {
    api.dbInfo().then(setDbInfo).catch(() => {});
    api.settings.all().then((s) => {
      if (s.mcp_write === "readonly") setWriteMode("readonly");
    }).catch(() => {});
  }, []);

  const setMode = async (v: "allow" | "readonly") => {
    setWriteMode(v);
    try {
      await api.settings.set("mcp_write", v);
      toast("success", v === "readonly" ? "MCP write tools blocked" : "MCP write tools allowed");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Failed to save mode");
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("success", `${label} copied`);
    } catch {
      toast("error", "Clipboard unavailable");
    }
  };

  const copySpec = () =>
    copy(
      JSON.stringify(
        {
          server: MCP_SERVER_NAME,
          transport: `stdio (${MCP_BINARY} binary)`,
          tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, mapsTo: t.mapsTo })),
          example: {
            tool: "contexa_get_project_context",
            input: { project: "Axiom", query: "How should I implement authentication?", max_results: 10 },
          },
        },
        null,
        2,
      ),
      "MCP tool spec",
    );

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div className="information-identity" style={{ marginBottom: 6 }}>
          <img src={appIcon} alt={`${MCP_SERVER_NAME} icon`} draggable={false} />
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{MCP_SERVER_NAME}</h1>
            <div className="sub">Model Context Protocol server over stdio — read <em>and</em> write, same validation as this UI.</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Server</span></div>
        <div className="card">
          <div className="kv"><span className="k">Name</span><span className="code">{MCP_SERVER_NAME}</span></div>
          <div className="kv"><span className="k">Transport</span><span>stdio — no HTTP server, no network</span></div>
          <div className="kv"><span className="k">Binary</span><span className="code">{MCP_BINARY} (.exe)</span></div>
          <div className="kv"><span className="k">Database</span><span className="mono-dim settings-path">{dbInfo?.path ?? "…"}</span></div>
          <div className="kv"><span className="k">Tools</span><span>{reads.length} read · {writes.length} write</span></div>
          <div className="kv">
            <span className="k">Write tools</span>
            <span className="seg">
              <button className={writeMode === "allow" ? "active" : ""} onClick={() => setMode("allow")}>Allowed</button>
              <button className={writeMode === "readonly" ? "active" : ""} onClick={() => setMode("readonly")}>Read-only</button>
            </span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Connect a client</span></div>
        <div className="card">
          <p className="mono-dim" style={{ marginTop: 0 }}>
            <Plug size={12} style={{ display: "inline", verticalAlign: -1 }} /> Build once, then point any MCP client
            (Claude Desktop, Cursor, …) at the exe, optionally with <span className="code">CONTEXA_DB</span> pointing
            at the database above.
          </p>
          <div className="md-preview" style={{ marginBottom: 10 }}>cargo build --release --bin {MCP_BINARY}</div>
          <div className="search-input" style={{ marginBottom: 8 }}>
            <Plug size={14} />
            <input
              value={exe}
              onChange={(e) => setExe(e.target.value)}
              placeholder="<path-to>\contexa-mcp.exe"
              aria-label="Path to contexa-mcp.exe"
            />
          </div>
          <div className="seg" role="tablist" aria-label="MCP client" style={{ marginBottom: 8 }}>
            {MCP_PRESETS.map((pr) => (
              <button
                key={pr.id}
                role="tab"
                aria-selected={preset.id === pr.id}
                className={preset.id === pr.id ? "active" : ""}
                onClick={() => setPresetId(pr.id)}
              >
                {pr.label}
              </button>
            ))}
          </div>
          <div className="mono-dim" style={{ marginBottom: 8 }}>
            Paste into <span className="code">{preset.file}</span> - CONTEXA_DB already points at the database above.
          </div>
          <div className="md-preview" style={{ marginBottom: 10 }}>{snippet}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm primary" onClick={() => copy(snippet, `${preset.label} config`)}>
              <Copy size={14} /> Copy {preset.label} config
            </button>
            <button className="btn sm" onClick={copySpec}>
              <Copy size={14} /> Copy tool spec (JSON)
            </button>
          </div>
        </div>
      </div>

      {([
        ["Read tools — context retrieval", reads],
        ["Write tools — AI can store and curate memory", writes],
      ] as const).map(([title, tools]) => (
        <div className="section" key={title}>
          <div className="section-head"><span className="section-title">{title}</span></div>
          <div className="list">
            {tools.map((t) => (
              <div key={t.name} className="row" style={{ cursor: "default" }}>
                <div className="row-main">
                  <div className="row-title code" style={{ display: "inline-block" }}>{t.name}</div>
                  <div className="row-sub">{t.description}</div>
                </div>
                <div className="row-meta"><span className="mono-dim">→ {t.mapsTo}</span></div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="section">
        <div className="section-head"><span className="section-title">Storage</span></div>
        <div className="card">
          <p className="mono-dim" style={{ marginTop: 0 }}>
            <Database size={12} style={{ display: "inline", verticalAlign: -1 }} /> Without{" "}
            <span className="code">CONTEXA_DB</span> the server reads the selected storage location from{" "}
            <span className="code">storage.json</span> (or uses the default path).
          </p>
        </div>
      </div>
    </div>
  );
}
