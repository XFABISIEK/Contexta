import { Download, PartyPopper } from "lucide-react";
import { Modal } from "./Modal";

interface UpdateModalProps {
  open: boolean;
  currentVersion: string;
  newVersion: string;
  notes: string;
  busy: boolean;
  progress: number | null;
  done: boolean;
  error: string;
  onDownload: () => void;
  onClose: () => void;
}

/** Centered update notification with a Download button. */
export function UpdateModal({
  open,
  currentVersion,
  newVersion,
  notes,
  busy,
  progress,
  done,
  error,
  onDownload,
  onClose,
}: UpdateModalProps) {
  return (
    <Modal
      open={open}
      title={done ? "Update installed" : "Update available"}
      onClose={onClose}
      footer={
        done ? (
          <button className="btn primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose} disabled={busy}>
              Later
            </button>
            <button className="btn primary" onClick={onDownload} disabled={busy}>
              <Download size={14} />
              {progress !== null ? `Downloading… ${progress}%` : `Download ${newVersion}`}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <PartyPopper size={18} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0 }}>
            Contexta {newVersion} is installed. Restart the app to use it.
          </p>
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 8px" }}>
            A new version is available{currentVersion ? ` (you have ${currentVersion})` : ""}.
          </p>
          {notes && <div className="md-preview" style={{ maxHeight: 200 }}>{notes}</div>}
          {busy && (
            <div className="update-progress" aria-label="Download progress">
              <div
                className="update-progress-bar"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          )}
          {error && <div className="field-err">{error}</div>}
        </>
      )}
    </Modal>
  );
}
