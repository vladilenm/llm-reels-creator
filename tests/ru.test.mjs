import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { normalizeTranscript } from "../scripts/ru/normalize-transcript.mjs";
import { buildCues, toSrt, validateSrt } from "../scripts/ru/words-to-srt.mjs";
import { checkGlyphs } from "../scripts/ru/check-glyphs.mjs";
import { checkReel, topLevelAtoms } from "../scripts/ru/check-reel.mjs";
import { normKey, wrapLines } from "../scripts/ru/lib/text.mjs";
import { makeFixture, hasRussianVoice } from "../scripts/ru/make-ru-fixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = (args, opts = {}) => spawnSync(process.execPath, args, { encoding: "utf8", cwd: ROOT, ...opts });
const tmp = () => mkdtempSync(join(tmpdir(), "ru-test-"));
const GEIST = join(ROOT, ".claude/skills/motion-broll/engine/fonts/Geist-Variable.woff2");
const INTER_LATIN = join(ROOT, ".claude/skills/embedded-captions/modes/standard/fonts/files/inter-latin-400-normal.woff2");
const canSay = process.platform === "darwin" && hasRussianVoice();

// ---------- normalization ----------

test("normKey folds ё→е, case and punctuation, keeps the display text untouched", () => {
  assert.equal(normKey("Ещё,"), "еще");
  assert.equal(normKey("«Э-э-э…»"), "эээ");
  assert.equal(normKey("ИИ-агенты"), "ииагенты");
  assert.equal(normKey("—"), "");
});

test("normalizeTranscript drops spacing/audio events, keeps text, uses the probed duration", () => {
  const raw = {
    language_code: "rus",
    audio_duration_secs: 99,
    words: [
      { text: "Ещё", start: 0.1, end: 0.4, type: "word", speaker_id: "speaker_0" },
      { text: " ", start: 0.4, end: 0.5, type: "spacing" },
      { text: "(смех)", start: 0.5, end: 0.9, type: "audio_event" },
      { text: "раз,", start: 0.35, end: 0.8, type: "word" },
      { text: "—", start: 0.8, end: 0.85, type: "word" },
      { text: "ёлка.", start: 0.9, end: 12.5, type: "word" },
    ],
  };
  const t = normalizeTranscript(raw, { duration: 12.0 });
  assert.deepEqual(t.words.map((w) => w.text), ["Ещё", "раз,", "ёлка."]);
  assert.deepEqual(t.words.map((w) => w.key), ["еще", "раз", "елка"]);
  assert.equal(t.audio_duration_secs, 12);
  assert.equal(t.words[1].start, 0.4, "overlapping start is clamped to the previous end");
  assert.equal(t.words[2].end, 12, "end is clamped to the media duration");
  assert.equal(t.words[0].speaker_id, "speaker_0");
  assert.equal(t.cyrillic_share, 1);
  assert.equal(t.text, "Ещё раз, ёлка.");
});

// ---------- SRT ----------

const sampleWords = (() => {
  const text = "Сегодня расскажу про умных агентов. Агенты берут на себя рутину и экономят часы каждую неделю. Пишите в комментарии.".split(" ");
  let t = 0.2;
  return { words: text.map((w) => { const s = t; t += 0.35 + w.length * 0.02; return { text: w, start: +s.toFixed(3), end: +(t - 0.05).toFixed(3) }; }) };
})();

test("words-to-srt captions: valid SRT, ≤22 chars per line, ≤2 lines, no split words", () => {
  const cues = buildCues(sampleWords);
  const srt = toSrt(cues);
  assert.deepEqual(validateSrt(srt), []);
  for (const c of cues) {
    assert.ok(c.lines.length <= 2, `too many lines: ${c.lines}`);
    for (const l of c.lines) assert.ok(l.length <= 22, `line too long: "${l}"`);
  }
  const all = cues.flatMap((c) => c.lines.join(" ").split(" "));
  assert.deepEqual(all, sampleWords.words.map((w) => w.text), "every word appears once, unbroken, in order");
});

test("words-to-srt words mode gives one cue per word with exact times", () => {
  const cues = buildCues(sampleWords, { mode: "words" });
  assert.equal(cues.length, sampleWords.words.length);
  assert.equal(cues[3].start, sampleWords.words[3].start);
  assert.deepEqual(validateSrt(toSrt(cues)), []);
});

test("wrapLines refuses text that needs a third line and never hyphenates", () => {
  assert.deepEqual(wrapLines(["Автоматизировать", "дальше"]), ["Автоматизировать", "дальше"]);
  assert.equal(wrapLines("раз два три четыре пять шесть семь восемь девять десять".split(" ")), null);
  assert.deepEqual(wrapLines(["Высокопроизводительный"]), ["Высокопроизводительный"]);
});

test("motion-broll words.py reads our JSON transcript with exact word times", () => {
  const dir = tmp();
  const p = join(dir, "t.json");
  writeFileSync(p, JSON.stringify(sampleWords));
  const r = spawnSync("python3", [join(ROOT, ".claude/skills/motion-broll/scripts/words.py"), p], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const first = r.stdout.trim().split(/\s+/)[0];
  assert.equal(first, `${sampleWords.words[0].start.toFixed(2)}:Сегодня`);
});

// ---------- glyphs ----------

test("glyph check passes Cyrillic in Geist and fails loudly on a Latin-only font", () => {
  assert.equal(checkGlyphs({ fonts: [GEIST], text: "Агенты экономят часы — «ёлка» №1…" }).ok, true);
  const bad = checkGlyphs({ fonts: [INTER_LATIN], text: "Agents экономят" });
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.some((m) => m.char === "э" && m.codepoint === "U+044D"));
  const cli = node(["scripts/ru/check-glyphs.mjs", "--font", INTER_LATIN, "--text", "Привет"]);
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /FAIL glyphs/);
  assert.equal(checkGlyphs({ fonts: [INTER_LATIN, GEIST], text: "Привет" }).ok, true, "a fallback font in the stack covers it");
});

// ---------- transcription cache ----------

test("transcribe-elevenlabs serves a cached response by SHA-256 without an API key", () => {
  const dir = tmp();
  const media = join(dir, "clip.wav");
  writeFileSync(media, Buffer.from("not really audio, only hashed"));
  const sha = createHash("sha256").update(readFileSync(media)).digest("hex");
  const cacheDir = join(dir, "cache");
  mkdirSync(cacheDir);
  writeFileSync(join(cacheDir, `${sha}.scribe_v2.ru.diarize.json`), JSON.stringify({ text: "кэш", words: [] }));
  const out = join(dir, "out.json");
  const env = { ...process.env, ELEVENLABS_API_KEY: "", ELEVEN_API_KEY: "", XI_API_KEY: "" };
  const r = node(["scripts/transcribe-elevenlabs.mjs", media, "--output", out, "--cache-dir", cacheDir], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cached/);
  assert.equal(JSON.parse(readFileSync(out, "utf8")).text, "кэш");
});

// ---------- fixture: detector + S2 against the reference ----------

test("fixture S1–S2: detector finds the hesitation and the retake; the clean cut matches the reference", { skip: !canSay && "needs macOS `say` with a ru_RU voice", timeout: 120000 }, () => {
  const fx = makeFixture();
  const expected = JSON.parse(readFileSync(join(fx.out, "expected.json"), "utf8"));
  const P = tmp();
  mkdirSync(join(P, "work"));
  let r = node(["scripts/ru/normalize-transcript.mjs", join(fx.out, "transcript.synthetic.json"), "--media", join(fx.out, "raw.mov"), "--out", join(P, "transcript.words.json")]);
  assert.equal(r.status, 0, r.stderr);
  r = node([".claude/skills/cut-silences/scripts/cut-silences.mjs", join(P, "transcript.words.json"), "--out-dir", join(P, "work")]);
  assert.equal(r.status, 0, r.stderr);
  r = node([".claude/skills/cut-mistakes/scripts/find-cut-candidates.mjs", join(P, "transcript.words.json"), "--out-dir", join(P, "work")]);
  assert.equal(r.status, 0, r.stderr);

  const cand = JSON.parse(readFileSync(join(P, "work/source.cut-candidates.json"), "utf8"));
  assert.equal(cand.language, "ru");
  const hes = cand.candidates.filter((c) => c.type === "hesitation");
  const ret = cand.candidates.filter((c) => c.type === "retake_marker");
  assert.equal(hes.length, 1, "exactly one hesitation");
  assert.equal(hes[0].recommend, "cut");
  assert.equal(ret.length, 1, "exactly one retake marker (chained «Стоп, ещё раз»)");
  assert.equal(ret[0].recommend, "cut");
  assert.match(ret[0].removes, /^Например, агенты экономят время\. Стоп, ещё раз\.$/);
  assert.ok(cand.candidates.some((c) => c.type === "filler" && c.recommend === "review"), "«Ну вот» is offered for review, not cut");

  r = node(["scripts/ru/build-edl.mjs", "--transcript", join(P, "transcript.words.json"), "--silence-edl", join(P, "work/source.silence-edl.json"),
    "--candidates", join(P, "work/source.cut-candidates.json"), "--accept", "recommended", "--video", join(fx.out, "raw.mov"), "--project", P]);
  assert.equal(r.status, 0, r.stderr);
  const clean = JSON.parse(readFileSync(join(P, "transcript.clean.json"), "utf8"));
  assert.equal(clean.text, expected.must_keep_text, "kept words equal the reference");
  for (let i = 1; i < clean.words.length; i++) {
    const gap = clean.words[i].start - clean.words[i - 1].end;
    assert.ok(gap <= expected.max_pause_after_clean, `pause ${gap.toFixed(2)}s before «${clean.words[i].text}»`);
  }
  const edl = JSON.parse(readFileSync(join(P, "EDL.json"), "utf8"));
  for (const m of expected.must_remove) {
    assert.ok(edl.delete_ranges.some((d) => d.start <= m.start + 0.01 && d.end >= m.end - 0.01), `«${m.text}» (${m.why}) is inside a cut`);
  }
  assert.ok(existsSync(join(P, "CUTS.md")));
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", join(P, "renders/clean.mp4")], { encoding: "utf8" });
  assert.ok(Math.abs(Number(probe.stdout) - edl.clean_duration) < 0.1, `clean.mp4 ${probe.stdout.trim()}s vs EDL ${edl.clean_duration}s`);
});

// ---------- delivery check ----------

test("check-reel passes a correctly encoded reel and fails an untagged one", { timeout: 120000 }, () => {
  const dir = tmp();
  const good = join(dir, "good.mp4");
  const bad = join(dir, "bad.mp4");
  const src = ["-f", "lavfi", "-i", "color=c=0x223344:s=1080x1920:r=30:d=1.5", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  let r = spawnSync("ffmpeg", ["-v", "error", "-y", ...src, "-shortest", "-c:v", "libx264", "-profile:v", "high", "-crf", "18", "-pix_fmt", "yuv420p",
    "-vf", "setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709",
    "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", good]);
  assert.equal(r.status, 0, r.stderr);
  r = spawnSync("ffmpeg", ["-v", "error", "-y", ...src, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-c:a", "aac", bad]);
  assert.equal(r.status, 0, r.stderr);

  const g = checkReel(good, { fps: 30 });
  assert.equal(g.ok, true, JSON.stringify(g.results.filter((x) => x.status === "FAIL")));
  assert.equal(g.results.find((x) => x.item === "loudness").status, "WARN", "silent track is a warning");
  assert.equal(topLevelAtoms(good).indexOf("moov") < topLevelAtoms(good).indexOf("mdat"), true);

  const b = checkReel(bad, { fps: 30 });
  assert.equal(b.ok, false);
  const failed = b.results.filter((x) => x.status === "FAIL").map((x) => x.item);
  for (const item of ["pix_fmt yuv420p", "faststart (moov before mdat)"]) assert.ok(failed.includes(item), `${item} should fail: ${failed}`);
});

// ---------- OpenAI whisper-1 provider ----------

test("normalizeTranscript reads OpenAI verbose_json and re-attaches punctuation from segments", () => {
  const raw = {
    _provider: "openai", language: "russian", duration: 4.2,
    text: "Агенты экономят время. Стоп, ещё раз.",
    segments: [{ text: " Агенты экономят время." }, { text: " Стоп, ещё раз." }],
    words: [
      { word: "Агенты", start: 0.1, end: 0.6 }, { word: "экономят", start: 0.65, end: 1.2 }, { word: "время", start: 1.25, end: 1.7 },
      { word: "Стоп", start: 2.3, end: 2.6 }, { word: "ещё", start: 2.7, end: 2.9 }, { word: "раз", start: 2.95, end: 3.2 },
    ],
  };
  const t = normalizeTranscript(raw, { duration: 4.2 });
  assert.equal(t.provider, "openai");
  assert.equal(t.language_code, "russian");
  assert.deepEqual(t.words.map((w) => w.text), ["Агенты", "экономят", "время.", "Стоп,", "ещё", "раз."]);
  assert.equal(t.words[2].key, "время");
});

test("scripts/ru/transcribe.mjs serves an OpenAI cache hit without a key", async () => {
  const { cacheKey, sha256File, RU_PROMPT, OPENAI_MODEL } = await import("../scripts/ru/transcribe.mjs");
  const dir = tmp();
  const media = join(dir, "clip.wav");
  writeFileSync(media, Buffer.from("hashed only"));
  const sha = await sha256File(media);
  const cacheDir = join(dir, "cache");
  mkdirSync(cacheDir);
  writeFileSync(join(cacheDir, `${cacheKey({ sha, provider: "openai", model: OPENAI_MODEL, language: "ru", prompt: RU_PROMPT })}.json`), JSON.stringify({ _provider: "openai", words: [] }));
  const out = join(dir, "raw.json");
  const r = node(["scripts/ru/transcribe.mjs", media, "--out", out, "--provider", "openai", "--cache-dir", cacheDir], { env: { ...process.env, OPENAI_API_KEY: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /cached \(no API call\)/);
  assert.equal(JSON.parse(readFileSync(out, "utf8"))._provider, "openai");
});

// ---------- S5 captions ----------

test("make-captions: every clean word lands in a cue, lines ≤22 chars, glyph-checked Cyrillic font", { skip: !canSay && "needs the fixture" }, async () => {
  const { makeCaptions, captionCues } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const fx = makeFixture();
  const P = tmp();
  mkdirSync(join(P, "work"));
  let r = node(["scripts/ru/normalize-transcript.mjs", join(fx.out, "transcript.synthetic.json"), "--media", join(fx.out, "raw.mov"), "--out", join(P, "transcript.clean.json")]);
  assert.equal(r.status, 0, r.stderr);
  writeFileSync(join(P, "meta.json"), JSON.stringify({ fps: 30 }));
  const t = JSON.parse(readFileSync(join(P, "transcript.clean.json"), "utf8"));
  const cues = captionCues(t, loadBrand());
  assert.deepEqual(cues.flatMap((c) => c.lines.flat().map((w) => w.text)), t.words.map((w) => w.text));
  for (const c of cues) {
    assert.ok(c.lines.length <= 2);
    for (const l of c.lines) assert.ok(l.map((w) => w.text).join(" ").length <= 22);
    assert.ok(c.end - c.start >= 0.05);
  }
  const res = makeCaptions(P);
  assert.equal(res.cues, cues.length);
  assert.deepEqual(validateSrt(readFileSync(join(P, "captions.srt"), "utf8")), []);
  const html = readFileSync(join(P, "captions/index.html"), "utf8");
  const b = loadBrand(), files = b.font_body.files;
  const fontFile = (files[String(b.captions.weight)] ?? Object.values(files).at(-1)).split("/").at(-1);
  assert.ok(html.includes(`@font-face{font-family:"ReelCaption";src:url("fonts/${fontFile}")`), `caption font is the brand body font ${fontFile}`);
  assert.match(html, /window\.__timelines\["captions"\]/);
});

test("brand fonts: kinetic accent and defaults come from brand.md font_serif", async () => {
  const { kineticConfig } = await import("../scripts/ru/make-captions.mjs");
  const { DEFAULT_BRAND } = await import("../scripts/ru/lib/brand.mjs");
  assert.equal(kineticConfig(DEFAULT_BRAND).accent_font, "brand/fonts/PlayfairDisplay-Italic-Variable.ttf");
  const custom = { ...DEFAULT_BRAND, font_serif: { italic: "brand/fonts/Spectral-SemiBoldItalic.ttf" } };
  assert.equal(kineticConfig(custom).accent_font, "brand/fonts/Spectral-SemiBoldItalic.ttf");
  assert.equal(kineticConfig(custom, { kinetic: { accent_font: "x.ttf" } }).accent_font, "x.ttf", "PLAN override wins");
  for (const p of [DEFAULT_BRAND.font_serif.italic, DEFAULT_BRAND.font_serif.display]) assert.ok(existsSync(join(ROOT, p)), p);
});

test("make-captions: PLAN.json overrides hide windows and move the baseline", async () => {
  const { applyHide, baselineAt, captionsHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const cue = (start, end, text = "слово") => ({ start, end, lines: [[{ text, start, end }]] });
  // fully hidden → dropped; straddling the end → trimmed to the window end
  const kept = applyHide([cue(0, 2), cue(4, 6), cue(8, 9)], [{ in: 0, out: 4.6 }]);
  assert.deepEqual(kept.map((c) => [c.start, c.end]), [[4.6, 6], [8, 9]]);
  assert.equal(applyHide([cue(1, 2)]).length, 1);

  const keys = [{ at: 10, baseline_y: 1410 }, { at: 10.5, baseline_y: 980 }, { at: 20, baseline_y: 980 }, { at: 20.5, baseline_y: 1410 }];
  assert.equal(baselineAt(keys, 5, 1410), 1410);
  assert.equal(baselineAt(keys, 15, 1410), 980);
  assert.equal(baselineAt(keys, 30, 1410), 1410);
  assert.equal(baselineAt(keys, 10.25, 1410), 1195);

  const brand = loadBrand();
  const lineH = Math.round(brand.captions.font_px * 1.3);
  const html = captionsHtml([cue(12, 13), cue(19.5, 21)], { duration: 22, brand, fontUrl: "f.ttf", overrides: { baseline_keys: keys } });
  assert.match(html, new RegExp(`id="c0"[^>]*top:${980 - lineH}px`));
  assert.match(html, /tl\.to\("#c1",\{y:430,duration:0\.5,ease:"power3\.inOut"\},20\);/);
  // no overrides → brand baseline, no y tweens
  const plain = captionsHtml([cue(12, 13)], { duration: 22, brand, fontUrl: "f.ttf" });
  assert.match(plain, new RegExp(`top:${brand.captions.baseline_y - lineH}px`));
  assert.doesNotMatch(plain, /tl\.to\("#c0",\{y:/);
});

test("make-captions kinetic: 1–3 word groups, prepositions carried, accents, forced breaks, themes", async () => {
  const { kineticGroups, kineticConfig, kineticHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const text = "Твой Claude Code умеет разбирать любое приложение у тебя на компьютере. И бесплатно. Это REA Reverse Engineer";
  let t = 0;
  const words = text.split(" ").map((w) => { const x = { text: w, start: +t.toFixed(2), end: +(t + 0.3).toFixed(2), type: "word" }; t += 0.34 + (/[.]$/.test(w) ? 0.5 : 0); return x; });
  const brand = loadBrand();
  const ov = { style: "kinetic", kinetic: { accent_words: ["бесплатно"], breaks: [words.find((w) => w.text === "Reverse").start], theme_keys: [{ at: words.find((w) => w.text === "И").start - 0.01, theme: "dark" }], y_keys: [{ at: 0, y: 1000 }] } };
  const k = kineticConfig(brand, ov);
  const g = kineticGroups({ words }, k, ov);
  const lines = g.map((c) => c.lines[0].map((w) => w.text).join(" "));
  assert.deepEqual(lines.flatMap((l) => l.split(" ")), words.map((w) => w.text.replace(/[.,;:]+$/, "")), "every word, in order");
  for (const l of lines) assert.ok(l.split(" ").length <= 3 && (l.length <= k.max_chars || !l.includes(" ")), l);
  for (const c of g) assert.ok(!["у", "на", "и", "в"].includes(c.lines[0].at(-1).text.toLowerCase()) || c.lines[0].length === 1, "no group ends on a preposition");
  assert.ok(lines.includes("Reverse Engineer"), "forced break starts a group");
  assert.ok(g.find((c) => c.lines[0].some((w) => w.text === "бесплатно")).lines[0].find((w) => w.text === "бесплатно").accent);
  assert.equal(g[0].start, 0);
  for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].end <= g[i].start + 1e-9, "groups never overlap");
  const html = kineticHtml(g, { duration: t + 1, brand, fontUrl: "a.ttf", accentUrl: "b.ttf", overrides: ov });
  assert.match(html, /class="kg light clip"[^>]*top:955px/);
  assert.match(html, /class="kg dark clip"/);
  assert.match(html, /class="w acc"[^>]*>бесплатно</);
  assert.match(html, /window\.__timelines\["captions"\]/);
  assert.equal(k.light.accent, brand.accent);
});

test("screen kit: recording → frames + manifest; build.py embeds kit, brand and Cyrillic fonts", () => {
  const d = tmp();
  const rec = join(d, "rec.mp4");
  let r = spawnSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-t", "1", "-pix_fmt", "yuv420p", rec], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  r = node(["scripts/ru/broll/screen-frames.mjs", rec, join(d, "screens", "term"), "--to", "0.5", "--width", "320"]);
  assert.equal(r.status, 0, r.stderr);
  const man = JSON.parse(r.stdout);
  assert.equal(man.n, 15);
  assert.equal(man.w, 320);
  assert.match(readFileSync(join(d, "screens", "term", "manifest.js"), "utf8"), /\(window\.SKF=window\.SKF\|\|\{\}\)\["term"\]=\{"n":15,/);
  mkdirSync(join(d, "clips"));
  writeFileSync(join(d, "clips", "01-x.html"), "<title>x</title><script>SK.run({T:1, media:{a:{frames:'../screens/term'}}, shots:[[0,'a',[0,0,320]]]});</script>");
  r = spawnSync("python3", ["scripts/ru/broll/build.py", join(d, "dist"), join(d, "clips", "01-x.html")], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(d, "dist", "01-x.html"), "utf8");
  assert.match(html, /window\.SK=\{BRAND:\{"accent":/);
  assert.match(html, /BASE:"\.\.\/clips\/"/);
  assert.match(html, /font-family:'SK Serif'/);
  assert.ok(html.indexOf("SK.run = ") < html.indexOf("SK.run({T:1"), "kit before the fragment");
  for (const f of ["render.js", "beats.js"]) assert.match(readFileSync(join(ROOT, ".claude/skills/motion-broll/engine", f), "utf8"), /window\.READY/);
});

test("refineWithSilences trims words whisper stretched over a long pause", async () => {
  const { refineWithSilences } = await import("../scripts/ru/normalize-transcript.mjs");
  const words = [
    { text: "Он", start: 31.92, end: 32.64 },         // real onset 32.55 after 0.63 s of silence
    { text: "Шаг", start: 45.5, end: 45.8 },
    { text: "шагом.", start: 46.08, end: 47.7 },      // real end 46.43, then 1.3 s of silence inside «the word»
  ];
  const silences = [{ start: 30.0, end: 32.55 }, { start: 32.66, end: 45.48 }, { start: 46.41, end: 50.9 }];
  const { words: w } = refineWithSilences(words, silences);
  assert.ok(Math.abs(w[0].start - 32.53) < 0.011, `start ${w[0].start}`);
  assert.ok(Math.abs(w[2].end - 46.43) < 0.011, `end ${w[2].end}`);
  // the same silences no longer than maxShift behave as before
  const short = refineWithSilences([{ text: "да", start: 10.0, end: 10.9 }], [{ start: 10.5, end: 10.7 }]).words[0];
  assert.equal(short.end, 10.52);
});

test("refineWithSilences pulls late whisper starts back to the speech onset and closes silence-free gaps", async () => {
  const { refineWithSilences } = await import("../scripts/ru/normalize-transcript.mjs");
  const words = [
    { text: "агентов.", start: 2.5, end: 3.1 },
    { text: "Агенты", start: 6.3, end: 6.8 },    // real onset 5.9 after a pause
    { text: "берут", start: 7.4, end: 7.8 },     // whisper hole 6.8–7.4, real speech continuous
  ];
  const silences = [{ start: 3.12, end: 5.9 }];
  const { words: w } = refineWithSilences(words, silences);
  assert.ok(Math.abs(w[1].start - 5.88) < 0.011, `start ${w[1].start}`);
  assert.equal(w[2].start, 6.81, "gap without silence under it is closed");
  assert.equal(w[0].end, 3.14, "end snapped to the silence start");
});

test("build-edl snaps cut boundaries to word edges and restores sentence case", async () => {
  const { snapCutToWords, sentenceCase } = await import("../scripts/ru/build-edl.mjs");
  const words = [{ text: "раз.", start: 13.54, end: 14.04 }, { text: "Например,", start: 14.736, end: 15.26 }];
  assert.equal(snapCutToWords({ start: 9.42, end: 14.74 }, words).end, 14.736, "end inside the next word's head moves to its start");
  assert.equal(snapCutToWords({ start: 14.0, end: 14.5 }, words).start, 14.04, "start inside a tail moves to the word end");
  const fixed = sentenceCase([{ text: "агентов." }, { text: "агенты" }, { text: "«пишите»" }].map((w, i, a) => (i === 2 ? { text: "«пишите»" } : w)));
  assert.deepEqual(fixed.map((w) => w.text), ["Агентов.", "Агенты", "«пишите»"]);
  assert.deepEqual(sentenceCase([{ text: "рутину." }, { text: "«пишите»" }]).map((w) => w.text), ["Рутину.", "«Пишите»"]);
});

test("words-to-srt breaks an overflowing cue at a phrase boundary, not mid-phrase", () => {
  const text = "То есть, теперь математика под угрозой, потому что теперь математикам нужно проверить";
  const words = text.split(" ").map((t, i) => ({ text: t, start: i * 0.3, end: i * 0.3 + 0.25, type: "word" }));
  const cues = buildCues({ words }, { maxCue: 10 });
  const joined = cues.map((c) => c.lines.join(" "));
  for (const c of joined) {
    assert.ok(!/ под$/.test(c), `cue ends on a preposition: "${c}"`);
    assert.ok(!/потому$/.test(c), `«потому что» split across cues: "${c}"`);
  }
  assert.ok(joined.some((c) => c.startsWith("под угрозой")), joined.join(" | "));
});

test("assemble: base picture comes from broll/plan.json video, else clean.mp4", async () => {
  const { basePicture } = await import("../scripts/ru/assemble.mjs");
  const P = mkdtempSync(join(tmpdir(), "reel-base-"));
  mkdirSync(join(P, "renders")); mkdirSync(join(P, "broll"));
  writeFileSync(join(P, "renders/clean.mp4"), "");
  assert.equal(basePicture(P, { clips: [] }), join(P, "renders/clean.mp4"));
  assert.throws(() => basePicture(P, { video: "../renders/picture.mp4", clips: [] }), /picture\.mp4 missing/);
  writeFileSync(join(P, "renders/picture.mp4"), "");
  assert.equal(basePicture(P, { video: "../renders/picture.mp4", clips: [] }), join(P, "renders/picture.mp4"));
});

test("build-edl: --max-pause widens silence cuts without entering words", async () => {
  const { tightenPauses } = await import("../scripts/ru/build-edl.mjs");
  const words = [{ text: "а", start: 0.2, end: 1.0 }, { text: "б", start: 3.0, end: 3.5 }, { text: "в", start: 3.62, end: 4.0 }];
  const cuts = [{ start: 0, end: 0.1, reasons: ["head"] }, { start: 1.13, end: 2.89, reasons: ["pause"] }];
  const [head, mid] = tightenPauses(cuts, words, 0.12);
  assert.deepEqual([head.start, head.end], [0, 0.1]);           // head trim untouched
  assert.ok(Math.abs(mid.start - 1.066) < 1e-9 && Math.abs(mid.end - 2.946) < 1e-9);
  assert.ok(mid.start >= 1.0 && mid.end <= 3.0);                   // never inside a word
  assert.equal(tightenPauses(cuts, words, NaN), cuts);             // option off → unchanged
  // a pause already shorter than the limit stays as it is
  assert.deepEqual(tightenPauses([{ start: 1.05, end: 2.95, reasons: [] }], words, 0.12)[0], { start: 1.05, end: 2.95, reasons: [] });
});

test("fx_picture --validate: joins come from EDL.json, a location join off a cut is an error", () => {
  const P = mkdtempSync(join(tmpdir(), "reel-fx-"));
  mkdirSync(join(P, "fx"));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ source_duration: 10, delete_ranges: [
    { start: 0, end: 0.5 }, { start: 3, end: 4 }, { start: 6, end: 6.5 }, { start: 9.5, end: 10 }] }));
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ location_joins: [2.5, 3.0], camera: [[0, 2.5, 1, 1.05, 540, 600]] }));
  let r = spawnSync("python3", ["scripts/ru/fx/fx_picture.py", P, "--validate"], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stdout, /ERROR location_join 3 is not an EDL join/);
  assert.match(r.stdout, /joins \[2\.5, 4\.5\]/);
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ location_joins: [2.5, 4.5] }));
  r = spawnSync("python3", ["scripts/ru/fx/fx_picture.py", P, "--validate"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("fx_picture relocate: the speaker moves down, no ghost stays in the room, titles may not overlap", () => {
  const P = mkdtempSync(join(tmpdir(), "reel-reloc-"));
  mkdirSync(join(P, "fx"));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ source_duration: 10, delete_ranges: [] }));
  writeFileSync(join(P, "title.mov"), "");
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ relocate: [{ t0: 1, t1: 5 }], titles: [{ t0: 4, reveal: [4.5, 6], layer: "title.mov" }] }));
  let r = spawnSync("python3", ["scripts/ru/fx/fx_picture.py", P, "--validate"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ERROR relocate 1–5 overlaps a title moment/);
  const py = `
import sys, types; sys.path.insert(0, "scripts/ru/fx"); import numpy as np; import fx_picture as F
from PIL import Image, ImageDraw
img = Image.new("RGB", (F.W, F.H), (90, 160, 90)); m = Image.new("L", (F.W, F.H), 0)
for im, c in ((ImageDraw.Draw(img), (220, 30, 30)), (ImageDraw.Draw(m), 255)):
    im.ellipse([390, 230, 690, 560], fill=c); im.rectangle([200, 520, 880, F.H], fill=c)   # head + body, top at y 230
fake = types.SimpleNamespace(split_k=lambda R, t: 1.0, mask_dir=lambda d, f: m)
R = {"t0": 0, "t1": 9, "_dir": "", "_dy": 0.57 * F.H - 230}
a = np.asarray(F.Picture.relocate_frame(fake, img, R, 0, 1.0), np.float32)
red = lambda y0, y1: float(((a[y0:y1, :, 0] > 170) & (a[y0:y1, :, 1] < 80)).mean())
print(round(red(240, 900), 3), round(red(1180, 1400), 3))
`;
  r = spawnSync("python3", ["-c", py], { encoding: "utf8", cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  const [ghost, moved] = r.stdout.trim().split(" ").map(Number);
  assert.ok(ghost < 0.005, `speaker left in the room: ${ghost}`);
  assert.ok(moved > 0.1, `speaker not found lower: ${moved}`);
});

test("fx sfx: whoosh waits for the last word, a sound inside a word is flagged", () => {
  const P = mkdtempSync(join(tmpdir(), "reel-sfx-"));
  mkdirSync(join(P, "fx"));
  writeFileSync(join(P, "transcript.clean.json"), JSON.stringify({ audio_duration_secs: 3, words: [
    { text: "Привет,", start: 0.2, end: 0.9 }, { text: "мир.", start: 1.05, end: 1.5 }, { text: "Снова", start: 1.7, end: 2.3 }] }));
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ location_joins: [1.55], sfx: [
    { name: "клик в слове", kind: "click", word: "привет", offset: 0.3, gain: 0.1 },
    { name: "клик после", kind: "click", word: "мир", offset: 0.5, gain: 0.1 }] }));
  const r = spawnSync("python3", ["scripts/ru/fx/sfx.py", P], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /WARN клик в слове: 0\.50 is inside the word «Привет,»/);
  assert.doesNotMatch(r.stdout, /клик после/);
  const log = JSON.parse(readFileSync(join(P, "fx/sfx.json"), "utf8"));
  const wh = log.find((e) => e.name.startsWith("переход"));
  assert.ok(wh.t >= 1.5 + 0.03 - 1e-9, `whoosh at ${wh.t} starts before «мир.» ends`);
  assert.ok(existsSync(join(P, "fx/sfx.wav")));
});

test("sound.py: voice dips at joins, music ducks under speech, a stop-down returns on a downbeat", { timeout: 120000 }, () => {
  const P = mkdtempSync(join(tmpdir(), "sound-"));
  mkdirSync(join(P, "renders")); mkdirSync(join(P, "fx"));
  const ff = (...a) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status, 0);
  ff("-f", "lavfi", "-i", "color=c=gray:s=108x192:r=30:d=3", "-f", "lavfi", "-i", "sine=f=220:d=3:sample_rate=48000", "-shortest", "-c:v", "libx264", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "aevalsrc=0.8*sin(2*PI*55*t)*exp(-25*mod(t-0.1\\,0.5))*gte(t\\,0.1):s=48000:d=8", join(P, "music.wav"));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 1.5 }, { start: 4, end: 5.5 }] }));
  writeFileSync(join(P, "transcript.clean.json"), JSON.stringify({ audio_duration_secs: 3, words: [
    { text: "раз", start: 0.2, end: 0.9 }, { text: "два", start: 1.7, end: 2.2 }, { text: "три", start: 2.4, end: 2.8 }] }));
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ sound: { sfx: "none.wav", music: { src: "music.wav", bpm: 120,
    stops: [{ word: "два", lead: 0.1, back_word: "три" }], fade_out: 0.2 } } }));
  const r = spawnSync("python3", [join(ROOT, "scripts/ru/fx/sound.py"), P], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(readFileSync(join(P, "fx/sound.json"), "utf8"));
  assert.equal(rep.voice.joins_faded, 1);
  assert.ok(Math.abs(rep.music.bpm - 120) < 1, `bpm ${rep.music.bpm}`);
  assert.ok(rep.music.under_speech_db_vs_voice < rep.music.between_phrases_db_vs_voice - 4, JSON.stringify(rep.music));
  const back = rep.music.segments.at(-1);                       // [clean t, track t] after the stop
  assert.equal(back[0], 2.4);
  const bars = (back[1] - rep.music.phase_s) / (4 * 60 / rep.music.bpm), frac = bars - Math.round(bars);
  assert.ok(Math.abs(frac) < 0.02, `restart at ${back[1]} is ${frac.toFixed(3)} bar off the downbeat`);
  assert.ok(existsSync(join(P, "fx/mix.wav")));
});

test("export-reel --audio replaces the soundtrack of a silent picture", { timeout: 120000 }, async () => {
  const { exportReel } = await import("../scripts/ru/export-reel.mjs");
  const d = mkdtempSync(join(tmpdir(), "exp-"));
  const ff = (...a) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...a]).status, 0);
  ff("-f", "lavfi", "-i", "color=c=gray:s=1080x1920:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(d, "pic.mp4"));
  ff("-f", "lavfi", "-i", "sine=f=330:d=2:sample_rate=48000", "-ac", "2", join(d, "mix.wav"));
  exportReel(join(d, "pic.mp4"), join(d, "out.mp4"), { audio: join(d, "mix.wav"), check: false });
  const v = spawnSync("ffmpeg", ["-hide_banner", "-i", join(d, "out.mp4"), "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(v.stderr)?.[1]);
  assert.ok(mean > -30, `mean volume ${mean} dB — the silent fallback track was used`);
});

test("fx_picture: face track is smoothed per shot, eye-match meets halfway and never uncovers the frame", () => {
  const py = `
import sys, numpy as np
sys.path.insert(0, "scripts/ru/fx"); import fx_picture as F
v = np.array([[100.0]] * 30 + [[900.0]] * 30)
s = F.smooth_track(v, [30])
assert s[29, 0] == 100 and s[30, 0] == 900, "smoothing leaked across the cut"
p = F.Picture.__new__(F.Picture)
j = 1.0
p.cfg = {"location_joins": [j], "camera": [[0.0, 2.0, 1.0, 1.04, 540, 960]]}
p.titles, p.follow, p.eye = [], True, True
face = np.zeros((60, 3)); face[:30] = [700, 600, 300]; face[30:] = [420, 1150, 600]
p.face = face
for f in range(0, 60):
    t = f / 30; S, tx, ty = p.transform(t)
    assert S <= 1.45 + 1e-6, (t, S)
    assert tx <= 1e-6 and ty <= 1e-6 and S * F.W + tx >= F.W - 1e-6 and S * F.H + ty >= F.H - 1e-6, ("uncovered", t, S, tx, ty)
def face_on_screen(t):
    S, tx, ty = p.transform(t); fx, fy, _ = p.face_at(t); return np.array([S * fx + tx, S * fy + ty])
a, b = face_on_screen(j - 1 / 30), face_on_screen(j)
assert np.linalg.norm(a - b) < 0.35 * np.linalg.norm(face[0, :2] - face[59, :2]), ("faces do not meet", a, b)
print("ok")
`;
  const r = spawnSync("python3", ["-c", py], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test("fx_picture: the clean plate hides the person, the whip shifts without wrapping, impact is local in time", () => {
  const py = `
import sys, numpy as np
sys.path.insert(0, "scripts/ru/fx"); import fx_picture as F
from PIL import Image
a = np.zeros((F.H, F.W, 3), np.float32); a[..., 2] = 200          # blue room
m = np.zeros((F.H, F.W), np.float32); m[600:1400, 300:780] = 1    # the person
a[m > 0] = [220, 30, 30]                                            # red person
plate = F.fill_person(a, m)
assert plate[1000, 540, 0] < 60 and plate[1000, 540, 2] > 150, plate[1000, 540]
s = F.hshift_blur(a, 200, 0, n=1)
assert s[100, 100].sum() == 0 and s[100, 300, 2] == 200, "shift must leave black, not wrap"
p = F.Picture.__new__(F.Picture); p.impacts = [(1.0, 1.0)]
im = Image.fromarray(a.astype(np.uint8))
assert p.impact(im, 0.9) is im and p.impact(im, 1.3) is im and p.impact(im, 1.02) is not im
print("ok")
`;
  const r = spawnSync("python3", ["-c", py], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

// ---------- /remake ----------

import { readStatus, nextStage, writeStatus } from "../scripts/ru/status.mjs";
import { contactSheets } from "../scripts/ru/contact-sheet.mjs";
import { speechStats } from "../scripts/ru/ref-intake.mjs";

test("remake projects get their own stages R0–R4", () => {
  const d = tmp();
  const s = readStatus(d, { kind: "remake" });
  assert.deepEqual(Object.keys(s.stages), ["R0", "R1", "R2", "R3", "R4"]);
  s.stages.R0.state = "done";
  assert.equal(nextStage(s), "R1");
  writeStatus(d, s);
  assert.match(readFileSync(join(d, "STATUS.md"), "utf8"), /R3 Адаптация → ГЕЙТ R/);
  assert.deepEqual(Object.keys(readStatus(tmp()).stages).slice(0, 2), ["S0", "S1"], "reels keep S0–S8");
});

test("speechStats: pace and pauses between words", () => {
  const w = (start, end) => ({ text: "x", start, end });
  const s = speechStats([w(0.2, 0.5), w(0.5, 0.9), w(1.4, 1.8), w(1.9, 2.2)], 3);
  assert.equal(s.words, 4);
  assert.equal(s.first_word_at, 0.2);
  assert.equal(s.words_per_second, 2);
  assert.deepEqual(s.gaps.map((g) => g.dur), [0.5], "only pauses ≥ 0.25 s");
});

test("ref-intake: three shots, label-only sheets, remake status, --gaps", { timeout: 120000 }, async () => {
  const d = tmp();
  const ref = join(d, "their-reel.mp4");
  // Three flat colours, one second each; a tone with a silent middle second.
  const r = spawnSync("ffmpeg", ["-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "color=c=green:s=360x640:r=30:d=1",
    "-f", "lavfi", "-i", "sine=f=440:d=3",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a]volume='if(between(t,1,2),0,1)':eval=frame[a]",
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", ref]);
  assert.equal(r.status, 0, String(r.stderr));
  const out = node(["scripts/ru/ref-intake.mjs", ref, "--slug", "their-reel", "--date", "2026-01-01", "--projects-dir", d, "--every", "1"]);
  assert.equal(out.status, 0, out.stderr);
  const P = join(d, "2026-01-01-remake-their-reel");
  const j = JSON.parse(readFileSync(join(P, "REF.json"), "utf8"));
  assert.deepEqual(j.shots.map((s) => Math.round(s.start)), [0, 1, 2]);
  assert.equal(j.rhythm.shots, 3);
  assert.ok(j.audio.silences_over_0_25s >= 1, "the silent second is found");
  assert.ok(existsSync(join(P, "review/ref-every.png")) && existsSync(join(P, "review/ref-shots.png")));
  assert.ok(existsSync(join(P, "assets/ref.mp4")));
  const s = JSON.parse(readFileSync(join(P, "STATUS.json"), "utf8"));
  assert.equal(s.kind, "remake");
  assert.equal(s.stages.R0.state, "done");
  assert.equal(node(["scripts/ru/status.mjs", P, "--next"]).stdout.trim(), "R1");
  assert.equal(node(["scripts/ru/ref-intake.mjs", ref, "--slug", "their-reel", "--date", "2026-01-01", "--projects-dir", d]).status, 1, "refuses to overwrite");

  // Words before and after the silent second → the pause measures as silence.
  writeFileSync(join(P, "transcript.words.json"), JSON.stringify({ language_code: "en", words: [
    { text: "one", start: 0.1, end: 1.0 }, { text: "two", start: 2.0, end: 2.9 },
  ] }));
  const g = node(["scripts/ru/ref-intake.mjs", "--gaps", P]);
  assert.equal(g.status, 0, g.stderr);
  const j2 = JSON.parse(readFileSync(join(P, "REF.json"), "utf8"));
  assert.equal(j2.speech.words, 2);
  assert.equal(j2.audio.gaps.count, 1);
  assert.ok(j2.audio.gaps.median_db < -50, `silent pause, got ${j2.audio.gaps.median_db}`);
  assert.match(j2.audio.gaps.verdict, /музыки под голосом, скорее всего, нет/);
});

test("contact sheet window: --from/--to keep only that stretch", { timeout: 60000 }, async () => {
  const d = tmp();
  const v = join(d, "v.mp4");
  assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=180x320:r=30:d=4", "-pix_fmt", "yuv420p", v]).status, 0);
  const r = await contactSheets(v, { out: join(d, "s.png"), from: 1, to: 2, every: 0.5, zones: "label", width: 90 });
  assert.deepEqual(r.times, [1, 1.5, 2]);
});

test("intake --remake refuses a remake without an approved SCRIPT.md", () => {
  const d = tmp();
  writeFileSync(join(d, "raw.mov"), "");
  const r = node(["scripts/ru/intake.mjs", join(d, "raw.mov"), "--slug", "never-created", "--date", "1999-01-01", "--remake", d]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no SCRIPT\.md/);
  assert.ok(!existsSync(join(ROOT, "video-projects/1999-01-01-never-created")));
});
