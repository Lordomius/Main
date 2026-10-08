"""Overlay the Aliserai / Karmínový bál title composition in Marcellus onto a cover image.

Usage: python3 render_title.py <input image> <output.png>
Layout coordinates are defined for a 1054x1492 cover and scaled to the input size.
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts") + os.sep
REG = FONT_DIR + "Marcellus-Regular.ttf"
SC = FONT_DIR + "MarcellusSC-Regular.ttf"
CAP = 0.701  # cap height / font size for Marcellus
BASE_W, BASE_H = 1054, 1492

src = Image.open(sys.argv[1]).convert("RGB")
W, H = src.size
S = W / BASE_W  # layout scale
SS = 3          # supersampling for crisp edges
CW, CH = W * SS, H * SS


def px(v):
    return v * S * SS


def font(path, cap_px):
    return ImageFont.truetype(path, max(1, int(round(px(cap_px) / CAP))))


# ---------- text layout ----------
# Each line: list of (text, font path, cap height in base px); placed by center x / left x and baseline.

def run_width(run):
    return sum(font(p, c).getlength(t) for t, p, c in run)


def draw_run(mask, run, baseline, cx=None, left=None, tracking=0.0, width=None):
    d = ImageDraw.Draw(mask)
    if width is not None:  # shrink caps so the line fits the original's span
        n = sum(len(t) for t, _, _ in run) - 1
        k = (px(width) - px(tracking) * n) / run_width(run)
        if k < 1:
            run = [(t, p, c * k) for t, p, c in run]
    total = run_width(run) + px(tracking) * (sum(len(t) for t, _, _ in run) - 1)
    x = left * S * SS if left is not None else px(cx) - total / 2
    y = px(baseline)
    for t, p, c in run:
        f = font(p, c)
        for ch in t:
            d.text((x, y), ch, font=f, fill=255, anchor="ls")
            x += f.getlength(ch) + px(tracking)
    return x


text_mask = Image.new("L", (CW, CH), 0)

# ALISERAI – oversized initial A, then large caps
draw_run(text_mask, [("A", REG, 210), ("LISERAI", REG, 182)], baseline=222, cx=526, tracking=4, width=940)
# KARMÍNOVÝ – initial cap + small caps
draw_run(text_mask, [("Karmínový", SC, 108)], baseline=1196, left=52, tracking=2, width=650)
# BÁL
draw_run(text_mask, [("Bál", SC, 108)], baseline=1305, left=742, tracking=4, width=255)
# LEOPOLD AUBRY
draw_run(text_mask, [("Leopold Aubry", SC, 34)], baseline=1415, cx=530, tracking=3, width=346)


# ---------- ornaments ----------
orn = Image.new("L", (CW, CH), 0)
od = ImageDraw.Draw(orn)


def hline(x0, x1, y, thick=1.6):
    # line that fades out toward both ends
    xs = np.arange(int(px(x0)), int(px(x1)))
    t = (xs - xs[0]) / max(1, len(xs) - 1)
    fade = np.clip(np.minimum(t, 1 - t) / 0.12, 0, 1)
    h = max(1, int(px(thick)))
    yy = int(px(y) - h / 2)
    a = np.array(orn)
    a[yy:yy + h, xs[0]:xs[-1] + 1] = np.maximum(a[yy:yy + h, xs[0]:xs[-1] + 1], (fade * 255).astype(np.uint8))
    orn.paste(Image.fromarray(a))


def diamond(cx, cy, r):
    c = (px(cx), px(cy))
    R = px(r)
    pts = lambda k: [(c[0], c[1] - R * k), (c[0] + R * k * 1.5, c[1]), (c[0], c[1] + R * k), (c[0] - R * k * 1.5, c[1])]
    od.polygon(pts(1.0), outline=255, width=int(px(1.6)))
    od.polygon(pts(0.45), fill=255)
    # small side ticks
    for s in (-1, 1):
        x = c[0] + s * R * 1.5
        od.line([(x, c[1]), (x + s * px(4), c[1])], fill=255, width=int(px(2)))


hline(315, 760, 222)
diamond(526, 222, 9)

hline(232, 715, 1236)
diamond(526, 1236, 10)

hline(568, 1000, 1343)
diamond(793, 1343, 9)

orn_mask = orn


def sparkle(img, cx, cy, r):
    """4-point star with glow, drawn additively on RGB float array."""
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    dx, dy = (xx - cx) / r, (yy - cy) / r
    star = np.exp(-np.abs(dx) * 6 - np.abs(dy) * 0.9) + np.exp(-np.abs(dy) * 6 - np.abs(dx) * 0.9) * 0.6
    core = np.exp(-(dx ** 2 + dy ** 2) * 8)
    glow = np.exp(-(dx ** 2 + dy ** 2) * 0.6) * 0.35
    v = np.clip(star + core + glow, 0, 2)[..., None]
    col = np.array([255, 225, 190]) / 255
    img += v * col


# ---------- gold material ----------
def gold_layer(mask_img):
    m = np.asarray(mask_img, dtype=np.float32) / 255.0
    # vertical metallic gradient, repeating per text band
    y = np.arange(CH, dtype=np.float32)[:, None]
    stops = [(0.0, (250, 228, 178)), (0.35, (226, 178, 110)), (0.62, (176, 116, 58)),
             (0.82, (214, 160, 96)), (1.0, (240, 205, 145))]

    def band(y0, y1):
        t = np.clip((y - px(y0)) / (px(y1) - px(y0)), 0, 1)
        out = np.zeros((CH, 1, 3), np.float32)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            k = np.clip((t - t0) / (t1 - t0), 0, 1)[..., None]
            sel = ((t >= t0) & (t <= t1))[..., None]
            out = np.where(sel, np.array(c0) + (np.array(c1) - np.array(c0)) * k, out)
        return out

    grad = np.zeros((CH, 1, 3), np.float32)
    for y0, y1 in [(0, 250), (1075, 1205), (1190, 1315), (1375, 1420)]:
        sel = ((y >= px(y0)) & (y < px(y1)))[..., None]
        grad = np.where(sel, band(y0, y1), grad)
    gap = (grad.sum(-1, keepdims=True) == 0)
    grad = np.where(gap, np.array([225, 180, 115], np.float32), grad)
    col = np.broadcast_to(grad, (CH, CW, 3)).copy()

    # weathered stone/metal texture
    rng = np.random.default_rng(7)
    small = rng.random((CH // 12 + 1, CW // 12 + 1)).astype(np.float32)
    noise = np.asarray(Image.fromarray((small * 255).astype(np.uint8)).resize((CW, CH), Image.BICUBIC), np.float32) / 255
    fine = rng.random((CH, CW)).astype(np.float32)
    col *= (0.86 + 0.18 * noise + 0.06 * fine)[..., None]

    # bevel: light from upper-left
    blur = np.asarray(mask_img.filter(ImageFilter.GaussianBlur(px(2.2))), np.float32) / 255
    gy, gx = np.gradient(blur)
    shade = (-gx * 0.7 - gy * 1.0) * px(4.0)
    col *= (1 + np.clip(shade, -0.55, 0.65))[..., None]
    return np.clip(col, 0, 255), m


all_mask = ImageChops.lighter(text_mask, orn_mask)
gold, m = gold_layer(all_mask)

base = np.asarray(src.resize((CW, CH), Image.BICUBIC), np.float32)

# drop shadow
sh = np.asarray(all_mask.filter(ImageFilter.GaussianBlur(px(4))), np.float32) / 255
sh = np.roll(sh, (int(px(3)), int(px(2))), axis=(0, 1))
base *= (1 - 0.75 * sh)[..., None]

# warm outer glow
gl = np.asarray(all_mask.filter(ImageFilter.GaussianBlur(px(14))), np.float32) / 255
base += (gl * 0.55)[..., None] * np.array([200, 70, 25], np.float32)

# thin dark rim for definition
rim = np.asarray(all_mask.filter(ImageFilter.MaxFilter(3 * SS if SS % 2 else 3 * SS + 1)), np.float32) / 255
base *= (1 - 0.6 * np.clip(rim - m, 0, 1))[..., None]

out = base * (1 - m[..., None]) + gold * m[..., None]

# sparkle on the central light line
spark = np.zeros((CH, CW, 3), np.float32)
sparkle(spark, px(526), px(1343), px(16))
out = out + spark * 255

res = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS)
res.save(sys.argv[2])
print("saved", sys.argv[2], res.size)
