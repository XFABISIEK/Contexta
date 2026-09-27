import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  className?: string;
}

/** Custom dropdown in app style (replaces native selects). */
export function Select({ value, onChange, options, label, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as HTMLElement)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open ]);

  useEffect(() => {
    if (open) setHot(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHot((h) => {
        const d = e.key === "ArrowDown" ? 1 : -1;
        return (h + d + options.length) % options.length;
      });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && options[hot]) pick(options[hot].value);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cx("select", className)}>
      <button
        type="button"
        className="select-btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className="select-value">{current?.label ?? "—"}</span>
        <ChevronDown size={14} className={cx("select-chevron", open && "open")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            className="select-menu"
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            {options.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={cx("select-opt", i === hot && "hot")}
                  onMouseEnter={() => setHot(i)}
                  onClick={() => pick(o.value)}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>{o.label}</span>
                  {o.value === value && <Check size={13} />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
