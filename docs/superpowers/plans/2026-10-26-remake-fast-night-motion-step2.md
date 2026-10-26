# Ночной интерфейс и предметы-чертежи — план работ, шаги 2 и 3 (весь claude-sfx, затем по умолчанию в remake-fast)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** довести ночной стиль до полного набора и проверить его на всём claude-sfx. Нужно: 32 предмета-чертежа, все 16 глаголов, ночные список и карточка, светлый акцент со спикером поверх, проверка раскадровки движений. Затем, после «ок» заказчика, сделать ночной стиль стилем remake-fast по умолчанию.

**Architecture:**
- `object-kit.js` получает 26 новых предметов и помощники для плоских фигур (`OK.face`, `OK.plate`, `OK.circ`).
- `object-scene.js` (`OK.run`) получает глаголы:
  - «перестройка» — ключи положения и размера, уход предмета;
  - «выноски»;
  - «возврат»;
  - «физика предмета» — падающие предметы;
  - «морф значка» — шкала с курсором;
  - «строка ввода»;
  - «сборка из сетки» — `OK.gridCells`, им же пользуется screen-kit.
- `screen-kit.js` в теме `night` получает:
  - стеклянный список и ночную карточку;
  - «вытягивание» (`marks` вида `pull`);
  - сборку окна из сетки (`win.enter: 'grid'`);
  - «слои в глубину» (`win.layers`).
- `night_base.py`:
  - на светлом акценте кладёт под спикера мягкую тень вместо ореола;
  - на пропуске маски берёт маску соседа;
  - жёстко останавливается на устаревших масках.
- `make-captions.mjs` сам выбирает тему субтитров при `look: night`.
- Новый `motion-check.mjs` проверяет раскадровку движений.

Весь ролик собирается в том же проекте рядом с одобренным claude-sfx. Одобренный проект не трогаем.

**Tech Stack:** браузерный JS на движке motion-broll (`M.scene`, чистые функции `t`), Playwright (рендер, скриншоты, тесты), Python 3.9 + numpy + Pillow + ffmpeg, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-26-remake-fast-night-motion-design.md`, разделы «Предметы-чертежи», «Язык движений», «Хореография», «Конвейер», «Проверка и внедрение» (шаги 2 и 3).

**Шаг 1 сделан и одобрен** (план `2026-10-26-remake-fast-night-motion.md`, коммиты `4f1d3ff..801e28d`). Заказчик на кусок 0–20,66 с: «Ок по стилю». В `lessons.md` записано: full-клипы стыкуются встык, вход full-клипа после кадра со спикером стартует до склейки.

**Что не входит:**
- `/reel` и `/reel-wide`: смены фона в `make_clips.py` и `look` для широких записей — после шага 3, отдельным планом.
- Дубли без OBS-шаблона (`fx_picture.py`).
- Звук (отложенный план `2026-10-26-remake-fast-sound.md`).
- Платные генерации.

## Global Constraints

- **Цвета:**
  - фон `#0E0B14`;
  - accent_light `#B79CFF`, им же линии;
  - accent `#7C3AED`;
  - ink `#F5F3FA`;
  - canvas `#EFEDF4`;
  - тёмная линия на светлом `#17141C`;
  - тёмное стекло `#1A1428`, `#221B33`, `#2C2342`.
- Линии предметов и рамок — не тоньше 3 px на кадре 1080; подписи — не мельче 30 px.
- Тайминг: входы expo-out 0,6–0,9 с, выходы 0,3–0,4 с, без пружин с отскоком. Каждая смена состояния — на своё слово (время из `transcript.clean.json`).
- Безопасная зона: значимое в y 360–1420, x ≤ 960; для OBS-раскладки верх — от y 200.
- Шрифты только с кириллицей: `SK Sans` (Golos Text), `SK Serif` (Spectral SemiBold Italic), `SK Mono` (IBM Plex Mono), `SK Display` (Spectral ExtraBold). Перед рендером — `scripts/ru/check-glyphs.mjs`.
- Каждый стиль клипа — чистая функция `t`: без CSS-переходов, таймеров и состояния между кадрами (контракт движка).
- Предметы строятся из примитивов `object-kit.js` (`OK.box`, `OK.cyl`, `OK.disc`, `OK.poly`, `OK.face`, `OK.plate`, `OK.circ`) и простых SVG-линий и путей, точки которых считает `OK.iso`. Изометрия одна на всех. Над каждым предметом — строка: что он означает и какие у него состояния. Его `vb` вмещает рисунок при любом состоянии; это проверяет тест.
- Состояния предмета: `open`, `active`, `spin`, `struck`, `play`, `on`, `fill` — числа 0..1 (кроме `t`).
- Глаголы раскадровки — 16 id из `scripts/ru/motion-check.mjs`: `fly`, `pull`, `live`, `layers`, `lens`, `grid`, `materialize`, `rebuild`, `tree`, `physics`, `callouts`, `active`, `chapter`, `return`, `morph`, `prompt`.
- **Стыки** (урок 2026-10-26):
  - full-клипы и панели не перекрываются: out одного = in следующего;
  - full-клип после кадра со спикером начинает вход за 0,08–0,1 с до склейки.
- Одобренный проект `video-projects/2026-10-25-claude-sfx/` не меняется. Весь ролик собирается в `video-projects/2026-10-26-claude-sfx-night/`, исходники — по симлинкам.
- **Только правда на экране.** Числа, ответы API, названия и набор звуков берутся из исходного проекта и `brand/sfx/kit.json`: `screens/make-screens.mjs` claude-sfx, ответы от 2026-10-25.
- Новых зависимостей нет.
- Тесты — в `tests/night.test.mjs`, запуск `node --test tests/night.test.mjs`. В конце каждой задачи `npm test` должен быть зелёным.
- Коммит каждой задачи — только её файлы, сообщение заканчивается `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Удаление `inbox/.gitkeep` не коммитить.
- Каждый отчёт со звуком заканчивается строкой «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

## Карта файлов

| Файл | Что делает |
|---|---|
| `scripts/ru/broll/object-kit.js` (правка) | помощники `OK.face`, `OK.plate`, `OK.circ`; 26 новых предметов; список предметов в шапке |
| `scripts/ru/broll/object-scene.js` (правка) | состояния `on`/`fill`; глаголы «перестройка» (`keys`, `tout`), «выноски», «возврат», «физика предмета» (`drops`), «морф значка» (`morph`), «строка ввода» (`prompt`), «сборка из сетки» (`assemble`, `OK.gridCells`) |
| `scripts/ru/broll/screen-kit.js` (правка) | тема night: стеклянный список, ночная карточка, `pull`, `win.enter: 'grid'`, `win.layers` |
| `scripts/ru/wide/night_base.py` (правка) | светлый акцент: тень вместо ореола; пропуск маски — маска соседа; стоп при > 5 % пропусков; проверки `--prep`; мелочи ревью шага 1 |
| `scripts/ru/make-captions.mjs` (правка) | `nightCaptions`: при `look: night` субтитры тёмные, на светлых окнах — светлые |
| `scripts/ru/motion-check.mjs` (новый) | проверка раскадровки движений `PLAN.json` → `motion`, `MOTION.md` |
| `tests/night.test.mjs` (правка) | тесты всего перечисленного |
| `video-projects/2026-10-26-claude-sfx-night/` (локально, не в git) | весь claude-sfx в ночи: `screens/make-dark.mjs`, `broll/gen.mjs`, клипы, рендеры, `REVIEW.md`, `MOTION.md` |
| `.claude/skills/remake-fast/SKILL.md`, `.claude/skills/vladilen-reels/SKILL.md`, `.claude/skills/reel-remake/references/formats.md`, `brand/brand.md`, `SETUP.md` (правки, задача 10) | ночной стиль по умолчанию в remake-fast |

## Порядок

- Задачи 1–8 — код, по свежему исполнителю на задачу, ревью после каждой.
- После задачи 8 — ревью всей ветки от `801e28d`, до рендера ролика: ошибки модулей дешевле поймать до 50 секунд рендера.
- Задача 9 — главная сессия. Она кончается остановкой для заказчика.
- Задача 10 — только после «ок» на весь ролик.

---

### Task 1: Предметы, часть 1 — рабочее место (9 предметов) и помощники

**Files:**
- Modify: `scripts/ru/broll/object-kit.js` (помощники после `const line = …`, предметы в конец перед `})();`, строка о состояниях в шапке)
- Modify: `scripts/ru/broll/object-scene.js:201` (состояния по умолчанию)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `OK.iso`, `OK.box`, `OK.cyl`, `OK.disc`, `OK.poly`, внутренние `f1`, `pts`, `tag`, `at`, `line` из `object-kit.js`; `OK.run` items из `object-scene.js`.
- Produces:
  - `OK.face(xz, y = 0, cls = 'fl', id)` — многоугольник в плоскости y из пар `[x, z]`;
  - `OK.plate(xz, d, {id, b, f})` — тот же контур на y = −d (класс `b`, по умолчанию `fr`) и на y = 0 (класс `f`, по умолчанию `fl`) в `<g data-p=id>`;
  - `OK.circ(cx, cz, r, n = 28, a0 = 0)` — точки окружности в плоскости x-z;
  - предметы `OK.O.document`, `laptop`, `terminal`, `browser`, `phone`, `chat`, `code`, `graph`, `server`;
  - состояния `on` и `fill` по умолчанию 0 в `OK.run`;
  - тестовый помощник `checkObjects(kinds)` в `tests/night.test.mjs` — им пользуются задачи 2 и 3.

- [ ] **Step 1: Write the failing test** — дописать в `tests/night.test.mjs` после теста «object kit: true isometric projection…»:

```js
// every object of a batch: drawn in both themes, every pose extreme (t 0.2: all states 0; t 1.6: all 1) stays
// inside its vb (±4 units), nothing throws. A failure prints the bbox: widen that object's vb, never move the drawing.
async function checkObjects(kinds) {
  const items = kinds.map((kind, i) => ({ id: "o" + i, kind, x: 140 + (i % 4) * 260, y: 300 + Math.floor(i / 4) * 330, size: 200, tin: 0, ghost: false,
    states: [[0.5, { open: 1, fill: 1, on: 1, spin: 0.5, play: 1, struck: 1 }, 0.2]], active: [[0.5, 1]] }));
  for (const theme of ["night", "light"]) {
    const c = await openClip(scene({ T: 2, mode: "full", theme, items }));
    try {
      for (const t of [0.2, 1.6]) {
        const out = await c.at(t, (ids) => ids.map((id) => {
          const svg = document.getElementById("ok-item-" + id), b = svg.querySelector(".okobj").getBBox();
          return { id, vb: svg.getAttribute("viewBox").split(" ").map(Number), bb: [b.x, b.y, b.width, b.height] };
        }), items.map((it) => it.id));
        for (const o of out) {
          const [x, y, w, h] = o.vb, [bx, by, bw, bh] = o.bb, kind = kinds[+o.id.slice(1)];
          assert.ok(bw > 20 && bh > 20, `${kind} ${theme} t=${t}: drawn (${o.bb})`);
          assert.ok(bx >= x - 4 && by >= y - 4 && bx + bw <= x + w + 4 && by + bh <= y + h + 4,
            `${kind} ${theme} t=${t}: bbox ${o.bb.map(Math.round)} outside vb ${o.vb}`);
        }
      }
      assert.deepEqual(c.errors, []);
    } finally { await c.browser.close(); }
  }
}

test("object kit, part 1: the work desk — nine objects in both themes, every pose inside its box", { timeout: 120000 }, async () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8"), ctx);
  const OK = ctx.window.OK;
  assert.equal(typeof OK.face, "function");
  assert.match(OK.face([[0, 0], [10, 0], [10, 10]], 0, "fl", "q"), /<polygon class="fl" data-p="q" points="0,0 8\.7,5 8\.7,-5"\/>/);
  assert.match(OK.plate([[0, 0], [10, 0], [10, 10]], 8, { id: "p" }), /^<g data-p="p"><polygon class="fr"[^>]*\/><polygon class="fl"[^>]*\/><\/g>$/);
  assert.equal(OK.circ(0, 0, 10, 4).length, 4);
  await checkObjects(["document", "laptop", "terminal", "browser", "phone", "chat", "code", "graph", "server"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "part 1" tests/night.test.mjs`
Expected: FAIL — `OK.face` is not a function (`typeof OK.face` is `undefined`).

- [ ] **Step 3: Помощники** — в `scripts/ru/broll/object-kit.js` сразу после строки `const line = (a, b, id, extra = '') => …;` вставить:

```js
const c01 = (v) => Math.max(0, Math.min(1, v));
// a polygon standing in the plane y from [x, z] pairs; a plate: the same outline at y −d (the side tone) and at y 0
const face = OK.face = (xz, y = 0, cls = 'fl', id) => OK.poly(xz.map(([x, z]) => [x, y, z]), cls, id);
const plate = OK.plate = (xz, d, c = {}) => `<g${tag(c.id)}>${face(xz, -d, c.b || 'fr')}${face(xz, 0, c.f || 'fl')}</g>`;
// n points of a circle of radius r around (cx, cz) in the x-z plane, from the angle a0
const circ = OK.circ = (cx, cz, r, n = 28, a0 = 0) => Array.from({length: n}, (_, i) => {
  const a = a0 + i / n * Math.PI * 2; return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
});
```

В шапке файла заменить строку

```
     s     {t, active, open, spin, struck, play}: numbers, 0..1 except t (clip seconds) — pose is a pure function of s
```

на

```
     s     {t, active, open, spin, struck, play, on, fill}: numbers, 0..1 except t (clip seconds) — pose is a pure function of s
```

и последнюю строку шапки `   A new object: compose it from OK.box / OK.cyl / OK.disc / OK.poly, give moving parts a data-p, write its pose. */` целиком заменить на две строки:

```
   A new object: compose it from OK.box / OK.cyl / OK.disc / OK.poly / OK.face / OK.plate / OK.circ, give moving parts a
   data-p, write its pose; its vb must hold every pose (tests/night.test.mjs checkObjects). */
```

- [ ] **Step 4: Состояния по умолчанию** — в `scripts/ru/broll/object-scene.js` строку

```js
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0};
```

заменить на

```js
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0, on: 0, fill: 0};
```

- [ ] **Step 5: Девять предметов** — в `scripts/ru/broll/object-kit.js` перед последней строкой `})();` вставить:

```js
// ---------- the work desk ----------

// document (a file, a README, a page): a sheet with a folded corner over two more; open slides the top sheet off,
// fill lights its lines one by one (a page being read), active tints it
const SHEET = [[-45, 0], [45, 0], [45, 100], [25, 120], [-45, 120]];
OK.O.document = {
  vb: [-62, -162, 120, 190],
  svg: () => face(SHEET, -16, 'fr') + face(SHEET, -8, 'fr')
    + `<g data-p="pg">${face(SHEET, 0, 'fl', 'sh')}${face([[25, 120], [25, 100], [45, 100]], 0, 'ft')}`
    + [90, 76, 62, 48, 34].map((z, i) => { const x1 = i === 4 ? 6 : 30; return face([[-32, z], [x1, z], [x1, z + 6], [-32, z + 6]], 0, 'fd', 'l' + i); }).join('')
    + '</g>',
  pose: (P, s, T) => {
    P.pg.setAttribute('transform', `translate(${f1(-18 * s.open)} ${f1(-14 * s.open)})`);
    for (let i = 0; i < 5; i++) P['l' + i].style.fill = s.fill * 5 > i + 0.5 ? T.on : '';
    P.sh.style.fill = s.active > 0.5 ? `rgba(${T.glow},.30)` : '';
  },
};

// laptop (a computer, the work itself): a base with keys; open raises the lid (0 closed … 1 open), on lights the screen
const lid = (o, inset = 0) => {
  const a = o * 1.75, c = Math.cos(a), s = Math.sin(a), w = 66 - inset;
  const p = (d) => [-50 + d * c, 8 + d * s], [ya, za] = p(inset), [yb, zb] = p(92 - inset);
  return [[-w, ya, za], [w, ya, za], [w, yb, zb], [-w, yb, zb]];
};
OK.O.laptop = {
  vb: [-110, -174, 232, 242],
  svg: () => OK.box(-70, -50, 0, 140, 100, 8)
    + [-30, -8, 14].map((y) => OK.poly([[-50, y, 8], [50, y, 8], [50, y + 14, 8], [-50, y + 14, 8]], 'fd')).join('')
    + OK.poly(lid(1), 'fr', 'lid') + OK.poly(lid(1, 7), 'ft', 'scr'),
  pose: (P, s, T) => {
    P.lid.setAttribute('points', pts(lid(s.open)));
    P.scr.setAttribute('points', pts(lid(s.open, 7)));
    P.scr.style.display = s.open < 0.35 ? 'none' : '';
    P.scr.style.fill = s.on > 0.01 ? `rgba(${T.glow},${(0.2 + 0.5 * s.on).toFixed(2)})` : '';
  },
};

// terminal (a command line, a run): a dark panel; fill types its rows one by one, active blinks the accent caret
const ROWS = [[66, 74], [50, 40], [34, 58], [18, 30]];
OK.O.terminal = {
  vb: [-70, -150, 148, 196],
  svg: () => OK.box(-70, -8, 0, 140, 8, 100)
    + face([[-70, 84], [70, 84], [70, 100], [-70, 100]], 0, 'ft')
    + [-58, -48, -38].map((x) => face(circ(x, 92, 3.5, 10), 0, 'fd')).join('')
    + ROWS.map(([z, w], i) => face([[-56, z], [-56 + w, z], [-56 + w, z + 7], [-56, z + 7]], 0, 'fd', 'r' + i)).join('')
    + face([[0, 0], [6, 0], [6, 10], [0, 10]], 0, 'fa', 'car'),
  pose: (P, s) => {
    const n = s.fill * ROWS.length;
    ROWS.forEach(([z, w], i) => {
      const k = c01(n - i), r = P['r' + i];
      r.style.opacity = k > 0 ? '1' : '0';
      r.setAttribute('points', pts([[-56, 0, z], [-56 + w * k, 0, z], [-56 + w * k, 0, z + 7], [-56, 0, z + 7]]));
    });
    const i = Math.min(ROWS.length - 1, Math.floor(n)), [z, w] = ROWS[i], p = at(-52 + w * c01(n - i), 0, z - 1);
    P.car.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
    P.car.style.opacity = s.active > 0.5 && Math.floor(s.t * 2.5) % 2 === 0 ? '1' : '0';
  },
};

// browser (a site, a web app): a window with an address bar, a picture and text; active lights the picture,
// fill highlights the text lines (a passage being read)
OK.O.browser = {
  vb: [-80, -164, 166, 214],
  svg: () => OK.box(-80, -8, 0, 160, 8, 110)
    + face([[-80, 94], [80, 94], [80, 110], [-80, 110]], 0, 'ft')
    + face([[-40, 98], [52, 98], [52, 106], [-40, 106]], 0, 'fd')
    + [-70, -62, -54].map((x) => face(circ(x, 102, 3, 10), 0, 'fd')).join('')
    + face([[-66, 22], [-8, 22], [-8, 80], [-66, 80]], 0, 'ft', 'img')
    + face([[-56, 30], [-36, 58], [-24, 44], [-16, 30]], 0, 'fd')
    + [72, 58, 44, 30].map((z, i) => { const x1 = i % 2 ? 50 : 66; return face([[4, z], [x1, z], [x1, z + 6], [4, z + 6]], 0, 'fd', 'l' + i); }).join(''),
  pose: (P, s, T) => {
    P.img.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.25 + 0.45 * s.active).toFixed(2)})` : '';
    for (let i = 0; i < 4; i++) P['l' + i].style.fill = s.fill * 4 > i + 0.5 ? T.on : '';
  },
};

// phone (a mobile app, a message): a slab with a screen; on lights the screen, fill slides a notification in
OK.O.phone = {
  vb: [-38, -148, 78, 172],
  svg: () => OK.box(-30, -6, 0, 60, 6, 118)
    + face([[-24, 8], [24, 8], [24, 108], [-24, 108]], 0, 'ft', 'scr')
    + face([[-8, 111], [8, 111], [8, 114], [-8, 114]], 0, 'fd')
    + face([[-20, 80], [20, 80], [20, 98], [-20, 98]], 0, 'fa', 'note'),
  pose: (P, s, T) => {
    P.scr.style.fill = s.on > 0.01 ? `rgba(${T.glow},${(0.2 + 0.45 * s.on).toFixed(2)})` : '';
    P.note.style.opacity = s.fill.toFixed(3);
    P.note.setAttribute('transform', `translate(0 ${f1(14 * (1 - s.fill))})`);
  },
};

// chat (a conversation, an answer): a question bubble and an accent answer; fill brings the answer in,
// play shows the typing dots in it
OK.O.chat = {
  vb: [-72, -158, 152, 216],
  svg: () => OK.box(-70, -6, 60, 90, 6, 50) + face([[-60, 60], [-70, 46], [-44, 60]], 0, 'fl')
    + face([[-56, 92], [6, 92], [6, 98], [-56, 98]], 0, 'fd') + face([[-56, 76], [-14, 76], [-14, 82], [-56, 82]], 0, 'fd')
    + `<g data-p="b1">${OK.box(-20, -6, 4, 90, 6, 42, {l: 'fa'})}${face([[56, 4], [70, -8], [44, 4]], 0, 'fa')}`
    + [8, 24, 40].map((x, i) => face(circ(x, 25, 4.5, 10), 0, 'fi', 'd' + i)).join('') + '</g>',
  pose: (P, s) => {
    P.b1.style.opacity = s.fill.toFixed(3);
    P.b1.setAttribute('transform', `translate(${f1(10 * (1 - s.fill))} ${f1(8 * (1 - s.fill))})`);
    for (let i = 0; i < 3; i++) P['d' + i].style.opacity = s.play > 0.01 ? (0.35 + 0.65 * Math.max(0, Math.sin(s.t * 7 - i * 0.9))).toFixed(3) : '1';
  },
};

// code (</>): an extruded glyph; active lights the slash, play breathes the brackets apart
const LT = [[-20, 90], [-60, 55], [-20, 20], [-8, 32], [-36, 55], [-8, 78]];
const SL = [[6, 96], [18, 96], [-6, 14], [-18, 14]];
OK.O.code = {
  vb: [-62, -112, 130, 106],
  svg: () => plate(LT, 8, {id: 'lt'}) + plate(SL, 8, {id: 'sl'}) + plate(LT.map(([x, z]) => [-x, z]), 8, {id: 'rt'}),
  pose: (P, s, T) => {
    const d = 6 * s.play * Math.sin(s.t * 3);
    P.lt.setAttribute('transform', `translate(${f1(-d * 0.866)} ${f1(-d * 0.5)})`);
    P.rt.setAttribute('transform', `translate(${f1(d * 0.866)} ${f1(d * 0.5)})`);
    P.sl.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// graph (a knowledge graph, a pipeline): nodes on the floor; fill draws the edges one by one, active lights the hub
const NODES = [[0, 0], [-62, -34], [62, -40], [-40, 62], [56, 50]];
OK.O.graph = {
  vb: [-112, -76, 224, 146],
  svg: () => NODES.slice(1).map(([x, y], i) => { const a = at(0, 0, 10), b = at(x, y, 10);
      return `<line class="ln" data-p="e${i}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" pathLength="1" style="vector-effect:none;stroke-width:5;stroke-dasharray:1;stroke-dashoffset:1"/>`; }).join('')
    + NODES.map(([x, y], i) => OK.cyl(x, y, 0, i ? 14 : 20, i ? 10 : 14, {id: 'n' + i})).join(''),
  pose: (P, s, T) => {
    for (let i = 0; i < 4; i++) P['e' + i].style.strokeDashoffset = (1 - c01(s.fill * 4 - i)).toFixed(4);
    P.n0.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
  },
};

// server (a backend, hosting, an API): three rack units; active lights the LEDs, play makes them blink in turn
OK.O.server = {
  vb: [-86, -150, 172, 204],
  svg: () => [0, 1, 2].map((i) => OK.box(-50, -40, i * 34, 100, 80, 28)
    + OK.poly([[-38, 40, i * 34 + 10], [10, 40, i * 34 + 10], [10, 40, i * 34 + 16], [-38, 40, i * 34 + 16]], 'fd')
    + OK.poly([[26, 40, i * 34 + 9], [36, 40, i * 34 + 9], [36, 40, i * 34 + 17], [26, 40, i * 34 + 17]], 'fd', 'led' + i)).join(''),
  pose: (P, s, T) => {
    for (let i = 0; i < 3; i++) {
      const on = s.active > 0.5, blink = s.play > 0.01 && Math.floor(s.t * 4 + i) % 3 !== 0 ? 0.35 : 1;
      P['led' + i].style.fill = on ? T.on : '';
      P['led' + i].style.opacity = on ? String(blink) : '1';
    }
  },
};
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test --test-name-pattern "part 1" tests/night.test.mjs`
Expected: PASS. Если тест пишет `bbox … outside vb …` для какого-то предмета — расширить `vb` этого предмета до напечатанного bbox, округлив наружу до чётного числа и добавив 4. Рисунок не менять.

- [ ] **Step 7: Весь набор тестов**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное (тест шага 1 «six objects…» не меняется и проходит).

- [ ] **Step 8: Commit**

```bash
git add scripts/ru/broll/object-kit.js scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Object kit: face/plate/circ helpers and the work desk — document, laptop, terminal, browser, phone, chat, code, graph, server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Предметы, часть 2 — инструменты (9 предметов)

**Files:**
- Modify: `scripts/ru/broll/object-kit.js` (в конец, перед `})();`)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `face`, `plate`, `circ`, `c01`, `at`, `pts`, `f1` из задачи 1; `checkObjects(kinds)` из `tests/night.test.mjs`.
- Produces: `OK.O.cloud`, `lock`, `gear`, `magnifier`, `star`, `plugin`, `camera`, `mic`, `montage`.

- [ ] **Step 1: Write the failing test** — после теста «object kit, part 1…»:

```js
test("object kit, part 2: tools — nine objects in both themes, every pose inside its box", { timeout: 120000 }, async () => {
  await checkObjects(["cloud", "lock", "gear", "magnifier", "star", "plugin", "camera", "mic", "montage"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "part 2" tests/night.test.mjs`
Expected: FAIL — `OK: unknown object cloud` в `c.errors`.

- [ ] **Step 3: Девять предметов** — в `scripts/ru/broll/object-kit.js` перед `})();`:

```js
// ---------- tools ----------

// cloud (a hosted service, sync, deploy): a puffy plate; active shows the upload arrow, play bobs it
const CL = [[-40, 40, 28], [0, 58, 36], [40, 40, 28]];
const CLOUD = (() => {
  const top = [], bot = [];
  for (let x = -68; x <= 68.001; x += 4) {
    let zt = -Infinity;
    for (const [cx, cz, r] of CL) if (Math.abs(x - cx) <= r) zt = Math.max(zt, cz + Math.sqrt(r * r - (x - cx) ** 2));
    const [sx, sz, sr] = CL[x < 0 ? 0 : 2], dx = Math.abs(x - sx);
    top.push([x, zt]); bot.push([x, Math.abs(x) <= 40 ? 12 : sz - Math.sqrt(Math.max(0, sr * sr - dx * dx))]);
  }
  return [...top, ...bot.reverse()];
})();
OK.O.cloud = {
  vb: [-66, -112, 144, 130],
  svg: () => plate(CLOUD, 14) + face([[-8, 22], [8, 22], [8, 42], [18, 42], [0, 62], [-18, 42], [-8, 42]], 0, 'fa', 'up'),
  pose: (P, s) => {
    P.up.style.opacity = s.active.toFixed(3);
    P.up.setAttribute('transform', `translate(0 ${f1(-6 * s.play * Math.abs(Math.sin(s.t * 3)))})`);
  },
};

// lock (security, a login, a paywall): a body and a shackle; open lifts the shackle, active lights the keyhole
const SHACKLE = (() => {
  const o = [], i = [];
  for (let k = 0; k <= 12; k++) { const a = Math.PI * k / 12; o.push([28 * Math.cos(a), 90 + 28 * Math.sin(a)]); i.push([18 * Math.cos(a), 90 + 18 * Math.sin(a)]); }
  return [[28, 66], ...o, [-28, 66], [-18, 66], ...i.reverse(), [18, 66]];
})();
OK.O.lock = {
  vb: [-54, -146, 108, 180],
  svg: () => `<g data-p="sh">${plate(SHACKLE, 8)}</g>` + OK.box(-40, -14, 0, 80, 28, 70)
    + OK.disc(0, 14, 42, 9, 'y', 'fd', 'kh') + OK.poly([[-3, 14, 20], [3, 14, 20], [3, 14, 38], [-3, 14, 38]], 'fd', 'ks'),
  pose: (P, s, T) => {
    P.sh.setAttribute('transform', `translate(0 ${f1(-16 * s.open)})`);
    for (const e of [P.kh, P.ks]) e.style.fill = s.active > 0.5 ? T.on : '';
  },
};

// gear (settings, automation, a process): a cog facing us; spin turns it, play keeps it turning
const cog = (a0) => Array.from({length: 40}, (_, k) => {
  const a = a0 + k / 40 * Math.PI * 2, r = k % 4 < 2 ? 50 : 38; return [r * Math.cos(a), 60 + r * Math.sin(a)];
});
OK.O.gear = {
  vb: [-50, -128, 110, 132],
  svg: () => plate(cog(0), 10, {id: 'cg'}) + face(circ(0, 60, 14, 20), 0, 'fd'),
  pose: (P, s) => {
    const xz = cog((s.spin + s.t * 0.2 * s.play) * Math.PI * 2);
    P.cg.firstChild.setAttribute('points', pts(xz.map(([x, z]) => [x, -10, z])));
    P.cg.lastChild.setAttribute('points', pts(xz.map(([x, z]) => [x, 0, z])));
  },
};

// magnifier (search, a detail, review): a ring on a handle; active lights the glass, play runs a glint across it
OK.O.magnifier = {
  vb: [-52, -140, 116, 168],
  svg: () => { const a = at(-24, 0, 92), b = at(-12, 0, 102);
    return plate([[20, 50], [30, 58], [62, 18], [52, 10]], 8) + plate(circ(-10, 80, 40, 32), 8)
      + face(circ(-10, 80, 30, 32), 0, 'ft', 'gl')
      + `<line class="ln" data-p="gn" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="opacity:0"/>`; },
  pose: (P, s, T) => {
    P.gl.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.2 + 0.4 * s.active).toFixed(2)})` : '';
    const u = (s.t * 0.7) % 1;
    P.gn.style.opacity = s.play > 0.01 ? (s.play * Math.sin(Math.PI * u)).toFixed(3) : '0';
    P.gn.setAttribute('transform', `translate(${f1(30 * u * 0.866)} ${f1(30 * u * 0.5)})`);
  },
};

// star (GitHub stars, a rating, favourites): a five-point star; active fills it with the accent, play twinkles it
const STAR = Array.from({length: 10}, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 52; return [r * Math.cos(a), 60 + r * Math.sin(a)]; });
OK.O.star = {
  vb: [-52, -128, 114, 134],
  svg: () => plate(STAR, 10, {id: 'st'}),
  pose: (P, s, T) => {
    P.st.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
    const [cx, cy] = OK.iso(0, 0, 60), k = 1 + 0.06 * s.play * Math.sin(s.t * 5);
    P.st.setAttribute('transform', `translate(${f1(cx)} ${f1(cy)}) scale(${k.toFixed(4)}) translate(${f1(-cx)} ${f1(-cy)})`);
  },
};

// plugin (a plugin, an integration): two puzzle pieces; open slides the second one in until it covers the knob,
// active tints it
OK.O.plugin = {
  vb: [-110, -90, 232, 164],
  svg: () => OK.box(-84, -37, 0, 74, 74, 20) + OK.cyl(4, 0, 0, 12, 20)
    + `<g data-p="pb">${OK.box(4, -37, 0, 74, 74, 20)}</g>`,
  pose: (P, s, T) => {
    const d = 22 * (1 - s.open);
    P.pb.setAttribute('transform', `translate(${f1(d * 0.866)} ${f1(d * 0.5)})`);
    P.pb.querySelectorAll('polygon')[2].style.fill = s.active > 0.5 ? `rgba(${T.glow},.45)` : '';
  },
};

// camera (filming, a video, the take): a body, a lens and a viewfinder; play blinks the REC dot, active lights the lens
OK.O.camera = {
  vb: [-78, -114, 156, 164],
  svg: () => { const r = at(38, 30, 50);
    return OK.box(-50, -30, 0, 100, 60, 60) + OK.box(-30, -20, 60, 40, 30, 18)
      + OK.disc(6, 30, 30, 22, 'y', 'ft') + OK.disc(6, 30, 30, 13, 'y', 'fd', 'lens')
      + `<circle class="fa" data-p="rec" cx="${r[0]}" cy="${r[1]}" r="6"/>`; },
  pose: (P, s, T) => {
    P.lens.style.fill = s.active > 0.01 ? `rgba(${T.glow},${(0.3 + 0.5 * s.active).toFixed(2)})` : '';
    P.rec.style.opacity = s.play > 0.01 ? (Math.floor(s.t * 2) % 2 ? '0.25' : '1') : '0.5';
  },
};

// mic (a voice, a recording, a podcast): a capsule on a stand; play sends waves out both sides, active lights its top
OK.O.mic = {
  vb: [-64, -134, 128, 158],
  svg: () => {
    const [cx, cy] = OK.iso(0, 0, 82);
    const waves = [0, 1].map((i) => [-1, 1].map((side) => { const R = 40 + 16 * i, x = f1(cx + side * R * 0.5);
      return `<path class="ln" data-p="w${i}${side > 0 ? 'r' : 'l'}" d="M${x},${f1(cy - R * 0.866)} A${R},${R} 0 0 ${side > 0 ? 1 : 0} ${x},${f1(cy + R * 0.866)}" style="opacity:0"/>`;
    }).join('')).join('');
    return OK.cyl(0, 0, 0, 30, 6) + OK.box(-4, -4, 6, 8, 8, 48) + OK.cyl(0, 0, 54, 22, 52, {id: 'cap'})
      + [66, 78, 90].map((z) => OK.poly([[25.5, 5.7, z], [5.7, 25.5, z], [5.7, 25.5, z + 4], [25.5, 5.7, z + 4]], 'fd')).join('') + waves;
  },
  pose: (P, s, T) => {
    P.cap.lastChild.style.fill = s.active > 0.5 ? T.accent : '';
    for (const i of [0, 1]) for (const side of ['l', 'r'])
      P['w' + i + side].style.opacity = (s.play * Math.pow(0.5 + 0.5 * Math.sin(s.t * 6 - i * 1.2), 2)).toFixed(3);
  },
};

// montage (editing, cuts): a film strip with scissors over it; struck cuts the strip (its halves part),
// open opens the blades, play snips
const PV = [-40, 72];
const blade = (phi) => {
  const dx = Math.cos(phi), dz = Math.sin(phi), nx = -dz * 6, nz = dx * 6;
  return [[PV[0] + nx, PV[1] + nz], [PV[0] + 64 * dx, PV[1] + 64 * dz], [PV[0] - nx, PV[1] - nz]];
};
const grip = (phi) => circ(PV[0] - 34 * Math.cos(phi), PV[1] - 34 * Math.sin(phi), 11, 16);
OK.O.montage = {
  vb: [-106, -146, 212, 210],
  svg: () => [0, 1].map((h) => `<g data-p="h${h}">${OK.box(h ? 2 : -92, -18, 0, 90, 36, 6)}`
      + [0, 1, 2, 3].map((k) => { const x0 = (h ? 10 : -84) + k * 21;
        return OK.poly([[x0, -10, 6], [x0 + 16, -10, 6], [x0 + 16, 10, 6], [x0, 10, 6]], 'fd'); }).join('') + '</g>').join('')
    + face(blade(-0.9), 0, 'ft', 'b0') + face(blade(-0.9), 0, 'ft', 'b1')
    + face(grip(-0.9), 0, 'fl', 'g0') + face(grip(-0.9), 0, 'fl', 'g1')
    + face(circ(PV[0], PV[1], 4, 10), 0, 'fa'),
  pose: (P, s) => {
    const th = 0.06 + 0.3 * c01(s.open + s.play * 0.5 * (1 + Math.sin(s.t * 9))), d = 8 * s.struck;
    for (const [i, sg] of [[0, 1], [1, -1]]) {
      const phi = -0.9 + sg * th;
      P['b' + i].setAttribute('points', pts(blade(phi).map(([x, z]) => [x, 0, z])));
      P['g' + i].setAttribute('points', pts(grip(phi).map(([x, z]) => [x, 0, z])));
    }
    P.h0.setAttribute('transform', `translate(${f1(-d * 0.866)} ${f1(-d * 0.5)})`);
    P.h1.setAttribute('transform', `translate(${f1(d * 0.866)} ${f1(d * 0.5)})`);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern "part 2" tests/night.test.mjs`
Expected: PASS. Если bbox вышел за `vb`, действовать по тому же правилу, что в задаче 1, шаг 6.

- [ ] **Step 5: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/broll/object-kit.js tests/night.test.mjs
git commit -m "Object kit: tools — cloud, lock, gear, magnifier, star, plugin, camera, mic, montage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Предметы, часть 3 — смысл, деньги, звук (8 предметов) и список в шапке

**Files:**
- Modify: `scripts/ru/broll/object-kit.js` (в конец перед `})();`; список предметов в шапке)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: помощники задачи 1; `checkObjects`.
- Produces:
  - `OK.O.fan`, `chart`, `clock`, `money`, `checklist`, `mail`, `rocket`, `ear`;
  - в шапке `object-kit.js` — список всех 32 предметов и их состояний (по нему Claude выбирает предмет в S3).

- [ ] **Step 1: Write the failing test** — после теста «object kit, part 2…»:

```js
test("object kit, part 3: meaning, money, sound — eight objects, 32 in all, each listed in the header", { timeout: 120000 }, async () => {
  const src = readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8");
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const kinds = Object.keys(ctx.window.OK.O);
  assert.equal(kinds.length, 32, kinds.join(" "));
  const head = src.slice(0, src.indexOf("(function(){"));
  for (const k of kinds) assert.match(head, new RegExp(`\\b${k}\\b`), `${k} is listed in the header`);
  await checkObjects(["fan", "chart", "clock", "money", "checklist", "mail", "rocket", "ear"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "part 3" tests/night.test.mjs`
Expected: FAIL — `24 !== 32`.

- [ ] **Step 3: Восемь предметов** — в `scripts/ru/broll/object-kit.js` перед `})();`:

```js
// ---------- meaning, money, sound ----------

// fan (colours, a palette, options): five swatches on one pin; open spreads them, active lights the top one
const swatch = (a) => {
  const dx = Math.sin(a), dz = Math.cos(a), nx = dz * 13, nz = -dx * 13;
  return [[nx, 12 + nz], [nx + 100 * dx, 12 + nz + 100 * dz], [-nx + 100 * dx, 12 - nz + 100 * dz], [-nx, 12 - nz]];
};
OK.O.fan = {
  vb: [-68, -132, 136, 140],
  svg: () => ['fl', 'fr', 'ft', 'fr', 'fa'].map((c, i) => face(swatch(0), 0, c, 's' + i)).join('') + face(circ(0, 12, 6, 12), 0, 'fi'),
  pose: (P, s, T) => {
    for (let i = 0; i < 5; i++) P['s' + i].setAttribute('points', pts(swatch((i - 2) * 0.32 * s.open).map(([x, z]) => [x, 0, z])));
    P.s4.style.fill = s.active > 0.5 ? T.on : '';
  },
};

// chart (growth, metrics, results): bars on a plate and a trend line; fill grows the bars and draws the line,
// active lights the last bar
const BARS = [36, 58, 74, 104];
const bar = (i, h) => OK.box(-60 + i * 32, -14, 6, 22, 28, Math.max(2, h), i === 3 ? {t: 'fa'} : {});
OK.O.chart = {
  vb: [-94, -110, 188, 168],
  svg: () => OK.box(-70, -30, 0, 140, 60, 6) + BARS.map((h, i) => `<g data-p="b${i}">${bar(i, h)}</g>`).join('')
    + `<polyline class="ln" data-p="tr" points="${BARS.map((h, i) => at(-49 + i * 32, 0, 6 + h + 14).join(',')).join(' ')}" pathLength="1" style="vector-effect:none;stroke-width:5;stroke-dasharray:1;stroke-dashoffset:1"/>`,
  pose: (P, s, T) => {
    const k = 0.15 + 0.85 * s.fill;
    BARS.forEach((h, i) => { P['b' + i].innerHTML = bar(i, h * k); });
    P.b3.querySelectorAll('polygon')[2].style.fill = s.active > 0.5 ? T.on : '';
    P.tr.style.strokeDashoffset = (1 - c01((s.fill - 0.5) * 2)).toFixed(4);
  },
};

// clock (time, a deadline, hours saved): a face with ticks and hands; spin turns the minute hand (spin 1 = an hour),
// play runs the accent second hand, active lights the centre
const hand = (a, r) => [[0, 60], [r * Math.sin(a), 60 + r * Math.cos(a)]];
OK.O.clock = {
  vb: [-50, -128, 110, 134],
  svg: () => plate(circ(0, 60, 50, 36), 10) + face(circ(0, 60, 42, 36), 0, 'ft')
    + Array.from({length: 12}, (_, k) => { const a = k * Math.PI / 6, r0 = k % 3 ? 36 : 32;
      const p = at(r0 * Math.sin(a), 0, 60 + r0 * Math.cos(a)), q = at(40 * Math.sin(a), 0, 60 + 40 * Math.cos(a));
      return `<line class="ln" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`; }).join('')
    + ['hh', 'mh', 'sh'].map((id) => `<line class="ln" data-p="${id}"/>`).join('') + face(circ(0, 60, 5, 12), 0, 'fa', 'c'),
  pose: (P, s, T) => {
    const set = (e, a, r) => { const [p, q] = hand(a, r).map(([x, z]) => at(x, 0, z));
      e.setAttribute('x1', p[0]); e.setAttribute('y1', p[1]); e.setAttribute('x2', q[0]); e.setAttribute('y2', q[1]); };
    set(P.mh, s.spin * Math.PI * 2, 34); set(P.hh, (0.25 + s.spin / 12) * Math.PI * 2, 22); set(P.sh, s.t * Math.PI / 3, 38);
    P.sh.style.opacity = s.play > 0.01 ? '1' : '0'; P.sh.style.stroke = T.accent;
    P.c.style.fill = s.active > 0.5 ? T.on : '';
  },
};

// money (revenue, a price, savings): a banknote and a coin stack; fill grows the stack (1 → 5 coins),
// active lights the top coin
OK.O.money = {
  vb: [-108, -58, 162, 102],
  svg: () => OK.box(-84, -12, 0, 72, 46, 4) + OK.poly([[-74, -2, 4], [-22, -2, 4], [-22, 24, 4], [-74, 24, 4]], 'fd')
    + [0, 1, 2, 3, 4].map((i) => OK.cyl(30, 10, i * 9, 26, 8, {id: 'c' + i})).join(''),
  pose: (P, s, T) => {
    const n = 1 + Math.round(s.fill * 4);
    for (let i = 0; i < 5; i++) {
      P['c' + i].style.display = i < n ? '' : 'none';
      P['c' + i].lastChild.style.fill = i === n - 1 && s.active > 0.5 ? T.accent : '';
    }
  },
};

// checklist (steps, a plan, done): a clipboard with three rows; fill ticks them one by one, active lights the done rows
const ROW_Z = [104, 72, 40];
OK.O.checklist = {
  vb: [-56, -178, 116, 212],
  svg: () => OK.box(-55, -6, 0, 110, 6, 140) + OK.box(-20, -10, 132, 40, 10, 14)
    + ROW_Z.map((z, i) => face([[-40, z], [-22, z], [-22, z + 18], [-40, z + 18]], 0, 'ft')
      + face([[-12, z + 6], [40, z + 6], [40, z + 12], [-12, z + 12]], 0, 'fd', 'r' + i)
      + `<polyline class="ln" data-p="k${i}" points="${[[-37, z + 9], [-32, z + 4], [-24, z + 16]].map(([x, zz]) => at(x, 0, zz).join(',')).join(' ')}" pathLength="1" style="vector-effect:none;stroke-width:6;stroke-dasharray:1;stroke-dashoffset:1"/>`).join(''),
  pose: (P, s, T) => {
    for (let i = 0; i < 3; i++) {
      const k = c01(s.fill * 3 - i);
      P['k' + i].style.strokeDashoffset = (1 - k).toFixed(4); P['k' + i].style.stroke = T.on;
      P['r' + i].style.fill = s.active > 0.5 && k >= 1 ? T.on : '';
    }
  },
};

// mail (email, a newsletter, a message sent): an envelope; open lifts the flap behind the letter and slides the letter
// up, active lights the seal
const ENV = [[-60, 0], [60, 0], [60, 76], [-60, 76]];
const flap = (o) => [[-60, 76], [60, 76], [0, 34 + 84 * o]];
OK.O.mail = {
  vb: [-62, -158, 124, 196],
  svg: () => face(ENV, -6, 'fr') + OK.poly([[60, -6, 0], [60, 0, 0], [60, 0, 76], [60, -6, 76]], 'fr') + face(flap(1), -5, 'fr', 'fb')
    + `<g data-p="lt">${face([[-48, 10], [48, 10], [48, 72], [-48, 72]], -3, 'ft')}${face([[-36, 56], [30, 56], [30, 61], [-36, 61]], -3, 'fd')}${face([[-36, 44], [12, 44], [12, 49], [-36, 49]], -3, 'fd')}</g>`
    + face(ENV, 0, 'fl') + face(flap(0), 0, 'ft', 'ff') + face(circ(0, 40, 6, 12), 0, 'fa', 'seal'),
  pose: (P, s, T) => {
    P.fb.setAttribute('points', pts(flap(s.open).map(([x, z]) => [x, -5, z])));
    P.ff.setAttribute('points', pts(flap(s.open).map(([x, z]) => [x, 0, z])));
    P.fb.style.display = s.open >= 0.5 ? '' : 'none'; P.ff.style.display = s.open < 0.5 ? '' : 'none';
    P.seal.style.display = s.open < 0.5 ? '' : 'none'; P.seal.style.fill = s.active > 0.5 ? T.on : '';
    P.lt.setAttribute('transform', `translate(0 ${f1(-50 * s.open)})`);
  },
};

// rocket (a launch, growth, speed): a body, a nose, fins and a flame; open launches it up, play flickers the flame,
// active lights the window
OK.O.rocket = {
  vb: [-50, -220, 100, 250],
  svg: () => {
    const [rx, ry] = OK.ellipse(24), [X, Yt] = OK.iso(0, 0, 120);
    return `<g data-p="rk"><polygon class="fa" data-p="fire" points="${[[-12, 0, 22], [12, 0, 22], [0, 0, -14]].map((p) => at(...p).join(',')).join(' ')}"/>`
      + face([[-24, 26], [-50, 0], [-24, 56]], 0, 'fr') + face([[24, 26], [50, 0], [24, 56]], 0, 'fr')
      + OK.cyl(0, 0, 20, 24, 100)
      + `<path class="ft" d="M${f1(X - rx)},${f1(Yt)} A${f1(rx)},${f1(ry)} 0 0 0 ${f1(X + rx)},${f1(Yt)} L${f1(X)},${f1(Yt - 56)} Z"/>`
      + OK.disc(8, 8, 86, 10, 'y', 'fd', 'win') + '</g>';
  },
  pose: (P, s, T) => {
    P.rk.setAttribute('transform', `translate(0 ${f1(-36 * s.open)})`);
    const k = 0.7 + 0.3 * s.play * (0.5 + 0.5 * Math.sin(s.t * 23)), [fx, fy] = OK.iso(0, 0, 22);
    P.fire.setAttribute('transform', `translate(${f1(fx)} ${f1(fy)}) scale(1 ${k.toFixed(3)}) translate(${f1(-fx)} ${f1(-fy)})`);
    P.fire.style.opacity = (0.4 + 0.6 * Math.max(s.play, s.open)).toFixed(3);
    P.win.style.fill = s.active > 0.5 ? T.on : '';
  },
};

// ear (listening, hearing the result, earshot): an ear with sound waves coming in from the left; play pulses the
// waves toward it, active lights the inner curve
const EAR = [[12, 24], [30, 40], [40, 70], [36, 104], [16, 128], [-12, 134], [-36, 120], [-46, 94], [-40, 70], [-26, 58], [-18, 40], [-6, 22]];
const EAR_IN = [[-24, 92], [-20, 110], [0, 118], [20, 104], [22, 80], [8, 64], [-2, 50]];
OK.O.ear = {
  vb: [-96, -156, 140, 144],
  svg: () => {
    const [cx, cy] = OK.iso(-40, 0, 84);
    const waves = [0, 1, 2].map((i) => { const R = 22 + 16 * i;
      return `<path class="ln" data-p="w${i}" d="M${f1(cx - R * 0.5)},${f1(cy - R * 0.866)} A${R},${R} 0 0 0 ${f1(cx - R * 0.5)},${f1(cy + R * 0.866)}" style="opacity:0"/>`; }).join('');
    return plate(EAR, 10) + `<polyline class="ln" data-p="in" points="${EAR_IN.map(([x, z]) => at(x, 0, z).join(',')).join(' ')}"/>` + waves;
  },
  pose: (P, s, T) => {
    for (let i = 0; i < 3; i++) P['w' + i].style.opacity = (s.play * Math.pow(0.5 + 0.5 * Math.sin(s.t * 6 + i * 1.2), 2)).toFixed(3);
    P.in.style.stroke = s.active > 0.5 ? T.accent : '';
  },
};
```

- [ ] **Step 4: Список предметов в шапке** — в шапке `object-kit.js` перед строкой `   A new object: compose it from …` вставить:

```
   Objects (kind — what it stands for · states):
     database — a library, storage · open, active      agent — an AI agent · active
     turntable — sound on the timeline · spin, active  speaker — sound made in code · play
     key — an API key · struck                         folder — a project, files · open, active
     document — a file, a page · open, fill, active    laptop — a computer · open, on
     terminal — a command line · fill, active          browser — a site, a web app · fill, active
     phone — a mobile app · on, fill                   chat — a conversation · fill, play
     code — code </> · play, active                    graph — a graph, a pipeline · fill, active
     server — a backend, hosting · play, active        cloud — a service, deploy · play, active
     lock — security, a login · open, active           gear — settings, automation · spin, play
     magnifier — search, a detail · play, active       star — GitHub stars, a rating · play, active
     plugin — a plugin, an integration · open, active  camera — filming, the take · play, active
     mic — a voice, a recording · play, active         montage — editing, cuts · open, struck, play
     fan — colours, options · open, active             chart — growth, metrics · fill, active
     clock — time, a deadline · spin, play, active     money — revenue, a price · fill, active
     checklist — steps, done · fill, active            mail — email, a message · open, active
     rocket — a launch, speed · open, play, active     ear — listening, earshot · play, active
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern "part 3" tests/night.test.mjs`
Expected: PASS. Если bbox вышел за `vb`, действовать по тому же правилу, что в задаче 1, шаг 6.

- [ ] **Step 6: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное.

- [ ] **Step 7: Commit**

```bash
git add scripts/ru/broll/object-kit.js tests/night.test.mjs
git commit -m "Object kit: fan, chart, clock, money, checklist, mail, rocket, ear — 32 objects, listed in the header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Глаголы, часть 1 — «перестройка», «выноски», «возврат»

**Files:**
- Modify: `scripts/ru/broll/object-scene.js` (шапка, CSS, предметы, связи, отрисовка предметов, связей и пролёта; новые блоки)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `OK.run` как после задачи 1.
- Produces (схема `OK.run`):
  - `items[].keys: [[t, {x, y, size}, dur = 0.7]]` — «перестройка»: предмет переезжает и меняет размер с expo-out. Его подпись, галочка и связи едут вместе с ним.
  - `items[].tout` — уход за 0,35 с.
  - `callouts: [{at: 'id' | [x, y], text, t, dx = 170, dy = -90, tout}]` — «выноски»: точка, пунктир-уголок и стеклянная плашка с моно-подписью 30 px. При `dx < 0` плашка слева.
  - `returns: {to, from: [ids], t, gap = 0.12, dur = 0.5, bend = 0.25, tout}` — «возврат»: дуги со стрелками от предметов к предмету `to`, по очереди.
  - Внутренние помощники `place(I, t) → I.at = {x, y, k, size}` и `centre(I) → [x, y]`. Задача 5 строит на них падения и морф.
  - DOM id: `ok-co-<n>` (плашка), `ok-co-line-<n>`, `ok-ret-<n>`, `ok-ret-head-<n>`.

- [ ] **Step 1: Write the failing test** — после теста «object scene: ghost → glass…»:

```js
test("object scene: «перестройка» moves an item and its link follows, tout takes it away; «выноски» and «возврат» draw on their words", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 4, mode: "panel", theme: "night",
    items: [{ id: "a", kind: "agent", x: 540, y: 600, size: 220, tin: 0, keys: [[1.0, { y: 420, size: 150 }, 0.6]], label: { text: "агент" } },
      { id: "b", kind: "database", x: 300, y: 900, size: 160, tin: 0, tout: 3.0 },
      { id: "c", kind: "speaker", x: 780, y: 900, size: 160, tin: 0 }],
    links: [{ from: "a", to: "b", tin: 0.1, dur: 0.3 }],
    callouts: [{ at: "c", text: "whoosh", t: 0.5, dx: -170, dy: -80 }, { at: [540, 1200], text: "точно в кадр", t: 1.2 }],
    returns: { to: "a", from: ["b", "c"], t: 2.0, gap: 0.15, dur: 0.4 } }));
  try {
    const top = () => parseFloat(document.getElementById("ok-item-a").style.top);
    const t0 = await c.at(0.9, top), t1 = await c.at(2.5, top);
    assert.ok(t1 < t0 - 120, `the agent moved up ${t0} → ${t1}`);
    assert.ok(Math.abs(await c.at(2.5, () => +document.getElementById("ok-item-a").getAttribute("width")) - 150) < 1, "and shrank to 150");
    const linkY = () => +document.getElementById("ok-link-0").getAttribute("d").match(/^M[\d.]+,([\d.]+)/)[1];
    assert.ok(await c.at(2.5, linkY) < await c.at(0.9, linkY) - 120, "the link starts under the moved agent");
    const vis = (id) => { const s = getComputedStyle(document.getElementById(id)); return s.display !== "none" && +s.opacity > 0.5; };
    assert.equal(await c.at(3.5, vis, "ok-item-b"), false, "b left on tout");
    assert.equal(await c.at(0.4, vis, "ok-co-0"), false, "the plate waits for its word");
    assert.equal(await c.at(1.3, vis, "ok-co-0"), true);
    assert.equal(await c.at(1.3, () => document.getElementById("ok-co-0").textContent), "whoosh");
    assert.ok(await c.at(1.3, () => document.getElementById("ok-co-0").getBoundingClientRect().right) < 780, "dx < 0 puts the plate left of its item");
    assert.equal(await c.at(1.9, () => getComputedStyle(document.getElementById("ok-ret-0")).display), "none");
    const ho = (n) => +getComputedStyle(document.getElementById("ok-ret-head-" + n)).opacity;
    assert.ok(await c.at(2.2, ho, 1) < 0.1, "the second arrow comes after the first");
    assert.ok(await c.at(2.9, ho, 0) > 0.9 && await c.at(2.9, ho, 1) > 0.9, "both arrows end with heads");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "перестройка" tests/night.test.mjs`
Expected: FAIL — `the agent moved up` (у предметов ещё нет `keys`).

- [ ] **Step 3: Шапка** — в шапке `object-scene.js` строку

```
     items:[{id, kind, x, y, size, tin, label:{text, tin, dy:44}, states:[[t, {open:1}, dur]], active:[[t, 0|1]],
             check:t, ghost:true}],                                  «материализация», «активный пункт»
```

заменить на

```
     items:[{id, kind, x, y, size, tin, tout, label:{text, tin, dy:44}, states:[[t, {open:1}, dur]], active:[[t, 0|1]],
             check:t, ghost:true, keys:[[t, {x, y, size}, dur:0.7]]}],   «материализация», «активный пункт»,
                                                                     «перестройка» (keys move and resize, tout leaves)
     callouts:[{at:'id'|[x, y], text, t, dx:170, dy:-90, tout}],      «выноски»: a dotted elbow to a glass label
     returns:{to, from:[ids], t, gap:0.12, dur:0.5, bend:0.25, tout},  «возврат»: arrows back to the first item
```

и в перечне DOM id после `ok-row-<n>` добавить `, ok-co-<n>, ok-co-line-<n>, ok-ret-<n>, ok-ret-head-<n>`.

- [ ] **Step 4: CSS** — в строку стилей после `#ok .okc{left:0;width:${W}px;text-align:center}` (перед закрывающей обратной кавычкой) добавить новую строку:

```js
#ok .okco{padding:8px 20px;border-radius:14px;font:500 30px 'SK Mono',monospace;white-space:nowrap}
```

- [ ] **Step 5: Предметы и место** — блок от `// items («материализация», «активный пункт»)` до закрывающей `}` цикла предметов (строки 91–117) заменить на:

```js
  // «перестройка»: an item moves and resizes on keys [[t, {x, y, size}, dur]], expo-out from wherever it is
  const geoTrack = (it) => {
    const ks = [{t: -1e9, v: [it.x, it.y, it.size], d: 0}];
    for (const [t, o, d] of (it.keys || []).slice().sort((a, b) => a[0] - b[0])) {
      const p = ks[ks.length - 1].v; ks.push({t, v: [o.x ?? p[0], o.y ?? p[1], o.size ?? p[2]], d: d ?? 0.7});
    }
    return (t) => {
      let v = ks[0].v;
      for (let i = 1; i < ks.length && t >= ks[i].t; i++) { const u = ex((t - ks[i].t) / ks[i].d); v = v.map((a, j) => a + (ks[i].v[j] - a) * u); }
      return v;
    };
  };

  // items («материализация», «активный пункт», «перестройка»)
  const items = {};
  for (const it of cfg.items || []) {
    const O = OK.O[it.kind]; if (!O) throw new Error('OK: unknown object ' + it.kind);
    const svg = document.createElementNS(NS, 'svg'); svg.id = 'ok-item-' + it.id;
    svg.setAttribute('viewBox', O.vb.join(' '));
    Object.assign(svg.style, {position: 'absolute', overflow: 'visible'});
    svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
    scene.appendChild(svg);
    const P = {}; svg.querySelectorAll('[data-p]').forEach((n) => { P[n.dataset.p] = n; });
    const names = new Set(); (it.states || []).forEach(([, s]) => Object.keys(s).forEach((n) => names.add(n)));
    const tracks = {};
    for (const n of names) tracks[n] = M.track(0, (it.states || []).filter(([, s]) => n in s).map(([t, s, d]) => [t, s[n], d ? [6 / d, 0.9] : M.FAST]));
    const act = M.track(0, (it.active || []).map(([t, v]) => [t, v, M.FAST]));
    let lb = null, ck = null;
    if (it.label) { lb = el('a oklb', scene, 'div', 'ok-label-' + it.id); lb.textContent = it.label.text; }
    if (it.check != null) {
      ck = el('a okck', scene, 'div', 'ok-check-' + it.id); ck.style.background = TH.accent;
      ck.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    }
    items[it.id] = {it, O, svg, g: svg.firstChild, P, tracks, act, lb, ck, geo: geoTrack(it), at: null};
  }
  // where an item stands at t; its svg, label and check follow
  const place = (I, t) => {
    const [x, y, size] = I.geo(t), [vx, vy, vw, vh] = I.O.vb, k = size / vw;
    I.svg.setAttribute('width', size.toFixed(1)); I.svg.setAttribute('height', (vh * k).toFixed(1));
    I.svg.style.left = (x + vx * k).toFixed(1) + 'px'; I.svg.style.top = (y + vy * k).toFixed(1) + 'px';
    if (I.lb) { I.lb.style.left = x.toFixed(1) + 'px'; I.lb.style.top = (y + (I.it.label.dy ?? 44)).toFixed(1) + 'px'; }
    if (I.ck) { I.ck.style.left = (x + size * 0.3).toFixed(1) + 'px'; I.ck.style.top = (y + vy * k * 0.75).toFixed(1) + 'px'; }
    return (I.at = {x, y, k, size});
  };
  const centre = (I) => [I.at.x, I.at.y + (I.O.vb[1] + I.O.vb[3] / 2) * I.at.k];
```

- [ ] **Step 6: Связи** — блок `// links («дерево и связи»)` (строки 119–136) заменить на:

```js
  // links («дерево и связи»): an elbow from under the parent (below its label) to the top of the child; the path
  // follows items that move
  const linkD = (L) => {
    const a = items[L.from], b = items[L.to], A = a.at, Bq = b.at;
    const x1 = A.x, y1 = A.y + (a.it.label ? (a.it.label.dy ?? 44) + 44 : 30), x2 = Bq.x, y2 = Bq.y + b.O.vb[1] * Bq.k - 16, ym = (y1 + y2) / 2;
    return `M${x1.toFixed(1)},${y1.toFixed(1)} V${ym.toFixed(1)} H${x2.toFixed(1)} V${y2.toFixed(1)}`;
  };
  const links = (cfg.links || []).map((L, n) => {
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-link-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    lsvg.appendChild(p);
    let drawn = p;
    if (L.dash) {
      const m = document.createElementNS(NS, 'mask'); m.id = 'okm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
      const mp = document.createElementNS(NS, 'path');
      for (const [key, v] of Object.entries({fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round'})) mp.setAttribute(key, v);
      m.appendChild(mp); lsvg.appendChild(m);
      p.setAttribute('stroke-dasharray', '10 12'); p.setAttribute('mask', `url(#okm${n})`); drawn = mp;
    }
    return {L, p, drawn, len: 0, d: ''};
  });

  // callouts («выноски»): a dot on the point, a dotted elbow, a glass plate with a mono label; one per word
  const callouts = (cfg.callouts || []).map((c, n) => {
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-co-line-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '1 10'})) p.setAttribute(key, v);
    const m = document.createElementNS(NS, 'mask'); m.id = 'okcm' + n; m.setAttribute('maskUnits', 'userSpaceOnUse');
    const mp = document.createElementNS(NS, 'path');
    for (const [key, v] of Object.entries({fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round'})) mp.setAttribute(key, v);
    m.appendChild(mp); lsvg.appendChild(m); p.setAttribute('mask', `url(#okcm${n})`); lsvg.appendChild(p);
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('fill', TH.on); lsvg.appendChild(dot);
    const plate = el('a okco', scene, 'div', 'ok-co-' + n); plate.textContent = c.text;
    Object.assign(plate.style, {color: TH.ink, background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF',
      boxShadow: `0 0 0 3px rgba(${TH.glow},.45),0 0 30px rgba(${TH.glow},.18)`});
    return {c, p, mp, dot, plate, len: 0, d: ''};
  });

  // returns («возврат»): curved arrows from items back to the one the scene started with, one after another
  const returns = (cfg.returns?.from || []).map((id, n) => {
    const p = document.createElementNS(NS, 'path'); p.id = 'ok-ret-' + n;
    for (const [key, v] of Object.entries({fill: 'none', stroke: TH.on, 'stroke-width': 3, 'stroke-linecap': 'round'})) p.setAttribute(key, v);
    const head = document.createElementNS(NS, 'polygon'); head.id = 'ok-ret-head-' + n; head.setAttribute('fill', TH.on);
    lsvg.appendChild(p); lsvg.appendChild(head);
    return {id, n, p, head, len: 0, d: ''};
  });
```

- [ ] **Step 7: Отрисовка** — в `draw` блок от `for (const I of Object.values(items)) {` до конца цикла по `links` (строки 193–223) заменить на:

```js
    for (const I of Object.values(items)) place(I, t);
    for (const I of Object.values(items)) {
      const it = I.it, a = t - it.tin, gone = it.tout == null ? 0 : ex((t - it.tout) / 0.35);
      const show = a >= 0 && gone < 0.999;
      for (const e of [I.svg, I.lb, I.ck]) if (e) e.style.display = show ? '' : 'none';
      if (!show) continue;
      const e = ex(a / 0.5);
      if (it.ghost === false) { I.g.setAttribute('fill-opacity', '1'); I.g.setAttribute('stroke-opacity', '1'); }
      else { I.g.setAttribute('stroke-opacity', clamp(a / 0.2).toFixed(3)); I.g.setAttribute('fill-opacity', ex((a - 0.15) / 0.35).toFixed(3)); }
      I.svg.style.opacity = ((it.ghost === false ? e : 1) * (1 - gone)).toFixed(3);
      const s = {t, active: clamp(I.act(t)), open: 0, spin: 0, struck: 0, play: 0, on: 0, fill: 0};
      for (const [n, f] of Object.entries(I.tracks)) s[n] = f(t);
      I.O.pose(I.P, s, TH);
      I.svg.style.filter = `drop-shadow(0 0 ${(4 + 14 * s.active).toFixed(1)}px rgba(${TH.glow},${(0.35 + 0.4 * s.active).toFixed(2)}))`;
      I.svg.style.transform = `translateY(${((1 - e) * 16).toFixed(1)}px) scale(${(1 - 0.1 * gone).toFixed(4)})`;
      if (I.lb) {
        const la = t - (it.label.tin ?? it.tin + 0.3);
        I.lb.style.display = la < 0 ? 'none' : '';
        I.lb.style.clipPath = wipe(ex(la / 0.5));
        I.lb.style.color = mix(TH.label, TH.on, s.active);
        I.lb.style.opacity = (1 - gone).toFixed(3);
      }
      if (I.ck) {
        const ca = t - it.check;
        I.ck.style.display = ca < 0 ? 'none' : '';
        I.ck.style.opacity = (clamp(ca / 0.12) * (1 - gone)).toFixed(3);
        I.ck.style.transform = `scale(${(0.6 + 0.4 * ex(ca / 0.35)).toFixed(3)})`;
      }
    }

    for (const L of links) {
      L.p.style.display = '';
      const d = linkD(L.L);
      if (d !== L.d) { L.p.setAttribute('d', d); if (L.drawn !== L.p) L.drawn.setAttribute('d', d); L.len = L.p.getTotalLength(); L.drawn.style.strokeDasharray = L.len; L.d = d; }
      L.p.style.display = t < L.L.tin ? 'none' : '';
      L.drawn.style.strokeDashoffset = (L.len * (1 - ex((t - L.L.tin) / (L.L.dur ?? 0.5)))).toFixed(2);
    }

    for (const C of callouts) {
      const c = C.c, a = t - c.t, out = c.tout == null ? 0 : clamp((t - c.tout) / 0.3), on = a >= 0 && out < 1;
      for (const e of [C.p, C.dot, C.plate]) e.style.display = on ? '' : 'none';
      if (!on) continue;
      const [ax, ay] = typeof c.at === 'string' ? centre(items[c.at]) : c.at;
      const dx = c.dx ?? 170, dy = c.dy ?? -90, bx = ax + dx, by = ay + dy;
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)} L${(ax + dx * 0.35).toFixed(1)},${by.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)}`;
      if (d !== C.d) { C.p.setAttribute('d', d); C.mp.setAttribute('d', d); C.len = C.mp.getTotalLength(); C.mp.style.strokeDasharray = C.len; C.d = d; }
      C.mp.style.strokeDashoffset = (C.len * (1 - ex(a / 0.4))).toFixed(2);
      C.dot.setAttribute('cx', ax.toFixed(1)); C.dot.setAttribute('cy', ay.toFixed(1)); C.dot.setAttribute('r', (7 * ex(a / 0.25)).toFixed(2));
      const o = (1 - out).toFixed(3);
      C.p.style.opacity = o; C.dot.style.opacity = o; C.plate.style.opacity = o;
      C.plate.style.top = (by - 26).toFixed(1) + 'px';
      C.plate.style.left = (dx >= 0 ? bx + 10 : bx - 10).toFixed(1) + 'px';
      C.plate.style.transform = dx >= 0 ? '' : 'translateX(-100%)';
      C.plate.style.clipPath = wipe(ex((a - 0.25) / 0.5));
    }

    if (cfg.returns) {
      const R = cfg.returns, To = items[R.to], [bx, by] = centre(To), out = R.tout == null ? 0 : clamp((t - R.tout) / 0.3);
      for (const r of returns) {
        const I = items[r.id], [ax, ay] = centre(I), a = t - (R.t + r.n * (R.gap ?? 0.12)), on = a >= 0 && out < 1;
        r.p.style.display = on ? '' : 'none'; r.head.style.display = on ? '' : 'none';
        if (!on) continue;
        const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
        const sx = ax + ux * I.at.size * 0.42, sy = ay + uy * I.at.size * 0.42, tx = bx - ux * To.at.size * 0.5, ty = by - uy * To.at.size * 0.5;
        const side = ax < bx - 1 ? -1 : ax > bx + 1 ? 1 : 0, bend = (R.bend ?? 0.25) * L * side;
        const qx = (sx + tx) / 2 - uy * bend, qy = (sy + ty) / 2 + ux * bend;
        const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
        if (d !== r.d) { r.p.setAttribute('d', d); r.len = r.p.getTotalLength(); r.p.style.strokeDasharray = r.len; r.d = d; }
        const u = ex(a / (R.dur ?? 0.5));
        r.p.style.strokeDashoffset = (r.len * (1 - u)).toFixed(2);
        const hl = Math.hypot(tx - qx, ty - qy) || 1, hx = (tx - qx) / hl, hy = (ty - qy) / hl;
        r.head.setAttribute('points', [[tx, ty], [tx - hx * 16 - hy * 9, ty - hy * 16 + hx * 9], [tx - hx * 16 + hy * 9, ty - hy * 16 - hx * 9]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
        r.head.style.opacity = (clamp((u - 0.85) / 0.15) * (1 - out)).toFixed(3);
        r.p.style.opacity = (1 - out).toFixed(3);
      }
    }
```

- [ ] **Step 8: Пролёт по новому месту** — в блоке `if (cfg.fly) {` строки

```js
      const f = cfg.fly, I = items[f.id], u = eio(clamp((t - f.t) / (f.dur ?? 0.4)));
      const cy = I.it.y + (I.O.vb[1] + I.O.vb[3] / 2) * I.k;
      scene.style.transformOrigin = `${I.it.x}px ${cy.toFixed(1)}px`;
```

заменить на

```js
      const f = cfg.fly, I = items[f.id], u = eio(clamp((t - f.t) / (f.dur ?? 0.4))), [cx, cy] = centre(I);
      scene.style.transformOrigin = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test --test-name-pattern "перестройка|ghost" tests/night.test.mjs`
Expected: PASS — и новый тест, и тест шага 1 «ghost → glass…».

- [ ] **Step 10: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное.

- [ ] **Step 11: Commit**

```bash
git add scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Object scenes: rebuild (item keys, tout, links follow), callouts, return arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Глаголы, часть 2 — «физика предмета», «морф значка», «строка ввода», «сборка из сетки»

**Files:**
- Modify: `scripts/ru/broll/object-scene.js` (шапка, CSS, новые блоки, отрисовка предметов)
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `place`, `centre`, `items[].at`, `ex`, `wipe`, `mix`, `el`, `lsvg`, `scene`, `root` из задачи 4.
- Produces (схема `OK.run`):
  - `drops: [{into: 'id' | [x, y], kind = 'document', n = 1, t, gap = 0.22, size = 70, from = -320 | [x, y]}]` — «физика предмета»:
    - предметы падают с ускорением и садятся со сплющиванием;
    - тонут в цели и гаснут;
    - цель вздрагивает на каждом приземлении.
  - `morph: {from, t, dur = 0.8, x = 540, y, w = 760, dots: [{at: 0..1, t, on}], head: {t0, t1}}` — «морф значка»:
    - предмет сворачивается в точку, из неё растёт шкала;
    - точки появляются в свои моменты;
    - курсор проходит по шкале и зажигает точки.
  - `prompt: {x = 540, y, w = 900, text, t, dur = 0.9, send, reply: {t, text}, tout}` — «строка ввода».
  - `assemble: {rect: [x, y, w, h], t, dur = 0.8, then: 'id'}` — «сборка из сетки»: клетки фоновой сетки загораются от центра и гаснут, появляется предмет `then`. Только в `mode: 'full'`: клетки совпадают с сеткой клипа, а не базы.
  - `OK.gridCells(parent, rect, {t, dur = 0.8, step = 84, ox = 52, oy = 52, drift = 0, color = '183,156,255', id = 'ok-cells'}) → {el, draw(t)}`. Им пользуется задача 6.
  - DOM id: `ok-drop-<n>-<j>`, `ok-tl`, `ok-tl-dot-<i>`, `ok-tl-head`, `ok-prompt`, `ok-prompt-text`, `ok-prompt-send`, `ok-prompt-reply`, `ok-cells`.

- [ ] **Step 1: Write the failing test** — после теста «object scene: «перестройка»…»:

```js
test("object scene: drops fall into a folder, the morph grows a timeline the playhead lights, the prompt types and sends, cells assemble an item", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 5, mode: "full", theme: "night",
    items: [{ id: "f", kind: "folder", x: 300, y: 700, size: 200, tin: 0, states: [[0.2, { open: 1 }]] },
      { id: "tt", kind: "turntable", x: 540, y: 1100, size: 220, tin: 0 },
      { id: "g", kind: "gear", x: 800, y: 700, size: 160, tin: 9 }],
    drops: [{ into: "f", kind: "document", n: 2, t: 0.3, gap: 0.2, size: 70 }],
    morph: { from: "tt", t: 1.5, dur: 0.6, y: 1150, w: 700, dots: [{ at: 0.2, t: 2.2 }, { at: 0.8, t: 2.3 }], head: { t0: 2.4, t1: 3.0 } },
    prompt: { y: 300, w: 860, text: "стеклянный звон", t: 0.5, dur: 0.6, send: 1.4, reply: { t: 1.6, text: "0 результатов" } },
    assemble: { rect: [720, 560, 168, 168], t: 3.2, dur: 0.6, then: "g" } }));
  try {
    const box = (id) => { const e = document.getElementById(id); return getComputedStyle(e).display === "none" ? null : e.getBoundingClientRect().toJSON(); };
    const d0a = await c.at(0.5, box, "ok-drop-0-0"), d0b = await c.at(0.75, box, "ok-drop-0-0");
    assert.ok(d0a && d0b && d0b.top > d0a.top + 40, "the first file falls");
    assert.equal(await c.at(1.3, box, "ok-drop-0-0"), null, "and sinks into the folder");
    assert.equal(await c.at(0.35, box, "ok-drop-0-1"), null, "the second waits for its gap");
    assert.ok(await c.at(2.2, () => +document.getElementById("ok-item-tt").style.opacity) < 0.05, "the turntable folds away");
    const tl = () => { const l = document.getElementById("ok-tl"); return +l.getAttribute("x2") - +l.getAttribute("x1"); };
    assert.ok(Math.abs(await c.at(2.6, tl) - 700) < 2, "the timeline reaches its width");
    const fill = (i) => document.getElementById("ok-tl-dot-" + i).getAttribute("fill");
    assert.equal(await c.at(2.6, fill, 0), "#B79CFF", "the playhead lit the first dot");
    assert.notEqual(await c.at(2.6, fill, 1), "#B79CFF", "not yet the second");
    assert.equal(await c.at(3.1, fill, 1), "#B79CFF");
    const txt = () => document.getElementById("ok-prompt-text").textContent;
    assert.ok((await c.at(0.9, txt)).length < "стеклянный звон".length);
    assert.equal(await c.at(1.4, txt), "стеклянный звон");
    assert.equal(await c.at(1.9, () => getComputedStyle(document.getElementById("ok-prompt-send")).backgroundColor), "rgb(124, 58, 237)", "send lights in the accent");
    assert.equal(await c.at(1.5, () => getComputedStyle(document.getElementById("ok-prompt-reply")).display), "none");
    assert.equal(await c.at(2.2, () => document.getElementById("ok-prompt-reply").textContent), "0 результатов");
    const lit = () => [...document.querySelectorAll("#ok-cells > div")].filter((e) => +e.style.opacity > 0.3).length;
    assert.ok(await c.at(3.45, lit) >= 2, "cells light up");
    assert.equal(await c.at(3.95, lit), 0, "and are gone as the gear appears");
    assert.ok(await c.at(3.95, () => +document.getElementById("ok-item-g").style.opacity) > 0.8, "the gear is assembled");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "drops fall" tests/night.test.mjs`
Expected: FAIL — `the first file falls` (элементов `ok-drop-*` нет).

- [ ] **Step 3: Шапка** — в схеме `OK.run` после строки `returns:{…}` добавить:

```
     drops:[{into:'id'|[x, y], kind:'document', n:1, t, gap:0.22, size:70, from:-320|[x, y]}],   «физика предмета»
     morph:{from, t, dur:0.8, x:540, y, w:760, dots:[{at:0..1, t, on}], head:{t0, t1}},          «морф значка»
     prompt:{x:540, y, w:900, text, t, dur:0.9, send, reply:{t, text}, tout},                      «строка ввода»
     assemble:{rect:[x, y, w, h], t, dur:0.8, then:'id'},      «сборка из сетки» (full mode: cells match the clip's grid)
```

после строки `})` схемы добавить:

```
   OK.gridCells(parent, rect, {t, dur, step:84, ox:52, oy:52, drift:0, color, id:'ok-cells'}) → {el, draw(t)}: the grid's
   cells inside rect light in a sweep from its centre and fade (screen-kit win.enter:'grid' uses it too).
```

и к перечню DOM id добавить `, ok-drop-<n>-<j>, ok-tl, ok-tl-dot-<i>, ok-tl-head, ok-prompt, ok-prompt-text, ok-prompt-send, ok-prompt-reply, ok-cells`.

- [ ] **Step 4: OK.gridCells** — в `object-scene.js` перед строкой `OK.run = (cfg) => {` вставить:

```js
// «сборка из сетки»: the cells of the background grid inside rect light up in a sweep from its centre, then fade.
// Cells sit on the clip grid (OK and SK grids start at −200 px: lines at 52 + 84·n), drift follows a drifting grid.
OK.gridCells = (parent, rect, o = {}) => {
  const step = o.step ?? 84, ox = o.ox ?? 52, oy = o.oy ?? 52, [rx, ry, rw, rh] = rect, color = o.color || '183,156,255';
  const box = document.createElement('div'); box.id = o.id || 'ok-cells';
  Object.assign(box.style, {position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none'});
  parent.appendChild(box);
  const cells = [], cx = rx + rw / 2, cy = ry + rh / 2, R = Math.hypot(rw / 2, rh / 2) || 1;
  for (let gx = ox + Math.floor((rx - ox) / step) * step; gx < rx + rw; gx += step)
    for (let gy = oy + Math.floor((ry - oy) / step) * step; gy < ry + rh; gy += step) {
      const e = document.createElement('div');
      Object.assign(e.style, {position: 'absolute', left: (gx + 2) + 'px', top: (gy + 2) + 'px', width: (step - 2) + 'px', height: (step - 2) + 'px',
        background: `rgba(${color},.34)`, boxShadow: `0 0 18px rgba(${color},.45)`, opacity: '0'});
      box.appendChild(e);
      cells.push({e, d: Math.hypot(gx + step / 2 - cx, gy + step / 2 - cy) / R});
    }
  const dur = o.dur ?? 0.8;
  return {el: box, draw: (t) => {
    const a = (t - o.t) / dur, live = a >= 0 && a <= 1.05;
    box.style.display = live ? '' : 'none';
    box.style.transform = `translateY(${(-(o.drift ?? 0) * t).toFixed(1)}px)`;
    for (const c of cells) c.e.style.opacity = live ? (ex((a - c.d * 0.45) / 0.18) * (1 - clamp((a - 0.6) / 0.4))).toFixed(3) : '0';
  }};
};
```

- [ ] **Step 5: CSS** — в строку стилей после строки `#ok .okco{…}` добавить:

```js
#ok .okpr{height:96px;border-radius:48px;padding:0 110px 0 40px;display:flex;align-items:center;font:500 32px 'SK Mono',monospace;white-space:pre;overflow:hidden;box-sizing:border-box}
#ok .okbtn{position:absolute;right:16px;top:16px;width:64px;height:64px;border-radius:32px;display:flex;align-items:center;justify-content:center}
#ok .okrep{font:500 30px 'SK Mono',monospace;white-space:nowrap}
```

- [ ] **Step 6: Новые блоки** — сразу после блока `returns` (конец задачи 4, шаг 6) вставить:

```js
  // drops («физика предмета»): small objects fall into an item or onto a point one after another, land with a squash,
  // sink in and fade; the target dips on each landing
  const FALL = 0.55;
  const drops = (cfg.drops || []).flatMap((D, n) => Array.from({length: D.n ?? 1}, (_, j) => {
    const O = OK.O[D.kind || 'document'], size = D.size ?? 70, [vx, vy, vw, vh] = O.vb, k = size / vw;
    const svg = document.createElementNS(NS, 'svg'); svg.id = `ok-drop-${n}-${j}`;
    svg.setAttribute('viewBox', O.vb.join(' ')); svg.setAttribute('width', size); svg.setAttribute('height', (vh * k).toFixed(1));
    Object.assign(svg.style, {position: 'absolute', overflow: 'visible', transformOrigin: '50% 100%'});
    svg.innerHTML = `<g class="okobj">${O.svg()}</g>`;
    scene.appendChild(svg);
    const P = {}; svg.querySelectorAll('[data-p]').forEach((e) => { P[e.dataset.p] = e; });
    O.pose(P, {t: 0, active: 0, open: 0, spin: 0, struck: 0, play: 0, on: 0, fill: 0}, TH);
    return {D, j, svg, k, vx, vy, t0: D.t + j * (D.gap ?? 0.22)};
  }));
  const dropTarget = (D) => { if (Array.isArray(D.into)) return D.into; const I = items[D.into]; return [I.at.x, I.at.y + I.O.vb[1] * I.at.k * 0.55]; };

  // morph («морф значка»): an item folds into a dot and a line grows out of it into a timeline; dots pop on their
  // times; a playhead sweeps and lights the dots it passes
  let morph = null;
  if (cfg.morph) {
    const m = cfg.morph, line = document.createElementNS(NS, 'line'); line.id = 'ok-tl';
    for (const [key, v] of Object.entries({stroke: TH.line, 'stroke-width': 3, 'stroke-linecap': 'round'})) line.setAttribute(key, v);
    lsvg.appendChild(line);
    const dots = (m.dots || []).map((d, i) => {
      const c = document.createElementNS(NS, 'circle'); c.id = 'ok-tl-dot-' + i;
      for (const [key, v] of Object.entries({r: 11, stroke: TH.line, 'stroke-width': 3, fill: TH.left})) c.setAttribute(key, v);
      lsvg.appendChild(c); return {d, c};
    });
    const head = m.head ? el('a', scene, 'div', 'ok-tl-head') : null;
    if (head) Object.assign(head.style, {width: '4px', height: '140px', borderRadius: '2px', background: TH.on, boxShadow: `0 0 18px 3px rgba(${TH.glow},.8)`});
    morph = {m, line, dots, head};
  }

  // prompt («строка ввода»): a glass input bar over the head; the query types, the send button lights, the reply comes
  let prompt = null;
  if (cfg.prompt) {
    const c = cfg.prompt, w = c.w ?? 900, x = (c.x ?? 540) - w / 2;
    const bar = el('a okpr', root, 'div', 'ok-prompt');
    Object.assign(bar.style, {left: x + 'px', top: c.y + 'px', width: w + 'px', color: TH.ink,
      background: theme === 'night' ? 'rgba(24,18,38,.94)' : '#FFFFFF', boxShadow: `0 0 0 3px rgba(${TH.glow},.45),0 0 40px 2px rgba(124,58,237,.22)`});
    const tx = el('okx', bar, 'span', 'ok-prompt-text'), car = el('okcar', bar, 'span'); car.style.background = TH.on;
    const btn = el('okbtn', bar, 'div', 'ok-prompt-send');
    btn.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    let reply = null;
    if (c.reply) {
      reply = el('a okrep', root, 'div', 'ok-prompt-reply'); reply.textContent = c.reply.text;
      Object.assign(reply.style, {left: (x + 30) + 'px', top: (c.y + 124) + 'px', color: TH.on});
    }
    prompt = {c, bar, tx, car, btn, reply};
  }

  // assemble («сборка из сетки»): full mode only; the item `then` appears as the cells fade
  let cellsA = null;
  if (cfg.assemble) {
    const A = cfg.assemble;
    cellsA = OK.gridCells(scene, A.rect, {t: A.t, dur: A.dur, drift: full && theme === 'night' ? 6 : 0, color: TH.glow});
    scene.insertBefore(cellsA.el, scene.firstChild);
    if (A.then && items[A.then]) { items[A.then].it.tin = A.t + (A.dur ?? 0.8) * 0.55; items[A.then].it.ghost = false; }
  }
```

- [ ] **Step 7: Предмет сворачивается в морфе, цель вздрагивает** — в `draw` (код задачи 4, шаг 7):

строку

```js
    for (const I of Object.values(items)) place(I, t);
```

заменить на

```js
    for (const I of Object.values(items)) place(I, t);
    const dip = {};
    for (const d of drops) {
      if (typeof d.D.into !== 'string') continue;
      const l = t - d.t0 - FALL;
      if (l >= 0 && l < 0.18) dip[d.D.into] = (dip[d.D.into] || 0) + 5 * Math.sin(Math.PI * l / 0.18);
    }
```

строку

```js
      const it = I.it, a = t - it.tin, gone = it.tout == null ? 0 : ex((t - it.tout) / 0.35);
```

заменить на

```js
      const it = I.it, a = t - it.tin, out = it.tout == null ? 0 : ex((t - it.tout) / 0.35);
      const folded = morph && morph.m.from === it.id ? ex((t - morph.m.t) / 0.35) : 0, gone = Math.max(out, folded);
```

и строку

```js
      I.svg.style.transform = `translateY(${((1 - e) * 16).toFixed(1)}px) scale(${(1 - 0.1 * gone).toFixed(4)})`;
```

заменить на

```js
      I.svg.style.transform = `translateY(${((1 - e) * 16 + (dip[it.id] || 0)).toFixed(1)}px) scale(${(1 - 0.1 * out - 0.8 * folded).toFixed(4)})`;
```

- [ ] **Step 8: Отрисовка новых глаголов** — в `draw` сразу после блока `if (cfg.returns) { … }` (задача 4) вставить:

```js
    for (const d of drops) {
      const a = t - d.t0, land = a - FALL, [tx, ty] = dropTarget(d.D);
      d.svg.style.display = a < 0 || land > 0.2 ? 'none' : '';
      if (a < 0 || land > 0.2) continue;
      const from = d.D.from ?? -320, [fx, fy] = Array.isArray(from) ? from : [tx + (d.j % 2 ? 18 : -18), ty + from];
      const u = clamp(a / FALL), sink = clamp(land / 0.2), sq = land > 0 ? Math.sin(Math.PI * clamp(land / 0.12)) * 0.12 : 0;
      const x = fx + (tx - fx) * u, y = fy + (ty - fy) * u * u + 22 * sink;
      d.svg.style.left = (x + d.vx * d.k).toFixed(1) + 'px'; d.svg.style.top = (y + d.vy * d.k).toFixed(1) + 'px';
      d.svg.style.transform = `rotate(${((1 - u) * (d.j % 2 ? 14 : -14)).toFixed(2)}deg) scale(${(1 + sq * 0.5).toFixed(3)}, ${(1 - sq).toFixed(3)})`;
      d.svg.style.opacity = (1 - sink).toFixed(3);
    }

    if (morph) {
      const m = morph.m, [cx, cy] = centre(items[m.from]), X = m.x ?? 540, Y = m.y ?? cy, w = m.w ?? 760;
      const a = t - m.t, u = ex((a - 0.15) / (m.dur ?? 0.8));
      morph.line.style.display = a >= 0.15 ? '' : 'none';
      const y = cy + (Y - cy) * u;
      morph.line.setAttribute('x1', (cx + (X - w / 2 - cx) * u).toFixed(1)); morph.line.setAttribute('x2', (cx + (X + w / 2 - cx) * u).toFixed(1));
      morph.line.setAttribute('y1', y.toFixed(1)); morph.line.setAttribute('y2', y.toFixed(1));
      const hp = m.head ? eio(clamp((t - m.head.t0) / (m.head.t1 - m.head.t0))) : null;
      if (morph.head) {
        morph.head.style.display = t >= m.head.t0 && t <= m.head.t1 + 0.3 ? '' : 'none';
        morph.head.style.left = (X - w / 2 + w * hp - 2).toFixed(1) + 'px'; morph.head.style.top = (Y - 70).toFixed(1) + 'px';
        morph.head.style.opacity = (1 - clamp((t - m.head.t1) / 0.3)).toFixed(3);
      }
      for (const {d, c} of morph.dots) {
        const b = t - d.t;
        c.style.display = b < 0 ? 'none' : '';
        c.setAttribute('cx', (X - w / 2 + w * d.at).toFixed(1)); c.setAttribute('cy', Y.toFixed(1));
        c.setAttribute('r', (11 * (0.4 + 0.6 * ex(b / 0.35))).toFixed(2));
        const lit = (m.head && t >= m.head.t0 && hp >= d.at) || (d.on != null && t >= d.on);
        c.setAttribute('fill', lit ? TH.on : TH.left);
      }
    }
```

и в конце `draw`, перед закрывающей `};` функции `draw`, вставить:

```js
    if (prompt) {
      const c = prompt.c, a = t - c.t, out = c.tout == null ? 0 : clamp((t - c.tout) / 0.3), on = a >= 0 && out < 1;
      prompt.bar.style.display = on ? '' : 'none';
      if (prompt.reply) prompt.reply.style.display = on && t >= c.reply.t ? '' : 'none';
      if (on) {
        const u = ex(a / 0.6);
        prompt.bar.style.clipPath = `inset(-60px calc(${(100 - 100 * u).toFixed(2)}% + ${(60 - 120 * u).toFixed(1)}px) -60px -60px round 48px)`;
        prompt.bar.style.opacity = (1 - out).toFixed(3);
        const n = Math.round(c.text.length * clamp((a - 0.25) / (c.dur ?? 0.9)));
        M.setText(prompt.tx, c.text.slice(0, n));
        prompt.car.style.opacity = n < c.text.length || Math.floor(t * 2.5) % 2 === 0 ? '1' : '0';
        prompt.btn.style.background = mix(theme === 'night' ? '#2C2342' : '#E4DFEC', TH.accent, c.send == null ? 0 : ex((t - c.send) / 0.3));
        prompt.btn.style.transform = `scale(${(1 + 0.12 * Math.sin(Math.PI * clamp((t - (c.send ?? 1e9)) / 0.3))).toFixed(3)})`;
        if (prompt.reply && t >= c.reply.t) {
          const r = ex((t - c.reply.t) / 0.4);
          prompt.reply.style.opacity = (r * (1 - out)).toFixed(3); prompt.reply.style.transform = `translateY(${((1 - r) * 10).toFixed(1)}px)`;
        }
      }
    }
    if (cellsA) cellsA.draw(t);
```

- [ ] **Step 9: Run test to verify it passes**

Run: `node --test --test-name-pattern "drops fall|перестройка|ghost" tests/night.test.mjs`
Expected: PASS.

- [ ] **Step 10: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное.

- [ ] **Step 11: Commit**

```bash
git add scripts/ru/broll/object-scene.js tests/night.test.mjs
git commit -m "Object scenes: drops, icon morph into a timeline with a playhead, the prompt line, grid cell assembly (OK.gridCells)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: screen-kit night — стеклянный список, ночная карточка, «вытягивание», окно из сетки, «слои в глубину»

**Files:**
- Modify: `scripts/ru/broll/screen-kit.js`
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `OK.gridCells(parent, rect, {t, dur, id})` из задачи 5. `build.py` кладёт object-scene.js в тот же `<script>`, что и screen-kit; `SK.run` вызывается позже, когда `OK` уже есть.
- Produces (схема `SK.run`, тема night):
  - `list` — стеклянные строки (`#1A1428`, кольцо accent_light .35), имена `ink`, номер загорается accent_light;
  - `mode: 'card'` — ночной фон с сеткой;
  - `marks: [{kind: 'pull', rect: [x, y, w, h] (пиксели медиа), t, dur = 0.8, to: [x, y] (кадр, центр), scale = 1.5, tout}]` — «вытягивание»;
  - `win.enter: 'grid'` — окно собирается из клеток;
  - `win.layers: {t, dur = 0.9, n = 3, gap = 80, tilt = 22, orbit = 5, labels: []}` — «слои в глубину»;
  - DOM id: `sk-pull-<i>`, `sk-cells`, `sk-ly-<i>`.

- [ ] **Step 1: Write the failing test** — после теста screen-kit night шага 1 (тот, что проверяет `.sk-draw rect`):

```js
test("screen kit night: glass list rows, a night card, a pulled name flies to its place, the window assembles from cells and opens into layers", { timeout: 90000 }, async () => {
  const d = tmp("png-"); ff("-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1", join(d, "a.png"));
  const files = { "a.png": readFileSync(join(d, "a.png")) };
  const sk = (cfg) => `<title>x</title><script>SK.run(${JSON.stringify(cfg)});</script>`;
  let c = await openClip(sk({ T: 2, mode: "card", theme: "night", tin: 0, title: { l1: "Три", l2: "ссылки", y: 260, tin: 0 }, win: { tin: 999 },
    list: { y: 500, w: 760, row: 92, items: [{ name: "Openverse API", t: 0.2 }, { name: "Real SFX", t: 0.3 }] } }), files);
  try {
    assert.equal(await c.at(1, () => getComputedStyle(document.querySelector(".sk-rp")).backgroundColor), "rgb(26, 20, 40)", "glass row");
    assert.equal(await c.at(1, () => getComputedStyle(document.querySelector(".sk-rt")).color), "rgb(245, 243, 250)");
    assert.ok(await c.at(1, () => !!document.querySelector("#sk .sk-grid")), "the night card has the grid");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  c = await openClip(sk({ T: 4, mode: "dark", theme: "night", tin: 0,
    title: { l1: "Инструмент 2", l2: "", y: 470, tin: 0 },
    win: { x: 540, y: 700, w: 900, h: 480, tin: 0, enter: "grid", layers: { t: 2.6, dur: 0.6, n: 3, gap: 80, labels: ["pop", "hit"] } },
    media: { a: { src: "a.png" } }, shots: [[0, "a", [0, 0, 640]]],
    marks: [{ kind: "pull", rect: [200, 100, 160, 40], t: 1.2, dur: 0.6, to: [540, 600], scale: 2 }] }), files);
  try {
    const lit = () => [...document.querySelectorAll("#sk-cells > div")].filter((e) => +e.style.opacity > 0.3).length;
    assert.ok(await c.at(0.3, lit) > 3, "cells light inside the window rect");
    // M.apply hides an invisible element with display:none and leaves its opacity as it was
    const wo = () => { const s = getComputedStyle(document.querySelector(".sk-win")); return s.display === "none" ? 0 : +s.opacity; };
    assert.ok(await c.at(0.2, wo) < 0.05, "the window waits for the cells");
    assert.ok(await c.at(1.0, wo) > 0.95);
    assert.equal(await c.at(1.0, lit), 0, "the cells are gone");
    assert.equal(await c.at(1.1, () => getComputedStyle(document.getElementById("sk-pull-0")).display), "none");
    const r = await c.at(2.0, () => document.getElementById("sk-pull-0").getBoundingClientRect().toJSON());
    // media 640 px in a 900 px window: k = 1.40625; 160×40 → 225×56.25, ×2 → 450×112.5, centred on (540, 600)
    assert.ok(Math.abs(r.left + r.width / 2 - 540) < 4 && Math.abs(r.top + r.height / 2 - 600) < 4, `pulled to its place ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.width - 450) < 6, `scaled ×2: ${r.width}`);
    const ly = await c.at(3.4, () => [...document.querySelectorAll(".sk-ly")].map((e) => [getComputedStyle(e).display, +e.style.opacity, e.style.transform]));
    assert.equal(ly.length, 2, "n − 1 glass layers behind the window");
    for (const [disp, o, tf] of ly) { assert.equal(disp, "block"); assert.ok(o > 0.5 && /rotateX\(2\d\.\d+deg\)/.test(tf), tf); }
    assert.notEqual(await c.at(3.4, () => getComputedStyle(document.querySelector(".sk-win")).transform), "none");
    assert.equal(await c.at(3.4, () => document.querySelector(".sk-lyl").textContent), "pop");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "glass list rows" tests/night.test.mjs`
Expected: FAIL — `glass row` (строка белая: `rgb(255, 255, 255)`).

- [ ] **Step 3: Шапка** — в шапке `screen-kit.js` строку

```
       win.enter:'fly' (arrives from depth after an object scene's fly), marks kind 'lens' {keys:[[t,x,y]], r, zoom, t0, t1}
```

заменить на

```
       win.enter:'fly' (arrives from depth after an object scene's fly) | 'grid' (assembles from the grid's cells),
       win.layers:{t, dur:0.9, n:3, gap:80, tilt:22, orbit:5, labels:[]} (opens into a stack of glass layers),
       marks kind 'lens' {keys:[[t,x,y]], r, zoom, t0, t1}, kind 'pull' {rect:[x,y,w,h] media px, t, dur:0.8, to:[x,y]
       frame px, scale:1.5, tout} (a piece leaves the window and lands on its place), glass list rows, a night card
```

- [ ] **Step 4: CSS** — в строку `css` после `.sk-grid{…}` добавить:

```js
.sk-pull{border-radius:10px;transform-origin:0 0;box-shadow:0 0 0 3px ${rgba(B.accent_light,.6)},0 0 40px 6px ${rgba(B.accent,.45)}}
.sk-ly{border-radius:26px;background:#1A1428;transform-origin:50% 50%;box-shadow:0 0 0 3px ${rgba(B.accent_light,.35)},0 0 40px 2px ${rgba(B.accent,.22)}}
.sk-lyl{position:absolute;left:28px;top:16px;font-family:'SK Mono',monospace;font-weight:500;font-size:30px;color:rgba(245,243,250,.72)}
```

- [ ] **Step 5: Ночная карточка** — строки

```js
  if(card || (night && !dark)) haze.style.display = 'none';
  if(night && dark) el('a sk-grid');
```

заменить на

```js
  if(card || (night && !dark)) haze.style.display = 'none';
  if(night && (dark || card)) el('a sk-grid');          // the night card is the night background, not the light canvas
```

и в вызове `M.scene({W, H, T, bg: dark ? B.background : card ? (B.canvas || '#EFEDF4') : null, …` заменить `bg: dark ? B.background : card ? …` на `bg: dark || (card && night) ? B.background : card ? …`.

- [ ] **Step 6: Окно из сетки и слои (создание)**

Строку

```js
    if(wc.enter !== 'fly'){
```

заменить на

```js
    if(wc.enter !== 'fly' && wc.enter !== 'grid'){
```

Сразу после строки `const ctx = cv.getContext('2d');` вставить:

```js
  // «сборка из сетки»: the cells inside the window rect light up, then the window fills in (night, enter:'grid')
  let gridIn = null;
  if(night && wc.enter === 'grid'){
    gridIn = OK.gridCells(root, [g0.x-g0.w/2, g0.y, g0.w, g0.h], {t:(wc.tin ?? tin), dur:0.8, id:'sk-cells'});
    root.insertBefore(gridIn.el, win);
  }
  // «слои в глубину»: glass layers behind the window (the deepest first in the DOM), the stack tilts and slowly turns
  const LY = night && wc.layers ? wc.layers : null;
  const ghosts = [];
  if(LY) for(let i=0; i<(LY.n ?? 3)-1; i++){
    const g = el('a sk-ly'); g.id = 'sk-ly-'+i; root.insertBefore(g, ghosts[i-1] || win);
    if(LY.labels?.[i]){ const lb = el('sk-lyl', g); lb.textContent = LY.labels[i]; }
    ghosts.push(g);
  }
```

Строку

```js
  const edgeTimes = night ? [...(wc.enter === 'fly' ? [] : [(wc.tin ?? tin) + 0.45]), ...shots.slice(1).map(s=>s[0])] : [];
```

заменить на

```js
  const edgeTimes = night ? [...(wc.enter === 'fly' ? [] : [(wc.tin ?? tin) + (wc.enter === 'grid' ? 0.75 : 0.45)]), ...shots.slice(1).map(s=>s[0])] : [];
```

- [ ] **Step 7: Вытягивание (создание)** — перед строкой `// ---------- list («top N»…` вставить:

```js
  // «вытягивание»: a piece of the window (a name, a line) leaves it and flies to its own place in the frame
  const pulls = (cfg.marks||[]).filter(m=>m.kind==='pull').map((m,i)=>{
    const c = el('a sk-pull', root, 'canvas'); c.id = 'sk-pull-'+i;
    return {m, c, cx:c.getContext('2d'), src:null};
  });
```

- [ ] **Step 8: Вытягивание в холсте окна** — в `drawCanvas` в цикле `for(const m of (cfg.marks||[])){` первой строкой тела вставить `if(m.kind==='pull') continue;`. После закрывающей `}` этого цикла (перед `if(cpath && …`) вставить:

```js
    for(const p of pulls){
      const m = p.m;
      if(t < m.t || (m.tout!=null && t > m.tout+0.3)) continue;
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
      const pw = Math.max(1, Math.round(w)), ph = Math.max(1, Math.round(h));
      if(p.c.width!==pw || p.c.height!==ph){ p.c.width = pw; p.c.height = ph; p.c.style.width = pw+'px'; p.c.style.height = ph+'px'; }
      p.cx.clearRect(0,0,pw,ph); p.cx.drawImage(cv, x, y, w, h, 0, 0, pw, ph);
      const u = ex((t-m.t)/(m.dur ?? 0.8));
      ctx.save(); ctx.fillStyle = `rgba(14,11,20,${(0.6*u).toFixed(3)})`; rr(x-4, y-4, w+8, h+8, 8); ctx.fill(); ctx.restore();
      p.src = {x, y, w, h, u};
    }
```

- [ ] **Step 9: Отрисовка окна, слоёв, клеток и вытягивания** — в `draw`:

строку

```js
    const [x,y,w,h] = wgeo(t);
```

заменить на

```js
    const [x,y,w,h] = wgeo(t);
    for(const p of pulls) p.src = null;
    if(gridIn) gridIn.draw(t);
```

строку

```js
      if(wc.enter === 'fly'){ const u = ex(wa/0.6); wv = {o:o*clamp(wa/0.25), blur:(1-u)*6, s:0.35+0.65*u}; }
```

заменить на

```js
      if(wc.enter === 'fly'){ const u = ex(wa/0.6); wv = {o:o*clamp(wa/0.25), blur:(1-u)*6, s:0.35+0.65*u}; }
      else if(wc.enter === 'grid'){ const u = clamp((wa-0.42)/0.3); wv = {o:o*u, blur:(1-u)*8, s:0.97+0.03*u}; win.style.clipPath = 'none'; }
```

строку

```js
    if(M.apply(win, wv)){
```

заменить на

```js
    let ext = '';
    if(LY){
      const u = ex((t-LY.t)/(LY.dur ?? 0.9));
      ext = ` perspective(1800px) rotateX(${((LY.tilt ?? 22)*u).toFixed(2)}deg) rotateY(${((LY.orbit ?? 5)*u*Math.sin((t-LY.t)*0.7)).toFixed(2)}deg)`;
      ghosts.forEach((g,i)=>{
        const show = u>0.002 && wv.o>0.002;
        g.style.display = show ? '' : 'none'; if(!show) return;
        Object.assign(g.style, {left:(x-w/2).toFixed(2)+'px', top:y.toFixed(2)+'px', width:w.toFixed(2)+'px', height:h.toFixed(2)+'px'});
        g.style.opacity = (u*wv.o*(1-0.22*i)).toFixed(3);
        g.style.transform = `translateY(${(-(LY.gap ?? 80)*(i+1)*u).toFixed(1)}px) scale(${(1-0.05*(i+1)*u).toFixed(4)})${ext}`;
      });
    }
    if(M.apply(win, wv, ext)){
```

и после закрывающей `}` этого `if(M.apply(win, …)){ … }` вставить:

```js
    for(const p of pulls){
      const m = p.m, s = p.src;
      p.c.style.display = s && wv.o>0.002 ? '' : 'none';
      if(!s) continue;
      const sc = 1+((m.scale ?? 1.5)-1)*s.u, x0 = x-w/2+s.x, y0 = y+bar+s.y, x1 = m.to[0]-s.w*sc/2, y1 = m.to[1]-s.h*sc/2;
      p.c.style.left = (x0+(x1-x0)*s.u).toFixed(1)+'px'; p.c.style.top = (y0+(y1-y0)*s.u).toFixed(1)+'px';
      p.c.style.transform = `scale(${sc.toFixed(4)})`;
      p.c.style.opacity = (m.tout==null ? 1 : 1-clamp((t-m.tout)/0.3)).toFixed(3);
    }
```

- [ ] **Step 10: Стеклянный список** — в создании списка после строки

```js
      if(it.stars!=null){ const st = el('sk-rs', r); st.innerHTML = '★ Star <b></b>'; st.querySelector('b').textContent = it.stars; if(c.rh) st.style.height = c.rh+'px'; }
```

вставить:

```js
      if(night){
        Object.assign(pill.style, {background:'#1A1428', boxShadow:`0 0 0 2px ${rgba(B.accent_light,.35)},0 10px 26px -14px rgba(0,0,0,.6)`});
        nm.style.color = B.ink; pill.firstChild.style.background = rgba(B.accent_light,.25);
        const st = r.querySelector('.sk-rs');
        if(st){ Object.assign(st.style, {background:'#1A1428', boxShadow:`0 0 0 2px ${rgba(B.accent_light,.35)}`, color:'rgba(245,243,250,.7)'}); st.querySelector('b').style.color = B.ink; }
      }
```

и в отрисовке списка строку `x.n.style.color = mix('#A39DB0', B.accent);` заменить на `x.n.style.color = mix(night ? '#6E6680' : '#A39DB0', night ? B.accent_light : B.accent);`.

- [ ] **Step 11: Run test to verify it passes**

Run: `node --test --test-name-pattern "glass list rows|screen kit" tests/night.test.mjs`
Expected: PASS — новый тест и тест screen-kit шага 1.

- [ ] **Step 12: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное (тесты screen-kit в `tests/ru.test.mjs` для светлой темы не меняются).

- [ ] **Step 13: Commit**

```bash
git add scripts/ru/broll/screen-kit.js tests/night.test.mjs
git commit -m "Screen kit night: glass list, night card, pull marks, the window assembled from grid cells, layers in depth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: night_base — светлый акцент со спикером, маска соседа на пропуске, жёсткие проверки

**Files:**
- Modify: `scripts/ru/wide/night_base.py`
- Test: `tests/night.test.mjs` (тест «masks are found by frame name…» меняет ожидания, плюс новый тест)

**Interfaces:**
- Consumes: `work/accents.json` `{accents: [{id, in, out, kind: "night" | "light", file}]}`.
- Produces:
  - на окне `kind: "light"` за спикером мягкая нейтральная тень (`#17141C`, 35 %, размытие 14), а не фиолетовый ореол;
  - кадр без своей маски берёт маску ближайшего соседа (до ±3 кадров), но не через склейку;
  - больше `max(3, 5 % кадров)` кадров без своей маски — `SystemExit`; флаг `--allow-missing` пропускает;
  - `--prep` сначала проверяет `renders/clean.mp4` и `swift`, потом чистит папки;
  - `kind` вне `night | light` — `SystemExit`.

- [ ] **Step 1: Write the failing test** — в тесте «night_base: masks are found by frame name…» строки

```js
  assert.match(r.stdout, /кадров без маски: 1 \(первые: 3\)/);
```

и

```js
  assert.ok(pixel(out, 3, 547, 1456)[0] < 100, "frame 3 has no mask: no speaker");
  const g3 = pixel(out, 3, 100, 300);
  assert.ok(g3[0] < 50 && g3[1] < 50 && g3[2] < 70, `frame 3 stays night ${g3}`);
```

заменить на

```js
  assert.match(r.stdout, /кадров без своей маски: 1 \(первые: 3\) · взяты у соседей: 1 · пустых: 0/);
```

и

```js
  assert.ok(pixel(out, 3, 547, 1456)[0] > 170, "frame 3 has no mask of its own: it borrows the neighbour's, the speaker stays");
```

После этого теста дописать новый:

```js
test("night_base: a light accent puts a soft neutral shadow behind the speaker, too many frames without a mask stop the run", { timeout: 120000 }, () => {
  const P = tmp("nb4-");
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 0.4 }] }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.4", "-f", "lavfi", "-i", "sine=f=220:d=0.4:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "color=c=white:s=1080x1920:r=25:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/light.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "l", in: 0.04, out: 0.2, kind: "light", file: "broll/light.mp4" }] }));
  const masks = (skip) => py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for p in d.glob("*.png"): p.unlink()
for i in range(10):
    if i in ${JSON.stringify(skip)}: continue
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(masks([]).status, 0);
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = join(P, "renders/picture.base.mp4");
  const far = pixel(out, 2, 100, 300), near = pixel(out, 2, 322, 1456);
  assert.ok(far[0] > 240 && far[1] > 240 && far[2] > 240, `the light canvas ${far}`);
  assert.ok(near[0] < far[0] - 10, `a shadow next to the silhouette ${near}`);
  assert.ok(Math.abs(near[0] - near[2]) < 12, `neutral, not a purple halo ${near}`);
  assert.ok(pixel(out, 2, 547, 1456)[0] > 170, "the speaker stays over the light accent");
  assert.equal(masks([3, 4, 5, 6, 7, 8]).status, 0);
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "6 of 10 frames without a mask: stale masks, stop");
  assert.match(r.stderr, /без своей маски/);
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--allow-missing"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "x", in: 0.04, out: 0.2, kind: "dark", file: "broll/light.mp4" }] }));
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "an unknown accent kind stops the run");
  assert.match(r.stderr, /kind/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern "night_base" tests/night.test.mjs`
Expected: FAIL — в выводе нет «кадров без своей маски»; на светлом акценте пиксель рядом с силуэтом фиолетовый (`|R−B|` большой).

- [ ] **Step 3: Константы и шапка** — в `night_base.py`:
  - в шапке (docstring) после строки про `--card` добавить строку `  --allow-missing: не останавливаться, если больше 5 % кадров без своей маски (по умолчанию это стоп: маски от другой версии ролика)`;
  - строку `work/accents.json: {"accents": [{"id", "in", "out", "kind": "night" | "light", "file"}]} — время чистого таймлайна,` оставить;
  - после неё дописать строку `kind "light" — светлый акцент: за спикером мягкая нейтральная тень вместо фиолетового ореола.`

После строки `GRAIN, HALO = 2.5, 0.55 …` вставить:

```python
INK_DARK = np.array((0x17, 0x14, 0x1C), np.float32)
SHADOW, MISS_MAX, REACH = 0.35, 0.05, 3           # тень на светлом акценте; доля кадров без маски до стопа; поиск соседа ±3
```

- [ ] **Step 4: Плавный дрейф сетки** — функцию `night_bg` заменить на:

```python
def night_bg(f, fps_):
    """ночной фон кадра f: свечение, сетка с плавным дрейфом вверх (доли пикселя — смесь соседних сдвигов), зерно"""
    off = f / fps_ * DRIFT
    o0, fr = int(off) % GRID_STEP, off - int(off)
    a = (GRID[o0:o0 + H] * (1 - fr) + GRID[o0 + 1:o0 + 1 + H] * fr)[..., None]
    bg = GLOW * (1 - a) + ACCENT_L[None, None] * a
    return bg + np.random.default_rng(f).normal(0, GRAIN, (H, W, 1)).astype(np.float32)
```

- [ ] **Step 5: Тень и маска соседа** — после функции `halo` вставить:

```python
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
```

Функцию `mask_at` заменить на:

```python
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
```

- [ ] **Step 6: Акцент знает свой вид** — в `compose` строки

```python
    acc = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, ctx["fps"])
```

заменить на

```python
    acc, kind = ctx["accent"](f)
    bg = acc.astype(np.float32) if acc is not None else night_bg(f, ctx["fps"])
```

и строки

```python
    h = halo(m)[..., None]
    bg = bg * (1 - h) + ACCENT_L[None, None] * h
```

на

```python
    if kind == "light":                              # светлый акцент: нейтральная тень, фиолетовый ореол там не виден
        h = shadow(m)[..., None]; bg = bg * (1 - h) + INK_DARK[None, None] * h
    else:
        h = halo(m)[..., None]; bg = bg * (1 - h) + ACCENT_L[None, None] * h
```

- [ ] **Step 7: Пути в сообщениях, число кадров, accents()** — после функции `tail` вставить:

```python
def rel(P, path):
    """путь для сообщения: от корня проекта, если внутри него"""
    try: return str(pathlib.Path(path).relative_to(P))
    except ValueError: return str(path)


def frame_count(path, fps_):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return round(float(r.stdout.strip()) * fps_)
```

Функцию `accents` заменить на:

```python
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
```

- [ ] **Step 8: prep сначала проверяет** — в `prep` первой строкой тела вставить:

```python
    clean = P / "renders" / "clean.mp4"
    if not clean.is_file(): raise SystemExit(f"нет {rel(P, clean)}: сначала чистый ролик (S2)")
    if not shutil.which("swift"): raise SystemExit("нет swift (Xcode Command Line Tools): маски Vision не посчитать — выбери --card")
```

и в вызове ffmpeg этой функции `str(P / "renders" / "clean.mp4")` заменить на `str(clean)`.

- [ ] **Step 9: main** — в `main`:

строку `for j in joins(P):` … цикл наездов — в условии `if any(f0 / F - 0.3 <= j <= f1 / F + 0.3 for f0, f1, _ in win): continue` заменить `for f0, f1, _ in win` на `for f0, f1, _, _ in win`.

После строки `clean = P / "renders" / "clean.mp4"` вставить:

```python
    cuts = ctx["cuts"]
    if not card:
        total = frame_count(clean, F)
        own = [f for f in range(total) if f not in masks]
        if len(own) > max(3, MISS_MAX * total) and "--allow-missing" not in a:
            raise SystemExit(f"кадров без своей маски: {len(own)} из {total} (первые: {', '.join(map(str, own[:5]))}) — маски от другой "
                             f"версии ролика? Запусти --prep заново или добавь --allow-missing")
```

В блоке `--stills` строки

```python
            layer = None
            for f0, f1, path in win:
                if f0 <= f < f1:
                    layer = grab(path, (f - f0) / F)
                    if layer is None: layer = grab(path, 0, last=True)      # клип короче окна: его последний кадр
                    if layer is None: raise SystemExit(f"{path.relative_to(P)}: в слое акцента нет кадров")
                    break
            if not card and f not in masks: print(f"  ⚠ у кадра {f} нет маски: спикера не будет")
            im = compose(grab(clean, f / F), f, dict(ctx, accent=lambda _f, layer=layer: layer))
```

заменить на

```python
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
```

В покадровом проходе строки

```python
    n, missing = 0, []
    try:
        for f, fr in enumerate(frames(clean, F)):
            if masks and f not in masks: missing.append(f)
            enc.stdin.write(compose(fr, f, ctx).tobytes()); n += 1
            if f % 250 == 0: print(f"  {f}", flush=True)
        enc.stdin.close()
    except BrokenPipeError:
        pass                                        # кодировщик умер: причина в его stderr ниже
```

заменить на

```python
    n, missing = 0, []
    try:
        for f, fr in enumerate(frames(clean, F)):
            if masks and f not in masks: missing.append(f)
            enc.stdin.write(compose(fr, f, ctx).tobytes()); n += 1
            if f % 250 == 0: print(f"  {f}", flush=True)
        enc.stdin.close()
    except BrokenPipeError:                         # кодировщик умер: причина в его stderr ниже
        try: enc.stdin.close()
        except OSError: pass
```

строку

```python
    if missing: print(f"⚠ кадров без маски: {len(missing)} (первые: {', '.join(map(str, missing[:5]))}): спикера на них нет — проверь fx/masks или запусти --prep заново")
    print(f"→ {base.relative_to(P.parents[1])} · кадров {n} · {'карточка' if card else 'маска'} · наезды {toggles} · акцентов {len(win)}")
```

на

```python
    if missing:
        empty = [f for f in missing if mask_src(masks, f, cuts) is None]
        print(f"⚠ кадров без своей маски: {len(missing)} (первые: {', '.join(map(str, missing[:5]))}) · взяты у соседей: "
              f"{len(missing) - len(empty)} · пустых: {len(empty)}" + (" — на пустых спикера нет, проверь fx/masks" if empty else ""))
    print(f"→ {base.relative_to(P.parents[1])} · кадров {n} · {'карточка' if card else 'маска'} · наезды {'—' if card else toggles} · акцентов {len(win)}")
```

- [ ] **Step 10: Run test to verify it passes**

Run: `node --test --test-name-pattern "night_base" tests/night.test.mjs`
Expected: PASS — все четыре теста night_base.

- [ ] **Step 11: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное.

- [ ] **Step 12: Commit**

```bash
git add scripts/ru/wide/night_base.py tests/night.test.mjs
git commit -m "night_base: a light accent gets a neutral shadow, a gap borrows the neighbour's mask, stale masks stop the run, prep checks first

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Субтитры по `look: night` и проверка раскадровки движений

**Files:**
- Modify: `scripts/ru/make-captions.mjs` (новая экспортная функция, вызов в `makeCaptions`, строка в шапке)
- Create: `scripts/ru/motion-check.mjs`
- Modify: `SETUP.md` (абзац «Кинетические субтитры» и таблица «Быстрый ремейк») — правило CLAUDE.md: новая настройка → `SETUP.md` в той же правке
- Test: `tests/night.test.mjs`

**Interfaces:**
- Consumes: `fx/fx.json` `look`, `work/accents.json`, `broll/plan.json` `clips[].theme`, `PLAN.json` `captions` и `motion`, `transcript.clean.json`.
- Produces:
  - `nightCaptions(project, overrides) → overrides` — при `look: night`: `theme_default` по умолчанию `dark`; если в `PLAN.json` нет `theme_keys`, они строятся из светлых окон: `light` на `in`, `theme_default` на `out`. Явные ключи `PLAN.json` главнее.
  - `scripts/ru/motion-check.mjs`:
    - `VERBS` — 16 id → русские названия;
    - `checkMotion(motion, words, lights) → {errors, warnings, table, verbs}`;
    - `motionCheck(project)` — пишет `MOTION.md`;
    - CLI с кодом выхода 1 при ошибках.
  - Поле `theme: "light"` у full-клипа в `broll/plan.json` — светлый полноэкранный клип; `assemble.mjs` его не читает.

- [ ] **Step 1: Write the failing tests** — после теста «kinetic captions: theme_default…»:

```js
test("kinetic captions in the night look: dark by default, light over light accents and light full clips", async () => {
  const { nightCaptions } = await import("../scripts/ru/make-captions.mjs");
  const P = tmp("cap-");
  for (const d of ["fx", "work", "broll"]) mkdirSync(join(P, d));
  assert.deepEqual(nightCaptions(P, { hide: [] }), { hide: [] }, "no fx.json look: nothing changes");
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "n", in: 1, out: 2, kind: "night", file: "a" }, { id: "l", in: 30, out: 34, kind: "light", file: "b" }] }));
  writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ clips: [{ id: "c", in: 10, out: 12, kind: "full", theme: "light", file: "c.mp4" }, { id: "p", in: 12, out: 14, kind: "panel", file: "p.mov" }] }));
  const k = nightCaptions(P, { style: "kinetic" }).kinetic;
  assert.equal(k.theme_default, "dark");
  assert.deepEqual(k.theme_keys, [{ at: 10, theme: "light" }, { at: 12, theme: "dark" }, { at: 30, theme: "light" }, { at: 34, theme: "dark" }]);
  assert.deepEqual(nightCaptions(P, { kinetic: { theme_keys: [{ at: 5, theme: "light" }] } }).kinetic.theme_keys, [{ at: 5, theme: "light" }], "explicit keys win");
});

test("motion-check: known verbs, none twice in a row, at least 5 verbs, each on its word, 1–2 light accents", async () => {
  const { checkMotion, VERBS } = await import("../scripts/ru/motion-check.mjs");
  assert.equal(Object.keys(VERBS).length, 16);
  const words = [["Поэтому", 9.01], ["три", 9.70], ["бесплатных", 9.92], ["инструмента", 10.38], ["исправляют", 11.48], ["Openverse", 12.78]].map(([text, start]) => ({ text, start }));
  const ok = [{ at: 9.01, word: "Поэтому", verb: "materialize" }, { at: 9.70, word: "три", verb: "chapter" }, { at: 9.92, word: "бесплатных", verb: "materialize" },
    { at: 10.38, word: "инструмента", verb: "tree" }, { at: 11.48, word: "исправляют", verb: "active" }, { at: 11.70, word: "исправляют", verb: "fly" },
    { at: 12.60, word: "Openverse", verb: "lens" }];
  const r = checkMotion(ok, words, 1);
  assert.deepEqual(r.errors, []);
  assert.match(r.table, /\| 12,60 \| Openverse \| линза \|/);
  assert.ok(checkMotion([...ok.slice(0, 2), { at: 9.92, word: "бесплатных", verb: "chapter" }, ...ok.slice(3)], words, 1).errors.some((e) => /второй раз подряд/.test(e)));
  assert.ok(checkMotion([{ ...ok[0], verb: "zoom" }, ...ok.slice(1)], words, 1).errors.some((e) => /неизвестный глагол/.test(e)));
  assert.ok(checkMotion([{ ...ok[0], at: 9.5 }, ...ok.slice(1)], words, 1).errors.some((e) => /нет в ±0,25/.test(e)));
  assert.ok(checkMotion(ok.slice(0, 4), words, 1).errors.some((e) => /не меньше 5/.test(e)));
  assert.ok(checkMotion(ok, words, 3).errors.some((e) => /светлых акцентов 3/.test(e)));
  assert.equal(checkMotion(ok, words, 0).warnings.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern "night look|motion-check" tests/night.test.mjs`
Expected: FAIL — `nightCaptions is not a function`; `Cannot find module …motion-check.mjs`.

- [ ] **Step 3: nightCaptions** — в `scripts/ru/make-captions.mjs` перед `export function makeCaptions(` вставить:

```js
// The night look (fx/fx.json "look": "night"): kinetic captions are dark by default and switch to the light theme over
// light windows by themselves — light accents (work/accents.json kind "light") and full clips with theme "light" in
// broll/plan.json. Explicit theme_default / theme_keys in PLAN.json win.
export function nightCaptions(project, overrides = {}) {
  const read = (p) => (existsSync(join(project, p)) ? JSON.parse(readFileSync(join(project, p), "utf8")) : null);
  if (read("fx/fx.json")?.look !== "night") return overrides;
  const k = { ...(overrides.kinetic ?? {}) };
  k.theme_default ??= "dark";
  if (k.theme_keys == null) {
    const win = [...(read("work/accents.json")?.accents ?? []).filter((a) => a.kind === "light"),
      ...(read("broll/plan.json")?.clips ?? []).filter((c) => c.kind === "full" && c.theme === "light")];
    k.theme_keys = win.sort((a, b) => a.in - b.in).flatMap((w) => [{ at: w.in, theme: "light" }, { at: w.out, theme: k.theme_default }]);
  }
  return { ...overrides, kinetic: k };
}
```

В `makeCaptions` строку

```js
  const overrides = existsSync(planPath) ? (JSON.parse(readFileSync(planPath, "utf8")).captions ?? {}) : {};
```

заменить на

```js
  const overrides = nightCaptions(project, existsSync(planPath) ? (JSON.parse(readFileSync(planPath, "utf8")).captions ?? {}) : {});
```

В шапке файла после строки `//                       theme_default: "light"|"dark" (the night look: "dark"),` добавить строку `//                       (fx/fx.json look "night": dark by default, light over light windows — nightCaptions),`.

- [ ] **Step 4: motion-check.mjs** — создать `scripts/ru/motion-check.mjs`:

```js
#!/usr/bin/env node
// S3 · раскадровка движений (ночной стиль, дизайн 2026-10-26): PLAN.json `motion` — по записи на каждую смену
// состояния в кадре: {at, word, verb, what}. at — секунды чистого таймлайна, word — слово, на которое приходится смена
// (из transcript.clean.json), verb — один из 16 глаголов ниже, what — что в кадре.
// Правила: глагол из списка; один глагол не идёт два раза подряд; разных глаголов не меньше 5; слово звучит в at ±0,25 с;
// светлых акцентов (work/accents.json kind "light" и полные клипы broll/plan.json с theme "light") 1–2.
// Пишет MOTION.md — таблицу для отчёта на превью.
//   node scripts/ru/motion-check.mjs <project>      код выхода 1, если правило нарушено
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VERBS = {
  fly: "сквозной пролёт", pull: "вытягивание", live: "живой интерфейс", layers: "слои в глубину", lens: "линза",
  grid: "сборка из сетки", materialize: "материализация", rebuild: "перестройка", tree: "дерево и связи",
  physics: "физика предмета", callouts: "выноски", active: "активный пункт", chapter: "глава", return: "возврат",
  morph: "морф значка", prompt: "строка ввода",
};
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function checkMotion(motion = [], words = [], lights = 0) {
  const errors = [], warnings = [], list = [...motion].sort((a, b) => a.at - b.at);
  list.forEach((m, i) => {
    if (!VERBS[m.verb]) errors.push(`${m.at} «${m.word}»: неизвестный глагол «${m.verb}» (есть: ${Object.keys(VERBS).join(", ")})`);
    if (i && list[i - 1].verb === m.verb) errors.push(`${m.at} «${m.word}»: «${VERBS[m.verb] ?? m.verb}» второй раз подряд`);
    if (!words.some((w) => norm(w.text) === norm(m.word) && Math.abs(w.start - m.at) <= 0.25)) errors.push(`${m.at}: слова «${m.word}» нет в ±0,25 с`);
  });
  const kinds = new Set(list.map((m) => m.verb));
  if (kinds.size < 5) errors.push(`разных глаголов ${kinds.size}, нужно не меньше 5`);
  if (lights > 2) errors.push(`светлых акцентов ${lights}, нужно 1–2`);
  if (lights === 0) warnings.push("светлых акцентов нет: обычно 1–2 на самые сильные места");
  const fmt = (s) => s.toFixed(2).replace(".", ",");
  const table = ["| Время | Слово | Глагол | Что в кадре |", "|---|---|---|---|",
    ...list.map((m) => `| ${fmt(m.at)} | ${m.word} | ${VERBS[m.verb] ?? m.verb} | ${m.what ?? ""} |`)].join("\n");
  return { errors, warnings, table, verbs: kinds.size };
}

export function motionCheck(project) {
  project = resolve(project);
  const read = (p) => (existsSync(join(project, p)) ? JSON.parse(readFileSync(join(project, p), "utf8")) : null);
  const words = (read("transcript.clean.json")?.words ?? []).filter((w) => (w.type ?? "word") === "word");
  const lights = (read("work/accents.json")?.accents ?? []).filter((a) => a.kind === "light").length
    + (read("broll/plan.json")?.clips ?? []).filter((c) => c.kind === "full" && c.theme === "light").length;
  const r = checkMotion(read("PLAN.json")?.motion ?? [], words, lights);
  writeFileSync(join(project, "MOTION.md"), `# Раскадровка движений\n\nГлаголов: ${r.verbs} · светлых акцентов: ${lights}\n\n${r.table}\n`);
  return { ...r, lights };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) { console.log("Usage: node scripts/ru/motion-check.mjs <project>"); process.exit(1); }
  const r = motionCheck(process.argv[2]);
  for (const w of r.warnings) console.log("⚠ " + w);
  for (const e of r.errors) console.log("✗ " + e);
  console.log(r.errors.length ? `FAIL · ${r.errors.length}` : `PASS · глаголов ${r.verbs}, светлых акцентов ${r.lights} → MOTION.md`);
  process.exit(r.errors.length ? 1 : 0);
}
```

- [ ] **Step 5: SETUP.md** — в абзаце «Кинетические субтитры…» после фразы `…(по умолчанию `light`, в ночном стиле — `dark`).` добавить: `В ночном стиле (`fx/fx.json` → `"look": "night"`) ключи тем ставятся сами: на светлых акцентах (`work/accents.json`, `kind: "light"`) и светлых полноэкранных врезках (`broll/plan.json`, `theme: "light"`) субтитры тёмные на светлом, потом снова белые; свои `theme_keys` в `PLAN.json` главнее.`

В таблицу раздела «Быстрый ремейк» добавить строку:

```markdown
| `node scripts/ru/motion-check.mjs <проект>` | раскадровка движений (`PLAN.json` → `motion`: время, слово, глагол, что в кадре): глагол не два раза подряд, не меньше пяти разных, 1–2 светлых акцента → `MOTION.md` |
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test --test-name-pattern "night look|motion-check|theme_default" tests/night.test.mjs`
Expected: PASS.

- [ ] **Step 7: Весь набор**

Run: `node --test tests/night.test.mjs && npm test`
Expected: всё зелёное (тесты субтитров в `tests/ru.test.mjs` не меняются: без `fx.json` `nightCaptions` ничего не трогает).

- [ ] **Step 8: Commit**

```bash
git add scripts/ru/make-captions.mjs scripts/ru/motion-check.mjs SETUP.md tests/night.test.mjs
git commit -m "Night look: captions pick their theme from light windows; motion-check validates the motion storyboard

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Ревью всей ветки (после задачи 8, до рендера)

- [ ] `scripts/review-package 801e28d HEAD` (из каталога скилла subagent-driven-development) → ревьюер всей ветки на самой сильной модели. Ему передать:
  - список «minor» из `.superpowers/sdd/progress.md` (шаги 1 и 2);
  - вопрос, что из этого нужно исправить до рендера всего ролика.
- [ ] Один исполнитель исправляет все находки разом, тесты зелёные, отдельный коммит.

---

### Task 9: Весь claude-sfx в ночи (главная сессия)

**Files (локально, не в git):** `video-projects/2026-10-26-claude-sfx-night/`:
- `screens/make-dark.mjs`, `screens/rects-dark.json`;
- `broll/gen.mjs`, `fx/fx.json`, `PLAN.json`;
- клипы, рендеры;
- `MOTION.md`, `REVIEW.md`.

**Раскадровка (27 смен, 16 глаголов, без повторов подряд):**

| Время | Слово | Глагол | Что в кадре |
|---|---|---|---|
| 2,52 | этот | живой интерфейс | в окне — терминал этого рилса |
| 5,52–8,97 | — | ночной акцент | «не слышит / звук» за головой |
| 9,01 | Поэтому | материализация | агент из призрака |
| 9,70 | три | глава | «02 — решение» |
| 9,92 | бесплатных | материализация | три предмета |
| 10,38 | инструмента | дерево и связи | связи от агента |
| 11,48 | исправляют | активный пункт | галочки, база загорается |
| 11,70 | исправляют | сквозной пролёт | камера влетает в базу |
| 12,60 | Openverse | линза | по описанию проекта |
| 14,56 | там | живой интерфейс | терминал печатает запрос |
| 16,30 | без | физика предмета | ключ зачёркивается |
| 16,95–20,66 | — | светлая врезка | счётчик 5 220 123 |
| 19,54 | открытой | активный пункт | база загорается на светлом |
| 21,50 | Real | вытягивание | имя папки real-sfx выходит из окна и становится титром |
| 22,95 | это | глава | «02 — Real SFX» с ключами |
| 23,32 | скилл | материализация | проигрыватель |
| 25,00 | тайминги | морф значка | проигрыватель → шкала, курсор зажигает моменты |
| 27,19 | где | выноски | whoosh, click, hit |
| 29,34 | туда | материализация | папка-библиотека |
| 30,04 | запись | физика предмета | папка открывается, запись падает на момент |
| 31,42 | точно | выноски | «точно в кадр» |
| 32,43 | Ну | строка ввода | запрос над головой, «0 результатов» |
| 34,68 | третий | материализация | ухо earshot |
| 35,79 | Он | сборка из сетки | окно с выводом earshot собирается из клеток |
| 37,80 | Или | слои в глубину | набор звуков рилса слоями |
| 39,68–44,36 | — | светлый акцент | «слышать» тёмным за головой, спикер поверх |
| 44,41 | Напиши | глава | CTA |
| 46,16 | пришлю | перестройка | агент уменьшается и уходит вверх |
| 46,46 | тебе | материализация | три инструмента |
| 46,80 | три | возврат | стрелки к агенту |

Сцена-герой — 08 (22,78–32,43): морф, курсор, выноски и падающая запись.

- [ ] **Step 1: Скриншоты в тёмной теме и симлинк записей earshot**

```bash
N=video-projects/2026-10-26-claude-sfx-night
ln -s ../../2026-10-25-claude-sfx/screens/ear $N/screens/ear
ls -L $N/screens/ear | head -2
```

Заменить `$N/screens/make-dark.mjs` целиком:

```js
// claude-sfx · ночь: публичные страницы в тёмной теме сайта (дизайн 2026-10-26) для ночных окон. Playwright headless,
// deviceScaleFactor 2 → screens/<file>.png + screens/rects-dark.json: прямоугольник каждой фразы в пикселях png —
// первое совпадение, видное в пределах экрана (первое у GitHub часто скрытый мобильный блок About).
//   node <project>/screens/make-dark.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)), K = 2, VW = 1440, VH = 900;
const PAGES = [
  ["https://github.com/WordPress/openverse", "gh-ov-dark.png", { desc: ["Openverse is a search engine for openly-licensed media", false] }],
  ["https://github.com/Clipwing/skills/tree/main/skills/real-sfx", "gh-rsfx-dark.png", { rsfx_name: ["real-sfx", true] }],
];
const browser = await chromium.launch();
const rects = {};
for (const [url, file, phrases] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: K, locale: "ru-RU", colorScheme: "dark" });
  const pg = await ctx.newPage();
  await pg.goto(url, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3500);
  for (const [key, [text, exact]] of Object.entries(phrases)) {
    const loc = pg.getByText(text, { exact });
    let box = null;
    for (let i = 0; i < await loc.count() && !box; i++) { const b = await loc.nth(i).boundingBox(); if (b && b.y >= 0 && b.y + b.height <= VH) box = b; }
    if (!box) throw new Error(`${file}: «${text}» не видно на экране`);
    rects[key] = [box.x * K, box.y * K, box.width * K, box.height * K].map(Math.round);
  }
  const mode = await pg.evaluate(() => document.documentElement.getAttribute("data-color-mode"));
  await pg.screenshot({ path: join(HERE, file) });
  console.log(`→ screens/${file} · тема ${mode} ·`, JSON.stringify(Object.fromEntries(Object.keys(phrases).map((k) => [k, rects[k]]))));
  await ctx.close();
}
writeFileSync(join(HERE, "rects-dark.json"), JSON.stringify(rects, null, 1));
await browser.close();
```

Run: `node video-projects/2026-10-26-claude-sfx-night/screens/make-dark.mjs`
Expected: две строки `→ screens/…png · тема auto …`. Открыть оба png (Read): страницы тёмные, фразы видны. Если GitHub отдал светлую тему или фразы не видно — сказать в отчёте и взять светлый скрин исходного проекта, не обходить.

- [ ] **Step 2: Ночной стиль в настройках проекта**

```bash
N=video-projects/2026-10-26-claude-sfx-night
mkdir -p $N/fx && printf '{\n "look": "night"\n}\n' > $N/fx/fx.json
python3 - $N/PLAN.json <<'EOF'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); k = d["captions"]["kinetic"]
for key in ("theme_default", "theme_keys"): k.pop(key, None)       # ставит make-captions по look: night
json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
print("PLAN.json: темы субтитров из look night; hide", d["captions"]["hide"])
EOF
```

Expected: `hide` содержит окна 5,52–8,97 и 39,62–44,36.

- [ ] **Step 3: Генератор всего ролика** — заменить `$N/broll/gen.mjs` целиком:

```js
// claude-sfx в ночном стиле, весь ролик (дизайн 2026-10-26, шаг 2): клипы screen-kit (theme night) и object-scene
// (OK.run) над спикером на ночной базе (scripts/ru/wide/night_base.py), ночной и светлый акценты в базе, раскадровка
// движений в PLAN.json `motion` (проверка — scripts/ru/motion-check.mjs).
//   node <project>/broll/gen.mjs <project>   → broll/clips/*.html, broll/plan.json, work/accents.json, PLAN.json motion
// Времена — секунды чистого таймлайна (transcript.clean.json); в клипе — минус in. Тексты терминала, числа и набор
// звуков — настоящие (claude-sfx screens/make-screens.mjs: Openverse API и earshot от 2026-10-25, brand/sfx/kit.json).
// Стыки: full-клипы и панели встык (out = in следующего); вход full-клипа после кадра со спикером — до склейки.
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

function clip(id, tin, tout, kind, run, cfg, extra = {}) {
  const T = +(tout - tin).toFixed(3), L = (t) => +(t - tin).toFixed(3);
  fs.writeFileSync(path.join(P, "broll/clips", id + ".html"), `<title>${id}</title>\n<script>\n${run}(${JSON.stringify({ T, ...cfg(L) })});\n</script>\n`);
  const file = `${id}.${kind === "panel" ? "mov" : "mp4"}`;
  if (kind === "accent") accents.push({ id, in: tin, out: tout, kind: extra.theme === "light" ? "light" : "night", file: `broll/${file}` });
  else clips.push({ id, title: id, in: tin, out: tout, kind, file, ...(extra.theme ? { theme: extra.theme } : {}) });
}
// раскадровка: глагол на слове (at — начало слова после after, или явно, если смена не совпадает с началом слова)
const mv = (verb, word, after, what, at) => motion.push({ at: at ?? +W(word, after).toFixed(2), word, verb, what });
// окно GitHub в кадре 1320 px шириной вокруг прямоугольника r, не за краем скрина 2880×1800
const crop = (r, cw = 1320) => {
  const ch = Math.round(cw * 476 / 1000);
  return [Math.min(2880 - cw, Math.max(0, Math.round(r[0] + r[2] / 2 - cw / 2))), Math.min(1800 - ch, Math.max(0, Math.round(r[1] + r[3] / 2 - ch / 2))), cw];
};

// 01 · хук: ночной титр и окно с кадра 0 (обложка); на «этот рилс» — терминал, по краю окна пробегает свет
clip("01-hook", 0, 5.62, "panel", "SK.run", (L) => ({
  mode: "light", theme: "night", tin: -1, tout: L(5.50),
  title: { l1: "Claude делает", l2: "моушн-графику", y: 200, tin: -1 },
  win: { x: 540, y: 380, w: 900, h: 480, tin: -1 },
  media: { grid: { frames: S("grid"), from: 0.02, url: "мой рилс · 20 анимаций в Claude" }, term: { frames: S("term"), from: 0, url: "Claude Code" } },
  shots: [[0, "grid", [0, 0, 1800], "cut"], [L(2.45), "term", [0, 0, 1800], "blur"]],
}));
mv("live", "этот", 2, "в окне — терминал этого рилса");

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
  items: [{ id: "ag", kind: "agent", x: 540, y: 470, size: 190, tin: L(W("Поэтому", 9)), label: { text: "агент", dy: 40 } },
    ...tools.map(([id, kind, x, label], i) => ({ id, kind, x, y: 800, size: 200, tin: L(W("бесплатных", 9)) + i * 0.12,
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

// 04 · 🎧 «Первый — это Openverse API»: окно прилетает из глубины после пролёта, линза идёт по описанию проекта
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

// 05 · «Агент сам там ищет звуки и скачивает даже без ключа»: живой терминал, ключ API зачёркивается на «без ключа»
// (ключ — в пустом правом нижнем углу терминала, не на рамке)
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
  items: [{ id: "key", kind: "key", x: 820, y: 690, size: 170, tin: L(W("даже", 15)), states: [[L(W("без", 16)), { struck: 1 }, 0.35]] }],
}));
mv("live", "там", 14.3, "терминал печатает запрос к Openverse API");
mv("physics", "без", 16, "ключ API зачёркивается");

// 06 · 🎧 «Там более пяти миллионов звуков и треков с открытой лицензией»: светлая врезка шторкой, счётчик,
// база Openverse тёмной линией на светлом загорается на «открытой»; шторка пошла до склейки — без кадра пустой ночи
clip("06-count", 16.95, 20.66, "full", "OK.run", (L) => ({
  mode: "full", theme: "light", bg: { flip: [-0.08, 0.3] },
  chapter: { idx: "01 — Openverse API", l1: "В Openverse", l2: "звуки и треки", y: 420, tin: 0.15 },
  counter: { t: L(W("пяти", 17)), to: 5220123, label: "аудио с открытой лицензией", y: 760, dur: 1.4 },
  items: [{ id: "db", kind: "database", x: 540, y: 1180, size: 230, tin: 0.3, ghost: false,
    active: [[L(W("открытой", 19)), 1]], states: [[L(W("открытой", 19)), { open: 1 }]] }],
}), { theme: "light" });
mv("active", "открытой", 19, "база загорается на светлой врезке");

// 07 · 🎧 «Второй — это Real SFX»: окно GitHub с папкой скилла; на «Real SFX» имя папки вытягивается из окна и
// становится второй строкой титра. Встык после светлой 06
const rn = R.rsfx_name, [rx, ry, rw] = crop(rn);
clip("07-rsfx", 20.66, 22.78, "full", "SK.run", (L) => ({
  mode: "dark", theme: "night", tin: 0,
  title: { idx: "02 — инструмент", l1: "Инструмент 2", l2: "", y: 470, tin: -0.25 },
  win: { x: 540, y: 700, w: 1000, h: 528, tin: -0.1 },
  media: { g: { src: S("gh-rsfx-dark.png"), url: "github.com/Clipwing/skills · real-sfx" } },
  shots: [[0, "g", [rx, ry, rw], "cut"]],
  marks: [{ kind: "pull", rect: [rn[0] - 10, rn[1] - 8, rn[2] + 20, rn[3] + 16], t: L(W("Real", 21)), dur: 0.7, to: [540, 600], scale: 2.2 }],
}));
mv("pull", "Real", 21, "имя папки real-sfx выходит из окна GitHub и становится титром");

// 08 · сцена-герой «Real SFX»: проигрыватель превращается в шкалу ролика, курсор находит моменты, выноски звуков;
// папка-библиотека открывается, запись падает точно на момент. Метки — из схемы одобренного ролика (make-screens tl)
const TL = { x: 540, y: 650, w: 820 }, CUTS = [96, 214, 318, 452, 560, 676, 790].map((x) => x / 806);
const LBL = ["whoosh", "pop", "click", "whoosh", "pop", "hit", "whoosh"];
const dotX = (i) => TL.x - TL.w / 2 + TL.w * CUTS[i];
clip("08-rsfx", 22.78, 32.43, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "02 — Real SFX", l1: "Скилл для", l2: "Claude Code", y: 170, tin: L(W("это", 22.8)),
    keys: [[L(W("находит", 24)), { l1: "Находит", l2: "моменты для звука" }], [L(W("ставит", 28.5)), { l1: "Ставит запись", l2: "из библиотеки" }]] },
  items: [{ id: "tt", kind: "turntable", x: 540, y: 600, size: 240, tin: L(W("скилл", 23)), label: { text: "Real SFX" }, active: [[L(W("скилл", 23)) + 0.4, 1]] },
    { id: "lib", kind: "folder", x: 840, y: 440, size: 150, tin: L(W("туда", 29)), label: { text: "библиотека", dy: 30 },
      states: [[L(W("запись", 29.5)), { open: 1 }, 0.5]] }],
  morph: { from: "tt", t: L(W("тайминги", 24.5)), dur: 0.8, x: TL.x, y: TL.y, w: TL.w,
    dots: CUTS.map((at, i) => ({ at, t: L(W("тайминги", 24.5)) + 0.5 + i * 0.05 })),
    head: { t0: L(W("тайминги", 24.5)) + 0.6, t1: L(W("ролике", 25.5)) + 0.6 } },
  callouts: [[0, "где", 27, 120, -96], [2, "тот", 27.5, 120, 100], [5, "иной", 27.9, -120, -96]]
    .map(([i, w, a, dx, dy]) => ({ at: [dotX(i), TL.y], text: LBL[i], t: L(W(w, a)), dx, dy, tout: L(W("ставит", 28.5)) }))
    .concat([{ at: [dotX(2), TL.y], text: "точно в кадр", t: L(W("точно", 31)), dx: 120, dy: 110 }]),
  drops: [{ into: [dotX(2), TL.y], kind: "document", n: 1, t: L(W("твоей", 30.3)), size: 64, from: [840, 420] }],
}));
mv("chapter", "это", 22.8, "глава «02 — Real SFX»: скилл для Claude Code");
mv("materialize", "скилл", 23, "проигрыватель Real SFX проявляется из призрака");
mv("morph", "тайминги", 24.5, "проигрыватель превращается в шкалу ролика, курсор зажигает моменты");
mv("callouts", "где", 27, "выноски whoosh, click, hit на моментах");
mv("materialize", "туда", 29, "папка-библиотека");
mv("physics", "запись", 29.5, "папка открывается, запись падает точно на момент");
mv("callouts", "точно", 31, "выноска «точно в кадр»");

// 09 · «Ну а если нужного звука нет…»: над головой агент печатает запрос, ответ API — 0 результатов (настоящий,
// 2026-10-25); на «третий earshot» строка уходит, проявляется ухо
clip("09-ear", 32.43, 35.74, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "03 — если звука нет", l1: "Если звука", l2: "нет в базе", y: 170, tin: -0.1,
    keys: [[L(W("earshot", 34.8)), { idx: "03 — инструмент", l1: "Инструмент 3", l2: "earshot" }]] },
  prompt: { y: 390, w: 840, text: "стеклянный звон задом наперёд", t: 0, dur: 0.7,          // строка с первого кадра, допечатана до «нет»
    send: L(W("нет", 33.3)) - 0.12, reply: { t: L(W("нет", 33.3)) + 0.1, text: "Openverse · 0 результатов" }, tout: L(W("третий", 34.4)) - 0.1 },
  items: [{ id: "ear", kind: "ear", x: 540, y: 760, size: 220, tin: L(W("третий", 34.4)),       // без подписи: «earshot» уже в главе
    states: [[L(W("earshot", 34.8)), { play: 1 }]], active: [[L(W("earshot", 34.8)), 1]] }],
}));
mv("prompt", "Ну", 32.4, "над головой печатается запрос, ответ «0 результатов»");
mv("materialize", "третий", 34.4, "ухо earshot проявляется на месте строки");

// 10 · 🎧 «Он делает новый звук прямо кодом. Или даже целый набор под твой ролик»: окно с настоящим выводом earshot
// собирается из клеток сетки; на «целый набор» раскладывается на слои — звуки набора этого рилса (brand/sfx/kit.json).
// Титр на 360, окно на 720: поднятым слоям нужно ~220 px под титром
clip("10-ear", 35.74, 39.68, "full", "SK.run", (L) => ({
  mode: "dark", theme: "night", tin: 0,
  titles: [{ idx: "03 — earshot", l1: "earshot", l2: "звук кодом", y: 360, tin: -0.25, tout: L(W("Или", 37.5)) - 0.3 },   // ушёл до входа второго титра
    { idx: "03 — earshot", l1: "earshot", l2: "целый набор", y: 360, tin: L(W("Или", 37.5)) }],
  win: { x: 540, y: 720, w: 900, h: 476, tin: -0.1, enter: "grid",          // 900: наклонённое окно не уходит под кнопки справа
    layers: { t: L(W("Или", 37.5)), dur: 0.9, n: 3, gap: 80, tilt: 22, orbit: 5, labels: ["pop", "hit"] } },
  media: { e: { frames: S("ear"), from: -0.02, url: "earshot · терминал" } },
  shots: [[0, "e", [0, 0, 1800], "cut"]],
}));
mv("grid", "Он", 35.7, "окно с выводом earshot собирается из клеток сетки");
mv("layers", "Или", 37.5, "окно раскладывается на слои: звуки набора этого рилса");

// 11 · светлый акцент «И даёт агенту возможность слышать…»: шторка на светлое, «слышать» тёмным за головой, спикер
// поверх (night_base: тень вместо ореола); петля к «не слышит» из 02. Субтитры здесь скрыты (hide 39,62–44,36)
clip("11-acc", 39.68, 44.36, "accent", "OK.run", (L) => ({
  mode: "full", theme: "light", bg: { flip: [-0.08, 0.3] },
  words: [{ text: "earshot", font: "mono", size: 56, y: 700, t: L(W("даёт", 39.7)), color: "#7C3AED" },
    { text: "даже если удар опоздал", font: "sans", size: 44, y: 820, t: L(W("удар", 42.3)), color: "rgba(23,20,28,.6)" },
    { text: "слышать", font: "display", size: 190, y: 1000, t: L(W("слышать", 40.5)) }],
}), { theme: "light" });

// 12 · CTA «Напиши звук в комментариях, я пришлю тебе все три ссылки»: агент из 03 уменьшается и уходит вверх,
// три инструмента проявляются, стрелки возвращаются к агенту
clip("12-cta", 44.36, 47.52, "panel", "OK.run", (L) => ({
  mode: "panel", theme: "night",
  chapter: { idx: "ссылки — в комментариях", l1: "Напиши в комментариях", l2: "«звук»", y: 170, tin: -0.1 },
  items: [{ id: "ag", kind: "agent", x: 540, y: 600, size: 230, tin: -0.1, keys: [[L(W("пришлю", 46)), { y: 450, size: 150 }, 0.6]] },
    ...tools.map(([id, kind, x, label], i) => ({ id, kind, x, y: 770, size: 150, tin: L(W("тебе", 46.3)) + i * 0.12, label: { text: label } }))],
  returns: { to: "ag", from: tools.map(([id]) => id), t: L(W("три", 46.7)), gap: 0.12, dur: 0.5 },
}));
mv("chapter", "Напиши", 44, "глава: напиши в комментариях «звук»");
mv("rebuild", "пришлю", 46, "агент из начала уменьшается и уходит вверх, освобождая место");
mv("materialize", "тебе", 46.3, "три инструмента проявляются");
mv("return", "три", 46.7, "стрелки от инструментов возвращаются к агенту");

fs.writeFileSync(path.join(P, "broll/plan.json"), JSON.stringify({ title: "claude-sfx · ночь", video: "../renders/picture.mp4", fps: 25, clips }, null, 1));
fs.writeFileSync(path.join(P, "work/accents.json"), JSON.stringify({ accents }, null, 1));
const planPath = path.join(P, "PLAN.json"), PL = JSON.parse(fs.readFileSync(planPath, "utf8"));
PL.motion = motion.sort((a, b) => a.at - b.at);
fs.writeFileSync(planPath, JSON.stringify(PL, null, 1));
console.log(`${clips.length} clips, ${accents.length} accents, ${motion.length} motion entries → broll/plan.json, work/accents.json, PLAN.json`);
```

Run:

```bash
N=video-projects/2026-10-26-claude-sfx-night
node $N/broll/gen.mjs $N && node scripts/ru/motion-check.mjs $N
```

Expected: `10 clips, 2 accents, 27 motion entries …` и `PASS · глаголов 16, светлых акцентов 2 → MOTION.md`.

- [ ] **Step 4: Глифы, сборка, кадры новых клипов**

```bash
N=video-projects/2026-10-26-claude-sfx-night
for f in $N/broll/clips/*.html; do node scripts/ru/check-glyphs.mjs --font brand/fonts/GolosText-Variable.ttf --font brand/fonts/Spectral-SemiBoldItalic.ttf \
  --font brand/fonts/IBMPlexMono-Medium.ttf --font brand/fonts/Spectral-ExtraBold.ttf --html $f || echo "GLYPH FAIL $f"; done
python3 scripts/ru/broll/build.py $N/broll/dist $N/broll/clips/*.html
export NODE_PATH=./node_modules; B=.claude/skills/motion-broll/engine/beats.js
node $B $N/broll/dist/07-rsfx.html $N/review/07-beats.png 0.1 0.6 0.9 1.6
node $B $N/broll/dist/08-rsfx.html $N/review/08-beats.png 0.4 1.0 2.6 3.4 4.8 6.3 7.6 8.6 9.3
node $B $N/broll/dist/09-ear.html $N/review/09-beats.png 0.4 0.9 1.3 2.4 3.0
node $B $N/broll/dist/10-ear.html $N/review/10-beats.png 0.05 0.3 0.8 2.2 2.9 3.7
node $B $N/broll/dist/11-acc.html $N/review/11-beats.png 0.02 0.4 1.5 3.2
node $B $N/broll/dist/12-cta.html $N/review/12-beats.png 0.1 1.0 1.9 2.4 3.0
```

Expected: проверка глифов без `GLYPH FAIL`. Символ, которого нет в шрифте, заменить в тексте `gen.mjs` и повторить.

Открыть каждый лист (Read) и проверить по списку:
- 07: имя папки вылетает из окна и садится в строку титра;
- 08: шкала, курсор, точки; выноски не накладываются друг на друга и не уходят правее x 960; запись падает из папки на третью точку; ничего не лезет в y 900–1010 — там субтитры;
- 09: строка ввода, ответ, ухо;
- 10: клетки → окно → слои с подписями;
- 11: шторка, слова;
- 12: агент уходит вверх, три инструмента, стрелки.

Найденное поправить в `gen.mjs` (позиции, времена) и пересобрать клип.

- [ ] **Step 5: Рендер всех клипов.** 01–06 тоже: модули после задач 1–8 другие, а весь ролик собирается одним кодом.

```bash
N=video-projects/2026-10-26-claude-sfx-night; export NODE_PATH=./node_modules; R=.claude/skills/motion-broll/engine/render.js
for c in 01-hook 03-tools 05-ovapi 08-rsfx 09-ear 12-cta; do node $R $N/broll/dist/$c.html $N/broll/$c.mov 25 2>&1 | tail -1; done
for c in 02-acc 04-ov 06-count 07-rsfx 10-ear 11-acc; do node $R $N/broll/dist/$c.html $N/broll/$c.mp4 25 2>&1 | tail -1; done
```

Expected: двенадцать строк `rendered … frames` без `ERR`. Запускать в фоне (`run_in_background`) и ждать уведомления.

- [ ] **Step 6: Субтитры, база, сборка, ускоренная версия**

```bash
N=video-projects/2026-10-26-claude-sfx-night
node scripts/ru/make-captions.mjs $N --render
grep -o 'class="kg [a-z]* clip" data-start="[0-9.]*"' $N/captions/index.html | awk -F'"' '$2 ~ /light/ {print $2, $4}'
python3 scripts/ru/wide/night_base.py $N --stills 21.5,27.5,30.9,33.6,36.4,38.6,41.2,46.9
```

Expected:
- светлые группы субтитров есть только в окне 16,95–20,66: 39,68–44,36 скрыто;
- стиллы `review/night-*.png`.

Открыть стилл 41,20: светлый фон, спикер поверх, за ним мягкая нейтральная тень, а не фиолетовый ореол.

Затем:

```bash
python3 scripts/ru/wide/night_base.py $N --mix
node scripts/ru/assemble.mjs $N --final
node scripts/ru/speed-variant.mjs $N --factor 1.1
ffmpeg -v error -y -i $N/renders/final.mp4 -vf scale=540:960 -c:v libx264 -crf 24 -c:a aac -b:a 128k $N/renders/final.preview.mp4
```

Expected:
- `picture.base.mp4 · кадров 1188 · маска · … · акцентов 2`;
- `assemble` и `speed-variant` печатают `RESULT: PASS`;
- есть `renders/final.mp4`, `renders/final.x1.1.mp4`, `renders/final.preview.mp4`.

Время каждого шага записать в `REVIEW.md` (риск спеки «время рендера»).

- [ ] **Step 7: Самопроверка кадров** (до трёх кругов правок)

```bash
N=video-projects/2026-10-26-claude-sfx-night; CS=scripts/ru/contact-sheet.mjs
node $CS $N/renders/final.mp4 --out $N/review/full-sheet.png --every 1 --cols 8
node $CS $N/renders/final.mp4 --out $N/review/joins-2.png --no-zones --cols 6 \
  --times 20.62,20.66,20.70,22.74,22.78,22.82,32.39,32.43,32.47,35.70,35.74,35.78,39.64,39.68,39.72,44.32,44.36,44.40
node $CS $N/renders/final.mp4 --out $N/review/hero-08.png --from 22.8 --to 32.4 --every 0.5 --cols 7
node $CS $N/renders/final.mp4 --out $N/review/light-11.png --from 39.6 --to 44.4 --every 0.4 --cols 6
```

Открыть каждый лист (Read), находки записать в `$N/REVIEW.md` (раздел «Шаг 2»):
- стыки 20,66, 22,78, 32,43, 35,74, 39,68 и 44,36: нет двойных кадров, пустой ночи без спикера, чёрных вспышек;
- светлый акцент 39,68–44,36: края маски на светлом без «грязи», тень тонкая, слово за головой;
- герой 08: курсор, точки, выноски и падение читаются на 540×960; подписи ≥ 30 px; текст левее x 960;
- субтитры не налезают на шкалу, выноски и подписи предметов; на светлой врезке 06 они тёмные;
- глаголы идут по `MOTION.md`.

Исправления — в `gen.mjs`; при правке модулей — тест и отдельный коммит. Пересобрать затронутые клипы и шаг 6.

- [ ] **Step 8: Остановка — показать заказчику**

`SendUserFile`: `renders/final.x1.1.mp4` и `renders/final.mp4`, плюс путь к `final.preview.mp4`. В сообщении:
- что нового после 20,66 с по секундам: вытягивание имени Real SFX, сцена-герой со шкалой и падающей записью, строка ввода «0 результатов», окно earshot из клеток и слоями, светлый акцент «слышать» со спикером поверх, CTA с возвратом к агенту;
- таблица `MOTION.md` коротко: 16 глаголов, без повторов подряд;
- что сделано автоматически: тёмные скрины GitHub или замена, маска на весь ролик;
- одна строка из `REVIEW.md`;
- «Звук взят из одобренного финала без изменений. Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».

Один вопрос: «Ок, делаем ночной стиль по умолчанию в remake-fast, или правки?». Правки — применить, пересобрать затронутое, показать снова.

---

### Task 10: Ночной стиль по умолчанию в remake-fast (только после «ок» на весь ролик)

**Files:**
- Modify: `.claude/skills/remake-fast/SKILL.md`, `.claude/skills/vladilen-reels/SKILL.md`, `.claude/skills/reel-remake/references/formats.md`, `brand/brand.md`, `SETUP.md`
- Generated: `.agents/skills/…` (`npm run sync:skills`)
- Local: `lessons.md`, `video-projects/2026-10-26-claude-sfx-night/REVIEW.md`, память `reels-night-look-direction.md`

Дату `<дата>` ниже заменить датой ответа заказчика (ГГГГ-ММ-ДД).

- [ ] **Step 1: Слова заказчика** — в `lessons.md`, в запись `## 2026-10-26 · claude-sfx-night`, добавить строку `- [графика] Весь ролик в ночи: «<его ответ дословно>»`. В `REVIEW.md` проекта — раздел «Решение заказчика, шаг 2».

- [ ] **Step 2: remake-fast/SKILL.md** — в раздел `## F2 · Footage → preview` перед абзацем `**Preview — stop.**` вставить:

```markdown
**Night look (default since <дата>, customer: «ок» on claude-sfx in the night look).** OBS-template takes get
`fx/fx.json` `"look": "night"` (the old light look only when he asks: «как раньше, светлый»):
- the first frame decides the base: a plain wall, nothing at the shoulder → the mask; a chair or clutter at the
  shoulder → `night_base.py --card`. Name the choice in the preview report;
- vladilen-reels S3 writes the motion storyboard `PLAN.json` `motion` and runs `motion-check.mjs` → `MOTION.md`;
  S4 builds night clips (screen-kit `theme: 'night'`, `OK.run` scenes and accents); S4b's base is `night_base.py`;
- the preview report adds the `MOTION.md` table (time · word · verb · what is in the frame).
```

- [ ] **Step 3: vladilen-reels/SKILL.md**

В конце раздела `### S3 Драматургия` (перед `### S4 Графика`) вставить:

```markdown
**Motion storyboard (night look, `fx.json` `"look": "night"`).** `PLAN.json` `motion`: one entry per state change,
`{at, word, verb, what}` — `at` is the start of `word` on the clean timeline, verbs from `scripts/ru/motion-check.mjs`
(16: fly, pull, live, layers, lens, grid, materialize, rebuild, tree, physics, callouts, active, chapter, return, morph,
prompt). No verb twice in a row, at least 5 different ones, one hero scene built by hand for the tool (usually the hook
or the main claim), 1–2 light accents on the strongest moments, the rest of the background swaps are night ones.
`node scripts/ru/motion-check.mjs $P` must PASS; it writes `MOTION.md` for the preview report.
```

В `### S4 Графика` после абзаца `**Window above the head** …` (заканчивается `close-ups stay the plain frame.`) вставить:

```markdown
**Night look** (`look: "night"`): windows `SK.run({theme: 'night', …})` — public pages screenshotted headless with
Playwright `colorScheme: 'dark'`; glass list and night card; `pull`, `enter: 'grid'`, `layers`, `lens`. Object scenes
and accents: `OK.run` (`scripts/ru/broll/object-scene.js`, schema in its header) with objects from
`scripts/ru/broll/object-kit.js` (32 objects listed in its header). A missing object: draw it in the reel's generator
from `OK.box/cyl/disc/face/plate/circ` in the same style; reusable → add it to `object-kit.js` with a `checkObjects`
test. Accents are full `OK.run` layers listed in `work/accents.json` (`kind: night | light`), not in `broll/plan.json`;
a light full insert carries `theme: "light"` in `broll/plan.json`. Joins: full clips and panels butt (out = the next
in); a full clip that follows a frame with the speaker starts its entry 0.08–0.1 s before the cut. Lines ≥ 3 px,
labels ≥ 30 px, entries expo-out 0.6–0.9 s, exits 0.3–0.4 s, no bouncing springs.
```

В `### S4b`, в абзаце `**OBS-template takes** …`, после первого предложения (`…— not `fx_picture.py`.`) вставить:

```markdown
With `look: "night"` the base is `python3 scripts/ru/wide/night_base.py $P --prep` (Vision masks for the whole reel) →
`--stills <t,…>` (check the mask edges, the halo, every accent) → `--mix`: the night background drawn in code, the
speaker by the mask ×1.1 from the bottom with a halo (a soft shadow on light accents), punch-ins 1.00 ↔ 1.05 on the
joins, accents from `work/accents.json` under him — the word is always behind the head. `obs_base.py` and `obs_swaps.py`
stay for the light look.
```

В `### S5 Субтитры` после абзаца `**Kinetic style** …` добавить: `With `look: "night"` kinetic captions are dark and switch to the light theme over light accents and light full inserts by themselves (`nightCaptions`); explicit `theme_keys` win.`

- [ ] **Step 4: formats.md (SHOOT.md)** — в образце `## Как снимать` после строки `- Снимай по локациям; порядок в рилсе соберётся сам.` добавить строку `- Ровная стена за спиной, у плечей ничего (кресло, полка, лампа): тогда тебя вырежет маска и поставит на ночной фон.`

- [ ] **Step 5: brand.md** — в `## Словами` после пункта «Смена фона — постоянный приём…» вставить:

```markdown
- Ночной стиль ремейков (с <дата>, заказчик: «<его ответ>»): весь ролик на ночном фоне `background` с тонкой сеткой и свечением, спикер вырезан маской; 1–2 светлых акцента (`canvas`, крупное тёмное слово за головой) на самых сильных местах, остальные смены фона — ночные. Предметы — изометрические чертежи: светлые линии, тёмное стекло, одна фиолетовая деталь. Входы 0,6–0,9 с с долгим торможением, выходы 0,3–0,4 с, без пружины с отскоком; линии не тоньше 3 px, подписи не мельче 30 px. Движения собираются под каждый рилс по раскадровке: один глагол не два раза подряд, не меньше пяти разных, одна сцена-герой вручную.
```

и в пункте «Звуковые акценты и плавная анимация…» после `…входят и уходят пружиной с лёгким размытием` добавить `(в ночном стиле — expo-out с торможением, без отскока)`.

- [ ] **Step 6: SETUP.md**:
  - в таблицу `**Картинка**` раздела «Настройки одного рилса» первой строкой добавить: `| `look` | стиль ролика: `"night"` — ночной интерфейс (ночной фон, ты вырезан, предметы-чертежи, 1–2 светлых акцента) | в быстром ремейке `"night"`, иначе обычный |`;
  - строку `night_base.py` в таблице «Быстрый ремейк» не добавлять: её добавила задача 8 (правило CLAUDE.md — настройка в SETUP.md в той же правке);
  - в абзац «Окно над головой» добавить предложение `Ночная тема — `theme: 'night'`; сцены с предметами и акценты — `OK.run` (`scripts/ru/broll/object-scene.js`), предметы — `scripts/ru/broll/object-kit.js` (список из 32 в шапке).`

- [ ] **Step 7: Синхронизация и проверка**

```bash
npm run sync:skills
npm test
git status --short
```

Expected: `sync:skills` обновил `.agents/skills/…`, тесты зелёные, в статусе только перечисленные файлы, `.agents/skills/…` и удалённый `inbox/.gitkeep`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/remake-fast/SKILL.md .claude/skills/vladilen-reels/SKILL.md .claude/skills/reel-remake/references/formats.md brand/brand.md SETUP.md .agents/skills
git commit -m "remake-fast: the night look by default — motion storyboard, night clips, night_base, captions, shooting note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Память** — обновить `reels-night-look-direction.md`: шаги 1–3 сделаны, ночной стиль по умолчанию в remake-fast с `<дата>`, план шагов 2–3 выполнен. Следующее — `/reel` и `/reel-wide` (смены фона в `make_clips.py`) отдельным планом, только по просьбе. Строку в `MEMORY.md` обновить.
