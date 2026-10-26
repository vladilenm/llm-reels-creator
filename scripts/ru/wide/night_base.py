#!/usr/bin/env python3
"""Ночная база картинки OBS-дубля (дизайн 2026-10-26, docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md):
тёмный фон с сеткой, свечением, дрейфом и зерном; спикер вырезан маской Apple Vision из карточки камеры и стоит внизу
(×1,1 от низа кадра, как в claude-sfx) с фиолетовым контровым светом; в окнах акцентов (work/accents.json) фон заменяет
полный слой акцента — слово всегда за головой. Наезд 1,00 ↔ 1,05 на склейках не чаще раза в секунду, не рядом
с акцентами и не после последней склейки.

  python3 scripts/ru/wide/night_base.py <project> --prep            кадры карточки → fx/masks (Vision)
  python3 scripts/ru/wide/night_base.py <project> --stills 0.5,6.2  → review/night-<t>.png
  python3 scripts/ru/wide/night_base.py <project> [--card] [--mix]  → renders/picture.base.mp4 [+ renders/picture.mp4 со звуком fx/mix.wav]
  --card: без маски — карточка камеры на ночном фоне с тонкой светлой рамкой (кресло или мебель у плеча)

work/accents.json: {"accents": [{"id", "in", "out", "kind": "night" | "light", "file"}]} — время чистого таймлайна,
file — полный слой .mp4 (OK.run mode 'full') от корня проекта; в broll/plan.json эти клипы не попадают."""
import json, subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, fps, joins, CARD

ROOT = pathlib.Path(__file__).resolve().parents[3]
W, H = 1080, 1920
CX0, CY0 = CARD[0], CARD[1]
CW, CH = CARD[2] - CARD[0], H - CARD[1]          # 989 × 822: карточка до низа кадра
S = 1.10                                         # масштаб человека от точки (540, 1920)
PUNCH, ANCHOR = 1.05, (540, 1330)
DARK = np.array((0x0E, 0x0B, 0x14), np.float32)
ACCENT = np.array((0x7C, 0x3A, 0xED), np.float32)
ACCENT_L = np.array((0xB7, 0x9C, 0xFF), np.float32)
FRAME_LINE = (90, 76, 126)                       # accent_light на 45 % поверх фона: рамка карточки в --card
GRID_STEP, GRID_A, DRIFT = 84, 0.10, 6.0         # шаг сетки, её непрозрачность, дрейф вверх px/с
GRAIN, HALO = 2.5, 0.55                          # зерно (σ, уровни), сила контрового света
PW, PH = round(CW * S), round(CH * S)
PX, PY = round(540 + S * (CX0 - 540)), round(1920 + S * (CY0 - 1920))


def glow():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g1 = np.exp(-(((xx - 540) / 620) ** 2 + ((yy - 1900) / 700) ** 2))       # за плечами
    g2 = np.exp(-(((xx - 540) / 700) ** 2 + ((yy + 120) / 520) ** 2)) * .35   # сверху
    return DARK[None, None] + g1[..., None] * (ACCENT - DARK) * .55 + g2[..., None] * (ACCENT_L - DARK) * .16


def grid_alpha():
    a = np.zeros((H + GRID_STEP, W), np.float32)
    a[np.arange(H + GRID_STEP) % GRID_STEP < 2, :] = GRID_A
    a[:, np.arange(W) % GRID_STEP < 2] = GRID_A
    return a


GLOW, GRID = glow(), grid_alpha()


def night_bg(f, fps_):
    """ночной фон кадра f: свечение, сетка с дрейфом вверх, детерминированное зерно"""
    off = int(f / fps_ * DRIFT) % GRID_STEP
    a = GRID[off:off + H][..., None]
    bg = GLOW * (1 - a) + ACCENT_L[None, None] * a
    return bg + np.random.default_rng(f).normal(0, GRAIN, (H, W, 1)).astype(np.float32)


def halo(m):
    """контровой свет: мягкий ореол сразу за силуэтом; m — маска 0..1 (H×W)"""
    blur = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), np.float32) / 255
    return np.clip(blur - m, 0, 1) * HALO


def mask_at(masks, f, cuts):
    """маска кадра f: среднее по f-1, f, f+1 (0.25/0.5/0.25), но не через склейку; мягкий край; уголки карточки снизу
    заполнены соседним столбцом (свитер)"""
    acc, ws = None, 0.0
    for k, w in ((f - 1, .25), (f, .5), (f + 1, .25)):
        if (k == f - 1 and f in cuts) or (k == f + 1 and f + 1 in cuts): continue
        m = Image.open(masks[min(max(k, 0), len(masks) - 1)]).convert("L")
        if m.size != (CW, CH): m = m.resize((CW, CH), Image.BILINEAR)
        m = np.asarray(m, np.float32) / 255
        acc = m * w if acc is None else acc + m * w; ws += w
    acc = np.clip((acc / ws - 0.3) / 0.4, 0, 1)
    acc[742:, :75] = acc[742:, 75:76]; acc[742:, CW - 75:] = acc[742:, CW - 76:CW - 75]
    return Image.fromarray((acc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))


def person_rgb(fr):
    a = fr[CY0:CY0 + CH, CX0:CX0 + CW].copy()
    a[742:, :75] = a[742:, 75:76]; a[742:, CW - 75:] = a[742:, CW - 76:CW - 75]
    return Image.fromarray(a)


_RM = []
def card_over(bg, fr):
    if not _RM:
        m = Image.new("L", (CW, CH), 0); ImageDraw.Draw(m).rounded_rectangle((2, 2, CW - 3, CH + 60), radius=68, fill=255)
        _RM.append(np.asarray(m, np.float32)[..., None] / 255)
    out = bg.copy()
    out[CY0:CY0 + CH, CX0:CX0 + CW] = out[CY0:CY0 + CH, CX0:CX0 + CW] * (1 - _RM[0]) + fr[CY0:CY0 + CH, CX0:CX0 + CW].astype(np.float32) * _RM[0]
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    ImageDraw.Draw(im).rounded_rectangle((CX0, CY0, CX0 + CW - 1, H + 70), radius=68, outline=FRAME_LINE, width=3)
    return np.asarray(im)


def compose(fr, f, ctx):
    acc = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, ctx["fps"])
    if ctx["card"]: return card_over(bg, fr)
    seg = sum(1 for r in ctx["toggles"] if f >= r)
    sc = 1.0 if (ctx["toggles"] and f >= ctx["toggles"][-1]) else (1.0, PUNCH)[seg % 2]
    pr = person_rgb(fr).resize((PW, PH), Image.BICUBIC)
    pm = mask_at(ctx["masks"], f, ctx["cuts"]).resize((PW, PH), Image.BICUBIC)
    lay, lm = Image.new("RGB", (W, H)), Image.new("L", (W, H), 0)
    lay.paste(pr, (PX, PY)); lm.paste(pm, (PX, PY))
    if sc != 1.0:
        ax, ay = ANCHOR; A = (1 / sc, 0, ax - ax / sc, 0, 1 / sc, ay - ay / sc)
        lay = lay.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC)
        lm = lm.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC)
    m = np.asarray(lm, np.float32) / 255
    h = halo(m)[..., None]
    bg = bg * (1 - h) + ACCENT_L[None, None] * h
    out = bg * (1 - m[..., None]) + np.asarray(lay, np.float32) * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def frames(path, fps_):
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={fps_:g},scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)


def grab(path, t):
    b = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0.0, t):.4f}", "-i", str(path), "-frames:v", "1", "-vf", f"scale={W}:{H}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(b, np.uint8).reshape(H, W, 3)


def accents(P, fps_):
    """(функция f → кадр слоя акцента или None для покадрового прохода, окна [(f0, f1, path)])"""
    p = P / "work" / "accents.json"
    win = [(round(a["in"] * fps_), round(a["out"] * fps_), P / a["file"]) for a in (json.loads(p.read_text())["accents"] if p.exists() else [])]
    its = {}
    def at(f):
        for f0, f1, path in win:
            if f0 <= f < f1:
                if path not in its: its[path] = frames(path, fps_)
                return next(its[path], None)
        return None
    return at, win


def prep(P, F):
    fr, out = P / "work" / "card-frames", P / "fx" / "masks"
    fr.mkdir(parents=True, exist_ok=True); out.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(P / "renders" / "clean.mp4"), "-vf", f"fps={F:g},crop={CW}:{CH}:{CX0}:{CY0}",
                    "-start_number", "0", str(fr / "%05d.png")], check=True)
    subprocess.run(["swift", str(ROOT / "scripts/ru/fx/person-mask.swift"), str(fr), str(out)], check=True)
    print(f"→ {out.relative_to(P.parents[1])}: {len(list(out.glob('*.png')))} масок")


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"): print(__doc__); sys.exit(1)
    P = project(a[0]); F = fps(P)
    if "--prep" in a: prep(P, F); return
    card = "--card" in a
    masks = [] if card else sorted((P / "fx" / "masks").glob("*.png"))
    if not card and not masks: raise SystemExit("нет fx/masks: запусти --prep или выбери --card")
    accent, win = accents(P, F)
    toggles = []
    for j in joins(P):
        fj = round(j * F)
        if any(f0 / F - 0.3 <= j <= f1 / F + 0.3 for f0, f1, _ in win): continue
        if not toggles or fj - toggles[-1] >= F: toggles.append(fj)
    ctx = {"fps": F, "card": card, "masks": masks, "cuts": {round(j * F) for j in joins(P)}, "toggles": toggles, "accent": accent}
    clean = P / "renders" / "clean.mp4"

    if "--stills" in a:
        out = P / "review"; out.mkdir(exist_ok=True)
        for t in (float(x) for x in a[a.index("--stills") + 1].split(",")):
            f = round(t * F)
            layer = next((grab(path, (f - f0) / F) for f0, f1, path in win if f0 <= f < f1), None)
            im = compose(grab(clean, f / F), f, dict(ctx, accent=lambda _f, layer=layer: layer))
            Image.fromarray(im).save(out / f"night-{t:05.2f}.png"); print("→", f"review/night-{t:05.2f}.png")
        return

    base = P / "renders" / "picture.base.mp4"
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{F:g}", "-i", "-",
                            "-i", str(clean), "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", str(base)], stdin=subprocess.PIPE)
    n = 0
    for f, fr in enumerate(frames(clean, F)):
        if masks and f >= len(masks): break
        enc.stdin.write(compose(fr, f, ctx).tobytes()); n += 1
        if f % 250 == 0: print(f"  {f}", flush=True)
    enc.stdin.close(); enc.wait()
    print(f"→ {base.relative_to(P.parents[1])} · кадров {n} · {'карточка' if card else 'маска'} · наезды {toggles} · акцентов {len(win)}")
    if "--mix" in a:
        pic = P / "renders" / "picture.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(base), "-i", str(P / "fx" / "mix.wav"), "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", str(pic)], check=True)
        print("→", pic.relative_to(P.parents[1]), "(звук fx/mix.wav)")


if __name__ == "__main__":
    main()
