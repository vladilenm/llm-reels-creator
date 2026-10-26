# Ночной интерфейс и предметы-чертежи — план работ, шаг 1 (кусок claude-sfx)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** собрать первые 20,66 с claude-sfx в ночном стиле — ночная база с маской, окна и титры в теме night, сцена с предметами-чертежами, ночной и светлый акценты, живой терминал — и показать заказчику.

**Architecture:** три новых модуля и две правки. `object-kit.js` рисует изометрические предметы из примитивов, `object-scene.js` (`OK.run`) расставляет их в кадре и двигает глаголами; оба встраиваются в клипы тем же `build.py`, что и `screen-kit.js`, и рендерятся тем же движком motion-broll. `screen-kit.js` получает тему `night`. `night_base.py` собирает базу картинки: код рисует ночной фон, спикер ложится по маскам Vision, в окнах акцентов фон заменяется слоем акцента. Кусок собирается в отдельном проекте рядом с одобренным claude-sfx — его файлы не трогаем.

**Tech Stack:** браузерный JS на движке motion-broll (`M.scene`, чистые функции `t`), Playwright (рендер и тесты), Python 3.9 + numpy + Pillow + ffmpeg, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md`.

**Что не входит в этот план (шаг 2 и 3 спеки — отдельный план после «ок» на кусок):** остальные ~24 предмета, глаголы «вытягивание», «слои», «сборка из сетки», «перестройка», «физика предмета» (папка с падающими файлами), «выноски», «возврат», «морф значка», «строка ввода», светлый акцент со спикером поверх, весь claude-sfx, умолчания в remake-fast и документы. Последняя задача этого плана — написать тот план.

## Global Constraints

- Цвета: `#0E0B14` (фон), `#B79CFF` (accent_light, линии), `#7C3AED` (accent), `#F5F3FA` (ink), `#EFEDF4` (canvas), `#17141C` (тёмная линия на светлом). Тёмное стекло — `#1A1428`, `#221B33`, `#2C2342`.
- Линии предметов и рамок — не тоньше 3 px на кадре 1080 (`vector-effect: non-scaling-stroke`); подписи — не мельче 30 px.
- Тайминг: входы expo-out 0,6–0,9 с, выходы 0,3–0,4 с, без пружин с отскоком. Каждая смена состояния — на своё слово (время из `transcript.clean.json`).
- Безопасная зона: значимое в y 360–1420, x ≤ 960; для OBS-раскладки верх — от y 200 (уроки replica и claude-sfx).
- Шрифты только с кириллицей: `SK Sans` (Golos Text), `SK Serif` (Spectral SemiBold Italic), `SK Mono` (IBM Plex Mono), `SK Display` (Spectral ExtraBold). Перед рендером — `scripts/ru/check-glyphs.mjs`.
- Каждый стиль клипа — чистая функция `t`: без CSS-переходов, таймеров и состояния между кадрами (контракт движка).
- Одобренный проект `video-projects/2026-10-25-claude-sfx/` не меняется: кусок собирается в `video-projects/2026-10-26-claude-sfx-night/` (симлинки на исходники).
- Только правда на экране: числа, ответы API и названия — из исходного проекта (`screens/make-screens.mjs` claude-sfx, ответы от 2026-10-25).
- Новых зависимостей нет (Playwright, sharp, numpy, Pillow уже стоят).
- Тесты: новый файл `tests/night.test.mjs`, запуск `node --test tests/night.test.mjs`; в конце `npm test` зелёный.
- Коммит каждой задачи — только её файлы, сообщение заканчивается `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Каждый отчёт со звуком заканчивается строкой «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

## Карта файлов

| Файл | Что делает |
|---|---|
| `scripts/ru/broll/build.py` (правка) | встраивает `object-kit.js` и `object-scene.js` рядом с screen-kit, шрифт `SK Display` |
| `scripts/ru/broll/object-kit.js` (новый) | изометрия, примитивы (коробка, цилиндр, диск, многоугольник), темы night/light, 6 предметов с подвижными частями |
| `scripts/ru/broll/object-scene.js` (новый) | `OK.run`: фон (сетка, свечение, наезд, шторка), глава, предметы (материализация, активный пункт, галочка), связи, пролёт, слова акцента, линия, счётчик, живой терминал |
| `scripts/ru/broll/screen-kit.js` (правка) | тема `night`: титр без плашки со шторкой и индексом главы, стеклянное окно с прорисовкой рамки, свет по краю, вход `fly`, линза, ночные подсветка и счётчик |
| `scripts/ru/make-captions.mjs` (правка) | `kinetic.theme_default` — тема субтитров по умолчанию |
| `scripts/ru/wide/night_base.py` (новый) | ночная база OBS-дубля: фон кодом, спикер по маске с контровым светом, слои акцентов, наезды, `--card`, `--prep`, `--stills`, `--mix` |
| `tests/night.test.mjs` (новый) | тесты всего перечисленного |
| `video-projects/2026-10-26-claude-sfx-night/` (локально, не в git) | проект куска: `screens/make-dark.mjs`, `broll/gen.mjs`, клипы, рендеры, `REVIEW.md` |

---

### Task 0: Вчерашняя незакоммиченная работа (только с «да» заказчика)

`scripts/ru/make-captions.mjs` и `scripts/ru/wide/common.py` содержат незакоммиченные правки 2026-10-25 (как и файлы из плана по звуку). Задача 5 меняет `make-captions.mjs`.

- [ ] **Step 1:** Спросить заказчика одним вопросом: «Закоммитить вчерашнюю работу (Real SFX, набор earshot, OBS-смены фона, правки субтитров) отдельным коммитом перед новой?» Если план по звуку уже выполнил свою задачу 0 — пропустить.
- [ ] **Step 2 (после «да»):** тот же коммит, что в задаче 0 плана `docs/superpowers/plans/2026-10-26-remake-fast-sound.md`. Без «да» коммиты задач 1–6 делать через `git add -p`, только свои куски.

---

### Task 1: build.py встраивает модуль предметов и шрифт SK Display

**Files:**
- Modify: `scripts/ru/broll/build.py` (функции `brand_faces`, `kit_head`)
- Create: `scripts/ru/broll/object-kit.js` (пустой каркас, наполняется в задаче 2)
- Create: `scripts/ru/broll/object-scene.js` (пустой каркас, наполняется в задаче 3)
- Create: `tests/night.test.mjs`

**Interfaces:**
- Produces: каждый собранный клип содержит в одном `<script>` по порядку `screen-kit.js`, `object-kit.js`, `object-scene.js`; в `<style>` — `@font-face` для `SK Display` из `brand.md` → `font_serif.display` (если задан).

- [ ] **Step 1: Write the failing test** — создать `tests/night.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p = "night-") => mkdtempSync(join(tmpdir(), p));
const py = (code) => spawnSync("python3", ["-c", code], { cwd: ROOT, encoding: "utf8" });
const ff = (...a) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

function buildClip(fragment, files = {}) {
  const d = tmp("clip-");
  mkdirSync(join(d, "clips"));
  for (const [name, buf] of Object.entries(files)) writeFileSync(join(d, "clips", name), buf);
  writeFileSync(join(d, "clips", "x.html"), fragment);
  const r = spawnSync("python3", ["scripts/ru/broll/build.py", join(d, "dist"), join(d, "clips", "x.html")], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return join(d, "dist", "x.html");
}

// a built clip in headless Chromium; at(t, fn, arg) seeks and evaluates fn(arg) in the page
async function openClip(fragment, files = {}) {
  const html = buildClip(fragment, files);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + html + "?render");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.READY || null);
  const at = async (t, fn, arg) => { await page.evaluate((x) => window.seek(x), t); return page.evaluate(fn, arg); };
  return { browser, at, errors };
}

// ---------- build ----------

test("build.py embeds the object kit and the display serif next to the screen kit", () => {
  const html = readFileSync(buildClip("<title>x</title><script>OK.run({T:1, mode:'panel', theme:'night'});</script>"), "utf8");
  assert.match(html, /OK\.run = /);
  assert.match(html, /OK\.O = \{\}/);
  assert.match(html, /font-family:'SK Display'/);
  assert.ok(html.indexOf("SK.run = ") < html.indexOf("OK.run = "), "screen kit first");
  assert.ok(html.indexOf("OK.run = ") < html.indexOf("OK.run({T:1"), "kits before the fragment");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — `html` не содержит `OK.run = `.

- [ ] **Step 3: Каркасы модулей**

`scripts/ru/broll/object-kit.js`:

```js
/* Reels Studio object kit — filled in by task 2 of docs/superpowers/plans/2026-10-26-remake-fast-night-motion.md */
(function(){
const OK = window.OK = window.OK || {};
OK.O = {};
})();
```

`scripts/ru/broll/object-scene.js`:

```js
/* Reels Studio object scenes — filled in by task 3 of docs/superpowers/plans/2026-10-26-remake-fast-night-motion.md */
(function(){
const OK = window.OK;
OK.run = (cfg) => {
  window.READY = Promise.resolve();
  M.scene({W: 1080, H: 1920, T: cfg.T, bg: null, center: [540, 960], intro: null,
    SH: {none: {w: 0, h: 0, r: 0, bg: '#FFFFFF', cam: 1}}, start: 'none', SEQ: [], extra: () => {}});
  document.getElementById('shape').style.display = 'none';
};
})();
```

- [ ] **Step 4: Правка `scripts/ru/broll/build.py`**

Заменить функцию `brand_faces` целиком на:

```python
def brand_faces(b):
    body = (b.get('font_body') or DEFAULT_FONTS['font_body'])['files']
    serif_all = b.get('font_serif') or DEFAULT_FONTS['font_serif']
    serif, display = serif_all['italic'], serif_all.get('display')
    mono = (b.get('font_mono') or DEFAULT_FONTS['font_mono'])['files']
    return (weighted_faces('SK Sans', body) + font_face('SK Serif', serif, '400 900', 'italic')
            + weighted_faces('SK Mono', mono)
            + (font_face('SK Display', display, 800) if display else '')
            + "#stage{font-family:'SK Sans','Geist',system-ui,sans-serif}.mono{font-family:'SK Mono','Geist Mono',ui-monospace,monospace}")
```

В `kit_head` заменить последнюю строку

```python
    return f'<style>{faces}</style>\n<script>{pre}{(HERE / "screen-kit.js").read_text(encoding="utf-8")}</script>\n'
```

на

```python
    kits = '\n'.join((HERE / f).read_text(encoding='utf-8') for f in ('screen-kit.js', 'object-kit.js', 'object-scene.js'))
    return f'<style>{faces}</style>\n<script>{pre}{kits}</script>\n'
```

И в docstring модуля после строки `  - the kit itself,` добавить строку `  - the object kit and object scenes (object-kit.js, object-scene.js; the night look of 2026-10-26),`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/night.test.mjs && node --test tests/ru.test.mjs`
Expected: PASS оба (старый тест screen kit не сломан).

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/broll/build.py scripts/ru/broll/object-kit.js scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Screen kit build: embed the object kit and the display serif

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Предметы-чертежи (object-kit.js)

**Files:**
- Modify (переписать целиком): `scripts/ru/broll/object-kit.js`
- Test: `tests/night.test.mjs`

**Interfaces:**
- Produces (`window.OK`):
  - `OK.iso(x, y, z) → [sx, sy]` — истинная изометрия 30°: +x вправо-вниз, +y влево-вниз, +z вверх.
  - `OK.ellipse(r) → [rx, ry]` — круг радиуса r в плоскости x-y.
  - `OK.THEMES.night | .light` — `{line, ink, left, right, top, accent, label, on, dim, glow}` (`glow` — строка `"r,g,b"`).
  - `OK.css(name) → string` — правила классов `.fl .fr .ft .fa .fd .fi .ln` внутри `.ok-<name>`.
  - `OK.poly(list, cls, id)`, `OK.box(x, y, z, w, d, h, {id, l, r, t})`, `OK.cyl(cx, cy, z, r, h, {id, s, t})`, `OK.disc(cx, cy, cz, r, plane, cls, id)` → SVG-разметка.
  - `OK.O[kind] = {vb: [x, y, w, h], svg: () => markup, pose: (P, s, T) => void}` для `database, agent, turntable, speaker, key, folder`; `P` — `{имя части: элемент}` по `data-p`; `s` — `{t, active, open, spin, struck, play}`; `T` — тема.

- [ ] **Step 1: Write the failing test**

```js
// ---------- object kit ----------

test("object kit: true isometric projection, iso circles, six objects with a box, parts and a pose", () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8"), ctx);
  const OK = ctx.window.OK;
  const [x, y] = OK.iso(1, 0, 0);
  assert.ok(Math.abs(x - 0.866) < 1e-3 && Math.abs(y - 0.5) < 1e-9, `${x} ${y}`);
  assert.deepEqual(OK.iso(0, 0, 1).map((v) => +v.toFixed(6)), [0, -1]);
  const [rx, ry] = OK.ellipse(10);
  assert.ok(Math.abs(rx - 12.247) < 1e-3 && Math.abs(ry - 7.071) < 1e-3, `${rx} ${ry}`);
  for (const k of ["database", "agent", "turntable", "speaker", "key", "folder"]) {
    const O = OK.O[k];
    assert.ok(O, k);
    assert.equal(O.vb.length, 4, k);
    assert.equal(typeof O.pose, "function", k);
    const svg = O.svg();
    assert.match(svg, /data-p="/, k);
    assert.doesNotMatch(svg, /NaN|undefined/, k);
  }
  assert.match(OK.css("night"), /\.ok-night \.fl\{fill:#1A1428/);
  assert.match(OK.css("light"), /\.ok-light \.ln\{fill:none;stroke:#17141C/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — `OK.iso is not a function`.

- [ ] **Step 3: Переписать `scripts/ru/broll/object-kit.js`**

```js
/* Reels Studio object kit: isometric «blueprint» objects for the night look (design 2026-10-26,
   docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md): light lines, dark glass, one purple accent.
   An object is SVG built from iso primitives; its parts (data-p) move with its state. Scenes that place and animate
   objects: object-scene.js (OK.run). Both are built into clips by scripts/ru/broll/build.py.

   OK.iso(x, y, z) → [sx, sy]   true isometric (30°): +x goes right-down, +y left-down, +z up; origin = floor centre
   OK.ellipse(r) → [rx, ry]     a circle of radius r lying in the x-y plane
   OK.O[kind] = {vb:[x, y, w, h], svg:() => markup, pose:(P, s, T) => void}
     vb    the drawing's box in iso screen units around the origin
     P     {part name: element} for every data-p in the markup
     s     {t, active, open, spin, struck, play}: numbers, 0..1 except t (clip seconds) — pose is a pure function of s
     T     the theme (OK.THEMES.night | light)
   A new object: compose it from OK.box / OK.cyl / OK.disc / OK.poly, give moving parts a data-p, write its pose. */
(function(){
const OK = window.OK = window.OK || {};
const C30 = Math.cos(Math.PI / 6);
OK.iso = (x, y, z) => [(x - y) * C30, (x + y) * 0.5 - z];
OK.ellipse = (r) => [r * Math.SQRT2 * C30, r * Math.SQRT2 * 0.5];
const f1 = (v) => String(Math.round(v * 10) / 10);
const pts = (list) => list.map(([x, y, z]) => OK.iso(x, y, z).map(f1).join(',')).join(' ');
const tag = (id) => (id ? ` data-p="${id}"` : '');
const at = (x, y, z) => OK.iso(x, y, z).map(f1);

OK.THEMES = {
  night: {line: '#B79CFF', ink: '#F5F3FA', left: '#1A1428', right: '#221B33', top: '#2C2342', accent: '#7C3AED',
          label: '#F5F3FA', on: '#B79CFF', dim: 'rgba(245,243,250,.42)', glow: '183,156,255'},
  light: {line: '#17141C', ink: '#17141C', left: '#E4DFEC', right: '#F1EEF6', top: '#FFFFFF', accent: '#7C3AED',
          label: '#17141C', on: '#7C3AED', dim: 'rgba(23,20,28,.38)', glow: '124,58,237'},
};
OK.css = (name) => {
  const T = OK.THEMES[name];
  const s = `stroke:${T.line};stroke-width:4;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke`;
  return `.ok-${name} .ln{fill:none;${s}}.ok-${name} .fl{fill:${T.left};${s}}.ok-${name} .fr{fill:${T.right};${s}}`
    + `.ok-${name} .ft{fill:${T.top};${s}}.ok-${name} .fa{fill:${T.accent};${s}}`
    + `.ok-${name} .fd{fill:${T.dim};stroke:none}.ok-${name} .fi{fill:${T.ink};stroke:none}`;
};

OK.poly = (list, cls = 'fl', id) => `<polygon class="${cls}"${tag(id)} points="${pts(list)}"/>`;
// box from corner (x, y, z), size w along x, d along y, h up: the left face (y + d), the right face (x + w), the top
OK.box = (x, y, z, w, d, h, c = {}) => `<g${tag(c.id)}>`
  + OK.poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c.l || 'fl')
  + OK.poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], c.r || 'fr')
  + OK.poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], c.t || 'ft') + '</g>';
// vertical cylinder standing on (cx, cy, z): the side, then the top ellipse
OK.cyl = (cx, cy, z, r, h, c = {}) => {
  const [rx, ry] = OK.ellipse(r), [X, Yb] = OK.iso(cx, cy, z), Yt = Yb - h;
  return `<g${tag(c.id)}><path class="${c.s || 'fr'}" d="M${f1(X - rx)},${f1(Yt)} V${f1(Yb)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(X + rx)},${f1(Yb)} V${f1(Yt)} Z"/>`
    + `<ellipse class="${c.t || 'ft'}" cx="${f1(X)}" cy="${f1(Yt)}" rx="${f1(rx)}" ry="${f1(ry)}"/></g>`;
};
// flat disc in a vertical plane: 'y' — facing +y (on a left face), 'x' — facing +x (on a right face)
OK.disc = (cx, cy, cz, r, plane = 'y', cls = 'ft', id) => {
  const list = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, u = r * Math.cos(a), v = r * Math.sin(a);
    list.push(plane === 'y' ? [cx + u, cy, cz + v] : [cx, cy + u, cz + v]);
  }
  return OK.poly(list, cls, id);
};
const line = (a, b, id, extra = '') => `<line class="ln"${tag(id)} x1="${at(...a)[0]}" y1="${at(...a)[1]}" x2="${at(...b)[0]}" y2="${at(...b)[1]}"${extra}/>`;

OK.O = {};

// database (Openverse, a library, storage): three disks; open lifts the top one, active lights the LEDs
OK.O.database = {
  vb: [-90, -172, 180, 222],
  svg: () => [0, 1, 2].map((i) => OK.cyl(0, 0, i * 32, 62, 24, {id: 'd' + i})
    + `<ellipse class="fd" data-p="led${i}" cx="${at(44, 44, i * 32 + 12)[0]}" cy="${at(44, 44, i * 32 + 12)[1]}" rx="7" ry="4"/>`).join(''),
  pose: (P, s, T) => {
    const lift = `translate(0 ${f1(-30 * s.open)})`;
    P.d2.setAttribute('transform', lift); P.led2.setAttribute('transform', lift);
    for (const i of [0, 1, 2]) P['led' + i].style.fill = s.active > 0.5 ? T.on : '';
  },
};

// agent (an AI agent, Claude Code): a body with a face screen and an antenna; active lights the eyes
OK.O.agent = {
  vb: [-90, -128, 180, 182],
  svg: () => OK.box(-45, -45, 0, 90, 90, 72)
    + OK.poly([[-34, 45, 12], [34, 45, 12], [34, 45, 60], [-34, 45, 60]], 'ft')
    + OK.poly([[-22, 45, 30], [-10, 45, 30], [-10, 45, 44], [-22, 45, 44]], 'fi', 'e0')
    + OK.poly([[10, 45, 30], [22, 45, 30], [22, 45, 44], [10, 45, 44]], 'fi', 'e1')
    + line([0, 0, 72], [0, 0, 96])
    + `<circle class="fa" data-p="tip" cx="${at(0, 0, 102)[0]}" cy="${at(0, 0, 102)[1]}" r="7"/>`,
  pose: (P, s, T) => {
    for (const e of [P.e0, P.e1]) e.style.fill = s.active > 0.5 ? T.on : '';
    P.tip.style.opacity = (0.45 + 0.55 * s.active).toFixed(3);
  },
};

// turntable (sound placed on the timeline, Real SFX): spin turns the marker on the platter, active lights the label
OK.O.turntable = {
  vb: [-140, -108, 280, 192],
  svg: () => OK.box(-75, -75, 0, 150, 150, 22)
    + OK.cyl(-8, -8, 22, 56, 8, {id: 'plat'})
    + OK.cyl(-8, -8, 30, 16, 1, {id: 'lab', s: 'fd', t: 'fd'})
    + `<ellipse class="fi" data-p="mark" rx="5" ry="3"/>`
    + OK.box(50, -62, 22, 12, 12, 18)
    + line([56, -56, 40], [8, 14, 34])
    + OK.box(2, 10, 30, 12, 8, 6),
  pose: (P, s, T) => {
    const a = (s.spin + s.t * 0.6 * s.active) * Math.PI * 2, [x, y] = OK.iso(-8 + 38 * Math.cos(a), -8 + 38 * Math.sin(a), 30);
    P.mark.setAttribute('cx', f1(x)); P.mark.setAttribute('cy', f1(y));
    P.lab.querySelector('ellipse').style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// speaker (a sound made in code, earshot): play pulses the woofer and sends the waves
OK.O.speaker = {
  vb: [-118, -168, 196, 212],
  svg: () => {
    const [cx, cy] = OK.iso(0, 35, 42);
    const waves = [0, 1, 2].map((i) => {
      const R = 46 + 18 * i;
      return `<path class="ln" data-p="w${i}" d="M${f1(cx - R * 0.5)},${f1(cy - R * 0.866)} A${R},${R} 0 0 0 ${f1(cx - R * 0.5)},${f1(cy + R * 0.866)}" style="opacity:0"/>`;
    }).join('');
    return OK.box(-40, -35, 0, 80, 70, 120) + OK.disc(0, 35, 42, 26, 'y', 'fd', 'woof') + OK.disc(0, 35, 42, 12, 'y', 'fl')
      + OK.disc(0, 35, 94, 11, 'y', 'fd') + waves;
  },
  pose: (P, s) => {
    const [cx, cy] = OK.iso(0, 35, 42), k = 1 + 0.05 * s.play * Math.sin(s.t * 12);
    P.woof.setAttribute('transform', `translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(4)}) translate(${f1(-cx)} ${f1(-cy)})`);
    for (const i of [0, 1, 2]) P['w' + i].style.opacity = (s.play * Math.pow(0.5 + 0.5 * Math.sin(s.t * 6 - i * 1.2), 2)).toFixed(3);
  },
};

// key (an API key): lies flat; struck draws an accent line across it («без ключа»)
OK.O.key = {
  vb: [-112, -72, 224, 124],
  svg: () => OK.cyl(-52, 0, 0, 26, 9)
    + `<ellipse class="fl" cx="${at(-52, 0, 9)[0]}" cy="${at(-52, 0, 9)[1]}" rx="${f1(OK.ellipse(11)[0])}" ry="${f1(OK.ellipse(11)[1])}"/>`
    + OK.box(-28, -7, 0, 88, 14, 9) + OK.box(42, 7, 0, 9, 9, 9) + OK.box(56, 7, 0, 9, 14, 9)
    + `<line class="ln" data-p="strike" x1="-100" y1="-56" x2="100" y2="40" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1"/>`,
  pose: (P, s, T) => {
    P.strike.style.stroke = T.accent; P.strike.style.strokeWidth = '7';
    P.strike.style.strokeDashoffset = (1 - s.struck).toFixed(4);
  },
};

// folder (a project, files): stands up; open tilts the front panel forward, active tints it
const front = (o) => {
  const a = o * 0.7, h = 66;
  return [[-60, 4, 0], [60, 4, 0], [60, 4 + h * Math.sin(a), h * Math.cos(a)], [-60, 4 + h * Math.sin(a), h * Math.cos(a)]];
};
OK.O.folder = {
  vb: [-100, -130, 200, 172],
  svg: () => OK.poly([[-60, -6, 0], [60, -6, 0], [60, -6, 80], [-16, -6, 80], [-22, -6, 90], [-60, -6, 90]], 'fl')
    + OK.poly([[-52, -2, 6], [52, -2, 6], [52, -2, 74], [-52, -2, 74]], 'ft')
    + OK.poly([[-48, 0, 4], [48, 0, 4], [48, 0, 70], [-48, 0, 70]], 'ft')
    + OK.poly(front(0), 'fl', 'front'),
  pose: (P, s, T) => {
    P.front.setAttribute('points', pts(front(s.open)));
    P.front.style.fill = s.active > 0.5 ? `rgba(${T.glow},.35)` : '';
  },
};
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/night.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Посмотреть предметы глазами**

Собрать временный клип со всеми шестью предметами (задача 3 ещё не готова — рисуем их прямо через SVG):

```bash
D=$(mktemp -d) && mkdir -p $D/clips && cat > $D/clips/x.html <<'EOF'
<title>x</title>
<script>
const st=document.createElement('style');st.textContent=OK.css('night');document.head.appendChild(st);
const root=document.createElement('div');root.className='ok-night';root.style.cssText='position:absolute;inset:0;background:#0E0B14';
document.getElementById('stage').appendChild(root);
['database','agent','turntable','speaker','key','folder'].forEach((k,i)=>{const O=OK.O[k];
  root.insertAdjacentHTML('beforeend',`<svg viewBox="${O.vb.join(' ')}" width="320" style="position:absolute;left:${40+(i%3)*340}px;top:${300+Math.floor(i/3)*520}px;overflow:visible">${O.svg()}</svg>`);});
M.scene({W:1080,H:1920,T:1,bg:'#0E0B14',center:[540,960],intro:null,SH:{none:{w:0,h:0,r:0,bg:'#FFFFFF',cam:1}},start:'none',SEQ:[]});
document.getElementById('shape').style.display='none';
</script>
EOF
python3 scripts/ru/broll/build.py $D/dist $D/clips/x.html && NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/beats.js $D/dist/x.html $D/objects.png 0.5 && echo $D/objects.png
```

Открыть `objects.png` (Read): у предметов правильная изометрия (верх светлее боков, грани не перекрывают друг друга неправильно), линии видны, ничего не обрезано рамкой `vb`. Если предмет вылезает за `vb` — расширить `vb` у него.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/broll/object-kit.js tests/night.test.mjs
git commit -m "Object kit: isometric blueprint objects (database, agent, turntable, speaker, key, folder)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Сцены с предметами (object-scene.js, OK.run)

**Files:**
- Modify (переписать целиком): `scripts/ru/broll/object-scene.js`
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `OK.O`, `OK.THEMES`, `OK.css` (задача 2); движок `M` (`M.scene`, `M.track`, `M.hex`, `M.setText`, `M.FAST`, `M.eo`, `M.eio`, `M.clamp`).
- Produces: `OK.run(cfg)` — схема в шапке файла ниже. Идентификаторы DOM (для тестов и отладки): `ok-scene`, `ok-item-<id>` (svg, внутри `g.okobj`), `ok-label-<id>`, `ok-check-<id>`, `ok-link-<n>`, `ok-idx`, `ok-flip`, `ok-grid`, `ok-count`, `ok-term`, `ok-row-<n>`.

- [ ] **Step 1: Write the failing tests**

```js
// ---------- object scene ----------

const scene = (cfg) => `<title>x</title><script>OK.run(${JSON.stringify(cfg)});</script>`;

test("object scene: ghost → glass, the label lights with the active item, link draws, check pops, fly zooms in", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 3, mode: "panel", theme: "night",
    chapter: { idx: "01 — тест", l1: "Три", l2: "инструмента", y: 170, tin: 0.1 },
    items: [{ id: "a", kind: "agent", x: 540, y: 500, size: 190, tin: 0.2, label: { text: "агент" } },
      { id: "db", kind: "database", x: 300, y: 800, size: 200, tin: 0.5, label: { text: "Openverse" },
        states: [[1.0, { open: 1 }]], active: [[1.2, 1]], check: 1.4 }],
    links: [{ from: "a", to: "db", tin: 0.8, dur: 0.4 }], fly: { id: "db", t: 2.2, dur: 0.4 } }));
  try {
    const fo = (id) => +document.querySelector(`#ok-item-${id} .okobj`).getAttribute("fill-opacity");
    assert.ok(await c.at(0.3, fo, "a") < 0.5, "a ghost right after its tin");
    assert.ok(await c.at(1.0, fo, "a") > 0.95, "a in glass");
    assert.equal(await c.at(0.4, (id) => getComputedStyle(document.getElementById(`ok-item-${id}`)).display, "db"), "none");
    const lift = await c.at(1.8, () => document.querySelector('#ok-item-db [data-p="d2"]').getAttribute("transform"));
    assert.ok(-Number(/translate\(0 (-?[\d.]+)\)/.exec(lift)[1]) >= 20, lift);
    const col = (id) => getComputedStyle(document.getElementById(`ok-label-${id}`)).color;
    assert.equal(await c.at(0.95, col, "db"), "rgb(245, 243, 250)");
    assert.equal(await c.at(2.0, col, "db"), "rgb(183, 156, 255)");
    assert.ok(+(await c.at(1.8, () => document.getElementById("ok-check-db").style.opacity)) > 0.9);
    assert.ok(parseFloat(await c.at(1.3, () => document.getElementById("ok-link-0").style.strokeDashoffset)) < 1);
    const idx = () => document.getElementById("ok-idx").textContent;
    assert.ok((await c.at(0.2, idx)).length < "01 — тест".length);
    assert.equal(await c.at(1.0, idx), "01 — тест");
    const sc = await c.at(2.7, () => document.getElementById("ok-scene").style.transform);
    assert.ok(+/scale\(([\d.]+)\)/.exec(sc)[1] > 4, sc);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene full: light canvas wipes over the night, counter counts, objects drawn in the dark line", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 2, mode: "full", theme: "light", bg: { flip: [0, 0.35] },
    chapter: { idx: "01 — x", l1: "В Openverse", l2: "звуки", y: 420, tin: 0.1 },
    counter: { t: 0.3, to: 5220123, label: "аудио", y: 760, dur: 0.6 },
    items: [{ id: "db", kind: "database", x: 540, y: 1180, size: 230, tin: 0.3, ghost: false }],
    words: [{ text: "тест", font: "display", size: 120, y: 1500, t: 0.2 }] }));
  try {
    assert.equal(await c.at(0, () => getComputedStyle(document.getElementById("stage")).backgroundColor), "rgb(14, 11, 20)");
    const flip = () => +/inset\(0 ([\d.]+)%/.exec(document.getElementById("ok-flip").style.clipPath)[1];
    assert.ok(await c.at(0.05, flip) > 50);
    assert.ok(await c.at(0.6, flip) < 1);
    assert.equal((await c.at(1.2, () => document.getElementById("ok-count").firstChild.textContent)).replace(/\s/g, ""), "5220123");
    assert.equal(await c.at(1.2, () => getComputedStyle(document.querySelector("#ok-item-db polygon, #ok-item-db path")).stroke), "rgb(23, 20, 28)");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene terminal: the command types, output lines arrive on their words, the key gets struck", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 3, mode: "panel", theme: "night",
    terminal: { x: 90, y: 330, w: 900, h: 430, title: "агент", lines: [{ t: 0.5, text: "curl x", kind: "cmd", dur: 0.5 }, { t: 1.2, text: "200 OK", kind: "ok" }] },
    items: [{ id: "k", kind: "key", x: 860, y: 380, size: 170, tin: 1.5, states: [[2.0, { struck: 1 }, 0.3]] }] }));
  try {
    const typed = await c.at(0.75, () => document.querySelector("#ok-row-0 .okx").textContent);
    assert.ok(typed.length >= 1 && typed.length < "curl x".length, typed);
    const op = () => +document.getElementById("ok-row-1").style.opacity;
    assert.equal(await c.at(1.1, op), 0);
    assert.ok(await c.at(1.6, op) > 0.95);
    assert.equal(await c.at(1.6, () => getComputedStyle(document.getElementById("ok-row-1")).color), "rgb(183, 156, 255)");
    const strike = () => +document.querySelector('#ok-item-k [data-p="strike"]').style.strokeDashoffset;
    assert.ok(await c.at(1.9, strike) > 0.95);
    assert.ok(await c.at(2.8, strike) < 0.1);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — нет элементов `#ok-item-a`, `#ok-flip`, `#ok-row-0`.

- [ ] **Step 3: Переписать `scripts/ru/broll/object-scene.js`**

```js
/* Reels Studio object scenes (night look, design 2026-10-26): objects from object-kit.js placed in the frame and
   moved by verbs; every style is a pure function of t (engine contract). Built by scripts/ru/broll/build.py.

   OK.run({
     T, mode:'panel'|'full', theme:'night'|'light',
     bg:{zoom:[t, dur, to], flip:[t, dur]},    full mode only. night: grid + glow, zoom = the grid flies into depth
                                                and the glow flares. light: canvas + faint grid; flip = it wipes in
                                                from the left over the night
     chapter:{idx, l1, l2, y:200, tin, keys:[[t, {idx, l1, l2}]]},     «глава»: stays, the text swaps on keys
     items:[{id, kind, x, y, size, tin, label:{text, tin, dy:44}, states:[[t, {open:1}, dur]], active:[[t, 0|1]],
             check:t, ghost:true}],                                  «материализация», «активный пункт»
     links:[{from, to, tin, dur:0.5, dash:false}],                    «дерево и связи»: an elbow from → to
     fly:{id, t, dur:0.4},                                            «сквозной пролёт» into an item
     words:[{text, font:'display'|'serif'|'sans'|'mono', size, y, x:540, t, color}],   accent words: a wipe
     line:{y, t, w:520},                                              the glowing line under the words
     counter:{t, to, label, y, dur:1.2},
     terminal:{x, y, w, h, title, tin:-1, lines:[{t, text, kind:'cmd'|'out'|'ok', dur:0.55}]},   «живой интерфейс»
   })
   Items: x, y = frame px of the object's floor centre, size = drawn width. DOM ids (tests, debugging): ok-scene,
   ok-item-<id>, ok-label-<id>, ok-check-<id>, ok-link-<n>, ok-idx, ok-flip, ok-grid, ok-count, ok-term, ok-row-<n>. */
(function(){
const OK = window.OK;
const {clamp, eo, eio} = M;
const ex = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));     // expo-out: the long brake of the night look
const W = 1080, H = 1920, NS = 'http://www.w3.org/2000/svg';
const fontOf = (kind, size) => ({display: `800 ${size}px 'SK Display','SK Serif',serif`, serif: `italic 600 ${size}px 'SK Serif',serif`,
  sans: `700 ${size}px 'SK Sans',sans-serif`, mono: `500 ${size}px 'SK Mono',monospace`})[kind || 'sans'];
const mix = (a, b, u) => { const A = M.hex(a), B = M.hex(b); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * clamp(u))).join(',')})`; };
const groups = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const wipe = (u, pad = '-20%') => `inset(${pad} ${(100 - 100 * u).toFixed(2)}% ${pad} 0)`;

OK.run = (cfg) => {
  const T = cfg.T, theme = cfg.theme || 'night', TH = OK.THEMES[theme], full = cfg.mode === 'full';
  const st = document.createElement('style');
  st.textContent = OK.css('night') + OK.css('light') + `
#ok{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;z-index:5;overflow:hidden}
#ok .a{position:absolute}
#ok .okgrid{background-image:linear-gradient(rgba(183,156,255,.10) 2px,transparent 2px),linear-gradient(90deg,rgba(183,156,255,.10) 2px,transparent 2px);background-size:84px 84px}
#ok .okgrid.lt{background-image:linear-gradient(rgba(23,20,28,.06) 2px,transparent 2px),linear-gradient(90deg,rgba(23,20,28,.06) 2px,transparent 2px)}
#ok .oklb{transform:translateX(-50%);white-space:nowrap;font:500 30px 'SK Mono',monospace;letter-spacing:.02em}
#ok .okw{transform:translateX(-50%);white-space:nowrap;line-height:1.1}
#ok .okidx{left:0;width:${W}px;text-align:center;font:500 30px 'SK Mono',monospace;letter-spacing:.06em;white-space:nowrap}
#ok .okt1{left:0;width:${W}px;text-align:center;font:700 56px 'SK Sans',sans-serif;letter-spacing:-.02em;line-height:1;white-space:nowrap}
#ok .okt2{left:0;width:${W}px;text-align:center;font:italic 600 68px 'SK Serif',serif;line-height:1.1;white-space:nowrap}
#ok .okck{width:52px;height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center}
#ok .okterm{border-radius:22px;overflow:hidden;padding:24px 30px;font:500 26px/40px 'SK Mono',monospace;white-space:pre}
#ok .okcar{display:inline-block;width:14px;height:30px;margin-left:4px;vertical-align:-5px}
#ok .okc{left:0;width:${W}px;text-align:center}`;
  document.head.appendChild(st);
  const root = document.createElement('div'); root.id = 'ok'; root.className = `ok-${theme}`;
  document.getElementById('stage').appendChild(root);
  const el = (cls, parent = root, tagName = 'div', id) => {
    const e = document.createElement(tagName); if (cls) e.className = cls; if (id) e.id = id; parent.appendChild(e); return e;
  };
  const fill = (e, extra = {}) => (Object.assign(e.style, {left: '0', top: '0', width: W + 'px', height: H + 'px', ...extra}), e);

  // ---------- background (full mode) ----------
  let grid = null, glow = null, flip = null;
  if (full && (theme === 'night' || cfg.bg?.flip)) {
    grid = el('a okgrid', root, 'div', 'ok-grid');
    Object.assign(grid.style, {left: '-200px', top: '-200px', width: (W + 400) + 'px', height: (H + 400) + 'px'});
    glow = fill(el('a'), {background: 'radial-gradient(60% 38% at 50% 98%,rgba(124,58,237,.42) 0%,rgba(30,22,48,.18) 55%,rgba(14,11,20,0) 75%)'});
  }
  if (full && theme === 'light') {
    flip = el('a', root, 'div', 'ok-flip'); fill(flip, {background: '#EFEDF4'});
    fill(el('a okgrid lt', flip));
  }

  // ---------- scene: everything the fly zooms ----------
  const scene = el('a', root, 'div', 'ok-scene'); fill(scene);
  const lsvg = document.createElementNS(NS, 'svg');
  lsvg.setAttribute('width', W); lsvg.setAttribute('height', H);
  Object.assign(lsvg.style, {position: 'absolute', left: '0', top: '0', overflow: 'visible'});
  scene.appendChild(lsvg);

  // chapter («глава»)
  let chapter = [];
  if (cfg.chapter) {
    const c = cfg.chapter, y = c.y ?? 200;
    const states = [{t: c.tin ?? 0, idx: c.idx, l1: c.l1, l2: c.l2},
      ...(c.keys || []).map(([t, s]) => ({t, idx: s.idx ?? c.idx, l1: s.l1 ?? c.l1, l2: s.l2 ?? c.l2}))];
    chapter = states.map((s, i) => {
      const box = el('a', scene); box.style.left = '0'; box.style.top = '0';
      const idx = el('a okidx', box, 'div', i === 0 ? 'ok-idx' : undefined); idx.style.top = (y - 52) + 'px'; idx.style.color = TH.on;
      const t1 = el('a okt1', box); t1.textContent = s.l1 || ''; t1.style.top = y + 'px'; t1.style.color = TH.ink;
      const t2 = el('a okt2', box); t2.textContent = s.l2 || ''; t2.style.top = (y + 62) + 'px'; t2.style.color = TH.on;
      return {s, box, idx, t1, t2, end: states[i + 1]?.t ?? null};
    });
  }

  // items («материализация», «активный пункт»)
  const items = {};
  for (const it of cfg.items || []) {
    const O = OK.O[it.kind]; if (!O) throw new Error('OK: unknown object ' + it.kind);
    const [vx, vy, vw, vh] = O.vb, k = it.size / vw;
    const svg = document.createElementNS(NS, 'svg'); svg.id = 'ok-item-' + it.id;
    svg.setAttribute('viewBox', O.vb.join(' ')); svg.setAttribute('width', it.size); svg.setAttribute('height', vh * k);
    Object.assign(svg.style, {position: 'absolute', left: (it.x + vx * k) + 'px', top: (it.y + vy * k) + 'px', overflow: 'visible'});
    svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
    scene.appendChild(svg);
    const P = {}; svg.querySelectorAll('[data-p]').forEach((n) => { P[n.dataset.p] = n; });
    const names = new Set(); (it.states || []).forEach(([, s]) => Object.keys(s).forEach((n) => names.add(n)));
    const tracks = {};
    for (const n of names) tracks[n] = M.track(0, (it.states || []).filter(([, s]) => n in s).map(([t, s, d]) => [t, s[n], d ? [6 / d, 0.9] : M.FAST]));
    const act = M.track(0, (it.active || []).map(([t, v]) => [t, v, M.FAST]));
    let lb = null, ck = null;
    if (it.label) {
      lb = el('a oklb', scene, 'div', 'ok-label-' + it.id); lb.textContent = it.label.text;
      lb.style.left = it.x + 'px'; lb.style.top = (it.y + (it.label.dy ?? 44)) + 'px';
    }
    if (it.check != null) {
      ck = el('a okck', scene, 'div', 'ok-check-' + it.id); ck.style.background = TH.accent;
      ck.style.left = (it.x + it.size * 0.3) + 'px'; ck.style.top = (it.y + vy * k * 0.75) + 'px';
      ck.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    items[it.id] = {it, O, svg, g: svg.firstChild, P, tracks, act, lb, ck, k};
  }

  // links («дерево и связи»)
  const links = (cfg.links || []).map((L, n) => {
    const a = items[L.from], b = items[L.to];
    const x1 = a.it.x, y1 = a.it.y + 30, x2 = b.it.x, y2 = b.it.y + b.O.vb[1] * b.k - 16, ym = (y1 + y2) / 2;
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-link-' + n;
    for (const [key, v] of Object.entries({d: `M${x1},${y1} V${ym} H${x2} V${y2}`, fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    lsvg.appendChild(p);
    const len = p.getTotalLength();
    let drawn = p;
    if (L.dash) {
      const m = document.createElementNS(NS, 'mask'); m.id = 'okm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
      const mp = p.cloneNode(); mp.removeAttribute('id'); mp.setAttribute('stroke', '#fff'); mp.setAttribute('stroke-width', '8');
      m.appendChild(mp); lsvg.appendChild(m);
      p.setAttribute('stroke-dasharray', '10 12'); p.setAttribute('mask', `url(#okm${n})`); drawn = mp;
    }
    drawn.style.strokeDasharray = len;
    return {L, p, drawn, len};
  });

  // ---------- above the scene ----------
  const words = (cfg.words || []).map((w) => {
    const e = el('a okw'); e.textContent = w.text; e.style.font = fontOf(w.font, w.size);
    e.style.left = (w.x ?? 540) + 'px'; e.style.top = (w.y - w.size * 0.55) + 'px'; e.style.color = w.color || TH.ink;
    return {w, e};
  });
  let line = null;
  if (cfg.line) {
    const w = cfg.line.w ?? 520; line = el('a');
    Object.assign(line.style, {left: (540 - w / 2) + 'px', top: cfg.line.y + 'px', width: w + 'px', height: '4px', borderRadius: '2px',
      background: TH.on, boxShadow: `0 0 18px 2px rgba(${TH.glow},.8)`, transformOrigin: '0 50%'});
  }
  let counter = null;
  if (cfg.counter) {
    const c = cfg.counter, box = el('a okc', root, 'div', 'ok-count'); box.style.top = (c.y - 90) + 'px';
    const num = el('', box); Object.assign(num.style, {font: "500 150px 'SK Mono',monospace", color: TH.ink, letterSpacing: '-.02em'});
    const lbl = el('', box); Object.assign(lbl.style, {font: "600 36px 'SK Sans',sans-serif", color: TH.dim, marginTop: '10px'});
    lbl.textContent = c.label || '';
    counter = {c, box, num};
  }
  let term = null;
  if (cfg.terminal) {
    const c = cfg.terminal, box = el('a okterm', root, 'div', 'ok-term');
    Object.assign(box.style, {left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', color: TH.ink,
      background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF',
      boxShadow: `0 0 0 2px rgba(${TH.glow},.45),0 0 40px 2px rgba(124,58,237,.22)`});
    const head = el('', box); head.textContent = c.title || ''; Object.assign(head.style, {color: TH.dim, fontSize: '22px', marginBottom: '8px'});
    const rows = c.lines.map((l, i) => {
      const r = el('', box, 'div', 'ok-row-' + i); r.style.color = l.kind === 'ok' ? TH.on : TH.ink;
      if (l.kind !== 'cmd') { r.textContent = l.text; return {l, r}; }
      const pr = el('', r, 'span'); pr.textContent = '$ '; pr.style.color = TH.on;
      const tx = el('okx', r, 'span'); const car = el('okcar', r, 'span'); car.style.background = TH.on;
      return {l, r, tx, car};
    });
    term = {c, box, rows};
  }

  const draw = (t) => {
    if (grid) {
      const z = cfg.bg?.zoom, u = z ? eio(clamp((t - z[0]) / z[1])) : 0;
      grid.style.transform = `translateY(${(-t * 6).toFixed(1)}px) scale(${(1 + ((z?.[2] ?? 1) - 1) * u).toFixed(4)})`;
      if (z) glow.style.opacity = (0.7 + 0.3 * Math.sin(Math.PI * clamp((t - z[0]) / 0.8))).toFixed(3);
    }
    if (flip && cfg.bg?.flip) { const [a, d] = cfg.bg.flip; flip.style.clipPath = `inset(0 ${(100 - 100 * ex((t - a) / d)).toFixed(2)}% 0 0)`; }

    for (const c of chapter) {
      const on = t >= c.s.t - 1e-6 && (c.end == null || t < c.end);
      c.box.style.display = on ? '' : 'none'; if (!on) continue;
      c.box.style.opacity = (c.end == null ? 1 : 1 - clamp((t - (c.end - 0.15)) / 0.15)).toFixed(3);
      const s = c.s.idx || ''; M.setText(c.idx, s.slice(0, Math.round(s.length * clamp((t - c.s.t) / 0.4))));
      c.t1.style.clipPath = wipe(ex((t - c.s.t - 0.1) / 0.7));
      c.t2.style.clipPath = wipe(ex((t - c.s.t - 0.22) / 0.7));
    }

    for (const I of Object.values(items)) {
      const it = I.it, a = t - it.tin;
      const show = a >= 0;
      for (const e of [I.svg, I.lb, I.ck]) if (e) e.style.display = show ? '' : 'none';
      if (!show) continue;
      const e = ex(a / 0.5);
      if (it.ghost === false) { I.g.setAttribute('fill-opacity', '1'); I.g.setAttribute('stroke-opacity', '1'); I.svg.style.opacity = e.toFixed(3); }
      else { I.g.setAttribute('stroke-opacity', clamp(a / 0.2).toFixed(3)); I.g.setAttribute('fill-opacity', ex((a - 0.15) / 0.35).toFixed(3)); }
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0};
      for (const [n, f] of Object.entries(I.tracks)) s[n] = f(t);
      I.O.pose(I.P, s, TH);
      I.svg.style.filter = `drop-shadow(0 0 ${(4 + 14 * s.active).toFixed(1)}px rgba(${TH.glow},${(0.35 + 0.4 * s.active).toFixed(2)}))`;
      I.svg.style.transform = `translateY(${((1 - e) * 16).toFixed(1)}px)`;
      if (I.lb) {
        const la = t - (it.label.tin ?? it.tin + 0.3);
        I.lb.style.display = la < 0 ? 'none' : '';
        I.lb.style.clipPath = wipe(ex(la / 0.5));
        I.lb.style.color = mix(TH.label, TH.on, s.active);
      }
      if (I.ck) {
        const ca = t - it.check;
        I.ck.style.display = ca < 0 ? 'none' : '';
        I.ck.style.opacity = clamp(ca / 0.12).toFixed(3);
        I.ck.style.transform = `scale(${(0.6 + 0.4 * ex(ca / 0.35)).toFixed(3)})`;
      }
    }

    for (const L of links) {
      L.p.style.display = t < L.L.tin ? 'none' : '';
      L.drawn.style.strokeDashoffset = (L.len * (1 - ex((t - L.L.tin) / (L.L.dur ?? 0.5)))).toFixed(2);
    }

    if (cfg.fly) {
      const f = cfg.fly, I = items[f.id], u = eio(clamp((t - f.t) / (f.dur ?? 0.4)));
      const cy = I.it.y + (I.O.vb[1] + I.O.vb[3] / 2) * I.k;
      scene.style.transformOrigin = `${I.it.x}px ${cy.toFixed(1)}px`;
      scene.style.transform = `scale(${(1 + 7 * u * u).toFixed(4)})`;
      scene.style.filter = u > 0.01 ? `blur(${(Math.sin(Math.PI * u) * 6).toFixed(2)}px)` : 'none';
      scene.style.opacity = (1 - clamp((u - 0.6) / 0.4)).toFixed(3);
    }

    for (const {w, e} of words) {
      const u = ex((t - w.t) / 0.7);
      e.style.display = t < w.t ? 'none' : '';
      e.style.clipPath = wipe(u, '-30%');
      e.style.filter = u < 0.98 ? `blur(${((1 - u) * 6).toFixed(2)}px)` : 'none';
    }
    if (line) { line.style.display = t < cfg.line.t ? 'none' : ''; line.style.transform = `scaleX(${ex((t - cfg.line.t) / 0.8).toFixed(4)})`; }

    if (counter) {
      const c = counter.c, a = t - c.t;
      counter.box.style.display = a < 0 ? 'none' : '';
      counter.box.style.opacity = clamp(a / 0.2).toFixed(3);
      M.setText(counter.num, groups(Math.round(c.to * eo(a / (c.dur ?? 1.2)))));
    }

    if (term) {
      term.box.style.clipPath = `inset(0 ${(100 - 100 * ex((t - (term.c.tin ?? -1)) / 0.6)).toFixed(2)}% 0 0 round 22px)`;
      for (const {l, r, tx, car} of term.rows) {
        const b = t - l.t;
        if (l.kind === 'cmd') {
          const n = Math.round(l.text.length * clamp(b / (l.dur ?? 0.55)));
          r.style.display = b < 0 ? 'none' : '';
          M.setText(tx, l.text.slice(0, n));
          car.style.opacity = n < l.text.length || Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
        } else {
          const u = ex(b / 0.3);
          r.style.opacity = (b < 0 ? 0 : u).toFixed(3);
          r.style.transform = `translateY(${((1 - u) * 8).toFixed(1)}px)`;
        }
      }
    }
  };

  window.READY = Promise.resolve();
  M.scene({W, H, T, bg: full ? (theme === 'light' && !cfg.bg?.flip ? '#EFEDF4' : '#0E0B14') : null, center: [W / 2, H / 2], intro: null,
    SH: {none: {w: 0, h: 0, r: 0, bg: '#FFFFFF', cam: 1}}, start: 'none', SEQ: [], extra: (t) => draw(t)});
  document.getElementById('shape').style.display = 'none';
};
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/night.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Object scenes: OK.run with chapter, materialize, active item, links, fly, accents, counter, live terminal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Тема night в screen-kit

**Files:**
- Modify: `scripts/ru/broll/screen-kit.js`
- Test: `tests/night.test.mjs`

**Interfaces:**
- Produces: `SK.run({..., theme:'night'})`: `title.idx` (моно-индекс над титром, печатается), `win.enter:'fly'` (вход из глубины после пролёта), `marks: [{kind:'lens', keys:[[t, x, y]], r:110, zoom:1.9, t0, t1}]` (координаты — пиксели медиа). DOM: `.sk-idx`, `.sk-draw rect` (прорисовка рамки, `strokeDashoffset` 1 → 0), `.sk-edge` (свет по краю).

- [ ] **Step 1: Write the failing test**

```js
// ---------- screen kit night ----------

test("screen kit night: no title plate, typed chapter index, the frame draws in, edge light on a shot change, lens runs", { timeout: 60000 }, async () => {
  const d = tmp("png-"); ff("-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1", join(d, "a.png"));
  const c = await openClip(`<title>x</title><script>SK.run(${JSON.stringify({ T: 3, mode: "light", theme: "night", tin: 0,
    title: { idx: "01 — тест", l1: "Claude", l2: "делает", y: 200, tin: 0 },
    win: { x: 540, y: 380, w: 900, h: 480, tin: 0 }, media: { a: { src: "a.png" } },
    shots: [[0, "a", [0, 0, 640]], [1.5, "a", [100, 0, 500], "cut"]],
    marks: [{ kind: "lens", keys: [[1.8, 320, 180], [2.4, 400, 200]], r: 100, zoom: 2, t0: 1.8, t1: 2.6 }] })});</script>`,
    { "a.png": readFileSync(join(d, "a.png")) });
  try {
    const plate = await c.at(0.8, () => { const s = getComputedStyle(document.querySelector(".sk-t2")); return [s.backgroundColor, s.color]; });
    assert.deepEqual(plate, ["rgba(0, 0, 0, 0)", "rgb(183, 156, 255)"]);
    const idx = () => document.querySelector(".sk-idx").textContent;
    assert.ok((await c.at(0.15, idx)).length < "01 — тест".length);
    assert.equal(await c.at(0.8, idx), "01 — тест");
    const off = () => +document.querySelector(".sk-draw rect").style.strokeDashoffset;
    const mid = await c.at(0.2, off);
    assert.ok(mid > 0.02 && mid < 0.98, `dashoffset ${mid}`);
    assert.ok(await c.at(0.9, off) < 0.01);
    const edge = () => [+document.querySelector(".sk-edge").style.opacity, parseFloat(document.querySelector(".sk-edge").style.left)];
    const [o1, l1] = await c.at(1.7, edge), [o2, l2] = await c.at(2.0, edge);
    assert.ok(o2 > 0.2 && l2 > l1, `edge ${o1} ${l1} → ${o2} ${l2}`);
    await c.at(2.2, () => 0);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — фон плашки `.sk-t2` не прозрачный (`rgb(124, 58, 237)`).

- [ ] **Step 3: Правки `scripts/ru/broll/screen-kit.js`** (по порядку сверху вниз)

3a. В шапке заменить

```js
     T, mode:'light'|'dark'|'card', tin:0, tout:null,
```

на

```js
     T, mode:'light'|'dark'|'card', tin:0, tout:null, theme?:'night',
       night look (2026-10-26): no title plate (wipes, italic in accent_light, title.idx = typed chapter index),
       glass window whose frame draws in by a line, light running along its top edge on entry and shot changes,
       win.enter:'fly' (arrives from depth after an object scene's fly), marks kind 'lens' {keys:[[t,x,y]], r, zoom, t0, t1}
```

3b. После строки `const SPRINGY = x=>M.S(x*0.9,9.5,0.82);   // eased spring on a 0..1 clock (slight settle)` добавить:

```js
const ex = x=>x<=0?0:x>=1?1:1-Math.pow(2,-10*x);    // expo-out: the long brake of the night look
```

3c. В строке css заменить

```js
.sk-rs b{font-family:'SK Mono',monospace;font-weight:500;color:${INK_DARK}}
`;
```

на

```js
.sk-rs b{font-family:'SK Mono',monospace;font-weight:500;color:${INK_DARK}}
.sk-idx{left:0;width:${W}px;text-align:center;font-family:'SK Mono',monospace;font-weight:500;font-size:30px;letter-spacing:.06em;color:${B.accent_light};white-space:nowrap}
.sk-edge{width:140px;height:3px;border-radius:2px;background:linear-gradient(90deg,${rgba(B.accent_light,0)},#F1E9FF,${rgba(B.accent_light,0)});box-shadow:0 0 14px 3px ${rgba(B.accent_light,.8)}}
.sk-draw{overflow:visible}
.sk-grid{left:-200px;top:-200px;width:${W+400}px;height:${H+400}px;background-image:linear-gradient(${rgba(B.accent_light,.10)} 2px,transparent 2px),linear-gradient(90deg,${rgba(B.accent_light,.10)} 2px,transparent 2px);background-size:84px 84px}
`;
```

3d. Заменить `const T = cfg.T, dark = cfg.mode==='dark', card = cfg.mode==='card';` на

```js
  const T = cfg.T, dark = cfg.mode==='dark', card = cfg.mode==='card', night = cfg.theme==='night';
```

3e. Заменить

```js
  const haze = dark ? el('a sk-glow') : el('a sk-haze');
  if(card) haze.style.display = 'none';
```

на

```js
  const haze = dark ? el('a sk-glow') : el('a sk-haze');
  if(card || (night && !dark)) haze.style.display = 'none';
  if(night && dark) el('a sk-grid');
```

3f. В создании титров заменить

```js
    if(dark) t1.style.color = B.ink;
    const w2 = el('a sk-t2w'); w2.style.top = (y+66)+'px';
    const t2 = el('sk-t2', w2); const tx = el('', t2, 'span'); tx.textContent = c.l2 || '';
    return {c, t1, w2, t2, tx};
```

на

```js
    if(dark || night) t1.style.color = B.ink;
    const w2 = el('a sk-t2w'); w2.style.top = (y+66)+'px';
    const t2 = el('sk-t2', w2); const tx = el('', t2, 'span'); tx.textContent = c.l2 || '';
    let idx = null;
    if(night){
      Object.assign(t2.style, {background:'transparent', boxShadow:'none', padding:'0 4px 8px', color:B.accent_light});
      if(c.idx){ idx = el('a sk-idx'); idx.style.top = (y-52)+'px'; }
    }
    return {c, t1, w2, t2, tx, idx};
```

3g. После строки `const urlEl = el('sk-url', barEl);` добавить:

```js
  let drawSvg = null, drawRect = null, edge = null;
  if(night){
    win.style.background = '#18122A';
    win.style.boxShadow = `0 0 0 2px ${rgba(B.accent_light,.45)},0 0 44px 4px ${rgba(B.accent,.28)},0 30px 80px -20px rgba(0,0,0,.7)`;
    Object.assign(barEl.style, {background:'rgba(255,255,255,.04)', borderBottom:`1px solid ${rgba(B.accent_light,.18)}`});
    Object.assign(urlEl.style, {background:'rgba(255,255,255,.06)', color:'rgba(245,243,250,.68)', fontFamily:"'SK Mono',monospace"});
    if(wc.enter !== 'fly'){
      drawSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawSvg.setAttribute('class', 'a sk-draw'); root.appendChild(drawSvg);
      drawRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for(const [k,v] of Object.entries({x:2, y:2, rx:26, fill:'none', stroke:B.accent_light, 'stroke-width':3, pathLength:1, 'stroke-dasharray':1})) drawRect.setAttribute(k, v);
      drawSvg.appendChild(drawRect);
    }
    edge = el('a sk-edge');
  }
```

3h. После строки `const rr = (x,y,w,h,r)=>{ctx.beginPath(); ctx.roundRect(x,y,w,h,r);};` добавить:

```js
  // lens (night look): outside dims, the circle shows the media under it ×zoom, a ring in accent_light
  const lensCv = document.createElement('canvas'), lctx = lensCv.getContext('2d');
  const drawLens = (m, t, map, cw, ch)=>{
    const r = m.r ?? 110, z = m.zoom ?? 1.9, at = m._p || (m._p = M.path(m.keys));
    const p = at(t), [sx, sy] = map(p.x, p.y);
    const o = clamp((t-m.t0)/0.2) * (m.t1!=null ? 1-clamp((t-m.t1)/0.2) : 1);
    if(o<=0.002) return;
    const d = Math.ceil(2*r), src = r/z;
    if(lensCv.width!==d){ lensCv.width = d; lensCv.height = d; }
    lctx.clearRect(0,0,d,d); lctx.drawImage(cv, sx-src, sy-src, 2*src, 2*src, 0, 0, d, d);
    ctx.save(); ctx.globalAlpha = o;
    ctx.beginPath(); ctx.rect(0,0,cw,ch); ctx.arc(sx, sy, r, 0, Math.PI*2, true); ctx.fillStyle = 'rgba(14,11,20,.62)'; ctx.fill('evenodd');
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.clip(); ctx.drawImage(lensCv, sx-r, sy-r); ctx.restore();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.lineWidth = 3; ctx.strokeStyle = B.accent_light;
    ctx.shadowColor = rgba(B.accent_light,.9); ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();
  };
```

3i. В цикле меток `drawCanvas` заменить

```js
      if(m.shot!=null && m.shot!==shots[i][1]) continue;
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
```

на

```js
      if(m.shot!=null && m.shot!==shots[i][1]) continue;
      if(m.kind==='lens'){ drawLens(m, t, map, cw, ch); continue; }
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
```

и заменить

```js
        ctx.save(); ctx.globalCompositeOperation='multiply'; ctx.globalAlpha=0.9*out;
        ctx.fillStyle = dark ? rgba(B.accent_light,.55) : '#D9CBFF';
```

на

```js
        ctx.save(); ctx.globalCompositeOperation = night ? 'screen' : 'multiply'; ctx.globalAlpha=0.9*out;
        ctx.fillStyle = night ? rgba(B.accent,.6) : dark ? rgba(B.accent_light,.55) : '#D9CBFF';
```

3j. В счётчике заменить

```js
    if(c.suffix){ const s = el('', num, 'span'); s.textContent = c.suffix; }
    counter = {c, box, cols, digits};
```

на

```js
    if(c.suffix){ const s = el('', num, 'span'); s.textContent = c.suffix; }
    if(night){
      Object.assign(box.style, {background:'#18122A', boxShadow:`0 0 0 2px ${rgba(B.accent_light,.9)},0 0 46px 4px ${rgba(B.accent,.35)}`});
      Object.assign(num.style, {color:B.ink, fontFamily:"'SK Mono',monospace", fontWeight:500}); lbl.style.color = 'rgba(245,243,250,.7)';
    }
    counter = {c, box, cols, digits};
```

3k. Перед строкой `let lastW = 0, lastH = 0;` добавить:

```js
  // night titles: a wipe left → right, the italic line in accent_light without a plate, the chapter index typed
  const nightTitle = (title, t, a, b)=>{
    const o = (t < a ? 0 : 1) * (b==null ? 1 : 1-clamp((t-b)/0.3));
    for(const e of [title.t1, title.w2, title.idx]) if(e){ e.style.display = o>0.002 ? '' : 'none'; e.style.opacity = o.toFixed(3); }
    if(o<=0.002) return;
    title.t1.style.clipPath = `inset(-20% ${(100-100*ex((t-a)/0.7)).toFixed(2)}% -20% 0)`;
    title.t2.style.clipPath = `inset(-20% ${(100-100*ex((t-a-0.12)/0.7)).toFixed(2)}% -20% 0)`;
    if(title.idx){ const s = title.c.idx; M.setText(title.idx, s.slice(0, Math.round(s.length*clamp((t-a)/0.4)))); }
  };
  // the line that draws the window frame on entry, then the light along the top edge on entry and every shot change
  const edgeTimes = night ? [...(wc.enter === 'fly' ? [] : [(wc.tin ?? tin) + 0.45]), ...shots.slice(1).map(s=>s[0])] : [];
  const nightFrame = (t, x, y, w, h, wa, o)=>{
    if(drawSvg){
      Object.assign(drawSvg.style, {left:(x-w/2-2)+'px', top:(y-2)+'px', width:(w+4)+'px', height:(h+4)+'px'});
      drawSvg.setAttribute('width', w+4); drawSvg.setAttribute('height', h+4);
      drawRect.setAttribute('width', w); drawRect.setAttribute('height', h);
      drawRect.style.strokeDashoffset = (1-ex(wa/0.6)).toFixed(4);
      drawSvg.style.opacity = (o*(1-clamp((wa-0.6)/0.3))).toFixed(3);
      drawSvg.style.display = wa < 0 || o<=0.002 ? 'none' : '';
    }
    let u = -1; for(const te of edgeTimes){ const v = (t-te)/0.8; if(v>=0 && v<1) u = v; }
    edge.style.display = u<0 || o<=0.002 ? 'none' : '';
    if(u>=0){
      edge.style.left = (x-w/2-140+(w+140)*eio(u)).toFixed(1)+'px'; edge.style.top = (y-2).toFixed(1)+'px';
      edge.style.opacity = (Math.sin(Math.PI*u)*o).toFixed(3);
    }
  };
```

3l. В `draw` заменить

```js
    for(const title of titles){
      const c = title.c, a = c.tin ?? tin + 0.1, b = c.tout === undefined ? tout : c.tout;
      M.apply(title.t1, vis(t, a, b));
```

на

```js
    for(const title of titles){
      const c = title.c, a = c.tin ?? tin + 0.1, b = c.tout === undefined ? tout : c.tout;
      if(night){ nightTitle(title, t, a, b); continue; }
      M.apply(title.t1, vis(t, a, b));
```

3m. В `draw` заменить

```js
    const [x,y,w,h] = wgeo(t);
    const wv = vis(t, wc.tin ?? tin, wc.tout === undefined ? tout : wc.tout, {lin:0.34});
    if(M.apply(win, wv)){
```

на

```js
    const [x,y,w,h] = wgeo(t);
    let wv = vis(t, wc.tin ?? tin, wc.tout === undefined ? tout : wc.tout, {lin:0.34});
    if(night){
      const wa = t - (wc.tin ?? tin), wo = wc.tout === undefined ? tout : wc.tout;
      const o = (wa < 0 ? 0 : 1) * (wo==null ? 1 : 1-clamp((t-wo)/0.3));
      if(wc.enter === 'fly'){ const u = ex(wa/0.6); wv = {o:o*clamp(wa/0.25), blur:(1-u)*6, s:0.35+0.65*u}; }
      else { wv = {o, blur:0, s:1}; win.style.clipPath = `inset(0 ${(100-100*ex((wa-0.15)/0.6)).toFixed(2)}% 0 0 round 26px)`; }
      nightFrame(t, x, y, w, h, wa, o);
    }
    if(M.apply(win, wv)){
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/night.test.mjs && node --test tests/ru.test.mjs`
Expected: PASS оба (светлая тема не сломана).

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/broll/screen-kit.js tests/night.test.mjs
git commit -m "Screen kit: night theme (wiped titles, drawn-in glass window, edge light, fly entry, lens)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Тема субтитров по умолчанию

**Files:**
- Modify: `scripts/ru/make-captions.mjs` (комментарий kinetic и две строки с `keyAt(o.theme_keys, …, "light")`)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Produces: `PLAN.json` → `captions.kinetic.theme_default: "dark" | "light"` (по умолчанию `"light"`) — тема там, где `theme_keys` ничего не говорят.

- [ ] **Step 1: Write the failing test**

```js
// ---------- captions ----------

test("kinetic captions: theme_default sets the theme where no key says otherwise", async () => {
  const { kineticGroups, kineticConfig, kineticHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const brand = loadBrand();
  const words = [{ text: "Раз", start: 0, end: 0.3 }, { text: "два.", start: 0.35, end: 0.6 }, { text: "Три", start: 1.6, end: 1.9 }];
  const ov = { style: "kinetic", kinetic: { theme_default: "dark", theme_keys: [{ at: 1.5, theme: "light" }] } };
  const k = kineticConfig(brand, ov), g = kineticGroups({ words }, k, ov);
  const html = kineticHtml(g, { duration: 3, brand, fontUrl: "a.ttf", accentUrl: "b.ttf", overrides: ov });
  assert.match(html, /id="c0" class="kg dark clip"/);
  assert.match(html, /id="c1" class="kg light clip"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — `c0` получает класс `light`.

- [ ] **Step 3: Правка `scripts/ru/make-captions.mjs`**

В комментарии над `KINETIC` заменить

```js
// PLAN.json captions: { style: "kinetic", kinetic: { y_keys: [{at, y}], theme_keys: [{at, theme: "light"|"dark"}],
```

на

```js
// PLAN.json captions: { style: "kinetic", kinetic: { y_keys: [{at, y}], theme_keys: [{at, theme: "light"|"dark"}],
//                       theme_default: "light"|"dark" (the night look: "dark"),
```

Заменить обе строки, где тема берётся из ключей:

```js
    const th = keyAt(o.theme_keys, g.start, "theme", "light") === "dark" ? "dark" : "light";
```

на

```js
    const th = keyAt(o.theme_keys, g.start, "theme", o.theme_default ?? "light") === "dark" ? "dark" : "light";
```

и

```js
    const th = keyAt(o.theme_keys, g.start, "theme", "light") === "dark" ? k.dark : k.light;
```

на

```js
    const th = keyAt(o.theme_keys, g.start, "theme", o.theme_default ?? "light") === "dark" ? k.dark : k.light;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/night.test.mjs && node --test tests/ru.test.mjs`
Expected: PASS оба.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/make-captions.mjs tests/night.test.mjs
git commit -m "Kinetic captions: theme_default for the night look

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ночная база картинки (night_base.py)

**Files:**
- Create: `scripts/ru/wide/night_base.py`
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `scripts/ru/wide/common.py` (`project`, `fps`, `joins`, `CARD`), `scripts/ru/fx/person-mask.swift` (`swift person-mask.swift <frames> <masks>`), `renders/clean.mp4`, `fx/masks/%05d.png` (маски карточки 989×822, кадр 0 — `00000.png`), `work/accents.json`.
- Produces: `renders/picture.base.mp4` (звук `clean.mp4`); с `--mix` — `renders/picture.mp4` со звуком `fx/mix.wav`; `--stills a,b` → `review/night-<t>.png`; `--prep` → `work/card-frames/` и `fx/masks/`.

- [ ] **Step 1: Write the failing test**

```js
// ---------- night base ----------

function pixel(video, n, x, y) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, String(r.stderr));
  const i = (y * 1080 + x) * 3;
  return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]];
}

test("night_base: night background, the speaker by the mask with a halo, an accent replaces the background, --card", { timeout: 120000 }, () => {
  const P = tmp("nb-");
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 0.2 }, { start: 1, end: 1.2 }] }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.4", "-f", "lavfi", "-i", "sine=f=220:d=0.4:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "color=c=green:s=1080x1920:r=25:d=0.16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/acc.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "a", in: 0.04, out: 0.2, kind: "night", file: "broll/acc.mp4" }] }));
  const r0 = py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for i in range(10):
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(r0.status, 0, r0.stderr);
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = join(P, "renders/picture.base.mp4");
  const [pr, pg] = pixel(out, 7, 547, 1456);
  assert.ok(pr > 170 && pg < 70, `speaker ${pr},${pg}`);
  const bg = pixel(out, 7, 100, 300);
  assert.ok(bg[0] < 50 && bg[1] < 50 && bg[2] < 70, `night ${bg}`);
  const acc = pixel(out, 2, 100, 300);
  assert.ok(acc[1] > 100 && acc[0] < 80, `accent ${acc}`);
  assert.ok(pixel(out, 2, 547, 1456)[0] > 170, "the speaker stays over the accent");
  assert.ok(pixel(out, 7, 322, 1456)[2] > pixel(out, 7, 310, 1456)[2] + 8, "halo 5 px outside the silhouette, not 17 px out");
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--card"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(pixel(out, 7, 540, 1500)[0] > 170, "card shows the camera");
  const sum = (p) => p[0] + p[1] + p[2];
  assert.ok(sum(pixel(out, 7, 47, 1300)) > sum(pixel(out, 7, 20, 1300)) + 60, "card frame line");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/night.test.mjs`
Expected: FAIL — `can't open file '.../scripts/ru/wide/night_base.py'`.

- [ ] **Step 3: Write `scripts/ru/wide/night_base.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/night.test.mjs`
Expected: PASS, 8 tests (тест базы — ~15 с).

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/wide/night_base.py tests/night.test.mjs
git commit -m "Reels Studio: night_base.py — night background, masked speaker with a halo, accent layers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Кусок claude-sfx 0–20,66 с в ночи (главная сессия)

**Files (локально, не в git):** `video-projects/2026-10-26-claude-sfx-night/` — `screens/make-dark.mjs`, `broll/gen.mjs`, `PLAN.json`, клипы, рендеры, `REVIEW.md`.

- [ ] **Step 1: Проект куска (симлинки на исходники, одобренный проект не меняется)**

```bash
S=video-projects/2026-10-25-claude-sfx; N=video-projects/2026-10-26-claude-sfx-night
mkdir -p $N/assets $N/renders $N/fx $N/work $N/broll/clips $N/screens $N/review
for f in raw.mp4 gsap.min.js; do ln -s ../../2026-10-25-claude-sfx/assets/$f $N/assets/$f; done
ln -s ../../2026-10-25-claude-sfx/renders/clean.mp4 $N/renders/clean.mp4
for f in transcript.clean.json EDL.json PROBE.json; do ln -s ../2026-10-25-claude-sfx/$f $N/$f; done
ln -s ../../2026-10-25-claude-sfx/fx/masks $N/fx/masks
for d in grid term; do ln -s ../../2026-10-25-claude-sfx/screens/$d $N/screens/$d; done
cp $S/PLAN.json $N/PLAN.json && cp $S/fx/mix.wav $N/fx/mix.wav
ls -la $N $N/renders $N/fx
```

Expected: все симлинки разрешаются (`ls -L $N/renders/clean.mp4` без ошибки).

- [ ] **Step 2: Скриншот GitHub в тёмной теме** — создать `$N/screens/make-dark.mjs`:

```js
// claude-sfx · ночь: github.com/WordPress/openverse в тёмной теме сайта (дизайн 2026-10-26: публичные страницы в ночном
// окне — в тёмной теме, если сайт её поддерживает). Playwright headless, deviceScaleFactor 2 →
// screens/gh-ov-dark.png + screens/rects-dark.json (desc — блок «Openverse is a search engine…», пиксели png).
//   node <project>/screens/make-dark.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), K = 2;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: K, locale: "ru-RU", colorScheme: "dark" });
const pg = await ctx.newPage();
await pg.goto("https://github.com/WordPress/openverse", { waitUntil: "domcontentloaded" });
await pg.waitForTimeout(3500);
const box = await pg.getByText("Openverse is a search engine for openly-licensed media", { exact: false }).first().boundingBox();
if (!box) throw new Error("no project description on the page");
await pg.screenshot({ path: join(HERE, "gh-ov-dark.png") });
writeFileSync(join(HERE, "rects-dark.json"), JSON.stringify({ desc: [box.x * K, box.y * K, box.width * K, box.height * K].map(Math.round) }, null, 1));
await browser.close();
console.log("→ screens/gh-ov-dark.png", JSON.stringify(box));
```

Run: `node video-projects/2026-10-26-claude-sfx-night/screens/make-dark.mjs`
Expected: `→ screens/gh-ov-dark.png {...}`. Открыть png (Read): страница тёмная, описание видно. Если GitHub отдал светлую тему — сказать об этом в отчёте и взять светлую (`$S/screens/gh-ov.png` + `rects.json`), не обходить.

- [ ] **Step 3: Генератор клипов** — создать `$N/broll/gen.mjs`:

```js
// claude-sfx в ночном стиле, кусок 0–20,66 с (дизайн 2026-10-26, шаг 1 проверки): клипы screen-kit (theme night) и
// object-scene (OK.run) над спикером на ночной базе (scripts/ru/wide/night_base.py) и ночной акцент «не слышит звук».
//   node <project>/broll/gen.mjs <project>   → broll/clips/*.html, broll/plan.json, work/accents.json
// Времена — секунды чистого таймлайна (transcript.clean.json); в клипе — минус in. Тексты терминала и число — настоящие
// (claude-sfx screens/make-screens.mjs: запрос к Openverse API и /v1/audio/stats/ от 2026-10-25).
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
const clips = [], accents = [];
fs.mkdirSync(path.join(P, "broll/clips"), { recursive: true });

function clip(id, tin, tout, kind, run, cfg) {
  const T = +(tout - tin).toFixed(3), L = (t) => +(t - tin).toFixed(3);
  fs.writeFileSync(path.join(P, "broll/clips", id + ".html"), `<title>${id}</title>\n<script>\n${run}(${JSON.stringify({ T, ...cfg(L) })});\n</script>\n`);
  const file = `${id}.${kind === "panel" ? "mov" : "mp4"}`;
  if (kind === "accent") accents.push({ id, in: tin, out: tout, kind: "night", file: `broll/${file}` });
  else clips.push({ id, title: id, in: tin, out: tout, kind, file });
}

// 01 · хук: ночной титр и окно с кадра 0 (обложка); на «этот рилс» — терминал, по краю окна пробегает свет
clip("01-hook", 0, 5.62, "panel", "SK.run", (L) => ({
  mode: "light", theme: "night", tin: -1, tout: L(5.50),
  title: { l1: "Claude делает", l2: "моушн-графику", y: 200, tin: -1 },
  win: { x: 540, y: 380, w: 900, h: 480, tin: -1 },
  media: { grid: { frames: S("grid"), from: 0.02, url: "мой рилс · 20 анимаций в Claude" }, term: { frames: S("term"), from: 0, url: "Claude Code" } },
  shots: [[0, "grid", [0, 0, 1800], "cut"], [L(2.45), "term", [0, 0, 1800], "blur"]],
}));

// 02 · ночной акцент «не слышит звук… вслепую»: сетка уходит в глубину, свечение вспыхивает, слово за головой
clip("02-acc", 5.52, 8.97, "accent", "OK.run", (L) => ({
  mode: "full", theme: "night", bg: { zoom: [0, 3.45, 1.5] },
  words: [{ text: "не слышит", font: "display", size: 150, y: 1000, t: L(5.80) },
    { text: "звук", font: "serif", size: 112, y: 830, t: L(6.40), color: "#B79CFF" }],
  line: { y: 1092, t: L(6.10), w: 560 },
}));

// 03 · три инструмента: глава, агент, материализация трёх предметов, связи, галочки на «исправляют»,
// база Openverse загорается и камера влетает в неё (пролёт в клип 04)
const tools = [["db", "database", 220, "Openverse"], ["tt", "turntable", 540, "Real SFX"], ["sp", "speaker", 860, "earshot"]];
clip("03-tools", 8.70, 12.02, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "02 — решение", l1: "3 бесплатных", l2: "инструмента", y: 170, tin: L(W("три", 9)) },
  items: [{ id: "ag", kind: "agent", x: 540, y: 500, size: 190, tin: L(W("Поэтому", 9)), label: { text: "агент", dy: 40 } },
    ...tools.map(([id, kind, x, label], i) => ({ id, kind, x, y: 800, size: 200, tin: L(W("бесплатных", 9)) + i * 0.12,
      label: { text: label }, check: L(W("исправляют", 11)) + i * 0.1,
      ...(id === "db" ? { active: [[L(11.70), 1]], states: [[L(11.70), { open: 1 }]] } : {}) }))],
  links: tools.map(([id], i) => ({ from: "ag", to: id, tin: L(W("инструмента", 10)) + i * 0.08, dur: 0.45 })),
  fly: { id: "db", t: L(11.70), dur: 0.32 },
}));

// 04 · 🎧 «Первый — это Openverse API»: окно прилетает из глубины после пролёта, линза идёт по описанию проекта
const d = R.desc, cw = 1320, ch = Math.round(cw * 476 / 1000);
clip("04-ov", 11.95, 14.02, "full", "SK.run", (L) => ({
  mode: "dark", theme: "night", tin: 0,
  title: { idx: "01 — инструмент", l1: "Инструмент 1", l2: "Openverse API", y: 470, tin: -0.25 },
  win: { x: 540, y: 700, w: 1000, h: 528, tin: 0, enter: "fly" },
  media: { ov: { src: S("gh-ov-dark.png"), url: "github.com/WordPress/openverse" } },
  shots: [[0, "ov", [Math.round(d[0] + d[2] / 2 - cw / 2), Math.round(d[1] + d[3] / 2 - ch / 2), cw], "cut"]],
  marks: [{ kind: "lens", keys: [[L(12.60), d[0] + 70, d[1] + d[3] / 2], [L(13.50), d[0] + d[2] - 70, d[1] + d[3] / 2]],
    r: 120, zoom: 1.8, t0: L(12.55), t1: L(13.95) }],
}));

// 05 · «Агент сам там ищет звуки и скачивает даже без ключа»: живой терминал, ключ API зачёркивается на «без ключа»
const Q = 'curl "api.openverse.org/v1/audio/?q=whoosh"';
clip("05-ovapi", 13.98, 17.0, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "01 — Openverse API", l1: "Ищет и качает", l2: "без ключа", y: 170, tin: -0.15 },
  terminal: { x: 90, y: 330, w: 900, h: 430, title: "агент · запрос к Openverse API", tin: -0.2, lines: [
    { t: L(W("там", 14)), text: Q, kind: "cmd", dur: 0.55 },
    { t: L(15.12), text: "200 OK · 240 результатов", kind: "ok" },
    { t: L(15.18), text: "  Deep Whoosh #1            CC0 · Freesound · 3,2 с", kind: "out" },
    { t: L(15.24), text: "  Swosh swoosh whoosh air…  CC0 · Freesound · 0,5 с", kind: "out" },
    { t: L(15.30), text: "  Swipe Whoosh              CC0 · Freesound · 0,4 с", kind: "out" },
    { t: L(W("скачивает", 15)), text: "↓ deep-whoosh-1.mp3 · 68 КБ · готово", kind: "ok" }] },
  items: [{ id: "key", kind: "key", x: 860, y: 380, size: 170, tin: L(W("даже", 15)), states: [[L(W("без", 16)), { struck: 1 }, 0.35]] }],
}));

// 06 · 🎧 «Там более пяти миллионов звуков и треков с открытой лицензией»: светлый акцент шторкой, счётчик,
// база Openverse тёмной линией на светлом загорается на «открытой»
clip("06-count", 16.95, 20.66, "full", "OK.run", (L) => ({
  mode: "full", theme: "light", bg: { flip: [0, 0.35] },
  chapter: { idx: "01 — Openverse API", l1: "В Openverse", l2: "звуки и треки", y: 420, tin: 0.15 },
  counter: { t: L(W("пяти", 17)), to: 5220123, label: "аудио с открытой лицензией", y: 760, dur: 1.4 },
  items: [{ id: "db", kind: "database", x: 540, y: 1180, size: 230, tin: 0.3, ghost: false,
    active: [[L(W("открытой", 19)), 1]], states: [[L(W("открытой", 19)), { open: 1 }]] }],
}));

fs.writeFileSync(path.join(P, "broll/plan.json"), JSON.stringify({ title: "claude-sfx · ночь", video: "../renders/picture.mp4", fps: 25, clips }, null, 1));
fs.writeFileSync(path.join(P, "work/accents.json"), JSON.stringify({ accents }, null, 1));
console.log(`${clips.length} clips, ${accents.length} accent → broll/plan.json, work/accents.json`);
```

Run: `node $N/broll/gen.mjs $N`
Expected: `5 clips, 1 accent → broll/plan.json, work/accents.json`.

- [ ] **Step 4: Глифы, сборка и рендер клипов**

```bash
N=video-projects/2026-10-26-claude-sfx-night
for f in $N/broll/clips/*.html; do node scripts/ru/check-glyphs.mjs --font brand/fonts/GolosText-Variable.ttf --font brand/fonts/Spectral-SemiBoldItalic.ttf \
  --font brand/fonts/IBMPlexMono-Medium.ttf --font brand/fonts/Spectral-ExtraBold.ttf --html $f; done
python3 scripts/ru/broll/build.py $N/broll/dist $N/broll/clips/*.html
for c in 01-hook 03-tools 05-ovapi; do NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/render.js $N/broll/dist/$c.html $N/broll/$c.mov 25; done
for c in 02-acc 04-ov 06-count; do NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/render.js $N/broll/dist/$c.html $N/broll/$c.mp4 25; done
```

Expected: проверка глифов без ошибок; каждый рендер печатает `rendered … frames` без `ERR`. Символ, которого нет в шрифте, — заменить в тексте `gen.mjs` (например, `…` → `...`) и повторить шаг.

Перед полным рендером — кадры каждого клипа на ключевых моментах (beats.js) и их осмотр (Read):

```bash
B="NODE_PATH=./node_modules node .claude/skills/motion-broll/engine/beats.js"
eval $B $N/broll/dist/03-tools.html $N/review/03-beats.png 0.4 1.2 1.9 2.9 3.15
eval $B $N/broll/dist/05-ovapi.html $N/review/05-beats.png 0.3 1.0 1.5 2.5 2.9
eval $B $N/broll/dist/06-count.html $N/review/06-beats.png 0.1 0.6 1.5 2.8
eval $B $N/broll/dist/04-ov.html $N/review/04-beats.png 0.2 0.8 1.4
eval $B $N/broll/dist/02-acc.html $N/review/02-beats.png 0.4 1.2 2.4
```

- [ ] **Step 5: Субтитры в ночи**

```bash
python3 - video-projects/2026-10-26-claude-sfx-night/PLAN.json <<'EOF'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); k = d["captions"]["kinetic"]
k["theme_default"] = "dark"
k["theme_keys"] = [{"at": 16.95, "theme": "light"}, {"at": 20.66, "theme": "dark"}]
json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
print("PLAN.json: captions dark, light 16.95–20.66; hide", d["captions"]["hide"])
EOF
node scripts/ru/make-captions.mjs video-projects/2026-10-26-claude-sfx-night --render
```

Expected: `hide` содержит окно 5,52–8,97 (слово акцента повторяет речь); `renders/kit/captions.mov` создан.

- [ ] **Step 6: Ночная база и сборка**

```bash
N=video-projects/2026-10-26-claude-sfx-night
python3 scripts/ru/wide/night_base.py $N --stills 0.5,3.0,6.6,9.6,11.2,15.5,19.0
python3 scripts/ru/wide/night_base.py $N --mix
node scripts/ru/assemble.mjs $N --final
ffmpeg -v error -y -i $N/renders/final.mp4 -t 20.66 -c:v libx264 -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k $N/renders/slice.mp4
ffmpeg -v error -y -i $N/renders/slice.mp4 -vf scale=540:960 -c:v libx264 -crf 24 -c:a aac -b:a 128k $N/renders/slice.preview.mp4
```

Expected: стиллы `review/night-*.png`; `picture.base.mp4` — 1188 кадров, «маска», акцентов 1; `assemble` печатает итог и `check-reel` (замечания про длительность полного ролика допустимы — у нас кусок); `slice.mp4` длительностью 20,66 с. Стиллы посмотреть до полного прохода: если маска рвётся или контровой свет «светится» — поправить `HALO` или порог маски и повторить стиллы.

- [ ] **Step 7: Самопроверка кадров** (до трёх кругов правок)

```bash
N=video-projects/2026-10-26-claude-sfx-night
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/slice-sheet.png --every 1 --cols 7
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/slice-acc.png --from 5.3 --to 6.3 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/slice-fly.png --from 11.55 --to 12.6 --every 0.08
node scripts/ru/contact-sheet.mjs $N/renders/slice.mp4 --out $N/review/slice-flip.png --from 16.8 --to 17.5 --every 0.08
```

Открыть каждый лист (Read) и проверить по списку, записывая находки в `$N/REVIEW.md`:

- кадр 0: титр и окно уже на месте, глаза открыты (обложка);
- края маски на акценте (5,5–9,0 с) и на жестах рук: нет дыр, «призраков» и мигания; контровой свет — тонкий ореол, а не обводка;
- стыки: на 5,52, 8,97, 11,95, 13,98, 16,95, 20,66 с нет чёрных или пустых кадров, окно не мигает;
- пролёт 11,7–12,0 → окно прилетает из глубины без пустого кадра между ними;
- предметы: линии видны на превью 540×960, подписи читаются, ничего не лезет в зоны интерфейса (x > 960, y > 1420 для текста);
- субтитры не налезают на подписи предметов (y 844–874) и на лицо; на светлом акценте они тёмные;
- глаголы куска по порядку: «глава», «материализация», «дерево и связи», «активный пункт», «сквозной пролёт», «линза», «живой интерфейс», счётчик — шесть разных, без повтора подряд.

Найденное исправить в `gen.mjs` (времена, позиции, размеры) или в коде модулей; при правке кода модулей — тест на этот случай в `tests/night.test.mjs` и отдельный коммит. Пересобрать затронутые клипы и шаг 6.

- [ ] **Step 8: Остановка — показать заказчику**

`SendUserFile`: `renders/slice.mp4` (и путь к `slice.preview.mp4`). В сообщении:

- что в куске по секундам: хук (ночной титр и окно, свет по краю на смене скрина), «не слышит звук» (ночной акцент, слово за головой), «три инструмента» (агент и три предмета-чертежа, связи, галочки, пролёт в базу), Openverse (окно из глубины, линза), «ищет и качает» (живой терминал, зачёркнутый ключ), «пять миллионов» (светлый акцент, счётчик);
- что сделано автоматически (маска, тёмная тема GitHub или замена, если не вышло);
- одна строка из `REVIEW.md`;
- «Звук взят из одобренного финала без изменений. Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

Один вопрос: «Ок по стилю или правки?» Правки — применить, пересобрать затронутое, показать снова.

---

### Task 8: План шага 2 (после «ок» заказчика на кусок)

- [ ] **Step 1:** Записать правки заказчика по куску в `lessons.md` (формат файла, слова заказчика) и в `REVIEW.md` проекта.
- [ ] **Step 2:** Вызвать superpowers:writing-plans и написать `docs/superpowers/plans/<дата>-remake-fast-night-motion-step2.md` по спеке (шаги 2 и 3) с учётом правок: оставшиеся ~24 предмета, глаголы «вытягивание», «слои», «сборка из сетки», «перестройка», «физика предмета», «выноски», «возврат», «морф значка», «строка ввода»; светлый акцент со спикером поверх; темы night для списка и карточки screen-kit; весь claude-sfx `final.night.mp4` и ускоренная версия; раскадровка движений в S3 и `look: night` в remake-fast; `night_base` вместо `obs_base` + `obs_swaps` в скилле; `SHOOT.md` (ровная стена); `brand.md`, `SETUP.md`, `refs/NOTES.md`; `npm run sync:skills`.
