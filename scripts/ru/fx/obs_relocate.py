#!/usr/bin/env python3
# OBS take → a clean base for the reel. Pillow + numpy + ffmpeg (+ Apple Vision for masks), system python3.
#
#   python3 scripts/ru/fx/obs_relocate.py --detect <video>        OBS layout? → JSON (footage-check.mjs)
#   python3 scripts/ru/fx/obs_relocate.py <project> [--look card|relocate] [--stills 1.0,4.5] [--masks]
#       [--zoom 1.0,1.07] [--zoom-gap 0] [--head-top 0.586] [--scale 1.10] [--card x0,y0,x1,y1,r] [--jobs N]
#
# The take was recorded through the customer's OBS scene: the camera is a rounded card at the bottom
# of a flat one-colour canvas, template placeholders («Заголовок ролика», «Здесь будет браузер…»)
# are burned in above it. The card geometry (x0, y0, x1, y1, corner r) is found on the frames, not
# hard-coded: the flat canvas is the median colour of the frame border, the card is the tallest block
# of rows with straight left/right edges that differ from it; r is fitted to the top corners.
#
# --look card (default; customer 2026-10-21 on two reels: «маска работает плохо, она стул мигает»,
#   «уже больно лагающе выглядит» — the cut-out went back to the card): the brand canvas covers the
#   whole frame and the placeholders, the card stays where OBS put it (our rounded mask 2 px inside its
#   edge); on every EDL join the picture inside the card alternates 1.00 / 1.07 about a point above the
#   face, so the head does not jump on a jump cut. No person masks are needed unless skin or titles ask.
# --look relocate (only when the masks hold in motion — no chair back or furniture clinging to him —
#   and offered as a choice on the preview): the card is only the source of the picture —
#   - the speaker is cut out with Apple Vision person masks (person-mask.swift on the card frames);
#   - the card is stretched ×scale to the full width, the top of the head sits at head_top·H (≈ 59 %:
#     captions at y 1030 never touch the hair, even zoomed in);
#   - where the hair touches the top edge of the card, the top of the head is rebuilt as an arc (hair
#     colour from the top rows), otherwise the cut-out has a flat top;
#   - behind him is his own room without him: the hole filled from the surroundings (pull-push, like
#     fx_picture's fill_person), blurred, desaturated (0.55) and lifted toward #F0EEF4 (0.45, more at
#     the top, where the windows go), with a soft shadow — the same look as fx.json relocate;
#   - zoom 1.00 / 1.05 about the face on the joins; the masks of the last piece go to fx/masks/cta.
# Both looks: joins are snapped to the frame where the video really cuts (--zoom-gap S: at most one
# zoom change per S seconds — tightened pauses give joins 4–10 frames apart); the last piece (the CTA)
# has no zoom; fx.json "skin": {"deshine": 0.8} is applied to the card (deshine.py, kept to the person
# by its mask) and recorded in the stamp, so fx_picture.py does not apply it twice.
# Files: build-edl's renders/clean.mp4 moves to renders/clean.source.mp4 (an older source goes to
# work/archive/), the result is renders/clean.mp4 (30 fps, audio copied) + renders/clean.obs.json
# (stamp: look, card, geometry, joins, deshine). Card frames and masks are cached in work/obs/.
# Person masks of the result in frame coordinates (what fx_picture needs to put text behind the head)
# go to every fx.json title window that names a "masks" dir. --masks rewrites only those masks (after
# titles were added to fx.json); --stills writes review/obs-<look>-<t>.png and nothing else.
import json, os, shutil, subprocess, sys, time
from io import BytesIO
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from deshine import deshine                                   # noqa: E402
from fx_picture import BRAND_CANVAS, hexc                     # noqa: E402

W, H, FPS = 1080, 1920, 30
PAD = 100                         # room above the card for the rebuilt top of the head
EDGE = 4                          # OBS draws a light rim in the first rows of the card; Vision frays there
LIFT_TO = np.array((0xF0, 0xEE, 0xF4), np.float32)
Q = (W // 4, H // 4)              # the room is blurred anyway: it is built at ¼ size


# ---------- detection ----------
def grab(video, t):
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
                       capture_output=True)
    return Image.open(BytesIO(r.stdout)).convert("RGB") if r.stdout else None


def duration(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def arc_inset(r, dist):
    """how far a rounded corner of radius r is from the straight edge, `dist` px from the card edge"""
    dist = np.asarray(dist, np.float32)
    return np.where(dist < r, r - np.sqrt(np.clip(r * r - (r - dist) ** 2, 0, None)), 0.0)


def detect(video, at=(0.2, 0.4, 0.6, 0.8), tol=14):
    """{obs, card: [x0, y0, x1, y1], r, bg, flat, size}; y1 may lie below the frame (the card runs out)"""
    dur = duration(video)
    fr = [np.asarray(im, np.float32) for im in (grab(video, dur * p) for p in at) if im is not None]
    if not fr: return {"obs": False, "error": "no frames"}
    h, w = fr[0].shape[:2]
    e = 6
    border = np.concatenate([np.concatenate([f[:e].reshape(-1, 3), f[:, :e].reshape(-1, 3), f[:, -e:].reshape(-1, 3)]) for f in fr])
    bg = np.median(border, 0)
    flat = float((np.abs(border - bg).max(1) < tol).mean())
    out = {"obs": False, "flat": round(flat, 3), "bg": "#%02X%02X%02X" % tuple(int(round(v)) for v in bg), "size": [w, h]}
    if flat < 0.85: return out                                     # a real room around the frame edge
    nb = np.zeros((h, w), bool)                                    # not the canvas in any sampled frame
    for f in fr: nb |= np.abs(f - bg).max(2) > tol
    has = nb.any(1)
    xl = np.where(has, nb.argmax(1), w)
    xr = np.where(has, w - 1 - nb[:, ::-1].argmax(1), -1)
    span = xr - xl + 1
    ok = has & (span >= 0.4 * w) & (nb.sum(1) >= 0.9 * span)       # solid rows: the card, a filled box
    idx = np.flatnonzero(ok)
    if not len(idx): return out
    groups = np.split(idx, np.flatnonzero(np.diff(idx) > 4) + 1)
    g = max(groups, key=lambda g: g[-1] - g[0])
    ya, yb = int(g[0]), int(g[-1]) + 1
    if yb - ya < 0.2 * h: return out
    mid = np.arange(ya + (yb - ya) // 4, yb - (yb - ya) // 4)
    x0, x1 = int(np.median(xl[mid])), int(np.median(xr[mid])) + 1
    bent = max(np.percentile(np.abs(xl[mid] - x0), 90), np.percentile(np.abs(xr[mid] + 1 - x1), 90))
    if bent > 2: return out                                        # a silhouette on a plain wall, not a card
    K = min(220, (yb - ya) // 2)
    ins = ((xl[ya:ya + K] - x0) + (x1 - 1 - xr[ya:ya + K])) / 2.0
    k = np.arange(K) + 0.5
    r = min(range(0, 201), key=lambda r: float(np.abs(ins - arc_inset(r, k)).mean()))
    y1 = yb
    if yb >= h:                                                    # runs out of the frame: fit the bottom arcs
        insb = ((xl[h - 1:h - 1 - K:-1] - x0) + (x1 - 1 - xr[h - 1:h - 1 - K:-1])) / 2.0
        d = min(range(0, r + 1), key=lambda d: float(np.abs(insb - arc_inset(r, k + d)).mean()))
        y1 = h + d
    inner = np.zeros((h, w), bool); inner[ya:min(y1, h), x0:x1] = True
    canvas = float((~nb[~inner]).mean())                           # the rest is mostly the flat canvas
    out.update({"obs": canvas > 0.5, "card": [x0, ya, x1, int(y1)], "r": int(r), "canvas_share": round(canvas, 3)})
    return out


def rounded_mask(w, h, r, inset=2, ss=2):
    m = Image.new("L", (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([inset * ss, inset * ss, (w - inset) * ss - 1, (h - inset) * ss - 1], radius=max(0, r * ss), fill=255)
    return np.asarray(m.resize((w, h), Image.LANCZOS), np.float32) / 255


# ---------- the reel project ----------
def is_stamped(out, stamp):
    st = json.load(open(stamp)) if os.path.exists(stamp) else {}
    return os.path.exists(out) and os.path.getsize(out) == st.get("out_size")


def prepare_source(P):
    """build-edl writes renders/clean.mp4; the OBS source of the relocate pass is renders/clean.source.mp4"""
    src, out, stamp = (os.path.join(P, "renders", n) for n in ("clean.source.mp4", "clean.mp4", "clean.obs.json"))
    if os.path.exists(out) and not is_stamped(out, stamp) and detect(out).get("obs"):
        if os.path.exists(src):                                    # a new build-edl render replaces the old source
            arch = os.path.join(P, "work", "archive"); os.makedirs(arch, exist_ok=True)
            dst = os.path.join(arch, time.strftime("clean.source.%Y%m%d-%H%M%S.mp4", time.localtime(os.path.getmtime(src))))
            os.replace(src, dst); print("old source →", os.path.relpath(dst, P))
        os.replace(out, src); print("renders/clean.mp4 (build-edl, OBS layout) → renders/clean.source.mp4")
    if not os.path.exists(src): sys.exit("no renders/clean.source.mp4: run build-edl first (its renders/clean.mp4 becomes the source)")
    return src, out, stamp


def card_frames(P, src, card, masks=True):
    """card crops at 30 fps (+ Apple Vision person masks), cached in work/obs/ until the source or card changes"""
    d = os.path.join(P, "work", "obs"); fdir, mdir = os.path.join(d, "frames"), os.path.join(d, "masks")
    key = {"src_size": os.path.getsize(src), "src_mtime": int(os.path.getmtime(src)), "card": card, "crop": "rgb24"}
    meta = os.path.join(d, "frames.json")
    pngs = lambda p: sorted(f for f in os.listdir(p) if f.endswith(".png")) if os.path.isdir(p) else []
    if (json.load(open(meta)) if os.path.exists(meta) else None) != key or not pngs(fdir):
        shutil.rmtree(fdir, ignore_errors=True); shutil.rmtree(mdir, ignore_errors=True); os.makedirs(fdir)
        x0, y0, x1, y1 = card
        print("card frames →", os.path.relpath(fdir, P), flush=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"fps={FPS},format=rgb24,crop={x1 - x0}:{min(y1, H) - y0}:{x0}:{y0}",
                        "-start_number", "0", os.path.join(fdir, "%05d.png")], check=True)
        json.dump(key, open(meta, "w"))
    if masks and len(pngs(mdir)) != len(pngs(fdir)):
        print("person masks (Apple Vision) →", os.path.relpath(mdir, P), flush=True)
        subprocess.run(["swift", os.path.join(HERE, "person-mask.swift"), fdir, mdir], check=True)
    return fdir, (mdir if len(pngs(mdir)) == len(pngs(fdir)) else None), len(pngs(fdir))   # rgb24 before the crop: exact size


def edl_join_frames(P):
    edl = json.load(open(os.path.join(P, "EDL.json")))
    keep, t = [], 0.0
    for d in sorted(edl["delete_ranges"], key=lambda r: r["start"]):
        if d["start"] > t: keep.append((t, d["start"]))
        t = max(t, d["end"])
    if t < edl["source_duration"]: keep.append((t, edl["source_duration"]))
    joins, acc = [], 0.0
    for a, b in keep[:-1]:
        acc += b - a; joins.append(int(round(acc * FPS)))
    return joins


def snap_joins(fdir, joins, n):
    """EDL join → the frame where the card picture really jumps (largest change within −4…+5 frames,
    never past the middle to a neighbouring join); kept when nothing stands out"""
    cache = {}
    def small(f):
        if f not in cache:
            im = Image.open(os.path.join(fdir, f"{f:05d}.png")).convert("L")
            cache[f] = np.asarray(im.resize((max(1, im.width // 8), max(1, im.height // 8)), Image.BILINEAR), np.float32)
        return cache[f]
    out = []
    for i, j in enumerate(joins):
        lo = max(1, j - 4, (joins[i - 1] + j) // 2 + 1 if i else 1)
        hi = min(n - 1, j + 5, (j + joins[i + 1]) // 2 if i + 1 < len(joins) else n - 1)
        fs = list(range(lo, hi + 1))
        if not fs: out.append(j); continue
        d = np.array([np.abs(small(f) - small(f - 1)).mean() for f in fs])
        out.append(fs[int(np.argmax(d))] if d.max() >= 1.8 * max(np.median(d), 1e-3) else j)
    return out


def fill_q(a, m):
    """pull-push fill of the holes (m = 1) from the surroundings on the small frame (fill_person at ¼)"""
    k = 1 - m; qw, qh = a.shape[1], a.shape[0]
    fill = None
    for div in (16, 8, 4, 2):
        sm = (max(1, qw // div), max(1, qh // div))
        num = np.asarray(Image.fromarray(np.clip(a * k[..., None], 0, 255).astype(np.uint8)).resize(sm, Image.BOX).filter(ImageFilter.GaussianBlur(2)), np.float32)
        den = np.asarray(Image.fromarray((k * 255).astype(np.uint8)).resize(sm, Image.BOX).filter(ImageFilter.GaussianBlur(2)), np.float32)[..., None] / 255
        lvl = num / np.maximum(den, 1e-3)
        if fill is None: fill = lvl
        else:
            up = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize(sm, Image.BILINEAR), np.float32)
            w = np.clip(den / 0.6, 0, 1); fill = lvl * w + up * (1 - w)
    full = np.asarray(Image.fromarray(np.clip(fill, 0, 255).astype(np.uint8)).resize((qw, qh), Image.BILINEAR), np.float32)
    return a * k[..., None] + full * m[..., None]


def head_stats(mdir, n, CW, CH):
    """median top of the head (card row), share of samples where the hair touches the card top, head centre x"""
    tops, cxs = [], []
    c0, c1 = int(CW * 0.2), int(CW * 0.8)
    for f in range(0, n, 15):
        im = Image.open(os.path.join(mdir, f"{f:05d}.png")).convert("L")
        if im.size != (CW, CH): im = im.resize((CW, CH), Image.BILINEAR)
        m = np.asarray(im, np.float32) / 255
        rows = np.flatnonzero(m[EDGE - 1:, c0:c1].max(1) > 0.5)
        top = int(rows[0]) + EDGE - 1 if len(rows) else 20
        tops.append(top)
        band = m[top:top + 120]
        if band.sum() > 0: cxs.append(float((band.sum(0) * np.arange(CW)).sum() / band.sum()))
    return float(np.median(tops)), float(np.mean([t <= EDGE for t in tops])), (float(np.median(cxs)) if cxs else CW / 2)


class Take:
    """what both looks share: card frames and masks, joins, zoom per frame"""
    def __init__(self, card, r, fdir, mdir, n, joins, o):
        self.fdir, self.mdir, self.n, self.card, self.r = fdir, mdir, n, card, r
        self.CW, self.CH = Image.open(os.path.join(fdir, "00000.png")).size
        self.beta = o["deshine"] if mdir else 0.0
        self.joins = joins
        self.cta_from = joins[-1] if joins else n                    # the last piece is the CTA: no zoom
        self.toggles = []
        for j in joins[:-1]:
            if not self.toggles or j - self.toggles[-1] >= o["zoom_gap"] * FPS: self.toggles.append(j)
        self.zooms = o["zoom"]

    def zoom(self, f):
        if f >= self.cta_from: return 1.0
        return self.zooms[sum(1 for j in self.toggles if f >= j) % 2]

    def card_at(self, f):
        """card RGB (OBS rim rows replaced) and the person mask 0..1 (None without masks)"""
        card = Image.open(os.path.join(self.fdir, f"{f:05d}.png")).convert("RGB")
        ca = np.asarray(card).copy(); ca[:EDGE] = ca[EDGE]; card = Image.fromarray(ca)
        if not self.mdir: return card, None
        cmi = Image.open(os.path.join(self.mdir, f"{f:05d}.png")).convert("L")
        if cmi.size != (self.CW, self.CH): cmi = cmi.resize((self.CW, self.CH), Image.BILINEAR)
        cm = np.asarray(cmi, np.float32) / 255
        cm[:EDGE] = cm[EDGE]
        return card, cm


class Card(Take):
    """the card stays where OBS put it, on the brand canvas; zoom inside the card on the joins"""
    look = "card"

    def __init__(self, card, r, fdir, mdir, n, joins, o):
        super().__init__(card, r, fdir, mdir, n, joins, o)
        x0, y0, x1, y1 = card
        self.win = Image.fromarray((rounded_mask(self.CW, y1 - y0, r)[:self.CH] * 255).astype(np.uint8))
        self.canvas = Image.new("RGB", (W, H), hexc(BRAND_CANVAS))
        if mdir:                                                     # zoom point: above the face, so the top of
            top, self.cap_share, hx = head_stats(mdir, n, self.CW, self.CH)   # the head stays inside the card
            self.anchor = (hx, top + 0.15 * self.CH)
        else:
            self.anchor, self.cap_share = (self.CW / 2, 0.173 * self.CH), None

    def frame(self, f, room=True):
        cam, cm = self.card_at(f)
        if room and self.beta > 0: cam = deshine(cam, cm, self.beta)
        s = self.zoom(f); ax, ay = self.anchor
        M = (1 / s, 0, ax - ax / s, 0, 1 / s, ay - ay / s)            # p_out = A + s·(p_in − A)
        mm = None
        if cm is not None:
            cmi = Image.fromarray((cm * 255).astype(np.uint8))
            if s != 1.0: cmi = cmi.transform(cmi.size, Image.AFFINE, M, resample=Image.BILINEAR)
            full = Image.new("L", (W, H), 0); full.paste(cmi, tuple(self.card[:2]), self.win)
            mm = np.asarray(full, np.float32) / 255
        if not room: return None, mm
        if s != 1.0: cam = cam.transform(cam.size, Image.AFFINE, M, resample=Image.BICUBIC)
        im = self.canvas.copy(); im.paste(cam, tuple(self.card[:2]), self.win)
        return im, mm


class Relocate(Take):
    look = "relocate"

    def __init__(self, card, r, fdir, mdir, n, joins, o):
        super().__init__(card, r, fdir, mdir, n, joins, o)
        x0, y0, x1, y1 = card
        self.S = max(o["scale"], (W + 6) / self.CW)                 # the card always covers the width
        self.known = np.zeros((self.CH + PAD, self.CW), np.float32)  # card pixels; corners and the pad are not room
        self.known[PAD:] = rounded_mask(self.CW, y1 - y0, r)[:self.CH]
        # median top of the head and its centre → one vertical shift for the whole reel
        self.med_top, self.cap_share, hx = head_stats(mdir, n, self.CW, self.CH)
        head_top = o["head_top"] * H
        self.ybot = head_top - (PAD + self.med_top - (self.CH + PAD)) * self.S   # card bottom (with pad) in the frame
        if self.ybot < H + 2:                                        # never show the card's bottom edge
            head_top += H + 2 - self.ybot; self.ybot = H + 2
            print(f"head_top lowered to {head_top / H:.3f}: the card would end above the frame bottom")
        self.head_top = head_top
        self.face = (W / 2 + (hx - self.CW / 2) * self.S, head_top + 0.107 * H)   # zoom anchor: the face
        yq = (np.arange(Q[1], dtype=np.float32) * 4)[:, None, None]
        self.liftq = 0.45 + 0.42 * np.clip((head_top + 125 - yq) / 600, 0, 1) ** 1.5   # lighter at the top (windows)

    def affine_for(self, z):
        # card (with the pad on top) → frame: q = (W/2 + (x − CW/2)·S, ybot + (y − CH − PAD)·S), then zoom z about the face
        S, (fx, fy) = self.S, self.face
        a = S * z; ox = fx + z * (W / 2 - self.CW / 2 * S - fx); oy = fy + z * (self.ybot - (self.CH + PAD) * S - fy)
        return (1 / a, 0, -ox / a, 0, 1 / a, -oy / a)                  # PIL: input = M · output

    def cap(self, img, m):
        """rebuild the top of the head where the hair touches the top edge of the card (img, m with the pad)"""
        CW, row = self.CW, PAD + EDGE - 1
        xs = np.flatnonzero(m[row, :] > 0.5)
        if len(xs) < 6: return img, m
        xl, xr = xs[0], xs[-1]; w = xr - xl
        widths = [np.flatnonzero(m[r, :] > 0.5) for r in range(row, row + 160, 8)]
        R = max([(x[-1] - x[0]) / 2 for x in widths if len(x)] + [w / 2 + 1])
        h = R - np.sqrt(max(R * R - (w / 2) ** 2, 0))
        h = float(min(h + 6, PAD - 4))
        xc = (xl + xr) / 2
        yy, xx = np.mgrid[0:PAD + 4, 0:CW]
        u = (xx - xc) / (w / 2 + 1e-3)
        ytop = row - h * np.sqrt(np.clip(1 - u * u, 0, 1))
        inside = np.clip((yy - ytop) / 5.0, 0, 1) * np.clip((1 - np.abs(u)) * w / 3, 0, 1) * (yy <= row)
        a = np.asarray(img, np.float32)
        src_rows = a[row:row + 10].mean(0)                             # hair: mean colour of the top rows
        jitter = a[row:row + 1].repeat(PAD + 4, 0)                     # texture per column
        fillc = src_rows[None] * 0.6 + jitter * 0.4
        a[:PAD + 4] = a[:PAD + 4] * (1 - inside[..., None]) + fillc * inside[..., None]
        m2 = m.copy(); m2[:PAD + 4] = np.maximum(m2[:PAD + 4], inside)
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)), m2

    def frame(self, f, room=True):
        """(RGB frame | None, person mask 0..1 in frame coordinates)"""
        CW, CH = self.CW, self.CH
        card, cm = self.card_at(f)
        if room and self.beta > 0: card = deshine(card, cm, self.beta)
        img = Image.new("RGB", (CW, CH + PAD), (0, 0, 0)); img.paste(card, (0, PAD))
        m = np.zeros((CH + PAD, CW), np.float32); m[PAD:] = cm
        img, m = self.cap(img, m)
        M = self.affine_for(self.zoom(f))
        mimg = Image.fromarray((m * 255).astype(np.uint8))
        mm = np.asarray(mimg.transform((W, H), Image.AFFINE, M, resample=Image.BILINEAR), np.float32) / 255
        if not room: return None, mm
        A = img.transform((W, H), Image.AFFINE, M, resample=Image.BICUBIC)
        # the room at ¼ size: without him and without empty areas → fill from the surroundings, blur,
        # desaturate, lift; a soft shadow behind the shoulders
        Mq = (M[0] * 4, M[1] * 4, M[2], M[3] * 4, M[4] * 4, M[5])
        Aq = np.asarray(img.transform(Q, Image.AFFINE, Mq, resample=Image.BILINEAR), np.float32)
        mq = mimg.transform(Q, Image.AFFINE, Mq, resample=Image.BILINEAR)
        knq = np.asarray(Image.fromarray((self.known * 255).astype(np.uint8)).transform(Q, Image.AFFINE, Mq, resample=Image.BILINEAR), np.float32) / 255
        wide = np.asarray(mq.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1)), np.float32) / 255
        plate = fill_q(Aq, np.maximum(wide, 1 - knq))
        a = np.asarray(Image.fromarray(np.clip(plate, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), np.float32)
        lum = a.mean(2, keepdims=True)
        a = lum + (a - lum) * 0.55
        a = a + (LIFT_TO - a) * self.liftq
        sh = np.asarray(mq.filter(ImageFilter.GaussianBlur(10)), np.float32) / 255
        a = a * (1 - sh * 0.16)[..., None]
        bg = np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32)
        o = bg * (1 - mm[..., None]) + np.asarray(A, np.float32) * mm[..., None]
        return Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)), mm


def mask_targets(P, rl):
    """frame → masks dirs: relocate's last piece → fx/masks/cta; fx.json titles with "masks" → their windows"""
    want = {}
    for f in range(max(0, rl.cta_from - 2), rl.n if rl.look == "relocate" and rl.cta_from < rl.n else 0):
        want.setdefault(f, set()).add(os.path.join(P, "fx", "masks", "cta"))
    for T in fx_config(P).get("titles", []):
        if not T.get("masks"): continue
        for f in range(max(0, int(round(T["t0"] * FPS)) - 2), min(rl.n, int(round(T["reveal"][1] * FPS)) + 3)):
            want.setdefault(f, set()).add(os.path.join(P, T["masks"]))
    return want


def fx_config(P):
    p = os.path.join(P, "fx", "fx.json")
    return json.load(open(p)) if os.path.exists(p) else {}


_RL = None


def _job(args):
    f, room, keep_mask = args
    im, mm = _RL.frame(f, room)
    return f, (np.asarray(im, np.uint8).tobytes() if im is not None else None), ((mm * 255).astype(np.uint8) if keep_mask else None)


def main():
    global _RL
    a = sys.argv[1:]
    if not a:
        print("usage: obs_relocate.py --detect <video> | <project> [--look card|relocate] [--stills t,…] [--masks] [--zoom 1.0,1.07] [--zoom-gap 0] [--head-top 0.586] [--scale 1.10] [--card x0,y0,x1,y1,r] [--jobs N]")
        sys.exit(1)
    arg = lambda k, d: a[a.index(k) + 1] if k in a else d
    if a[0] == "--detect":
        print(json.dumps(detect(a[1]), ensure_ascii=False)); return
    P = os.path.abspath(a[0])
    look = arg("--look", "card")
    if look not in ("card", "relocate"): sys.exit("--look card | relocate")
    src, out, stamp = prepare_source(P)
    if "--card" in a:
        v = [int(x) for x in arg("--card", "").split(",")]
        card, r = v[:4], v[4] if len(v) > 4 else 70
    else:
        d = detect(src)
        if not d.get("obs"): sys.exit(f"no OBS layout found in {os.path.relpath(src, P)}: {json.dumps(d)} (pass --card x0,y0,x1,y1,r)")
        card, r = d["card"], d["r"]
    print("card:", card, "r", r, "· look", look, flush=True)
    fx = fx_config(P)
    o = {"scale": float(arg("--scale", 1.10)), "head_top": float(arg("--head-top", 0.586)),
         "zoom": [float(x) for x in arg("--zoom", "1.0,1.07" if look == "card" else "1.0,1.05").split(",")],
         "zoom_gap": float(arg("--zoom-gap", 0)), "deshine": float((fx.get("skin") or {}).get("deshine", 0))}
    need_masks = look == "relocate" or o["deshine"] > 0 or any(T.get("masks") for T in fx.get("titles", []))
    fdir, mdir, n = card_frames(P, src, card, masks=need_masks)
    joins = snap_joins(fdir, edl_join_frames(P), n)
    _RL = rl = (Relocate if look == "relocate" else Card)(card, r, fdir, mdir, n, joins, o)
    geo = (f"scale {rl.S:.3f} · head top {rl.head_top:.0f} px (card row {rl.med_top:.0f})" if look == "relocate"
           else f"zoom point ({rl.anchor[0]:.0f}, {rl.anchor[1]:.0f}) in the card")
    cap = f" · hair at the card top in {rl.cap_share:.0%} of samples" if rl.cap_share is not None else ""
    print(f"{geo}{cap} · joins {joins} · zoom {o['zoom']} changes {len(rl.toggles)} · last piece from frame {rl.cta_from}"
          f" · deshine {rl.beta}", flush=True)
    if "--stills" in a:
        os.makedirs(os.path.join(P, "review"), exist_ok=True)
        for s in (float(x) for x in arg("--stills", "").split(",")):
            im, _ = rl.frame(min(n - 1, int(round(s * FPS))))
            p = os.path.join(P, "review", f"obs-{look}-{s:05.2f}.png"); im.save(p); print("→", os.path.relpath(p, P))
        return
    want = mask_targets(P, rl)
    for ds in (set().union(*want.values()) if want else ()): os.makedirs(ds, exist_ok=True)
    def save_mask(f, mm):
        for ds in want.get(f, ()): Image.fromarray(mm).save(os.path.join(ds, f"{f:05d}.png"))
    import multiprocessing as mp
    jobs = int(arg("--jobs", max(1, min(8, (os.cpu_count() or 2) - 1))))
    pool = mp.get_context("fork").Pool(jobs) if jobs > 1 else None
    imap = (lambda fn, it: pool.imap(fn, it, chunksize=4)) if pool else map
    if "--masks" in a:
        for f, _, mm in imap(_job, [(f, False, True) for f in sorted(want)]): save_mask(f, mm)
        print("masks:", ", ".join(f"{os.path.relpath(d, P)}" for d in sorted(set().union(*want.values()))) if want else "no mask windows")
        return
    tmp = out + ".part.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-i", src, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", tmp], stdin=subprocess.PIPE)
    t0 = time.time()
    for f, b, mm in imap(_job, [(f, True, f in want) for f in range(n)]):
        enc.stdin.write(b)
        save_mask(f, mm)
        if f % 150 == 0: print("frame", f, "/", n, f"({time.time() - t0:.0f} s)", flush=True)
    enc.stdin.close(); enc.wait()
    if pool: pool.close()
    if enc.returncode != 0: sys.exit("ffmpeg failed")
    os.replace(tmp, out)
    geo = ({"scale": round(rl.S, 4), "head_top": round(rl.head_top / H, 4), "card_head_row": rl.med_top} if look == "relocate"
           else {"zoom_point": [round(v, 1) for v in rl.anchor]})
    json.dump({"by": "scripts/ru/fx/obs_relocate.py", "look": look, "source": "renders/clean.source.mp4", "card": card, "r": r, **geo,
               "zoom": o["zoom"], "zoom_gap": o["zoom_gap"], "joins": joins, "zoom_changes": rl.toggles, "cta_from": rl.cta_from,
               "deshine": rl.beta, "out_size": os.path.getsize(out)}, open(stamp, "w"), indent=1)
    print("→", os.path.relpath(out, P), f"| {look} | last piece from frame {rl.cta_from} | {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
