#!/usr/bin/env node
// ElevenLabs Scribe or OpenAI whisper-1 (verbose_json) response -> chassis word transcript.
//
//   { text, language_code, audio_duration_secs, words: [{ text, start, end, type: "word", key }] }
//
// Times are seconds in the source. Duration comes from ffprobe on the media
// (the API value is ignored when the media is given). Spacing tokens and audio
// events are dropped. `key` is the comparison form (lowercase, ё→е, no
// punctuation); `text` is left exactly as the provider returned it.
//
// With --media, word edges are snapped to the audio: whisper-1 places a word's
// start up to ~0.45 s LATE after a pause (measured on the fixture), and a cut that
// trusts it clips the first syllable. ffmpeg silencedetect finds where speech
// really resumes/stops; starts move to the silence end, ends to the silence start
// (only within 0.6 s, never across a neighbour). `--no-refine` disables it.
//
// Usage:
//   node scripts/ru/normalize-transcript.mjs <transcript.raw.json> [--media <video>] [--out <path>] [--noise -40] [--no-refine]

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normKey, cyrillicShare } from "./lib/text.mjs";

export function probeDuration(media) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", media], { encoding: "utf8" });
  const d = Number(r.stdout?.trim());
  if (r.status !== 0 || !Number.isFinite(d)) throw new Error(`ffprobe could not read duration of ${media}`);
  return d;
}

// OpenAI whisper-1 verbose_json: words are bare ({ word, start, end }); the
// punctuation lives in segments[].text. Re-attach it by walking the segment
// tokens in order and matching comparison keys.
export function punctuateFromSegments(words, segments) {
  const tokens = (segments ?? []).flatMap((s) => String(s.text ?? "").trim().split(/\s+/).filter(Boolean));
  const out = words.map((w) => ({ ...w }));
  let j = 0;
  for (const w of out) {
    const k = normKey(w.word ?? w.text);
    if (!k) continue;
    for (let look = j; look < Math.min(tokens.length, j + 4); look++) {
      if (normKey(tokens[look]) === k) { w.text = tokens[look]; j = look + 1; break; }
    }
  }
  return out;
}

export function normalizeTranscript(raw, { duration } = {}) {
  if (!raw || !Array.isArray(raw.words)) throw new Error("transcript has no words[]");
  const isOpenAI = raw._provider === "openai" || (raw.words[0] && "word" in raw.words[0] && !("text" in raw.words[0]));
  const source = isOpenAI ? punctuateFromSegments(raw.words, raw.segments) : raw.words;
  const words = [];
  let lastEnd = 0;
  for (const w of source) {
    if (w.type && w.type !== "word") continue; // spacing, audio_event
    const text = String(w.text ?? w.word ?? "").trim();
    if (!text) continue;
    const key = normKey(text);
    if (!key) continue; // punctuation-only token
    let start = Number(w.start);
    let end = Number(w.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(start, lastEnd); // providers occasionally overlap by a few ms
    if (Number.isFinite(duration)) end = Math.min(end, duration);
    if (end <= start) end = start + 0.01;
    const out = { text, start: round(start), end: round(end), type: "word", key };
    if (w.speaker_id) out.speaker_id = w.speaker_id;
    words.push(out);
    lastEnd = end;
  }
  const audio = Number.isFinite(duration) ? duration : Number(raw.audio_duration_secs ?? raw.duration);
  return {
    text: words.map((w) => w.text).join(" "),
    provider: raw._provider ?? (isOpenAI ? "openai" : "elevenlabs"),
    language_code: raw.language_code ?? raw.language ?? null,
    language_probability: raw.language_probability ?? null,
    audio_duration_secs: Number.isFinite(audio) ? round(audio) : round(words.at(-1)?.end ?? 0),
    cyrillic_share: round(cyrillicShare(words)),
    words,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

export function detectSilences(media, { noiseDb = -40, minDur = 0.12 } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", media, "-map", "0:a:0", "-af", `silencedetect=n=${noiseDb}dB:d=${minDur}`, "-f", "null", "-"], { encoding: "utf8" });
  const out = [];
  let open = null;
  for (const line of (r.stderr ?? "").split("\n")) {
    const a = /silence_start: (-?[\d.]+)/.exec(line);
    const b = /silence_end: ([\d.]+)/.exec(line);
    if (a) open = Math.max(0, Number(a[1]));
    if (b && open !== null) { out.push({ start: open, end: Number(b[1]) }); open = null; }
  }
  if (open !== null) out.push({ start: open, end: Infinity });
  return out;
}

// Snap word edges to detected silences. Pure function (tested without ffmpeg).
// longPause: a silence this long that overlaps a word is never part of it (whisper-1 stretches words
// over pauses of a second or more), so the word is trimmed to it whatever maxShift says.
export function refineWithSilences(words, silences, { maxShift = 0.6, pad = 0.02, longPause = 0.3 } = {}) {
  const out = words.map((w) => ({ ...w }));
  let moved = 0;
  for (let i = 0; i < out.length; i++) {
    const w = out[i];
    const prevEnd = i ? out[i - 1].end : 0;
    const nextStart = out[i + 1]?.start ?? Infinity;
    // Start: the latest silence that ends after the previous word and no later than
    // this word's start (start reported late), or a silence that contains the start
    // (start reported early).
    let onset = null;
    for (const s of silences) {
      if (s.end > prevEnd && s.end <= w.start + 0.005 && w.start - s.end <= maxShift) onset = s.end;
      if (s.start < w.start && s.end > w.start && s.end < w.end - 0.08 && (s.end - w.start <= maxShift || s.end - s.start >= longPause)) onset = s.end;
    }
    if (onset !== null) {
      const ns = Math.max(prevEnd, onset - pad);
      if (Math.abs(ns - w.start) > 0.03) { w.start = round(ns); moved++; }
    }
    // End: a silence that starts inside the word's tail (end reported late) or soon
    // after it (end reported early).
    let offset = null;
    for (const s of silences) {
      if (s.start > w.start + 0.05 && s.start < w.end && (w.end - s.start <= maxShift || s.end - s.start >= longPause)) { offset = s.start; break; }
      if (s.start >= w.end && s.start < nextStart && s.start - w.end <= maxShift) { offset = s.start; break; }
    }
    if (offset !== null) {
      const ne = Math.min(nextStart, offset + pad);
      if (Math.abs(ne - w.end) > 0.03 && ne > w.start + 0.04) { w.end = round(ne); moved++; }
    }
  }
  // A gap between words with no silence under it is an ASR artifact (whisper-1
  // leaves ~0.5 s holes inside continuous speech): close it so the silence pass
  // cannot cut into the next word.
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1].end, b = out[i].start;
    if (b - a <= 0.05) continue;
    const covered = silences.reduce((t, s) => t + Math.max(0, Math.min(b, s.end) - Math.max(a, s.start)), 0);
    if (covered < 0.1) { out[i].start = round(a + 0.01); moved++; }
  }
  return { words: out, moved };
}



if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log("Usage: node scripts/ru/normalize-transcript.mjs <raw.json> [--media <video>] [--out <path>]");
    process.exit(args.length ? 0 : 1);
  }
  let input = null, media = null, out = null, noiseDb = -40, refine = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--media") media = args[++i];
    else if (args[i] === "--out") out = args[++i];
    else if (args[i] === "--noise") noiseDb = Number(args[++i]);
    else if (args[i] === "--no-refine") refine = false;
    else input = args[i];
  }
  const raw = JSON.parse(readFileSync(resolve(input), "utf8"));
  const duration = media ? probeDuration(resolve(media)) : undefined;
  const t = normalizeTranscript(raw, { duration });
  if (media && refine) {
    const r = refineWithSilences(t.words, detectSilences(resolve(media), { noiseDb }));
    t.words = r.words;
    t.timing_refined = { edges_moved: r.moved, noise_db: noiseDb };
  }
  const outPath = resolve(out ?? join(dirname(resolve(input)), "transcript.words.json"));
  writeFileSync(outPath, JSON.stringify(t, null, 2) + "\n");
  console.log(`${t.words.length} words · ${t.audio_duration_secs}s · cyrillic ${Math.round(t.cyrillic_share * 100)}%${t.timing_refined ? ` · edges snapped to audio: ${t.timing_refined.edges_moved}` : ""} · ${outPath}`);
  if (t.words.length && t.cyrillic_share < 0.6) console.warn("WARNING: transcript does not read as Russian — check language_code and the audio.");
}
