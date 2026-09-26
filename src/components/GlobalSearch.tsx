import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Folder, Brain, ScrollText, Wrench, User } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { debounce } from "../lib/utils";
import type { SearchResult } from "../types";

const GROUP_ORDER = ["project", "memory", "rule", "skill", "personal"] as const;
const GROUP_LABEL: Record<string, string> = {
  project: "Projects",
  memory: "Memories",
  rule: "Rules",
  skill: "Skills",
  personal: "Personal",
};
const GROUP_ICON: Record<string, typeof Folder> = {
  project: Folder,
  memory: Brain,
  rule: ScrollText,
  skill: Wrench,
  personal: User,
};

export function GlobalSearch() {
  const open = useApp((s) => s.searchOpen);
  const setSearch = useApp((s) => s.setSearch);
  const go = useApp((s) => s.go);
  const setComposer = useApp((s) => s.setComposer);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = useMemo(
    () =>
      debounce(async (q: string) => {
        if (!q.trim()) {
          setResults([]);
          setLoading(false);
          return;
        }
        try {
          const page = await api.search(q.trim(), undefined, null, 40, 0);
          setResults(page.items);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250),
    [],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const close = () => setSearch(false);

  const openResult = (r: SearchResult) => {
    close();
    if (r.entity_type === "project") {
      go("projects", r.entity_id);
    } else {
      const kind = r.entity_type as "memory" | "rule" | "skill" | "personal";
      setComposer({ kind, editId: r.entity_id });
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
            aria-label="Global search"
          >
            <div className="palette-input">
              <Search />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLoading(true);
                  run(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) openResult(results[0]);
                }}
                placeholder="Search memories, projects, rules and skills..."
                aria-label="Global search"
              />
            </div>
            <div className="palette-list">
              {loading && <div className="mono-dim" style={{ padding: "10px" }}>Searching…</div>}
              {!loading && query.trim() && results.length === 0 && (
                <div className="mono-dim" style={{ padding: "10px" }}>No results.</div>
              )}
              {GROUP_ORDER.map((g) => {
                const items = results.filter((r) => r.entity_type === g);
                if (items.length === 0) return null;
                const Icon = GROUP_ICON[g];
                return (
                  <div key={g}>
                    <div className="palette-group">{GROUP_LABEL[g]}</div>
                    {items.map((r) => (
                      <button key={`${r.entity_type}:${r.entity_id}`} className="palette-item" onClick={() => openResult(r)}>
                        <Icon />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                        <span className="sub" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
