import { ShieldCheck } from "lucide-react";

export function StatusBar() {
  return (
    <div className="statusbar">
      <span className="st-right">
        <span className="st-item">
          <ShieldCheck />
          Local-only
        </span>
      </span>
    </div>
  );
}
