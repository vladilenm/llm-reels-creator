"""Кино-слой ночной базы (дизайн docs/superpowers/specs/2026-10-26-night-cine-slice-design.md): планы спикера
(work/shots.json), растушёвка краёв карточки, грейд, свет фона на краях, ключ со стороны графики, вспышка ореола.
Чистые функции numpy и Pillow; night_base.py собирает ими кадр, когда в fx/fx.json "cine": true.

work/shots.json: {"shots": [{"at": 0, "shot": "close", "dur": 0}, {"at": 2.45, "shot": "side-right", "dur": 0.6}]} —
время чистого таймлайна; до первого ключа — mid; dur 0 — рез (под полным клипом, где спикера не видно)."""
import json
import numpy as np
from PIL import Image, ImageFilter

W, H = 1080, 1920
SHOTS = {"mid": (1.00, 0.0), "close": (1.38, 0.0), "side-left": (0.86, -240.0), "side-right": (0.86, 240.0)}
KEY_SIDE = {"mid": 0.0, "close": 0.0, "side-left": 1.0, "side-right": -1.0}   # +1 — ключ справа, −1 — слева
DUR = 0.6                                    # проезд по умолчанию, с
ORIGIN = (540.0, 1920.0)                     # планы масштабируют от низа кадра: карточка OBS кончается на груди
FEATHER, FEATHER_IN = 160, 60                # растушёвка края карточки, px; полная сила, когда край на 60 px в кадре
SHADOW_TO = np.array((0x16, 0x10, 0x26), np.float32) / 255     # тени спикера — к ночному фиолетово-чёрному
KEY_LIGHT = np.array((0xD8, 0xCC, 0xFF), np.float32)           # ключ со стороны графики
GRADE_K, WRAP_K, KEY_K = 1.0, 0.6, 0.22
PULSE_K, PULSE_DUR = 0.6, 0.8                                   # вспышка ореола в начале ночного акцента


def ex(x):
    """expo-out ночного стиля: долгое торможение"""
    return 0.0 if x <= 0 else 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def load_shots(path, accent_windows=()):
    """work/shots.json → [(at, план, dur)] по возрастанию at; файла нет — []. accent_windows — [(t0, t1)], с.
    SystemExit: неизвестный план, at не по возрастанию, dur < 0, в окне акцента не mid или идёт проезд"""
    if not path.is_file(): return []
    try: raw = json.loads(path.read_text())["shots"]
    except (ValueError, KeyError, TypeError) as e: raise SystemExit(f"{path.name}: нужен {{\"shots\": [...]}} ({e})")
    out = []
    for i, k in enumerate(raw):
        name, at, dur = k.get("shot"), float(k.get("at", -1)), float(k.get("dur", DUR))
        if name not in SHOTS: raise SystemExit(f"{path.name}: ключ {i}: план {name!r} — бывает {', '.join(SHOTS)}")
        if at < 0 or (out and at < out[-1][0]): raise SystemExit(f"{path.name}: ключ {i}: at {at:g} не по возрастанию")
        if dur < 0: raise SystemExit(f"{path.name}: ключ {i}: dur < 0")
        out.append((at, name, dur))
    for t0, t1 in accent_windows:
        prev = [k for k in out if k[0] <= t0]
        bad = [k for k in out if t0 < k[0] < t1 or k[0] <= t0 < k[0] + k[2]]
        if (prev and prev[-1][1] != "mid") or bad:
            k = bad[0] if bad else prev[-1]
            raise SystemExit(f"{path.name}: в окне акцента {t0:.2f}–{t1:.2f} спикер только в mid и без проезда — "
                             f"мешает ключ at {k[0]:g}")
    return out


def state(shots, t):
    """(масштаб, сдвиг x, сторона ключа) в момент t: до первого ключа — mid; на проезде — expo-out от того, где спикер
    был, к новому плану"""
    s, dx = SHOTS["mid"]; side = KEY_SIDE["mid"]
    for at, name, dur in shots:
        if t < at: break
        u = 1.0 if dur <= 0 else ex((t - at) / dur)
        s1, dx1 = SHOTS[name]
        s, dx, side = s + (s1 - s) * u, dx + (dx1 - dx) * u, side + (KEY_SIDE[name] - side) * u
    return s, dx, side


def moving(shots, t, pad=0.0):
    """идёт ли проезд в момент t (pad — запас по обе стороны, с); рез (dur 0) — не проезд"""
    return any(at - pad <= t < at + dur + pad for at, _, dur in shots if dur > 0)


def shutter(fps):
    """смещения 4 подкадров затвора 180°, как render.js у графики: (k − 1,5) / (8·fps), с"""
    return [(k - 1.5) / (8 * fps) for k in range(4)]


def affine(s, dx, punch=1.0, anchor=(540.0, 1330.0)):
    """коэффициенты Image.AFFINE (выход → вход): сначала наезд punch вокруг anchor, потом план — масштаб s от низа
    кадра и сдвиг dx"""
    ox, oy = ORIGIN; ax, ay = anchor
    fp = np.array([[punch, 0, ax - punch * ax], [0, punch, ay - punch * ay], [0, 0, 1]])
    fs = np.array([[s, 0, ox - s * ox + dx], [0, s, oy - s * oy], [0, 0, 1]])
    return tuple(np.linalg.inv(fs @ fp)[:2].ravel())


def card_edges(s, dx, px, pw):
    """x левого и правого края карточки в кадре: в слое карточка лежит на x px…px+pw, план — s, dx от низа кадра"""
    ox = ORIGIN[0]
    return ox + s * (px - ox) + dx, ox + s * (px + pw - ox) + dx


def feather(m, xl, xr):
    """маска m (H×W, 0..1) уходит в ноль у края карточки, который зашёл в кадр: сила = clamp(насколько край в кадре
    / FEATHER_IN), ширина FEATHER px. Края за кадром — m без изменений (тот же объект)"""
    k_l, k_r = float(np.clip(xl / FEATHER_IN, 0, 1)), float(np.clip((m.shape[1] - xr) / FEATHER_IN, 0, 1))
    if k_l <= 0 and k_r <= 0: return m
    x = np.arange(m.shape[1], dtype=np.float32)
    r = np.ones_like(x)
    if k_l > 0: r *= 1 - k_l * (1 - np.clip((x - xl) / FEATHER, 0, 1))
    if k_r > 0: r *= 1 - k_r * (1 - np.clip((xr - x) / FEATHER, 0, 1))
    return m * r[None, :]


def blur(a, r, scale=255.0):
    """гауссово размытие float-массива (H×W или H×W×3, значения 0..scale) на r px; r ≥ 16 — на четверти размера
    (быстро и для света этого хватает)"""
    h, w = a.shape[:2]
    im = Image.fromarray(np.clip(a / scale * 255, 0, 255).astype(np.uint8))
    if r >= 16:
        im = im.resize((w // 4, h // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(r / 4)).resize((w, h), Image.BILINEAR)
    else:
        im = im.filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im, np.float32) / 255 * scale


def grade(rgb, k=GRADE_K):
    """грейд спикера: тени (яркость < 0,45) уходят к #161026, контраст только ниже 0,5; светлое — лицо, блики — не
    трогаем. rgb — float 0..255 (…×3)"""
    x = rgb / 255.0
    lum = (x * np.array([.2126, .7152, .0722], np.float32)).sum(-1, keepdims=True)
    w = np.clip(1 - lum / .45, 0, 1) ** 2
    x = x * (1 - .55 * k * w) + SHADOW_TO * .55 * k * w
    lo = np.minimum(x, .5)
    x = x - (lo - 2 * lo * lo) * .35 * k
    return np.clip(x * 255, 0, 255)


def wrap(rgb, m, bg, k=WRAP_K):
    """свет фона на краях: размытый на 30 px фон осветляет («экран») полосу ~10 px внутри края маски"""
    inner = blur(m, 10, 1.0)
    edge = np.clip((1 - inner) * m * 2.2, 0, 1)[..., None] * k
    return rgb + (255 - rgb) * (blur(bg, 30) / 255) * edge


def key(rgb, m, side, k=KEY_K):
    """ключ со стороны графики: side +1 — свет справа, −1 — слева, 0 — нет (на проезде — доля); только у края силуэта
    (полоса ~40 px), сила растёт к своей стороне кадра"""
    if abs(side) < 1e-3: return rgb
    x = np.linspace(0, 1, m.shape[1], dtype=np.float32)
    g = (x if side > 0 else 1 - x) ** 2 * k * abs(side)
    rim = np.clip((1 - blur(m, 40, 1.0)) * m * 1.6, 0, 1)
    return rgb + (KEY_LIGHT - rgb) * (g[None, :] * rim)[..., None] * 2.2


def pulse(t, night_starts):
    """множитель ореола: в первые PULSE_DUR с ночного акцента 1 + PULSE_K·sin(π·u), иначе 1"""
    for t0 in night_starts:
        u = (t - t0) / PULSE_DUR
        if 0 <= u < 1: return 1 + PULSE_K * float(np.sin(np.pi * u))
    return 1.0
