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
