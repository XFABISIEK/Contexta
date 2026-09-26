import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "./stores/app-store";
import { api } from "./lib/tauri";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { GlobalSearch } from "./components/GlobalSearch";
import { Toasts } from "./components/Toasts";
import { EntityModals, DeleteConfirm } from "./components/EntityModals";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { Memories } from "./pages/Memories";
import { Rules } from "./pages/Rules";
import { Skills } from "./pages/Skills";
import { Personal } from "./pages/Personal";
import { Settings } from "./pages/Settings";

const GraphView = lazy(() =>
  import("./pages/GraphView").then((m) => ({ default: m.GraphView })),
);

export function App() {
  const view = useApp((s) => s.view);
  const refreshStats = useApp((s) => s.refreshStats);

  // Initial load: stats + dev seed when the database is empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        if (settings.density) document.documentElement.dataset.density = settings.density;
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStats]);

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
