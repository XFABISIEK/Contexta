import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pipette } from "lucide-react";

type RGB = [number, number, number];
type HSV = [number, number, number];

function hsvToRgb(h: number, s: number, v: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, max === 0 ? 0 : d / max, max];
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function parseHex(hex: string): RGB | null {
  const full = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (full) {
    const n = parseInt(full[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const short = /^#([0-9a-f]{3})$/i.exec(hex.trim());
  if (short) {
    const d = (c: string) => parseInt(c + c, 16);
    return [d(short[1][0]), d(short[1][1]), d(short[1][2])];
  }
  return null;
}

const hexOf = (hsv: HSV): string => {
  const rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  return toHex(rgb[0], rgb[1], rgb[2]);
};

interface ColorPickerProps {
  value: string;
  active: boolean;
  onLive: (hex: string) => void;
  onCommit: (hex: string) => void;
}

/** Compact HSV + RGB picker. Live-applies while dragging, commits on release/close. */
export function ColorPicker({ value, active, onLive, onCommit }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => {
    const rgb = parseHex(value) ?? [55, 148, 255];
    return rgbToHsv(rgb[0], rgb[1], rgb[2]);
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const liveRef = useRef({ hsv, onCommit });
  liveRef.current = { hsv, onCommit };

  useEffect(() => {
    if (open) {
      const rgb = parseHex(value) ?? [55, 148, 255];
      setHsv(rgbToHsv(rgb[0], rgb[1], rgb[2]));
    }
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const commitClose = () => {
      liveRef.current.onCommit(hexOf(liveRef.current.hsv));
      setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as HTMLElement)) commitClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        commitClose();
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open ]);

  const emit = (next: HSV, commit: boolean) => {
    setHsv(next);
    const hex = hexOf(next);
    onLive(hex);
    if (commit) onCommit(hex);
  };

  const svToHsv = (clientX: number, clientY: number): HSV => {
    const el = svRef.current;
    if (!el) return hsv;
    const r = el.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    return [hsv[0], s, v];
  };

  const rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  const hex = toHex(rgb[0], rgb[1], rgb[2]);

  return (
    <div className="cp-wrap" ref={rootRef}>
      <button
        type="button"
        className={active ? "swatch custom active" : "swatch custom"}
        title={active ? `Custom ${value}` : "Custom color"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={active ? ({ "--sw": value } as CSSProperties) : undefined}
      >
        <Pipette size={12} />
      </button>
      {open && (
        <div className="cp-pop" role="dialog" aria-label="Custom color">
          <div
            ref={svRef}
            className="cp-sv"
            style={{
              backgroundColor: `hsl(${Math.round(hsv[0])} 100% 50%)`,
              backgroundImage: "linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))",
            }}
            onPointerDown={(e) => {
              drag.current = true;
              svRef.current?.setPointerCapture(e.pointerId);
              emit(svToHsv(e.clientX, e.clientY), false);
            }}
            onPointerMove={(e) => {
              if (drag.current) emit(svToHsv(e.clientX, e.clientY), false);
            }}
            onPointerUp={(e) => {
              if (drag.current) {
                drag.current = false;
                emit(svToHsv(e.clientX, e.clientY), true);
              }
            }}
          >
            <span className="cp-dot" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(hsv[0])}
            className="cp-hue"
            aria-label="Hue"
            onChange={(e) => emit([Number(e.target.value), hsv[1], hsv[2]], false)}
            onPointerUp={() => onCommit(hex)}
            onBlur={() => onCommit(hex)}
          />
          <div className="cp-rgb">
            {(["R", "G", "B"] as const).map((ch, i) => (
              <label key={ch}>
                {ch}
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[i]}
                  aria-label={ch}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(255, Math.round(Number(e.target.value) || 0)));
                    const next: HSV = i === 0
                      ? rgbToHsv(v, rgb[1], rgb[2])
                      : i === 1
                        ? rgbToHsv(rgb[0], v, rgb[2])
                        : rgbToHsv(rgb[0], rgb[1], v);
                    emit(next, true);
                  }}
                />
              </label>
            ))}
          </div>
          <div className="cp-hex">
            <span className="cp-preview" style={{ background: hex }} />
            <span className="code">{hex}</span>
          </div>
        </div>
      )}
    </div>
  );
}
