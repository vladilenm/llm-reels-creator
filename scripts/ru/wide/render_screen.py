#!/usr/bin/env python3
"""W4 окно рилса из широкой OBS-записи: кадры 900×428 считаются прямо из нативного экрана raw.mp4 (3024×1964,
Lanczos, без промежуточного сжатия) с наездами по словам, подсветкой фраз и обводками, запечёнными в кадр.
screen-kit играет их 1:1 (камера [0,0,900], from 0.02) — см. make_clips.py.

Экран и голос развязаны: каждый шот берёт свои секунды исходника, чтобы под фразой было то, о чём она
(набор промпта, «Готово», итоговый файл, шаги), даже если в записи это шло в тишине.

  python3 scripts/ru/wide/render_screen.py <project> [shot …]   → screens/<id>/NNNNN.jpg + manifest.js, broll/shots.json

broll/screen.json — схема в .claude/skills/reel-wide/references/config.md:
  {"shots": [{"id", "t0", "t1" (чистое время), "url",
              "src": {"at": s, "speed"?: 1, "min"?, "max"?} | {"hold": s} | {"real": true} | {"lin": [[t, s], …]},
              "cams": [[t, [x, y, w], dur], …]          прямоугольник экрана (px нативного экрана), h = w/2.103
              "marks": [{"kind": "hl"|"ring"|"blur", "rect": [x, y, w, h], "t0", "t1"?}]}]}
blur — мозаика + размытие поверх прямоугольника (секреты: значение ключа в .env); ставить t0 = t0 шота без t1;
hl — маркер слева направо, висит до конца шота без t1; на тёмном — экранное смешение (текст остаётся белым),
на светлом (яркость под словами > 140) — лавандовый маркер умножением (тёмный текст остаётся тёмным);
ring — пружина + свечение, на светлом фоне тёмный акцент, на тёмном — светлый. Камеры: ключ едет от того,
где камера в момент ключа (как keyed() в screen-kit); низ кадра не ниже дока macOS."""
import json, math, subprocess, sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, raw, fps, c2s_fn, SCREEN, DOCK, WIN_CANVAS

ACC, ACC_L = (124, 58, 237), (183, 156, 255)
HL_LIGHT = (206, 188, 255)                        # маркер на светлом фоне (умножение)
CW, CH = WIN_CANVAS
R = CW / CH
SS = 2                                            # суперсэмплинг меток


def cam(x, y, w):
    h = w / R
    return [float(x), float(max(0, min(y, DOCK - h))), float(w)]


def src_fn(spec, t0, c2s):
    if "hold" in spec: return lambda t: spec["hold"]
    if spec.get("real"): return c2s
    if "lin" in spec:
        pts = spec["lin"]
        def f(t):
            if t <= pts[0][0]: return pts[0][1]
            for (a, x), (b, y) in zip(pts, pts[1:]):
                if t <= b: return x + (y - x) * (t - a) / (b - a) if b > a else y
            return pts[-1][1]
        return f
    at, sp = spec["at"], spec.get("speed", 1.0)
    lo, hi = spec.get("min", -1e9), spec.get("max", 1e9)
    return lambda t: min(hi, max(lo, at + (t - t0) * sp))


def eio(u):
    u = min(1.0, max(0.0, u)); return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2


def track(keys):
    keys = sorted(keys, key=lambda k: k[0]); starts = [keys[0][1]]
    def at(t, n):
        i = 0
        for j in range(1, n):
            if t >= keys[j][0]: i = j
        if i == 0: return keys[0][1]
        kt, v, d = keys[i]; u = 1.0 if d <= 0 else eio((t - kt) / d)
        return [a + (b - a) * u for a, b in zip(starts[i], v)]
    for i in range(1, len(keys)): starts.append(at(keys[i][0] - 1e-6, i))
    return lambda t: at(t, len(keys))


def spring(t, k=16.0, z=0.62):
    if t <= 0: return 0.0
    wd = k * math.sqrt(max(1e-6, 1 - z * z))
    return 1 - math.exp(-z * k * t) * (math.cos(wd * t) + z * k / wd * math.sin(wd * t))


def draw_marks(img, t, marks, rect):
    x, y, w = rect; k = CW / w
    live = [m for m in marks if t >= m["t0"] and (m.get("t1") is None or t <= m["t1"] + 0.2)]
    if not live: return img
    for m in live:
        if m["kind"] != "blur": continue
        rx, ry, rw, rh = m["rect"]
        a0, b0 = max(0, int((rx - x) * k)), max(0, int((ry - y) * k))
        a1, b1 = min(CW, math.ceil((rx + rw - x) * k)), min(CH, math.ceil((ry + rh - y) * k))
        if a1 - a0 < 2 or b1 - b0 < 2: continue
        bs = max(6, round(rh * k / 2))                # блок мозаики — полстроки текста
        reg = img.crop((a0, b0, a1, b1))
        reg = reg.resize((max(1, (a1 - a0) // bs), max(1, (b1 - b0) // bs)), Image.BILINEAR)
        reg = reg.resize((a1 - a0, b1 - b0), Image.NEAREST).filter(ImageFilter.GaussianBlur(bs / 2))
        img = img.copy(); img.paste(reg, (a0, b0))
    live = [m for m in live if m["kind"] != "blur"]
    if not live: return img
    hl = Image.new("RGB", (CW * SS, CH * SS), (0, 0, 0)); dh = ImageDraw.Draw(hl)
    hl_l = Image.new("RGB", (CW * SS, CH * SS), (255, 255, 255)); dl = ImageDraw.Draw(hl_l)
    ring = Image.new("L", (CW * SS, CH * SS), 0); dr = ImageDraw.Draw(ring)
    gray = np.asarray(img.convert("L"))
    any_hl = any_hl_l = any_ring = False
    for m in live:
        rx, ry, rw, rh = m["rect"]
        X, Y, Wd, Hd = (rx - x) * k * SS, (ry - y) * k * SS, rw * k * SS, rh * k * SS
        out = 1.0 if m.get("t1") is None else 1 - eio((t - m["t1"]) / 0.2)
        if m["kind"] == "hl":
            p = eio((t - m["t0"]) / 0.28); a = 0.62 * out; pad = 5 * k * SS
            box = [X - pad, Y - pad * 0.6, X - pad + (Wd + 2 * pad) * p, Y + Hd + pad * 0.6]
            under = gray[max(0, int(Y / SS)):max(0, int((Y + Hd) / SS)) + 1, max(0, int(X / SS)):max(0, int((X + Wd) / SS)) + 1]
            if under.size and under.mean() > 140:
                dl.rounded_rectangle(box, radius=6 * SS, fill=tuple(int(255 - (255 - c) * out) for c in HL_LIGHT)); any_hl_l = True
            else:
                dh.rounded_rectangle(box, radius=6 * SS, fill=tuple(int(c * a) for c in ACC)); any_hl = True
        else:
            s = 1.16 - 0.16 * spring(t - m["t0"]); a = min(1, (t - m["t0"]) / 0.12) * out
            cx, cy = X + Wd / 2, Y + Hd / 2; pw, ph = (Wd / 2 + 12 * SS) * s, (Hd / 2 + 9 * SS) * s
            dr.rounded_rectangle([cx - pw, cy - ph, cx + pw, cy + ph], radius=12 * SS, outline=int(255 * a), width=4 * SS)
            any_ring = True
    if any_hl:
        img = ImageChops.screen(img, hl.resize((CW, CH), Image.LANCZOS))
    if any_hl_l:
        img = ImageChops.multiply(img, hl_l.resize((CW, CH), Image.LANCZOS))
    if any_ring:
        r = ring.resize((CW, CH), Image.LANCZOS); ra = np.asarray(r)
        light = ra.max() > 40 and np.asarray(img.convert("L"))[ra > 40].mean() > 140
        glow = r.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * (0.55 if light else 0.9)))
        img = Image.composite(Image.new("RGB", (CW, CH), ACC_L if light else ACC), img, glow)
        img = Image.composite(Image.new("RGB", (CW, CH), ACC if light else ACC_L), img, r)
    return img


def main():
    args = sys.argv[1:]
    P = project(args[0]); only = set(args[1:]); FPS = fps(P); c2s = c2s_fn(P)
    cfg = json.loads((P / "broll/screen.json").read_text())
    shots = [s for s in cfg["shots"] if not only or s["id"] in only]
    jobs = {}
    for s in shots:
        s["_src"] = src_fn(s["src"], s["t0"], c2s)
        s["_cam"] = track([(t, cam(*r), d) for t, r, d in s["cams"]])
        s["_n"] = round((s["t1"] - s["t0"]) * FPS)
        for i in range(s["_n"]):
            t = s["t0"] + i / FPS
            jobs.setdefault(int(round(s["_src"](t) * FPS)), []).append((s, i, t))
        d = P / "screens" / s["id"]; d.mkdir(parents=True, exist_ok=True)
        for f in d.glob("*.jpg"): f.unlink()
    runs = []
    for f in sorted(jobs):
        if runs and f - runs[-1][1] <= 4: runs[-1][1] = f
        else: runs.append([f, f])
    print("кадров исходника:", len(jobs), "кусков:", len(runs))
    sx, sy, sw, sh = SCREEN; done = 0
    for a, b in runs:
        cmd = ["ffmpeg", "-v", "error", "-ss", f"{(a - 0.5) / FPS:.4f}", "-i", str(raw(P)), "-frames:v", str(b - a + 1),
               "-vf", f"crop={sw}:{sh}:{sx}:{sy}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
        pr = subprocess.Popen(cmd, stdout=subprocess.PIPE); sz = sw * sh * 3
        for f in range(a, b + 1):
            buf = pr.stdout.read(sz)
            if len(buf) < sz: raise SystemExit(f"короткое чтение на кадре {f}")
            if f not in jobs: continue
            im = Image.frombuffer("RGB", (sw, sh), buf, "raw", "RGB", 0, 1)
            for s, i, t in jobs[f]:
                x, y, w = s["_cam"](t)
                out = im.resize((CW, CH), Image.LANCZOS, box=(x, y, x + w, y + w / R))
                out = draw_marks(out, t, s.get("marks", []), (x, y, w))
                out.save(P / "screens" / s["id"] / f"{i + 1:05d}.jpg", quality=93, subsampling=0); done += 1
        pr.stdout.close(); pr.wait()
    for s in shots:
        man = {"n": s["_n"], "fps": FPS, "w": CW, "h": CH, "src": "raw.mp4 (нативный экран)", "from": s["t0"], "to": s["t1"]}
        (P / "screens" / s["id"] / "manifest.js").write_text(f'(window.SKF=window.SKF||{{}})[{json.dumps(s["id"])}]={json.dumps(man)};\n')
    (P / "broll/shots.json").write_text(json.dumps([{k: s[k] for k in ("id", "t0", "t1", "url")} for s in cfg["shots"]], ensure_ascii=False, indent=1))
    print("готово кадров:", done)


if __name__ == "__main__":
    main()
