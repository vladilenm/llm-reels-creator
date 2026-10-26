# Звук «чисто и дорого» для remake-fast — план работ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** собрать фирменную библиотеку живой музыки и звуков (отбор на слух заказчиком) и встроить её в remake-fast через Real SFX, чтобы звук рилсов звучал как у дорогого бренда.

**Architecture:** библиотеку собирают отдельные инструменты: загрузка из Openverse → отсев по замерам → страница прослушивания → раскладка отмеченного. В конвейере рилса новый мост `sfx_real.py` превращает события `fx.json` в список Real SFX (правила плотности, фирменный звук), получает дорожку SFX, приглушённую под голос, и кладёт её в `fx/sfx.wav`. Музыку и голос по-прежнему собирает `sound.py`; трек выбирает `music-pick.mjs`.

**Tech Stack:** Node ≥ 22 (ESM `.mjs`, `node:test`), системный python3 3.9 + numpy + ffmpeg, Real SFX (`.claude/skills/real-sfx/scripts`: `from_cues.py`, `mix.py`, `verify.py`, `critique.py`, `beats.py`, `build_index.py`), Openverse API без ключа.

**Spec:** `docs/superpowers/specs/2026-10-26-remake-fast-sound-design.md`

## Global Constraints

- Музыка — только лицензии `cc0` и `by` (CC BY); звуки — только `cc0`. BY-SA, BY-ND и NC не берём никогда.
- Никаких платных вызовов. Сеть: Openverse API (`api.openverse.org`, не больше 20 запросов в минуту: пауза 3200 мс) и прямые ссылки на файлы (Jamendo, Freesound CDN).
- Новых зависимостей нет: ни pip, ни npm. Python — системный `python3` (3.9), только numpy и ffmpeg; Node — встроенные модули.
- Аудио никогда не попадает в git: `brand/music/*` и `brand/sfx/*` уже в `.gitignore` (кроме README); `.cache/` тоже.
- В remake-fast со `"sfx_engine": "real"` синтезированный звук не звучит: Real SFX всегда с `--ui library`.
- Одобренные рендеры не трогаем: новое пишется в новые файлы (`fx/sfx.v2.wav`, `renders/final.sound-v2.mp4`).
- Пики SFX — на 9 дБ ниже пиков голоса (`brand.md`: «пики ~9 дБ ниже голоса»), настройка `fx.json` → `sfx_real.peak_below_voice_db`.
- Комментарии в коде — по-английски, как в репозитории; всё, что видит заказчик (страница, отчёты), — по-русски.
- Выражения ffmpeg `aevalsrc` с `\,` генерировать только из node или python (`spawnSync`), не из zsh: в zsh экранирование ломается и ffmpeg пишет бесконечный файл.
- Каждый отчёт со звуком заканчивается строкой «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух».
- Тесты: новый файл `tests/sound.test.mjs`, запуск `node --test tests/sound.test.mjs`; в конце `npm test` должен быть зелёным.
- Коммит каждой задачи — только её файлы (`git add <пути>`), сообщение заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Карта файлов

| Файл | Что делает |
|---|---|
| `scripts/ru/lib/openverse.mjs` (новый) | клиент Openverse: URL поиска, поиск, загрузка (в том числе только начала файла), название лицензии и строка автора |
| `scripts/ru/music-fetch.mjs` (новый) | кандидаты в музыку: CC0/CC BY, инструментал, 60 с – 8 мин, только начало файла (4 МБ) |
| `scripts/ru/lib/sfx-palette.mjs` (новый) | палитра «чисто и дорого»: папка → запросы и пределы длины; папки названы ролями Real SFX |
| `scripts/ru/sfx-fetch.mjs` (переписать) | загрузка звуков по палитре; пропуск того, что уже лежит в `library/`, `reserve/`, `rejected/`; перенос старой папки `tick` |
| `scripts/ru/sfx-kit.mjs` (1 строка) | папка библиотеки для вида `tick` — `click_tick` |
| `scripts/ru/lib/audio_measure.py` (новый) | общие замеры: декод, уровни, клиппинг, вступление, разброс громкости, самое ровное окно, доля полосы голоса, слышимая длина, атака, шипение, яркость, антифаза |
| `scripts/ru/music_screen.py` (новый) | отсев музыки → `candidates/screen.json` |
| `scripts/ru/sfx_screen.py` (новый) | отсев звуков → `library/screen.json`, перенос в `rejected/` и `reserve/` |
| `scripts/ru/sound_review.py` (новый) | `build` / `serve` / `apply`: страница прослушивания и раскладка отметок |
| `scripts/ru/fx/sound.py` (правка) | `--plan` (только выровненная музыка) и `--sfx <путь>` |
| `scripts/ru/fx/sfx.py` (правка) | отказ при `sfx_engine: real` |
| `scripts/ru/fx/sfx_real.py` (новый) | мост к Real SFX для рилса |
| `scripts/ru/music-pick.mjs` (новый) | выбор трека под рилс и строка автора в `CAPTION.md` |
| `tests/sound.test.mjs` (новый) | тесты всего перечисленного |
| документы (задача 13) | `remake-fast/SKILL.md`, `vladilen-reels/SKILL.md`, `sound-rules.md`, `SETUP.md`, `brand/brand.md`, `brand/music/README.md`, `brand/sfx/README.md` |

## Порядок и остановки

Задачи 1–7 — инструменты библиотеки. Задача 8 — живой прогон: строим страницу и **останавливаемся, пока заказчик слушает**. Пока он слушает, делаем задачи 9–11 (конвейер рилса: они не зависят от его отметок). Затем 8b (`apply`), 12 — сравнение на understand-anything и **вторая остановка** («ок»), 13 — документы.

Задачи 0, 8, 8b и 12 выполняет только главная сессия: в них нужен заказчик или его рабочая папка.

---

### Task 0: Зафиксировать вчерашнюю незакоммиченную работу (только с «да» заказчика)

В рабочей папке лежат незакоммиченные изменения 2026-10-25: скилл Real SFX, `sfx-fetch.mjs`, `sfx-kit.mjs`, `wide/gaps.py`, `wide/obs_swaps.py`, правки `SETUP.md`, `sound-rules.md`, `SKILL.md`. Задачи ниже меняют те же файлы. Без отдельного коммита вчерашние правки попадут в коммиты этого плана.

- [ ] **Step 1: Спросить заказчика** одним вопросом: «Закоммитить вчерашнюю работу (Real SFX, набор earshot, OBS-смены фона) отдельным коммитом перед новой?» Без «да» не коммитить; тогда коммиты задач делать с `git add -p`, только свои куски.

- [ ] **Step 2: Коммит (после «да»)**

```bash
git add .claude/skills/real-sfx .agents/skills/real-sfx scripts/ru/sfx-fetch.mjs scripts/ru/sfx-kit.mjs \
  scripts/ru/wide/gaps.py scripts/ru/wide/obs_swaps.py .agents/skills/reel-wide .claude/skills/reel-wide \
  .agents/skills/remake-fast .claude/skills/remake-fast .agents/skills/vladilen-reels .claude/skills/vladilen-reels \
  .gitignore AGENTS.md CLAUDE.md SETUP.md brand/sfx/README.md scripts/ru/contact-sheet.mjs scripts/ru/make-captions.mjs \
  scripts/ru/wide/clean-words.py scripts/ru/wide/common.py scripts/ru/wide/make_clips.py scripts/ru/wide/render_screen.py \
  vendor/SOURCES.md
git status --short   # inbox/.gitkeep (удалён) и docs/superpowers не трогаем
git commit -m "Reels Studio: Real SFX skill, earshot kit, OBS background swaps (2026-10-25)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Клиент Openverse и кандидаты в музыку

**Files:**
- Create: `scripts/ru/lib/openverse.mjs`
- Create: `scripts/ru/music-fetch.mjs`
- Create: `tests/sound.test.mjs`

**Interfaces:**
- Produces: `searchUrl(q, {license, source, page, pageSize, length}) → string`, `search(q, opts, fetchImpl) → Promise<result[]>`, `download(url, file, {maxBytes}, fetchImpl) → Promise<bytes>`, `licenseName(r) → "CC0" | "CC BY 4.0"`, `creditLine(r) → string | null`, константы `OK_LICENSES`, `PAUSE_MS`, `sleep(ms)`.
- Produces: `selectMusic(results, {mood, minMs, maxMs, seen}) → candidate[]`, `MOODS`.
- Produces файл `brand/music/candidates/candidates.json`: `{ "<openverse id>": {id, title, creator, license, license_version, license_name, license_url, credit, source, page, url, filetype, duration_ms, mood: [..], instrumental, file: "brand/music/candidates/<id>.mp3", fetched} }`.

- [ ] **Step 1: Write the failing tests** — создать `tests/sound.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { searchUrl, creditLine, licenseName, download } from "../scripts/ru/lib/openverse.mjs";
import { selectMusic, MOODS } from "../scripts/ru/music-fetch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p = "snd-") => mkdtempSync(join(tmpdir(), p));
const py = (code) => spawnSync("python3", ["-c", code], { cwd: ROOT, encoding: "utf8" });
const ff = (...a) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

// ---------- library: Openverse ----------

test("openverse: search URL, licence names and the CC BY credit line", () => {
  const u = new URL(searchUrl("soft piano", { license: "cc0,by", source: "jamendo,freesound", page: 2 }));
  assert.equal(u.searchParams.get("license"), "cc0,by");
  assert.equal(u.searchParams.get("source"), "jamendo,freesound");
  assert.equal(u.searchParams.get("page"), "2");
  assert.equal(licenseName({ license: "cc0" }), "CC0");
  assert.equal(licenseName({ license: "by", license_version: "3.0" }), "CC BY 3.0");
  assert.equal(creditLine({ license: "cc0", title: "x", creator: "y" }), null);
  assert.equal(creditLine({ license: "by", license_version: "4.0", title: "Calm", creator: "Ann" }), "Музыка: «Calm» — Ann (CC BY 4.0)");
});

test("openverse download asks for the head of the file with a Range header", async () => {
  const d = tmp(); let seen;
  const fake = async (url, { headers }) => { seen = headers; return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  const n = await download("https://x/y.mp3", join(d, "y.mp3"), { maxBytes: 1024 }, fake);
  assert.equal(n, 3);
  assert.equal(seen.Range, "bytes=0-1023");
  assert.deepEqual([...readFileSync(join(d, "y.mp3"))], [1, 2, 3]);
});

test("music-fetch keeps CC0 / CC BY instrumentals of 60 s – 8 min and skips seen ids", () => {
  const r = (o) => ({ id: "a", title: "Calm", creator: "c", license: "by", license_version: "4.0", duration: 120000, tags: [], url: "u", ...o });
  const got = selectMusic([
    r({ id: "ok" }), r({ id: "nd", license: "by-nd" }), r({ id: "sa", license: "by-sa" }), r({ id: "nc", license: "by-nc" }),
    r({ id: "short", duration: 30000 }), r({ id: "long", duration: 900000 }), r({ id: "voc", title: "Love song (vocal mix)" }),
    r({ id: "seen" }), r({ id: "inst", tags: [{ name: "instrumental" }] }), r({ id: "zero", license: "cc0" }),
  ], { mood: "спокойный", seen: new Set(["seen"]) });
  assert.deepEqual(got.map((x) => x.id), ["inst", "ok", "zero"]);
  assert.deepEqual(got[0].mood, ["спокойный"]);
  assert.equal(got[1].credit, "Музыка: «Calm» — c (CC BY 4.0)");
  assert.equal(got[2].credit, null);
  assert.equal(got[2].license_name, "CC0");
  assert.ok(Object.keys(MOODS).length >= 6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/ru/lib/openverse.mjs'`.

- [ ] **Step 3: Write `scripts/ru/lib/openverse.mjs`**

```js
// Openverse audio API (api.openverse.org) without a key: anonymous use allows 20 requests/min, 200/day.
// Shared by sfx-fetch.mjs (CC0 sounds) and music-fetch.mjs (CC0 / CC BY music).
import { writeFileSync } from "node:fs";

export const API = "https://api.openverse.org/v1/audio/";
const UA = { "User-Agent": "reels-studio-fetch" };
// CC BY-ND forbids syncing music to a picture (that is an adaptation); CC BY-SA would put the reel itself
// under BY-SA; NC is non-commercial. Design 2026-10-26: CC0 and CC BY only.
export const OK_LICENSES = new Set(["cc0", "by"]);
export const PAUSE_MS = 3200;                              // stays under 20 requests/min
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function searchUrl(q, { license = "cc0", source = null, page = 1, pageSize = 20, length = null } = {}) {
  const p = new URLSearchParams({ q, license, page: String(page), page_size: String(pageSize) });
  if (source) p.set("source", source);
  if (length) p.set("length", length);
  return `${API}?${p}`;
}

export async function search(q, opts = {}, fetchImpl = fetch) {
  const res = await fetchImpl(searchUrl(q, opts), { headers: UA });
  if (!res.ok) throw new Error(`Openverse ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).results ?? [];
}

// maxBytes: a Range request for the head of a long file (the screen needs ~90 s, not the whole track)
export async function download(url, file, { maxBytes = null } = {}, fetchImpl = fetch) {
  const headers = { ...UA, ...(maxBytes ? { Range: `bytes=0-${maxBytes - 1}` } : {}) };
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf.length;
}

export function licenseName(r) {
  if (r.license === "cc0") return "CC0";
  return `CC ${r.license.toUpperCase()} ${r.license_version || "4.0"}`;
}

// the line a CC BY track needs under the reel (CAPTION.md); CC0 needs none
export function creditLine(r) {
  return r.license === "cc0" ? null : `Музыка: «${r.title}» — ${r.creator} (${licenseName(r)})`;
}
```

- [ ] **Step 4: Write `scripts/ru/music-fetch.mjs`**

```js
#!/usr/bin/env node
// Brand music candidates from Openverse (Jamendo, Freesound, ccMixter): CC0 and CC BY only, instrumental,
// 60 s – 8 min. Free, no key. Only the head of each file is fetched (4 MB: enough for the screen and the
// review page); sound_review.py apply downloads the full track of an approved one.
//
//   node scripts/ru/music-fetch.mjs [--max 100] [--moods спокойный,технологичный] [--dry]
//   → brand/music/candidates/<id>.mp3 + candidates.json, then python3 scripts/ru/music_screen.py
//
// Skips ids already in candidates.json, in brand/music/rejected.json or in tracks.json (openverse_id).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OK_LICENSES, PAUSE_MS, search, download, sleep, licenseName, creditLine } from "./lib/openverse.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// mood (the word music-pick.mjs and tracks.json use) → Openverse queries
export const MOODS = {
  "спокойный": ["ambient calm", "soft ambient"],
  "технологичный": ["minimal electronic", "electronic chill"],
  "тёплый": ["soft piano", "calm piano"],
  "lo-fi": ["lofi", "lofi chill"],
  "кинематографичный": ["cinematic ambient", "cinematic pad"],
  "бодрый": ["chill beat", "upbeat chill"],
};
const SOURCES = "jamendo,freesound,ccmixter";
const NOT_MUSIC = /\b(vocals?|song|feat\.?|singer|voice|rap|lyrics|speech|interview|podcast|lecture|field recording|traffic|birds?|rain)\b/i;
const HEAD_BYTES = 4 * 1024 * 1024;

export function selectMusic(results, { mood, minMs = 60000, maxMs = 480000, seen = new Set() } = {}) {
  const text = (r) => `${r.title} ${(r.tags || []).map((t) => t.name).join(" ")}`;
  const instrumental = (r) => (r.tags || []).some((t) => t.name === "instrumental");
  return results
    .filter((r) => OK_LICENSES.has(r.license) && r.duration >= minMs && r.duration <= maxMs)
    .filter((r) => !seen.has(r.id) && !NOT_MUSIC.test(text(r)))
    .sort((a, b) => Number(instrumental(b)) - Number(instrumental(a)))
    .map((r) => ({ id: r.id, title: r.title, creator: r.creator, license: r.license, license_version: r.license_version,
      license_name: licenseName(r), license_url: r.license_url, credit: creditLine(r), source: r.source,
      page: r.foreign_landing_url, url: r.url, filetype: r.filetype, duration_ms: r.duration, mood: [mood],
      instrumental: instrumental(r) }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const max = Number(opt("--max", 100)), dry = args.includes("--dry");
  const moods = opt("--moods", Object.keys(MOODS).join(",")).split(",");
  const MUSIC = join(ROOT, "brand", "music"), DIR = join(MUSIC, "candidates");
  const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
  const cands = read(join(DIR, "candidates.json"), {});
  const seen = new Set([...Object.keys(cands), ...read(join(MUSIC, "rejected.json"), []),
    ...read(join(MUSIC, "tracks.json"), { tracks: [] }).tracks.map((t) => t.openverse_id).filter(Boolean)]);
  if (!dry) mkdirSync(DIR, { recursive: true });
  let got = 0, first = true;
  outer: for (const mood of moods) {
    if (!MOODS[mood]) { console.error(`unknown mood ${mood}: ${Object.keys(MOODS).join(", ")}`); process.exit(1); }
    for (const q of MOODS[mood]) for (const page of [1, 2]) {
      if (!first) await sleep(PAUSE_MS);
      first = false;
      const picks = selectMusic(await search(q, { license: "cc0,by", source: SOURCES, page }), { mood, seen });
      for (const c of picks) {
        if (got >= max) break outer;
        seen.add(c.id);
        if (dry) { console.log(`${mood}\t${c.license}\t${Math.round(c.duration_ms / 1000)} s\t${c.title} — ${c.creator}`); got++; continue; }
        const ext = /^mp3/.test(c.filetype || "mp3") ? "mp3" : c.filetype;
        const file = join(DIR, `${c.id}.${ext}`);
        try { await download(c.url, file, { maxBytes: HEAD_BYTES }); } catch (e) { console.warn(`skip ${c.title}: ${e.message}`); continue; }
        cands[c.id] = { ...c, file: file.slice(ROOT.length + 1), fetched: new Date().toISOString().slice(0, 10) };
        got++;
      }
    }
  }
  if (!dry) writeFileSync(join(DIR, "candidates.json"), JSON.stringify(cands, null, 1));
  console.log(`${got} new candidates${dry ? " (dry)" : ` → ${DIR.slice(ROOT.length + 1)}`}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/lib/openverse.mjs scripts/ru/music-fetch.mjs tests/sound.test.mjs
git commit -m "Sound library: Openverse client and music candidates (CC0 / CC BY only)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Палитра звуков и новый sfx-fetch

**Files:**
- Create: `scripts/ru/lib/sfx-palette.mjs`
- Modify (переписать целиком): `scripts/ru/sfx-fetch.mjs`
- Modify: `scripts/ru/sfx-kit.mjs` (импорт и строка с `join(KIT, "library", kind)`)
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `search`, `download`, `sleep`, `PAUSE_MS` из `scripts/ru/lib/openverse.mjs` (задача 1).
- Produces: `PALETTE` (ключи — папки: `whoosh, whoosh_big, whoosh_small, riser, hit, subdrop, click, click_tick, pop, paper, glass, chime, keyboard, ambience`), `folderFor(kind)`, `LEGACY`, `selectSfx(results, {minMs, maxMs, have})`; из `sfx-fetch.mjs`: `haveIds(sfxDir, folder) → Set<id>`, `migrateLegacy(lib, credits) → credits`.
- Записи `credits.json`: ключ `brand/sfx/library/<папка>/<id>.<ext>` → `{kind, title, creator, license, license_url, source, page, duration_ms, query, fetched}`.

- [ ] **Step 1: Write the failing tests** — дописать в `tests/sound.test.mjs` импорты рядом с остальными и тесты в конец:

```js
import { PALETTE, selectSfx, folderFor } from "../scripts/ru/lib/sfx-palette.mjs";
import { haveIds, migrateLegacy } from "../scripts/ru/sfx-fetch.mjs";
```

```js
test("sfx palette: every folder is a Real SFX role, the kit's tick lives in click_tick", () => {
  const expect = { whoosh: "whoosh", whoosh_big: "whoosh", whoosh_small: "whoosh", riser: "riser", hit: "hit",
    subdrop: "sub_drop", click: "click", click_tick: "click", pop: "pop", paper: "paper", glass: "glass",
    chime: "chime", keyboard: "typing", ambience: "ambience" };
  assert.deepEqual(Object.keys(PALETTE).sort(), Object.keys(expect).sort());
  const r = py(`import sys, json; sys.path.insert(0, ".claude/skills/real-sfx/scripts"); from common import tag_roles
print(json.dumps({k: tag_roles(f"main / {k} / x.mp3") for k in ${JSON.stringify(Object.keys(expect))}}))`);
  assert.equal(r.status, 0, r.stderr);
  const roles = JSON.parse(r.stdout);
  for (const [k, role] of Object.entries(expect)) assert.ok(roles[k].includes(role), `${k}: ${roles[k]}`);
  assert.equal(folderFor("tick"), "click_tick");
  assert.equal(folderFor("pop"), "pop");
});

test("sfx-fetch: CC0 Freesound files within the length limit, ids on disk skipped, legacy tick folder moved", () => {
  const r = (o) => ({ id: "a", license: "cc0", source: "freesound", duration: 300, ...o });
  const got = selectSfx([r({ id: "ok" }), r({ id: "by", license: "by" }), r({ id: "js", source: "jamendo" }),
    r({ id: "long", duration: 900 }), r({ id: "have" })], { maxMs: 400, have: new Set(["have"]) });
  assert.deepEqual(got.map((x) => x.id), ["ok"]);
  const d = tmp();
  mkdirSync(join(d, "library", "tick"), { recursive: true });
  writeFileSync(join(d, "library", "tick", "id1.mp3"), "x");
  mkdirSync(join(d, "rejected", "click_tick"), { recursive: true });
  writeFileSync(join(d, "rejected", "click_tick", "id2.mp3"), "x");
  const credits = migrateLegacy(join(d, "library"), { "brand/sfx/library/tick/id1.mp3": { kind: "tick" } });
  assert.ok(existsSync(join(d, "library", "click_tick", "id1.mp3")));
  assert.deepEqual(Object.keys(credits), ["brand/sfx/library/click_tick/id1.mp3"]);
  assert.equal(credits["brand/sfx/library/click_tick/id1.mp3"].kind, "click_tick");
  assert.deepEqual([...haveIds(d, "click_tick")].sort(), ["id1", "id2"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/ru/lib/sfx-palette.mjs'`.

- [ ] **Step 3: Write `scripts/ru/lib/sfx-palette.mjs`**

```js
// The brand sound palette «чисто и дорого» (design 2026-10-26): library folder → Openverse queries and
// length limits (ms). Folder names are Real SFX roles — its build_index.py reads the role from the folder:
// a tick lives in click_tick (a bare "tick" folder gets no role), a low drop in subdrop.
export const PALETTE = {
  whoosh:       { maxMs: 1600, queries: ["whoosh soft air", "swish soft", "whoosh"] },
  whoosh_big:   { maxMs: 2500, queries: ["cinematic whoosh soft", "whoosh transition"] },
  whoosh_small: { maxMs: 800, queries: ["swish short", "swoosh small"] },
  riser:        { maxMs: 5000, queries: ["soft riser", "swell", "reverse cymbal"] },
  hit:          { maxMs: 3000, queries: ["soft impact", "thud", "cinematic hit soft"] },
  subdrop:      { maxMs: 3500, queries: ["sub drop", "low boom", "sub bass hit"] },
  click:        { maxMs: 400, queries: ["switch click", "pen click", "mouse click"] },
  click_tick:   { maxMs: 400, queries: ["tick soft", "wood tick"] },
  pop:          { maxMs: 500, queries: ["soft pop", "bubble pop"] },
  paper:        { maxMs: 1500, queries: ["paper slide", "paper swipe"] },
  glass:        { maxMs: 1500, queries: ["glass tap", "glass ding soft"] },
  chime:        { maxMs: 3000, queries: ["shimmer", "soft bell", "mallet chime"] },
  keyboard:     { maxMs: 8000, queries: ["mechanical keyboard typing", "keyboard typing quiet"] },
  ambience:     { minMs: 10000, maxMs: 120000, long: true, queries: ["room tone", "quiet room ambience"] },
};

// sfx.py / sfx-kit.mjs kinds whose library folder has another name
const KIT_FOLDER = { tick: "click_tick" };
export const folderFor = (kind) => KIT_FOLDER[kind] ?? kind;

// library folders renamed since 2026-10-25 (sfx-fetch.mjs moves them once)
export const LEGACY = { tick: "click_tick" };

export function selectSfx(results, { minMs = 0, maxMs, have = new Set() }) {
  return results.filter((r) => r.license === "cc0" && r.source === "freesound" && r.duration
    && r.duration >= minMs && r.duration <= maxMs && !have.has(r.id));
}
```

- [ ] **Step 4: Переписать `scripts/ru/sfx-fetch.mjs` целиком**

```js
#!/usr/bin/env node
// Real recorded SFX from Openverse into brand/sfx/library/<folder>/ — CC0 only, Freesound only, the palette
// «чисто и дорого» (scripts/ru/lib/sfx-palette.mjs). The library feeds the Real SFX skill
// (.claude/skills/real-sfx) and the kit picker (scripts/ru/sfx-kit.mjs). Free, no key: anonymous Openverse
// allows 20 requests/min, 200/day; a full run makes ~35 searches.
//
//   node scripts/ru/sfx-fetch.mjs                      every folder, up to 30 new files each
//   node scripts/ru/sfx-fetch.mjs --kinds whoosh,subdrop --per 12
//   node scripts/ru/sfx-fetch.mjs --dry                print what would be downloaded
//
// Then python3 scripts/ru/sfx_screen.py. brand/sfx/library/credits.json keeps title, author, licence and
// source page of every file. Files already in library/, reserve/ or rejected/ are skipped; audio stays out
// of git (brand/sfx/* in .gitignore).
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { PAUSE_MS, search, download, sleep } from "./lib/openverse.mjs";
import { PALETTE, LEGACY, selectSfx } from "./lib/sfx-palette.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ids already on disk for a folder: library/, reserve/ and rejected/ (files are named <openverse id>.<ext>)
export function haveIds(sfxDir, folder) {
  const ids = new Set();
  for (const part of ["library", "reserve", "rejected"]) {
    const d = join(sfxDir, part, folder);
    if (existsSync(d)) for (const f of readdirSync(d)) ids.add(basename(f, extname(f)));
  }
  return ids;
}

// rename a legacy folder (library/tick → library/click_tick) and its credits keys, once
export function migrateLegacy(lib, credits) {
  for (const [old, now] of Object.entries(LEGACY)) {
    const a = join(lib, old), b = join(lib, now);
    if (!existsSync(a) || existsSync(b)) continue;
    renameSync(a, b);
    for (const k of Object.keys(credits)) {
      if (!k.includes(`/library/${old}/`)) continue;
      credits[k.replace(`/library/${old}/`, `/library/${now}/`)] = { ...credits[k], kind: now };
      delete credits[k];
    }
    console.log(`moved library/${old} → library/${now}`);
  }
  return credits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const kinds = opt("--kinds", Object.keys(PALETTE).join(",")).split(",");
  const per = Number(opt("--per", 30)), dry = args.includes("--dry");
  const SFX = join(ROOT, "brand", "sfx"), LIB = join(SFX, "library");
  const creditsPath = join(LIB, "credits.json");
  let credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")) : {};
  if (!dry) credits = migrateLegacy(LIB, credits);
  let first = true;
  for (const kind of kinds) {
    const p = PALETTE[kind];
    if (!p) { console.error(`unknown folder ${kind}: ${Object.keys(PALETTE).join(", ")}`); process.exit(1); }
    const have = haveIds(SFX, kind), dir = join(LIB, kind);
    if (!dry) mkdirSync(dir, { recursive: true });
    let got = 0;
    for (const q of p.queries) {
      if (got >= per) break;
      if (!first) await sleep(PAUSE_MS);
      first = false;
      const res = await search(q, { license: "cc0", source: "freesound", length: p.long ? null : "shortest" });
      for (const r of selectSfx(res, { minMs: p.minMs ?? 0, maxMs: p.maxMs, have })) {
        if (got >= per) break;
        have.add(r.id);
        const file = join(dir, `${r.id}.${r.filetype || "mp3"}`), rel = file.slice(ROOT.length + 1);
        if (dry) { console.log(`${kind}\t${(r.duration / 1000).toFixed(2)} s\t${r.title}`); got++; continue; }
        try { await download(r.url, file); } catch (e) { console.warn(`skip ${r.title}: ${e.message}`); continue; }
        credits[rel] = { kind, title: r.title, creator: r.creator, license: r.license, license_url: r.license_url,
          source: r.source, page: r.foreign_landing_url, duration_ms: r.duration, query: q,
          fetched: new Date().toISOString().slice(0, 10) };
        got++;
      }
    }
    console.log(`${kind}: ${got} new${dry ? " (dry)" : ` → ${dir.slice(ROOT.length + 1)}`}`);
  }
  if (!dry) writeFileSync(creditsPath, JSON.stringify(credits, null, 1));
}
```

- [ ] **Step 5: `scripts/ru/sfx-kit.mjs`** — добавить после последнего `import` строку

```js
import { folderFor } from "./lib/sfx-palette.mjs";
```

и заменить

```js
    const dir = join(KIT, "library", kind);
```

на

```js
    const dir = join(KIT, "library", folderFor(kind));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs && node --check scripts/ru/sfx-kit.mjs && grep -n "folderFor" scripts/ru/sfx-kit.mjs`
Expected: PASS, 5 tests; `node --check` молчит; `grep` показывает импорт и строку `join(KIT, "library", folderFor(kind))`. Сам `sfx-kit.mjs` не запускать: он перезаписывает `brand/sfx/<вид>.wav`.

- [ ] **Step 7: Commit**

```bash
git add scripts/ru/lib/sfx-palette.mjs scripts/ru/sfx-fetch.mjs scripts/ru/sfx-kit.mjs tests/sound.test.mjs
git commit -m "Sound library: brand SFX palette, folders named by Real SFX roles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Общие замеры звука

**Files:**
- Create: `scripts/ru/lib/audio_measure.py`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Produces (python, `sys.path.insert(0, "scripts/ru/lib"); import audio_measure as A`):
  `decode(path, sr=22050, seconds=None, start=0.0, mono=True) → np.ndarray`, `db(v)`, `frame_rms_db(x, sr, win_s, hop_s)`, `clip_fraction(x)`, `intro_seconds(x, sr, look_s=60, below_db=6)`, `loudness_range_db(x, sr)`, `steadiest_window(x, sr, start_s, dur_s=25, until_s=90) → (start, range_db)`, `band_share(x, sr, lo=1000, hi=4000)`, `audible_span(x, sr, floor_db=-40) → (a_s, b_s)`, `attack_ms(x, sr)`, `hiss(x, sr, frame=1024) → (level_db | None, flatness | None)`, `centroid_hz(x, sr)`, `stereo_corr(x2)`.

- [ ] **Step 1: Write the failing test** — в конец `tests/sound.test.mjs`:

```js
// ---------- library: measurements ----------

test("audio_measure: voice band, clipping, intro, evenness, attack, hiss, brightness, antiphase", () => {
  const r = py(`
import sys, numpy as np
sys.path.insert(0, "scripts/ru/lib"); import audio_measure as A
sr = 22050; t = np.arange(sr * 20) / sr; rng = np.random.default_rng(1)
hi = 0.5 * np.sin(2 * np.pi * 2000 * t); lo = 0.5 * np.sin(2 * np.pi * 100 * t)
assert A.band_share(hi, sr) > 0.9 and A.band_share(lo, sr) < 0.05
assert A.clip_fraction(np.clip(3 * lo, -1, 1)) > 0.3 and A.clip_fraction(lo) == 0
noise = 0.2 * rng.standard_normal(sr * 30)
i = A.intro_seconds(np.concatenate([np.zeros(sr * 10), noise]), sr); assert 9.0 <= i <= 10.5, i
assert A.loudness_range_db(noise, sr) < 1.5
steps = np.concatenate([noise[: sr * 5], 0.1 * noise[: sr * 5]] * 4)
assert A.loudness_range_db(steps, sr) > 12
s, rg = A.steadiest_window(np.concatenate([steps, noise]), sr, 0, dur_s=10, until_s=60); assert s >= 40 and rg < 1.5, (s, rg)
click = np.zeros(sr); click[100:300] = np.exp(-np.arange(200) / 20) * rng.standard_normal(200)
ramp = np.zeros(sr); ramp[:4410] = np.linspace(0, 1, 4410) * rng.standard_normal(4410) * 0.5
assert A.attack_ms(click, sr) < 5 and A.attack_ms(ramp, sr) > 100, (A.attack_ms(click, sr), A.attack_ms(ramp, sr))
a, b = A.audible_span(click, sr); assert b - a < 0.02
sr2 = 44100; k = np.arange(int(0.3 * sr2)) / sr2
hissy = 0.05 * rng.standard_normal(len(k)) + 0.8 * np.sin(2 * np.pi * 3000 * k) * np.exp(-60 * (k - 0.1)) * (k >= 0.1)
lv, fl = A.hiss(hissy, sr2); assert lv > -35 and fl > 0.4, (lv, fl)
t3 = np.arange(3 * sr2) / sr2
_, fl3 = A.hiss(0.5 * np.sin(2 * np.pi * 800 * t3) * np.sin(np.pi * t3 / 3), sr2); assert fl3 < 0.1, fl3
assert A.hiss(np.zeros(100), sr2) == (None, None)
assert A.stereo_corr(np.stack([lo, -lo], 1)) < -0.9 and A.stereo_corr(np.stack([lo, lo], 1)) > 0.99
assert 1800 < A.centroid_hz(hi, sr) < 2200
print("ok")
`);
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `ModuleNotFoundError: No module named 'audio_measure'`.

- [ ] **Step 3: Write `scripts/ru/lib/audio_measure.py`**

```python
"""Shared measurements for the brand sound library (music_screen.py, sfx_screen.py, sound_review.py).
numpy + ffmpeg only, system python3. Functions take float samples in −1…1 (mono unless named x2) and a rate."""
import subprocess
import numpy as np


def decode(path, sr=22050, seconds=None, start=0.0, mono=True):
    a = ["ffmpeg", "-v", "error"] + (["-ss", str(start)] if start else []) + ["-i", str(path)]
    a += (["-t", str(seconds)] if seconds else []) + ["-vn", "-ac", "1" if mono else "2", "-ar", str(sr), "-f", "f32le", "-"]
    r = subprocess.run(a, capture_output=True)
    if r.returncode != 0: raise RuntimeError(f"ffmpeg decode {path}: {r.stderr.decode()[-300:]}")
    x = np.frombuffer(r.stdout, "<f4").astype(np.float64)
    return x if mono else x.reshape(-1, 2)


def db(v):
    return float(20 * np.log10(max(float(v), 1e-9)))


def frame_rms_db(x, sr, win_s, hop_s):
    w, h = max(1, int(win_s * sr)), max(1, int(hop_s * sr))
    if len(x) < w: return np.array([db(np.sqrt((x ** 2).mean()))]) if len(x) else np.array([-180.0])
    n = 1 + (len(x) - w) // h
    idx = np.arange(w)[None, :] + h * np.arange(n)[:, None]
    return 20 * np.log10(np.sqrt((x[idx] ** 2).mean(axis=1)) + 1e-9)


def clip_fraction(x):
    return float((np.abs(x) >= 0.999).mean()) if len(x) else 0.0


def intro_seconds(x, sr, look_s=60.0, below_db=6.0):
    """Seconds until the 1 s level first comes within below_db of the median level of the first look_s."""
    lv = frame_rms_db(x[: int(look_s * sr)], sr, 1.0, 0.5)
    ref = float(np.median(lv[lv > -70])) if (lv > -70).any() else -70.0
    hit = np.nonzero(lv >= ref - below_db)[0]
    return float(hit[0] * 0.5) if len(hit) else float(len(x) / sr)


def loudness_range_db(x, sr):
    """Spread of the 3 s level (hop 1 s): 95th minus 10th percentile, dB."""
    lv = frame_rms_db(x, sr, 3.0, 1.0)
    return float(np.percentile(lv, 95) - np.percentile(lv, 10))


def steadiest_window(x, sr, start_s, dur_s=25.0, until_s=90.0):
    """(start, range_db) of the most even dur_s window between start_s and until_s, 1 s steps."""
    best = (float(start_s), float("inf"))
    last = min(until_s, len(x) / sr) - dur_s
    for s in np.arange(start_s, max(start_s, last) + 1e-9, 1.0):
        r = loudness_range_db(x[int(s * sr): int((s + dur_s) * sr)], sr)
        if r < best[1] - 1e-9: best = (float(s), r)
    return best


def band_share(x, sr, lo=1000.0, hi=4000.0, total=(50.0, 10000.0)):
    """Share of the power between lo and hi Hz (the voice's presence band) within total."""
    n = 4096
    if len(x) < n: x = np.pad(x, (0, n - len(x)))
    frames = x[: (len(x) // n) * n].reshape(-1, n) * np.hanning(n)
    p = (np.abs(np.fft.rfft(frames, axis=1)) ** 2).sum(axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    band, tot = p[(f >= lo) & (f < hi)].sum(), p[(f >= total[0]) & (f < total[1])].sum()
    return float(band / tot) if tot > 0 else 0.0


def audible_span(x, sr, floor_db=-40.0):
    """(start, end) seconds of what is louder than floor_db under the peak."""
    env = np.abs(x)
    pk = env.max() if len(env) else 0.0
    if pk <= 0: return 0.0, 0.0
    on = np.nonzero(env >= pk * 10 ** (floor_db / 20))[0]
    return float(on[0] / sr), float((on[-1] + 1) / sr)


def attack_ms(x, sr):
    """Milliseconds from the first moment within 20 dB of the peak to the peak (2 ms envelope, 1 ms hop)."""
    e = frame_rms_db(x, sr, 0.002, 0.001)
    k = int(np.argmax(e))
    first = int(np.nonzero(e >= e[k] - 20)[0][0])
    return float(k - first)


def hiss(x, sr, frame=1024):
    """(level dB under the peak, spectral flatness 0…1) of the quietest tenth of frames inside the audible span.
    Broadband hiss is flat (about 0.5); a tonal or band-limited tail is not (under 0.2).
    (None, None) when the sound is shorter than one frame."""
    a, b = audible_span(x, sr)
    seg = x[int(a * sr): int(b * sr)]
    n = len(seg) // frame
    if n < 1: return None, None
    fr = seg[: n * frame].reshape(n, frame)
    lv = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-9)
    quiet = lv <= np.percentile(lv, 10)
    f = np.fft.rfftfreq(frame, 1 / sr)
    band = (f >= 100) & (f <= min(16000.0, sr / 2 - 1))
    p = np.abs(np.fft.rfft(fr[quiet] * np.hanning(frame), axis=1))[:, band] ** 2 + 1e-20
    flat = float(np.mean(np.exp(np.log(p).mean(axis=1)) / p.mean(axis=1)))
    return float(np.median(lv[quiet]) - db(np.abs(seg).max())), flat


def centroid_hz(x, sr):
    p = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return float((f * p).sum() / p.sum()) if p.sum() > 0 else 0.0


def stereo_corr(x2):
    """Correlation of the two channels: 1 the same, about 0 unrelated, negative in antiphase (vanishes in mono)."""
    if x2.ndim == 1 or x2.shape[1] < 2: return 1.0
    a, b = x2[:, 0], x2[:, 1]
    if a.std() == 0 or b.std() == 0: return 1.0
    return float(np.corrcoef(a, b)[0, 1])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/lib/audio_measure.py tests/sound.test.mjs
git commit -m "Sound library: shared audio measurements for the screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Отсев музыки

**Files:**
- Create: `scripts/ru/music_screen.py`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `audio_measure` (задача 3); `candidates.json` (задача 1); `.claude/skills/real-sfx/scripts/beats.py` (`beats.py <audio> --out <json>` → `{"tempo", "confidence", ...}`).
- Produces `<dir>/screen.json`: `{ "<id>": {status: "pass"|"cut"|"fail", reasons: [...], bpm: float|null, beat: bool, clip, intro_s, excerpt_start, range_db, voice_share, score} }`. `reasons` ⊂ `short, clipping, intro, uneven, tempo, voice-band`.

- [ ] **Step 1: Write the failing test**

```js
const BEAT = "0.5*sin(2*PI*55*t)*exp(-20*mod(t\\,0.6))+0.08*sin(2*PI*220*t)+0.05*sin(2*PI*330*t)";

test("music_screen: a steady 100 BPM track passes with its tempo, a long intro and clipping fail", { timeout: 180000 }, () => {
  const d = tmp("music-");
  ff("-f", "lavfi", "-i", `aevalsrc=${BEAT}:s=22050:d=70`, join(d, "good.wav"));
  ff("-f", "lavfi", "-i", `aevalsrc=(${BEAT})*gte(t\\,12):s=22050:d=82`, join(d, "intro.wav"));
  ff("-f", "lavfi", "-i", `aevalsrc=4*(${BEAT}):s=22050:d=70`, join(d, "clip.wav"));
  writeFileSync(join(d, "candidates.json"), JSON.stringify(Object.fromEntries(
    ["good", "intro", "clip"].map((k) => [k, { file: join(d, `${k}.wav`) }]))));
  const r = spawnSync("python3", ["scripts/ru/music_screen.py", "--dir", d], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(join(d, "screen.json"), "utf8"));
  assert.equal(s.good.status, "pass", JSON.stringify(s.good));
  assert.ok(Math.abs(s.good.bpm - 100) < 3, `bpm ${s.good.bpm}`);
  assert.ok(s.good.range_db < 3 && s.good.excerpt_start >= 0, JSON.stringify(s.good));
  assert.deepEqual(s.intro.reasons, ["intro"]);
  assert.ok(s.clip.reasons.includes("clipping"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `python3: can't open file '.../scripts/ru/music_screen.py'`.

- [ ] **Step 3: Write `scripts/ru/music_screen.py`**

```python
#!/usr/bin/env python3
# Screen of the brand music candidates (music-fetch.mjs) by measurement, before the customer listens.
#   python3 scripts/ru/music_screen.py [--dir brand/music/candidates] [--keep 30]
#   → <dir>/screen.json {id: {status: pass | cut | fail, reasons, bpm, beat, intro_s, excerpt_start, range_db, voice_share, score}}
# Rules (design 2026-10-26): tempo 80–125 BPM or no beat (a pad); the level reaches its working value within
# 4 s; the most even 25 s window spreads ≤ 8 dB; no clipping; the voice band 1–4 kHz is not crowded — the most
# crowded quarter of the batch is dropped (with ≥ 8 tracks; otherwise a share above 0.45). The best `keep`
# pass, the rest are cut. Tempo: Real SFX beats.py on the analysed stretch. numpy + ffmpeg only.
import json, os, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import audio_measure as A

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BEATS = os.path.join(ROOT, ".claude", "skills", "real-sfx", "scripts", "beats.py")
SR = 22050
TEMPO = (80.0, 125.0)
MAX_INTRO_S, MAX_RANGE_DB, MAX_CLIP, EXCERPT_S, LOOK_S = 4.0, 8.0, 0.001, 25.0, 90.0


def tempo_of(x, sr):
    """(bpm or None, beat) from beats.py; confidence under 0.5 is a pad (no beat). Octaves fold into 80–125."""
    with tempfile.TemporaryDirectory() as d:
        wav, out = os.path.join(d, "a.wav"), os.path.join(d, "b.json")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "1", "-ar", str(sr), "-i", "-", wav],
                       input=x.astype("<f4").tobytes(), check=True)
        r = subprocess.run([sys.executable, BEATS, wav, "--out", out], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out): return None, False
        b = json.load(open(out))
    if (b.get("confidence") or 0) < 0.5: return None, False
    bpm = float(b["tempo"])
    while bpm > TEMPO[1] and bpm / 2 >= 60: bpm /= 2
    while bpm < TEMPO[0] and bpm * 2 <= TEMPO[1]: bpm *= 2
    return round(bpm, 1), True


def measure(path):
    x = A.decode(path, sr=SR, seconds=LOOK_S + 10)
    m = {"reasons": [], "bpm": None, "beat": False}
    if len(x) < 40 * SR:
        m["reasons"].append("short"); return m
    m["clip"] = round(A.clip_fraction(x), 5)
    if m["clip"] > MAX_CLIP: m["reasons"].append("clipping")
    m["intro_s"] = A.intro_seconds(x, SR)
    if m["intro_s"] > MAX_INTRO_S: m["reasons"].append("intro")
    if m["reasons"]: return m
    start, rng = A.steadiest_window(x, SR, m["intro_s"], EXCERPT_S, LOOK_S)
    m["excerpt_start"], m["range_db"] = start, round(rng, 1)
    if rng > MAX_RANGE_DB:
        m["reasons"].append("uneven"); return m
    m["voice_share"] = round(A.band_share(x[int(start * SR): int((start + EXCERPT_S) * SR)], SR), 3)
    m["bpm"], m["beat"] = tempo_of(x[int(m["intro_s"] * SR):], SR)
    if m["beat"] and not TEMPO[0] <= m["bpm"] <= TEMPO[1]: m["reasons"].append("tempo")
    return m


def screen(paths, keep):
    """{id: path} → {id: measurement + status}."""
    out = {i: measure(p) for i, p in paths.items()}
    ok = [i for i, m in out.items() if not m["reasons"]]
    shares = [out[i]["voice_share"] for i in ok]
    cut = float(np.percentile(shares, 75)) if len(shares) >= 8 else 0.45
    for i in ok:
        if out[i]["voice_share"] > cut + 1e-9: out[i]["reasons"].append("voice-band")
    ok = [i for i in ok if not out[i]["reasons"]]
    for i in ok: out[i]["score"] = round(-out[i]["range_db"] - 20 * out[i]["voice_share"], 2)
    ok.sort(key=lambda i: -out[i]["score"])
    for i, m in out.items():
        m["status"] = "fail" if m["reasons"] else ("pass" if ok.index(i) < keep else "cut")
    return out


def main():
    a = sys.argv[1:]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    d = os.path.abspath(opt("--dir", os.path.join(ROOT, "brand", "music", "candidates")))
    keep = int(opt("--keep", 30))
    cands = json.load(open(os.path.join(d, "candidates.json")))
    paths = {i: (c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])) for i, c in cands.items()}
    res = screen({i: p for i, p in paths.items() if os.path.exists(p)}, keep)
    json.dump(res, open(os.path.join(d, "screen.json"), "w"), ensure_ascii=False, indent=1)
    st = [m["status"] for m in res.values()]
    why = {}
    for m in res.values():
        for r in m["reasons"]: why[r] = why.get(r, 0) + 1
    print(f"{len(res)} tracks: {st.count('pass')} pass, {st.count('cut')} cut, {st.count('fail')} fail {why}")
    print(f"→ {os.path.relpath(os.path.join(d, 'screen.json'), ROOT)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 7 tests (тест музыки идёт ~15 с: beats.py на двух треках).

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/music_screen.py tests/sound.test.mjs
git commit -m "Sound library: music screen by tempo, intro, evenness, clipping and voice band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Отсев звуков

**Files:**
- Create: `scripts/ru/sfx_screen.py`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `audio_measure` (задача 3), папки палитры (задача 2), `credits.json`.
- Produces `<lib>/screen.json`: `{ "<папка>/<файл>": {status: "shortlist"|"reserve"|"rejected"|"approved", reasons, dur, peak_db, clip, hiss_db, flatness, attack_ms, centroid, corr, score} }`; функция `move(lib, rel, part, credits)` (импортирует задача 7).
- Файлы: `rejected` → `<lib>/../rejected/<папка>/`, `reserve` → `<lib>/../reserve/<папка>/`; ключи `credits.json` переезжают вместе с файлом (`/library/` → `/rejected/` или `/reserve/`). Файл с `credits[...]["approved"]` всегда остаётся в библиотеке со статусом `approved` и не занимает место в шорт-листе.

- [ ] **Step 1: Write the failing test**

```js
test("sfx_screen: clipped, hissy and wrong-length files go to rejected/, the best per role stay, approved never move", { timeout: 60000 }, () => {
  const d = tmp("sfxs-"), lib = join(d, "library");
  for (const f of ["click", "whoosh"]) mkdirSync(join(lib, f), { recursive: true });
  const gen = (rel, expr, dur) => ff("-f", "lavfi", "-i", `aevalsrc=${expr}:s=44100:d=${dur}`, join(lib, rel));
  gen("click/good1.wav", "0.8*sin(2*PI*3000*t)*exp(-200*t)", 0.3);
  gen("click/good2.wav", "0.7*sin(2*PI*2500*t)*exp(-150*t)", 0.3);
  gen("click/good3.wav", "0.6*sin(2*PI*1000*t)*exp(-150*t)", 0.3);
  gen("click/clipped.wav", "4*sin(2*PI*3000*t)*exp(-20*t)", 0.3);
  gen("click/hissy.wav", "0.05*(2*random(0)-1)+0.8*sin(2*PI*3000*t)*exp(-200*(t-0.1))*gte(t\\,0.1)", 0.3);
  gen("whoosh/long.wav", "0.5*sin(2*PI*800*t)*sin(PI*t/3)", 3);
  writeFileSync(join(lib, "credits.json"), JSON.stringify({ "brand/sfx/library/click/clipped.wav": { kind: "click" },
    "brand/sfx/library/click/good3.wav": { kind: "click", approved: "2026-10-26" } }));
  const r = spawnSync("python3", ["scripts/ru/sfx_screen.py", "--lib", lib, "--per-role", "1"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(join(lib, "screen.json"), "utf8"));
  assert.equal(s["click/good1.wav"].status, "shortlist", JSON.stringify(s["click/good1.wav"]));
  assert.equal(s["click/good2.wav"].status, "reserve");
  assert.equal(s["click/good3.wav"].status, "approved");
  assert.ok(s["click/clipped.wav"].reasons.includes("clipping"));
  assert.ok(s["click/hissy.wav"].reasons.includes("noisy"), JSON.stringify(s["click/hissy.wav"]));
  assert.deepEqual(s["whoosh/long.wav"].reasons, ["length"]);
  assert.ok(existsSync(join(d, "rejected", "click", "clipped.wav")));
  assert.ok(existsSync(join(d, "reserve", "click", "good2.wav")));
  assert.ok(existsSync(join(lib, "click", "good1.wav")) && existsSync(join(lib, "click", "good3.wav")));
  const credits = JSON.parse(readFileSync(join(lib, "credits.json"), "utf8"));
  assert.ok("brand/sfx/rejected/click/clipped.wav" in credits, Object.keys(credits).join(", "));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `can't open file '.../scripts/ru/sfx_screen.py'`.

- [ ] **Step 3: Write `scripts/ru/sfx_screen.py`**

```python
#!/usr/bin/env python3
# Screen of the brand SFX library (sfx-fetch.mjs) by measurement, before the customer listens.
#   python3 scripts/ru/sfx_screen.py [--lib brand/sfx/library] [--per-role 6] [--dry]
#   → <lib>/screen.json {"<folder>/<file>": {status: shortlist | reserve | rejected | approved, reasons, dur, ...}}
# A failing file moves to <lib>/../rejected/<folder>/, one past the per-role shortlist to <lib>/../reserve/<folder>/
# (Real SFX indexes only the library); credits.json keys follow the move. A file the customer approved
# (credits "approved") always stays. --dry moves nothing.
# Rules (design 2026-10-26): audible length within the role's limits, no clipping, no broadband hiss
# (quietest frames louder than −35 dB under the peak AND flat; not for ambience), channels not in antiphase.
# The shortlist is ranked by closeness to the role's brightness and attack («чисто и дорого»: soft whooshes
# and risers, crisp clicks, dark low hits).
import json, os, shutil, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
import audio_measure as A

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SR = 44100
AUDIO = (".wav", ".mp3", ".flac", ".ogg", ".aif", ".aiff", ".m4a")
# folder: (min s, max s, attack "soft" | "sharp" | None, target centroid Hz)
RULES = {
    "whoosh": (0.2, 1.6, "soft", 1500), "whoosh_big": (0.4, 2.5, "soft", 900), "whoosh_small": (0.1, 0.8, "soft", 2000),
    "riser": (1.0, 5.0, "soft", 1500), "hit": (0.15, 3.0, "sharp", 300), "subdrop": (0.3, 3.5, None, 120),
    "click": (0.005, 0.4, "sharp", 3000), "click_tick": (0.005, 0.4, "sharp", 3500), "pop": (0.02, 0.5, "sharp", 1200),
    "paper": (0.05, 1.5, None, 3000), "glass": (0.05, 1.5, "sharp", 4000), "chime": (0.2, 3.0, None, 3000),
    "keyboard": (1.0, 8.0, None, 2500), "ambience": (8.0, 600.0, None, 500),
}
DEFAULT_RULE = (0.01, 10.0, None, 1500)


def measure(path, folder):
    lo, hi, att, target = RULES.get(folder, DEFAULT_RULE)
    x2 = A.decode(path, sr=SR, seconds=hi + 5, mono=False)
    x = x2.mean(axis=1)
    a, b = A.audible_span(x, SR)
    body = x[int(a * SR): int(b * SR)] if b > a else x
    h_lv, flat = A.hiss(x, SR)
    m = {"dur": round(b - a, 3), "peak_db": round(A.db(np.abs(x).max()) if len(x) else -180.0, 1),
         "clip": round(A.clip_fraction(x2.ravel()), 5), "hiss_db": None if h_lv is None else round(h_lv, 1),
         "flatness": None if flat is None else round(flat, 2), "attack_ms": A.attack_ms(x, SR) if len(x) else 0.0,
         "centroid": round(A.centroid_hz(body, SR)), "corr": round(A.stereo_corr(x2), 2), "reasons": []}
    if not lo <= m["dur"] <= hi: m["reasons"].append("length")
    if m["clip"] > 0.001: m["reasons"].append("clipping")
    if folder != "ambience" and h_lv is not None and h_lv > -35 and flat > 0.4: m["reasons"].append("noisy")
    if m["corr"] < -0.3: m["reasons"].append("antiphase")
    soft = m["attack_ms"] >= 25
    m["score"] = round(-abs(np.log2(max(m["centroid"], 20) / target)) - (0.5 if att and soft != (att == "soft") else 0.0), 2)
    return m


def credit_key(credits, rel):
    return next((k for k in credits if k.endswith("/library/" + rel)), None)


def move(lib, rel, part, credits):
    """library/<folder>/<file> → <part>/<folder>/<file> next to the library; the credits key follows."""
    dst = os.path.join(os.path.dirname(lib), part, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(os.path.join(lib, rel), dst)
    k = credit_key(credits, rel)
    if k: credits[k[: -len("/library/" + rel)] + f"/{part}/" + rel] = credits.pop(k)


def screen(lib, per_role, dry=False):
    cp = os.path.join(lib, "credits.json")
    credits = json.load(open(cp)) if os.path.exists(cp) else {}
    res = {}
    for folder in sorted(os.listdir(lib)):
        d = os.path.join(lib, folder)
        if not os.path.isdir(d): continue
        ms = {f"{folder}/{f}": measure(os.path.join(d, f), folder) for f in sorted(os.listdir(d)) if f.lower().endswith(AUDIO)}
        approved = {k for k in ms if (credits.get(credit_key(credits, k)) or {}).get("approved")}
        ok = sorted((k for k, m in ms.items() if not m["reasons"] and k not in approved), key=lambda k: -ms[k]["score"])
        for k, m in ms.items():
            m["status"] = ("approved" if k in approved else "rejected" if m["reasons"]
                           else "shortlist" if ok.index(k) < per_role else "reserve")
        res.update(ms)
    if not dry:
        for k, m in res.items():
            if m["status"] in ("rejected", "reserve"): move(lib, k, m["status"], credits)
        json.dump(credits, open(cp, "w"), ensure_ascii=False, indent=1)
    json.dump(res, open(os.path.join(lib, "screen.json"), "w"), ensure_ascii=False, indent=1)
    return res


def main():
    a = sys.argv[1:]
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    lib = os.path.abspath(opt("--lib", os.path.join(ROOT, "brand", "sfx", "library")))
    res = screen(lib, int(opt("--per-role", 6)), dry="--dry" in a)
    by = {}
    for k, m in res.items():
        f = by.setdefault(k.split("/")[0], {})
        f[m["status"]] = f.get(m["status"], 0) + 1
    for f, c in by.items(): print(f"{f:14s} " + ", ".join(f"{s} {n}" for s, n in sorted(c.items())))
    print(f"→ {os.path.relpath(os.path.join(lib, 'screen.json'), ROOT)}" + (" (dry: nothing moved)" if "--dry" in a else ""))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/sfx_screen.py tests/sound.test.mjs
git commit -m "Sound library: SFX screen with per-role shortlist, rejected and reserve folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Страница прослушивания — build и serve

**Files:**
- Create: `scripts/ru/sound_review.py` (части `build`, `serve`, отметки)
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `screen.json` музыки (задача 4) и звуков (задача 5), `candidates.json` (задача 1), `scripts/ru/fx/sound.py` как модуль (`decode, fit, db, smooth_gain, to_samples, Words, write_wav, SR`), `audio_measure`.
- Produces: `<out>/index.html`, `<out>/music/<id>.clean.mp3`, `<out>/music/<id>.voice.mp3`, `<out>/sfx/<папка>__<файл>.png`, `<out>/signature/{A,B,C}.mp3`, `<out>/signature/{A,B,C}.context.mp3`, `<out>/signature/variants.json` (`{"A": [{file (от корня репо), role, dt, gain_db}, ...]}`).
- Produces: `record_verdict(mdir, lib, section, id, verdict)`, `load_marks(mdir, lib) → {"music": {id: "yes"|"no"}, "sfx": {key: ...}, "signature": "A"|"B"|"C"|None}`. Отметки музыки — `<mdir>/review.json` (`{"music": {...}}`), звуков и фирменного звука — `<lib>/review.json` (`{"sfx": {...}, "signature": "B"}`).
- HTTP (только `127.0.0.1`): `GET /` → страница, `GET /a/<путь>` → файлы `<out>`, `GET /lib/<папка>/<файл>` → файлы библиотеки, `GET /verdicts`, `POST /verdict` `{section, id, verdict}`.

- [ ] **Step 1: Write the failing tests**

```js
// ---------- library: review page ----------

function reviewFixture() {
  const d = tmp("rev-"), mdir = join(d, "music"), cand = join(mdir, "candidates"), lib = join(d, "sfx", "library"), reel = join(d, "reel");
  for (const p of [cand, join(reel, "renders"), ...["whoosh", "subdrop", "chime", "riser", "click"].map((f) => join(lib, f))]) mkdirSync(p, { recursive: true });
  ff("-f", "lavfi", "-i", `aevalsrc=${BEAT}:s=22050:d=40`, join(cand, "m1.wav"));
  writeFileSync(join(cand, "candidates.json"), JSON.stringify({ m1: { file: join(cand, "m1.wav"), title: "Calm </script>", creator: "Ann",
    license: "by", license_name: "CC BY 4.0", credit: "Музыка: «Calm» — Ann (CC BY 4.0)", mood: ["спокойный"], source: "jamendo",
    page: "https://x/1", url: `file://${join(cand, "m1.wav")}` } }));
  writeFileSync(join(cand, "screen.json"), JSON.stringify({ m1: { status: "pass", score: -3, bpm: 100, excerpt_start: 2, reasons: [] } }));
  const sfx = { "whoosh/w.wav": "0.5*sin(2*PI*900*t)*sin(PI*t/0.6)", "subdrop/s.wav": "0.8*sin(2*PI*50*t)*exp(-4*t)",
    "chime/c.wav": "0.4*sin(2*PI*2000*t)*exp(-3*t)", "riser/r.wav": "0.4*sin(2*PI*600*t)*t/1.5", "click/k.wav": "0.8*sin(2*PI*3000*t)*exp(-200*t)" };
  const dur = { "whoosh/w.wav": 0.6, "subdrop/s.wav": 1.2, "chime/c.wav": 1.0, "riser/r.wav": 1.5, "click/k.wav": 0.2 };
  const scr = {};
  for (const [k, e] of Object.entries(sfx)) {
    ff("-f", "lavfi", "-i", `aevalsrc=${e}:s=44100:d=${dur[k]}`, join(lib, k));
    scr[k] = { status: "shortlist", reasons: [], dur: dur[k], attack_ms: 10, centroid: 1000, score: -0.1 };
  }
  writeFileSync(join(lib, "screen.json"), JSON.stringify(scr));
  writeFileSync(join(lib, "credits.json"), JSON.stringify({}));
  ff("-f", "lavfi", "-i", "color=c=gray:s=108x192:r=30:d=6", "-f", "lavfi", "-i", "sine=f=220:d=6:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-c:a", "aac", join(reel, "renders", "clean.mp4"));
  writeFileSync(join(reel, "transcript.clean.json"), JSON.stringify({ audio_duration_secs: 6, words: [
    { text: "раз", start: 0.5, end: 1.5 }, { text: "два", start: 3.0, end: 4.0 }] }));
  return { d, mdir, lib, reel, out: join(d, "out") };
}

test("sound_review build: music clean and under the voice, SFX with spectrograms, three signature variants", { timeout: 120000 }, () => {
  const f = reviewFixture();
  const r = spawnSync("python3", ["scripts/ru/sound_review.py", "build", "--out", f.out, "--music-dir", f.mdir, "--lib", f.lib,
    "--voice-reel", f.reel, "--voice-start", "0", "--swap-t", "3"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  for (const p of ["index.html", "music/m1.clean.mp3", "music/m1.voice.mp3", "sfx/click__k.wav.png", "signature/B.mp3", "signature/C.context.mp3"])
    assert.ok(existsSync(join(f.out, p)), p);
  const html = readFileSync(join(f.out, "index.html"), "utf8");
  assert.match(html, /"id": "m1"/);
  assert.doesNotMatch(html, /Calm <\/script>/);                 // untrusted titles cannot close the script tag
  const v = JSON.parse(readFileSync(join(f.out, "signature", "variants.json"), "utf8"));
  assert.deepEqual(Object.keys(v).sort(), ["A", "B", "C"]);
  assert.equal(v.B.length, 3);
  assert.equal(v.B[1].role, "sub_drop");
  assert.ok(!v.B[0].file.startsWith("/"), "variant files are relative to the repo");
});

test("sound_review serve: marks are saved per section, bad marks refused, files outside the library unreachable", { timeout: 60000 }, async () => {
  const f = reviewFixture();
  const port = 18000 + Math.floor(Math.random() * 2000);
  const p = spawn("python3", ["scripts/ru/sound_review.py", "serve", "--out", f.out, "--music-dir", f.mdir, "--lib", f.lib, "--port", String(port)], { cwd: ROOT });
  try {
    await new Promise((ok, bad) => { p.stdout.on("data", (b) => String(b).includes("http://") && ok()); p.on("exit", () => bad(new Error("serve exited"))); });
    const base = `http://127.0.0.1:${port}`;
    const post = (o) => fetch(`${base}/verdict`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) });
    assert.equal((await post({ section: "music", id: "m1", verdict: "yes" })).status, 200);
    assert.equal((await post({ section: "sfx", id: "click/k.wav", verdict: "no" })).status, 200);
    assert.equal((await post({ section: "signature", id: "B", verdict: "pick" })).status, 200);
    assert.equal((await post({ section: "music", id: "m1", verdict: "maybe" })).status, 400);
    assert.deepEqual(await (await fetch(`${base}/verdicts`)).json(), { music: { m1: "yes" }, sfx: { "click/k.wav": "no" }, signature: "B" });
    assert.equal((await fetch(`${base}/lib/click/k.wav`)).status, 200);
    assert.equal((await fetch(`${base}/lib/..%2F..%2Fmusic%2Freview.json`)).status, 404);
    assert.equal(JSON.parse(readFileSync(join(f.mdir, "review.json"), "utf8")).music.m1, "yes");
    assert.equal(JSON.parse(readFileSync(join(f.lib, "review.json"), "utf8")).signature, "B");
  } finally { p.kill(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `can't open file '.../scripts/ru/sound_review.py'` (build) и `serve exited` (serve).

- [ ] **Step 3: Write `scripts/ru/sound_review.py` (build + serve + отметки)**

```python
#!/usr/bin/env python3
# The customer's listening page for the brand sound library (design 2026-10-26). Claude cannot hear:
# the customer marks «беру / нет» once, and the marks become the library.
#   python3 scripts/ru/sound_review.py build [--out .cache/sound-review] [--voice-reel <reel>] [--voice-start 5] [--swap-t 43.29]
#   python3 scripts/ru/sound_review.py serve [--out .cache/sound-review] [--port 8765]   → http://127.0.0.1:8765
#   python3 scripts/ru/sound_review.py apply [--out .cache/sound-review] [--no-index]
#   common: [--music-dir brand/music] [--lib brand/sfx/library]
#
# build: music that passed music_screen.py → 25 s clean + the same 25 s under the voice of <reel> at the levels
#        sound.py uses (music −17 dB against the voice between phrases, −9 dB more under speech); SFX shortlisted
#        by sfx_screen.py with a spectrogram; 3 signature variants, alone and on a background swap of <reel>.
# serve: the page on 127.0.0.1 only; marks go to <music-dir>/review.json and <lib>/review.json.
# apply: approved tracks → full download into <music-dir> + tracks.json, rejected ids → rejected.json; rejected
#        SFX → <lib>/../rejected/<folder>/, approved get credits "approved"; the chosen signature →
#        <lib>/../signature.json; then Real SFX build_index.py.
import datetime, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "lib"))
sys.path.insert(0, os.path.join(HERE, "fx"))
sys.path.insert(0, HERE)
import sound as S                                    # decode, fit, db, smooth_gain, to_samples, Words, SR

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REAL_SFX = os.path.join(ROOT, ".claude", "skills", "real-sfx")
LEVEL_DB, DUCK_DB, EXCERPT_S = -17.0, -9.0, 25.0
DEFAULT_REEL = os.path.join(ROOT, "video-projects", "2026-10-25-understand-anything")


# ---------- audio ----------

def write_audio(path, x):
    x = x if x.ndim == 2 else np.stack([x, x], 1)
    codec = ["-c:a", "libmp3lame", "-b:a", "192k"] if path.endswith(".mp3") else ["-c:a", "pcm_s16le"]
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ac", "2", "-ar", str(S.SR), "-i", "-", *codec, path],
                       input=np.clip(x, -1, 1).astype("<f4").tobytes(), capture_output=True)
    if r.returncode != 0: raise RuntimeError(r.stderr.decode()[-300:])


def fades(x, s=0.5):
    n = min(len(x) // 2, int(s * S.SR))
    r = np.linspace(0, 1, n)[:, None]
    x = x.copy(); x[:n] *= r; x[len(x) - n:] *= r[::-1]
    return x


def rms_db(x):
    return S.db(np.sqrt((x ** 2).mean() + 1e-18))


def voice_stretch(reel, start, dur):
    n = int(dur * S.SR)
    v = S.fit(S.decode(os.path.join(reel, "renders", "clean.mp4"), ss=start or None), n)
    tr = json.load(open(os.path.join(reel, "transcript.clean.json")))
    words = [dict(w, start=w["start"] - start, end=w["end"] - start) for w in tr["words"]
             if w.get("type", "word") == "word" and w["end"] > start and w["start"] < start + dur]
    return v, S.Words(words).speech_mask(n)


def under_voice(voice, speech, music):
    """sound.py's level rule on a short stretch: music RMS = voice RMS + LEVEL_DB where nobody speaks, DUCK_DB more under speech."""
    v_rms = rms_db(voice[speech]) if speech.any() else rms_db(voice)
    free = music[~speech] if (~speech).any() else music
    m = music * 10 ** ((v_rms + LEVEL_DB - rms_db(free)) / 20)
    hop = 480; nf = len(m) // hop + 1
    sp = np.array([speech[i * hop: (i + 1) * hop].any() for i in range(nf)])
    g = S.smooth_gain(np.where(sp, DUCK_DB, 0.0), hop / S.SR, attack=0.03, release=0.30)
    mix = voice + m * (10 ** (S.to_samples(g, hop, len(m)) / 20))[:, None]
    pk = np.abs(mix).max()
    return mix * (0.89 / pk) if pk > 0.89 else mix


def render_layers(layers, n, t):
    """Each layer's loudest point at t + dt (how Real SFX anchors hits and whooshes), gains in dB from full scale."""
    y = np.zeros((n, 2))
    for L in layers:
        x = S.decode(os.path.join(ROOT, L["file"]))
        x = x / (np.abs(x).max() + 1e-9) * 10 ** (L["gain_db"] / 20)
        at = int((t + L["dt"]) * S.SR) - int(np.argmax(np.abs(x).mean(axis=1)))
        a, b = max(0, at), min(n, at + len(x))
        if b > a: y[a:b] += x[a - at: b - at]
    return y


# ---------- build ----------

def build_music(out, mdir, voice, speech):
    cdir = os.path.join(mdir, "candidates")
    scr = json.load(open(os.path.join(cdir, "screen.json")))
    cands = json.load(open(os.path.join(cdir, "candidates.json")))
    os.makedirs(os.path.join(out, "music"), exist_ok=True)
    items = []
    for i in sorted((i for i, m in scr.items() if m.get("status") == "pass"), key=lambda i: -scr[i].get("score", 0)):
        c, m = cands[i], scr[i]
        src = c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])
        x = fades(S.fit(S.decode(src, ss=m.get("excerpt_start") or None), len(voice)))
        x = x * 10 ** ((-16 - rms_db(x)) / 20)
        write_audio(os.path.join(out, "music", f"{i}.clean.mp3"), x)
        write_audio(os.path.join(out, "music", f"{i}.voice.mp3"), under_voice(voice, speech, x))
        items.append({"section": "music", "id": i, "title": f"{c.get('title', i)} — {c.get('creator', '')}",
                      "meta": f"{', '.join(c.get('mood', []))} · {m.get('bpm') or 'без бита'} BPM · {c.get('license_name', c.get('license', ''))}",
                      "audio": [["Музыка", f"a/music/{i}.clean.mp3"], ["Под голосом", f"a/music/{i}.voice.mp3"]]})
    return items


def build_sfx(out, lib):
    scr = json.load(open(os.path.join(lib, "screen.json")))
    os.makedirs(os.path.join(out, "sfx"), exist_ok=True)
    items = []
    for k in sorted(k for k, m in scr.items() if m["status"] == "shortlist"):
        png = os.path.join(out, "sfx", k.replace("/", "__") + ".png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(lib, k), "-lavfi",
                        "showspectrumpic=s=360x90:legend=0:color=intensity", png], check=True)
        m = scr[k]
        items.append({"section": "sfx", "group": k.split("/")[0], "id": k, "title": k.split("/")[1],
                      "meta": f"{m['dur']} с · атака {m['attack_ms']:.0f} мс · {m['centroid']} Гц",
                      "audio": [["", "lib/" + urllib.parse.quote(k)]], "img": f"a/sfx/{os.path.basename(png)}"})
    return items


def variants(lib):
    """Three signature builds from the shortlist: A whoosh + low hit, B + shimmer, C riser + low hit + shimmer."""
    scr = json.load(open(os.path.join(lib, "screen.json")))

    def best(folders, key):
        for f in folders:
            ks = [k for k, m in scr.items() if m["status"] in ("shortlist", "approved") and k.startswith(f + "/")]
            if ks: return max(ks, key=lambda k: key(scr[k]))
        return None

    rel = lambda k: os.path.relpath(os.path.join(lib, k), ROOT)
    w = best(["whoosh_big", "whoosh"], lambda m: m["score"])
    low = best(["subdrop", "hit"], lambda m: -m["centroid"])
    sh = best(["chime"], lambda m: m["score"])
    ri = best(["riser"], lambda m: m["score"])
    low_l = low and {"file": rel(low), "role": "sub_drop" if low.startswith("subdrop/") else "hit", "dt": 0.0, "gain_db": -3.0}
    sh_l = sh and {"file": rel(sh), "role": "chime", "dt": 0.03, "gain_db": -8.0}
    out = {}
    if w and low: out["A"] = [{"file": rel(w), "role": "whoosh", "dt": 0.0, "gain_db": 0.0}, low_l]
    if w and low and sh: out["B"] = out["A"] + [sh_l]
    if ri and low and sh: out["C"] = [{"file": rel(ri), "role": "riser", "dt": 0.0, "gain_db": -2.0}, low_l, sh_l]
    return out


NAMES = {"A": "вжух + мягкий низкий удар", "B": "вжух + низкий удар + шиммер", "C": "нарастание + низкий удар + шиммер"}


def build_signature(out, lib, reel, swap_t):
    var = variants(lib)
    d = os.path.join(out, "signature"); os.makedirs(d, exist_ok=True)
    json.dump(var, open(os.path.join(d, "variants.json"), "w"), ensure_ascii=False, indent=1)
    voice, _ = voice_stretch(reel, max(0.0, swap_t - 3.0), 6.0)
    t_in = min(3.0, swap_t)
    items = []
    for name, layers in var.items():
        alone = render_layers(layers, int(2.5 * S.SR), 1.2)
        write_audio(os.path.join(d, f"{name}.mp3"), alone * (10 ** (-3 / 20) / (np.abs(alone).max() + 1e-9)))
        sig = render_layers(layers, len(voice), t_in)
        sig *= 10 ** ((S.db(np.abs(voice).max()) - 9) / 20) / (np.abs(sig).max() + 1e-9)
        write_audio(os.path.join(d, f"{name}.context.mp3"), voice + sig)
        items.append({"section": "signature", "id": name, "title": f"Вариант {name}: {NAMES[name]}",
                      "audio": [["Отдельно", f"a/signature/{name}.mp3"], ["На смене фона", f"a/signature/{name}.context.mp3"]]})
    return items


PAGE = r"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Отбор звука</title>
<style>
:root{--ink:#17141C;--muted:#6B6475;--canvas:#EFEDF4;--card:#fff;--accent:#7C3AED;--soft:#EDE6FF;--line:#E5E1EA}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:16px/1.45 -apple-system,"Golos Text",system-ui,sans-serif}
header{position:sticky;top:0;background:var(--canvas);padding:20px 16px 12px;border-bottom:1px solid var(--line);z-index:2}
header>*{max-width:880px;margin-left:auto;margin-right:auto}
h1{margin:0 0 4px;font-size:24px}h2{margin:32px 0 12px;font-size:20px}
h3{margin:20px 0 8px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
main{max-width:880px;margin:0 auto;padding:0 16px 80px}p{margin:4px 0;color:var(--muted)}
.card{background:var(--card);border-radius:14px;padding:14px;margin:10px 0;display:grid;gap:8px;border:2px solid transparent}
.card.yes{border-color:var(--accent);background:var(--soft)}.card.no{opacity:.45}
.t{font-weight:600}.m{font-size:13px;color:var(--muted)}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
audio{width:100%;max-width:420px;height:36px}img{width:100%;max-width:360px;border-radius:8px;display:block}
button{font:inherit;border:0;border-radius:10px;padding:8px 16px;cursor:pointer;background:var(--line)}
button.on{background:var(--accent);color:#fff}label{font-size:13px;color:var(--muted);min-width:96px}
</style></head><body>
<header><h1>Отбор звука</h1><p id="count"></p>
<p>Слушай в наушниках. «Беру» — в фирменную библиотеку, «Нет» — больше не появится. Фирменный звук — выбери один вариант. Когда закончишь, напиши в чат «отметил».</p></header>
<main id="app"></main>
<script>
const ITEMS = __ITEMS__;
const SECTIONS = [["music", "Музыка"], ["sfx", "Звуки"], ["signature", "Фирменный звук"]];
let marks = { music: {}, sfx: {}, signature: null };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const state = (it) => it.section === "signature" ? (marks.signature === it.id ? "yes" : (marks.signature ? "no" : "")) : (marks[it.section][it.id] || "");
async function mark(it, verdict) {
  const r = await fetch("/verdict", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section: it.section, id: it.id, verdict }) });
  if (!r.ok) { alert("Не сохранилось: " + (await r.text())); return; }
  if (it.section === "signature") marks.signature = it.id; else marks[it.section][it.id] = verdict;
  render();
}
function card(it) {
  const c = el("div", "card " + state(it));
  c.append(el("div", "t", it.title || it.id));
  if (it.meta) c.append(el("div", "m", it.meta));
  if (it.img) { const i = el("img"); i.src = it.img; i.alt = ""; c.append(i); }
  for (const [label, src] of it.audio) {
    const r = el("div", "row"); if (label) r.append(el("label", "", label));
    const a = el("audio"); a.controls = true; a.preload = "none"; a.src = src; r.append(a); c.append(r);
  }
  const b = el("div", "row");
  if (it.section === "signature") {
    const x = el("button", state(it) === "yes" ? "on" : "", state(it) === "yes" ? "Выбран" : "Выбрать");
    x.onclick = () => mark(it, "pick"); b.append(x);
  } else {
    const y = el("button", state(it) === "yes" ? "on" : "", "Беру"); y.onclick = () => mark(it, "yes");
    const n = el("button", state(it) === "no" ? "on" : "", "Нет"); n.onclick = () => mark(it, "no");
    b.append(y, n);
  }
  c.append(b); return c;
}
function render() {
  const app = document.getElementById("app"); app.replaceChildren();
  for (const [sec, name] of SECTIONS) {
    const items = ITEMS.filter((i) => i.section === sec); if (!items.length) continue;
    app.append(el("h2", "", `${name} · ${items.length}`));
    let group = null;
    for (const it of items) { if (it.group && it.group !== group) { group = it.group; app.append(el("h3", "", group)); } app.append(card(it)); }
  }
  const ids = new Set(ITEMS.filter((i) => i.section !== "signature").map((i) => i.section + ":" + i.id));
  const done = [...Object.keys(marks.music).map((k) => "music:" + k), ...Object.keys(marks.sfx).map((k) => "sfx:" + k)].filter((k) => ids.has(k)).length;
  document.getElementById("count").textContent = `Отмечено ${done} из ${ids.size}` + (marks.signature ? ` · фирменный звук: ${marks.signature}` : " · фирменный звук не выбран");
}
fetch("/verdicts").then((r) => r.json()).then((m) => { marks = m; render(); }).catch(() => render());
</script></body></html>
"""


def build(out, mdir, lib, reel, voice_start, swap_t):
    os.makedirs(out, exist_ok=True)
    voice, speech = voice_stretch(reel, voice_start, EXCERPT_S)
    items = build_music(out, mdir, voice, speech) + build_sfx(out, lib) + build_signature(out, lib, reel, swap_t)
    data = json.dumps(items, ensure_ascii=False, indent=1).replace("</", "<\\/")
    open(os.path.join(out, "index.html"), "w").write(PAGE.replace("__ITEMS__", data))
    n = {s: sum(i["section"] == s for i in items) for s in ("music", "sfx", "signature")}
    print(f"music {n['music']}, sfx {n['sfx']}, signature variants {n['signature']} → {os.path.relpath(out, ROOT)}/index.html")


# ---------- marks ----------

def review_file(mdir, lib, section):
    return os.path.join(mdir, "review.json") if section == "music" else os.path.join(lib, "review.json")


def load_marks(mdir, lib):
    rd = lambda p: json.load(open(p)) if os.path.exists(p) else {}
    m, s = rd(review_file(mdir, lib, "music")), rd(review_file(mdir, lib, "sfx"))
    return {"music": m.get("music", {}), "sfx": s.get("sfx", {}), "signature": s.get("signature")}


def record_verdict(mdir, lib, section, id, verdict):
    """One mark from the page. music / sfx: verdict "yes" | "no"; signature: id is the chosen variant."""
    if section not in ("music", "sfx", "signature") or not isinstance(id, str) or not id: raise ValueError(f"bad mark {section} {id}")
    if section != "signature" and verdict not in ("yes", "no"): raise ValueError(f"bad verdict {verdict}")
    f = review_file(mdir, lib, section)
    d = json.load(open(f)) if os.path.exists(f) else {}
    if section == "signature": d["signature"] = id
    else: d.setdefault(section, {})[id] = verdict
    d["updated"] = datetime.datetime.now().isoformat(timespec="seconds")
    os.makedirs(os.path.dirname(f), exist_ok=True)
    json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)


# ---------- serve ----------

TYPES = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".flac": "audio/flac", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
         ".png": "image/png", ".html": "text/html; charset=utf-8"}


def serve(out, mdir, lib, port):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _send(self, code, data, ctype):
            self.send_response(code); self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        def _file(self, base, rel):
            p = os.path.realpath(os.path.join(base, rel))
            if not p.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(p): return self._send(404, b"not found", "text/plain")
            self._send(200, open(p, "rb").read(), TYPES.get(os.path.splitext(p)[1].lower(), "application/octet-stream"))

        def _json(self, obj, code=200):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            path = urllib.parse.unquote(self.path.split("?")[0])
            if path in ("/", "/index.html"): return self._file(out, "index.html")
            if path == "/verdicts": return self._json(load_marks(mdir, lib))
            if path.startswith("/a/"): return self._file(out, path[3:])
            if path.startswith("/lib/"): return self._file(lib, path[5:])
            self._send(404, b"not found", "text/plain")

        def do_POST(self):
            if self.path != "/verdict": return self._send(404, b"not found", "text/plain")
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                record_verdict(mdir, lib, body.get("section"), body.get("id"), body.get("verdict"))
            except (ValueError, TypeError) as e:
                return self._json({"ok": False, "error": str(e)}, 400)
            self._json({"ok": True})

    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    print(f"http://127.0.0.1:{port}  (Ctrl+C — стоп)", flush=True)
    srv.serve_forever()


# ---------- main ----------

def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("build", "serve", "apply"):
        print("usage: sound_review.py build | serve | apply [--out DIR] [--music-dir DIR] [--lib DIR] …"); sys.exit(1)
    opt = lambda k, d: a[a.index(k) + 1] if k in a else d
    out = os.path.abspath(opt("--out", os.path.join(ROOT, ".cache", "sound-review")))
    mdir = os.path.abspath(opt("--music-dir", os.path.join(ROOT, "brand", "music")))
    lib = os.path.abspath(opt("--lib", os.path.join(ROOT, "brand", "sfx", "library")))
    if a[0] == "build":
        build(out, mdir, lib, os.path.abspath(opt("--voice-reel", DEFAULT_REEL)), float(opt("--voice-start", 5)), float(opt("--swap-t", 43.29)))
    elif a[0] == "serve":
        serve(out, mdir, lib, int(opt("--port", 8765)))
    else:
        apply(out, mdir, lib, index="--no-index" not in a)


if __name__ == "__main__":
    main()
```

`apply` появится в задаче 7. До неё вызов `apply` упадёт с `NameError` — это нормально, тестов на него ещё нет.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 10 tests.

Вёрстку страницы глазами проверяет задача 8, шаг 3, на настоящей библиотеке.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/sound_review.py tests/sound.test.mjs
git commit -m "Sound library: listening page (music under the voice, SFX, signature variants)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Раскладка отметок (apply)

**Files:**
- Modify: `scripts/ru/sound_review.py` (добавить `slug`, `apply` перед блоком `# ---------- main ----------`)
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `load_marks` (задача 6), `move`, `credit_key` из `sfx_screen.py` (задача 5), `candidates.json` с полями `url`, `license_name`, `credit` (задача 1), `<out>/signature/variants.json` (задача 6).
- Produces:
  - `<mdir>/<slug>-<id8>.mp3` и запись в `<mdir>/tracks.json`: `{file, mood, bpm, excerpt_start, source, license, license_url, credit, openverse_id}`;
  - `<mdir>/rejected.json` — список отклонённых id;
  - `<lib>/../signature.json`: `{chosen, date, layers: [{file, role, dt, gain_db}]}` — его читает `sfx_real.py` (задача 10).

- [ ] **Step 1: Write the failing test**

```js
test("sound_review apply: approved track downloaded into tracks.json with its credit, rejects remembered, signature saved", { timeout: 120000 }, () => {
  const f = reviewFixture();
  writeFileSync(join(f.mdir, "candidates", "m2.wav"), "x");
  const cands = JSON.parse(readFileSync(join(f.mdir, "candidates", "candidates.json"), "utf8"));
  cands.m2 = { ...cands.m1, file: join(f.mdir, "candidates", "m2.wav"), title: "Other" };
  writeFileSync(join(f.mdir, "candidates", "candidates.json"), JSON.stringify(cands));
  writeFileSync(join(f.mdir, "review.json"), JSON.stringify({ music: { m1: "yes", m2: "no" } }));
  writeFileSync(join(f.lib, "review.json"), JSON.stringify({ sfx: { "click/k.wav": "no", "chime/c.wav": "yes" }, signature: "B" }));
  writeFileSync(join(f.lib, "credits.json"), JSON.stringify({ "brand/sfx/library/click/k.wav": { kind: "click" },
    "brand/sfx/library/chime/c.wav": { kind: "chime" } }));
  mkdirSync(join(f.out, "signature"), { recursive: true });
  writeFileSync(join(f.out, "signature", "variants.json"), JSON.stringify({ B: [{ file: "x/w.wav", role: "whoosh", dt: 0, gain_db: 0 }] }));
  const r = spawnSync("python3", ["scripts/ru/sound_review.py", "apply", "--out", f.out, "--music-dir", f.mdir, "--lib", f.lib, "--no-index"],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const tr = JSON.parse(readFileSync(join(f.mdir, "tracks.json"), "utf8")).tracks;
  assert.equal(tr.length, 1);
  assert.equal(tr[0].file, "calm-script-m1.mp3");
  assert.equal(tr[0].credit, "Музыка: «Calm» — Ann (CC BY 4.0)");
  assert.equal(tr[0].bpm, 100);
  assert.ok(existsSync(join(f.mdir, tr[0].file)));
  assert.deepEqual(JSON.parse(readFileSync(join(f.mdir, "rejected.json"), "utf8")), ["m2"]);
  assert.ok(!existsSync(join(f.mdir, "candidates", "m1.wav")) && !existsSync(join(f.mdir, "candidates", "m2.wav")));
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(f.mdir, "candidates", "candidates.json"), "utf8"))), []);
  assert.ok(existsSync(join(f.d, "sfx", "rejected", "click", "k.wav")));
  const credits = JSON.parse(readFileSync(join(f.lib, "credits.json"), "utf8"));
  assert.ok(credits["brand/sfx/library/chime/c.wav"].approved);
  const sig = JSON.parse(readFileSync(join(f.d, "sfx", "signature.json"), "utf8"));
  assert.equal(sig.chosen, "B"); assert.equal(sig.layers[0].role, "whoosh");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `NameError: name 'apply' is not defined`.

- [ ] **Step 3: Добавить в `scripts/ru/sound_review.py`** — после блока `serve`, перед `# ---------- main ----------`:

```python
# ---------- apply ----------

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return (s or "track")[:40].strip("-")


def apply(out, mdir, lib, index=True):
    from sfx_screen import move, credit_key
    rd = lambda p, d: json.load(open(p)) if os.path.exists(p) else d
    wr = lambda p, o: json.dump(o, open(p, "w"), ensure_ascii=False, indent=1)
    today = datetime.date.today().isoformat()
    marks = load_marks(mdir, lib)
    cdir = os.path.join(mdir, "candidates")
    cands, scr = rd(os.path.join(cdir, "candidates.json"), {}), rd(os.path.join(cdir, "screen.json"), {})
    tracks, rejected = rd(os.path.join(mdir, "tracks.json"), {"tracks": []}), rd(os.path.join(mdir, "rejected.json"), [])
    n = {"music+": 0, "music-": 0, "sfx+": 0, "sfx-": 0}
    for i, v in marks["music"].items():
        c = cands.get(i)
        if not c: continue
        src = c["file"] if os.path.isabs(c["file"]) else os.path.join(ROOT, c["file"])
        if v == "yes":
            name = f"{slug(c['title'])}-{i[:8]}.mp3"
            req = urllib.request.Request(c["url"], headers={"User-Agent": "reels-studio-fetch"})
            with urllib.request.urlopen(req, timeout=120) as r, open(os.path.join(mdir, name), "wb") as f:
                shutil.copyfileobj(r, f)
            s = scr.get(i, {})
            tracks["tracks"].append({"file": name, "mood": c.get("mood", []), "bpm": s.get("bpm"),
                                     "excerpt_start": s.get("excerpt_start"), "source": f"Openverse · {c['source']} · {c['page']}",
                                     "license": c["license_name"], "license_url": c.get("license_url"), "credit": c.get("credit"),
                                     "openverse_id": i})
            n["music+"] += 1
        else:
            rejected.append(i); n["music-"] += 1
        if os.path.exists(src): os.remove(src)
        cands.pop(i)
    wr(os.path.join(mdir, "tracks.json"), tracks)
    wr(os.path.join(mdir, "rejected.json"), rejected)
    if os.path.isdir(cdir): wr(os.path.join(cdir, "candidates.json"), cands)

    cp = os.path.join(lib, "credits.json")
    credits = rd(cp, {})
    for k, v in marks["sfx"].items():
        if not os.path.exists(os.path.join(lib, k)): continue
        if v == "no":
            move(lib, k, "rejected", credits); n["sfx-"] += 1
        else:
            key = credit_key(credits, k) or f"brand/sfx/library/{k}"
            credits.setdefault(key, {})["approved"] = today; n["sfx+"] += 1
    wr(cp, credits)

    if marks["signature"]:
        var = rd(os.path.join(out, "signature", "variants.json"), {})
        if marks["signature"] in var:
            wr(os.path.join(os.path.dirname(lib), "signature.json"),
               {"chosen": marks["signature"], "date": today, "layers": var[marks["signature"]]})
    print(f"music: {n['music+']} taken, {n['music-']} rejected · sfx: {n['sfx+']} taken, {n['sfx-']} rejected · "
          f"signature: {marks['signature'] or 'not chosen'}")
    if index:
        r = subprocess.run([sys.executable, "scripts/build_index.py"], cwd=REAL_SFX, capture_output=True, text=True)
        print((r.stdout.strip().splitlines() or [r.stderr[-300:]])[-1])
```

Ожидаемый `slug`: «Calm </script>» → `calm-script` → файл `calm-script-m1.mp3`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/sound_review.py tests/sound.test.mjs
git commit -m "Sound library: apply the customer's marks (tracks.json, rejects, signature)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Живой прогон библиотеки и остановка на прослушивание (главная сессия)

**Files:** ничего в git; результат — `brand/music/candidates/`, `brand/sfx/library/`, `.cache/sound-review/`.

- [ ] **Step 1: Музыка**

```bash
node scripts/ru/music-fetch.mjs --max 100          # ~24 запроса, ~400 МБ голов файлов; запускать в фоне
python3 scripts/ru/music_screen.py --keep 30       # ~10–15 мин (beats.py на каждом треке); в фоне
```

Expected: `100 new candidates`, затем `N tracks: ≤30 pass, … fail {…}`. Если `pass` < 15 — второй прогон `music-fetch.mjs` с другими запросами (дописать в `MOODS` по одной формулировке на настроение, например `"ambient electronic"`, `"piano ambient"`), снова `music_screen.py`. Если и тогда < 15 — сказать заказчику и обсудить источники (спека, «Риски»).

- [ ] **Step 2: Звуки**

```bash
node scripts/ru/sfx-fetch.mjs --per 20             # ~35 запросов, ~280 файлов; перенос library/tick → click_tick
python3 scripts/ru/sfx_screen.py --per-role 6      # ~80 в шорт-листе
```

Expected: строка `moved library/tick → library/click_tick` (один раз), затем по папкам `shortlist 6, reserve …, rejected …`. Папка без шорт-листа (например `subdrop`) — дописать запросы в `PALETTE` и повторить только её: `--kinds subdrop`.

- [ ] **Step 3: Страница**

```bash
python3 scripts/ru/sound_review.py build           # понимание-рилс: voice 5–30 с, смена фона 43,29 с
python3 scripts/ru/sound_review.py serve           # в фоне (run_in_background)
```

Открыть `http://127.0.0.1:8765` во встроенном браузере (`preview_start` с `url`) и проверить:

- `read_page`: число карточек = music + sfx + signature из вывода `build`;
- `resize_window` 375 и 1280, скриншот: карточки не вылезают за экран, плееры и кнопки видны;
- нажать «Беру» на одной карточке → счётчик «Отмечено 1 из N» и рамка карточки. Снять отметку на странице нельзя, поэтому после проверки удалить эту строку из `brand/music/review.json` или `brand/sfx/library/review.json` и перезагрузить страницу, прежде чем отдавать её заказчику.

- [ ] **Step 4: Остановка — заказчик слушает**

Сообщение заказчику: ссылка `http://127.0.0.1:8765`, сколько треков, звуков и вариантов фирменного звука, «слушай в наушниках, отмечай „беру / нет“, фирменный звук — один вариант, потом напиши „отметил“». Строка «Звук мной не прослушан…» не нужна: здесь слушает он. **Пока он слушает — задачи 9–11.**

### Task 8b: Раскладка после «отметил» (главная сессия)

- [ ] **Step 1:**

```bash
python3 scripts/ru/sound_review.py apply
```

Expected: `music: N taken, … · sfx: M taken, … · signature: B`, затем строка `build_index.py` с числом звуков. Если неотмеченных карточек много — назвать заказчику число и спросить, оставить их в библиотеке как есть или отметить.

- [ ] **Step 2: Проверить итог**

```bash
python3 -c "import json;t=json.load(open('brand/music/tracks.json'))['tracks'];print(len(t),'tracks');[print(x['file'],x['bpm'],x['license']) for x in t]"
cat brand/sfx/signature.json
```

Остановить сервер страницы.

---

### Task 9: `sound.py --plan` и `--sfx`

**Files:**
- Modify: `scripts/ru/fx/sound.py` (шапка-комментарий и `main()`)
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Produces: `sound.py <P> --plan [--music F] [--bpm N] [--variant V]` → `<P>/work/sound/music[.V].wav` (музыка, выровненная по чистому таймлайну, с приглушением и стопами) + `fx/sound[.V].json`, **без** `fx/mix*.wav`. `sound.py <P> --sfx fx/sfx.V.wav` — микс с другой дорожкой SFX вместо `fx.json` → `sound.sfx`.

- [ ] **Step 1: Write the failing test**

```js
// ---------- reel: sound.py ----------

function soundProject() {
  const P = tmp("sound-");
  mkdirSync(join(P, "renders")); mkdirSync(join(P, "fx"));
  ff("-f", "lavfi", "-i", "color=c=gray:s=108x192:r=30:d=3", "-f", "lavfi", "-i", "sine=f=220:d=3:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "aevalsrc=0.8*sin(2*PI*55*t)*exp(-25*mod(t-0.1\\,0.5))*gte(t\\,0.1):s=48000:d=8", join(P, "music.wav"));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 1.5 }, { start: 4, end: 5.5 }] }));
  writeFileSync(join(P, "transcript.clean.json"), JSON.stringify({ audio_duration_secs: 3, words: [
    { text: "раз", start: 0.2, end: 0.9 }, { text: "два", start: 1.7, end: 2.2 }, { text: "три", start: 2.4, end: 2.8 }] }));
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ sound: { music: { src: "music.wav", bpm: 120, fade_out: 0.2 } } }));
  return P;
}

test("sound.py --plan writes only the aligned music; --sfx mixes another SFX track", { timeout: 120000 }, () => {
  const P = soundProject();
  let r = spawnSync("python3", ["scripts/ru/fx/sound.py", P, "--plan", "--variant", "p"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(P, "work/sound/music.p.wav")));
  assert.ok(!existsSync(join(P, "fx/mix.p.wav")));
  assert.ok(Math.abs(JSON.parse(readFileSync(join(P, "fx/sound.p.json"), "utf8")).music.bpm - 120) < 1);
  ff("-f", "lavfi", "-i", "sine=f=1000:d=0.2:sample_rate=48000", "-ac", "2", join(P, "fx/sfx.alt.wav"));
  r = spawnSync("python3", ["scripts/ru/fx/sound.py", P, "--variant", "q", "--sfx", "fx/sfx.alt.wav"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(join(P, "fx/sound.q.json"), "utf8")).sfx.src, "fx/sfx.alt.wav");
  assert.ok(existsSync(join(P, "fx/mix.q.wav")));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `--plan` пишет `fx/mix.p.wav` (флаг пока не знает), assert `!existsSync(.../mix.p.wav)` падает.

- [ ] **Step 3: Правка `scripts/ru/fx/sound.py`**

В шапке после строки `#   →  <project>/fx/mix[.<variant>].wav (48 kHz stereo, clean length) + fx/sound[.<variant>].json` добавить:

```python
#   python3 scripts/ru/fx/sound.py <project> --plan [--music f] [--bpm n] [--variant B]
#   →  work/sound/music[.B].wav only: the music aligned to the clean timeline (ducked, stops) — for sfx_real.py
#   --sfx fx/sfx.B.wav   mix this SFX track (an sfx_real.py variant) instead of "sound.sfx"
```

В `main()` заменить

```python
    v, speech, vrms = voice_layer(P, cfg, words, n, rep)
    mix = v.copy()
    sfx_path = os.path.join(P, cfg.get("sfx", "fx/sfx.wav"))
```

на

```python
    if "--plan" in a:
        if not mc.get("src"):
            print("no music in fx.json sound.music and no --music: nothing to plan"); return
        v, speech, vrms = voice_layer(P, cfg, words, n, rep)
        m = music_layer(P, fx, mc, words, n, speech, vrms, scratch, rep)
        stem = os.path.join(scratch, f"music{suf}.wav"); write_wav(stem, m)
        json.dump(rep, open(os.path.join(P, "fx", f"sound{suf}.json"), "w"), ensure_ascii=False, indent=1)
        print(f"→ {os.path.relpath(stem, ROOT)} (music on the clean timeline, no mix)")
        return

    v, speech, vrms = voice_layer(P, cfg, words, n, rep)
    mix = v.copy()
    sfx_path = os.path.join(P, opt("--sfx") or cfg.get("sfx", "fx/sfx.wav"))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs && node --test tests/ru.test.mjs`
Expected: PASS оба (старый тест `sound.py` в `ru.test.mjs` не сломан).

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/fx/sound.py tests/sound.test.mjs
git commit -m "sound.py: --plan (aligned music only) and --sfx (another SFX track)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Мост `sfx_real.py` и отказ `sfx.py` при `sfx_engine: real`

**Files:**
- Create: `scripts/ru/fx/sfx_real.py`
- Modify: `scripts/ru/fx/sfx.py` (начало `main()` после чтения `fx.json`)
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `sound.py` как модуль (`decode, fit, db, write_wav, Words, SR`), `sound.py --plan` (задача 9), `brand/sfx/signature.json` (задача 7), Real SFX: `from_cues.py <events.json> --video <clean.mp4> --out <cues.json> --ui library --no-check --no-stems`, `mix.py <cues.json> --out <work>/sfx.mp4 --voice-safe --no-loudnorm [--music-ref <wav>]` (пишет `<work>/sfx_sfx_track.wav`, `<work>/sfx_sfx_ducked.wav`, `<work>/sfx_resolved_cues.json`), `verify.py`, `critique.py`.
- Produces: `fx/sfx[.V].wav` (как ждёт `sound.py`), `fx/sfx.real[.V].json`: `{variant, events, kept: [{name, kind, t, hero?}], dropped: [{name, kind, t, why}], signature, trim_db, peak_below_voice_db, music_ref, placed, silent, picks: [{t, label, role, file}], verify: [..], critique_top: [..]}`; функции `resolve_events(fx, words)`, `thin(events, dur, cfg) → (kept, dropped)`, `hero(events)`, `typed(events, signature) → (typed_list, signature_cues)`, `fit_to_voice(sfx, voice, below_db) → (sfx, trim_db)`.
- CLI: `sfx_real.py <P> [--variant V] [--music F] [--bpm N] [--dry]`.

- [ ] **Step 1: Write the failing tests**

```js
// ---------- reel: sfx_real ----------

test("sfx_real: events, brand density rules, one hero hit, signature cue, the trim against the voice", () => {
  const r = py(`
import sys, numpy as np
sys.path.insert(0, "scripts/ru/fx"); import sfx_real as R
words = [{"text": "Привет,", "start": 0.2, "end": 0.9}, {"text": "мир.", "start": 1.05, "end": 1.5}]
ev = R.resolve_events({"location_joins": [1.55], "sfx": [{"name": "клик", "kind": "click", "word": "мир", "offset": 0.1, "gain": 0.045}]}, words)
assert [e["kind"] for e in ev] == ["click", "whoosh"], ev
assert abs(ev[0]["t"] - 1.15) < 1e-6 and abs(ev[1]["t"] - 1.53) < 1e-6, ev
cfg = dict(R.DEFAULTS)
ticks = [{"name": f"t{i}", "kind": "tick", "t": 10 + 0.5 * i, "gain": 0.03} for i in range(6)]
kept, dropped = R.thin(ticks, 60, cfg)
assert [e["name"] for e in kept] == ["t0", "t1", "t2"] and {e["why"] for e in dropped} == {"run"}, (kept, dropped)
kept, dropped = R.thin([{"name": "pop", "kind": "pop", "t": 5.0, "gain": 0.05}, {"name": "wh", "kind": "whoosh", "t": 5.2, "gain": 0.09}], 60, cfg)
assert [e["name"] for e in kept] == ["wh"] and dropped[0]["why"] == "merged"
many = sorted([{"name": f"c{i}", "kind": "click", "t": float(i), "gain": 0.045} for i in range(10)]
              + [{"name": "sig", "kind": "whoosh_big", "t": 4.5, "gain": 0.12}], key=lambda e: e["t"])
kept, dropped = R.thin(many, 10, cfg)
assert sum(e["kind"] == "click" for e in kept) == 5 and any(e["name"] == "sig" for e in kept), kept
h = R.hero([{"name": "a", "kind": "hit", "t": 1, "gain": 0.2}, {"name": "b", "kind": "hit", "t": 5, "gain": 0.3}])
assert [e["kind"] for e in h] == ["thump", "hit"] and h[1]["hero"] and not h[0]["hero"]
sig = {"chosen": "B", "layers": [{"file": "brand/sfx/library/whoosh/w.mp3", "role": "whoosh", "dt": 0, "gain_db": 0},
                                 {"file": "brand/sfx/library/subdrop/s.mp3", "role": "sub_drop", "dt": 0, "gain_db": -3}]}
lst, cues = R.typed([{"name": "смена", "kind": "whoosh_big", "t": 3.0, "gain": 0.12, "hero": True},
                     {"name": "тик", "kind": "tick", "t": 4.0, "gain": 0.06, "hero": False}], sig)
assert lst == [{"t": 4.0, "type": "tick", "g": 1.5}], lst
assert cues[0]["file"].startswith("/") and cues[0]["file"].endswith("brand/sfx/library/whoosh/w.mp3")
assert cues[0]["gain_db"] == 2.0 and cues[0]["layers"][0]["gain_db"] == -1.0 and cues[0]["layers"][0]["role"] == "sub_drop"
lst2, cues2 = R.typed([{"name": "смена", "kind": "whoosh_big", "t": 3.0, "gain": 0.12, "hero": False}], None)
assert lst2 == [{"t": 3.0, "type": "whoosh", "g": 1.0, "len": 0.8}] and cues2 == [], lst2
voice = np.zeros((48000, 2)); voice[100] = 0.5
sfx = np.zeros((48000, 2)); sfx[200] = 0.5
out, trim = R.fit_to_voice(sfx, voice, 9.0)
assert trim == -9.0 and abs(R.S.db(np.abs(out).max()) - (R.S.db(0.5) - 9)) < 0.01
quiet = np.zeros((48000, 2)); quiet[200] = 0.01
assert R.fit_to_voice(quiet, voice, 9.0)[1] == 0.0
print("ok")
`);
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test("sfx_real --dry writes the kept and dropped events without running Real SFX; sfx.py refuses the real engine", () => {
  const P = tmp("sfxr-");
  mkdirSync(join(P, "fx"));
  writeFileSync(join(P, "transcript.clean.json"), JSON.stringify({ audio_duration_secs: 4, words: [{ text: "раз", start: 0.2, end: 0.9 }] }));
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ sfx_engine: "real", sfx: [
    { name: "a", kind: "tick", t: 1.0, gain: 0.03 }, { name: "b", kind: "pop", t: 1.1, gain: 0.05 }, { name: "c", kind: "hit", t: 2.5, gain: 0.22 }] }));
  let r = spawnSync("python3", ["scripts/ru/fx/sfx_real.py", P, "--dry"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(readFileSync(join(P, "fx/sfx.real.json"), "utf8"));
  assert.deepEqual(rep.kept.map((e) => e.name), ["b", "c"]);      // tick «a» and pop «b» are 0.1 s apart: the pop has priority
  assert.equal(rep.dropped[0].why, "merged");
  assert.ok(rep.kept[1].hero);
  assert.ok(existsSync(join(P, "work/sfx-real/events.json")));
  r = spawnSync("python3", ["scripts/ru/fx/sfx.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /sfx_real\.py/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `ModuleNotFoundError: No module named 'sfx_real'`.

- [ ] **Step 3: Write `scripts/ru/fx/sfx_real.py`**

```python
#!/usr/bin/env python3
# S4b «Звуковые акценты» from real recordings (Real SFX + the brand library) — fx.json "sfx_engine": "real".
#   python3 scripts/ru/fx/sfx_real.py <project> [--variant v2] [--music file] [--bpm n] [--dry]
#   →  <project>/fx/sfx[.<variant>].wav       SFX only, ducked under the voice, the loudest peak 9 dB under the voice's
#      <project>/fx/sfx.real[.<variant>].json  kept and dropped events with the reason, picks, checks
#   --dry: the events and the typed list only (work/sfx-real[.<variant>]/events.json), no Real SFX run.
#
# fx.json: sfx [{name, kind, word | t, after?, offset?, gain, len?}] and location_joins — the same list as sfx.py;
#          sfx_real: {peak_below_voice_db: 9, budget_s: 2.0, merge_s: 0.4, run_max: 3}
#          sound.music.src (or --music, with --bpm): tonal sounds are tuned to it (sound.py --plan aligns it first).
# Brand rules «чисто и дорого» (sound-rules.md, design 2026-10-26): at most one accent per budget_s (the
# signature does not count); events closer than merge_s are one sound; runs of ticks / pops stop after run_max;
# one hit per reel (the rest become soft thumps); whoosh_big (a background swap, the CTA) plays the brand
# signature from brand/sfx/signature.json; Real SFX varies the files of repeats; no synthesis (--ui library).
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SKILL = os.path.join(ROOT, ".claude", "skills", "real-sfx")
sys.path.insert(0, HERE)
import sound as S                                    # decode, fit, db, write_wav, Words, SR

DEFAULTS = {"peak_below_voice_db": 9.0, "budget_s": 2.0, "merge_s": 0.4, "run_max": 3}
PRIORITY = {"whoosh_big": 6, "hit": 5, "whoosh": 4, "riser": 4, "chime": 3, "click": 2, "pop": 2, "whoosh_small": 2, "tick": 1}
# sfx.py gains that mean «nominal» (Real SFX g = 1.0)
BASE_GAIN = {"whoosh": 0.09, "whoosh_small": 0.08, "whoosh_big": 0.12, "pop": 0.05, "click": 0.045, "tick": 0.03,
             "chime": 0.08, "hit": 0.22, "riser": 0.1}
RUNS = ("tick", "pop")
# our kind → Real SFX typed kind and default length (s)
TYPES = {"whoosh": ("whoosh", 0.5), "whoosh_small": ("whoosh", 0.3), "whoosh_big": ("whoosh", 0.8), "pop": ("pop", None),
         "click": ("click", None), "tick": ("tick", None), "chime": ("chime", None), "hit": ("hit", None),
         "thump": ("thump", None), "riser": ("riser", 1.5)}


def resolve_events(fx, words):
    """fx.json sfx + location_joins → [{name, kind, t, gain, len?}] on the clean timeline (sfx.py's rules)."""
    W = S.Words(words)
    prev_end = lambda t: max([w["end"] for w in words if w["end"] <= t + 1e-6] or [0.0])
    ev = [{"name": f"переход {j:.2f}", "kind": "whoosh", "t": round(max(j - 0.12, prev_end(j) + 0.03), 3),
           "gain": BASE_GAIN["whoosh"]} for j in fx.get("location_joins", [])]
    for e in fx.get("sfx", []):
        t = e["t"] if "t" in e else W.find(e["word"], e.get("after", 0.0))["start"]
        x = {"name": e["name"], "kind": e["kind"], "t": round(t + e.get("offset", 0.0), 3),
             "gain": e.get("gain", BASE_GAIN.get(e["kind"], 0.08))}
        if e.get("len"): x["len"] = e["len"]
        ev.append(x)
    return sorted(ev, key=lambda e: e["t"])


def thin(events, dur, cfg):
    """Brand density rules → (kept, dropped with "why": run | merged | budget)."""
    kept, dropped = [], []
    drop = lambda e, why: dropped.append(dict(e, why=why))
    # 1. a run of ticks or pops (each within 1.5 s of the previous one of its kind) stops after run_max
    last, count = {}, {}
    for e in events:
        k = e["kind"]
        if k in RUNS:
            count[k] = count.get(k, 0) + 1 if k in last and e["t"] - last[k] <= 1.5 else 1
            last[k] = e["t"]
            if count[k] > cfg["run_max"]:
                drop(e, "run"); continue
        kept.append(e)
    # 2. events closer than merge_s are one sound: the higher priority stays (the earlier one on a tie)
    out = []
    for e in kept:
        if out and e["t"] - out[-1]["t"] < cfg["merge_s"]:
            if PRIORITY.get(e["kind"], 0) > PRIORITY.get(out[-1]["kind"], 0):
                drop(out.pop(), "merged"); out.append(e)
            else:
                drop(e, "merged")
            continue
        out.append(e)
    # 3. at most one accent per budget_s (the signature does not count): the lowest priority, quietest, latest go first
    acc = [e for e in out if e["kind"] != "whoosh_big"]
    over = max(0, len(acc) - int(np.ceil(dur / cfg["budget_s"])))
    for e in sorted(acc, key=lambda e: (PRIORITY.get(e["kind"], 0), e["gain"], -e["t"]))[:over]:
        out.remove(e); drop(e, "budget")
    return out, sorted(dropped, key=lambda e: e["t"])


def hero(events):
    """One hit per reel: the loudest stays «hit» (the hero), the others become soft «thump»; no hit → the first signature."""
    hits = [e for e in events if e["kind"] == "hit"]
    top = max(hits, key=lambda e: e["gain"]) if hits else next((e for e in events if e["kind"] == "whoosh_big"), None)
    return [dict(e, hero=e is top, kind="thump" if e["kind"] == "hit" and e is not top else e["kind"]) for e in events]


def signature_cue(e, signature):
    """brand/sfx/signature.json layers → one Real SFX cue with layers (files by absolute path); the hero gets +2 dB."""
    L = [dict(l, file=os.path.join(ROOT, l["file"])) for l in signature["layers"]]
    boost = 2.0 if e.get("hero") else 0.0
    return {"t": e["t"], "label": f"signature · {e['name']}", "file": L[0]["file"], "role": L[0]["role"],
            "gain_db": L[0].get("gain_db", 0.0) + boost,
            "layers": [{"dt": l.get("dt", 0.0), "file": l["file"], "role": l["role"], "gain_db": l.get("gain_db", 0.0) + boost}
                       for l in L[1:]]}


def typed(events, signature):
    """→ (Real SFX typed list for from_cues.py, signature cues appended to its sheet)."""
    lst, sig = [], []
    for e in events:
        if e["kind"] == "whoosh_big" and signature:
            sig.append(signature_cue(e, signature)); continue
        typ, ln = TYPES.get(e["kind"], (e["kind"], None))
        g = 0.6 if e["kind"] == "thump" else float(np.clip(e["gain"] / BASE_GAIN.get(e["kind"], 0.08), 0.5, 1.5))
        if e["kind"] == "whoosh_small": g *= 0.7
        item = {"t": e["t"], "type": typ, "g": round(g, 3)}
        if e.get("len") or ln: item["len"] = e.get("len") or ln
        lst.append(item)
    return lst, sig


def fit_to_voice(sfx, voice, below_db):
    """Scale the SFX so its loudest peak sits below_db under the voice's peak; never louder than it came."""
    trim = min(0.0, (S.db(np.abs(voice).max()) - below_db) - S.db(np.abs(sfx).max()))
    return sfx * 10 ** (trim / 20), round(trim, 1)


def run(cmd, what):
    r = subprocess.run(cmd, cwd=SKILL, capture_output=True, text=True)
    if r.returncode != 0: raise SystemExit(f"{what} failed:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
    return r.stdout


def top3(text):
    lines = text.splitlines()
    i = next((k for k, l in enumerate(lines) if l.startswith("Three worst problems")), None)
    return [l.strip() for l in lines[i + 1: i + 4]] if i is not None else []


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"):
        print("usage: sfx_real.py <project> [--variant v2] [--music file] [--bpm n] [--dry]"); sys.exit(1)
    P = os.path.abspath(a[0])
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    var = opt("--variant"); suf = f".{var}" if var else ""
    fx = json.load(open(os.path.join(P, "fx", "fx.json")))
    cfg = {**DEFAULTS, **fx.get("sfx_real", {})}
    tr = json.load(open(os.path.join(P, "transcript.clean.json")))
    words = [w for w in tr["words"] if w.get("type", "word") == "word"]
    dur = float(tr["audio_duration_secs"])
    events = resolve_events(fx, words)
    kept, dropped = thin(events, dur, cfg)
    kept = hero(kept)
    sig_path = os.path.join(ROOT, "brand", "sfx", "signature.json")
    signature = json.load(open(sig_path)) if os.path.exists(sig_path) else None
    lst, sig = typed(kept, signature)
    work = os.path.join(P, "work", f"sfx-real{suf}"); os.makedirs(work, exist_ok=True)
    json.dump(lst, open(os.path.join(work, "events.json"), "w"), ensure_ascii=False, indent=1)
    rep = {"variant": var, "events": len(events),
           "kept": [dict({k: e[k] for k in ("name", "kind", "t")}, **({"hero": True} if e.get("hero") else {})) for e in kept],
           "dropped": [{k: e[k] for k in ("name", "kind", "t", "why")} for e in dropped],
           "signature": signature.get("chosen") if signature else None}
    rep_path = os.path.join(P, "fx", f"sfx.real{suf}.json")
    if "--dry" in a:
        json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
        print(f"{len(events)} events → {len(kept)} kept, {len(dropped)} dropped (dry) → {os.path.relpath(rep_path, ROOT)}")
        return

    music = opt("--music") or fx.get("sound", {}).get("music", {}).get("src")
    ref = []
    if music:
        cmd = [sys.executable, os.path.join(HERE, "sound.py"), P, "--plan", "--music", music]
        cmd += (["--bpm", opt("--bpm")] if opt("--bpm") else []) + (["--variant", var] if var else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0: raise SystemExit(f"sound.py --plan failed:\n{r.stderr[-800:]}")
        ref = ["--music-ref", os.path.join(P, "work", "sound", f"music{suf}.wav")]
    clean = os.path.join(P, "renders", "clean.mp4")
    cues = os.path.join(work, "cues.json")
    run([sys.executable, "scripts/from_cues.py", os.path.join(work, "events.json"), "--video", clean, "--out", cues,
         "--ui", "library", "--no-check", "--no-stems"], "from_cues.py")
    sheet = json.load(open(cues)); sheet["cues"] += sig
    json.dump(sheet, open(cues, "w"), ensure_ascii=False, indent=1)
    run([sys.executable, "scripts/mix.py", cues, "--out", os.path.join(work, "sfx.mp4"), "--voice-safe", "--no-loudnorm"] + ref, "mix.py")
    stem = os.path.join(work, "sfx")
    resolved_path, track_dry = f"{stem}_resolved_cues.json", f"{stem}_sfx_track.wav"
    resolved = json.load(open(resolved_path))
    n = int(round(dur * S.SR))
    sfx = S.fit(S.decode(resolved.get("sfx_ducked") or track_dry), n)
    sfx, trim = fit_to_voice(sfx, S.fit(S.decode(clean), n), cfg["peak_below_voice_db"])
    out = os.path.join(P, "fx", f"sfx{suf}.wav"); S.write_wav(out, sfx)
    ver = run([sys.executable, "scripts/verify.py", resolved_path, track_dry], "verify.py")
    crit = run([sys.executable, "scripts/critique.py", resolved_path, track_dry, "--out", os.path.join(work, "critique.md")], "critique.py")
    placed = sum(1 for c in resolved["cues"] if not c.get("_layer"))
    rep.update({"trim_db": trim, "peak_below_voice_db": cfg["peak_below_voice_db"], "music_ref": bool(ref),
                "placed": placed, "silent": max(0, len(lst) + len(sig) - placed),
                "picks": [{"t": c["t"], "label": c["label"], "role": c["role"], "file": os.path.relpath(c["file"], ROOT)}
                          for c in resolved["cues"]],
                "verify": ver.strip().splitlines()[-3:], "critique_top": top3(crit)})
    json.dump(rep, open(rep_path, "w"), ensure_ascii=False, indent=1)
    print(f"{len(events)} events → {len(kept)} kept, {len(dropped)} dropped; {placed} placed, {rep['silent']} silent; "
          f"trim {trim} dB; signature {rep['signature']}")
    for l in rep["critique_top"]: print("  critique:", l)
    print(f"→ {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Правка `scripts/ru/fx/sfx.py`** — в `main()` после строки

```python
    cfg = json.load(open(os.path.join(P, "fx", "fx.json")))
```

добавить:

```python
    if cfg.get("sfx_engine") == "real":
        print("fx.json sfx_engine is \"real\": run python3 scripts/ru/fx/sfx_real.py <project> (brand library, no synthesis)")
        sys.exit(2)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs && node --test tests/ru.test.mjs`
Expected: PASS оба.

- [ ] **Step 6: Commit**

```bash
git add scripts/ru/fx/sfx_real.py scripts/ru/fx/sfx.py tests/sound.test.mjs
git commit -m "Reels Studio: sfx_real.py — brand-library SFX through Real SFX (density rules, signature)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Выбор трека `music-pick.mjs`

**Files:**
- Create: `scripts/ru/music-pick.mjs`
- Test: `tests/sound.test.mjs`

**Interfaces:**
- Consumes: `brand/music/tracks.json` (задача 7: `{file, mood, bpm, credit, last_used?}`), `<reel>/transcript.clean.json`, `<reel>/fx/fx.json`.
- Produces: `wordsPerSecond(tr)`, `tempoOk(bpm, wps)`, `pickTrack(tracks, {wps, mood}) → track | null`, `applyPick(fx, track) → fx`, `addCredit(captionPath, credit) → bool`. CLI пишет `fx.json` → `sound.music = {level_db: -17, duck_db: -9, fade_out: 1.2, …старые поля (stops), start: "auto", src: "brand/music/<file>", bpm, credit}` и `tracks.json` → `last_used: {at: ISO, reel}`.

- [ ] **Step 1: Write the failing test** — импорт к остальным:

```js
import { wordsPerSecond, tempoOk, pickTrack, applyPick, addCredit } from "../scripts/ru/music-pick.mjs";
```

тест:

```js
// ---------- reel: music-pick ----------

test("music-pick: mood, a tempo for the speech, never the previous reel's track; CC BY credit once", () => {
  const tracks = [
    { file: "generated-lofi-106.wav", mood: ["lo-fi"], bpm: 106 },
    { file: "calm-a.mp3", mood: ["спокойный"], bpm: 92, last_used: { at: "2026-10-26T10:00:00Z", reel: "r1" } },
    { file: "calm-b.mp3", mood: ["спокойный"], bpm: 96, credit: "Музыка: «B» — Ann (CC BY 4.0)" },
    { file: "fast.mp3", mood: ["бодрый"], bpm: 122 },
    { file: "pad.mp3", mood: ["кинематографичный"], bpm: null },
  ];
  assert.equal(pickTrack(tracks, { wps: 3.2, mood: "спокойный" }).file, "calm-b.mp3");
  assert.equal(pickTrack(tracks, { wps: 2.4, mood: "бодрый" }).file, "fast.mp3");
  assert.equal(pickTrack([tracks[0]], { wps: 3 }).file, "generated-lofi-106.wav");
  assert.equal(pickTrack([], { wps: 3 }), null);
  assert.ok(tempoOk(null, 3.5) && !tempoOk(122, 3.1) && tempoOk(98, 2.8));
  assert.equal(wordsPerSecond({ audio_duration_secs: 10, words: [{ text: "a" }, { text: "b", type: "spacing" }, { text: "c" }] }), 0.2);
  const fx = applyPick({ sound: { music: { src: "old.wav", stops: [{ word: "x" }], start: 3.2 } } }, tracks[2]);
  assert.deepEqual(fx.sound.music.stops, [{ word: "x" }]);
  assert.equal(fx.sound.music.src, "brand/music/calm-b.mp3");
  assert.equal(fx.sound.music.start, "auto");
  assert.equal(fx.sound.music.credit, tracks[2].credit);
  assert.equal(applyPick({}, tracks[4]).sound.music.bpm, 90);
  const d = tmp(), cap = join(d, "CAPTION.md");
  writeFileSync(cap, "Текст\n");
  assert.ok(addCredit(cap, tracks[2].credit));
  assert.ok(!addCredit(cap, tracks[2].credit));
  assert.equal(readFileSync(cap, "utf8"), `Текст\n\n${tracks[2].credit}\n`);
  assert.ok(!addCredit(cap, null));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sound.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/ru/music-pick.mjs'`.

- [ ] **Step 3: Write `scripts/ru/music-pick.mjs`**

```js
#!/usr/bin/env node
// Picks the reel's music from the brand library (brand/music/tracks.json, filled by sound_review.py apply).
//
//   node scripts/ru/music-pick.mjs <reel> [--mood технологичный] [--dry] [--tracks brand/music/tracks.json]
//     → fx/fx.json sound.music {src, bpm, credit, …} and tracks.json last_used (unless --dry)
//   node scripts/ru/music-pick.mjs <reel> --credit
//     → appends the track's CC BY line to CAPTION.md once (CC0: nothing to add)
//
// Choice (design 2026-10-26): the mood Claude reads in the brief; a tempo that suits the speech (fast speech
// ≥ 3 words/s → a calmer track ≤ 100 BPM, slow < 2.6 → ≥ 95 BPM, otherwise 85–115; a pad suits any); never
// the previous reel's track; generated-* tracks only when nothing else is there.
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function wordsPerSecond(tr) {
  return tr.words.filter((x) => (x.type ?? "word") === "word").length / Number(tr.audio_duration_secs);
}

export function tempoOk(bpm, wps) {
  if (bpm == null) return true;
  if (wps >= 3.0) return bpm <= 100;
  if (wps < 2.6) return bpm >= 95;
  return bpm >= 85 && bpm <= 115;
}

export function pickTrack(tracks, { wps, mood = null }) {
  const real = tracks.filter((t) => !basename(t.file).startsWith("generated-"));
  const pool = real.length ? real : tracks;
  if (!pool.length) return null;
  const ats = [...new Set(tracks.map((t) => t.last_used?.at).filter(Boolean))].sort();
  const last = ats.at(-1), recent = ats.slice(-3);
  const at = (t) => t.last_used?.at ?? "";
  const score = (t) => (mood && (t.mood ?? []).includes(mood) ? 2 : 0) + (tempoOk(t.bpm, wps) ? 1 : 0)
    - (last && at(t) === last ? 3 : recent.includes(at(t)) ? 1 : 0);
  return [...pool].sort((a, b) => score(b) - score(a) || at(a).localeCompare(at(b)) || a.file.localeCompare(b.file))[0];
}

export function applyPick(fx, track) {
  const prev = fx.sound?.music ?? {};
  fx.sound = { ...(fx.sound ?? {}), music: { level_db: -17, duck_db: -9, fade_out: 1.2, ...prev, start: "auto",
    src: `brand/music/${track.file}`, bpm: track.bpm ?? 90, credit: track.credit ?? null } };
  return fx;
}

export function addCredit(captionPath, credit) {
  if (!credit || !existsSync(captionPath)) return false;
  const text = readFileSync(captionPath, "utf8");
  if (text.includes(credit)) return false;
  appendFileSync(captionPath, `${text.endsWith("\n") ? "" : "\n"}\n${credit}\n`);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const reel = resolve(args[0] ?? "."), fxPath = join(reel, "fx", "fx.json");
  if (!args[0] || !existsSync(fxPath)) { console.error("usage: music-pick.mjs <reel> [--mood m] [--dry] | <reel> --credit"); process.exit(1); }
  const fx = JSON.parse(readFileSync(fxPath, "utf8"));
  if (args.includes("--credit")) {
    const c = fx.sound?.music?.credit;
    console.log(addCredit(join(reel, "CAPTION.md"), c) ? `CAPTION.md + «${c}»` : c ? "credit already in CAPTION.md or no CAPTION.md" : "CC0 or no music: no credit");
    process.exit(0);
  }
  const tracksPath = opt("--tracks", join(ROOT, "brand", "music", "tracks.json"));
  const lib = JSON.parse(readFileSync(tracksPath, "utf8"));
  const wps = wordsPerSecond(JSON.parse(readFileSync(join(reel, "transcript.clean.json"), "utf8")));
  const t = pickTrack(lib.tracks, { wps, mood: opt("--mood", null) });
  if (!t) { console.error("tracks.json is empty: run sound_review.py apply first"); process.exit(1); }
  console.log(`${t.file} · ${t.bpm ?? "без бита"} BPM · ${(t.mood ?? []).join(", ")} · речь ${wps.toFixed(2)} сл/с${t.credit ? ` · ${t.credit}` : ""}`);
  if (args.includes("--dry")) process.exit(0);
  writeFileSync(fxPath, JSON.stringify(applyPick(fx, t), null, 1));
  t.last_used = { at: new Date().toISOString(), reel: basename(reel) };
  writeFileSync(tracksPath, JSON.stringify(lib, null, 1));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sound.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/ru/music-pick.mjs tests/sound.test.mjs
git commit -m "Reels Studio: music-pick.mjs — brand track by mood and speech tempo, CC BY credit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Сравнение на understand-anything и вторая остановка (главная сессия)

Нужны задачи 8b, 9–11. Ничего из одобренного не перезаписывается: всё новое — с меткой `v2`.

- [ ] **Step 1: Трек**

```bash
P=video-projects/2026-10-25-understand-anything
node scripts/ru/music-pick.mjs $P --mood технологичный --dry
```

Записать из вывода `<file>` и `<bpm>` (для трека без бита — `90`).

- [ ] **Step 2: Звуки и микс**

```bash
python3 scripts/ru/fx/sfx_real.py $P --variant v2 --music brand/music/<file> --bpm <bpm>
python3 scripts/ru/fx/sound.py $P --variant v2 --music brand/music/<file> --bpm <bpm> --sfx fx/sfx.v2.wav
```

Expected: `41 events → ~25 kept, ~16 dropped; … placed, 0 silent; trim −N dB; signature <буква>`, затем `fx/mix.v2.wav`. Если `silent` > 0 — посмотреть в `fx/sfx.real.v2.json`, каким событиям не нашлось записи, и назвать их в отчёте (не синтезировать).

- [ ] **Step 3: Видео**

```bash
ffmpeg -v error -y -i $P/fx/mix.v2.wav -af atempo=1.12 $P/work/mix.v2.x1.12.wav
node scripts/ru/export-reel.mjs $P/work/composite-full.mov $P/renders/final.sound-v2.mp4 --audio $P/fx/mix.v2.wav
node scripts/ru/export-reel.mjs $P/work/composite-full.x1.12.mov $P/renders/final.sound-v2.x1.12.mp4 --audio $P/work/mix.v2.x1.12.wav
```

Expected: оба экспорта проходят `check-reel` (−14 LUFS ±1, TP ≤ −1).

- [ ] **Step 4: Самопроверка по цифрам**

- `fx/sfx.real.v2.json`: число оставленных и выброшенных событий, `trim_db`, три строки `critique_top`;
- `fx/sound.v2.json`: `music.under_speech_db_vs_voice` (ориентир −20…−26), `events_on_beat`;
- `python3 .claude/skills/real-sfx/scripts/review.py $P/work/sfx-real.v2/sfx_resolved_cues.json $P/work/sfx-real.v2/sfx_sfx_track.wav --out $P/review/sound-v2.png` — посмотреть картинку: звуки не налезают на слова, удар один.

- [ ] **Step 5: Остановка — заказчик сравнивает**

`SendUserFile`: `renders/final.sound-v2.x1.12.mp4` и `renders/final.x1.12.mp4` (старый, одобренный). В сообщении: трек (название, автор, лицензия), сколько звуков было и сколько стало, какой фирменный звук, три пункта критики Real SFX, строка «Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух». Один вопрос: «Новый звук лучше? Ок или правки?»

Правки — уровни (`sfx_real.peak_below_voice_db`, `sound.music.level_db`), плотность (`sfx_real.budget_s`), другой трек (`--mood` или другой файл) — применить и повторить шаги 2–3.

---

### Task 13: Документы и скиллы

**Files:**
- Modify: `.claude/skills/remake-fast/SKILL.md`
- Modify: `.claude/skills/vladilen-reels/SKILL.md` (S4b)
- Modify: `.claude/skills/vladilen-reels/references/sound-rules.md`
- Modify: `SETUP.md`, `brand/brand.md`, `brand/music/README.md`, `brand/sfx/README.md`
- Generated: `.agents/skills/**` (`npm run sync:skills`)

- [ ] **Step 1: `remake-fast/SKILL.md`, F2** — после абзаца `Reel project: … vladilen-reels S1–S6 with:` (перед `**Preview — stop.**`) вставить:

```markdown
Sound (since 2026-10-26, «чисто и дорого»): set `fx.json` `"sfx_engine": "real"` before S4b, pick the track with
`node scripts/ru/music-pick.mjs <reel> --mood <mood from the brief: спокойный | технологичный | тёплый | lo-fi |
кинематографичный | бодрый>`, then `python3 scripts/ru/fx/sfx_real.py <reel>` instead of `sfx.py`, then `sound.py`.
`sfx_real.py` thins the events by the brand rules, plays the brand signature on every `whoosh_big` and puts the SFX
9 dB under the voice. S6 writes one line into `REVIEW.md` from `fx/sfx.real.json`: events kept / dropped, trim, silent
moments, the three critique lines. The preview's sound line: the track (title, author, licence) and that line. A moment
with no fitting recording stays quiet and is named — never synthesized.
```

В F3 после абзаца про `CAPTION.md` добавить строку:

```markdown
CC BY music: `node scripts/ru/music-pick.mjs <reel> --credit` appends the author line to `CAPTION.md` (CC0 adds nothing).
```

- [ ] **Step 2: `vladilen-reels/SKILL.md`, S4b** — после абзаца `**Real sounds instead of the synth (since 2026-10-25).**` добавить:

```markdown
**Brand library engine (since 2026-10-26, default in remake-fast).** With `fx.json` `"sfx_engine": "real"` the
SFX come from the customer-approved library through Real SFX: `python3 scripts/ru/fx/sfx_real.py $P` (the same
`sfx` list as `sfx.py`; `sfx.py` refuses this engine) → `fx/sfx.wav` + `fx/sfx.real.json`; music from
`node scripts/ru/music-pick.mjs $P --mood …`; then `sound.py` as usual. Rules and the library upkeep:
`references/sound-rules.md` → «Чисто и дорого». `/reel` and `/reel-wide` switch to it by the same setting.
```

- [ ] **Step 3: `sound-rules.md`** — в конец файла:

```markdown
## Чисто и дорого (с 2026-10-26, remake-fast по умолчанию)

Решение заказчика: звуков меньше, каждый живой и мягкий; фирменный звук на смене фона и CTA; музыка —
живые треки из своей библиотеки, отобранные на слух. Включается `fx.json` → `"sfx_engine": "real"`.

- Источники: музыка — Openverse, только CC0 и CC BY (BY-ND запрещает класть под видео, BY-SA открыла бы
  лицензию рилса, NC — некоммерческие); звуки — только CC0 с Freesound. Синтеза нет: нет записи — момент тихий
  и назван в отчёте.
- Плотность (`scripts/ru/fx/sfx_real.py`, `fx.json` → `sfx_real`): не больше одного акцента на 2 с
  (`budget_s`), события ближе 0,4 с — один звук (`merge_s`), тики и попы — не больше 3 подряд (`run_max`).
- Иерархия: один удар на рилс (остальные — мягкие `thump`); фирменный звук (`brand/sfx/signature.json`) — на
  каждом `whoosh_big`; вжух — на смене окна или локации; внутри окна — тихие тактильные.
- Уровень: самый громкий пик SFX на 9 дБ ниже пика голоса (`peak_below_voice_db`); тональные звуки подстроены под
  трек (Real SFX `--music-ref`).
- Трек: `scripts/ru/music-pick.mjs` — настроение из брифа, темп под плотность речи, не трек прошлого рилса;
  строка автора CC BY — в `CAPTION.md` (`--credit`).
- Пополнение библиотеки: `music-fetch.mjs` → `music_screen.py`; `sfx-fetch.mjs` → `sfx_screen.py`;
  `sound_review.py build` + `serve` (заказчик отмечает «беру / нет») → `sound_review.py apply`.
```

- [ ] **Step 4: `SETUP.md`** — в таблице «**Звук**» (колонки «Настройка | На что влияет | По умолчанию») после строки `| \`sfx_kit\` | папка своих эффектов | \`brand/sfx\` |` добавить:

```markdown
| `sfx_engine` | `"real"` — звуки из фирменной библиотеки через Real SFX (`sfx_real.py`), без синтеза | в remake-fast `"real"`, в остальных — набор `brand/sfx/<вид>.wav` |
| `sfx_real` | плотность и уровень звуков: `budget_s` (один акцент на столько секунд), `merge_s`, `run_max`, `peak_below_voice_db` | 2 · 0,4 · 3 · 9 |
```

В таблице раздела «## Звуки и музыка» (колонки «Где | Что») заменить строку `brand/music/` + `tracks.json` и после строки `brand/sfx/library/` добавить:

```markdown
| `brand/music/` + `tracks.json` | фирменные треки CC0 / CC BY, отобранные на слух: настроение, темп, лицензия, строка автора (`credit`), когда звучал (`last_used`); трек под рилс выбирает `node scripts/ru/music-pick.mjs <рилс> --mood <настроение>` |
| `brand/sfx/signature.json` | фирменный звук на смене фона и CTA (слои и уровни), выбран на странице отбора |
| страница отбора звука | `python3 scripts/ru/sound_review.py build`, затем `serve` → `http://127.0.0.1:8765`, отметки «беру / нет» → `apply`; пополнение: `music-fetch.mjs` + `music_screen.py`, `sfx-fetch.mjs` + `sfx_screen.py` |
```

- [ ] **Step 5: `brand/brand.md`, «Словами»** — в пункте «Звуковые акценты и плавная анимация…» заменить первую часть до «и небольшие плавные переходы» на:

```markdown
- Звук — «чисто и дорого» (с 2026-10-26): звуков меньше, каждый живой и мягкий (воздушные вжухи, тактильные клики, мягкие низкие удары; пики ~9 дБ ниже голоса, никогда внутри слова), на смене фона и CTA — фирменный звук, музыка — живые треки CC0/CC BY из своей библиотеки, а не генерация;
```

(конец пункта про плавные переходы карточек остаётся как есть).

- [ ] **Step 6: `brand/music/README.md` и `brand/sfx/README.md`**

В `brand/music/README.md` перед разделом «Как добавить трек» вставить:

```markdown
## Фирменная библиотека (с 2026-10-26)

Треки собираются автоматически и отбираются на слух:

1. `node scripts/ru/music-fetch.mjs` — кандидаты из Openverse (Jamendo, Freesound, ccMixter), только CC0 и CC BY.
2. `python3 scripts/ru/music_screen.py` — отсев по замерам (темп, вступление, ровность, полоса голоса).
3. `python3 scripts/ru/sound_review.py build` и `serve` — страница: каждый трек отдельно и под твоим голосом.
4. `python3 scripts/ru/sound_review.py apply` — отмеченные «беру» скачиваются целиком и попадают в `tracks.json`
   со строкой автора; «нет» больше не появятся (`rejected.json`).

Трек под рилс выбирает `node scripts/ru/music-pick.mjs <рилс> --mood <настроение>`.
```

В `brand/sfx/README.md` в конец:

```markdown
## Палитра «чисто и дорого» (с 2026-10-26)

`node scripts/ru/sfx-fetch.mjs` качает CC0-записи по палитре `scripts/ru/lib/sfx-palette.mjs` в папки-роли
Real SFX (`whoosh`, `riser`, `hit`, `subdrop`, `click`, `click_tick`, `pop`, `paper`, `glass`, `chime`, `keyboard`,
`ambience`). `python3 scripts/ru/sfx_screen.py` отсеивает по замерам: брак — в `rejected/`, лишнее — в `reserve/`.
Отбор на слух и фирменный звук — `scripts/ru/sound_review.py` (`signature.json` рядом с этой папкой).
В remake-fast звуки ставит `scripts/ru/fx/sfx_real.py`, набор `<вид>.wav` выше — для старого `sfx.py`.
```

- [ ] **Step 7: Синхронизировать скиллы и прогнать проверки**

```bash
npm run sync:skills && npm run check:skills && npm test
```

Expected: `check:skills` без расхождений; `npm test` — все тесты зелёные (включая `tests/sound.test.mjs`).

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/remake-fast/SKILL.md .claude/skills/vladilen-reels/SKILL.md .claude/skills/vladilen-reels/references/sound-rules.md \
  .agents/skills/remake-fast/SKILL.md .agents/skills/vladilen-reels/SKILL.md .agents/skills/vladilen-reels/references/sound-rules.md \
  SETUP.md brand/brand.md brand/music/README.md brand/sfx/README.md
git commit -m "Reels Studio: «чисто и дорого» sound in remake-fast (brand library, signature, docs)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
