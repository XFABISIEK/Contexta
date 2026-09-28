import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Github, ShieldCheck } from "lucide-react";
import { useApp } from "../stores/app-store";
import appIcon from "../../src-tauri/icons/128x128.png";

const REPOSITORY = "https://github.com/XFABISIEK/Contexa";

export function Information() {
  const toast = useApp((s) => s.toast);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

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
          <div className="kv"><span className="k"><ShieldCheck size={13} /></span><span>No cloud sync, telemetry or analytics. Everything stays on this machine.</span></div>
          <div className="kv"><span className="k">Storage</span><span className="mono-dim">Your data is stored in one local SQLite database.</span></div>
        </div>
      </div>
    </div>
  );
}
