// scripts/long/face-plan.mjs: where the face goes full-frame on the YouTube stage.
// The transcript is synthetic Russian speech (0.3 s per word, 0.3 s of breath between sentences).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { planFace, checkFace, splitSentences, loadLexicon } from "../scripts/long/face-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/long/face-plan.mjs");
const filler = (k) => `Объяснение номер ${k} про устройство системы и про то как части связаны между собой.`;

const HOOK = "Сегодня я расскажу, как ИИ перестал быть просто инструментом и стал частью команды.";
const PERSONAL = "Честно, я сам не верил, что это заработает.";
const TURN = "А что если задать вопрос по-другому?";
const HOWTO = "Как это сделать на практике и ничего не сломать?";
const OFFER = "Честно, я сам рекомендую эту программу, ссылка в описании.";
const OUTRO = ["Надеюсь, было полезно.", "Если понравилось, подписывайся на канал.", "До встречи в следующем видео."];

function lines() {
  const s = [HOOK];
  for (let k = 2; k <= 8; k++) s.push(filler(k));
  s.push(PERSONAL);
  for (let k = 10; k <= 15; k++) s.push(filler(k));
  s.push(TURN);
  // the how-to question sits 18 s after the turning question, so only the cue rules decide
  for (let k = 17; k <= 20; k++) s.push(filler(k));
  s.push(HOWTO);
  for (let k = 22; k <= 25; k++) s.push(filler(k));
  s.push(OFFER);
  for (let k = 27; k <= 32; k++) s.push(filler(k));
  s.push(...OUTRO);
  return s;
}

function transcript(sentences, { wordDur = 0.3, gap = 0.3 } = {}) {
  const words = [];
  let t = 0;
  for (const sentence of sentences) {
    for (const text of sentence.split(/\s+/)) { words.push({ text, start: Math.round(t * 1000) / 1000, end: Math.round((t + wordDur) * 1000) / 1000 }); t += wordDur; }
    t += gap;
  }
  return { words, duration: Math.round((t - gap) * 1000) / 1000, cyrillic: 1 };
}

const T = transcript(lines());
const face = planFace(T);
const fullText = () => face.segments.filter((s) => s.state === "full").map((s) => s.text ?? "").join(" | ");

test("sentences split on punctuation and on a long pause without it", () => {
  const w = (text, start) => ({ text, start, end: start + 0.2 });
  const s = splitSentences([w("раз", 0), w("два.", 0.2), w("три", 0.4), w("четыре", 1.5), w("пять?", 1.7)]);
  assert.deepEqual(s.map((x) => x.n), [2, 1, 2]);
  assert.ok(Math.abs(s[0].gapAfter - 0) < 1e-9);
});

test("the lexicon carries every cue the planner reads, in both languages", () => {
  for (const lang of ["ru", "en"]) {
    const lex = loadLexicon(lang);
    for (const name of ["firstPerson", "emotion", "section", "transition", "contrast", "conclusion", "procedural", "rhetorical", "outro", "offer"]) {
      assert.ok(lex[name] instanceof RegExp, `${lang}.${name}`);
    }
    for (const w of ["question", "section", "transition", "firstPerson", "emotion", "conclusion", "rhetorical", "punch", "short", "compact", "contrast"]) {
      assert.equal(typeof lex.weights[w], "number", `weight ${w}`);
    }
  }
});

test("the language is detected from the Cyrillic share", () => {
  assert.equal(face.source.language, "ru");
  assert.equal(planFace({ ...T, cyrillic: 0 }, { lang: "auto" }).source.language, "en");
});

test("the video opens with the face full-frame and closes with it", () => {
  const first = face.segments[0], last = face.segments.at(-1);
  assert.equal(first.state, "full");
  assert.equal(first.role, "hook");
  assert.equal(first.start, 0);
  assert.equal(last.state, "full");
  assert.equal(last.role, "closing");
  assert.equal(last.end, T.duration);
  assert.match(last.text, /подписывайся/);
});

test("segments are contiguous and the plan passes its own check", () => {
  face.segments.forEach((s, k) => { if (k) assert.equal(s.start, face.segments[k - 1].end); });
  const res = checkFace(face, T);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
});

test("a personal line and a turning question get the face; a how-to question does not", () => {
  assert.match(fullText(), /Честно, я сам не верил/);
  assert.match(fullText(), /А что если задать вопрос/);
  assert.doesNotMatch(fullText(), /Как это сделать на практике/);
});

test("an offer sentence never takes the face", () => {
  assert.doesNotMatch(fullText(), /рекомендую эту программу/);
});

test("every cut lands in the breath between sentences, within 0.15 s of a word", () => {
  const sentences = splitSentences(T.words);
  const bounds = [];
  sentences.forEach((s, k) => { bounds.push(s.end); if (sentences[k + 1]) bounds.push(sentences[k + 1].start); });
  for (let k = 1; k < face.segments.length; k++) {
    const at = face.segments[k].start;
    if (face.segments[k - 1].role === "hook") continue;
    const near = Math.min(...bounds.map((b) => Math.abs(b - at)));
    assert.ok(near <= 0.151, `cut at ${at} is ${near} s from the nearest sentence edge`);
  }
});

test("the plan is deterministic", () => {
  assert.equal(JSON.stringify(planFace(T)), JSON.stringify(planFace(transcript(lines()))));
});

test("check: a gap between segments is an error, a cut inside a word and a missing hook are warnings", () => {
  const broken = structuredClone(face);
  broken.segments[2].start += 0.5;
  assert.ok(checkFace(broken, T).errors.some((e) => /gap or overlap/.test(e)));

  const inside = structuredClone(face);
  const w = T.words[20];
  const mid = (w.start + w.end) / 2;
  const k = inside.segments.findIndex((s) => s.start > mid) - 1;
  inside.segments[k].end = mid; inside.segments[k + 1].start = mid;
  assert.ok(checkFace(inside, T).warnings.some((x) => /falls inside the word/.test(x)));

  const noHook = structuredClone(face);
  noHook.segments[0].state = "dock";
  const res = checkFace(noHook, T);
  assert.ok(res.warnings.some((x) => /does not open with the face/.test(x)));
});

test("check: an unknown state and a wrong end are errors", () => {
  const bad = structuredClone(face);
  bad.segments[1].state = "half";
  bad.segments.at(-1).end = T.duration - 5;
  const res = checkFace(bad, T);
  assert.ok(res.errors.some((e) => /unknown state/.test(e)));
  assert.ok(res.errors.some((e) => /last segment ends/.test(e)));
});

test("CLI: writes FACE.json, exits 0; --check exits 1 on a structural error", () => {
  const dir = mkdtempSync(join(tmpdir(), "face-"));
  try {
    const raw = { words: T.words.map((w) => ({ ...w, type: "word" })), audio_duration_secs: T.duration, cyrillic_share: 1 };
    writeFileSync(join(dir, "transcript.words.json"), JSON.stringify(raw));
    const run = spawnSync(process.execPath, [SCRIPT, join(dir, "transcript.words.json"), "--out", join(dir, "FACE.json")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    const out = JSON.parse(readFileSync(join(dir, "FACE.json"), "utf8"));
    assert.equal(out.version, 1);
    assert.equal(out.source.language, "ru");
    assert.ok(out.dock.crop.w > 0 && out.dock.crop.h > 0);
    const ok = spawnSync(process.execPath, [SCRIPT, "--check", join(dir, "FACE.json"), "--transcript", join(dir, "transcript.words.json")], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stdout);
    out.segments[1].end += 1;
    writeFileSync(join(dir, "FACE.json"), JSON.stringify(out));
    const bad = spawnSync(process.execPath, [SCRIPT, "--check", join(dir, "FACE.json"), "--transcript", join(dir, "transcript.words.json")], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /ERROR/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// --- the cards of the stage style (style-library/03-vladilen-stage): contract checks without a browser ---
import { existsSync } from "node:fs";
import { loadStyle, staticCheck } from "../scripts/long/check-stage-cards.mjs";

const STYLE = loadStyle("03-vladilen-stage");
const cardHtml = (c) => readFileSync(c.path, "utf8");

test("stage cards: every card passes the static contract", () => {
  assert.ok(STYLE.cards.length >= 9, "the style declares its cards");
  for (const c of STYLE.cards) assert.deepEqual(staticCheck(cardHtml(c), c), [], c.compId);
});

test("stage cards: ids are unique, files and posters exist, every slot is typed", () => {
  const ids = new Set();
  for (const c of STYLE.cards) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`); ids.add(c.id);
    assert.ok(existsSync(c.path), c.file);
    assert.ok(existsSync(join(STYLE.dir, c.preview.poster)), `poster of ${c.id}`);
    for (const s of c.slots) {
      assert.ok(["text", "list"].includes(s.type), `${c.id}.${s.name} type`);
      if (s.type === "text") assert.ok(s.maxChars > 0, `${c.id}.${s.name} maxChars`);
      if (s.type === "list") { assert.ok(s.maxItems > 0, `${c.id}.${s.name} maxItems`); assert.ok(s.fields || s.maxChars, `${c.id}.${s.name} fields or maxChars`); }
    }
  }
});

test("stage cards: a list slot's fields exist in the card", () => {
  for (const c of STYLE.cards) {
    const html = cardHtml(c);
    for (const s of c.slots.filter((x) => x.fields)) for (const f of Object.keys(s.fields)) assert.ok(html.includes(`data-field="${f}"`), `${c.id}: field ${f} of ${s.name}`);
  }
});

test("stage cards: every var(--token) used is defined in tokens.css", () => {
  const tokens = readFileSync(join(STYLE.dir, "tokens.css"), "utf8");
  const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const sources = [join(STYLE.dir, "cards/stage/stage.css"), ...STYLE.cards.map((c) => c.path)];
  for (const file of sources) {
    const text = readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      if (m[2] === ",") continue;                       // has a fallback, e.g. var(--dock-display, flex)
      assert.ok(defined.has(m[1]), `${file.split("/").pop()}: ${m[1]} is not defined in tokens.css`);
    }
  }
});

test("stage cards: the static check catches a hex color, autoAlpha, a wrong id and a missing timeline", () => {
  const card = STYLE.cards.find((c) => c.compId === "stage-quote");
  const html = cardHtml(card);
  assert.ok(staticCheck(html.replace("color: var(--ink-muted);", "color: #B6AFC4;"), card).some((p) => /hex color/.test(p)));
  assert.ok(staticCheck(html.replace("opacity: 0, y: 24", "autoAlpha: 0, y: 24"), card).some((p) => /autoAlpha/.test(p)));
  assert.ok(staticCheck(html.replace('data-composition-id="stage-quote"', 'data-composition-id="stage-other"'), card).some((p) => /differs from the file name/.test(p)));
  assert.ok(staticCheck(html.replace('window.__timelines["stage-quote"] = tl;', ""), card).some((p) => /registration/.test(p)));
  assert.ok(staticCheck(html.replace("font-family: var(--font-display);", "font-family: Georgia;"), card).some((p) => /font family/.test(p)));
});
