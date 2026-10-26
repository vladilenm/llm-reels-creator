#!/usr/bin/env python3
"""Ночная база картинки OBS-дубля (дизайн 2026-10-26, docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md):
тёмный фон с сеткой, свечением, дрейфом и зерном; спикер вырезан маской Apple Vision из карточки камеры и стоит внизу
(×1,1 от низа кадра, как в claude-sfx) с фиолетовым контровым светом; в окнах акцентов (work/accents.json) фон заменяет
полный слой акцента — слово всегда за головой. Наезд 1,00 ↔ 1,05 на склейках не чаще раза в секунду, не рядом
с акцентами и не после последней склейки.

  python3 scripts/ru/wide/night_base.py <project> --prep            кадры карточки → fx/masks (Vision)
  python3 scripts/ru/wide/night_base.py <project> --stills 0.5,6.2  → review/night-<t>.png
  python3 scripts/ru/wide/night_base.py <project> [--card] [--mix] [--until 20.66]  → renders/picture.base.mp4 [+ renders/picture.mp4 со звуком fx/mix.wav]
  --until: база только до этого времени чистого таймлайна (кусок ролика)
  --card: без маски — карточка камеры на ночном фоне с тонкой светлой рамкой (кресло или мебель у плеча)
  --allow-missing: не останавливаться, если больше 5 % кадров без своей маски (по умолчанию это стоп: маски от другой версии ролика)

work/accents.json: {"accents": [{"id", "in", "out", "kind": "night" | "light", "file"}]} — время чистого таймлайна,
kind "light" — светлый акцент: за спикером мягкая нейтральная тень вместо фиолетового ореола.
file — полный слой .mp4 (OK.run mode 'full') от корня проекта; в broll/plan.json эти клипы не попадают.

fx/fx.json "cine": true (только с маской; дизайн docs/superpowers/specs/2026-10-26-night-cine-slice-design.md) — кино-слой
scripts/ru/wide/cine.py: планы спикера из work/shots.json со смазом на проездах, наезды только в mid, грейд, свет фона на
краях, ключ со стороны графики, вспышка ореола на ночных акцентах; зерна в базе нет — его даёт финиш assemble.mjs."""
import json, os, shutil, subprocess, sys, pathlib, tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project, fps, joins, CARD
import cine

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
INK_DARK = np.array((0x17, 0x14, 0x1C), np.float32)
SHADOW, MISS_MAX, REACH = 0.35, 0.05, 3           # тень на светлом акценте; доля кадров без маски до стопа; поиск соседа ±3
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


def night_bg(f, fps_, grain=True):
    """ночной фон кадра f: свечение, сетка с плавным дрейфом вверх (доли пикселя — смесь соседних сдвигов), зерно
    (grain=False — без зерна: в кино-режиме его даёт финиш кадра)"""
    off = f / fps_ * DRIFT
    o0, fr = int(off) % GRID_STEP, off - int(off)
    a = (GRID[o0:o0 + H] * (1 - fr) + GRID[o0 + 1:o0 + 1 + H] * fr)[..., None]
    bg = GLOW * (1 - a) + ACCENT_L[None, None] * a
    return bg + np.random.default_rng(f).normal(0, GRAIN, (H, W, 1)).astype(np.float32) if grain else bg


def halo(m):
    """контровой свет: мягкий ореол сразу за силуэтом; m — маска 0..1 (H×W)"""
    blur = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7)), np.float32) / 255
    return np.clip(blur - m, 0, 1) * HALO


def shadow(m):
    """тень за силуэтом на светлом акценте: мягкая, только снаружи маски"""
    blur = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14)), np.float32) / 255
    return np.clip(blur - m, 0, 1) * SHADOW


def mask_src(masks, f, cuts):
    """кадр, чья маска идёт в кадр f: свой; нет своего — ближайший сосед до ±3 кадров по эту сторону склейки
    (склейка c — первый кадр нового плана); иначе None"""
    if f in masks: return f
    for d in range(1, REACH + 1):
        for k in (f - d, f + d):
            if k in masks and not any(min(k, f) < c <= max(k, f) for c in cuts): return k
    return None


def mask_at(masks, f, cuts):
    """маска кадра f (masks — {номер кадра: png}, имена fx/masks/%05d.png). Своей нет — берётся маска соседа (mask_src);
    нет и её — пустая маска: спикера и ореола в кадре нет. Среднее по src-1, src, src+1 (0.25/0.5/0.25), но не через
    склейку и без соседей без маски; мягкий край; уголки карточки снизу заполнены соседним столбцом (свитер)."""
    src = mask_src(masks, f, cuts)
    if src is None: return Image.new("L", (CW, CH), 0)
    acc, ws = None, 0.0
    for k, w in ((src - 1, .25), (src, .5), (src + 1, .25)):
        if k not in masks: continue
        if (k == src - 1 and src in cuts) or (k == src + 1 and src + 1 in cuts): continue
        m = Image.open(masks[k]).convert("L")
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
    if ctx.get("cine"): return compose_cine(fr, f, ctx)
    acc, kind = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, ctx["fps"])
    bg = ctx["back"](f, bg)
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
    if kind == "light":                              # светлый акцент: нейтральная тень, фиолетовый ореол там не виден
        h = shadow(m)[..., None]; bg = bg * (1 - h) + INK_DARK[None, None] * h
    else:
        h = halo(m)[..., None]; bg = bg * (1 - h) + ACCENT_L[None, None] * h
    out = bg * (1 - m[..., None]) + np.asarray(lay, np.float32) * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def punch_cine(f, ctx):
    """наезд в кино-режиме: только в mid вне проезда; склейки считаются с конца последнего проезда (в mid входим без
    наезда); после последней склейки — 1,0, как в compose"""
    F, sh = ctx["fps"], ctx["shots"]; t = f / F
    s, dx, _ = cine.state(sh, t)
    if abs(s - 1) > 1e-6 or abs(dx) > 1e-6 or cine.moving(sh, t): return 1.0
    tg = ctx["toggles"]
    if tg and f >= tg[-1]: return 1.0
    since = max([round((at + dur) * F) for at, _, dur in sh if at <= t] or [0])
    return (1.0, PUNCH)[sum(1 for r in tg if since <= r <= f) % 2]


def compose_cine(fr, f, ctx):
    """кадр кино-режима: фон (акцент или ночь без зерна) и back-клипы; спикер в плане work/shots.json — на проезде
    среднее 4 положений затвора; грейд на карточке до трансформации, края карточки в ноль, свет фона на краях, ключ,
    ореол со вспышкой (на светлом акценте — тень)"""
    F, sh = ctx["fps"], ctx["shots"]; t = f / F
    acc, kind = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, F, grain=False)
    bg = ctx["back"](f, bg)
    pr = Image.fromarray(cine.grade(np.asarray(person_rgb(fr), np.float32)).astype(np.uint8)).resize((PW, PH), Image.BICUBIC)
    pm = mask_at(ctx["masks"], f, ctx["cuts"]).resize((PW, PH), Image.BICUBIC)
    lay, lm = Image.new("RGB", (W, H)), Image.new("L", (W, H), 0)
    lay.paste(pr, (PX, PY)); lm.paste(pm, (PX, PY))
    sc = punch_cine(f, ctx)
    ts = [t + d for d in cine.shutter(F)] if cine.moving(sh, t) else [t]
    acc_rgb, acc_m = np.zeros((H, W, 3), np.float32), np.zeros((H, W), np.float32)
    for ti in ts:
        s, dx, _ = cine.state(sh, ti)
        A = cine.affine(s, dx, sc, ANCHOR)
        mi = np.asarray(lm.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC), np.float32) / 255
        mi = cine.feather(mi, *cine.card_edges(s, dx, PX, PW))
        acc_rgb += np.asarray(lay.transform((W, H), Image.AFFINE, A, resample=Image.BICUBIC), np.float32) * mi[..., None]
        acc_m += mi
    m = acc_m / len(ts)
    rgb = acc_rgb / len(ts) / np.maximum(m, 1e-4)[..., None]
    rgb = cine.key(cine.wrap(rgb, m, bg), m, cine.state(sh, t)[2])
    if kind == "light":
        h = shadow(m)[..., None]; bg = bg * (1 - h) + INK_DARK[None, None] * h
    else:
        h = np.clip(halo(m) * cine.pulse(t, ctx["night_starts"]), 0, 1)[..., None]; bg = bg * (1 - h) + ACCENT_L[None, None] * h
    out = bg * (1 - m[..., None]) + rgb * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def tail(f, n=8):
    f.seek(0)
    return "\n".join(f.read().decode("utf-8", "replace").strip().splitlines()[-n:])


def rel(P, path):
    """путь для сообщения: от корня проекта, если внутри него"""
    try: return str(pathlib.Path(path).relative_to(P))
    except ValueError: return str(path)


def frame_count(path, fps_):
    """число кадров, как их читает frames(): round(длительность видеопотока × fps) — nb_frames считает родные кадры файла и
    расходится с ними, если fps клипа не совпадает с fps проекта. Потоку не назвали длительность — берётся длительность
    контейнера; ffprobe не прочёл файл или нет видеопотока — SystemExit"""
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration:format=duration", "-of", "json",
                        str(path)], capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit(f"ffprobe не прочитал {path} (код {r.returncode}):\n{r.stderr.strip()}")
    try: info = json.loads(r.stdout); st = info["streams"][0]
    except (ValueError, KeyError, IndexError): raise SystemExit(f"в {path} нет видеопотока")
    for d in (st.get("duration"), info.get("format", {}).get("duration")):
        try: return round(float(d) * fps_)
        except (TypeError, ValueError): continue
    raise SystemExit(f"ffprobe не назвал длительность видеопотока {path}")


def frames(path, fps_, ch=3):
    """кадры файла по одному; ffmpeg завершился с ошибкой — SystemExit с его последними строками (обрезанный дубль не
    молчит). Читатель, которого бросили, не дочитав, убивается. ch 4 — RGBA (слои с альфой)."""
    err = tempfile.TemporaryFile()
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={fps_:g},scale={W}:{H}", "-f", "rawvideo",
                          "-pix_fmt", "rgba" if ch == 4 else "rgb24", "-"], stdout=subprocess.PIPE, stderr=err)
    n, ended = W * H * ch, False
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n: ended = True; break
            yield np.frombuffer(b, np.uint8).reshape(H, W, ch)
    finally:
        if not ended: p.kill()
        p.stdout.close(); rc = p.wait()
    if rc != 0: raise SystemExit(f"ffmpeg не смог прочитать {path} (код {rc}):\n{tail(err)}")


def grab(path, t, last=False, ch=3):
    """кадр файла в момент t; last — последний кадр файла (клип короче окна); None — кадра нет"""
    seek = ["-sseof", "-0.3"] if last else ["-ss", f"{max(0.0, t):.4f}"]
    b = subprocess.run(["ffmpeg", "-v", "error", *seek, "-i", str(path), *([] if last else ["-frames:v", "1"]), "-vf", f"scale={W}:{H}",
                        "-f", "rawvideo", "-pix_fmt", "rgba" if ch == 4 else "rgb24", "-"], capture_output=True, check=True).stdout
    n = W * H * ch
    if len(b) < n: return None
    return np.frombuffer(b[-n:] if last else b[:n], np.uint8).reshape(H, W, ch)


def accents(P, fps_):
    """(функция f → (кадр слоя акцента, вид) или (None, None) для покадрового прохода, окна [(f0, f1, path, kind)])"""
    p = P / "work" / "accents.json"
    raw = json.loads(p.read_text())["accents"] if p.exists() else []
    bad = [a.get("id", "?") for a in raw if a.get("kind", "night") not in ("night", "light")]
    if bad: raise SystemExit("work/accents.json: kind бывает night или light — не так у " + ", ".join(bad))
    win = [(round(a["in"] * fps_), round(a["out"] * fps_), P / a["file"], a.get("kind", "night")) for a in raw]
    gone = sorted({rel(P, path) for _, _, path, _ in win if not path.is_file()})
    if gone: raise SystemExit("work/accents.json: нет файлов слоя акцента: " + ", ".join(gone))
    its, last = {}, {}                              # читатель и последний кадр — на окно (один файл в двух окнах стартует с начала)
    def at(f):
        for i, (f0, f1, path, kind) in enumerate(win):
            if f0 <= f < f1:
                if i not in its: its[i] = frames(path, fps_)
                fr = next(its[i], None)
                if fr is not None: last[i] = fr
                elif i not in last: raise SystemExit(f"{rel(P, path)}: в слое акцента нет кадров")
                return last[i], kind                # клип короче окна — держим его последний кадр
        return None, None
    return at, win


def fresh_dir(d):
    """пустая настоящая папка на месте d. Симлинк (fx/masks часто ведёт в папку другого, утверждённого проекта) снимается
    самим собой, цель не трогаем: rmtree сквозь ссылку стёр бы чужие файлы"""
    if d.is_symlink() or d.is_file(): os.unlink(d)
    elif d.is_dir(): shutil.rmtree(d)
    d.mkdir(parents=True)


def prep(P, F):
    clean = P / "renders" / "clean.mp4"
    if not clean.is_file(): raise SystemExit(f"нет {rel(P, clean)}: сначала чистый ролик (S2)")
    if not shutil.which("swift"): raise SystemExit("нет swift (Xcode Command Line Tools): маски Vision не посчитать — выбери --card")
    fr, out = P / "work" / "card-frames", P / "fx" / "masks"
    fresh_dir(fr); fresh_dir(out)                   # кадры и маски прошлого запуска не должны смешаться с новыми
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(clean), "-vf", f"fps={F:g},crop={CW}:{CH}:{CX0}:{CY0}",
                    "-start_number", "0", str(fr / "%05d.png")], check=True)
    subprocess.run(["swift", str(ROOT / "scripts/ru/fx/person-mask.swift"), str(fr), str(out)], check=True)
    got, total = len(list(out.glob("*.png"))), len(list(fr.glob("*.png")))
    print(f"→ {out.relative_to(P.parents[1])}: {got} масок из {total} кадров" + (f" · ⚠ без маски {total - got}: там спикера не будет" if got < total else ""))


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"): print(__doc__); sys.exit(1)
    P = project(a[0]); F = fps(P)
    if "--prep" in a: prep(P, F); return
    clean = P / "renders" / "clean.mp4"
    if not clean.is_file(): raise SystemExit(f"нет {rel(P, clean)}: сначала чистый ролик (S2)")
    card = "--card" in a
    fxp = P / "fx" / "fx.json"
    try: fxj = json.loads(fxp.read_text()) if fxp.is_file() else {}
    except ValueError as e: raise SystemExit(f"fx/fx.json: {e}")
    cin = bool(fxj.get("cine"))
    if cin and card: print("⚠ cine работает только с маской: --card собирается как раньше"); cin = False
    until = None
    if "--until" in a:
        try: until = round(float(a[a.index("--until") + 1]) * F)
        except (IndexError, ValueError): raise SystemExit("--until: нужно время в секундах, например --until 20.66")
    masks = {} if card else {int(m.stem): m for m in (P / "fx" / "masks").glob("*.png") if m.stem.isdigit()}
    if not card and not masks: raise SystemExit("нет fx/masks/*.png: запусти --prep или выбери --card")
    accent, win = accents(P, F)
    shots = cine.load_shots(P / "work" / "shots.json", [(f0 / F, f1 / F) for f0, f1, _, _ in win]) if cin else []
    toggles = []
    for j in joins(P):
        fj = round(j * F)
        if any(f0 / F - 0.3 <= j <= f1 / F + 0.3 for f0, f1, _, _ in win): continue
        if cin:                                     # наезды — только в mid и не ближе 0,3 с к проезду
            s, dx, _ = cine.state(shots, j)
            if abs(s - 1) > 1e-6 or abs(dx) > 1e-6 or cine.moving(shots, j, 0.3): continue
        if not toggles or fj - toggles[-1] >= F: toggles.append(fj)
    ctx = {"fps": F, "card": card, "masks": masks, "cuts": {round(j * F) for j in joins(P)}, "toggles": toggles, "accent": accent,
           "back": lambda f, bg: bg, "cine": cin, "shots": shots, "night_starts": [f0 / F for f0, _, _, k in win if k == "night"]}
    cuts = ctx["cuts"]
    if not card:
        total = frame_count(clean, F)
        own = [f for f in range(total) if f not in masks]
        if len(own) > max(3, MISS_MAX * total) and "--allow-missing" not in a:
            raise SystemExit(f"кадров без своей маски: {len(own)} из {total} (первые: {', '.join(map(str, own[:5]))}) — маски от другой "
                             f"версии ролика? Запусти --prep заново или добавь --allow-missing")

    if "--stills" in a:
        out = P / "review"; out.mkdir(exist_ok=True)
        for t in (float(x) for x in a[a.index("--stills") + 1].split(",")):
            f = round(t * F)
            layer, kind = None, None
            for f0, f1, path, k in win:
                if f0 <= f < f1:
                    layer, kind = grab(path, (f - f0) / F), k
                    if layer is None: layer = grab(path, 0, last=True)      # клип короче окна: его последний кадр
                    if layer is None: raise SystemExit(f"{rel(P, path)}: в слое акцента нет кадров")
                    break
            if not card and f not in masks:
                print(f"  ⚠ у кадра {f} нет своей маски: " + ("взята у соседа" if mask_src(masks, f, cuts) is not None else "спикера не будет"))
            im = compose(grab(clean, f / F), f, dict(ctx, accent=lambda _f, layer=layer, kind=kind: (layer, kind)))
            Image.fromarray(im).save(out / f"night-{t:05.2f}.png"); print("→", f"review/night-{t:05.2f}.png")
        return

    base = P / "renders" / "picture.base.mp4"
    err = tempfile.TemporaryFile()
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", f"{F:g}", "-i", "-",
                            "-i", str(clean), "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-crf", "14", "-preset", "medium",
                            "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", str(base)], stdin=subprocess.PIPE, stderr=err)
    n, missing = 0, []
    try:
        for f, fr in enumerate(frames(clean, F)):
            if until is not None and f >= until: break
            if masks and f not in masks: missing.append(f)
            enc.stdin.write(compose(fr, f, ctx).tobytes()); n += 1
            if f % 250 == 0: print(f"  {f}", flush=True)
        enc.stdin.close()
    except BrokenPipeError:                         # кодировщик умер: причина в его stderr ниже
        try: enc.stdin.close()
        except OSError: pass
    except BaseException:
        enc.kill(); raise
    rc = enc.wait()
    if rc != 0: raise SystemExit(f"ffmpeg (кодировщик) завершился с кодом {rc}, {rel(P, base)} не готов:\n{tail(err)}")
    if missing:
        empty = [f for f in missing if mask_src(masks, f, cuts) is None]
        print(f"⚠ кадров без своей маски: {len(missing)} (первые: {', '.join(map(str, missing[:5]))}) · взяты у соседей: "
              f"{len(missing) - len(empty)} · пустых: {len(empty)}" + (" — на пустых спикера нет, проверь fx/masks" if empty else ""))
    print(f"→ {base.relative_to(P.parents[1])} · кадров {n} · {'карточка' if card else 'маска'} · наезды {'—' if card else toggles} · "
          f"акцентов {len(win)} · кино {'вкл' if cin else 'выкл'}" + (f" · планов {len(shots)}" if cin else ""))
    if "--mix" in a:
        pic = P / "renders" / "picture.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(base), "-i", str(P / "fx" / "mix.wav"), "-map", "0:v", "-map", "1:a",
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-shortest", str(pic)], check=True)
        print("→", pic.relative_to(P.parents[1]), "(звук fx/mix.wav)")


if __name__ == "__main__":
    main()
