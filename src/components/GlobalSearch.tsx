import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Folder, Brain, ScrollText, Wrench, User } from "lucide-react";
import { useApp } from "../stores/app-store";
import { api } from "../lib/tauri";
import { cx, debounce } from "../lib/utils";
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
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const seq = useRef(0);

  const run = useMemo(
    () =>
      debounce(async (q: string) => {
        const id = ++seq.current;
        if (!q.trim()) {
          if (seq.current !== id) return;
          setResults([]);
          setLoading(false);
          return;
        }
        try {
          const page = await api.search(q.trim(), undefined, null, 40, 0);
          if (seq.current !== id) return;
          setResults(page.items);
        } catch {
          if (seq.current !== id) return;
          setResults([]);
        } finally {
          if (seq.current === id) setLoading(false);
        }
      }, 250),
    [],
  );

  useEffect(() => () => run.cancel(), [run]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setIndex(0);
      seq.current++;
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    const key = results[index] ? `${results[index].entity_type}:${results[index].entity_id}` : "";
    itemRefs.current.get(key)?.scrollIntoView({ block: "nearest" });
  }, [index, results]);

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
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(i + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter" && results[index]) {
                    openResult(results[index]);
                  }
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
                    {items.map((r) => {
                      const key = `${r.entity_type}:${r.entity_id}`;
                      const active = results[index] && `${results[index].entity_type}:${results[index].entity_id}` === key;
                      return (
                        <button
                          key={key}
                          ref={(el) => {
                            if (el) itemRefs.current.set(key, el);
                            else itemRefs.current.delete(key);
                          }}
                          className={cx("palette-item", active && "active")}
                          onMouseEnter={() => setIndex(results.findIndex((x) => `${x.entity_type}:${x.entity_id}` === key))}
                          onClick={() => openResult(r)}
                        >
                          <Icon />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                          <span className="sub" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                        </button>
                      );
                    })}
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
