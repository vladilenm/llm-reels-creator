# Stage A «picture»: clean.mp4 → renders/picture.mp4 with the edit effects baked in.
#   roto hook + roto «не открывал» (dark bg, text behind the speaker, iris reveal back to the room),
#   camera punch-ins / drift per segment, zoom-blur transitions on location joins,
#   phone PiP (real cut take → this reel), floating thumbnails of real graphics (ai-700-math),
#   audio = clean voice + fx/sfx.wav.
# Cards and captions stay as overlays (assemble.mjs, Stage B).
# Run from the repo root with the .object-separation venv (numpy + cv2):
#   .object-separation/bin/python video-projects/2026-10-12-claude-montazh/fx/fx.py [--stills 1.0,4.6,...]
import os, sys, json, subprocess, numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.normpath(os.path.join(HERE, ".."))
ROOT = os.path.normpath(os.path.join(P, "..", ".."))
W, H, FPS = 1080, 1920, 30
CLEAN = os.path.join(P, "renders", "clean.mp4")
DUR = float(json.load(open(os.path.join(P, "transcript.clean.json")))["audio_duration_secs"])
N = int(round(DUR * FPS))
STILLS = None
if "--stills" in sys.argv:
    STILLS = {int(round(float(x) * FPS)) for x in sys.argv[sys.argv.index("--stills") + 1].split(",")}


def hexc(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


BG0, BG1, ACC = hexc("#0E0B14"), hexc("#1E1630"), hexc("#B79CFF")
ease = lambda x: (lambda c: c * c * (3 - 2 * c))(min(1.0, max(0.0, x)))
eo = lambda x: 1 - (1 - min(1.0, max(0.0, x))) ** 3


def spring(t, w=16.0, z=0.55):  # 0 → 1 with a little overshoot, t in seconds since start
    if t <= 0: return 0.0
    wd = w * np.sqrt(1 - z * z)
    return float(1 - np.exp(-z * w * t) * (np.cos(wd * t) + z * w / wd * np.sin(wd * t)))


# ---------- readers ----------
def reader(path, ss=None, t=None, size=(W, H), fmt="rgb24", fps=FPS):
    ch = 4 if fmt == "rgba" else 3
    args = ["ffmpeg", "-v", "error"] + (["-ss", str(ss)] if ss is not None else []) + ["-i", path] + \
           (["-t", str(t)] if t is not None else []) + ["-vf", f"fps={fps},scale={size[0]}:{size[1]}:flags=bicubic", "-f", "rawvideo", "-pix_fmt", fmt, "-"]
    pr = subprocess.Popen(args, stdout=subprocess.PIPE)
    n = size[0] * size[1] * ch
    while True:
        b = pr.stdout.read(n)
        if len(b) < n: return
        yield np.frombuffer(b, np.uint8).reshape(size[1], size[0], ch)


def load_all(*a, **k):
    return list(reader(*a, **k))


class Layer:  # an RGBA overlay clip consumed in order, frame = round((t - t0) * FPS)
    def __init__(self, path, t0):
        self.g, self.t0, self.i, self.cur = reader(path, fmt="rgba"), t0, -1, None
    def at(self, t):
        want = int(round((t - self.t0) * FPS))
        while self.i < want:
            nxt = next(self.g, None)
            if nxt is None: break
            self.cur, self.i = nxt, self.i + 1
        return self.cur


def mask_at(seg, f):
    p = os.path.join(HERE, "masks", seg, f"{f:05d}.png")
    m = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
    if m is None: raise FileNotFoundError(p)
    m = cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    return cv2.GaussianBlur(m, (0, 0), 2.0)


# ---------- geometry ----------
def scale_about(img, s, ax, ay, border=0):
    M = np.float32([[s, 0, ax * (1 - s)], [0, s, ay * (1 - s)]])
    return cv2.warpAffine(img, M, (img.shape[1], img.shape[0]), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT if border is not None else cv2.BORDER_REPLICATE,
                          borderValue=border if border is not None else 0)


def over(dst, rgba, x, y, alpha=1.0):  # alpha-composite an RGBA float tile at (x, y), clipped
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    t = rgba[y0 - y:y1 - y, x0 - x:x1 - x]
    a = t[..., 3:4] * alpha
    dst[y0:y1, x0:x1] = dst[y0:y1, x0:x1] * (1 - a) + t[..., :3] * a


def rounded(w, h, r):
    m = np.zeros((h, w), np.uint8)
    cv2.rectangle(m, (r, 0), (w - r - 1, h - 1), 255, -1); cv2.rectangle(m, (0, r), (w - 1, h - r - 1), 255, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(m, (cx, cy), r, 255, -1, lineType=cv2.LINE_AA)
    return m.astype(np.float32) / 255


def cover(img, w, h):  # resize + centre crop to w×h
    ih, iw = img.shape[:2]; s = max(w / iw, h / ih)
    r = cv2.resize(img, (int(np.ceil(iw * s)), int(np.ceil(ih * s))), interpolation=cv2.INTER_AREA)
    y, x = (r.shape[0] - h) // 2, (r.shape[1] - w) // 2
    return r[y:y + h, x:x + w]


def with_shadow(rgba, pad=40, blur=18, strength=0.45):
    h, w = rgba.shape[:2]
    out = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
    sh = np.zeros((h + 2 * pad, w + 2 * pad), np.float32)
    sh[pad + 14:pad + 14 + h, pad:pad + w] = rgba[..., 3]
    sh = cv2.GaussianBlur(sh, (0, 0), blur) * strength
    out[..., 3] = sh
    over_local(out, rgba, pad, pad)
    return out


def over_local(dst, rgba, x, y):
    h, w = rgba.shape[:2]
    a = rgba[..., 3:4]; d = dst[y:y + h, x:x + w]
    na = a + d[..., 3:4] * (1 - a)
    d[..., :3] = np.where(na > 1e-4, (rgba[..., :3] * a + d[..., :3] * d[..., 3:4] * (1 - a)) / np.maximum(na, 1e-4), 0)
    d[..., 3:4] = na


def transform_tile(rgba, s, deg):
    h, w = rgba.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, s)
    return cv2.warpAffine(rgba, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


# ---------- static assets ----------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
g = np.clip(np.sqrt(((xx - 540) / 900) ** 2 + ((yy - 760) / 1100) ** 2), 0, 1)[..., None]
DARK = BG1 * (1 - g) + BG0 * g                                  # dark brand background, soft glow behind the head

# phone (beat 6): outer 340×604 at (50, 400), screen 320×584
PH_X, PH_Y, PH_W, PH_H, BEZ = 50, 400, 340, 604, 10
SC_W, SC_H = PH_W - 2 * BEZ, PH_H - 2 * BEZ
PH_OUT, PH_IN = rounded(PH_W, PH_H, 46), rounded(SC_W, SC_H, 36)
RAW_TAKE = [cover(f, SC_W, SC_H) for f in load_all(os.path.join(P, "assets", "raw.mp4"), ss=24.32, t=2.2, size=(1080, 1920))]
REEL_CACHE = {}                                                 # hook output frames shown as «этот рилс»

# floating thumbnails (beat 5): real graphics from the previous reel
AI = os.path.join(ROOT, "video-projects", "2026-10-12-ai-700-math", "renders", "final.mp4")
THUMBS = [
    dict(t_in=12.47, cx=170, cy=585, w=230, h=409, deg=6,  frames=[cover(f, 230, 409) for f in load_all(AI, ss=3.0, t=2.2, size=(1080, 1920))]),
    dict(t_in=13.17, cx=852, cy=618, w=206, h=366, deg=-5, frames=[cover(f, 206, 366) for f in load_all(AI, ss=26.0, t=1.6, size=(1080, 1920))]),
]
TH_OUT = 14.22

# ---------- timeline ----------
JOINS = [8.857, 14.378, 17.509, 26.060, 33.582]                 # location changes → zoom-blur
# camera per segment: (t0, t1, s0, s1, anchor_x, anchor_y)
CAM = [
    (6.426, 8.857, 1.08, 1.10, 540, 640),
    (8.857, 11.657, 1.00, 1.03, 520, 660),
    (11.657, 14.378, 1.07, 1.09, 520, 660),
    (17.509, 19.652, 1.00, 1.02, 480, 600),
    (19.652, 22.402, 1.07, 1.07, 480, 600),
    (22.402, 26.060, 1.00, 1.03, 480, 600),
    (26.060, 30.615, 1.00, 1.02, 540, 700),
    (30.615, 33.582, 1.06, 1.08, 540, 700),
    (35.750, 38.900, 1.00, 1.04, 540, 620),
]
ROTO = [  # name, t0, reveal start, reveal end, face centre (unscaled), behind layer
    dict(seg="hook", t0=0.0, r0=4.42, r1=4.85, face=(540, 640), layer=Layer(os.path.join(P, "broll", "01-hook-behind.mov"), 0.0)),
    dict(seg="never", t0=33.582, r0=35.38, r1=35.75, face=(540, 620), layer=Layer(os.path.join(P, "broll", "11-never-behind.mov"), 33.582)),
]
S_ROTO = 0.80


def roto_frame(img, R, f, t):
    k = ease((t - R["r0"]) / (R["r1"] - R["r0"]))
    s = S_ROTO + (1 - S_ROTO) * k
    room = scale_about(img, s, 540, H)
    inside = scale_about(np.ones((H, W), np.float32), s, 540, H)
    fy = H - (H - R["face"][1]) * s
    rad = 2400 * eo((t - R["r0"]) / (R["r1"] - R["r0"])) if t >= R["r0"] else 0
    iris = np.clip((rad - np.sqrt((xx - R["face"][0]) ** 2 + (yy - fy) ** 2)) / 50, 0, 1) * inside
    out = DARK * (1 - iris[..., None]) + room * iris[..., None]
    txt = R["layer"].at(t)
    if txt is not None:
        a = txt[..., 3:4].astype(np.float32) / 255
        out = out * (1 - a) + txt[..., :3].astype(np.float32) * a
    m = scale_about(mask_at(R["seg"], f), s, 540, H)[..., None]
    return out * (1 - m) + room * m


def camera(img, t):
    for t0, t1, s0, s1, ax, ay in CAM:
        if t0 <= t < t1:
            s = s0 + (s1 - s0) * (t - t0) / (t1 - t0)
            return scale_about(img, s, ax, ay, border=None)
    return img


def zoom_blur(img, t):
    for j in JOINS:
        d = abs(t - j)
        if d < 0.134:
            k = 1 - d / 0.134
            base = 1 + 0.22 * k ** 1.5
            acc = np.zeros_like(img)
            n = 8
            for i in range(n):
                acc += scale_about(img, base * (1 + 0.07 * k * i / (n - 1)), 540, 900, border=None)
            return acc / n * (1 + 0.06 * k)
    return img


def phone(out, t):
    if not (14.45 <= t < 17.47): return
    if t < 16.35:
        fr = RAW_TAKE[min(len(RAW_TAKE) - 1, int(round((t - 14.45) * FPS)))]
    else:
        key = int(round((3.62 + (t - 16.35)) * FPS))
        fr = REEL_CACHE.get(key)
        if fr is None: fr = REEL_CACHE[max(REEL_CACHE)]
    tile = np.zeros((PH_H, PH_W, 4), np.float32)
    tile[..., :3] = BG0; tile[..., 3] = PH_OUT
    scr = np.zeros((SC_H, SC_W, 4), np.float32); scr[..., :3] = fr; scr[..., 3] = PH_IN
    over_local(tile, scr, BEZ, BEZ)
    tile = with_shadow(tile)
    s = 0.82 + 0.18 * spring(t - 14.45)
    a = min(1.0, (t - 14.45) / 0.12) * (1 - min(1.0, max(0.0, (t - 17.38) / 0.09)))
    tile = transform_tile(tile, s, 0)
    over(out, tile, PH_X - 40, PH_Y - 40, a)


def thumbs(out, t):
    for T in THUMBS:
        if not (T["t_in"] <= t < TH_OUT + 0.12): continue
        fr = T["frames"][min(len(T["frames"]) - 1, int(round((t - T["t_in"]) * FPS)))]
        tile = np.zeros((T["h"], T["w"], 4), np.float32)
        tile[..., :3] = fr; tile[..., 3] = rounded(T["w"], T["h"], 22)
        ring = rounded(T["w"], T["h"], 22) - cv2.erode(rounded(T["w"], T["h"], 22), np.ones((7, 7), np.uint8))
        tile[..., :3] = tile[..., :3] * (1 - ring[..., None] * 0.6) + 245 * ring[..., None] * 0.6
        tile = with_shadow(tile, pad=50)
        k = spring(t - T["t_in"], 14, 0.5)
        leave = min(1.0, max(0.0, (t - TH_OUT) / 0.12))
        s = (0.55 + 0.45 * k) * (1 - 0.1 * leave)
        deg = T["deg"] * k + 1.2 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.4)
        dy = 7 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.0)
        tile = transform_tile(tile, s, deg)
        over(out, tile, T["cx"] - tile.shape[1] // 2, int(T["cy"] - tile.shape[0] // 2 + dy), min(1.0, (t - T["t_in"]) / 0.1) * (1 - leave))


# ---------- run ----------
os.makedirs(os.path.join(P, "renders"), exist_ok=True)
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
for f, src in enumerate(reader(CLEAN)):
    if f > last: break
    t = f / FPS
    img = src.astype(np.float32)
    R = next((R for R in ROTO if R["t0"] <= t < R["r1"] + 0.02), None)
    out = roto_frame(img, R, f, t) if R else camera(img, t)
    if 3.55 <= t <= 4.95:                                          # «этот рилс» for the phone
        REEL_CACHE[f] = cover(np.clip(out, 0, 255), SC_W, SC_H)
    out = zoom_blur(out, t)
    thumbs(out, t)
    phone(out, t)
    o8 = np.clip(out, 0, 255).astype(np.uint8)
    if enc: enc.stdin.write(o8.tobytes())
    if STILLS and f in STILLS:
        cv2.imwrite(os.path.join(stills_dir, f"{t:06.2f}.png"), cv2.cvtColor(o8, cv2.COLOR_RGB2BGR))
    if f % 150 == 0: print(f"  {f}/{N}", flush=True)
if enc:
    enc.stdin.close(); enc.wait(); print("picture →", os.path.relpath(out_path, ROOT))
