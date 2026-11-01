# Ночной стиль, шаг «кино» — план работ (кусок claude-sfx 0–20,66 с)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** собрать кусок claude-sfx-night 0–20,66 с, где спикер меняет план (крупный, средний, «ведущий» сбоку), графика стоит и за ним, и перед ним, код в окнах читается на телефоне, а грейд, свет и финиш кадра сводят слои в одну картинку, — и показать заказчику рядом с одобренным куском.

**Architecture:** новый модуль `scripts/ru/wide/cine.py` — чистые функции: планы спикера из `work/shots.json` (масштаб и сдвиг от низа кадра, expo-out, затвор для смаза), растушёвка краёв карточки, грейд, свет фона на краях, ключ, вспышка ореола. `night_base.py` собирает ими кадр, когда в `fx/fx.json` стоит `"cine": true`; без него путь кадра прежний, байт в байт. Клипы с `"layer": "back"` ложатся в базе за спикера, `assemble.mjs` их пропускает и при `cine` добавляет финиш: свечение ночных клипов, виньетку и зерно до субтитров. `object-scene.js` получает `terminal.fs`. Кусок собирается в новом проекте рядом с одобренным.

**Tech Stack:** Python 3.9 + numpy + Pillow + ffmpeg 8.1 (база), Node 22 + ffmpeg filter_complex (сборка), браузерный JS на движке motion-broll (клипы), Playwright (рендер и тесты), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-26-night-cine-slice-design.md`.

В исторических командах ниже `REPO_ROOT` — путь к основной копии репозитория на текущем компьютере.

## Global Constraints

- Работа только в worktree `${REPO_ROOT}/.claude/worktrees/night-cine-slice`, ветка `claude/night-cine-slice`. Основную папку (`${REPO_ROOT}`) не переключать и не коммитить в неё: там звуковая ветка другой сессии с незакоммиченными правками. Все `git` — из worktree.
- Видео-проекты лежат вне git в основной папке: `R=${REPO_ROOT}/video-projects`. Одобренные `2026-10-25-claude-sfx` и `2026-10-26-claude-sfx-night` не меняются (ничего не пишем внутрь, только читаем и ссылаемся симлинками).
- Без `"cine": true` в `fx/fx.json` база и сборка дают тот же результат, что на `main` (проверка в задаче 3, шаг регрессии).
- Планы: `mid` 1,00 / 0; `close` 1,38 / 0; `side-left` 0,86 / −240; `side-right` 0,86 / +240 — масштаб от точки (540, 1920), сдвиг по x в px. Проезд по умолчанию 0,6 с, expo-out `1 − 2^(−10u)`; `dur: 0` — рез.
- Смаз проезда: 4 положения со смещениями (k − 1,5)/(8·fps), k = 0…3 — как `render.js`.
- Растушёвка: 160 px, сила `clamp(насколько край в кадре / 60 px)`.
- Грейд: тени (яркость < 0,45) к `#161026` с силой 0,55·w, w = (1 − яркость/0,45)²; контраст только ниже 0,5; светлое не меняется. Свет фона на краях: размытие 30 px, полоса ~10 px, «экран», 0,6. Ключ: `#D8CCFF`, 0,22, полоса ~40 px. Вспышка ореола: ×(1 + 0,6·sin(π·u)) в первые 0,8 с ночного акцента.
- Финиш: свечение σ 10, «экран», 0,7 (только клипы без `theme: "light"` и без `"glow": false`); виньетка `angle=PI/8`; зерно `noise c0s=5`, временное, `all_seed=7`; субтитры поверх финиша.
- Цвета бренда: `#0E0B14`, `#B79CFF`, `#7C3AED`, `#F5F3FA`, `#EFEDF4`, `#17141C`. Шрифты только с кириллицей (`SK Sans`, `SK Serif`, `SK Mono`, `SK Display`); перед рендером клипов — `scripts/ru/check-glyphs.mjs`.
- Безопасная зона текста: y 360–1420 (OBS-раскладка — от y 200), x ≤ 960.
- Только правда на экране: тексты терминала, числа и названия — из одобренного проекта (ответ Openverse API от 2026-10-25); укорачивать строки можно, менять факты нельзя.
- Стиль кода — как в соседнем: в Python-скриптах `scripts/ru/wide/` комментарии и сообщения по-русски, в `assemble.mjs` и `object-scene.js` комментарии по-английски.
- Новых зависимостей нет.
- Тесты — в `tests/night.test.mjs`, запуск `node --test tests/night.test.mjs`; в конце `npm test` зелёный.
- `SETUP.md` описывает новые настройки в той же правке (правило `CLAUDE.md`).
- Коммит каждой задачи — только её файлы, сообщение по-английски, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Отчёт со звуком заканчивается строкой «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

## Карта файлов

| Файл | Что делает |
|---|---|
| `scripts/ru/wide/cine.py` (новый) | планы спикера, затвор, аффинное преобразование, края карточки, растушёвка, грейд, свет на краях, ключ, вспышка ореола |
| `scripts/ru/wide/night_base.py` (правка) | `cine`-режим (`compose_cine`, наезды только в `mid`), зерно фона выключается, back-клипы за спикером, `--until` |
| `scripts/ru/assemble.mjs` (правка) | `frontClips`: back-клипы не накладываются второй раз; `readCine` и финиш кадра до субтитров |
| `scripts/ru/broll/object-scene.js` (правка) | `terminal.fs` — размер кода, строки, заголовка и каретки |
| `SETUP.md` (правка) | `cine`, `work/shots.json`, `layer: "back"`, `glow: false`, `--until` |
| `tests/night.test.mjs` (правка) | тесты всего перечисленного |
| `video-projects/2026-10-26-claude-sfx-cine/` (вне git) | проект куска: `broll/gen.mjs`, клипы, `work/shots.json`, `fx/fx.json`, рендеры, `REVIEW.md` |

---

### Task 1: `cine.py` — планы спикера

**Files:**
- Create: `scripts/ru/wide/cine.py`
- Modify: `tests/night.test.mjs` (новый раздел в конце файла)

**Interfaces:**
- Produces (Python, модуль `cine` в `scripts/ru/wide/`):
  - `SHOTS: dict[str, tuple[float, float]]` — план → (масштаб, сдвиг x); `KEY_SIDE: dict[str, float]`; `DUR = 0.6`; `ORIGIN = (540.0, 1920.0)`; `FEATHER = 160`; `FEATHER_IN = 60`
  - `ex(x: float) -> float`
  - `load_shots(path: pathlib.Path, accent_windows=()) -> list[tuple[float, str, float]]` — `[(at, план, dur)]`; файла нет → `[]`; ошибки → `SystemExit`
  - `state(shots, t: float) -> tuple[float, float, float]` — (масштаб, сдвиг x, сторона ключа: +1 справа, −1 слева, 0 нет)
  - `moving(shots, t: float, pad: float = 0.0) -> bool`
  - `shutter(fps: float) -> list[float]` — 4 смещения в секундах
  - `affine(s: float, dx: float, punch: float = 1.0, anchor=(540.0, 1330.0)) -> tuple` — 6 коэффициентов `Image.AFFINE` (выход → вход)
  - `card_edges(s: float, dx: float, px: int, pw: int) -> tuple[float, float]`
  - `feather(m: np.ndarray, xl: float, xr: float) -> np.ndarray`

- [ ] **Step 1: `node_modules` в worktree (тестам нужен Playwright)**

```bash
cd ${REPO_ROOT}/.claude/worktrees/night-cine-slice
ln -s ${REPO_ROOT}/node_modules node_modules
git status --short
```

Expected: `git status` пустой (`node_modules/` в `.gitignore`).

- [ ] **Step 2: Написать падающие тесты** — в конец `tests/night.test.mjs`; в строке импорта `node:fs` добавить `rmSync`:

```js
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, lstatSync, existsSync, rmSync } from "node:fs";
```

```js
// ---------- cine: планы спикера ----------

const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
const cinePy = (code) => {
  const r = py(`import sys, json; sys.path.insert(0, "scripts/ru/wide")\nimport cine\n${code}`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};

test("cine shots: mid before the first key, an expo-out move, a cut with dur 0, motion only while moving", () => {
  const o = cinePy(`
sh = [(1.0, "side-right", 0.6), (3.0, "close", 0.0)]
print(json.dumps({"before": cine.state(sh, 0.5), "start": cine.state(sh, 1.0), "half": cine.state(sh, 1.06),
  "end": cine.state(sh, 1.7), "cut": cine.state(sh, 3.0), "mv": [cine.moving(sh, t) for t in (0.99, 1.0, 1.59, 1.6, 3.0)],
  "pad": [cine.moving(sh, 0.8, 0.3), cine.moving(sh, 0.6, 0.3)], "shutter": cine.shutter(25)}))`);
  assert.deepEqual(o.before, [1, 0, 0]);
  assert.deepEqual(o.start, [1, 0, 0]);
  near(o.half[0], 0.93); near(o.half[1], 120); near(o.half[2], -0.5);
  near(o.end[0], 0.86); near(o.end[1], 240); near(o.end[2], -1);
  near(o.cut[0], 1.38); near(o.cut[1], 0); near(o.cut[2], 0);
  assert.deepEqual(o.mv, [false, true, true, false, false]);
  assert.deepEqual(o.pad, [true, false]);
  o.shutter.forEach((v, i) => near(v, [-0.0075, -0.0025, 0.0025, 0.0075][i], 1e-9));
});

test("cine load_shots: no file is no shots; unknown shot, unsorted at, negative dur and a non-mid accent window stop the run", () => {
  const d = tmp("shots-"), p = join(d, "shots.json");
  const load = (shots, acc = "[]") => {
    if (shots) writeFileSync(p, JSON.stringify({ shots }));
    return py(`import sys, json, pathlib; sys.path.insert(0, "scripts/ru/wide")\nimport cine\nprint(json.dumps(cine.load_shots(pathlib.Path(${JSON.stringify(p)}), ${acc})))`);
  };
  let r = load(null);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "[]");
  r = load([{ at: 0, shot: "close", dur: 0 }, { at: 2, shot: "mid" }], "[(3.0, 4.0)]");
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(JSON.parse(r.stdout), [[0, "close", 0], [2, "mid", 0.6]]);
  r = load([{ at: 0, shot: "wide" }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /план 'wide'/);
  r = load([{ at: 2, shot: "mid" }, { at: 1, shot: "close" }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /не по возрастанию/);
  r = load([{ at: 1, shot: "close", dur: -1 }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /dur < 0/);
  r = load([{ at: 0, shot: "side-left", dur: 0 }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /окне акцента 3\.00–4\.00.*at 0/);
  r = load([{ at: 0, shot: "mid", dur: 0 }, { at: 3.5, shot: "close" }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /at 3\.5/);
  r = load([{ at: 2.8, shot: "mid" }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0, "a move into mid that is still running at the window start"); assert.match(r.stderr, /at 2\.8/);
});

test("cine affine and feather: the shot scales from the frame bottom after the punch-in; only a card edge inside the frame fades", () => {
  const o = cinePy(`
import numpy as np
A = cine.affine(0.86, 240.0)
fwd = lambda x, y: ((x - A[2]) / A[0], (y - A[5]) / A[4])
m = np.ones((4, 1080), np.float32)
mid = cine.feather(m, *cine.card_edges(1.0, 0.0, -3, 1088))
side = cine.feather(m, *cine.card_edges(0.86, 240.0, -3, 1088))
P = cine.affine(1.0, 0.0, 1.05)
print(json.dumps({"bottom": fwd(540, 1920), "top": fwd(540, 1030), "edges": cine.card_edges(0.86, 240.0, -3, 1088),
  "mid_same": bool((mid == m).all()), "side": [float(side[0, x]) for x in (300, 400, 500, 1000)],
  "punch": [P[0], P[2], P[4], P[5]]}))`);
  near(o.bottom[0], 780); near(o.bottom[1], 1920);
  near(o.top[1], 1154.6, 0.1);
  near(o.edges[0], 313.02, 0.01); near(o.edges[1], 1248.7, 0.01);
  assert.equal(o.mid_same, true, "mid: both card edges are off the frame, the mask is untouched");
  near(o.side[0], 0); near(o.side[1], 0.5436, 1e-3); near(o.side[2], 1); near(o.side[3], 1);
  near(o.punch[0], 1 / 1.05); near(o.punch[1], 540 - 540 / 1.05); near(o.punch[3], 1330 - 1330 / 1.05);
});
```

- [ ] **Step 3: Запустить — тесты падают**

Run: `node --test --test-name-pattern "^cine" tests/night.test.mjs`
Expected: FAIL — `ModuleNotFoundError: No module named 'cine'`.

- [ ] **Step 4: Создать `scripts/ru/wide/cine.py`**

```python
"""Кино-слой ночной базы (дизайн docs/superpowers/specs/2026-10-26-night-cine-slice-design.md): планы спикера
(work/shots.json), растушёвка краёв карточки, грейд, свет фона на краях, ключ со стороны графики, вспышка ореола.
Чистые функции numpy и Pillow; night_base.py собирает ими кадр, когда в fx/fx.json "cine": true.

work/shots.json: {"shots": [{"at": 0, "shot": "close", "dur": 0}, {"at": 2.45, "shot": "side-right", "dur": 0.6}]} —
время чистого таймлайна; до первого ключа — mid; dur 0 — рез (под полным клипом, где спикера не видно)."""
import json
import numpy as np

W, H = 1080, 1920
SHOTS = {"mid": (1.00, 0.0), "close": (1.38, 0.0), "side-left": (0.86, -240.0), "side-right": (0.86, 240.0)}
KEY_SIDE = {"mid": 0.0, "close": 0.0, "side-left": 1.0, "side-right": -1.0}   # +1 — ключ справа, −1 — слева
DUR = 0.6                                    # проезд по умолчанию, с
ORIGIN = (540.0, 1920.0)                     # планы масштабируют от низа кадра: карточка OBS кончается на груди
FEATHER, FEATHER_IN = 160, 60                # растушёвка края карточки, px; полная сила, когда край на 60 px в кадре


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
```

- [ ] **Step 5: Запустить — тесты проходят**

Run: `node --test --test-name-pattern "^cine" tests/night.test.mjs`
Expected: PASS, 3 теста.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/wide/cine.py tests/night.test.mjs
git commit -m "Night cine: speaker shots — load and check work/shots.json, expo-out moves, shutter, affine, card-edge feather

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `cine.py` — свет и грейд

**Files:**
- Modify: `scripts/ru/wide/cine.py` (дописать в конец, импорт Pillow — в шапку)
- Modify: `tests/night.test.mjs`

**Interfaces:**
- Consumes: модуль из задачи 1.
- Produces:
  - `SHADOW_TO`, `KEY_LIGHT`, `GRADE_K = 1.0`, `WRAP_K = 0.6`, `KEY_K = 0.22`, `PULSE_K = 0.6`, `PULSE_DUR = 0.8`
  - `blur(a: np.ndarray, r: float, scale: float = 255.0) -> np.ndarray` (float32)
  - `grade(rgb: np.ndarray, k: float = GRADE_K) -> np.ndarray` — rgb float 0..255 (…×3)
  - `wrap(rgb, m, bg, k=WRAP_K) -> np.ndarray` — rgb, bg: H×W×3 float; m: H×W 0..1
  - `key(rgb, m, side: float, k=KEY_K) -> np.ndarray`
  - `pulse(t: float, night_starts: list[float]) -> float`

- [ ] **Step 1: Написать падающий тест**

```js
test("cine light: the grade pulls shadows to night black and keeps highlights; wrap lights the inner edge; key on the graphics side; halo pulse", () => {
  const o = cinePy(`
import numpy as np
g = cine.grade(np.array([[[0, 0, 0], [40, 40, 40], [200, 180, 170], [255, 255, 255]]], np.float32))
m = np.zeros((200, 200), np.float32); m[50:150, 50:150] = 1
rgb = np.full((200, 200, 3), 60, np.float32); bg = np.zeros((200, 200, 3), np.float32); bg[..., 2] = 255
w = cine.wrap(rgb, m, bg)
kR, kL, k0 = cine.key(rgb, m, 1.0), cine.key(rgb, m, -1.0), cine.key(rgb, m, 0.0)
print(json.dumps({"g": g[0].round(1).tolist(), "edge": w[100, 52].tolist(), "centre": w[100, 100].tolist(),
  "kR": [float(kR[100, 147, 0]), float(kR[100, 52, 0])], "kL": [float(kL[100, 52, 0]), float(kL[100, 147, 0])],
  "k0": bool((k0 == rgb).all()), "pulse": [cine.pulse(t, [5.0]) for t in (4.9, 5.0, 5.4, 5.79, 5.8)]}))`);
  const [black, dark, skin, white] = o.g;
  assert.ok(black[2] > black[0] && black[2] > 8 && black[0] < 15, `black → night purple-black ${black}`);
  assert.ok(dark[0] < 40 && dark[2] > dark[0], `dark grey goes darker and purple ${dark}`);
  assert.deepEqual(skin, [200, 180, 170], "light tones are untouched");
  assert.deepEqual(white, [255, 255, 255]);
  assert.ok(o.edge[2] > 120 && o.edge[0] < 61, `the inner edge takes the blue background ${o.edge}`);
  assert.ok(o.centre[2] < 62, `the centre stays ${o.centre}`);
  assert.ok(o.kR[0] > o.kR[1] + 15, `side +1: light on the right edge ${o.kR}`);
  assert.ok(o.kL[0] > o.kL[1] + 15, `side −1: light on the left edge ${o.kL}`);
  assert.equal(o.k0, true, "side 0: no key");
  near(o.pulse[0], 1); near(o.pulse[1], 1); near(o.pulse[2], 1.6); assert.ok(o.pulse[3] > 1 && o.pulse[3] < 1.05); near(o.pulse[4], 1);
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `node --test --test-name-pattern "^cine light" tests/night.test.mjs`
Expected: FAIL — `AttributeError: module 'cine' has no attribute 'grade'`.

- [ ] **Step 3: Дописать `cine.py`**

В шапку после `import numpy as np`:

```python
from PIL import Image, ImageFilter
```

После `FEATHER, FEATHER_IN = …`:

```python
SHADOW_TO = np.array((0x16, 0x10, 0x26), np.float32) / 255     # тени спикера — к ночному фиолетово-чёрному
KEY_LIGHT = np.array((0xD8, 0xCC, 0xFF), np.float32)           # ключ со стороны графики
GRADE_K, WRAP_K, KEY_K = 1.0, 0.6, 0.22
PULSE_K, PULSE_DUR = 0.6, 0.8                                   # вспышка ореола в начале ночного акцента
```

В конец файла:

```python
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
```

- [ ] **Step 4: Запустить — тесты проходят**

Run: `node --test --test-name-pattern "^cine" tests/night.test.mjs`
Expected: PASS, 4 теста.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/wide/cine.py tests/night.test.mjs
git commit -m "Night cine: speaker grade, background light wrap, key from the graphics side, halo pulse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `night_base.py` — кино-режим и `--until`

**Files:**
- Modify: `scripts/ru/wide/night_base.py` (шапка, `night_bg`, `frames`, `grab`, `compose`, новые `punch_cine`, `compose_cine`, `main`)
- Modify: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `cine.load_shots`, `cine.state`, `cine.moving`, `cine.shutter`, `cine.affine`, `cine.card_edges`, `cine.feather`, `cine.grade`, `cine.wrap`, `cine.key`, `cine.pulse`.
- Produces:
  - `night_bg(f, fps_, grain=True)`; `frames(path, fps_, ch=3)`; `grab(path, t, last=False, ch=3)` (ch 4 — RGBA, нужно задаче 4)
  - ctx-ключи кадра: `fps, card, masks, cuts, toggles, accent, back, cine, shots, night_starts`; `ctx["back"](f, bg) -> bg` (в этой задаче — тождество, задача 4 подставит слои)
  - CLI: `--until <секунды>`

- [ ] **Step 1: Написать падающие тесты**

```js
// ---------- night base: кино-режим ----------

function frameRGB(video, n) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, String(r.stderr));
  const w = r.stdout.length / 3 / 1920;
  return (x, y) => { const i = (y * w + x) * 3; return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; };
}

function cineProject(prefix, { fx, shots, dur = 0.4 } = {}) {
  const P = tmp(prefix);
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: dur }] }));
  ff("-f", "lavfi", "-i", `color=c=red:s=1080x1920:r=25:d=${dur}`, "-f", "lavfi", "-i", `sine=f=220:d=${dur}:sample_rate=48000`,
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  const r = py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for i in range(${Math.round(dur * 25)}):
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(r.status, 0, r.stderr);
  if (fx) writeFileSync(join(P, "fx/fx.json"), JSON.stringify(fx));
  if (shots) writeFileSync(join(P, "work/shots.json"), JSON.stringify({ shots }));
  return P;
}
const nb = (P, ...a) => spawnSync("python3", ["scripts/ru/wide/night_base.py", P, ...a], { cwd: ROOT, encoding: "utf8" });
const frameCount = (video) => spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", video], { encoding: "utf8" }).stdout.trim();

test("night_base cine: side-right puts the speaker right and smaller, shots need cine, the grade darkens the speaker", { timeout: 120000 }, () => {
  const P = cineProject("cine1-", { fx: { look: "night", cine: true }, shots: [{ at: 0, shot: "side-right", dur: 0 }] });
  const out = join(P, "renders/picture.base.mp4");
  let r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  let px = frameRGB(out, 5);
  assert.ok(px(900, 1500)[0] > 150 && px(900, 1500)[1] < 70, `speaker on the right ${px(900, 1500)}`);
  assert.ok(px(400, 1500)[0] < 70, `night where mid had the speaker ${px(400, 1500)}`);
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  px = frameRGB(out, 5);
  assert.ok(px(400, 1500)[0] > 150, "without cine work/shots.json is ignored: the speaker stays mid");
  const plain = px(547, 1456)[0];
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night", cine: true }));
  rmSync(join(P, "work/shots.json"));
  r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const graded = frameRGB(out, 5)(547, 1456)[0];
  assert.ok(graded < plain - 15 && graded > 170, `grade ${plain} → ${graded}`);
  assert.match(r.stdout, /кино вкл/);
});

test("night_base cine: a move smears the speaker's edges only while it moves; --until cuts the base", { timeout: 120000 }, () => {
  const P = cineProject("cine2-", { fx: { look: "night", cine: true }, shots: [{ at: 0.08, shot: "side-right", dur: 0.24 }] });
  const out = join(P, "renders/picture.base.mp4");
  const r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const soft = (n) => {                       // half-red pixels on a row: the speaker's edges blended with the night
    const px = frameRGB(out, n); let k = 0;
    for (let x = 150; x < 1060; x++) { const [R, G] = px(x, 1500); if (R - G > 60 && R - G < 170) k++; }
    return k;
  };
  const still = soft(9), moving = soft(3);
  assert.ok(still <= 14, `static edges are sharp: ${still}`);
  assert.ok(moving >= 24, `moving edges are smeared: ${moving}`);
  const u = nb(P, "--until", "0.2"); assert.equal(u.status, 0, u.stderr + u.stdout);
  assert.equal(frameCount(out), "5");
});

test("night_base cine: a non-mid shot in a night accent window stops the run and names the key", { timeout: 60000 }, () => {
  const P = cineProject("cine3-", { fx: { look: "night", cine: true }, shots: [{ at: 0, shot: "close", dur: 0 }] });
  ff("-f", "lavfi", "-i", "color=c=green:s=1080x1920:r=25:d=0.16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/acc.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "a", in: 0.04, out: 0.2, kind: "night", file: "broll/acc.mp4" }] }));
  const r = nb(P);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /окне акцента 0\.04–0\.20.*at 0/);
});
```

- [ ] **Step 2: Запустить — тесты падают**

Run: `node --test --test-name-pattern "^night_base cine" tests/night.test.mjs`
Expected: FAIL — спикер остаётся в `mid` (`speaker on the right …`), `--until` не известен.

- [ ] **Step 3: Шапка и импорт**

В докстринге `night_base.py` заменить строку

```
  python3 scripts/ru/wide/night_base.py <project> [--card] [--mix]  → renders/picture.base.mp4 [+ renders/picture.mp4 со звуком fx/mix.wav]
```

на

```
  python3 scripts/ru/wide/night_base.py <project> [--card] [--mix] [--until 20.66]  → renders/picture.base.mp4 [+ renders/picture.mp4 со звуком fx/mix.wav]
  --until: база только до этого времени чистого таймлайна (кусок ролика)
```

и в конец докстринга (перед закрывающими `"""`) добавить абзац:

```

fx/fx.json "cine": true (только с маской; дизайн docs/superpowers/specs/2026-10-26-night-cine-slice-design.md) — кино-слой
scripts/ru/wide/cine.py: планы спикера из work/shots.json со смазом на проездах, наезды только в mid, грейд, свет фона на
краях, ключ со стороны графики, вспышка ореола на ночных акцентах; зерна в базе нет — его даёт финиш assemble.mjs.
```

После `from common import project, fps, joins, CARD` добавить:

```python
import cine
```

- [ ] **Step 4: `night_bg`, `frames`, `grab` — параметры с прежним поведением по умолчанию**

`night_bg`:

```python
def night_bg(f, fps_, grain=True):
    """ночной фон кадра f: свечение, сетка с плавным дрейфом вверх (доли пикселя — смесь соседних сдвигов), зерно
    (grain=False — без зерна: в кино-режиме его даёт финиш кадра)"""
    off = f / fps_ * DRIFT
    o0, fr = int(off) % GRID_STEP, off - int(off)
    a = (GRID[o0:o0 + H] * (1 - fr) + GRID[o0 + 1:o0 + 1 + H] * fr)[..., None]
    bg = GLOW * (1 - a) + ACCENT_L[None, None] * a
    return bg + np.random.default_rng(f).normal(0, GRAIN, (H, W, 1)).astype(np.float32) if grain else bg
```

В `frames(path, fps_)` — сигнатура `def frames(path, fps_, ch=3):`, в докстринг строка «ch 4 — RGBA (слои с альфой)», в команде ffmpeg `"-pix_fmt", "rgb24"` → `"-pix_fmt", "rgba" if ch == 4 else "rgb24"`, `n, ended = W * H * 3, False` → `n, ended = W * H * ch, False`, `reshape(H, W, 3)` → `reshape(H, W, ch)`.

В `grab(path, t, last=False)` — сигнатура `def grab(path, t, last=False, ch=3):`, `"-pix_fmt", "rgb24"` → `"-pix_fmt", "rgba" if ch == 4 else "rgb24"`, `n = W * H * 3` → `n = W * H * ch`, `reshape(H, W, 3)` → `reshape(H, W, ch)`.

- [ ] **Step 5: `compose` — развилка и место для back-слоёв**

Начало `compose` заменить на:

```python
def compose(fr, f, ctx):
    if ctx.get("cine"): return compose_cine(fr, f, ctx)
    acc, kind = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, ctx["fps"])
    bg = ctx["back"](f, bg)
    if ctx["card"]: return card_over(bg, fr)
```

(остальное тело `compose` без изменений).

- [ ] **Step 6: `punch_cine` и `compose_cine`** — вставить сразу после `compose`:

```python
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
```

- [ ] **Step 7: `main` — флаг, планы, наезды, контекст, `--until`**

После строки `card = "--card" in a` вставить:

```python
    fxp = P / "fx" / "fx.json"
    try: fxj = json.loads(fxp.read_text()) if fxp.is_file() else {}
    except ValueError as e: raise SystemExit(f"fx/fx.json: {e}")
    cin = bool(fxj.get("cine"))
    if cin and card: print("⚠ cine работает только с маской: --card собирается как раньше"); cin = False
    until = None
    if "--until" in a:
        try: until = round(float(a[a.index("--until") + 1]) * F)
        except (IndexError, ValueError): raise SystemExit("--until: нужно время в секундах, например --until 20.66")
```

Блок наездов и контекста (от `accent, win = accents(P, F)` до `cuts = ctx["cuts"]`) заменить на:

```python
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
```

В цикле прохода первой строкой тела:

```python
        for f, fr in enumerate(frames(clean, F)):
            if until is not None and f >= until: break
```

Итоговую строку заменить на:

```python
    print(f"→ {base.relative_to(P.parents[1])} · кадров {n} · {'карточка' if card else 'маска'} · наезды {'—' if card else toggles} · "
          f"акцентов {len(win)} · кино {'вкл' if cin else 'выкл'}" + (f" · планов {len(shots)}" if cin else ""))
```

- [ ] **Step 8: Запустить — новые и прежние тесты night_base проходят**

Run: `node --test --test-name-pattern "night_base" tests/night.test.mjs`
Expected: PASS — три новых и все прежние тесты `night_base` (их путь кадра не менялся).

- [ ] **Step 9: Регрессия без cine — кадры совпадают с `main` байт в байт**

```bash
T=$(mktemp -d); R=${REPO_ROOT}/video-projects; S=$R/2026-10-26-claude-sfx-night
mkdir -p $T/old $T/p/renders $T/p/fx $T/p/work $T/o
git show main:scripts/ru/wide/night_base.py > $T/old/night_base.py; git show main:scripts/ru/wide/common.py > $T/old/common.py
ln -s $S/assets $T/p/assets; ln -s $S/renders/clean.mp4 $T/p/renders/clean.mp4
for f in EDL.json PROBE.json; do ln -s $S/$f $T/p/$f; done
ln -s $S/fx/masks $T/p/fx/masks; ln -s $S/broll $T/p/broll; cp $S/work/accents.json $T/p/work/
python3 $T/old/night_base.py $T/p --stills 1.0,6.0,15.0 && mv $T/p/review/*.png $T/o/
python3 scripts/ru/wide/night_base.py $T/p --stills 1.0,6.0,15.0
for f in $T/o/*.png; do cmp $f $T/p/review/$(basename $f) && echo "same $(basename $f)"; done
```

Expected: три строки `same night-01.00.png`, `same night-06.00.png`, `same night-15.00.png`. Одобренный проект не меняется: стиллы пишутся во временный `$T/p/review`.

- [ ] **Step 10: Commit**

```bash
git add scripts/ru/wide/night_base.py tests/night.test.mjs
git commit -m "Night cine: night_base cine mode — speaker shots with shutter blur, grade and light, punch-ins only in mid; --until

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Слои за спикером (`"layer": "back"`)

**Files:**
- Modify: `scripts/ru/wide/night_base.py` (новые `back_clips`, `backs`; `main`)
- Modify: `scripts/ru/assemble.mjs` (`frontClips`, `composite`, `buildKit`)
- Modify: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `frames(path, fps_, ch)`, `grab(path, t, last, ch)`, ctx-ключ `back` из задачи 3.
- Produces:
  - Python: `back_clips(P, fps_) -> list[(f0, f1, path)]`; `backs(P, fps_, seq=True) -> (over(f, bg) -> bg, win)`
  - JS (`assemble.mjs`): `export const frontClips = (clips = []) => clips.filter((c) => c.layer !== "back")`; `composite()` возвращает `clips` — число клипов поверх спикера

- [ ] **Step 1: Написать падающий тест**

```js
test("night_base: a back clip lies behind the speaker, a missing back file stops the run; assemble does not overlay it again", { timeout: 120000 }, async () => {
  const P = cineProject("back-");
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=0:y=1200:w=1080:h=100:color=0x00FF00@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "broll/back.mov"));
  const clip = { id: "w", in: 0, out: 0.4, kind: "panel", file: "back.mov" };
  const plan = (c) => writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4", clips: [c] }));
  plan({ ...clip, layer: "back" });
  let r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const px = frameRGB(join(P, "renders/picture.base.mp4"), 5);
  assert.ok(px(100, 1250)[1] > 150 && px(100, 1250)[0] < 90, `back clip over the night ${px(100, 1250)}`);
  assert.ok(px(547, 1260)[0] > 170 && px(547, 1260)[1] < 70, `the speaker covers it ${px(547, 1260)}`);

  ff("-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=25:d=0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const back = composite(P, join(P, "work/c-back.mov"));
  assert.equal(back.clips, 0);
  assert.ok(frameRGB(join(P, "work/c-back.mov"), 5)(100, 1250)[1] < 90, "a back clip is already in the base");
  plan(clip);
  composite(P, join(P, "work/c-front.mov"));
  assert.ok(frameRGB(join(P, "work/c-front.mov"), 5)(100, 1250)[1] > 150, "a clip without layer stays in front");

  plan({ ...clip, layer: "back" }); rmSync(join(P, "broll/back.mov"));
  r = nb(P);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /нет файлов back-клипов: broll\/back\.mov/);
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `node --test --test-name-pattern "back clip" tests/night.test.mjs`
Expected: FAIL — `back clip over the night …` (клип не читается базой).

- [ ] **Step 3: `night_base.py` — чтение back-клипов** — вставить перед `def fresh_dir`:

```python
def back_clips(P, fps_):
    """клипы broll/plan.json с "layer": "back" — [(f0, f1, путь)]: они ложатся за спикера (слой .mov с альфой);
    assemble.mjs их пропускает. Нет файла клипа — SystemExit"""
    p = P / "broll" / "plan.json"
    if not p.is_file(): return []
    raw = [c for c in json.loads(p.read_text()).get("clips", []) if c.get("layer") == "back"]
    win = [(round(c["in"] * fps_), round(c["out"] * fps_), P / "broll" / c["file"]) for c in raw]
    gone = sorted({rel(P, path) for _, _, path in win if not path.is_file()})
    if gone: raise SystemExit("broll/plan.json: нет файлов back-клипов: " + ", ".join(gone))
    return win


def backs(P, fps_, seq=True):
    """(функция (f, фон) → фон с back-клипами кадра f поверх по альфе, окна). seq — читать кадры по порядку (проход),
    иначе брать кадр по времени (--stills). Клип короче окна держит последний кадр; back-клипов нет — фон как есть"""
    win = back_clips(P, fps_)
    if not win: return (lambda f, bg: bg), win
    its, last = {}, {}
    def over(f, bg):
        for i, (f0, f1, path) in enumerate(win):
            if not f0 <= f < f1: continue
            if seq:
                if i not in its: its[i] = frames(path, fps_, 4)
                fr = next(its[i], None)
                if fr is not None: last[i] = fr
            else:
                fr = grab(path, (f - f0) / fps_, ch=4)
                if fr is None: fr = grab(path, 0, last=True, ch=4)
                if fr is not None: last[i] = fr
            if i not in last: raise SystemExit(f"{rel(P, path)}: в back-клипе нет кадров")
            a = last[i][..., 3:4].astype(np.float32) / 255
            bg = bg * (1 - a) + last[i][..., :3].astype(np.float32) * a
        return bg
    return over, win
```

В `main` в словаре `ctx` заменить `"back": lambda f, bg: bg,` на `"back": back,`, а строкой выше `ctx = {…}` добавить:

```python
    back, bwin = backs(P, F, seq="--stills" not in a)
```

В итоговую строку `print(…)` после `акцентов {len(win)}` добавить ` · back-клипов {len(bwin)}`.

- [ ] **Step 4: `assemble.mjs` — back-клипы не накладываются**

После функции `loadPlan` добавить:

```js
// Clips over the speaker. "layer": "back" clips are already in the base, behind the speaker (night_base.py).
export const frontClips = (clips = []) => clips.filter((c) => c.layer !== "back");
```

В `composite`: после `const clean = basePicture(project, plan, video);` добавить `const clips = frontClips(plan.clips);`, далее в `composite` заменить `plan.clips.map((c) => c.path)` на `clips.map((c) => c.path)`, `plan.clips.forEach((c, i) => {` на `clips.forEach((c, i) => {`, `return { out, clips: plan.clips.length, captions: existsSync(captions) };` на `return { out, clips: clips.length, captions: existsSync(captions) };`.

В `buildKit`: `plan.clips.forEach((c, i) => {` → `frontClips(plan.clips).forEach((c, i) => {`; строку `kitPlan` заменить на

```js
    const raw = JSON.parse(readFileSync(join(project, "broll/plan.json"), "utf8"));
    const kitPlan = { ...raw, clips: frontClips(raw.clips), video: relative(join(project, "broll"), join(kit, "clean.mp4")) };
```

и `return { kit: relative(ROOT, kit), clips: plan.clips.length };` → `return { kit: relative(ROOT, kit), clips: frontClips(plan.clips).length };`.

- [ ] **Step 5: Запустить — тесты проходят**

Run: `node --test tests/night.test.mjs tests/ru.test.mjs`
Expected: PASS (прежние тесты сборки не меняются: у их клипов нет `layer`).

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/wide/night_base.py scripts/ru/assemble.mjs tests/night.test.mjs
git commit -m "Night cine: back-layer clips go behind the speaker in night_base; assemble overlays only front clips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Финиш кадра в `assemble.mjs`

**Files:**
- Modify: `scripts/ru/assemble.mjs` (константы, `readCine`, `composite`)
- Modify: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `frontClips` из задачи 4.
- Produces: `export const GLOW = { sigma: 10, opacity: 0.7 }`, `export const FINISH = { vignette: "PI/8", grain: 5, seed: 7 }`, `export function readCine(project) -> boolean` (битый `fx/fx.json` → `Error("fx/fx.json: …")`).

- [ ] **Step 1: Написать падающий тест**

```js
// ---------- assemble: финиш кадра ----------

function patch(get, x, y, r = 2) {
  const v = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const p = get(x + i, y + j); v.push((p[0] + p[1] + p[2]) / 3); }
  const mean = v.reduce((a, b) => a + b) / v.length;
  return { mean, std: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) };
}

test("assemble cine finish: glow on night clips only while they play, none on light ones; vignette and grain only with cine; captions stay clean on top", { timeout: 180000 }, async () => {
  const P = tmp("fin-");
  for (const d of ["assets", "renders/kit", "broll", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
  ff("-f", "lavfi", "-i", "color=c=0x808080:s=1080x1920:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=500:y=900:w=80:h=80:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "broll/sq.mov"));
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=1,format=rgba,drawbox=x=100:y=100:w=200:h=100:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "renders/kit/captions.mov"));
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const run = (name, fx, theme) => {
    writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4",
      clips: [{ id: "sq", in: 0.4, out: 0.8, kind: "panel", file: "sq.mov", ...(theme ? { theme } : {}) }] }));
    if (fx) writeFileSync(join(P, "fx/fx.json"), JSON.stringify(fx)); else rmSync(join(P, "fx/fx.json"), { force: true });
    const out = join(P, `work/${name}.mov`);
    composite(P, out);
    return (n) => frameRGB(out, n);
  };
  const A = run("plain"), B = run("cine", { cine: true }), C = run("light", { cine: true }, "light");
  const a5 = A(5), a15 = A(15), b5 = B(5), b15 = B(15), c15 = C(15);
  assert.ok(patch(b15, 586, 940).mean > patch(a15, 586, 940).mean + 15, "glow next to the square while the clip plays");
  assert.ok(Math.abs(patch(b5, 586, 940).mean - patch(a5, 586, 940).mean) < 5, "no glow before the clip");
  assert.ok(Math.abs(patch(c15, 586, 940).mean - patch(a15, 586, 940).mean) < 6, "a light clip gets no glow");
  assert.ok(patch(b5, 40, 40, 4).mean < patch(b5, 540, 960, 4).mean - 20, "vignette with cine");
  assert.ok(Math.abs(patch(a5, 40, 40, 4).mean - patch(a5, 540, 960, 4).mean) < 3, "no vignette without cine");
  assert.ok(patch(b5, 540, 700, 10).std > 1.2, "grain with cine");
  assert.ok(patch(a5, 540, 700, 10).std < 0.8, "no grain without cine");
  const cap = patch(b5, 200, 150, 3);
  assert.ok(cap.mean > 248 && cap.std < 1.5, `captions over the finish stay clean ${cap.mean} ${cap.std}`);
  writeFileSync(join(P, "fx/fx.json"), "{ nope");
  assert.throws(() => composite(P, join(P, "work/x.mov")), /fx\/fx\.json: /);
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `node --test --test-name-pattern "assemble cine finish" tests/night.test.mjs`
Expected: FAIL — `glow next to the square while the clip plays`.

- [ ] **Step 3: Константы и `readCine`** — после `frontClips`:

```js
// fx/fx.json "cine": true — the frame finish (docs/superpowers/specs/2026-10-26-night-cine-slice-design.md): night clips
// get a soft glow (a blurred copy screened over them), the whole frame a vignette and grain; captions go on top, clean.
export const GLOW = { sigma: 10, opacity: 0.7 };
export const FINISH = { vignette: "PI/8", grain: 5, seed: 7 };

export function readCine(project) {
  const p = join(project, "fx/fx.json");
  if (!existsSync(p)) return false;
  try { return JSON.parse(readFileSync(p, "utf8")).cine === true; }
  catch (e) { throw new Error(`fx/fx.json: ${e.message}`); }
}
```

- [ ] **Step 4: `composite` — свечение клипов и финиш до субтитров**

После `const clips = frontClips(plan.clips);` добавить `const cine = readCine(project);`. Цикл `clips.forEach` заменить на:

```js
  clips.forEach((c, i) => {
    const k = i + 1, en = `enable='between(t,${c.in},${c.out})'`;
    const src = `[${k}:v]scale=${W}:${H},format=yuva444p,tpad=stop_mode=clone:stop_duration=30`;
    if (!(cine && c.theme !== "light" && c.glow !== false)) {
      f.push(`${src},setpts=PTS-STARTPTS+${c.in}/TB[c${k}]`);
      f.push(`[${last}][c${k}]overlay=0:0:${en}:eof_action=pass[b${k}]`);
    } else {
      // glow: the clip blurred (alpha premultiplied, black where it is empty), padded with black up to its start,
      // screened over the frame while the clip plays; shortest=1 keeps the base's length
      f.push(`${src},split[s${k}][h${k}]`, `[s${k}]setpts=PTS-STARTPTS+${c.in}/TB[c${k}]`,
        `[h${k}]format=gbrap,premultiply=inplace=1,format=gbrp,gblur=sigma=${+(GLOW.sigma * scale).toFixed(2)},setpts=PTS-STARTPTS,tpad=start_duration=${c.in}:color=black[g${k}]`,
        `[${last}][c${k}]overlay=0:0:${en}:eof_action=pass,format=gbrp[o${k}]`,
        `[o${k}][g${k}]blend=all_mode=screen:all_opacity=${GLOW.opacity}:shortest=1:${en},format=yuva444p[b${k}]`);
    }
    last = `b${k}`;
  });
  if (cine) {
    f.push(`[${last}]format=yuv444p,vignette=angle=${FINISH.vignette},noise=c0s=${FINISH.grain}:c0f=t:all_seed=${FINISH.seed},format=yuva444p[fin]`);
    last = "fin";
  }
```

Без `cine` строки фильтра те же, что раньше (`src` + `setpts` и `overlay` с тем же `enable`).

- [ ] **Step 5: Запустить — тесты проходят**

Run: `node --test tests/night.test.mjs tests/ru.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/assemble.mjs tests/night.test.mjs
git commit -m "Night cine: frame finish in assemble — glow on night clips, vignette and grain before captions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `terminal.fs` в `object-scene.js`

**Files:**
- Modify: `scripts/ru/broll/object-scene.js` (шапка — контракт `terminal`; блок `if (cfg.terminal)`)
- Modify: `tests/night.test.mjs`

**Interfaces:**
- Produces: `OK.run({… terminal: {x, y, w, h, title, tin, fs, lines}})` — `fs` (px) задаёт код `fs`, строку `round(fs·1,54)`, заголовок `round(fs·0,9)`, каретку `round(fs·0,54)` × `round(fs·1,15)`; без `fs` — 26/40, заголовок 30, каретка 14×30.

- [ ] **Step 1: Написать падающий тест**

```js
test("object scene terminal: fs sets the code size, line height, title and caret; without fs the old 26/40", { timeout: 60000 }, async () => {
  const term = (fs) => scene({ T: 2, mode: "panel", theme: "night", terminal: { x: 40, y: 340, w: 1000, h: 560, title: "агент",
    ...(fs ? { fs } : {}), tin: -0.2, lines: [{ t: 0.2, text: "curl x", kind: "cmd", dur: 0.3 }] } });
  const st = () => {
    const b = getComputedStyle(document.getElementById("ok-term")), car = getComputedStyle(document.querySelector("#ok-row-0 .okcar"));
    return [b.fontSize, b.lineHeight, getComputedStyle(document.querySelector("#ok-term > div:first-child")).fontSize, car.width, car.height];
  };
  const big = await openClip(term(34));
  try {
    assert.deepEqual(await big.at(1.0, st), ["34px", "52px", "31px", "18px", "39px"]);
    assert.deepEqual(big.errors, []);
  } finally { await big.browser.close(); }
  const small = await openClip(term(0));
  try {
    assert.deepEqual(await small.at(1.0, st), ["26px", "40px", "30px", "14px", "30px"]);
  } finally { await small.browser.close(); }
});
```

- [ ] **Step 2: Запустить — тест падает**

Run: `node --test --test-name-pattern "fs sets the code size" tests/night.test.mjs`
Expected: FAIL — `["26px", "40px", "30px", "14px", "30px"]` вместо `["34px", …]`.

- [ ] **Step 3: Реализация**

В шапке строку контракта

```
     terminal:{x, y, w, h, title, tin:-1, lines:[{t, text, kind:'cmd'|'out'|'ok', dur:0.55}]},   «живой интерфейс»
```

заменить на

```
     terminal:{x, y, w, h, title, tin:-1, fs:26, lines:[{t, text, kind:'cmd'|'out'|'ok', dur:0.55}]},   «живой интерфейс»;
                                                fs: code px (line 1.54·fs, title 0.9·fs, caret to match); no fs — 26/40
```

В блоке `if (cfg.terminal)` после `Object.assign(box.style, {left: …});` добавить:

```js
    if (c.fs) Object.assign(box.style, {fontSize: c.fs + 'px', lineHeight: Math.round(c.fs * 1.54) + 'px'});   // big code: the cine slice
```

строку заголовка заменить на:

```js
    const head = el('', box); head.textContent = c.title || ''; Object.assign(head.style, {color: TH.dim, fontSize: (c.fs ? Math.round(c.fs * 0.9) : 30) + 'px', marginBottom: '8px'});
```

строку каретки — на:

```js
      const tx = el('okx', r, 'span'); const car = el('okcar', r, 'span'); car.style.background = TH.on;
      if (c.fs) Object.assign(car.style, {width: Math.round(c.fs * 0.54) + 'px', height: Math.round(c.fs * 1.15) + 'px', verticalAlign: -Math.round(c.fs * 0.19) + 'px'});
```

- [ ] **Step 4: Запустить — тесты терминала проходят**

Run: `node --test --test-name-pattern "terminal" tests/night.test.mjs`
Expected: PASS — новый тест и прежний `object scene terminal: the command types…`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Night cine: object-scene terminal.fs for big code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `SETUP.md` и полный прогон тестов

**Files:**
- Modify: `SETUP.md`

- [ ] **Step 1: Таблица `fx/fx.json`** — после строки `look` добавить:

```
| `cine` | кино-слой ночного стиля (пробуется на куске claude-sfx): планы из `work/shots.json` — `close` (крупный), `mid`, `side-left` / `side-right` («ведущий» сбоку, меньше), проезд 0,6 с со смазом, под полным клипом `dur: 0`; грейд и свет на краях; свечение ночных клипов (`"glow": false` у клипа в `broll/plan.json` — без него), виньетка и зерно на весь кадр. Только с маской; в окне акцента — только `mid` | нет |
```

- [ ] **Step 2: Строка `night_base.py` в таблице команд** — в первой ячейке после `--allow-missing — не останавливаться, если больше 5 % кадров без своей маски` добавить `; --until 20.66 — база только до этого времени (кусок)`, во второй ячейке после `на светлом за тобой мягкая тень)` добавить `; клипы broll/plan.json с "layer": "back" — за тобой`. Все вставки — в обратных кавычках, как соседние.

- [ ] **Step 3: Полный прогон**

Run: `npm test`
Expected: PASS, без пропусков и ошибок.

- [ ] **Step 4: Commit**

```bash
git add SETUP.md
git commit -m "SETUP: cine, work/shots.json, back-layer clips, glow opt-out, night_base --until

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Кусок claude-sfx 0–20,66 с в «кино» (главная сессия)

**Files (вне git):** `video-projects/2026-10-26-claude-sfx-cine/` — `broll/gen.mjs`, `fx/fx.json`, `PLAN.json`, клипы, рендеры, `review/`, `REVIEW.md`.

Все команды — из worktree:

```bash
cd ${REPO_ROOT}/.claude/worktrees/night-cine-slice
R=${REPO_ROOT}/video-projects
S=$R/2026-10-26-claude-sfx-night; N=$R/2026-10-26-claude-sfx-cine
```

- [ ] **Step 1: Проект куска (симлинки, одобренные проекты не меняются)**

```bash
mkdir -p $N/assets $N/renders $N/fx $N/work $N/broll/clips $N/review
for f in raw.mp4 gsap.min.js; do ln -s ../../2026-10-25-claude-sfx/assets/$f $N/assets/$f; done
ln -s ../../2026-10-25-claude-sfx/renders/clean.mp4 $N/renders/clean.mp4
for f in transcript.clean.json EDL.json PROBE.json; do ln -s ../2026-10-25-claude-sfx/$f $N/$f; done
ln -s ../../2026-10-25-claude-sfx/fx/masks $N/fx/masks
ln -s ../2026-10-26-claude-sfx-night/screens $N/screens
cp $S/meta.json $S/PLAN.json $N/ && cp $S/fx/mix.wav $N/fx/mix.wav
cp $S/broll/02-acc.mp4 $S/broll/04-ov.mp4 $S/broll/06-count.mp4 $N/broll/
echo '{"look": "night", "cine": true}' > $N/fx/fx.json
ls -L $N/renders/clean.mp4 $N/fx/masks/00000.png $N/screens/rects-dark.json $N/screens/grid/00001.jpg
```

Expected: все четыре пути печатаются без ошибок.

- [ ] **Step 2: `$N/broll/gen.mjs`**

```js
// claude-sfx · ночь · кино (дизайн docs/superpowers/specs/2026-10-26-night-cine-slice-design.md): кусок 0–20,66 с —
// планы спикера (work/shots.json), стена анимаций за головой в хуке (layer back), крупные окна и предметы под план.
// Основа — одобренный video-projects/2026-10-26-claude-sfx-night/broll/gen.mjs: 02, 04 и 06 те же (их рендеры
// скопированы), там же правила стыков.
//   node <project>/broll/gen.mjs <project>   → broll/clips/*.html, broll/plan.json, work/accents.json, work/shots.json, PLAN.json motion
// Времена — секунды чистого таймлайна (transcript.clean.json); в клипе — минус in. Тексты терминала, числа — настоящие
// (ответ Openverse API от 2026-10-25; строки укорочены, факты те же).
import fs from "node:fs";
import path from "node:path";

const P = process.argv[2];
const words = JSON.parse(fs.readFileSync(path.join(P, "transcript.clean.json"), "utf8")).words.filter((w) => (w.type ?? "word") === "word");
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const W = (word, after = 0) => {
  const w = words.find((x) => x.start >= after - 1e-6 && norm(x.text) === norm(word));
  if (!w) throw new Error(`no word «${word}» after ${after}`);
  return w.start;
};
const R = JSON.parse(fs.readFileSync(path.join(P, "screens/rects-dark.json"), "utf8"));
const S = (f) => `../../screens/${f}`;
const clips = [], accents = [], motion = [];
fs.mkdirSync(path.join(P, "broll/clips"), { recursive: true });

// extra: theme — светлый клип; layer: "back" — клип за спикером (night_base); glow: false — без свечения финиша;
// css — стиль фрагмента (#stage)
function clip(id, tin, tout, kind, run, cfg, extra = {}) {
  const T = +(tout - tin).toFixed(3), L = (t) => +(t - tin).toFixed(3);
  const css = extra.css ? `<style>${extra.css}</style>\n` : "";
  fs.writeFileSync(path.join(P, "broll/clips", id + ".html"), `<title>${id}</title>\n${css}<script>\n${run}(${JSON.stringify({ T, ...cfg(L) })});\n</script>\n`);
  const file = `${id}.${kind === "panel" ? "mov" : "mp4"}`;
  if (kind === "accent") accents.push({ id, in: tin, out: tout, kind: extra.theme === "light" ? "light" : "night", file: `broll/${file}` });
  else clips.push({ id, title: id, in: tin, out: tout, kind, file, ...(extra.theme ? { theme: extra.theme } : {}),
    ...(extra.layer ? { layer: extra.layer } : {}), ...(extra.glow === false ? { glow: false } : {}) });
}
const mv = (verb, word, after, what, at) => motion.push({ at: at ?? +W(word, after).toFixed(2), word, verb, what });
const crop = (r, cw = 1320) => {
  const ch = Math.round(cw * 476 / 1000);
  return [Math.min(2880 - cw, Math.max(0, Math.round(r[0] + r[2] / 2 - cw / 2))), Math.min(1800 - ch, Math.max(0, Math.round(r[1] + r[3] / 2 - ch / 2))), cw];
};

// планы спикера: крупный на хуке → «ведущий» справа на «этот рилс» → mid к ночному акценту → «ведущий» слева на
// «Поэтому»; под полными клипами 04 и 06 — рез
const shots = [
  { at: 0, shot: "close", dur: 0 },
  { at: 2.45, shot: "side-right" },
  { at: +W("Но", 4).toFixed(2), shot: "mid" },
  { at: +W("Поэтому", 8.9).toFixed(2), shot: "side-left" },
  { at: 12.5, shot: "side-right", dur: 0 },
  { at: 18.0, shot: "mid", dur: 0 },
];

// 01 · стена за головой (back): 20 анимаций из рилса claude-animations, приглушена; уходит, когда спикер едет вправо
clip("01-wall", 0, 2.95, "panel", "SK.run", (L) => ({
  mode: "light", theme: "night", tin: -1, tout: L(2.45),
  win: { x: 540, y: 380, w: 1000, h: 700, tin: -1 },
  media: { grid: { frames: S("grid"), from: 0.02, url: "мой рилс · 20 анимаций в Claude" } },
  shots: [[0, "grid", [240, 0, 1320], "cut"]],
}), { layer: "back", css: "#stage{opacity:.55}" });

// 01 · хук: титр с кадра 0 (обложка, крупный план); на «этот рилс» — окно 1000×620 с терминалом этого рилса над головой;
// окно уходит на «Но», перед акцентом — один спикер
clip("01-hook", 0, 4.9, "panel", "SK.run", (L) => ({
  mode: "light", theme: "night", tin: -1, tout: L(W("Но", 4)),
  title: { l1: "Claude делает", l2: "моушн-графику", y: 200, tin: -1 },
  win: { x: 540, y: 380, w: 1000, h: 620, tin: L(2.45) },
  media: { grid: { frames: S("grid"), from: 0.02, url: "мой рилс · 20 анимаций в Claude" }, term: { frames: S("term"), from: 0, url: "Claude Code" } },
  shots: [[0, "grid", [240, 0, 1320], "cut"], [L(2.45), "term", [0, 60, 1200], "cut"]],
}));
mv("live", "этот", 2, "спикер уезжает вправо, над головой — терминал этого рилса");

// 02 · ночной акцент «не слышит звук… вслепую» — как в одобренном (рендер скопирован)
clip("02-acc", 5.52, 8.97, "accent", "OK.run", (L) => ({
  mode: "full", theme: "night", bg: { zoom: [0, 3.45, 1.5] },
  words: [{ text: "не слышит", font: "display", size: 150, y: 1000, t: L(5.80) },
    { text: "звук", font: "serif", size: 112, y: 830, t: L(6.40), color: "#B79CFF" }],
  line: { y: 1092, t: L(6.10), w: 560 },
}));

// 03 · три инструмента крупнее (агент 240, инструменты 230), спикер «ведущий» слева
const tools = [["db", "database", 220, "Openverse"], ["tt", "turntable", 540, "Real SFX"], ["sp", "speaker", 860, "earshot"]];
clip("03-tools", 8.70, 12.02, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "02 — решение", l1: "3 бесплатных", l2: "инструмента", y: 170, tin: L(W("три", 9)) },
  items: [{ id: "ag", kind: "agent", x: 540, y: 540, size: 240, tin: L(W("Поэтому", 9)), label: { text: "агент", dy: 40 } },
    ...tools.map(([id, kind, x, label], i) => ({ id, kind, x, y: 880, size: 230, tin: L(W("бесплатных", 9)) + i * 0.12,
      label: { text: label }, check: L(W("исправляют", 11)) + i * 0.1,
      ...(id === "db" ? { active: [[L(11.70), 1]], states: [[L(11.70), { open: 1 }]] } : {}) }))],
  links: tools.map(([id], i) => ({ from: "ag", to: id, tin: L(W("инструмента", 10)) + i * 0.08, dur: 0.45 })),
  fly: { id: "db", t: L(11.70), dur: 0.32 },
}));
mv("materialize", "Поэтому", 8.9, "агент проявляется из призрака");
mv("chapter", "три", 9.5, "глава «02 — решение»: 3 бесплатных инструмента");
mv("materialize", "бесплатных", 9.8, "три предмета-чертежа");
mv("tree", "инструмента", 10, "связи от агента к инструментам");
mv("active", "исправляют", 11, "галочки, база Openverse загорается");
mv("fly", "исправляют", 11, "камера влетает в базу — следующая сцена", 11.70);

// 04 · 🎧 Openverse на GitHub с линзой — как в одобренном (рендер скопирован)
const d = R.desc, [cx, cy, cw] = crop(d);
clip("04-ov", 11.95, 13.98, "full", "SK.run", (L) => ({
  mode: "dark", theme: "night", tin: 0,
  title: { idx: "01 — инструмент", l1: "Инструмент 1", l2: "Openverse API", y: 470, tin: -0.25 },
  win: { x: 540, y: 700, w: 1000, h: 528, tin: -0.1, enter: "fly" },
  media: { ov: { src: S("gh-ov-dark.png"), url: "github.com/WordPress/openverse" } },
  shots: [[0, "ov", [cx, cy, cw], "cut"]],
  marks: [{ kind: "lens", keys: [[L(12.60), d[0] + 70, d[1] + d[3] / 2], [L(13.50), d[0] + d[2] - 70, d[1] + d[3] / 2]],
    r: 120, zoom: 1.8, t0: L(12.55), t1: L(13.95) }],
}));
mv("lens", "Openverse", 12.3, "линза идёт по описанию проекта на GitHub", 12.60);

// 05 · живой терминал 1000 px, код 34 px, строки короче; ключ API крупнее в правом нижнем углу, зачёркивается на «без»
const Q = 'curl "api.openverse.org/v1/audio/?q=whoosh"';
clip("05-ovapi", 13.98, 17.0, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "01 — Openverse API", l1: "Ищет и качает", l2: "без ключа", y: 170, tin: -0.15 },
  terminal: { x: 40, y: 340, w: 1000, h: 560, fs: 34, title: "агент · запрос к Openverse API", tin: -0.2, lines: [
    { t: L(W("там", 14)), text: Q, kind: "cmd", dur: 0.55 },
    { t: L(15.12), text: "200 OK · 240 результатов", kind: "ok" },
    { t: L(15.18), text: "Deep Whoosh #1          CC0 · 3,2 с", kind: "out" },
    { t: L(15.24), text: "Swosh swoosh whoosh…    CC0 · 0,5 с", kind: "out" },
    { t: L(15.30), text: "Swipe Whoosh            CC0 · 0,4 с", kind: "out" },
    { t: L(W("скачивает", 15)), text: "↓ deep-whoosh-1.mp3 · 68 КБ · готово", kind: "ok" }] },
  items: [{ id: "key", kind: "key", x: 880, y: 870, size: 200, tin: L(W("даже", 15)), states: [[L(W("без", 16)), { struck: 1 }, 0.35]] }],
}));
mv("live", "там", 14.3, "терминал печатает запрос к Openverse API");
mv("physics", "без", 16, "ключ API зачёркивается");

// 06 · 🎧 светлая врезка со счётчиком — как в одобренном (рендер скопирован)
clip("06-count", 16.95, 20.66, "full", "OK.run", (L) => ({
  mode: "full", theme: "light", bg: { flip: [-0.08, 0.3] },
  chapter: { idx: "01 — Openverse API", l1: "В Openverse", l2: "звуки и треки", y: 420, tin: 0.15 },
  counter: { t: L(W("пяти", 17)), to: 5220123, label: "аудио с открытой лицензией", y: 760, dur: 1.4 },
  items: [{ id: "db", kind: "database", x: 540, y: 1180, size: 230, tin: 0.3, ghost: false,
    active: [[L(W("открытой", 19)), 1]], states: [[L(W("открытой", 19)), { open: 1 }]] }],
}), { theme: "light" });
mv("active", "открытой", 19, "база загорается на светлой врезке");

fs.writeFileSync(path.join(P, "broll/plan.json"), JSON.stringify({ title: "claude-sfx · ночь · кино", video: "../renders/picture.mp4", fps: 25, clips }, null, 1));
fs.writeFileSync(path.join(P, "work/accents.json"), JSON.stringify({ accents }, null, 1));
fs.writeFileSync(path.join(P, "work/shots.json"), JSON.stringify({ shots }, null, 1));
const planPath = path.join(P, "PLAN.json"), PL = JSON.parse(fs.readFileSync(planPath, "utf8"));
PL.motion = motion.sort((a, b) => a.at - b.at);
fs.writeFileSync(planPath, JSON.stringify(PL, null, 1));
console.log(`${clips.length} clips, ${accents.length} accent, ${shots.length} shots, ${motion.length} motion entries → broll/plan.json, work/accents.json, work/shots.json, PLAN.json`);
```

Run: `node $N/broll/gen.mjs $N && for c in 02-acc 04-ov 06-count; do cmp $N/broll/clips/$c.html $S/broll/clips/$c.html && echo "same $c"; done`
Expected: `6 clips, 1 accent, 6 shots, 11 motion entries → …` и три строки `same …`. Если какой-то `cmp` отличается — этот клип рендерится заново в шаге 4 (`.mp4`).

- [ ] **Step 3: Субтитры под планы** — `PLAN.json` проекта:

```bash
python3 - $N/PLAN.json <<'EOF'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); c = d["captions"]
c["kinetic"]["y_keys"] = [{"at": 0, "y": 1100}, {"at": 4.35, "y": 1100}, {"at": 4.37, "y": 960}, {"at": 9.23, "y": 960},
    {"at": 9.25, "y": 1100}, {"at": 11.93, "y": 1100}, {"at": 11.95, "y": 1310}, {"at": 13.96, "y": 1310},
    {"at": 13.98, "y": 1100}, {"at": 16.93, "y": 1100}, {"at": 16.95, "y": 1310}, {"at": 20.66, "y": 1310}]
c["hide"] = [{"in": 0, "out": 2.45}, {"in": 5.52, "out": 8.97}]
json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
print("PLAN.json: y_keys", len(c["kinetic"]["y_keys"]), "· hide", c["hide"])
EOF
node scripts/ru/motion-check.mjs $N
```

Expected: `y_keys 12 · hide [...]`; `motion-check` печатает `PASS · глаголов 8, светлых акцентов 1 → MOTION.md` (светлое окно — 06-count).

- [ ] **Step 4: Глифы, сборка и рендер новых клипов**

```bash
for f in $N/broll/clips/*.html; do node scripts/ru/check-glyphs.mjs --font brand/fonts/GolosText-Variable.ttf --font brand/fonts/Spectral-SemiBoldItalic.ttf \
  --font brand/fonts/IBMPlexMono-Medium.ttf --font brand/fonts/Spectral-ExtraBold.ttf --html $f; done
python3 scripts/ru/broll/build.py $N/broll/dist $N/broll/clips/*.html
time (for c in 01-wall 01-hook 03-tools 05-ovapi; do NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/render.js $N/broll/dist/$c.html $N/broll/$c.mov 25; done)
B="NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/beats.js"
eval $B $N/broll/dist/01-wall.html $N/review/01w-beats.png 0.3 2.0 2.7
eval $B $N/broll/dist/01-hook.html $N/review/01-beats.png 0.3 2.6 3.2 4.2
eval $B $N/broll/dist/03-tools.html $N/review/03-beats.png 0.4 1.3 2.0 2.9 3.15
eval $B $N/broll/dist/05-ovapi.html $N/review/05-beats.png 0.3 1.0 1.5 2.5 2.9
```

Expected: глифы без ошибок; каждый рендер печатает `rendered … frames` без `ERR`; время записать. Листы beats открыть (Read) и проверить:

- 01-hook: в окне видны строки терминала, код крупнее, чем в одобренном (камера 1200 px); последние строки не срезаны — иначе подвинуть `[0, 60, 1200]` по y (до `[0, 170, 1200]`);
- 01-wall: стена занимает 380–1080, приглушена, сетка анимаций различима;
- 03-tools: агент не касается главы (низ строки `l2` ≈ 300), подписи инструментов ≤ y 950, ничего за x 1000;
- 05-ovapi: строки помещаются в окно, ключ не лезет на строки.

Найденное поправить в `gen.mjs`, повторить шаги 2 и 4 для затронутого клипа.

- [ ] **Step 5: Субтитры**

Run: `node scripts/ru/make-captions.mjs $N --render`
Expected: `renders/kit/captions.mov` создан; в 0–2,45 и 5,52–8,97 субтитров нет.

- [ ] **Step 6: База — сначала стиллы, потом проход до 20,66 с**

```bash
python3 scripts/ru/wide/night_base.py $N --stills 0.5,2.2,2.6,3.2,4.5,6.0,9.15,10.5,15.0
```

Открыть `review/night-*.png` (Read) и проверить:

- 0,5 и 2,2: крупный план, стена за головой, голова перекрывает низ стены, лицо не мыльное (иначе `close` 1,38 → 1,30 в `cine.py` — правка кода: тест и отдельный коммит);
- 2,6 (проезд): смаз есть, «призраков» и дыр нет; 3,2: «ведущий» справа, левый край карточки растушёван, прямого среза плеча не видно;
- 4,5: возврат в `mid`, наезда-скачка нет; 6,0: акцент, слово за головой, ореол ярче обычного;
- 9,15 и 10,5: «ведущий» слева, правый край растушёван; ключ светит справа узкой полосой, а не заливкой лица;
- везде: свет фона на краях — тонкий фиолетовый, лицо не выбелено.

Потом полный проход:

```bash
time python3 scripts/ru/wide/night_base.py $N --until 20.66 --mix
```

Expected: `кадров 517 · маска · … · кино вкл · планов 6`; `renders/picture.mp4` создан; время записать.

- [ ] **Step 7: Сборка, ×1,1, «было | стало»**

```bash
node scripts/ru/assemble.mjs $N --final; ls -la $N/renders/final.mp4
node scripts/ru/speed-variant.mjs $N --factor 1.1
cp $N/renders/final.mp4 $N/renders/slice.mp4 && cp $N/renders/final.x1.1.mp4 $N/renders/slice.x1.1.mp4
python3 - $N/review <<'EOF'
import sys, pathlib
from PIL import Image, ImageDraw, ImageFont
d = pathlib.Path(sys.argv[1]); f = ImageFont.truetype("brand/fonts/GolosText-Variable.ttf", 34)
for name, text in (("lbl-old.png", "было"), ("lbl-new.png", "стало")):
    im = Image.new("RGBA", (150, 58), (0, 0, 0, 150)); ImageDraw.Draw(im).text((18, 8), text, font=f, fill=(255, 255, 255, 255)); im.save(d / name)
EOF
ffmpeg -v error -y -i $S/renders/slice.mp4 -i $N/renders/slice.mp4 -i $N/review/lbl-old.png -i $N/review/lbl-new.png -filter_complex \
  "[0:v]scale=540:960,setsar=1[a0];[a0][2:v]overlay=16:16[a];[1:v]scale=540:960,setsar=1[b0];[b0][3:v]overlay=16:16[b];[a][b]hstack=inputs=2[v]" \
  -map "[v]" -map 1:a -c:v libx264 -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest $N/review/compare.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 $N/renders/slice.mp4 $N/review/compare.mp4
```

Expected: `final.mp4` есть (`check-reel` может ругаться на длительность — у нас кусок, это не ошибка куска); `slice.mp4` ≈ 20,66 с, `slice.x1.1.mp4` ≈ 18,8 с, `compare.mp4` ≈ 20,66 с. В `drawtext` нет нужды: в этой сборке ffmpeg его нет, подписи — картинками.

- [ ] **Step 8: Самопроверка кадров** (до трёх кругов правок)

```bash
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/sheet.png --every 1 --cols 7
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/move-hook.png --from 2.35 --to 3.2 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/move-mid.png --from 4.3 --to 5.1 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/acc.png --from 5.4 --to 6.3 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/move-tools.png --from 8.95 --to 9.8 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/cut-term.png --from 13.85 --to 14.4 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/flip.png --from 16.8 --to 17.5 --every 0.08
ffmpeg -v error -y -i $N/renders/slice.mp4 -vf scale=540:960 -frames:v 1 -ss 15.5 $N/review/phone-term.png
```

Открыть каждый лист (Read) и проверить, записывая находки в `$N/REVIEW.md`:

- кадр 0 — обложка: крупное лицо, глаза открыты, титр и стена на месте;
- проезды (2,45; 4,37; 9,01): плавные, со смазом, без рывка наезда на старте и в конце, без прямого среза плеча;
- рез под полным клипом (13,98): спикер сразу справа, без кадра в `mid`;
- стыки 5,52, 8,97, 11,95, 13,98, 16,95: нет чёрных, пустых и двойных кадров;
- свечение графики: линии мягко светятся, скриншот GitHub (04) не мутный — иначе у 04-ov в `gen.mjs` последним аргументом `clip(…)` дописать `{ glow: false }` (поле попадёт в `broll/plan.json`), повторить шаг 2 и шаги 7–8 (клипы и база не меняются);
- субтитры ни на одном кадре не на лице и не на окне; на 06 — тёмные;
- `phone-term.png` (540×960): код терминала читается.

Найденное исправить в `gen.mjs` или в коде (тест + отдельный коммит), пересобрать затронутое, повторить шаги 6–8.

`REVIEW.md` содержит: таблицу планов (время, слово, план), что проверено и что исправлено, время рендера (клипы, база, сборка, ×1,1), строку «Звук взят из одобренного финала без изменений. Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

---

### Task 9: Показ заказчику

- [ ] **Step 1:** `SendUserFile`: `$N/review/compare.mp4` («было | стало») и `$N/renders/slice.mp4`; путь к `slice.x1.1.mp4` — в тексте.
- [ ] **Step 2:** Сообщение (коротко, по-русски): что в куске по секундам (крупный план и стена → «ведущий» справа с терминалом → `mid` и акцент со вспышкой → «ведущий» слева с инструментами → Openverse → крупный терминал → светлый счётчик); что общее (грейд, свет на краях, свечение графики, зерно, виньетка); одна-две строки из `REVIEW.md`; время рендера; строка «Звук взят из одобренного финала без изменений. Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».
- [ ] **Step 3:** Один вопрос: «Ок по куску или правки?» Правки — применить, пересобрать затронутое, показать снова. На «ок» — записать слова заказчика в `lessons.md` основной папки (формат файла) и предложить следующий шаг отдельным планом: весь claude-sfx в «кино» и `cine` по умолчанию в remake-fast (скиллы, `brand.md`, раскадровка планов в S3).
