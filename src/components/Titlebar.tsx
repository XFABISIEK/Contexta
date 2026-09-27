import { useEffect, useState } from "react";
import { Minus, Square, Copy, X, Search } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../stores/app-store";
import appIcon from "../../src-tauri/icons/128x128.png";

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);
  const setSearch = useApp((s) => s.setSearch);

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

  // Double-click empty titlebar area toggles maximize (buttons excluded).
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tb-btn, .tb-search-box")) return;
    win().toggleMaximize().catch(() => {});
  };

  return (
    <div className="titlebar" data-tauri-drag-region onDoubleClick={onDoubleClick}>
      <div className="tb-drag" data-tauri-drag-region>
        <span className="tb-logo">
          <img src={appIcon} alt="" draggable={false} />
          Contexta
        </span>
      </div>
      <div className="tb-search">
        <button className="tb-search-box" onClick={() => setSearch(true)} title="Search (Ctrl+Shift+F)">
          <Search />
          <span>Search memories, projects, rules…</span>
          <span className="kbd">Ctrl+Shift+F</span>
        </button>
      </div>
      <div className="tb-spacer" data-tauri-drag-region />
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
