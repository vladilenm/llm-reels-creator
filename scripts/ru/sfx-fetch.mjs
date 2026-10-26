#!/usr/bin/env node
// Real recorded SFX from Openverse into brand/sfx/library/<kind>/ — CC0 only, Freesound only,
// short files only. The library feeds the Real SFX skill (.claude/skills/real-sfx) and the
// kit picker (scripts/ru/sfx-kit.py). Free, no key: the anonymous API allows 20 requests/min,
// 200/day; one run makes one search per kind.
//
//   node scripts/ru/sfx-fetch.mjs                     every kind, 8 files each
//   node scripts/ru/sfx-fetch.mjs --kinds whoosh,pop --per 12
//   node scripts/ru/sfx-fetch.mjs --dry               print what would be downloaded
//
// brand/sfx/library/credits.json keeps title, author, licence and source page of every file.
// Already downloaded files are skipped; audio stays out of git (brand/sfx/* in .gitignore).

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIB = join(ROOT, "brand", "sfx", "library");
const API = "https://api.openverse.org/v1/audio/";

// kind → search query and the longest file we accept (ms)
export const QUERIES = {
  whoosh: ["whoosh", 1500],
  whoosh_big: ["cinematic whoosh transition", 2500],
  whoosh_small: ["swish", 800],
  pop: ["pop bubble ui", 500],
  click: ["mouse click", 400],
  tick: ["tick clock single", 400],
  chime: ["chime notification", 2000],
  hit: ["cinematic impact hit", 2500],
  riser: ["riser", 4000],
  keyboard: ["keyboard typing", 5000],
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const kinds = (opt("--kinds", Object.keys(QUERIES).join(","))).split(",");
const per = Number(opt("--per", 8));
const dry = args.includes("--dry");

const creditsPath = join(LIB, "credits.json");
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")) : {};

for (const kind of kinds) {
  if (!QUERIES[kind]) { console.error(`unknown kind ${kind}`); process.exit(1); }
  const [q, maxMs] = QUERIES[kind];
  const url = `${API}?q=${encodeURIComponent(q)}&license=cc0&source=freesound&length=shortest&page_size=20`;
  const res = await fetch(url, { headers: { "User-Agent": "reels-studio-sfx-fetch" } });
  if (!res.ok) { console.error(`${kind}: Openverse ${res.status} ${await res.text()}`); process.exit(1); }
  const picks = (await res.json()).results
    .filter((r) => r.duration && r.duration <= maxMs && r.license === "cc0")
    .slice(0, per);
  const dir = join(LIB, kind);
  if (!dry) mkdirSync(dir, { recursive: true });
  let got = 0;
  for (const r of picks) {
    const file = join(dir, `${r.id}.${r.filetype || "mp3"}`);
    const rel = file.slice(ROOT.length + 1);
    if (dry) { console.log(`${kind}\t${(r.duration / 1000).toFixed(2)} s\t${r.title}`); continue; }
    if (!existsSync(file)) {
      const a = await fetch(r.url);
      if (!a.ok) { console.warn(`skip ${r.title}: ${a.status}`); continue; }
      writeFileSync(file, Buffer.from(await a.arrayBuffer()));
    }
    credits[rel] = {
      kind, title: r.title, creator: r.creator, license: r.license, license_url: r.license_url,
      source: r.source, page: r.foreign_landing_url, duration_ms: r.duration, fetched: new Date().toISOString().slice(0, 10),
    };
    got++;
  }
  if (!dry) console.log(`${kind}: ${got} files → ${dir.slice(ROOT.length + 1)}`);
}
if (!dry) writeFileSync(creditsPath, JSON.stringify(credits, null, 1));
