import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, FolderOpen } from "lucide-react";
import { api } from "../lib/tauri";

export function StorageSetup({ defaultPath, onComplete }: { defaultPath: string; onComplete: () => void }) {
  const [directory, setDirectory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chooseFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setDirectory(selected);
        setError("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not choose a folder.");
    }
  };

  const continueSetup = async () => {
    setBusy(true);
    setError("");
    try {
      await api.storage.complete(directory);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save storage location.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-setup storage-setup">
      <div className="ai-picker-content">
        <div className="section-title">Contexta · setup</div>
        <h1>Where should Contexta save your information?</h1>
        <p className="mono-dim">Choose a folder before setting up your AI. If you choose another folder, Contexta copies existing data and keeps the original database.</p>
        <button type="button" className={`storage-choice${directory === null ? " active" : ""}`} onClick={() => setDirectory(null)} aria-pressed={directory === null}>
          <Database aria-hidden="true" />
          <span><strong>Default location</strong><small>{defaultPath}</small></span>
        </button>
        <button type="button" className={`storage-choice${directory !== null ? " active" : ""}`} onClick={chooseFolder} aria-pressed={directory !== null}>
          <FolderOpen aria-hidden="true" />
          <span><strong>Choose a folder</strong><small>{directory ?? "Pick another location on this computer"}</small></span>
        </button>
        {error && <div className="ai-picker-error" role="alert">{error}</div>}
        <div className="ai-picker-footer">
          <span className="mono-dim">You can back up the database later in Settings.</span>
          <button className="btn primary" type="button" disabled={busy} onClick={continueSetup}>{busy ? "Saving…" : "Continue"}</button>
        </div>
      </div>
    </div>
  );
}
