// scripts/long/stage-assemble.mjs: the plan of cards (CARDS.json), the ffmpeg graph and one end-to-end assembly.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadStyle, findChrome } from "../scripts/long/check-stage-cards.mjs";
import { norm, findPhrase, resolvePlan, validatePlan, sanitizeInline } from "../scripts/long/lib/plan.mjs";
import { frameWindows, enableExpr, frameEnabled, intersect, fitCrop, buildStageGraph } from "../scripts/long/lib/filter.mjs";
import { snapFps } from "../scripts/long/lib/verify.mjs";
import { reviewTimes } from "../scripts/long/stage-assemble.mjs";
import { C, svg, text, icon, W, H } from "../scripts/long/lib/ill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STYLE = loadStyle("03-vladilen-stage");
const FPS = 30;

// 0.3 s per word, 0.3 s between sentences
function speech(sentences) {
  const words = [];
  let t = 0;
  for (const s of sentences) { for (const w of s.split(" ")) { words.push({ text: w, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000 }); t += 0.3; } t += 0.3; }
  return { words, duration: Math.round((t - 0.3) * 1000) / 1000 };
}
const S = speech([
  "Сегодня расскажу про четыре простых шага постановки задачи для вашего помощника.",
  "Хорошая карточка говорит одну мысль и читается за секунду а остальное делает картинка рядом.",
  "Ёжик пришёл, и «Ёлка» тоже.",
  "Потом идёт длинное объяснение которое занимает много времени и никуда не спешит вообще.",
  "Дальше пример хорошего результата чтобы помощник видел планку и повторял её каждый раз.",
  "И наконец проверка по списку критериев пока задача не будет закрыта целиком и надолго.",
]);
const FACE = { segments: [{ state: "full", start: 0, end: 3.45 }, { state: "dock", start: 3.45, end: S.duration - 0.0 }] };

test("phrases: case, ё/е and punctuation do not matter; nth picks the occurrence", () => {
  assert.equal(norm("Ёжик, пришёл!"), "ежик пришел");
  assert.ok(findPhrase(S.words, "ЕЖИК пришел"));
  assert.equal(findPhrase(S.words, "Хорошая карточка").start, 3.6);
  const hit = findPhrase(S.words, "и читается за секунду");
  assert.equal(hit.end, S.words[hit.last].end);
  assert.equal(S.words[hit.last].text, "секунду");
  assert.equal(findPhrase(S.words, "нет такой фразы"), null);
  const twice = speech(["раз два раз", "два раз два"]).words;
  assert.equal(findPhrase(twice, "раз", { nth: 2 }).start, 0.6);
  assert.equal(findPhrase(twice, "раз", { after: 1 }).start, 1.5);
});

test("only <em> and <mark> survive in a slot value", () => {
  assert.equal(sanitizeInline("a <em>b</em> <script>x</script> & <mark>c</mark>"), "a <em>b</em> &lt;script&gt;x&lt;/script&gt; &amp; <mark>c</mark>");
});

const plan = (cards, extra = {}) => ({ cards, ...extra });
const resolve1 = (p, o = {}) => resolvePlan(p, { words: S.words, duration: S.duration, fps: FPS, style: STYLE, face: FACE, ...o });
const quote = { card: "quote", from: "хорошая карточка", until: "картинка рядом", tail: 1.0, slots: { quote: "Одна <em>мысль</em>" }, at: ["мысль"] };

test("a card starts `lead` before its first word and ends `tail` after its last; reveals are relative", () => {
  const r = resolve1(plan([quote]));
  assert.deepEqual(r.errors, []);
  const c = r.cards[0];
  assert.equal(c.card, "stage-quote");
  assert.ok(Math.abs(c.start - 3.4) < 1e-9, `start ${c.start}`);
  const last = findPhrase(S.words, "картинка рядом").end;
  assert.ok(Math.abs(c.end - (Math.round((last + 1.0) * FPS) / FPS)) < 0.02, `end ${c.end}`);
  assert.ok(Math.abs(c.atAbs[0] - (findPhrase(S.words, "мысль").start - 0.15)) < 1e-9);
  assert.ok(Math.abs(c.at[0] - (c.atAbs[0] - c.start)) < 1e-9);
  assert.equal(c.startFrame, Math.round(c.start * FPS));
});

test("unknown card, unknown phrase and a missing end are errors with a reason", () => {
  assert.match(resolve1(plan([{ card: "nope", start: 1, end: 7 }])).errors[0], /unknown card "nope"/);
  assert.match(resolve1(plan([{ ...quote, from: "такого нет" }])).errors[0], /the phrase "такого нет" is not in the transcript/);
  assert.match(resolve1(plan([{ card: "quote", from: "хорошая карточка" }])).errors.join(), /no end \(give "until"/);
  assert.match(resolve1(plan([{ card: "quote", until: "хорошая карточка" }])).errors.join(), /no start \(give "from"/);
});

const check = (cards, extra) => { const r = resolve1(plan(cards, extra)); return validatePlan(r, { words: S.words, duration: S.duration, fps: FPS, face: FACE, plan: plan(cards, extra) }); };

test("validation: limits, required slots, unknown slots, duration range", () => {
  const long = check([{ ...quote, slots: { quote: "я".repeat(141) } }]);
  assert.ok(long.errors.some((e) => /141 characters, the limit is 140/.test(e)));
  assert.ok(check([{ ...quote, slots: {} }]).errors.some((e) => /required slot "quote" is empty/.test(e)));
  assert.ok(check([{ ...quote, slots: { quote: "x", nope: "y" } }]).errors.some((e) => /no slot "nope"/.test(e)));
  assert.ok(check([{ card: "quote", start: 3.5, end: 5, slots: { quote: "x" }, at: [] }]).errors.some((e) => /lasts 1.5 s, the card allows 5–10 s/.test(e)));
  const steps = { card: "steps", start: 3.5, end: 14, slots: { headline: "h", items: ["a", "b", "c", "d", "e"] }, at: [] };
  assert.ok(check([steps]).errors.some((e) => /5 items, the limit is 4/.test(e)));
  const fieldTooLong = { ...steps, slots: { headline: "h", items: [{ label: "я".repeat(29), note: "n" }] } };
  assert.ok(check([fieldTooLong]).errors.some((e) => /items\[0\]\.label: 29 characters, the limit is 28/.test(e)));
});

test("validation: one idea at a time, the face, empty stage, reveals", () => {
  const a = { card: "quote", start: 3.5, end: 9, slots: { quote: "x" }, at: [] };
  const b = { card: "quote", start: 8.5, end: 14, slots: { quote: "x" }, at: [] };
  assert.ok(check([a, b]).errors.some((e) => /overlap by 0.5 s, the limit is 0.3 s/.test(e)));
  assert.deepEqual(check([a, { ...b, start: 8.7 }]).errors, []);
  const hidden = check([{ card: "quote", start: 1, end: 6.5, slots: { quote: "x" }, at: [] }]);
  assert.ok(hidden.warnings.some((w) => /hidden behind the full-frame face for 2.45 s/.test(w)));
  assert.ok(check([a]).warnings.some((w) => /the stage is empty from/.test(w)));
  const close = check([{ ...a, slots: { quote: "x <em>y</em> <em>z</em>" }, at: [4.0, 4.2] }]);
  assert.ok(close.warnings.some((w) => /0.2 s apart, under 0.4 s/.test(w)));
  const late = check([{ ...a, slots: { quote: "x <em>y</em>" }, at: [8.9] }]);
  assert.ok(late.warnings.some((w) => /after the card has started to leave/.test(w)));
});

test("validation: an icon name must exist in the style's icon set", () => {
  const bad = check([{ card: "scene", start: 3.5, end: 9, slots: { icon: "nope", headline: "x" }, at: [4.0] }]);
  assert.ok(bad.errors.some((e) => /no icon "nope"/.test(e)));
  assert.deepEqual(check([{ card: "scene", start: 3.5, end: 9, slots: { icon: "box", headline: "x" }, at: [4.0] }]).errors, []);
  const tiles = check([{ card: "icons", start: 3.5, end: 12, slots: { headline: "h", tiles: [{ icon: "agent", label: "a" }, { icon: "logo", label: "b" }] }, at: [4, 5] }]);
  assert.ok(tiles.errors.some((e) => /tiles\[1\]\.icon: no icon "logo"/.test(e)));
});

test("images: a logo path passes as an icon, an svg is inlined, a screenshot brings its host, mark and label", () => {
  const dir = mkdtempSync(join(tmpdir(), "stage-assets-"));
  try {
    mkdirSync(join(dir, "assets/logos"), { recursive: true });
    mkdirSync(join(dir, "assets/web"), { recursive: true });
    writeFileSync(join(dir, "assets/logos/claude.svg"), "<svg viewBox='0 0 10 10'/>");
    writeFileSync(join(dir, "assets/ill.svg"), "<?xml version='1.0'?><svg viewBox='0 0 1568 760'><path d='M0 0H10'/></svg>");
    writeFileSync(join(dir, "assets/web/page.png"), "png");
    writeFileSync(join(dir, "assets/web/page.json"), JSON.stringify({ host: "example.com", highlight: { x: 0.1, y: 0.25, w: 0.3, h: 0.05 } }));
    const run = (cards) => { const p = plan(cards); const r = resolvePlan(p, { words: S.words, duration: S.duration, fps: FPS, style: STYLE, face: FACE, projectDir: dir }); return { r, v: validatePlan(r, { words: S.words, duration: S.duration, fps: FPS, face: FACE, plan: p }) }; };

    const logo = run([{ card: "scene", start: 3.5, end: 9, slots: { icon: "assets/logos/claude.svg", headline: "x" }, at: [4.0] }]);
    assert.deepEqual(logo.v.errors, []);
    assert.match(logo.r.cards[0].slots.icon, /^file:\/\/.*\/assets\/logos\/claude\.svg$/);
    assert.ok(run([{ card: "scene", start: 3.5, end: 9, slots: { icon: "assets/logos/nope.svg", headline: "x" }, at: [4.0] }]).v.errors.some((e) => /icon: no file assets\/logos\/nope\.svg/.test(e)));

    const ill = run([{ card: "figure", start: 3.5, end: 12, slots: { headline: "h", label: "ИЛЛЮСТРАЦИЯ", svg: "assets/ill.svg" }, at: [4.0] }]);
    assert.deepEqual(ill.v.errors, []);
    assert.equal(ill.r.cards[0].slots.svg, "<svg viewBox='0 0 1568 760'><path d='M0 0H10'/></svg>");

    const shot = run([{ card: "figure", start: 3.5, end: 12, slots: { headline: "h", image: "assets/web/page.png" }, at: [5.0] }]);
    assert.deepEqual(shot.v.errors, []);
    const s = shot.r.cards[0].slots;
    assert.match(s.image, /^file:\/\/.*\/assets\/web\/page\.png$/);
    assert.equal(s.host, "example.com");
    assert.equal(s.mark, "0.1000,0.2500,0.3000,0.0500");
    assert.equal(s.label, "ИСТОЧНИК · example.com");
    // what the plan names wins over the sidecar
    const own = run([{ card: "figure", start: 3.5, end: 12, slots: { headline: "h", image: "assets/web/page.png", label: "СТАТЬЯ" }, at: [5.0] }]).r.cards[0].slots;
    assert.equal(own.label, "СТАТЬЯ");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("illustration kit: colors come from tokens.css, icons from the style's set, captions are escaped", () => {
  const css = readFileSync(join(ROOT, "style-library/03-vladilen-stage/tokens.css"), "utf8");
  assert.ok(css.includes(`--bg:            ${C.bg}`) && css.includes(`--accent:        ${C.acc}`), `${C.bg} ${C.acc}`);
  assert.equal(`${W}×${H}`, "1568×760");
  assert.match(svg(""), /viewBox="0 0 1568 760"/);
  assert.match(icon("agent", 0, 0, 48), new RegExp(`stroke='${C.acc}'`));
  assert.throws(() => icon("nope", 0, 0, 48), /no icon "nope"/);
  assert.match(text(0, 0, "A < B & C"), />A &lt; B &amp; C</);
});

test("validation: a metric number must be spoken, listed in facts, or tagged ИЛЛЮСТРАЦИЯ", () => {
  const m = (slots, extra) => check([{ card: "metric", start: 3.5, end: 9, slots: { value: "12 %", label: "x", ...slots }, at: [4, 5] }], extra).warnings.filter((w) => /neither spoken/.test(w));
  assert.equal(m({}).length, 1);
  assert.equal(m({}, { facts: ["12 %"] }).length, 0);
  assert.equal(m({ tag: "Иллюстрация" }).length, 0);
});

// ---- the ffmpeg graph ----
const SEGS = [{ state: "full", start: 0, end: 3.45 }, { state: "dock", start: 3.45, end: 10.02 }, { state: "none", start: 10.02, end: 12 }, { state: "full", start: 12, end: 14.4 }];

test("frame windows cover every frame exactly once", () => {
  const total = Math.round(14.4 * FPS);
  const w = frameWindows(SEGS, FPS, total);
  for (let k = 0; k < total; k++) {
    const states = ["full", "dock", "none"].filter((s) => frameEnabled(w[s], k));
    assert.equal(states.length, 1, `frame ${k}: ${states}`);
    assert.equal(frameEnabled(w.nonFull, k), states[0] !== "full");
  }
  assert.equal(w.full[0][0], 0);
  assert.equal(w.full.at(-1)[1], total);
});

// evaluates the generated enable='…' expression the way ffmpeg does: gte(t,a)*lt(t,b) terms summed
function evalEnable(expr, t) {
  if (expr === "0") return 0;
  return expr.split("+").reduce((sum, term) => {
    const m = term.match(/^gte\(t,(-?[\d.]+)\)\*lt\(t,(-?[\d.]+)\)$/);
    assert.ok(m, `unexpected term ${term}`);
    return sum + (t >= Number(m[1]) && t < Number(m[2]) ? 1 : 0);
  }, 0);
}

test("the enable expression is true at exactly the frames of its windows (half-frame offset)", () => {
  const total = Math.round(14.4 * FPS);
  const w = frameWindows(SEGS, FPS, total);
  for (const name of ["full", "dock", "none", "nonFull"]) {
    const expr = enableExpr(w[name], FPS);
    for (let k = 0; k < total; k++) assert.equal(evalEnable(expr, k / FPS) > 0, frameEnabled(w[name], k), `${name} frame ${k}`);
  }
  assert.equal(enableExpr([], FPS), "0");
  assert.deepEqual(intersect([[10, 50]], [[0, 20], [40, 60]]), [[10, 20], [40, 50]]);
});

test("the dock crop is forced to the dock's aspect, even and inside the frame", () => {
  const c = fitCrop({ x: 0.369, y: 0.05, w: 0.263, h: 0.7 }, 1920, 1080, 208 / 312);
  assert.ok(Math.abs(c.w / c.h - 2 / 3) < 0.01);
  for (const v of [c.x, c.y, c.w, c.h]) assert.equal(v % 2, 0);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1920 && c.y + c.h <= 1080);
  const k = fitCrop({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 3840, 2160, 2 / 3);
  assert.ok(k.x + k.w <= 3840 && k.y + k.h <= 2160);
});

test("the graph layers the stage, the dock and the cards in order, and a card is not shown behind the face", () => {
  const cards = [{ index: 5, startFrame: 90, endFrame: 400 }, { index: 6, startFrame: 380, endFrame: 430 }];
  const { graph, windows } = buildStageGraph({ fps: FPS, totalFrames: 432, takeSize: { w: 1920, h: 1080 }, layout: STYLE.manifest.layout, dockCrop: { x: 0.369, y: 0.05, w: 0.263, h: 0.7 }, segments: SEGS, cards, inputs: { take: 0, stage: 1, shadow: 2, mask: 3, border: 4 }, out: { w: 960, h: 540 } });
  const order = ["[1:v]", "[l1][sh]overlay", "[l2][dock]overlay", "[l3][bd]overlay", "[l4][c0]overlay", "[m0][c1]overlay"].map((s) => graph.indexOf(s));
  assert.ok(order.every((x) => x >= 0) && order.every((x, i) => !i || x > order[i - 1]), `layer order ${order}`);
  assert.match(graph, /\[m1\]scale=960:540/);
  const line = graph.split("\n").find((l) => l.includes("[c1]overlay"));
  const expr = line.match(/enable='([^']+)'/)[1];
  for (let k = 380; k < 430; k++) assert.equal(evalEnable(expr, k / FPS) > 0, frameEnabled(windows.nonFull, k), `card 2 at frame ${k}`);
  assert.equal(evalEnable(expr, 420 / FPS), 0, "frame 420 lies in the full-frame segment");
});

test("29.97 is 30, odd rates stay, the review picks both sides of every cut", () => {
  assert.equal(snapFps(29.97), 30); assert.equal(snapFps(25), 25); assert.equal(snapFps(23.976), 24); assert.equal(snapFps(60), 60);
  const times = reviewTimes({ segments: SEGS }, [{ start: 4, duration: 6 }], FPS);
  const has = (v) => times.some((x) => Math.abs(x - v) < 1e-9);
  assert.ok(has(104 / FPS) && has(103 / FPS), `times ${times}`);
});

// ---- one end-to-end assembly of a tiny project (skipped without Chrome or ffmpeg) ----
const haveTools = () => { try { return Boolean(findChrome()) && spawnSync("ffmpeg", ["-version"]).status === 0 && existsSync(join(ROOT, "node_modules/gsap/dist/gsap.min.js")); } catch { return false; } };

test("end to end: a 15 s project assembles, and the frames are what the plan says", { skip: !haveTools() && "needs Chrome, ffmpeg and gsap", timeout: 240000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "stage-e2e-"));
  try {
    mkdirSync(join(dir, "renders"));
    const words = Array.from({ length: 50 }, (_, i) => ({ text: `слово${i}`, start: Math.round(i * 0.3 * 1000) / 1000, end: Math.round((i * 0.3 + 0.3) * 1000) / 1000, type: "word" }));
    writeFileSync(join(dir, "transcript.words.json"), JSON.stringify({ words, audio_duration_secs: 15, cyrillic_share: 1 }));
    writeFileSync(join(dir, "FACE.json"), JSON.stringify({ version: 1, dock: { crop: { x: 0.369, y: 0.05, w: 0.263, h: 0.7 } }, segments: [
      { state: "full", start: 0, end: 2, role: "hook" }, { state: "dock", start: 2, end: 13, role: "default" }, { state: "full", start: 13, end: 15, role: "closing" }] }));
    writeFileSync(join(dir, "CARDS.json"), JSON.stringify({ cards: [
      { id: "q", card: "quote", start: 2.1, end: 7.3, slots: { quote: "Одна <em>мысль</em>" }, at: [3.0] },
      { id: "m", card: "metric", start: 7.1, end: 12.6, slots: { value: "12 %", label: "Подпись", tag: "ИЛЛЮСТРАЦИЯ" }, at: [8.0, 9.0] }] }));
    const mk = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=15", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=15", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "renders/clean.mp4")], { encoding: "utf8" });
    assert.equal(mk.status, 0, mk.stderr);
    const run = spawnSync(process.execPath, [join(ROOT, "scripts/long/stage-assemble.mjs"), dir, "--preview", "--review"], { encoding: "utf8", timeout: 220000 });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    assert.doesNotMatch(run.stdout, /FAIL|ERROR/);
    assert.match(run.stdout, /ok {4}hard cut at frame 390/);   // dock → full at 13 s
    assert.match(run.stdout, /ok {4}card q on screen/);
    assert.ok(existsSync(join(dir, "renders/stage.preview.mp4")));
    assert.ok(existsSync(join(dir, "review/stage-preview-01.png")));
    // the second run finds both clips in the cache
    const again = spawnSync(process.execPath, [join(ROOT, "scripts/long/stage-assemble.mjs"), dir, "--preview", "--no-verify"], { encoding: "utf8", timeout: 220000 });
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /to render 0, cached 2/);
    // a plan error stops everything before any rendering
    writeFileSync(join(dir, "CARDS.json"), JSON.stringify({ cards: [{ id: "q", card: "quote", start: 2.1, end: 7.3, slots: {}, at: [] }] }));
    const bad = spawnSync(process.execPath, [join(ROOT, "scripts/long/stage-assemble.mjs"), dir, "--preview"], { encoding: "utf8", timeout: 60000 });
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /required slot "quote" is empty/);
    assert.match(bad.stdout, /nothing rendered/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
