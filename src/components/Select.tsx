import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open ]);

  // Portal menu lives on document.body, so measure the button on open,
  // flip upward when there is no room below, and close on any scroll.
  useEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const width = Math.max(r.width, 130);
      const estH = Math.min(options.length * 30 + 8, 248);
      const up = r.bottom + estH > window.innerHeight - 8 && r.top - estH - 4 > 8;
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        top: up ? Math.max(8, r.top - estH - 4) : r.bottom + 4,
        width,
      });
    }
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, options.length]);

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
      if (open) {
        // Don't let the modal/shell handler close the dialog underneath.
        e.stopPropagation();
        setOpen(false);
      }
    }
  };

  return (
    <div ref={rootRef} className={cx("select", className)}>
      <button
        ref={btnRef}
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
        {open && createPortal(
          <motion.ul
            ref={menuRef}
            className="select-menu"
            role="listbox"
            aria-label={label}
            style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, zIndex: 300, margin: 0 }}
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
          </motion.ul>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
