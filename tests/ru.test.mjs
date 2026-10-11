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
