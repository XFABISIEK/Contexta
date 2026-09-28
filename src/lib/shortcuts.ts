import { api } from "./tauri";

export interface ShortcutBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** Lowercase single key, e.g. "k", "f", "n". */
  key: string;
}

export interface ShortcutAction {
  id: "palette" | "search" | "newMemory";
  label: string;
  hint: string;
  defaults: ShortcutBinding;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: "palette",
    label: "Command palette",
    hint: "Navigation and creation shortcuts",
    defaults: { ctrl: true, shift: false, alt: false, key: "k" },
  },
  {
    id: "search",
    label: "Global search",
    hint: "SQLite FTS5 grouped by entity type",
    defaults: { ctrl: true, shift: true, alt: false, key: "f" },
  },
  {
    id: "newMemory",
    label: "New memory",
    hint: "Open the memory composer anywhere",
    defaults: { ctrl: true, shift: false, alt: false, key: "n" },
  },
];

/** Fixed shortcuts that stay hardcoded (listed in Settings for reference). */
export const FIXED_SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "Alt + 1…6", label: "Jump between main views" },
  { keys: "+ / - / 0", label: "Graph zoom in, out, fit (on the graph)" },
  { keys: "↑ / ↓ + Enter", label: "Move in lists, open highlighted row" },
  { keys: "Esc", label: "Close dialogs" },
];

const key = (id: string) => `shortcut.${id}`;

export function formatBinding(b: ShortcutBinding): string {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key);
  return parts.join(" + ");
}

export function matchesBinding(e: KeyboardEvent, b: ShortcutBinding): boolean {
  // Ctrl and Meta (Cmd) count as the same modifier.
  const mod = e.ctrlKey || e.metaKey;
  if (mod !== b.ctrl) return false;
  if (e.shiftKey !== b.shift || e.altKey !== b.alt) return false;
  return e.key.toLowerCase() === b.key.toLowerCase();
}

/** Build a binding from a captured keydown, or null for lone modifiers. */
export function bindingFromEvent(e: KeyboardEvent): ShortcutBinding | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  return {
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
    key: e.key.toLowerCase(),
  };
}

function parseBinding(raw: string | undefined, fallback: ShortcutBinding): ShortcutBinding {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as Partial<ShortcutBinding>;
    if (typeof v.key !== "string" || !v.key) return fallback;
    return { ctrl: !!v.ctrl, shift: !!v.shift, alt: !!v.alt, key: v.key.toLowerCase() };
  } catch {
    return fallback;
  }
}

export async function loadBindings(): Promise<Record<ShortcutAction["id"], ShortcutBinding>> {
  let settings: Record<string, string> = {};
  try {
    settings = await api.settings.all();
  } catch {
    /* defaults */
  }
  return bindingsFromSettings(settings);
}

export function bindingsFromSettings(settings: Record<string, string>): Record<ShortcutAction["id"], ShortcutBinding> {
  const out = {} as Record<ShortcutAction["id"], ShortcutBinding>;
  for (const a of SHORTCUT_ACTIONS) {
    out[a.id] = parseBinding(settings[key(a.id)], a.defaults);
  }
  return out;
}

export function saveBinding(id: ShortcutAction["id"], b: ShortcutBinding): Promise<void> {
  return api.settings.set(key(id), JSON.stringify(b));
}

export function defaultBindings(): Record<ShortcutAction["id"], ShortcutBinding> {
  const out = {} as Record<ShortcutAction["id"], ShortcutBinding>;
  for (const a of SHORTCUT_ACTIONS) out[a.id] = { ...a.defaults };
  return out;
}
