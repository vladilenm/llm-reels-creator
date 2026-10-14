#!/usr/bin/env node
// Synthetic Russian talking-head reel for tests and dry runs (macOS only: `say`).
//
// Every word is synthesized separately with the Russian voice, its leading and
// trailing silence trimmed, then laid out sample-accurately with known pauses.
// So the word timings are exact and the fixture doubles as ground truth:
//
//   <out>/raw.mov                      1080x1920, 30 fps, solid background + a
//                                      "speaker" block where a face would be
//   <out>/transcript.synthetic.json    ElevenLabs-shaped response (word + spacing
//                                      tokens) — what S1 would return if Scribe
//                                      transcribed perfectly
//   <out>/expected.json                reference: what S2 must remove and keep
//
// Usage: node scripts/ru/make-ru-fixture.mjs [--out fixtures/out/ru-agents] [--force]

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RATE = 48000;
const WORD_GAP = 0.07;

// The script. Strings are words (display form, punctuation attached); numbers
// are explicit pauses in seconds. `tag` marks words the reference expects cut.
export const SCRIPT = [
  0.8,
  "Сегодня", "расскажу", "про", "умных", "агентов.",
  1.2,
  { w: "Э-э-э…", say: "Эээ", tag: "hesitation" },
  0.4,
  "Агенты", "берут", "на", "себя", "рутину.",
  0.9,
  { w: "Например,", tag: "retake" }, { w: "агенты", tag: "retake" }, { w: "экономят", tag: "retake" }, { w: "время.", tag: "retake" },
  0.6,
  { w: "Стоп,", tag: "retake" }, { w: "ещё", tag: "retake" }, { w: "раз.", tag: "retake" },
  0.7,
  "Например,", "агенты", "экономят", "часы", "каждую", "неделю.",
  1.5,
  "Ну", "вот,", "пишите", "в", "комментарии,", "что", "автоматизировать", "дальше.",
  1.0,
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.encoding ?? "utf8", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(" ")}… failed: ${r.stderr?.toString().slice(-400)}`);
  return r;
}

export function hasRussianVoice(voice = "Milena") {
  const r = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  return r.status === 0 && new RegExp(`^${voice}\\s+ru_RU`, "m").test(r.stdout);
}

function synthWord(text, voice, tmp, i) {
  const aiff = join(tmp, `w${i}.aiff`);
  run("say", ["-v", voice, "-o", aiff, text]);
  // Trim silence at both ends (reverse trick), output raw mono s16le @ 48 kHz.
  const trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse";
  const r = run("ffmpeg", ["-v", "error", "-i", aiff, "-af", trim, "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { encoding: "buffer" });
  return r.stdout;
}

export function makeFixture({ out = join(ROOT, "fixtures/out/ru-agents"), voice = "Milena", force = false } = {}) {
  out = resolve(out);
  const done = ["raw.mov", "transcript.synthetic.json", "expected.json"].every((f) => existsSync(join(out, f)));
  if (done && !force) return { out, cached: true };
  mkdirSync(out, { recursive: true });
  const tmp = join(tmpdir(), `ru-fixture-${process.pid}`);
  mkdirSync(tmp, { recursive: true });

  const chunks = [];
  const words = [];
  let t = 0; // seconds
  const pushSilence = (sec) => { const n = Math.round(sec * RATE); chunks.push(Buffer.alloc(n * 2)); t += n / RATE; };
  let prevWasWord = false;
  SCRIPT.forEach((item, i) => {
    if (typeof item === "number") { pushSilence(item); prevWasWord = false; return; }
    const w = typeof item === "string" ? { w: item } : item;
    if (prevWasWord) pushSilence(WORD_GAP);
    const pcm = synthWord(w.say ?? w.w.replace(/[.,!?…]+$/u, ""), voice, tmp, i);
    const start = t;
    chunks.push(pcm);
    t += pcm.length / 2 / RATE;
    words.push({ text: w.w, start: +start.toFixed(3), end: +t.toFixed(3), tag: w.tag ?? null });
    prevWasWord = true;
  });
  const pcmPath = join(tmp, "voice.s16le");
  writeFileSync(pcmPath, Buffer.concat(chunks));
  const duration = +t.toFixed(3);

  // Video: dark background, a lighter "speaker" block in the lower-middle third
  // (where a face would sit), 1080x1920 @ 30, H.264 + AAC in a .mov like a phone.
  run("ffmpeg", [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `color=c=0x1d2433:s=1080x1920:r=30:d=${duration}`,
    "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", pcmPath,
    "-vf", "drawbox=x=290:y=620:w=500:h=640:color=0x7a8599:t=fill,drawbox=x=390:y=700:w=300:h=300:color=0xc9b8a6:t=fill",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-shortest", join(out, "raw.mov"),
  ]);

  // ElevenLabs-shaped response: word tokens with spacing tokens between them.
  const elWords = [];
  words.forEach((w, i) => {
    if (i) elWords.push({ text: " ", start: words[i - 1].end, end: w.start, type: "spacing", speaker_id: "speaker_0", logprob: 0 });
    elWords.push({ text: w.text, start: w.start, end: w.end, type: "word", speaker_id: "speaker_0", logprob: 0 });
  });
  const synthetic = {
    language_code: "rus",
    language_probability: 1,
    text: words.map((w) => w.text).join(" "),
    audio_duration_secs: duration,
    words: elWords,
    _fixture: "synthetic: exact word timings from per-word `say` synthesis, not an ASR result",
  };
  writeFileSync(join(out, "transcript.synthetic.json"), JSON.stringify(synthetic, null, 2) + "\n");

  const expected = {
    duration,
    must_remove: words.filter((w) => w.tag).map((w) => ({ text: w.text, start: w.start, end: w.end, why: w.tag })),
    must_keep_text: words.filter((w) => !w.tag).map((w) => w.text).join(" "),
    long_pauses: SCRIPT.map((x, i) => ({ x, i })).filter(({ x }) => typeof x === "number" && x >= 0.6).length,
    max_pause_after_clean: 0.6,
    note: "Filler «Ну вот,» is review-only and is expected to stay in an auto run.",
  };
  writeFileSync(join(out, "expected.json"), JSON.stringify(expected, null, 2) + "\n");
  rmSync(tmp, { recursive: true, force: true });
  return { out, cached: false, duration, words: words.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const o = { force: a.includes("--force") };
  const i = a.indexOf("--out");
  if (i >= 0) o.out = a[i + 1];
  if (!hasRussianVoice()) { console.error("No ru_RU voice «Milena» for `say`. Install it in System Settings → Accessibility → Spoken Content."); process.exit(1); }
  console.log(JSON.stringify(makeFixture(o), null, 2));
}
