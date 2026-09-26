import { create } from "zustand";
import { api } from "../lib/tauri";
import type { ComposerState, DashboardStats, View } from "../types";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

let toastSeq = 1;

interface AppState {
  view: View;
  selectedProjectId: string | null;
  paletteOpen: boolean;
  searchOpen: boolean;
  composer: ComposerState | null;
  confirmDelete: { title: string; detail?: string; onConfirm: () => void } | null;
  toasts: Toast[];
  stats: DashboardStats | null;
  dbOk: boolean;

  go: (view: View, projectId?: string | null) => void;
  setPalette: (open: boolean) => void;
  setSearch: (open: boolean) => void;
  setComposer: (c: ComposerState | null) => void;
  askDelete: (title: string, detail: string | undefined, onConfirm: () => void) => void;
  clearDelete: () => void;
  toast: (kind: Toast["kind"], message: string) => void;
  dismissToast: (id: number) => void;
  refreshStats: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  view: "dashboard",
  selectedProjectId: null,
  paletteOpen: false,
  searchOpen: false,
  composer: null,
  confirmDelete: null,
  toasts: [],
  stats: null,
  dbOk: false,

  go: (view, projectId) =>
    set({
      view,
      selectedProjectId: projectId === undefined ? get().selectedProjectId : projectId,
      paletteOpen: false,
      searchOpen: false,
    }),
  setPalette: (open) => set({ paletteOpen: open }),
  setSearch: (open) => set({ searchOpen: open }),
  setComposer: (composer) => set({ composer }),
  askDelete: (title, detail, onConfirm) => set({ confirmDelete: { title, detail, onConfirm } }),
  clearDelete: () => set({ confirmDelete: null }),

  toast: (kind, message) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-4), { id, kind, message }] });
    setTimeout(() => get().dismissToast(id), 3600);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  refreshStats: async () => {
    try {
      const stats = await api.stats();
      set({ stats, dbOk: true });
    } catch {
      set({ dbOk: false });
    }
  },
}));
