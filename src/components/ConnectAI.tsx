import { useEffect, useState } from "react";
import { Copy, Check, Plug } from "lucide-react";
import { api } from "../lib/tauri";
import { mcpClientConfig } from "../pages/Settings";

const AGENT_PROMPT = `You are working in a project tracked by Contexta, a local knowledge base exposed via MCP tools (contexa_*).

At the start of each task:
1. Call contexa_get_project_context with { project: "<name>", query: "<task>", max_results: 10 }.
2. Follow the returned critical rules first; reuse the listed skills instead of reinventing them.
3. Use contexa_search before asking the user for facts the tools can return.

While working:
- Store durable decisions with contexa_add_memory (priority: critical, high, normal, low).
- Relate items with contexa_link.

Never invent project facts the tools can return. Personal entries stay local.`;

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="md-preview" style={{ maxHeight: 180 }}>{text}</div>
      <div style={{ marginTop: 8 }}>
        <button className="btn sm" type="button" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : `Copy ${label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}

export function ConnectAI({ onComplete }: { onComplete: () => void }) {
  const [dbPath, setDbPath] = useState("<database path>");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.dbInfo().then((info) => setDbPath(info.path)).catch(() => {});
  }, []);

  const finish = async () => {
    setBusy(true);
    try {
      await api.settings.set("connect_done", "1");
      onComplete();
    } catch {
      onComplete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-setup">
      <div className="ai-picker-content">
        <div className="section-title">Contexta · setup</div>
        <h1>Connect your coding agent</h1>
        <p className="mono-dim">
          <Plug size={12} style={{ display: "inline", verticalAlign: -1 }} /> MCP is the better hookup:
          live read/write tools with the same validation as this UI. A skill is static text and goes stale.
          Build once with <span className="code">cargo build --release --bin contexa-mcp</span>,
          point your client at the exe, then paste the prompt into your agent.
        </p>
        <CopyBlock label="MCP client config" text={mcpClientConfig(dbPath)} />
        <CopyBlock label="Agent prompt" text={AGENT_PROMPT} />
        <div className="ai-picker-footer">
          <span className="mono-dim">You can re-copy both later in Settings → MCP.</span>
          <button className="btn primary" type="button" disabled={busy} onClick={finish}>
            {busy ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
