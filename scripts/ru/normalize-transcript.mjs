#!/usr/bin/env node
// ElevenLabs Scribe response -> chassis word transcript.
//
//   { text, language_code, audio_duration_secs, words: [{ text, start, end, type: "word", key }] }
//
// Times are seconds in the source. Duration comes from ffprobe on the media
// (the API value is ignored when the media is given). Spacing tokens and audio
// events are dropped. `key` is the comparison form (lowercase, ё→е, no
// punctuation); `text` is left exactly as the provider returned it.
//
// Usage:
//   node scripts/ru/normalize-transcript.mjs <transcript.raw.json> [--media <video>] [--out <path>]

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

export function normalizeTranscript(raw, { duration } = {}) {
  if (!raw || !Array.isArray(raw.words)) throw new Error("transcript has no words[]");
  const words = [];
  let lastEnd = 0;
  for (const w of raw.words) {
    if (w.type && w.type !== "word") continue; // spacing, audio_event
    const text = String(w.text ?? "").trim();
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
  const audio = Number.isFinite(duration) ? duration : Number(raw.audio_duration_secs);
  return {
    text: words.map((w) => w.text).join(" "),
    language_code: raw.language_code ?? null,
    language_probability: raw.language_probability ?? null,
    audio_duration_secs: Number.isFinite(audio) ? round(audio) : round(words.at(-1)?.end ?? 0),
    cyrillic_share: round(cyrillicShare(words)),
    words,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log("Usage: node scripts/ru/normalize-transcript.mjs <raw.json> [--media <video>] [--out <path>]");
    process.exit(args.length ? 0 : 1);
  }
  let input = null, media = null, out = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--media") media = args[++i];
    else if (args[i] === "--out") out = args[++i];
    else input = args[i];
  }
  const raw = JSON.parse(readFileSync(resolve(input), "utf8"));
  const duration = media ? probeDuration(resolve(media)) : undefined;
  const t = normalizeTranscript(raw, { duration });
  const outPath = resolve(out ?? join(dirname(resolve(input)), "transcript.words.json"));
  writeFileSync(outPath, JSON.stringify(t, null, 2) + "\n");
  console.log(`${t.words.length} words · ${t.audio_duration_secs}s · cyrillic ${Math.round(t.cyrillic_share * 100)}% · ${outPath}`);
  if (t.words.length && t.cyrillic_share < 0.6) console.warn("WARNING: transcript does not read as Russian — check language_code and the audio.");
}
