#!/usr/bin/env python3
# S4b «Картинка»: renders/clean.mp4 → renders/picture.mp4 with the edit effects baked in.
# Pillow + numpy + ffmpeg only (system python3). Everything reel-specific is in <project>/fx/fx.json.
#
#   python3 scripts/ru/fx/fx_picture.py <project> [--stills 1.0,4.6,...] [--validate] [--out renders/picture.v2.mp4]
#   python3 scripts/ru/fx/fx_picture.py <project> --prep-swap     person masks for the world-swap joins (Apple Vision)
#
# fx.json (all times on the CLEAN timeline, seconds; "joins" are read from EDL.json):
#   location_joins: [t]             zoom-blur «рывок» on these joins (location changes)
#   camera: [[t0, t1, s0, s1, ax, ay]]   punch-in / drift: scale s0→s1 about (ax, ay)
#   titles: [{t0, reveal:[r0, r1], layer, masks?, face:[x, y], scale}]
#       the frame shrinks to `scale` (anchored bottom-centre) on the dark brand background,
#       `layer` (RGBA .mov, relative to the project) plays from t0 between background and speaker;
#       with `masks` (dir of <frame>.png, white = person; scripts/ru/fx/person-mask.swift) the speaker
#       is cut out and the text sits BEHIND the head; without masks the frame is a rounded window.
#       On reveal the room opens back (iris with masks, window growth without).
#   phone: {t0, switch, t1, x, y, w, h, raw:{src, ss}, reel_from}   PiP: a real source take, then
#       frames of this reel from `reel_from` (seconds of this picture) after `switch`
#   thumbs: {out, items:[{t_in, cx, cy, w, h, deg, src, ss, dur}]}  floating video thumbnails
#   audio: {sfx: "fx/sfx.wav"}      mixed under the voice (scripts/ru/fx/sfx.py)
#   audio: {mix: "fx/mix.wav"}      the whole soundtrack from scripts/ru/fx/sound.py (wins over sfx)
#   face: {track: "fx/faces.json", follow: true, eye_match: true}
#       track from scripts/ru/fx/face-track.swift, smoothed per shot (never across a cut).
#       follow: every camera segment pushes in / drifts about the face instead of (ax, ay).
#       eye_match: on each location join both shots meet halfway — the outgoing face slides
#       toward the incoming one in the last 0.25 s, the incoming starts there and settles in
#       0.5 s — so the eye does not jump. Scale stays ≤ 1.45 and the frame is always covered.
#   world_swap: {joins: "all" | [t], dur: 0.32, masks: "fx/masks/swap"}
#       «человек остаётся, мир меняется»: in the last `dur` s before a location join the speaker
#       is cut out and stays, the old room whips out to the left (motion blur, person hole filled)
#       and the new room whips in from the right; at the join the speaker cuts into the new room.
#       Joins next to title moments are skipped. Masks: --prep-swap.
#   impacts: [{word, after?, offset?, strength?} | {t}]   default: every sfx of kind "hit"
#       one-word impact: 3–6 frames of shake, RGB split and a light flash, decaying in 0.25 s.
#   grade: {match: 0.7, tint: 0.5, contrast: 0.12, grain: 2.0, ref: "median" | <shot index>}
#       per-location colour match (per-channel mean/std toward the reference shot), a brand
#       tint in the shadows, a gentle S-curve and luma grain. Titles' dark background stays ungraded.
#   camera rows may carry a 7th field "ease": the scale eases out instead of moving linearly
#       (a «шире план» pull-back from a punch-in to the real frame).
#   looks: [{t0, t1, kind: "moody"|"film"|"bw", rin: 0.6, rout: 0.0, wipe?: "film"}]
#       a look that changes the picture live on a phrase («сделай мрачнее» → moody): ramps in
#       over `rin` from t0, out over `rout` before t1. film adds letterbox bars and stronger grain;
#       wipe "film" runs the old frame out and the new one in as a film strip with sprockets (0.5 s).
#   textmask: [{t0, t1, text, size?, bg?: "#ECEAF2", font?}]   full frame: the video plays inside
#       giant letters on a flat background (serif from brand/fonts by default).
#   shrink: [{t0, t1, rect: [x, y, w, h], r: 46, in: 0.6}]   the frame shrinks into a phone on the
#       dark background (bezel, shadow); holds until t1.
#   titles[].circle: [cx, cy, r]   instead of the bottom-anchored shrink, the room closes to a circle
#       around the face (face track) placed at (cx, cy); the layer sits on the dark background.
#   thumbs.behind: "fx/masks/<dir>"   the floating thumbnails go behind the speaker (person masks).
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H, FPS = 1080, 1920, 30
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
BRAND_BG0, BRAND_BG1 = "#0E0B14", "#1E1630"


def hexc(h):
    h = h.lstrip("#"); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


clamp = lambda x: min(1.0, max(0.0, x))
ease = lambda x: (lambda c: c * c * (3 - 2 * c))(clamp(x))
eo = lambda x: 1 - (1 - clamp(x)) ** 3


def spring(t, w=16.0, z=0.55):
    if t <= 0: return 0.0
    wd = w * np.sqrt(1 - z * z)
    return float(1 - np.exp(-z * w * t) * (np.cos(wd * t) + z * w / wd * np.sin(wd * t)))


def affine(img, S, tx, ty):
    """p' = S·p + t (output from input), resampled once."""
    return img.transform(img.size, Image.AFFINE, (1 / S, 0, -tx / S, 0, 1 / S, -ty / S), resample=Image.BILINEAR)


def smooth_track(v, cuts, tau=0.35):
    """forward-backward one-pole smoothing inside each shot (cuts = frame indices)"""
    out = v.copy(); k = 1 - np.exp(-1 / (tau * FPS))
    edges = [0] + sorted(c for c in cuts if 0 < c < len(v)) + [len(v)]
    for a, b in zip(edges, edges[1:]):
        seg = v[a:b].copy()
        for i in range(1, len(seg)): seg[i] = seg[i - 1] + k * (seg[i] - seg[i - 1])
        for i in range(len(seg) - 2, -1, -1): seg[i] = seg[i + 1] + k * (seg[i] - seg[i + 1])
        out[a:b] = seg
    return out


def fill_person(a, m):
    """cheap clean plate: the person's area filled from the surroundings, coarse to fine (pull-push);
    only ever seen under motion blur"""
    k = 1 - m
    fill = None
    for div in (64, 32, 16, 8):
        sm = (max(1, W // div), max(1, H // div))
        num = np.asarray(Image.fromarray(np.clip(a * k[..., None], 0, 255).astype(np.uint8)).resize(sm, Image.BOX).filter(ImageFilter.GaussianBlur(2)), np.float32)
        den = np.asarray(Image.fromarray((k * 255).astype(np.uint8)).resize(sm, Image.BOX).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
        lvl = num / np.maximum(den, 1e-3)
        if fill is None: fill = lvl
        else:
            up = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize(sm, Image.BILINEAR), np.float32)
            w = np.clip(den / 0.6, 0, 1); fill = lvl * w + up * (1 - w)
    full = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32)
    return a * k[..., None] + full * m[..., None]


def hshift_blur(a, x, length, n=9):
    """a shifted right by x px, smeared horizontally over `length` px; empty area left black"""
    acc = np.zeros_like(a)
    for i in range(n):
        dx = int(round(x + (i / (n - 1) - 0.5) * length)) if n > 1 else int(round(x))
        if dx >= W or dx <= -W: continue
        if dx >= 0: acc[:, dx:] += a[:, :W - dx]
        else: acc[:, :W + dx] += a[:, -dx:]
    return acc / n


class Grade:
    """Per-location colour match + brand shadow tint + S-curve as one 256-LUT per channel per shot."""
    def __init__(self, clean, bounds, g):
        stats = [[] for _ in bounds[:-1]]
        for f, im in enumerate(reader(clean, size=(135, 240))):
            if f % 3: continue
            i = max(0, np.searchsorted(bounds, f, side="right") - 1)
            if i < len(stats): stats[i].append(np.asarray(im, np.float32).reshape(-1, 3))
        mu = np.array([np.concatenate(x).mean(0) for x in stats]); sd = np.array([np.concatenate(x).std(0) for x in stats])
        ref = g.get("ref", "median")
        mt, st = (np.median(mu, 0), np.median(sd, 0)) if ref == "median" else (mu[int(ref)], sd[int(ref)])
        x = np.arange(256, dtype=np.float32)
        tint = (np.array(hexc(BRAND_BG1), np.float32) - np.mean(hexc(BRAND_BG1))) * 0.9   # purple, zero-mean
        self.bounds, self.luts, self.report = bounds, [], []
        for m, d in zip(mu, sd):
            gain = np.clip(st / d, 0.85, 1.2); shift = np.clip(mt - m, -20, 20)
            lut = []
            for c in range(3):
                y = x + g.get("match", 0.7) * ((x - m[c]) * gain[c] + m[c] + shift[c] - x)
                n = np.clip(y / 255, 0, 1)
                n = n + g.get("contrast", 0.12) * (n * n * (3 - 2 * n) - n)                   # gentle S-curve
                y = n * 255 + g.get("tint", 0.5) * tint[c] * (1 - n) ** 2                      # tint lives in the shadows
                lut.append(np.clip(np.round(y), 0, 255).astype(np.uint8))
            self.luts.append(np.stack(lut))
            self.report.append({"mean_rgb": [round(float(v)) for v in m], "gain": [round(float(v), 2) for v in gain], "shift": [round(float(v)) for v in shift]})
        self.grain = float(g.get("grain", 2.0))

    def apply(self, img, f):
        i = min(len(self.luts) - 1, max(0, int(np.searchsorted(self.bounds, f, side="right")) - 1))
        a = np.asarray(img); L = self.luts[i]
        return Image.fromarray(np.stack([L[c][a[..., c]] for c in range(3)], -1))

    def add_grain(self, img, f):
        if self.grain <= 0: return img
        n = np.random.default_rng(f).normal(0, self.grain, (H // 2, W // 2)).astype(np.float32)
        n = np.asarray(Image.fromarray(n, "F").resize((W, H), Image.BILINEAR))
        return Image.fromarray(np.clip(np.asarray(img, np.float32) + n[..., None], 0, 255).astype(np.uint8))


_VIG = None


def vignette():
    global _VIG
    if _VIG is None:
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        _VIG = np.clip(np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.45) / (H * 0.62)) ** 2), 0, 1) ** 2.2
    return _VIG


def _luma(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def look_moody(a, k):
    y = _luma(a)[..., None]
    a = a + (y - a) * 0.45 * k                                   # colours drain
    a = a * (1 - 0.34 * k)                                       # exposure down
    n = np.clip(a / 255, 0, 1); a = (n + 0.18 * k * (n * n * (3 - 2 * n) - n)) * 255   # harder S
    sh = (1 - np.clip(y / 160, 0, 1))                            # cold shadows
    a = a + np.stack([-7 * sh[..., 0], -1 * sh[..., 0], 12 * sh[..., 0]], -1) * k
    return a * (1 - 0.5 * k * vignette())[..., None]


def look_film(a, k):
    y = _luma(a)[..., None]
    a = a + (y - a) * 0.15 * k
    a = a * (1 - 0.07 * k) + 16 * k                              # lifted blacks
    hi = np.clip(y / 255, 0, 1)
    a = a + np.concatenate([14 * hi, 4 * hi, -10 * hi - 6], -1) * k   # warm highlights, teal-free shadows
    return a * (1 - 0.32 * k * vignette())[..., None]


def look_bw(a, k):
    y = _luma(a)[..., None]
    n = np.clip(y / 255, 0, 1); y = (n + 0.2 * (n * n * (3 - 2 * n) - n)) * 255
    return a + (y - a) * k


LOOKS = {"moody": look_moody, "film": look_film, "bw": look_bw}
SERIF = "brand/fonts/PlayfairDisplay-Variable.ttf"


def serif_font(size, weight="Black", path=SERIF):
    from PIL import ImageFont
    f = ImageFont.truetype(os.path.join(ROOT, path), size)
    try: f.set_variation_by_name(weight)
    except Exception: pass
    return f


def text_alpha(text, size, font=SERIF, max_w=W - 80, lead=0.92):
    """white-on-black L image of centred multi-line text, shrunk to fit max_w"""
    lines = text.split("\n")
    while True:
        F = serif_font(size, path=font)
        ws = [F.getbbox(l) for l in lines]
        if max(b[2] - b[0] for b in ws) <= max_w or size < 40: break
        size = int(size * 0.94)
    m = Image.new("L", (W, H), 0); d = ImageDraw.Draw(m)
    lh = size * lead; y0 = H / 2 - lh * len(lines) / 2
    for i, (l, b) in enumerate(zip(lines, ws)):
        d.text(((W - (b[2] - b[0])) / 2 - b[0], y0 + i * lh - b[1] + (lh - (b[3] - b[1])) / 2), l, font=F, fill=255)
    return m


def edl_joins(edl):
    """clean-timeline times of every cut join (head/tail trims excluded)"""
    keeps, s = [], 0.0
    for d in sorted(edl["delete_ranges"], key=lambda d: d["start"]):
        if d["start"] > s: keeps.append(d["start"] - s)
        s = max(s, d["end"])
    if s < edl["source_duration"]: keeps.append(edl["source_duration"] - s)
    return [round(float(c), 3) for c in np.cumsum(keeps)[:-1]]


def real_joins(clean, joins):
    """EDL joins snapped to the frame where clean.mp4 really cuts (apply-cuts rounds every
    segment to frames, so the error grows along the reel): the largest frame-to-frame change
    within −0.1…+0.15 s of each EDL join."""
    out = []
    for j in joins:
        a0 = max(0.0, np.floor((j - 0.1) * FPS) / FPS)            # on the frame grid
        fr = [np.asarray(im, np.float32) for im in reader(clean, ss=a0, t=0.25 + 1 / FPS, size=(135, 240))]
        if len(fr) < 2: out.append(j); continue
        d = [np.abs(fr[i + 1] - fr[i]).mean() for i in range(len(fr) - 1)]
        out.append((round(a0 * FPS) + int(np.argmax(d)) + 1) / FPS)   # exact frame time: f / FPS compares equal
    return out


def snap(cfg, edl_j, real_j):
    """replace every config time that sits on an EDL join (±0.02 s) with the real cut time"""
    def fix(t):
        if not isinstance(t, (int, float)): return t
        for e, r in zip(edl_j, real_j):
            if abs(t - e) <= 0.02: return r
        return t
    cfg["location_joins"] = [fix(t) for t in cfg.get("location_joins", [])]
    cfg["camera"] = [[fix(c[0]), fix(c[1]), *c[2:]] for c in cfg.get("camera", [])]
    for T in cfg.get("titles", []): T["t0"] = fix(T["t0"])
    for T in cfg.get("looks", []) + cfg.get("shrink", []) + cfg.get("textmask", []):
        T["t0"], T["t1"] = fix(T["t0"]), fix(T["t1"])
    return cfg


def load_config(project):
    cfg = json.load(open(os.path.join(project, "fx", "fx.json")))
    edl = json.load(open(os.path.join(project, "EDL.json")))
    joins = edl_joins(edl)
    errs = []
    for t in cfg.get("location_joins", []):
        if not any(abs(t - j) < 0.02 for j in joins): errs.append(f"location_join {t} is not an EDL join {joins}")
    for c in cfg.get("camera", []):
        if not (len(c) in (6, 7) and c[0] < c[1]): errs.append(f"camera segment {c}: [t0<t1, s0, s1, ax, ay, \"ease\"?]")
    for L in cfg.get("looks", []):
        if L.get("kind") not in LOOKS or not L["t0"] < L["t1"]: errs.append(f"look {L}: kind in {list(LOOKS)}, t0 < t1")
    for T in cfg.get("textmask", []) + cfg.get("shrink", []):
        if not T["t0"] < T["t1"]: errs.append(f"{T}: t0 < t1")
    for T in cfg.get("titles", []):
        if not (T["t0"] <= T["reveal"][0] < T["reveal"][1]): errs.append(f"title at {T['t0']}: t0 ≤ r0 < r1")
        if not os.path.exists(os.path.join(project, T["layer"])): errs.append(f"missing layer {T['layer']}")
    return cfg, joins, errs


# ---------- readers ----------
def reader(path, ss=None, t=None, size=(W, H), fmt="rgb24"):
    ch = 4 if fmt == "rgba" else 3
    args = ["ffmpeg", "-v", "quiet"] + (["-ss", str(ss)] if ss is not None else []) + ["-i", path] + \
           (["-t", str(t)] if t is not None else []) + ["-vf", f"fps={FPS},scale={size[0]}:{size[1]}:flags=bicubic",
                                                        "-f", "rawvideo", "-pix_fmt", fmt, "-"]
    pr = subprocess.Popen(args, stdout=subprocess.PIPE)
    n = size[0] * size[1] * ch
    try:
        while True:
            b = pr.stdout.read(n)
            if len(b) < n: return
            mode = "RGBA" if ch == 4 else "RGB"
            yield Image.frombuffer(mode, size, b, "raw", mode, 0, 1)
    finally:
        pr.kill()


class Layer:
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


def rounded(w, h, r, ss=2):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], radius=max(0, r * ss), fill=255)
    return m.resize((w, h), Image.LANCZOS)


def cover(img, w, h):
    iw, ih = img.size; s = max(w / iw, h / ih)
    r = img.resize((int(np.ceil(iw * s)), int(np.ceil(ih * s))), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def with_shadow(tile, pad=40, blur=18, strength=0.45, dy=14):
    w, h = tile.size
    out = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    a = Image.new("L", out.size, 0); a.paste(tile.getchannel("A"), (pad, pad + dy))
    out.putalpha(a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * strength)))
    out.alpha_composite(tile, (pad, pad))
    return out


def put(base, tile, x, y, alpha=1.0):
    if alpha <= 0.002: return
    if alpha < 1:
        tile = tile.copy(); tile.putalpha(tile.getchannel("A").point(lambda v: int(v * alpha)))
    base.paste(tile, (int(x), int(y)), tile)


class Picture:
    def __init__(self, project, cfg, joins):
        self.P, self.cfg, self.joins = project, cfg, joins
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.yy, self.xx = yy, xx
        g = np.clip(np.sqrt(((xx - 540) / 900) ** 2 + ((yy - 760) / 1100) ** 2), 0, 1)[..., None]
        b0, b1 = np.array(hexc(BRAND_BG0), np.float32), np.array(hexc(BRAND_BG1), np.float32)
        self.DARK = Image.fromarray((b1 * (1 - g) + b0 * g).astype(np.uint8))
        self.SHADE = Image.fromarray((np.clip(1 - np.arange(300) / 300, 0, 1) ** 1.6 * 150).astype(np.uint8)[:, None].repeat(W, 1))
        self.titles = [dict(T, _layer=Layer(os.path.join(project, T["layer"]), T["t0"])) for T in cfg.get("titles", [])]
        fc = cfg.get("face", {})
        self.face = None
        if fc.get("track"):
            fr = json.load(open(os.path.join(project, fc["track"])))["frames"]
            n = max(int(k) for k in fr) + 1; raw = np.full((n, 3), np.nan)
            for k, v in fr.items():
                if v: raw[int(k)] = [(v[0] + v[2] / 2) * W, (v[1] + v[3] / 2) * H, v[2] * W]
            for c in range(3):                                   # fill frames without a face
                ok = ~np.isnan(raw[:, c]); raw[:, c] = np.interp(np.arange(n), np.flatnonzero(ok), raw[ok, c])
            self.face = smooth_track(raw, [int(round(j * FPS)) for j in joins])
        self.follow, self.eye = fc.get("follow", False) and self.face is not None, fc.get("eye_match", False) and self.face is not None
        self.swaps = {}
        ws = cfg.get("world_swap")
        if ws:
            sel = cfg.get("location_joins", []) if ws.get("joins", "all") == "all" else ws["joins"]
            for j in sel:
                if any(T["t0"] - 0.6 <= j <= T["reveal"][1] + 0.6 for T in cfg.get("titles", [])): continue
                fj = int(round(j * FPS)); d = os.path.join(project, ws.get("masks", "fx/masks/swap"))
                if not os.path.exists(os.path.join(d, f"{fj:05d}.png")): print(f"world_swap {j}: no masks, run --prep-swap"); continue
                self.swaps[j] = {"dur": ws.get("dur", 0.32), "dir": d, "fj": fj}
        self.impacts = []
        for e in cfg.get("impacts", [{"from_sfx": True}]):
            if e.get("from_sfx"):
                self.impacts += [x for x in cfg.get("_hit_times", [])]
            else:
                self.impacts.append((e.get("t", e.get("_t")) + e.get("offset", 0.0), e.get("strength", 1.0)))
        self.grade = None
        if cfg.get("grade"):
            locs = [0] + [int(round(j * FPS)) for j in cfg.get("location_joins", [])] + [10 ** 9]
            self.grade = Grade(os.path.join(project, "renders", "clean.mp4"), locs, cfg["grade"])
        self.reel_cache = {}
        ph = cfg.get("phone")
        if ph:
            self.bez = 10
            self.sc_w, self.sc_h = ph["w"] - 2 * self.bez, ph["h"] - 2 * self.bez
            self.ph_out, self.ph_in = rounded(ph["w"], ph["h"], 46), rounded(self.sc_w, self.sc_h, 36)
            dur = ph["switch"] - ph["t0"] + 0.3
            self.raw_take = [cover(f, self.sc_w, self.sc_h) for f in reader(os.path.join(project, ph["raw"]["src"]), ss=ph["raw"]["ss"], t=dur)]
        th = cfg.get("thumbs")
        self.thumbs = []
        if th:
            for T in th["items"]:
                src = T["src"] if os.path.isabs(T["src"]) else os.path.join(ROOT, T["src"])
                T = dict(T, frames=[cover(f, T["w"], T["h"]) for f in reader(src, ss=T["ss"], t=T["dur"])], mask=rounded(T["w"], T["h"], 22))
                ring = Image.new("L", (T["w"], T["h"]), 0)
                ImageDraw.Draw(ring).rounded_rectangle([1, 1, T["w"] - 2, T["h"] - 2], radius=22, outline=150, width=3)
                T["ring"] = ring
                self.thumbs.append(T)
        self.tmasks = []
        for T in cfg.get("textmask", []):
            a = text_alpha(T["text"], T.get("size", 420), T.get("font", SERIF))
            st = T.get("stretch", 1.0)                       # tall condensed letters
            if st != 1.0:
                b = a.getbbox(); a = a.crop(b); a = a.resize((a.width, int(a.height * st)), Image.LANCZOS)
                m = Image.new("L", (W, H), 0); m.paste(a, ((W - a.width) // 2, int(T.get("cy", H / 2) - a.height / 2))); a = m
            self.tmasks.append(dict(T, _a=a))
        self.shrinks = cfg.get("shrink", [])
        self.looks = cfg.get("looks", [])
        self.film_cache = {}

    # --- person mask, smoothed over ±1 frame (Vision masks are per-frame) ---
    def mask(self, T, f):
        return self.mask_dir(os.path.join(self.P, T["masks"]), f)

    def mask_dir(self, d, f):
        acc, wsum = None, 0.0
        for k, w in ((-1, 0.25), (0, 0.5), (1, 0.25)):
            if k and any(min(f, f + k) < round(j * FPS) <= max(f, f + k) for j in self.joins): continue  # never across a cut
            p = os.path.join(d, f"{f + k:05d}.png")
            if not os.path.exists(p): continue
            m = np.asarray(Image.open(p).convert("L").resize((W, H), Image.BILINEAR), np.float32)
            acc = m * w if acc is None else acc + m * w; wsum += w
        if acc is None: return None
        return Image.fromarray(np.clip(acc / wsum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))

    # --- live looks («сделай мрачнее» / «кинематографичнее» / ч/б) ---
    def look_k(self, L, t):
        if not (L["t0"] <= t < L["t1"]): return 0.0
        k = 1.0 if L.get("wipe") else ease((t - L["t0"]) / max(L.get("rin", 0.6), 1e-3))
        if L.get("rout", 0) > 0: k *= 1 - ease((t - (L["t1"] - L["rout"])) / L["rout"])
        return k

    def apply_looks(self, img, t, skip=None):
        a, bars = None, 0.0
        for L in self.looks:
            if L is skip: continue
            k = self.look_k(L, t)
            if k <= 0.002: continue
            if a is None: a = np.asarray(img, np.float32)
            a = LOOKS[L["kind"]](a, k)
            if L["kind"] == "film": bars = max(bars, k)
        if a is None: return img, bars
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), bars

    def active_wipe(self, t):
        for L in self.looks:
            if L.get("wipe") == "film" and L["t0"] <= t < L["t0"] + 0.5: return L, (t - L["t0"]) / 0.5
        return None, 0.0

    def film_wipe(self, old, new, p):
        """old frame leaves upward, new one arrives, both inside a film strip with sprockets"""
        sc, gap = 0.84, 46
        w, h = int(W * sc), int(H * sc)
        x0 = (W - w) // 2
        e = ease(p)
        y_old = (H - h) / 2 - e * (h + gap)
        out = Image.new("RGB", (W, H), (10, 9, 12))
        if p > 0.0:
            for im, y in ((old, y_old), (new, y_old + h + gap)):
                if -h < y < H: out.paste(im.resize((w, h), Image.BILINEAR), (x0, int(round(y))))
        d = ImageDraw.Draw(out)
        hole, step = (46, 30), 76
        off = (-e * (h + gap)) % step
        for side in (x0 // 2 - hole[0] // 2, W - x0 // 2 - hole[0] // 2):
            y = -step + off
            while y < H:
                d.rounded_rectangle([side, y, side + hole[0], y + hole[1]], radius=7, fill=(236, 234, 242))
                y += step
        v = 4 * p * (1 - p)                                   # vertical smear while it runs
        if v > 0.15:
            a = np.asarray(out, np.float32); n = 5; L = int(70 * v)
            acc = sum(np.roll(a, int((i / (n - 1) - 0.5) * L), axis=0) for i in range(n)) / n
            out = Image.fromarray(acc.astype(np.uint8))
        return out

    def letterbox(self, out, k):
        if k <= 0.002: return out
        bh = int(round(205 * eo(k)))
        if bh <= 0: return out
        out = out.copy(); d = ImageDraw.Draw(out)
        d.rectangle([0, 0, W, bh], fill=(0, 0, 0)); d.rectangle([0, H - bh, W, H], fill=(0, 0, 0))
        return out

    # --- full-frame text with the video inside the letters ---
    def textmask_frame(self, img, T, t):
        bg = Image.new("RGB", (W, H), hexc(T.get("bg", "#ECEAF2")))
        p = (t - T["t0"]) / (T["t1"] - T["t0"])
        k = spring(t - T["t0"], 18, 0.6)
        room = scale_about(img, 1.0 + 0.06 * p, 540, 900)
        s = 1.12 - 0.12 * k
        a = scale_about(T["_a"], s, W / 2, H / 2)
        sh = a.filter(ImageFilter.GaussianBlur(14)).point(lambda v: int(v * 0.28))
        bg.paste((40, 30, 60), (0, 10), sh)
        bg.paste(room, (0, 0), a)
        return bg

    # --- the frame shrinks into a phone ---
    def shrink_frame(self, out, S, t):
        k = eo((t - S["t0"]) / S.get("in", 0.6))
        x, y, w, h = S["rect"]
        X, Y = 0 + (x - 0) * k, 0 + (y - 0) * k
        Wd, Hd = W + (w - W) * k, H + (h - H) * k
        if Wd >= W - 1: return out
        bz = int(round(14 * k)); r = int(round(S.get("r", 46) * k))
        tile = out.resize((max(1, int(Wd)), max(1, int(Hd))), Image.BILINEAR).convert("RGBA")
        tile.putalpha(rounded(tile.width, tile.height, max(0, r - bz // 2)))
        body = Image.new("RGBA", (tile.width + 2 * bz, tile.height + 2 * bz), (22, 20, 28, 255))
        body.putalpha(rounded(body.width, body.height, r))
        ring = Image.new("L", body.size, 0)
        ImageDraw.Draw(ring).rounded_rectangle([1, 1, body.width - 2, body.height - 2], radius=r, outline=110, width=2)
        body.alpha_composite(tile, (bz, bz))
        body.alpha_composite(Image.merge("RGBA", [Image.new("L", body.size, 200)] * 3 + [ring]))
        res = self.DARK.copy()
        if k < 1:   # the room fades into the brand background as it shrinks
            res = Image.blend(out, res, clamp(k * 1.6))
        tile = with_shadow(body, pad=60, blur=30, strength=0.55, dy=24)
        res.paste(tile, (int(X - bz - 60), int(Y - bz - 60)), tile)
        return res

    # --- title variant: the room closes into a circle around the face ---
    def circle_frame(self, img, T, f, t):
        cx, cy, r = T["circle"]
        r0, r1 = T["reveal"]
        k = eo((t - T["t0"]) / 0.45) * (1 - ease((t - r0) / (r1 - r0)))
        fx, fy, fw = self.face_at(t)
        S1 = 1.25 * r / max(fw, 1)
        S = 1 + (S1 - 1) * k
        px, py = fx + (cx - fx) * k, fy + (cy - fy) * k
        room = affine(img, S, px - S * fx, py - S * fy)
        R = 1500 + (r - 1500) * k
        out = self.DARK.copy()
        txt = T["_layer"].at(t)
        if txt is not None: out.paste(txt, (0, 0), txt)
        m = np.clip((R - np.sqrt((self.xx - px) ** 2 + (self.yy - py) ** 2)) * 1.5, 0, 255).astype(np.uint8)
        out.paste(room, (0, 0), Image.fromarray(m))
        if k > 0.5:
            d = ImageDraw.Draw(out)
            d.ellipse([px - R - 3, py - R - 3, px + R + 3, py + R + 3], outline=hexc("#B79CFF"), width=4)
        return out

    def behind(self, out, room, f, t):
        """paste the speaker from `room` (already through the camera) over the thumbnails"""
        th = self.cfg.get("thumbs") or {}
        if not th.get("behind") or not any(T["t_in"] <= t < th["out"] + 0.12 for T in self.thumbs): return
        m = self.mask_dir(os.path.join(self.P, th["behind"]), f)
        if m is None: return
        S, tx, ty = self.transform(t)
        if abs(S - 1) > 1e-4 or abs(tx) > 0.05 or abs(ty) > 0.05: m = affine(m, S, tx, ty)
        out.paste(room, (0, 0), m)

    def title_frame(self, img, T, f, t):
        if T.get("circle"): return self.circle_frame(img, T, f, t)
        r0, r1 = T["reveal"]
        k = ease((t - r0) / (r1 - r0))
        S = T.get("scale", 0.8)
        s = S + (1 - S) * k
        room = scale_about(img, s, 540, H)
        out = self.DARK.copy()
        m = self.mask(T, f) if T.get("masks") else None
        txt = T["_layer"].at(t)
        if m is not None:                                    # cut-out: text behind the head, iris reveal
            if t >= r0:
                fy = H - (H - T["face"][1]) * s
                rad = 2400 * eo((t - r0) / (r1 - r0))
                iris = np.clip((rad - np.sqrt((self.xx - T["face"][0]) ** 2 + (self.yy - fy) ** 2)) / 50, 0, 1)
                inside = np.asarray(scale_about(Image.new("L", (W, H), 255), s, 540, H), np.float32) / 255
                out.paste(room, (0, 0), Image.fromarray((iris * inside * 255).astype(np.uint8)))
            if txt is not None: out.paste(txt, (0, 0), txt)
            out.paste(room, (0, 0), scale_about(m, s, 540, H))
            return out
        rad = int(round(56 * (1 - k)))                        # no masks: rounded window that grows back
        x0, y0 = int(round(540 - 540 * s)), int(round(H - H * s))
        if (1 - k) > 0.01:
            room.paste((0, 0, 0), (0, y0), self.SHADE.point(lambda v: int(v * (1 - k))))
        win = Image.new("L", (W, H), 255) if s >= 0.999 else Image.new("L", (W, H), 0)
        if s < 0.999: win.paste(rounded(W - 2 * x0, H - y0 + rad + 2, rad), (x0, y0))
        out.paste(room, (0, 0), win)
        if txt is not None: out.paste(txt, (0, 0), txt)
        return out

    def face_at(self, t):
        return self.face[min(len(self.face) - 1, max(0, int(round(t * FPS))))]

    def cam(self, t):
        """(scale, anchor) of the camera segment at t; follow → the anchor is the face"""
        for c in self.cfg.get("camera", []):
            t0, t1, s0, s1, ax, ay = c[:6]
            if t0 <= t < t1:
                if self.follow: ax, ay = self.face_at(t)[:2]
                p = (t - t0) / (t1 - t0)
                return s0 + (s1 - s0) * (eo(p) if len(c) > 6 and c[6] == "ease" else p), ax, ay
        return 1.0, 540.0, 960.0

    def mapped_face(self, t):
        s, ax, ay = self.cam(t); fx, fy, fw = self.face_at(t)
        return np.array([ax + s * (fx - ax), ay + s * (fy - ay)]), fw * s

    def transform(self, t):
        """(S, tx, ty): camera move, plus the halfway eye-match around location joins"""
        s, ax, ay = self.cam(t)
        S, tx, ty = s, (1 - s) * ax, (1 - s) * ay
        if not self.eye: return S, tx, ty
        for j in self.cfg.get("location_joins", []):
            if any(T["t0"] - 0.6 <= j <= T["reveal"][1] + 0.6 for T in self.titles): continue
            if not (j - 0.25 <= t < j + 0.5): continue
            co, wo = self.mapped_face(j - 1 / FPS); ci, wi = self.mapped_face(j)
            m = (co + ci) / 2
            if t < j: k, c, z = ease((t - (j - 0.25)) / 0.25), co, min(1.15, max(1.0, np.sqrt(wi / wo)))
            else: k, c, z = 1 - eo((t - j) / 0.5), ci, min(1.15, max(1.0, np.sqrt(wo / wi)))
            f = self.face_at(t)[:2]
            q0 = np.array([S * f[0] + tx, S * f[1] + ty])           # face after the camera
            for shrink in (1.0, 0.75, 0.5, 0.25, 0.0):             # keep the frame covered, scale ≤ 1.45
                q = q0 + (m - c) * k * shrink
                S2 = S * (1 + (z - 1) * k)
                need = max(S2, q[0] / max(f[0], 1), (W - q[0]) / max(W - f[0], 1), q[1] / max(f[1], 1), (H - q[1]) / max(H - f[1], 1))
                if need <= 1.45: break
            return need, q[0] - need * f[0], q[1] - need * f[1]
        return S, tx, ty

    def camera(self, img, t):
        S, tx, ty = self.transform(t)
        if abs(S - 1) < 1e-4 and abs(tx) < 0.05 and abs(ty) < 0.05: return img
        return affine(img, S, tx, ty)

    def zoom_blur(self, img, t):
        for j in self.cfg.get("location_joins", []):
            d = abs(t - j)
            if d < 0.134:
                k = 1 - d / 0.134
                if j in self.swaps: return img                      # the whip replaces the zoom-blur
                base, n = 1 + 0.22 * k ** 1.5, 8
                acc = np.zeros((H, W, 3), np.float32)
                for i in range(n):
                    acc += np.asarray(scale_about(img, base * (1 + 0.07 * k * i / (n - 1)), 540, 900), np.float32)
                return Image.fromarray(np.clip(acc / n * (1 + 0.06 * k), 0, 255).astype(np.uint8))
        return img

    def phone(self, out, t):
        ph = self.cfg.get("phone")
        if not ph or not (ph["t0"] <= t < ph["t1"]): return
        if t < ph["switch"]:
            fr = self.raw_take[min(len(self.raw_take) - 1, int(round((t - ph["t0"]) * FPS)))]
        else:
            key = int(round((ph["reel_from"] + (t - ph["switch"])) * FPS))
            fr = self.reel_cache.get(key)
            if fr is None: fr = self.reel_cache[max(self.reel_cache)]
        tile = Image.new("RGBA", (ph["w"], ph["h"]), hexc(BRAND_BG0) + (0,)); tile.putalpha(self.ph_out)
        scr = fr.convert("RGBA"); scr.putalpha(self.ph_in)
        tile.alpha_composite(scr, (self.bez, self.bez))
        tile = with_shadow(tile)
        s = 0.82 + 0.18 * spring(t - ph["t0"])
        if abs(s - 1) > 0.002:
            tile = tile.resize((int(tile.width * s), int(tile.height * s)), Image.BILINEAR)
        cx, cy = ph["x"] + ph["w"] / 2, ph["y"] + ph["h"] / 2
        a = clamp((t - ph["t0"]) / 0.12) * (1 - clamp((t - (ph["t1"] - 0.09)) / 0.09))
        put(out, tile, cx - tile.width / 2, cy - tile.height / 2, a)

    def floating(self, out, t):
        th = self.cfg.get("thumbs")
        if not th: return
        t_out = th["out"]
        for T in self.thumbs:
            if not (T["t_in"] <= t < t_out + 0.12): continue
            fr = T["frames"][min(len(T["frames"]) - 1, int(round((t - T["t_in"]) * FPS)))].convert("RGBA")
            fr.putalpha(T["mask"])
            fr.alpha_composite(Image.merge("RGBA", [Image.new("L", fr.size, 245)] * 3 + [T["ring"]]))
            tile = with_shadow(fr, pad=50)
            k = spring(t - T["t_in"], 14, 0.5)
            leave = clamp((t - t_out) / 0.12)
            s = (0.55 + 0.45 * k) * (1 - 0.1 * leave)
            deg = T["deg"] * k + 1.2 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.4)
            dy = 7 * np.sin(2 * np.pi * (t - T["t_in"]) / 2.0)
            tile = tile.resize((max(1, int(tile.width * s)), max(1, int(tile.height * s))), Image.BILINEAR).rotate(deg, Image.BICUBIC, expand=True)
            put(out, tile, T["cx"] - tile.width / 2, T["cy"] - tile.height / 2 + dy, clamp((t - T["t_in"]) / 0.1) * (1 - leave))

    def swap_prepare(self, j, sw, img_j):
        """incoming clean plate, transformed like the incoming shot at the join"""
        S, tx, ty = self.transform(j)
        im = affine(img_j, S, tx, ty) if abs(S - 1) > 1e-4 or abs(tx) > 0.05 or abs(ty) > 0.05 else img_j
        m = self.mask_dir(sw["dir"], sw["fj"])
        m = affine(m, S, tx, ty) if m is not None else Image.new("L", (W, H), 0)
        sw["in_bg"] = fill_person(np.asarray(im, np.float32), np.asarray(m, np.float32) / 255)

    def world_swap(self, room, f, t):
        for j, sw in self.swaps.items():
            if j <= t < j + 0.1:                                # whip continues into the new room, 3 frames
                q = (t - j) / 0.1
                L = 2.2 / sw["dur"] * W / FPS * 0.9 * (1 - q) ** 2
                a = np.asarray(room, np.float32)
                return Image.fromarray(np.clip(hshift_blur(a, 60 * (1 - q) ** 2, L), 0, 255).astype(np.uint8))
            if not (j - sw["dur"] <= t < j) or "in_bg" not in sw: continue
            p = (t - (j - sw["dur"])) / sw["dur"]
            e = p ** 2.2; v = 2.2 * p ** 1.2                    # ease-in: the cut lands at full speed, under the blur
            m = self.mask_dir(sw["dir"], f)
            if m is None: return room
            S, tx, ty = self.transform(t)
            if abs(S - 1) > 1e-4 or abs(tx) > 0.05 or abs(ty) > 0.05: m = affine(m, S, tx, ty)
            ma = np.asarray(m, np.float32) / 255
            a = np.asarray(room, np.float32)
            out_bg = fill_person(a, ma)
            blur = v / sw["dur"] * W / FPS * 0.9                 # px travelled in 0.9 of a frame
            bg = hshift_blur(out_bg, -e * W, blur) + hshift_blur(sw["in_bg"], W - e * W, blur)
            sh = Image.fromarray((ma * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22))
            sh = np.roll(np.asarray(sh, np.float32) / 255, 18, axis=0) * 0.45 * min(1, 4 * p)
            bg = bg * (1 - sh[..., None])
            out = bg * (1 - ma[..., None]) + a * ma[..., None]
            return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
        return room

    def impact(self, img, t):
        for t0, k in self.impacts:
            if not (t0 <= t < t0 + 0.25): continue
            d = k * np.exp(-(t - t0) / 0.06)
            if d < 0.03: return img
            dx, dy = 16 * d * np.sin(2 * np.pi * 27 * (t - t0) + 0.6), 10 * d * np.cos(2 * np.pi * 21 * (t - t0))
            im = affine(img, 1 + 0.035 * d, -540 * 0.035 * d + dx, -960 * 0.035 * d + dy)
            a = np.asarray(im, np.float32)
            sp = int(round(7 * d))
            if sp:
                a = a.copy(); a[:, sp:, 0] = a[:, :-sp, 0]; a[:, :-sp, 2] = a[:, sp:, 2]
            a = a + (255 - a) * 0.12 * d
            return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        return img

    def frame(self, img, f, t):
        if self.grade: img = self.grade.apply(img, f)
        tm = next((T for T in self.tmasks if T["t0"] <= t < T["t1"]), None)
        if tm:
            out = self.textmask_frame(img, tm, t)
            return self.grade.add_grain(out, f) if self.grade else out
        raw = img
        img, bars = self.apply_looks(img, t)
        T = next((T for T in self.titles if T["t0"] <= t < T["reveal"][1] + 0.02), None)
        room = None
        if T: out = self.title_frame(img, T, f, t)
        else:
            room = self.camera(img, t)
            L, p = self.active_wipe(t)
            if L is not None:
                old, _ = self.apply_looks(raw, t, skip=L)
                out = self.film_wipe(self.letterbox(self.camera(old, t), 0), self.letterbox(room, bars), p)
                bars = 0
            else:
                out = self.world_swap(room, f, t)
            out = self.letterbox(out, bars)
        ph = self.cfg.get("phone")
        if ph and ph["reel_from"] - 0.1 <= t <= ph["reel_from"] + (ph["t1"] - ph["switch"]) + 0.2:
            self.reel_cache[f] = cover(out, self.sc_w, self.sc_h)
        out = self.zoom_blur(out, t)
        if out is img: out = img.copy()
        self.floating(out, t)
        if room is not None: self.behind(out, self.letterbox(room, bars) if bars else room, f, t)
        S = next((S for S in self.shrinks if S["t0"] <= t < S["t1"]), None)
        if S: out = self.shrink_frame(out, S, t)
        self.phone(out, t)
        out = self.impact(out, t)
        if self.grade: out = self.grade.add_grain(out, f)
        return out


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__ or "usage: fx_picture.py <project> [--stills t,...] [--validate]"); sys.exit(1)
    P = os.path.abspath(a[0])
    cfg, joins, errs = load_config(P)
    if errs or "--validate" in a:
        for e in errs: print("ERROR", e)
        print("joins", joins); sys.exit(1 if errs else 0)
    dur = float(json.load(open(os.path.join(P, "transcript.clean.json")))["audio_duration_secs"])
    N = int(round(dur * FPS))
    stills = None
    if "--stills" in a:
        stills = {int(round(float(x) * FPS)) for x in a[a.index("--stills") + 1].split(",")}
    real = real_joins(os.path.join(P, "renders", "clean.mp4"), joins)
    print("joins (EDL → video):", " ".join(f"{e}→{r:.3f}" for e, r in zip(joins, real)))
    cfg = snap(cfg, joins, real)
    words = json.load(open(os.path.join(P, "transcript.clean.json")))["words"]
    norm = lambda w: w.strip(".,!?«»…:;\"").lower()
    def word_t(word, after=0.0):
        return next(w["start"] for w in words if w["start"] >= after - 1e-6 and norm(w["text"]) == norm(word))
    cfg["_hit_times"] = [((e["t"] if "t" in e else word_t(e["word"], e.get("after", 0.0))) + e.get("offset", 0.0), 1.0)
                         for e in cfg.get("sfx", []) if e.get("kind") == "hit"]
    for e in cfg.get("impacts", []):
        if "word" in e: e["_t"] = word_t(e["word"], e.get("after", 0.0))
    if "--prep-swap" in a:
        ws = cfg.get("world_swap", {}); dur = ws.get("dur", 0.32)
        sel = cfg.get("location_joins", []) if ws.get("joins", "all") == "all" else ws["joins"]
        need = set()
        for j in sel:
            fj = int(round(j * FPS)); need |= set(range(fj - int(np.ceil(dur * FPS)) - 2, fj + 2))
        fdir = os.path.join(P, "work", "swap-frames"); os.makedirs(fdir, exist_ok=True)
        for f, im in enumerate(reader(os.path.join(P, "renders", "clean.mp4"), size=(540, 960))):
            if f > max(need): break
            if f in need: im.save(os.path.join(fdir, f"{f:05d}.png"))
        mdir = os.path.join(P, ws.get("masks", "fx/masks/swap"))
        subprocess.run(["swift", os.path.join(ROOT, "scripts/ru/fx/person-mask.swift"), fdir, mdir], check=True)
        return
    pic = Picture(P, cfg, real)
    for j, sw in pic.swaps.items():                       # the incoming room, graded, before its window starts
        im = next(reader(os.path.join(P, "renders", "clean.mp4"), ss=sw["fj"] / FPS, t=1 / FPS), None)
        if im is not None: pic.swap_prepare(j, sw, pic.grade.apply(im, sw["fj"]) if pic.grade else im)
    print("world swaps:", ", ".join(f"{j:.3f}" for j in pic.swaps) or "none", "| impacts:", ", ".join(f"{t:.2f}" for t, _ in pic.impacts) or "none")
    if pic.grade:
        for i, r in enumerate(pic.grade.report): print(f"grade shot {i}: {r}")
    clean = os.path.join(P, "renders", "clean.mp4")
    sdir = os.path.join(P, "review", "fx-stills"); os.makedirs(sdir, exist_ok=True)
    enc = None
    if stills is None:
        out_path = os.path.join(P, a[a.index("--out") + 1]) if "--out" in a else os.path.join(P, "renders", "picture.mp4")
        sfx = cfg.get("audio", {}).get("sfx")
        smix = cfg.get("audio", {}).get("mix")          # scripts/ru/fx/sound.py: voice + SFX + music, already mixed
        if smix:
            aud, mix = ["-i", os.path.join(P, smix)], ["-map", "0:v", "-map", "1:a"]
        else:
            aud = ["-i", clean] + (["-i", os.path.join(P, sfx)] if sfx else [])
            mix = ["-filter_complex", "[1:a]aresample=48000[v];[v][2:a]amix=inputs=2:normalize=0:duration=first[a]", "-map", "0:v", "-map", "[a]"] if sfx \
                else ["-map", "0:v", "-map", "1:a"]
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", *aud, *mix,
                                "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-shortest", out_path],
                               stdin=subprocess.PIPE)
    last = max(stills) if stills else N - 1
    for f, img in enumerate(reader(clean)):
        if f > last: break
        out = pic.frame(img, f, f / FPS)
        if enc: enc.stdin.write(out.tobytes())
        if stills and f in stills: out.save(os.path.join(sdir, f"{f / FPS:06.2f}.png"))
    if enc:
        enc.stdin.close(); enc.wait()
        print("picture →", os.path.relpath(out_path, ROOT))


if __name__ == "__main__":
    main()
