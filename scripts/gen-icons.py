"""Regenerate SimpleMemory app icons (no repo binaries needed).

Requires: pip install pillow
Usage:    python scripts/gen-icons.py

Writes: src-tauri/icons/{icon.png, 32x32.png, 128x128.png, icon.ico}
The .ico is BMP-based multi-size so Windows rc.exe accepts it
(PNG-compressed .ico fails with RC2176 on older SDKs).
"""
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (24, 26, 31)
PANEL = (37, 40, 47)
BORDER = (43, 47, 54)
ACCENT = (55, 148, 255)
SOFT = (157, 165, 180)


def draw(size: int):
    px = [[BG for _ in range(size)] for _ in range(size)]
    m = size / 512.0
    pad = int(64 * m)
    rad = int(112 * m)
    inner = size - 2 * pad
    for y in range(inner):
        for x in range(inner):
            cx = min(max(x, rad), inner - 1 - rad)
            cy = min(max(y, rad), inner - 1 - rad)
            if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad:
                edge = x < 3 or y < 3 or x > inner - 4 or y > inner - 4
                px[y + pad][x + pad] = BORDER if edge else PANEL
    nodes = [(0.5, 0.32, 0.075, ACCENT), (0.32, 0.62, 0.06, SOFT), (0.68, 0.62, 0.06, SOFT)]

    def line(x0, y0, x1, y1, col, wdt):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(steps + 1):
            t = i / max(steps, 1)
            x = int(x0 + (x1 - x0) * t)
            y = int(y0 + (y1 - y0) * t)
            for dy in range(-wdt, wdt + 1):
                for dx in range(-wdt, wdt + 1):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < size and 0 <= yy < size:
                        px[yy][xx] = col

    pts = [(int(x * size), int(y * size), int(r * size), c) for x, y, r, c in nodes]
    lw = max(1, int(7 * m))
    halo = lw + max(1, int(4 * m))
    line(*pts[0][:2], *pts[1][:2], BORDER, halo)
    line(*pts[0][:2], *pts[2][:2], BORDER, halo)
    line(*pts[0][:2], *pts[1][:2], ACCENT, lw)
    line(*pts[0][:2], *pts[2][:2], ACCENT, lw)
    for x, y, r, c in pts:
        for yy in range(y - r, y + r + 1):
            for xx in range(x - r, x + r + 1):
                if 0 <= xx < size and 0 <= yy < size and (xx - x) ** 2 + (yy - y) ** 2 <= r * r:
                    px[yy][xx] = c
    cx, cy, cr = pts[0][0], pts[0][1], max(1, int(pts[0][2] * 0.45))
    for yy in range(cy - cr, cy + cr + 1):
        for xx in range(cx - cr, cx + cr + 1):
            if 0 <= xx < size and 0 <= yy < size and (xx - cx) ** 2 + (yy - cy) ** 2 <= cr * cr:
                px[yy][xx] = (216, 222, 233)
    return px


def png_bytes(px) -> bytes:
    h, w = len(px), len(px[0])
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in px)
    comp = zlib.compress(raw, 9)

    def chunk(typ: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")


def main() -> None:
    from PIL import Image

    big = png_bytes(draw(512))
    (OUT / "icon.png").write_bytes(big)
    (OUT / "128x128.png").write_bytes(png_bytes(draw(128)))
    (OUT / "32x32.png").write_bytes(png_bytes(draw(32)))
    img = Image.open(OUT / "icon.png").convert("RGB")
    img.save(OUT / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icons written:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
