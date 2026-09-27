import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Network,
  Folder,
  Brain,
  ScrollText,
  Wrench,
  User,
  Settings,
  Info,
  CircleUserRound,
  Plus,
  Search,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../stores/app-store";
import { cx } from "../lib/utils";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Folder;
  run: () => void;
}

export function CommandPalette() {
  const open = useApp((s) => s.paletteOpen);
  const setPalette = useApp((s) => s.setPalette);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const setSearch = useApp((s) => s.setSearch);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  const commands: Cmd[] = useMemo(
    () => [
      { id: "dash", label: "Open Dashboard", icon: LayoutDashboard, run: () => go("dashboard") },
      { id: "graph", label: "Open Graph", icon: Network, run: () => go("graph") },
      { id: "projects", label: "Open Projects", icon: Folder, run: () => go("projects") },
      { id: "memories", label: "Open Memories", icon: Brain, run: () => go("memories") },
      { id: "rules", label: "Open Rules", icon: ScrollText, run: () => go("rules") },
      { id: "skills", label: "Open Skills", icon: Wrench, run: () => go("skills") },
      { id: "personal", label: "Open Personal", icon: User, run: () => go("personal") },
      { id: "profile", label: "Open Profile", icon: CircleUserRound, run: () => go("profile") },
      { id: "information", label: "Open Information", icon: Info, run: () => go("information") },
      { id: "settings", label: "Open Settings", icon: Settings, run: () => go("settings") },
      { id: "new-project", label: "New Project", icon: Plus, run: () => setComposer({ kind: "project" }) },
      { id: "new-memory", label: "New Memory", icon: Plus, run: () => setComposer({ kind: "memory" }) },
      { id: "new-rule", label: "New Rule", icon: Plus, run: () => setComposer({ kind: "rule" }) },
      { id: "new-skill", label: "New Skill", icon: Plus, run: () => setComposer({ kind: "skill" }) },
      { id: "search", label: "Search Memory…", hint: "Ctrl+Shift+F", icon: Search, run: () => setSearch(true) },
    ],
    [go, setComposer, setSearch],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => setIndex(0), [query]);

  // Keep the keyboard-selected item visible while arrowing through the list.
  useEffect(() => {
    const el = itemRefs.current.get(filtered[index]?.id ?? "");
    el?.scrollIntoView({ block: "nearest" });
  }, [index, filtered]);

  const close = () => setPalette(false);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const cmd = filtered[index];
      if (cmd) {
        close();
        cmd.run();
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="palette"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label="Command palette"
          >
            <div className="palette-input">
              <ChevronRight />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search commands..."
                aria-label="Search commands"
              />
            </div>
            <div className="palette-list">
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(c.id, el);
                    else itemRefs.current.delete(c.id);
                  }}
                  className={cx("palette-item", i === index && "active")}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => {
                    close();
                    c.run();
                  }}
                >
                  <c.icon />
                  {c.label}
                  {c.hint && <span className="sub">{c.hint}</span>}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="mono-dim" style={{ padding: "12px 10px" }}>
                  No matching commands.
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
