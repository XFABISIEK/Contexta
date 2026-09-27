import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, ShieldCheck, Database, Cpu, Folder, Brain, ScrollText, Wrench } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { AIIcon } from "../components/AIProviderPicker";
import appIcon from "../../src-tauri/icons/128x128.png";
import ponytailLicense from "../assets/skills/LICENSE.ponytail?raw";
import type { DbInfo } from "../types";

const REPOSITORY = "https://github.com/XFABISIEK/SimpleMemory";

export function Information() {
  const toast = useApp((s) => s.toast);
  const stats = useApp((s) => s.stats);
  const refreshStats = useApp((s) => s.refreshStats);
  const aiProvider = useApp((s) => s.aiProvider);
  const [version, setVersion] = useState("");
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    api.dbInfo().then(setDbInfo).catch(() => {});
    refreshStats();
  }, [refreshStats]);

  const openGitHub = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not open GitHub");
    }
  };

  return (
    <div className="page information-page">
      <div className="page-head">
        <h1>Information</h1>
        <div className="sub">About Contexta and this memory space.</div>
      </div>

      <div className="card information-identity">
        <img src={appIcon} alt="" draggable={false} />
        <div>
          <h2>Contexta</h2>
          <div className="mono-dim">{version ? `Version ${version}` : "Local memory layer for AI"}</div>
        </div>
        {aiProvider && (
          <div className="information-ai" title={`AI: ${aiProvider}`}>
            <AIIcon provider={aiProvider} />
          </div>
        )}
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="stat-card">
          <div className="stat-label"><Folder /> Projects</div>
          <div className="stat-value">{stats ? stats.projects : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Brain /> Memories</div>
          <div className="stat-value">{stats ? stats.memories : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><ScrollText /> Rules</div>
          <div className="stat-value">{stats ? stats.rules : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Wrench /> Skills</div>
          <div className="stat-value">{stats ? stats.skills : "—"}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">This setup</span></div>
        <div className="card">
          <div className="kv">
            <span className="k"><Database size={13} /></span>
            <span className="mono-dim">{dbInfo?.path ?? "…"}</span>
          </div>
          <div className="kv">
            <span className="k">Size</span>
            <span>{dbInfo ? `${(dbInfo.size_bytes / 1024).toFixed(1)} KB` : "…"}</span>
          </div>
          <div className="kv">
            <span className="k"><Cpu size={13} /></span>
            <span>{aiProvider ? `AI assistant: ${aiProvider}` : "No AI assistant chosen"}</span>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">GitHub</span></div>
        <div className="card">
          <p className="mono-dim information-description">Source code, issues and published versions are available in the project repository.</p>
          <div className="information-links">
            <button className="btn primary" onClick={() => openGitHub(REPOSITORY)}><Github /> Repository</button>
            <button className="btn" onClick={() => openGitHub(`${REPOSITORY}/releases`)}><Github /> Releases</button>
          </div>
          <div className="mono-dim information-url">{REPOSITORY}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-head"><span className="section-title">Privacy</span></div>
        <div className="card">
          <div className="kv"><span className="k"><ShieldCheck size={13} /></span><span>No cloud sync, telemetry or analytics. Update checks contact GitHub on request.</span></div>
          <div className="kv"><span className="k">Storage</span><span className="mono-dim">Your data is stored in one local SQLite database.</span></div>
        </div>
      </div>
      <details className="settings-advanced">
        <summary>Third-party icon license · Ponytail</summary>
        <div className="md-preview">{ponytailLicense}</div>
      </details>
    </div>
  );
}
