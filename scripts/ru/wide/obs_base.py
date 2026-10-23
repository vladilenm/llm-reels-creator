#!/usr/bin/env python3
"""W5 база картинки широкой записи: левые 1080×1920 из renders/clean.mp4 → фирменный canvas + карточка камеры
(как в OBS, без маски — заказчик: маска лагает, кресло мигает). Заглушки шаблона уходят под canvas.
На склейках внутри карточки чередуется наезд 1,00 ↔ 1,07 вокруг лица, не чаще раза в секунду; после
последней склейки (финал со сменой фона) — без наезда.

  python3 scripts/ru/wide/obs_base.py <project>              → renders/picture.base.mp4 (звук clean.mp4)
  python3 scripts/ru/wide/obs_base.py <project> --mix        → + renders/picture.mp4 со звуком fx/mix.wav
  --anchor 540,1300   точка наезда (над лицом, чтобы макушка не уходила за край карточки)"""
import subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, fps, joins, CARD

args = sys.argv[1:]
P = project(args[0])
W, H, FPS = 1080, 1920, fps(P)
ANCHOR = tuple(map(int, args[args.index("--anchor") + 1].split(","))) if "--anchor" in args else (540, 1300)
INSET, R, SCALES = 2, 68, (1.0, 1.07)
CANVAS = (0xEF, 0xED, 0xF4)                     # brand.md canvas
src, base = P / "renders/clean.mp4", P / "renders/picture.base.mp4"


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
for r in real:
    if not toggles or r - toggles[-1] >= FPS: toggles.append(r)
print("склейки (кадры):", real, "\nсмена масштаба:", toggles)

x0, y0, x1, y1 = CARD
mask = Image.new("L", (x1 - x0, y1 - y0), 0)
ImageDraw.Draw(mask).rounded_rectangle((INSET, INSET, x1 - x0 - 1 - INSET, y1 - y0 - 1 - INSET), radius=R, fill=255)
mask_c = mask.crop((0, 0, x1 - x0, min(y1, H) - y0))
ax, ay = ANCHOR[0] - x0, ANCHOR[1] - y0
canvas = Image.new("RGB", (W, H), CANVAS)
enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{FPS:g}", "-i", "-",
                        "-i", str(src), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                        "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", str(base)], stdin=subprocess.PIPE)
for f, fr in enumerate(reader()):
    seg = sum(1 for r in toggles if f >= r)
    s = 1.0 if (toggles and f >= toggles[-1]) else SCALES[seg % 2]
    cam = Image.fromarray(fr).crop((x0, y0, x1, min(y1, H)))
    if s != 1.0:   # p_out = A + s·(p_in − A)
        cam = cam.transform(cam.size, Image.AFFINE, (1 / s, 0, ax - ax / s, 0, 1 / s, ay - ay / s), resample=Image.BICUBIC)
    im = canvas.copy(); im.paste(cam, (x0, y0), mask_c)
    enc.stdin.write(np.asarray(im, np.uint8).tobytes())
enc.stdin.close(); enc.wait()
print("→", base.relative_to(P.parents[1]))
if "--mix" in args:
    mix, pic = P / "fx/mix.wav", P / "renders/picture.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(base), "-i", str(mix), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "256k", "-shortest", str(pic)], check=True)
    print("→", pic.relative_to(P.parents[1]), "(звук fx/mix.wav)")
