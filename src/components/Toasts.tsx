import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useApp } from "../stores/app-store";

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);

  return (
    <div className="toast-wrap" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              className={`toast ${t.kind}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
            >
              <Icon />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
