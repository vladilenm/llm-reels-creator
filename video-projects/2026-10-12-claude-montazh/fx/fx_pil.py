# Stage A «picture» without rotoscoping (Pillow + numpy, system python3):
#   clean.mp4 → renders/picture.mp4
#   hook + «не открывал»: the frame shrinks into a rounded window on the dark brand background,
#     giant text above it (broll/01-hook-behind.mov, 11-never-behind.mov), window opens back to full frame;
#   camera punch-ins / drift per segment, zoom-blur transitions on location joins,
#   phone PiP (real cut take → this reel), floating thumbnails of real graphics (ai-700-math),
#   audio = clean voice + fx/sfx.wav.
# fx.py is the rotoscoped variant of the same pass (needs SAM 2 masks).
#   python3 video-projects/2026-10-12-claude-montazh/fx/fx_pil.py [--stills 1.0,4.6,...]
import os, sys, json, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.normpath(os.path.join(HERE, ".."))
ROOT = os.path.normpath(os.path.join(P, "..", ".."))
W, H, FPS = 1080, 1920, 30
CLEAN = os.path.join(P, "renders", "clean.mp4")
DUR = float(json.load(open(os.path.join(P, "transcript.clean.json")))["audio_duration_secs"])
N = int(round(DUR * FPS))
sys.path.insert(0, HERE)
from timemap import JOINS as ALLJ  # clean-timeline joins from EDL.json: 4.489 6.24 8.551 11.217 14.019 17.052 19.093 21.723 25.261 29.696 32.565
STILLS = None
if "--stills" in sys.argv:
    STILLS = {int(round(float(x) * FPS)) for x in sys.argv[sys.argv.index("--stills") + 1].split(",")}

hexc = lambda h: tuple(int(h.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
BG0, BG1 = np.array(hexc("#0E0B14"), np.float32), np.array(hexc("#1E1630"), np.float32)
clamp = lambda x: min(1.0, max(0.0, x))
ease = lambda x: (lambda c: c * c * (3 - 2 * c))(clamp(x))


def spring(t, w=16.0, z=0.55):
    if t <= 0: return 0.0
    wd = w * np.sqrt(1 - z * z)
    return float(1 - np.exp(-z * w * t) * (np.cos(wd * t) + z * w / wd * np.sin(wd * t)))


# ---------- readers ----------
def reader(path, ss=None, t=None, size=(W, H), fmt="rgb24"):
    ch = 4 if fmt == "rgba" else 3
    args = ["ffmpeg", "-v", "error"] + (["-ss", str(ss)] if ss is not None else []) + ["-i", path] + \
           (["-t", str(t)] if t is not None else []) + ["-vf", f"fps={FPS},scale={size[0]}:{size[1]}:flags=bicubic", "-f", "rawvideo", "-pix_fmt", fmt, "-"]
    pr = subprocess.Popen(args, stdout=subprocess.PIPE)
    n = size[0] * size[1] * ch
    while True:
        b = pr.stdout.read(n)
        if len(b) < n: return
        yield Image.frombuffer("RGBA" if ch == 4 else "RGB", size, b, "raw", "RGBA" if ch == 4 else "RGB", 0, 1)


class Layer:  # RGBA overlay consumed in order, frame = round((t - t0) * FPS)
    def __init__(self, path, t0):
        self.g, self.t0, self.i, self.cur = reader(path, fmt="rgba"), t0, -1, None
    def at(self, t):
        want = int(round((t - self.t0) * FPS))
        while self.i < want:
            nxt = next(self.g, None)
            if nxt is None: break
            self.cur, self.i = nxt, self.i + 1
        return self.cur


# ---------- geometry ----------
def scale_about(img, s, ax, ay, fill=None):
    a, c, f = 1 / s, -ax * (1 - s) / s, -ay * (1 - s) / s
    return img.transform(img.size, Image.AFFINE, (a, 0, c, 0, a, f), resample=Image.BILINEAR, fillcolor=fill)


def rounded(w, h, r, ss=2):  # anti-aliased rounded-rect mask (L)
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=max(0, r * ss), fill=255)
    return m.resize((w, h), Image.LANCZOS)


def cover(img, w, h):
    iw, ih = img.size; s = max(w / iw, h / ih)
    r = img.resize((int(np.ceil(iw * s)), int(np.ceil(ih * s))), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def with_shadow(tile, pad=40, blur=18, strength=0.45, dy=14):  # RGBA tile → bigger RGBA with soft shadow
    w, h = tile.size
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    a = Image.new("L", out.size, 0); a.paste(tile.getchannel("A"), (pad, pad + dy))
    a = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * strength))
    out.putalpha(a)
    out.alpha_composite(tile, (pad, pad))
    return out


def put(base, tile, x, y, alpha=1.0):  # alpha "over" onto an RGB base, clipped by PIL
    if alpha <= 0.002: return
    if alpha < 1:
        tile = tile.copy(); tile.putalpha(tile.getchannel("A").point(lambda v: int(v * alpha)))
    base.paste(tile, (int(x), int(y)), tile)


# ---------- static assets ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
g = np.clip(np.sqrt(((xx - 540) / 900) ** 2 + ((yy - 760) / 1100) ** 2), 0, 1)[..., None]
DARK = Image.fromarray((BG1 * (1 - g) + BG0 * g).astype(np.uint8), "RGB")
SHADE = Image.fromarray((np.clip(1 - np.arange(300) / 300, 0, 1) ** 1.6 * 150).astype(np.uint8)[:, None].repeat(W, 1), "L")

PH_X, PH_Y, PH_W, PH_H, BEZ = 50, 400, 340, 604, 10
SC_W, SC_H = PH_W - 2 * BEZ, PH_H - 2 * BEZ
PH_OUT, PH_IN = rounded(PH_W, PH_H, 46), rounded(SC_W, SC_H, 36)
PH0, PH_SW, PH1 = 14.033, 15.933, ALLJ[5] - 0.03
RAW_TAKE = [cover(f, SC_W, SC_H) for f in reader(os.path.join(P, "assets", "raw.mp4"), ss=24.32, t=2.2)]
REEL_CACHE = {}

AI = os.path.join(ROOT, "video-projects", "2026-10-12-ai-700-math", "renders", "final.mp4")
THUMBS = [
    dict(t_in=11.993, cx=170, cy=585, w=230, h=409, deg=6, frames=[cover(f, 230, 409) for f in reader(AI, ss=3.0, t=2.2)]),
    dict(t_in=12.693, cx=852, cy=618, w=206, h=366, deg=-5, frames=[cover(f, 206, 366) for f in reader(AI, ss=26.0, t=1.6)]),
]
for T in THUMBS:
    T["mask"] = rounded(T["w"], T["h"], 22)
    ring = Image.new("L", (T["w"], T["h"]), 0)
    ImageDraw.Draw(ring).rounded_rectangle([1, 1, T["w"] - 2, T["h"] - 2], radius=22, outline=150, width=3)
    T["ring"] = ring
TH_OUT = ALLJ[4] - 0.16

# ---------- timeline ----------
# Clean timeline after ГЕЙТ C (pauses ≤ 0.12 s): all joins from EDL.json (fx/timemap.py)
JOINS = [ALLJ[2], ALLJ[4], ALLJ[5], ALLJ[8], ALLJ[10]]  # location changes → zoom-blur
W_SUB = 34.326                                          # «Подписывайся»: the end window opens
CAM = [  # (t0, t1, s0, s1, anchor_x, anchor_y)
    (ALLJ[1], ALLJ[2], 1.08, 1.10, 540, 640),
    (ALLJ[2], ALLJ[3], 1.00, 1.03, 520, 660),
    (ALLJ[3], ALLJ[4], 1.07, 1.09, 520, 660),
    (ALLJ[5], ALLJ[6], 1.00, 1.02, 480, 600),
    (ALLJ[6], ALLJ[7], 1.07, 1.07, 480, 600),
    (ALLJ[7], ALLJ[8], 1.00, 1.03, 480, 600),
    (ALLJ[8], ALLJ[9], 1.00, 1.02, 540, 700),
    (ALLJ[9], ALLJ[10], 1.06, 1.08, 540, 700),
    (W_SUB + 0.37, DUR + 0.1, 1.00, 1.015, 540, 620),   # CTA: almost still, the card stays off the face
]
WIN = [  # frame shrinks into a window on the dark background, opens back on r0–r1
    dict(t0=0.0, r0=4.42, r1=4.85, layer=Layer(os.path.join(P, "broll", "01-hook-behind.mov"), 0.0)),
    dict(t0=ALLJ[10], r0=W_SUB, r1=W_SUB + 0.37, layer=Layer(os.path.join(P, "broll", "11-never-behind.mov"), ALLJ[10])),
]
S_WIN = 0.80


def window_frame(img, R, t):
    k = ease((t - R["r0"]) / (R["r1"] - R["r0"]))
    s = S_WIN + (1 - S_WIN) * k
    rad = int(round(56 * (1 - k)))
    x0, y0 = int(round(540 - 540 * s)), int(round(H - H * s))
    win = scale_about(img, s, 540, H)
    if (1 - k) > 0.01:                                           # darken the window top so the title reads
        sh = SHADE.point(lambda v: int(v * (1 - k)))
        win.paste((0, 0, 0), (0, y0), sh)
    out = DARK.copy()
    m = Image.new("L", (W, H), 0)
    if s < 0.999:
        m.paste(rounded(W - 2 * x0, H - y0 + rad + 2, rad), (x0, y0))
    else:
        m = Image.new("L", (W, H), 255)
    out.paste(win, (0, 0), m)
    txt = R["layer"].at(t)
    if txt is not None:
        out.paste(txt, (0, 0), txt)
    return out


def camera(img, t):
    for t0, t1, s0, s1, ax, ay in CAM:
        if t0 <= t < t1:
            return scale_about(img, s0 + (s1 - s0) * (t - t0) / (t1 - t0), ax, ay)
    return img


def zoom_blur(img, t):
    for j in JOINS:
        d = abs(t - j)
        if d < 0.134:
            k = 1 - d / 0.134
            base = 1 + 0.22 * k ** 1.5
            n = 8
            acc = np.zeros((H, W, 3), np.float32)
            for i in range(n):
                acc += np.asarray(scale_about(img, base * (1 + 0.07 * k * i / (n - 1)), 540, 900), np.float32)
            return Image.fromarray(np.clip(acc / n * (1 + 0.06 * k), 0, 255).astype(np.uint8), "RGB")
    return img


def phone(out, t):
    if not (PH0 <= t < PH1): return
    if t < PH_SW:
        fr = RAW_TAKE[min(len(RAW_TAKE) - 1, int(round((t - PH0) * FPS)))]
    else:
        key = int(round((3.62 + (t - PH_SW)) * FPS))
        fr = REEL_CACHE.get(key) or REEL_CACHE[max(REEL_CACHE)]
    tile = Image.new("RGBA", (PH_W, PH_H), hexc("#0E0B14") + (0,)); tile.putalpha(PH_OUT)
    scr = fr.convert("RGBA"); scr.putalpha(PH_IN)
    tile.alpha_composite(scr, (BEZ, BEZ))
    tile = with_shadow(tile)
    s = 0.82 + 0.18 * spring(t - PH0)
    if abs(s - 1) > 0.002:
        tile = tile.resize((int(tile.width * s), int(tile.height * s)), Image.BILINEAR)
    cx, cy = PH_X + PH_W / 2, PH_Y + PH_H / 2
    a = clamp((t - PH0) / 0.12) * (1 - clamp((t - (PH1 - 0.09)) / 0.09))
    put(out, tile, cx - tile.width / 2, cy - tile.height / 2 + 14 * s * 0, a)


def thumbs(out, t):
    for T in THUMBS:
        if not (T["t_in"] <= t < TH_OUT + 0.12): continue
        fr = T["frames"][min(len(T["frames"]) - 1, int(round((t - T["t_in"]) * FPS)))].convert("RGBA")
        fr.putalpha(T["mask"])
        fr.alpha_composite(Image.merge("RGBA", [Image.new("L", fr.size, 245)] * 3 + [T["ring"]]))
        tile = with_shadow(fr, pad=50)
        k = spring(t - T["t_in"], 14, 0.5)
        leave = clamp((t - TH_OUT) / 0.12)
        s = (0.55 + 0.45 * k) * (1 - 0.1 * leave)
        deg = T["deg"] * k + 1.2 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.4)
        dy = 7 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.0)
        tile = tile.resize((max(1, int(tile.width * s)), max(1, int(tile.height * s))), Image.BILINEAR).rotate(deg, Image.BICUBIC, expand=True)
        put(out, tile, T["cx"] - tile.width / 2, T["cy"] - tile.height / 2 + dy, clamp((t - T["t_in"]) / 0.1) * (1 - leave))


# ---------- run ----------
stills_dir = os.path.join(P, "review", "fx-stills"); os.makedirs(stills_dir, exist_ok=True)
enc = None
if STILLS is None:
    out_path = os.path.join(P, "renders", "picture.mp4")
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-i", CLEAN, "-i", os.path.join(HERE, "sfx.wav"),
                            "-filter_complex", "[1:a]aresample=48000[v];[v][2:a]amix=inputs=2:normalize=0:duration=first[a]",
                            "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "256k", "-shortest", out_path], stdin=subprocess.PIPE)
last = max(STILLS) if STILLS else N - 1
for f, img in enumerate(reader(CLEAN)):
    if f > last: break
    t = f / FPS
    R = next((R for R in WIN if R["t0"] <= t < R["r1"] + 0.02), None)
    out = window_frame(img, R, t) if R else camera(img, t)
    if 3.55 <= t <= 4.95:
        REEL_CACHE[f] = cover(out, SC_W, SC_H)
    out = zoom_blur(out, t)
    if out is img: out = img.copy()
    thumbs(out, t)
    phone(out, t)
    if enc: enc.stdin.write(out.tobytes())
    if STILLS and f in STILLS: out.save(os.path.join(stills_dir, f"{t:06.2f}.png"))
    if f % 150 == 0: print(f"  {f}/{N}", flush=True)
if enc:
    enc.stdin.close(); enc.wait(); print("picture →", os.path.relpath(out_path, ROOT))
