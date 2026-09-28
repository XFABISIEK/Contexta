import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import type { Update } from "@tauri-apps/plugin-updater";
import { useApp } from "../stores/app-store";
import { Modal } from "./Modal";
import { checkForUpdate } from "../lib/updater";

type Phase =
  | { kind: "idle" }
  | { kind: "available"; update: Update; current?: string }
  | { kind: "downloading"; update: Update; pct: number }
  | { kind: "installed"; update: Update };

/** Automatic update check (shortly after launch) + on-demand via Settings. */
export function UpdatePrompt() {
  const toast = useApp((s) => s.toast);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const runCheck = useCallback(async (manual: boolean) => {
    if (import.meta.env.DEV) {
      if (manual) toast("info", "Update checks run in release builds only");
      return;
    }
    const update = await checkForUpdate();
    if (!update) {
      if (manual) toast("success", "You're up to date");
      return;
    }
    const current = await getVersion().catch(() => "");
    setPhase({ kind: "available", update, current });
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => runCheck(false), 5000);
    const onDemand = () => runCheck(true);
    window.addEventListener("contexa:check-updates", onDemand);
    return () => {
      clearTimeout(t);
      window.removeEventListener("contexa:check-updates", onDemand);
    };
  }, [runCheck]);

  const install = async () => {
    if (phase.kind !== "available") return;
    const { update } = phase;
    setPhase({ kind: "downloading", update, pct: 0 });
    try {
      let length = 0;
      let done = 0;
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") {
          length = e.data.contentLength ?? 0;
        } else if (e.event === "Progress") {
          done += e.data.chunkLength;
          const pct = length > 0 ? Math.min(99, Math.round((done / length) * 100)) : 0;
          setPhase({ kind: "downloading", update, pct });
        } else if (e.event === "Finished") {
          setPhase({ kind: "downloading", update, pct: 100 });
        }
      });
      setPhase({ kind: "installed", update });
    } catch (err) {
      setPhase({ kind: "available", update });
      toast("error", err instanceof Error ? err.message : "Update failed");
    }
  };

  if (phase.kind === "idle") return null;
  const update = phase.update;

  return (
    <Modal
      open
      title={phase.kind === "installed" ? "Update installed" : `Update available: v${update.version}`}
      onClose={() => setPhase({ kind: "idle" })}
      footer={
        phase.kind === "available" ? (
          <>
            <button className="btn ghost" onClick={() => setPhase({ kind: "idle" })}>Later</button>
            <button className="btn primary" onClick={install}>Install v{update.version}</button>
          </>
        ) : phase.kind === "installed" ? (
          <button className="btn primary" onClick={() => setPhase({ kind: "idle" })}>Close</button>
        ) : undefined
      }
    >
      {phase.kind === "downloading" ? (
        <>
          <p className="mono-dim" style={{ marginTop: 0 }}>Downloading v{update.version}… {phase.pct}%</p>
          <div className="update-progress">
            <div className="update-progress-bar" style={{ width: `${phase.pct}%` }} />
          </div>
        </>
      ) : phase.kind === "installed" ? (
        <p className="mono-dim" style={{ margin: 0 }}>
          v{update.version} is installed. Restart Contexta to apply it.
        </p>
      ) : (
        <>
          {phase.current && update.currentVersion && (
            <p className="mono-dim" style={{ marginTop: 0 }}>
              Current: v{phase.current} → new: v{update.version}
            </p>
          )}
          {update.body && <div className="md-preview">{update.body.slice(0, 2000)}</div>}
        </>
      )}
    </Modal>
  );
}
