import { Suspense, lazy, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "./stores/app-store";
import { api } from "./lib/tauri";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearch } from "./components/GlobalSearch";
import { Toasts } from "./components/Toasts";
import { AIProviderPicker } from "./components/AIProviderPicker";
import { StorageSetup } from "./components/StorageSetup";
import { EntityModals, DeleteConfirm } from "./components/EntityModals";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { Memories } from "./pages/Memories";
import { Rules } from "./pages/Rules";
import { Skills } from "./pages/Skills";
import { Personal } from "./pages/Personal";
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
  const [storageReady, setStorageReady] = useState<boolean | undefined>();
  const [defaultPath, setDefaultPath] = useState("");
  const [startupError, setStartupError] = useState("");

  // Initial load: stats + dev seed when the database is empty.
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
      const stats = useApp.getState().stats;
      if (stats && stats.projects === 0 && import.meta.env.DEV) {
        try {
          await api.seed();
        } catch {
          /* seed is best-effort */
        }
        if (!cancelled) await refreshStats();
      }
      // Restore density preference.
      try {
        const settings = await api.settings.all();
        if (cancelled) return;
        if (settings.density) document.documentElement.dataset.density = settings.density;
        setAiProvider(settings.ai_provider?.trim() || null);
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
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useApp.getState().setPalette(!useApp.getState().paletteOpen);
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useApp.getState().setPalette(!useApp.getState().paletteOpen);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        useApp.getState().setSearch(!useApp.getState().searchOpen);
      } else if (e.key === "Escape") {
        useApp.getState().setPalette(false);
        useApp.getState().setSearch(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (startupError) return <div className="app"><Titlebar /><div className="ai-setup mono-dim" role="alert">{startupError}</div></div>;
  if (storageReady === undefined) return <div className="app"><Titlebar /><div className="ai-setup mono-dim">Loading storage…</div></div>;
  if (!storageReady) return <div className="app"><Titlebar /><StorageSetup defaultPath={defaultPath} onComplete={() => setStorageReady(true)} /><Toasts /></div>;
  if (aiProvider === undefined) return <div className="app"><Titlebar /><div className="ai-setup mono-dim">Loading settings…</div></div>;
  if (aiProvider === null) return <div className="app"><Titlebar /><AIProviderPicker value={null} onSaved={setAiProvider} setup /><Toasts /></div>;

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
              {view === "information" && <Information />}
              {view === "settings" && <Settings />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <GlobalSearch />
      <EntityModals />
      <DeleteConfirm />
      <Toasts />
    </div>
  );
}
