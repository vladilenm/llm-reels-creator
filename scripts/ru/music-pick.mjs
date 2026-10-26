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

// The brand music level (customer, 2026-10-26: live tracks at −17 / −9 were «оооочень тихо»): −13 dB against the
// voice between phrases, −18 dB under speech. A new track replaces the old one's tuned levels; stops stay.
export const LEVEL = { level_db: -13, duck_db: -5 };

export function applyPick(fx, track) {
  const prev = fx.sound?.music ?? {};
  fx.sound = { ...(fx.sound ?? {}), music: { fade_out: 1.2, ...prev, ...LEVEL, start: "auto",
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
