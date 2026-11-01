#!/usr/bin/env python3
"""W5 база картинки OBS-записи (широкой или вертикального дубля): левые 1080×1920 из renders/clean.mp4 → фирменный
canvas. Заглушки шаблона уходят под canvas.

Без --mask — карточка камеры как в OBS (заказчик: маска лагает, кресло мигает). На склейках внутри карточки
чередуется наезд 1,00 ↔ 1,07 вокруг лица, не чаще раза в секунду; после последней склейки (финал со сменой фона) —
без наезда.

--mask — дубль у ровной стены без мебели у плеча (claude-sfx, 2026-10-25): спикер вырезан из стены и стоит на canvas
без рамки. Маски Apple Vision по кадрам карточки (fx/masks/<кадр>.png; нет — скрипт извлечёт кадры и позовёт
scripts/ru/fx/person-mask.swift), среднее по 3 кадрам, мягкий край, нижние уголки карточки залиты соседним столбцом.
Человек ×1,1 от низа кадра (плечи уходят за края), лёгкая тень на светлом фоне. Смены фона из fx/swaps.json: тёмный
фон со свечением, крупный текст ЗА головой, человек поверх. Наезд 1,00 ↔ 1,05; склейки внутри смены фона (±0,3 с)
наезд не меняют. Смены фона в broll/clips.json при --mask не нужны: их окно под карточку закроет человека.

  python3 scripts/ru/wide/obs_base.py <project>              → renders/picture.base.mp4 (звук clean.mp4)
  python3 scripts/ru/wide/obs_base.py <project> --mix        → + renders/picture.mp4 со звуком fx/mix.wav
  --mask              спикер по маске + смены фона из fx/swaps.json
  --stills 0.5,6.2    только кадры review/base-<t>.png, без видео
  --anchor 540,1300   точка наезда (над лицом, чтобы макушка не уходила за край карточки; с --mask 540,1330)

fx/swaps.json (только с --mask; схема — .claude/skills/reel-wide/references/config.md):
  {"swaps": [{"name": "S1-не-слышит", "in": 5.52, "out": 8.97, "note": "«не слышит звук»",
              "items": [{"text": "не слышит", "font": "display", "size": 150, "y": 1000, "t": 5.8, "kind": "pop"},
                        {"text": "звук", "font": "italic", "size": 112, "y": 830, "t": 6.4, "color": "#B79CFF"}]}]}
  in, out — секунды clean: тёмный фон входит за 0,25 с от in, уходит за последние 0,3 с (fade_out: false — до out);
  font: display (Spectral ExtraBold) · italic (Spectral SemiBold Italic) · mono (Plex Mono) · golos (Golos 700);
  size — px; y — центр строки (x — по центру кадра); t — начало слова; kind: pop — пружина, иначе line — снизу вверх;
  color — #RRGGBB, по умолчанию #F5F3FA."""
import json, math, shutil, subprocess, sys, tempfile, pathlib
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, fps, joins, CARD

ROOT = pathlib.Path(__file__).resolve().parents[3]
args = sys.argv[1:]
P = project(args[0])
W, H, FPS = 1080, 1920, fps(P)
MASK = "--mask" in args
ANCHOR = tuple(map(int, args[args.index("--anchor") + 1].split(","))) if "--anchor" in args else (540, 1330) if MASK else (540, 1300)
INSET, R, SCALES = 2, 68, (1.0, 1.05) if MASK else (1.0, 1.07)
CANVAS = (0xEF, 0xED, 0xF4)                     # brand.md canvas
src, base = P / "renders/clean.mp4", P / "renders/picture.base.mp4"
swaps = json.loads((P / "fx/swaps.json").read_text())["swaps"] if MASK and (P / "fx/swaps.json").exists() else []


def reader(size=(W, H)):
    cmd = ["ffmpeg", "-v", "error", "-i", str(src), "-vf", f"crop=1080:1920:0:0,fps={FPS:g},scale={size[0]}:{size[1]}",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE); n = size[0] * size[1] * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n: break
        yield np.frombuffer(b, np.uint8).reshape(size[1], size[0], 3)


# склейки → кадры, где картинка в карточке действительно меняется (±2 кадра)
small = [f[1098 // 8: 1920 // 8: 2, ::2].astype(np.float32) for f in reader((135, 240))]
real = []
for j in joins(P):
    fj = int(round(j * FPS)); best, arg = -1, fj
    for f in range(max(1, fj - 2), min(len(small), fj + 3)):
        d = float(np.abs(small[f] - small[f - 1]).mean())
        if d > best: best, arg = d, f
    real.append(arg)
toggles = []
for j, r in zip(joins(P), real):
    if any(s["in"] - 0.3 <= j <= s["out"] + 0.3 for s in swaps): continue   # в смене фона наезд не меняется
    if not toggles or r - toggles[-1] >= FPS: toggles.append(r)
print("склейки (кадры):", real, "\nсмена масштаба:", toggles)


def scale_at(f):
    seg = sum(1 for r in toggles if f >= r)
    return 1.0 if (toggles and f >= toggles[-1]) else SCALES[seg % 2]


x0, y0, x1, y1 = CARD
mask = Image.new("L", (x1 - x0, y1 - y0), 0)
ImageDraw.Draw(mask).rounded_rectangle((INSET, INSET, x1 - x0 - 1 - INSET, y1 - y0 - 1 - INSET), radius=R, fill=255)
mask_c = mask.crop((0, 0, x1 - x0, min(y1, H) - y0))
ax, ay = ANCHOR[0] - x0, ANCHOR[1] - y0
canvas = Image.new("RGB", (W, H), CANVAS)


def card(fr, f):
    s = scale_at(f)
    cam = Image.fromarray(fr).crop((x0, y0, x1, min(y1, H)))
    if s != 1.0:   # p_out = A + s·(p_in − A)
        cam = cam.transform(cam.size, Image.AFFINE, (1 / s, 0, ax - ax / s, 0, 1 / s, ay - ay / s), resample=Image.BICUBIC)
    im = canvas.copy(); im.paste(cam, (x0, y0), mask_c)
    return im


# --mask: спикер по маске, ×1,1 от точки (540, 1920); уголки карточки снизу (ниже CORNER) залиты соседним столбцом
CW, CH, CORNER = x1 - x0, min(y1, H) - y0, 742
S = 1.10
PW, PH = round(CW * S), round(CH * S)
PX, PY = round(540 + S * (x0 - 540)), round(H + S * (y0 - H))
DARK, ACCENT, ACCENT_L = (0x0E, 0x0B, 0x14), (0x7C, 0x3A, 0xED), (0xB7, 0x9C, 0xFF)
F = ROOT / "brand/fonts"
FONTS = {"display": F / "Spectral-ExtraBold.ttf", "italic": F / "Spectral-SemiBoldItalic.ttf",
         "mono": F / "IBMPlexMono-Medium.ttf", "golos": F / "GolosText-Variable.ttf"}


def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def eo(x): x = clamp(x); return 1 - (1 - x) ** 3
def spring(x): x = clamp(x); return 1 - math.exp(-6 * x) * math.cos(9 * x)


def load_masks(n):
    """fx/masks/<кадр>.png по кадрам карточки; нет — кадры во временную папку work/ → person-mask.swift"""
    md, part = P / "fx/masks", P / "fx/masks.part"
    if not any(md.glob("*.png")):
        shutil.rmtree(part, ignore_errors=True); (P / "work").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=P / "work", prefix="card-frames-") as fd:
            subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-vf",
                            f"crop=1080:1920:0:0,fps={FPS:g},format=rgb24,crop={CW}:{CH}:{x0}:{y0}",
                            "-start_number", "0", f"{fd}/%05d.png"], check=True)
            print(f"маски: {n} кадров карточки {CW}×{CH} → Apple Vision", flush=True)
            subprocess.run(["swift", str(ROOT / "scripts/ru/fx/person-mask.swift"), fd, str(part)], check=True)
        md.mkdir(parents=True, exist_ok=True)
        for m in part.glob("*.png"): m.rename(md / m.name)
        part.rmdir()
    ms = sorted(md.glob("*.png"))
    if len(ms) != n:
        raise SystemExit(f"fx/masks: {len(ms)} масок на {n} кадров clean.mp4. После перерезки удали fx/masks — маски посчитаются "
                         "заново; если снова не сходится, Apple Vision не нашёл человека в части кадров")
    if src.stat().st_mtime > ms[-1].stat().st_mtime:
        print("WARN: clean.mp4 новее fx/masks — если резы менялись, удали fx/masks")
    return ms


@lru_cache(maxsize=4)
def mask_png(k):
    return np.asarray(Image.open(masks[min(max(k, 0), len(masks) - 1)]), np.float32) / 255


def person_mask(f):
    """среднее по f-1, f, f+1 (0,25/0,5/0,25), мягкий край, уголки карточки снизу заполнены свитером"""
    acc = mask_png(f - 1) * .25 + mask_png(f) * .5 + mask_png(f + 1) * .25
    acc = np.clip((acc - 0.3) / 0.4, 0, 1); w = acc.shape[1]
    acc[CORNER:, :75] = acc[CORNER:, 75:76]; acc[CORNER:, w - 75:] = acc[CORNER:, w - 76:w - 75]
    return Image.fromarray((acc * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))


def person_rgb(fr):
    a = fr[y0:y0 + CH, x0:x0 + CW].copy()
    a[CORNER:, :75] = a[CORNER:, 75:76]; a[CORNER:, CW - 75:] = a[CORNER:, CW - 76:CW - 75]
    return Image.fromarray(a)


def glow_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    g1 = np.exp(-(((xx - 540) / 620) ** 2 + ((yy - 1900) / 700) ** 2))      # снизу, за плечами
    g2 = np.exp(-(((xx - 540) / 700) ** 2 + ((yy + 120) / 520) ** 2)) * .35  # сверху
    bg = np.array(DARK, np.float32)[None, None]
    out = bg + g1[..., None] * (np.array(ACCENT, np.float32) - bg) * .55 + g2[..., None] * (np.array(ACCENT_L, np.float32) - bg) * .16
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


@lru_cache(maxsize=None)
def font(kind, size):
    f = ImageFont.truetype(str(FONTS[kind]), size)
    if kind == "golos":
        try: f.set_variation_by_axes([700])
        except Exception: pass
    return f


_txt = {}
def text_img(it):
    """один элемент смены фона → RGBA с полями 40 px (кэш)"""
    key = json.dumps(it, sort_keys=True)
    if key not in _txt:
        f = font(it.get("font", "display"), it["size"])
        l, t, r, b = f.getbbox(it["text"]); pad = 40
        im = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
        col = tuple(int(it.get("color", "#F5F3FA").lstrip("#")[i:i + 2], 16) for i in (0, 2, 4))
        ImageDraw.Draw(im).text((pad - l, pad - t), it["text"], font=f, fill=col + (255,))
        _txt[key] = im
    return _txt[key]


def swap_state(t):
    """(доля тёмного фона, смена фона) в момент t"""
    for s in swaps:
        a, b = s["in"], s["out"]
        if a <= t < b:
            return eo((t - a) / 0.25) * (1 if s.get("fade_out") is False else 1 - eo((t - (b - 0.3)) / 0.3)), s
    return 0.0, None


def compose(fr, f):
    t = f / FPS
    k, sw = swap_state(t)
    im = (BG_LIGHT if k <= 0 else BG_DARK if k >= 1 else Image.blend(BG_LIGHT, BG_DARK, k)).copy()
    if sw:   # текст смены фона — за головой
        out_k = 1 if sw.get("fade_out") is False else 1 - eo((t - (sw["out"] - 0.3)) / 0.3)
        for it in sw["items"]:
            u = (t - it["t"]) / 0.42
            if u <= 0: continue
            g = text_img(it)
            sc = 0.86 + 0.14 * spring(u) if it.get("kind") == "pop" else 1.0
            dy = 0 if it.get("kind") == "pop" else (1 - eo(u)) * 26
            al = eo(u * 1.6) * out_k
            if sc != 1: g = g.resize((max(1, round(g.width * sc)), max(1, round(g.height * sc))), Image.BICUBIC)
            bl = (1 - eo(u)) * 6
            if bl > 0.3: g = g.filter(ImageFilter.GaussianBlur(bl))
            if al < 1: g = g.copy(); g.putalpha(g.getchannel("A").point(lambda v: int(v * al)))
            im.paste(g, (round(540 - g.width / 2), round(it["y"] - g.height / 2 + dy)), g)
    sc = scale_at(f)
    pr, pm = person_rgb(fr).resize((PW, PH), Image.BICUBIC), person_mask(f).resize((PW, PH), Image.BICUBIC)
    lay, lm = Image.new("RGB", (W, H)), Image.new("L", (W, H), 0)
    lay.paste(pr, (PX, PY)); lm.paste(pm, (PX, PY))
    if sc != 1.0:   # p_out = A + s·(p_in − A)
        A = (1 / sc, 0, ANCHOR[0] - ANCHOR[0] / sc, 0, 1 / sc, ANCHOR[1] - ANCHOR[1] / sc)
        lay = lay.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC)
        lm = lm.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC)
    if k < 1:   # мягкая тень на светлом фоне
        sh = lm.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.16 * (1 - k)))
        sh = sh.transform((W, H), Image.AFFINE, (1, 0, 0, 0, 1, -8))
        im.paste(Image.new("RGB", (W, H), (0x2A, 0x1F, 0x3D)), (0, 0), sh)
    im.paste(lay, (0, 0), lm)
    return im


if MASK:
    masks = load_masks(len(small))
    BG_LIGHT, BG_DARK = Image.new("RGB", (W, H), CANVAS), glow_bg()
draw = compose if MASK else card

if "--stills" in args:
    out = P / "review"; out.mkdir(exist_ok=True)
    for t in map(float, args[args.index("--stills") + 1].split(",")):
        f = min(int(round(t * FPS)), len(small) - 1)
        fr = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{f / FPS:.3f}", "-i", str(src), "-vf", "crop=1080:1920:0:0",
                             "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
        draw(np.frombuffer(fr, np.uint8).reshape(H, W, 3), f).save(out / f"base-{t:05.2f}.png")
        print("→", f"review/base-{t:05.2f}.png")
    sys.exit()

enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{FPS:g}", "-i", "-",
                        "-i", str(src), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                        "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", str(base)], stdin=subprocess.PIPE)
for f, fr in enumerate(reader()):
    enc.stdin.write(np.asarray(draw(fr, f), np.uint8).tobytes())
    if MASK and f % 200 == 0: print(f"  {f}/{len(small)}", flush=True)
enc.stdin.close(); enc.wait()
print("→", base.relative_to(P.parents[1]))
if "--mix" in args:
    mix, pic = P / "fx/mix.wav", P / "renders/picture.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(base), "-i", str(mix), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "256k", "-shortest", str(pic)], check=True)
    print("→", pic.relative_to(P.parents[1]), "(звук fx/mix.wav)")
