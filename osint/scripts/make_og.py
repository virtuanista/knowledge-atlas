import math, os, random, struct, zlib, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1200, 630
random.seed(7)  # determinista
px = bytearray(W * H * 3)
def blend_add(x, y, r, g, b, a):
    i = (y * W + x) * 3
    px[i]   = min(255, px[i]   + int(r * a))
    px[i+1] = min(255, px[i+1] + int(g * a))
    px[i+2] = min(255, px[i+2] + int(b * a))
def hsl(h, s=0.95, l=0.68):
    c = (1 - abs(2 * l - 1)) * s; hp = (h % 360) / 60; x = c * (1 - abs(hp % 2 - 1)); m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(hp) % 6]
    return int((r + m) * 255), int((g + m) * 255), int((b + m) * 255)
# fractal: clusters de splats siguiendo Vogel, recursivo
GOLD = math.pi * (3 - math.sqrt(5))
SIG = 0.30
def splat(cx, cy, rad, col):
    r0 = int(rad * 2.2) + 1
    for dy in range(-r0, r0 + 1):
        y = int(cy) + dy
        if y < 0 or y >= H: continue
        for dx in range(-r0, r0 + 1):
            x = int(cx) + dx
            if x < 0 or x >= W: continue
            t = math.hypot(dx, dy) / rad
            a = math.exp(-(t * t) / (2 * SIG * SIG))
            if a > 0.01: blend_add(x, y, *col, a * 0.55)
def cluster(cx, cy, R, depth, hue):
    n = max(3, int(R / 4))
    for j in range(n):
        rr = R * math.sqrt((j + 0.5) / n)
        t = j * GOLD
        x, y = cx + rr * math.cos(t) * 1.0, cy + rr * math.sin(t) * 0.62
        col = hsl(hue + depth * 22 + j * 3.1)
        splat(x, y, max(3, R / (n ** 0.5) * 0.9), col)
        if depth < 2 and R > 90 and j % 3 == 0:
            cluster(x, y, R * 0.28, depth + 1, hue + 40)
for k in range(9):
    ang = k * 2 * math.pi / 9
    cluster(W / 2 + math.cos(ang) * 300, H / 2 + math.sin(ang) * 150, 110, 0, k * 40)
cluster(W / 2, H / 2, 150, 0, 160)
raw = bytearray()
for y in range(H):
    raw.append(0)
    raw += px[y * W * 3:(y + 1) * W * 3]
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) \
    + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
open(os.path.join(ROOT, "docs/og.png"), "wb").write(png)
print("og.png bytes", len(png))
