import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "./stores/app-store";
import { api } from "./lib/tauri";
import { bindingsFromSettings, defaultBindings, matchesBinding, type ShortcutAction, type ShortcutBinding } from "./lib/shortcuts";
import { applyAccent, applyMotion, DEFAULT_ACCENT } from "./lib/utils";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearch } from "./components/GlobalSearch";
import { Toasts } from "./components/Toasts";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { AIProviderPicker } from "./components/AIProviderPicker";
import { ConnectAI } from "./components/ConnectAI";
import { StorageSetup } from "./components/StorageSetup";
import { EntityModals, DeleteConfirm } from "./components/EntityModals";
import { Dashboard } from "./pages/Dashboard";
import { Database } from "./pages/Database";
import { Projects } from "./pages/Projects";
import { Memories } from "./pages/Memories";
import { Rules } from "./pages/Rules";
import { Skills } from "./pages/Skills";
import { Personal } from "./pages/Personal";
import { Profile } from "./pages/Profile";
import { Mcp } from "./pages/Mcp";
import { Settings } from "./pages/Settings";
import { Information } from "./pages/Information";

const GraphView = lazy(() =>
  import("./pages/GraphView").then((m) => ({ default: m.GraphView })),
);

export function App() {
  const view = useApp((s) => s.view);
  const refreshStats = useApp((s) => s.refreshStats);
  const aiProvider = useApp((s) => s.aiProvider);
  const setAiProvider = useApp((s) => s.setAiProvider);
  const showStatus = useApp((s) => s.showStatus);
  const setShowStatus = useApp((s) => s.setShowStatus);
  const [storageReady, setStorageReady] = useState<boolean | undefined>();
  const [connectDone, setConnectDone] = useState<boolean | undefined>();
  const [defaultPath, setDefaultPath] = useState("");
  const [startupError, setStartupError] = useState("");
  // Customizable bindings (Settings → Shortcuts); loaded with preferences.
  const shortcutsRef = useRef<Record<ShortcutAction["id"], ShortcutBinding> | null>(null);

  // Initial load: stats, then preferences.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (storageReady === false) return;
      if (storageReady === undefined) {
        try {
          const storage = await api.storage.info();
          if (cancelled) return;
          setDefaultPath(storage.default_path);
          setStorageReady(storage.configured);
        } catch (e) {
          if (!cancelled) setStartupError(e instanceof Error ? e.message : "Could not load storage settings.");
        }
        return;
      }
      await refreshStats();
      if (cancelled) return;
      // No auto-seed: a fresh database stays empty. Demo data is available
      // on demand via the `seed_dev_data` command (tests, manual runs).
      // Restore density preference.
      try {
        const settings = await api.settings.all();
        if (cancelled) return;
        if (settings.density) document.documentElement.dataset.density = settings.density;
        applyAccent(settings.accent || DEFAULT_ACCENT);
        applyMotion(settings.motion !== "0");
        if (settings.zoom && settings.zoom !== "100") document.documentElement.dataset.zoom = settings.zoom;
        if (settings.statusbar === "0") setShowStatus(false);
        setAiProvider(settings.ai_provider?.trim() || null);
        setConnectDone(settings.connect_done === "1");
        shortcutsRef.current = bindingsFromSettings(settings);
      } catch {
        if (!cancelled) setAiProvider(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStats, setAiProvider, storageReady]);

  // Global shortcuts: Ctrl+K / Ctrl+P palette, Ctrl+Shift+F search.
  useEffect(() => {
    const views = ["dashboard", "projects", "memories", "rules", "skills", "graph", "mcp"] as const;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const bindings = shortcutsRef.current ?? defaultBindings();
      const typing = !!(e.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if (matchesBinding(e, bindings.palette)) {
        e.preventDefault();
        useApp.getState().setPalette(!useApp.getState().paletteOpen);
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useApp.getState().setPalette(!useApp.getState().paletteOpen);
      } else if (matchesBinding(e, bindings.search)) {
        e.preventDefault();
        useApp.getState().setSearch(!useApp.getState().searchOpen);
      } else if (e.key === "Escape") {
        useApp.getState().setPalette(false);
        useApp.getState().setSearch(false);
      } else if (matchesBinding(e, bindings.newMemory) && !typing) {
        // New memory from anywhere.
        e.preventDefault();
        useApp.getState().setComposer({ kind: "memory" });
      } else if (e.altKey && !mod && !typing && /^[1-7]$/.test(e.key)) {
        // Alt+1..7 jumps between main views.
        e.preventDefault();
        useApp.getState().go(views[Number(e.key) - 1]);
      } else if (useApp.getState().view === "graph" && !typing && (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "0")) {
        // Graph zoom controls: + in, - out, 0 fit.
        e.preventDefault();
        const detail = e.key === "0" ? "fit" : e.key === "-" ? "out" : "in";
        window.dispatchEvent(new CustomEvent("contexa:graph-zoom", { detail }));
      }
    };
    window.addEventListener("keydown", onKey);
    // Desktop app: no right-click menu.
    const noMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", noMenu);
    };
  }, []);

  // Arrow navigation across list rows: Up/Down moves the highlight,
  // Enter activates it. Skipped while typing, in overlays, or on the graph.
  useEffect(() => {
    const onArrows = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
      const st = useApp.getState();
      if (st.paletteOpen || st.searchOpen || st.composer || st.confirmDelete) return;
      if (st.view === "graph") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable], button")) return;
      const rows = [...document.querySelectorAll(".content .row")].filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }) as HTMLElement[];
      if (rows.length === 0) return;
      const box = onArrows as unknown as { last?: HTMLElement };
      if (e.key === "Enter") {
        const cur = box.last && rows.includes(box.last) ? box.last : null;
        if (cur) {
          e.preventDefault();
          cur.click();
        }
        return;
      }
      e.preventDefault();
      let idx = box.last ? rows.indexOf(box.last) : -1;
      if (idx === -1) idx = e.key === "ArrowDown" ? -1 : rows.length;
      idx = e.key === "ArrowDown" ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
      rows.forEach((r) => r.classList.remove("kb-focus"));
      rows[idx].classList.add("kb-focus");
      box.last = rows[idx];
      rows[idx].scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onArrows);
    return () => window.removeEventListener("keydown", onArrows);
  }, []);

  // Hot-reload customizable bindings after a Settings change.
  useEffect(() => {
    const reload = () => {
      api.settings.all().then((s) => {
        shortcutsRef.current = bindingsFromSettings(s);
      }).catch(() => {});
    };
    window.addEventListener("contexa:shortcuts", reload);
    return () => window.removeEventListener("contexa:shortcuts", reload);
  }, []);

  if (startupError) return <div className="app"><Titlebar /><div className="ai-setup mono-dim" role="alert">{startupError} <button className="btn primary" type="button" onClick={() => window.location.reload()}>Retry</button></div></div>;
  if (storageReady === undefined) return <div className="app"><Titlebar /><div className="ai-setup mono-dim">Loading storage…</div></div>;
  if (!storageReady) return <div className="app"><Titlebar /><StorageSetup defaultPath={defaultPath} onComplete={() => setStorageReady(true)} /><Toasts /></div>;
  if (aiProvider === undefined) return <div className="app"><Titlebar /><div className="ai-setup mono-dim">Loading settings…</div></div>;
  if (aiProvider === null) return <div className="app"><Titlebar /><AIProviderPicker value={null} onSaved={(v) => { setAiProvider(v); setConnectDone(false); }} setup /><Toasts /></div>;
  if (connectDone === undefined) return <div className="app"><Titlebar /><div className="ai-setup mono-dim">Loading settings…</div></div>;
  if (!connectDone) return <div className="app"><Titlebar /><ConnectAI onComplete={() => setConnectDone(true)} /><Toasts /></div>;

  return (
    <div className="app">
      <Titlebar />
      <div className="main">
        <Sidebar />
        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ height: "100%" }}
            >
              {view === "dashboard" && <Dashboard />}
              {view === "graph" && (
                <Suspense fallback={<div className="page mono-dim">Loading graph…</div>}>
                  <GraphView />
                </Suspense>
              )}
              {view === "projects" && <Projects />}
              {view === "memories" && <Memories />}
              {view === "rules" && <Rules />}
              {view === "skills" && <Skills />}
              {view === "personal" && <Personal />}
              {view === "database" && <Database />}
              {view === "profile" && <Profile />}
              {view === "information" && <Information />}
              {view === "mcp" && <Mcp />}
              {view === "settings" && <Settings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {showStatus && <StatusBar />}
      <CommandPalette />
      <GlobalSearch />
      <EntityModals />
      <DeleteConfirm />
      <UpdatePrompt />
      <Toasts />
    </div>
  );
}
