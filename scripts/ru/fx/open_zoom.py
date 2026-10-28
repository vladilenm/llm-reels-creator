#!/usr/bin/env python3
"""Открывающий зум всего кадра (scripts/ru/fx/opening.py): готовый композит — спикер, графика, субтитры — первые dur секунд
растёт из from в полный кадр к точке anchor, с зум-смазом (8 подкадров затвора); поля вокруг — края того же кадра,
растянутые и размытые, с мягким переходом, чёрной рамки нет. Дальше кадры идут без изменений, звук копируется.

  python3 scripts/ru/fx/open_zoom.py <project> <video> [--out <file>]   без --out — на месте (assemble.mjs после композита)
  fx.json "open": false — ничего не делает"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opening as O

SUB = 8                                      # подкадры смаза


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
                        "-of", "json", path], capture_output=True, text=True, check=True)
    s = json.loads(r.stdout)["streams"][0]; n, d = s["r_frame_rate"].split("/")
    return s["width"], s["height"], float(n) / float(d)


def shrunk(arr, s, ax, ay):
    """кадр, уменьшенный в s к точке (ax, ay), без пустых полей (заказчик, 2026-10-28: «черные рамки… чтобы черный экран не
    видно было»): поля — крайние пиксели того же кадра, растянутые наружу и сильно размытые (зеркало повторяло логотип на
    худи и плечи); от резкого кадра к ним мягкий переход, который сходит на нет к концу зума"""
    h, w = arr.shape[:2]
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    x0, y0 = round(ax - ax * s), round(ay - ay * s)
    small = np.asarray(Image.fromarray(arr).resize((sw, sh), Image.BICUBIC), np.float32)
    big = np.pad(small, ((y0, max(0, h - y0 - sh)), (x0, max(0, w - x0 - sw)), (0, 0)), mode="edge")[:h, :w]
    soft = Image.fromarray(big.astype(np.uint8)).resize((max(1, w // 24), max(1, h // 16)), Image.BILINEAR)   # по горизонтали сильнее: растянутые края дают вертикальные полосы
    soft = np.asarray(soft.filter(ImageFilter.GaussianBlur(4)).resize((w, h), Image.BILINEAR), np.float32)
    feather = 1 + 0.06 * w * min(1.0, (1 - s) / 0.06)       # px; у полного кадра шва нет
    sx = np.minimum(np.arange(w) - x0, x0 + sw - 1 - np.arange(w)).astype(np.float32)
    sy = np.minimum(np.arange(h) - y0, y0 + sh - 1 - np.arange(h)).astype(np.float32)
    m = np.clip(np.minimum(sx[None, :], sy[:, None]) / feather, 0, 1)[..., None]   # за краем кадра только размытое: растянутые края резко не видны
    return big * m + soft * (1 - m)


def frame(im, t, fps, c):
    """кадр открытия в момент t: среднее SUB уменьшенных копий за интервал кадра (зум-смаз), поля заполнены самим кадром"""
    arr = np.asarray(im)
    h, w = arr.shape[:2]; ax, ay = c["anchor"][0] * w, c["anchor"][1] * h
    acc = np.zeros(arr.shape, np.float32)
    for k in range(SUB):
        s = O.scale(t - (1 - k / (SUB - 1)) / fps, c)          # затвор 360°: движение за прошедший кадр
        acc += arr.astype(np.float32) if s >= 0.9999 else shrunk(arr, s, ax, ay)
    return np.clip(acc / SUB, 0, 255).astype(np.uint8)


def main():
    a = sys.argv[1:]
    if len(a) < 2: print(__doc__); sys.exit(1)
    project, src = a[0], a[1]
    out = a[a.index("--out") + 1] if "--out" in a else None
    c = O.cfg(project)
    if c is None:
        print("open_zoom: fx.json \"open\": false — кадр без открывающего зума")
        if out: subprocess.run(["cp", src, out], check=True)
        return
    w, h, fps = probe(src)
    n_open = int(np.ceil(c["dur"] * fps)) + 1
    dst = out or tempfile.mktemp(suffix=os.path.splitext(src)[1], dir=os.path.dirname(os.path.abspath(src)))
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", f"{fps:g}", "-i", "-",
                            "-i", src, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "12", "-preset", "fast",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", dst], stdin=subprocess.PIPE)      # no -shortest: the audio may be a few ms shorter
    size, f = w * h * 3, 0
    try:
        while True:
            b = dec.stdout.read(size)
            if len(b) < size: break
            if f < n_open:
                im = Image.frombuffer("RGB", (w, h), b, "raw", "RGB", 0, 1)
                b = frame(im, f / fps, fps, c).tobytes()
            enc.stdin.write(b); f += 1
        enc.stdin.close()
    except BaseException:
        enc.kill(); dec.kill(); raise
    if enc.wait() != 0 or dec.wait() != 0: raise SystemExit("open_zoom: ffmpeg завершился с ошибкой")
    if not out: os.replace(dst, src)
    print(f"open_zoom: весь кадр ×{c['from']:g} → 1 за {c['dur']:g} с к ({c['anchor'][0]:g}, {c['anchor'][1]:g}), кадров открытия {min(n_open, f)} · "
          f"{os.path.relpath(out or src)}")


if __name__ == "__main__":
    main()
