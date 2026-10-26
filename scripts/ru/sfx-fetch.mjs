#!/usr/bin/env node
// Real recorded SFX from Openverse into brand/sfx/library/<folder>/ — CC0 only, Freesound only, the palette
// «чисто и дорого» (scripts/ru/lib/sfx-palette.mjs). The library feeds the Real SFX skill
// (.claude/skills/real-sfx) and the kit picker (scripts/ru/sfx-kit.mjs). Free, no key: anonymous Openverse
// allows 20 requests/min, 200/day; a full run makes ~35 searches.
//
//   node scripts/ru/sfx-fetch.mjs                      every folder, up to 30 new files each
//   node scripts/ru/sfx-fetch.mjs --kinds whoosh,subdrop --per 12
//   node scripts/ru/sfx-fetch.mjs --dry                print what would be downloaded
//
// Then python3 scripts/ru/sfx_screen.py. brand/sfx/library/credits.json keeps title, author, licence and
// source page of every file. Files already in library/, reserve/ or rejected/ are skipped; audio stays out
// of git (brand/sfx/* in .gitignore).
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { PAUSE_MS, search, download, sleep } from "./lib/openverse.mjs";
import { PALETTE, LEGACY, selectSfx } from "./lib/sfx-palette.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ids already on disk for a folder: library/, reserve/ and rejected/ (files are named <openverse id>.<ext>)
export function haveIds(sfxDir, folder) {
  const ids = new Set();
  for (const part of ["library", "reserve", "rejected"]) {
    const d = join(sfxDir, part, folder);
    if (existsSync(d)) for (const f of readdirSync(d)) ids.add(basename(f, extname(f)));
  }
  return ids;
}

// rename a legacy folder (library/tick → library/click_tick) and its credits keys, once
export function migrateLegacy(lib, credits) {
  for (const [old, now] of Object.entries(LEGACY)) {
    const a = join(lib, old), b = join(lib, now);
    if (existsSync(a) && !existsSync(b)) { renameSync(a, b); console.log(`moved library/${old} → library/${now}`); }
    for (const k of Object.keys(credits)) {
      if (!k.includes(`/library/${old}/`)) continue;
      credits[k.replace(`/library/${old}/`, `/library/${now}/`)] = { ...credits[k], kind: now };
      delete credits[k];
    }
  }
  return credits;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
  const kinds = opt("--kinds", Object.keys(PALETTE).join(",")).split(",");
  const per = Number(opt("--per", 30)), dry = args.includes("--dry");
  const SFX = join(ROOT, "brand", "sfx"), LIB = join(SFX, "library");
  const creditsPath = join(LIB, "credits.json");
  let credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")) : {};
  const save = () => writeFileSync(creditsPath, JSON.stringify(credits, null, 1));
  if (!dry) { credits = migrateLegacy(LIB, credits); save(); }
  let first = true;
  for (const kind of kinds) {
    const p = PALETTE[kind];
    if (!p) { console.error(`unknown folder ${kind}: ${Object.keys(PALETTE).join(", ")}`); process.exit(1); }
    const have = haveIds(SFX, kind), dir = join(LIB, kind);
    if (!dry) mkdirSync(dir, { recursive: true });
    let got = 0;
    for (const q of p.queries) {
      if (got >= per) break;
      if (!first) await sleep(PAUSE_MS);
      first = false;
      const res = await search(q, { license: "cc0", source: "freesound", length: p.long ? null : "shortest" });
      for (const r of selectSfx(res, { minMs: p.minMs ?? 0, maxMs: p.maxMs, have })) {
        if (got >= per) break;
        have.add(r.id);
        const file = join(dir, `${r.id}.${r.filetype || "mp3"}`), rel = file.slice(ROOT.length + 1);
        if (dry) { console.log(`${kind}\t${(r.duration / 1000).toFixed(2)} s\t${r.title}`); got++; continue; }
        try { await download(r.url, file); } catch (e) { console.warn(`skip ${r.title}: ${e.message}`); continue; }
        credits[rel] = { kind, title: r.title, creator: r.creator, license: r.license, license_url: r.license_url,
          source: r.source, page: r.foreign_landing_url, duration_ms: r.duration, query: q,
          fetched: new Date().toISOString().slice(0, 10) };
        save();                                              // an interrupted run keeps the authors of what it got
        got++;
      }
    }
    console.log(`${kind}: ${got} new${dry ? " (dry)" : ` → ${dir.slice(ROOT.length + 1)}`}`);
  }
}
