import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import appIcon from "../../src-tauri/icons/128x128.png";

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  const win = () => getCurrentWindow();

  return (
    <div className="titlebar">
      <div className="tb-drag" data-tauri-drag-region>
        <span className="tb-logo">
          <img src={appIcon} alt="" />
          Contexta
        </span>
      </div>
      <div className="tb-controls">
        <button className="tb-btn" title="Minimize" onClick={() => win().minimize()}>
          <Minus />
        </button>
        <button
          className="tb-btn"
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => win().toggleMaximize()}
        >
          {maximized ? <Copy /> : <Square />}
        </button>
        <button className="tb-btn close" title="Close" onClick={() => win().close()}>
          <X />
        </button>
      </div>
    </div>
  );
}
