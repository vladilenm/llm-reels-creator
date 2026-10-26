#!/usr/bin/env node
// The brand SFX kit: one sample per sfx.py kind in brand/sfx/<kind>.wav, so sfx.py stops
// synthesising. Two sources:
//   earshot (default) — designed sounds from the earshot bank, rendered by id in code
//                        (pure DSP, no models, no network): tools/earshot/.venv/bin/earshot
//   openverse          — the first CC0 recording of brand/sfx/library/<kind>/ (sfx-fetch.mjs)
//
//   node scripts/ru/sfx-kit.mjs                          every kind from earshot
//   node scripts/ru/sfx-kit.mjs --source openverse --kinds whoosh,hit
//   node scripts/ru/sfx-kit.mjs --set pop=pro_pop/tink   another bank member for one kind
//
// Every rendered take goes through `earshot sfx check` (model-free audit); the choice is
// written to brand/sfx/kit.json. Claude cannot hear: the customer picks by ear.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { folderFor } from "./lib/sfx-palette.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KIT = join(ROOT, "brand", "sfx");
const EARSHOT = join(ROOT, "tools", "earshot", ".venv", "bin", "earshot");

// sfx.py kind → earshot bank id and render knobs (quiet, short, brand: «тихие акценты»)
export const BANK = {
  whoosh: ["whoosh_fast/tight", ["--dur", "0.5"]],
  whoosh_big: ["whoosh_big/thump_airy", []],
  whoosh_small: ["swish/flick", []],
  pop: ["pro_pop_in/airy", []],
  click: ["pro_click/soft", []],
  tick: ["pro_hover_tick/soft", []],
  chime: ["pro_notify/ding_2045", []],
  hit: ["pro_impact/short", []],
};

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const source = opt("--source", "earshot");
const kinds = opt("--kinds", Object.keys(BANK).join(",")).split(",");
for (const s of args.flatMap((a, i) => (a === "--set" ? [args[i + 1]] : []))) {
  const [k, id] = s.split("="); BANK[k] = [id, []];
}

const kitPath = join(KIT, "kit.json");
const kit = existsSync(kitPath) ? JSON.parse(readFileSync(kitPath, "utf8")) : {};

for (const kind of kinds) {
  if (!BANK[kind]) { console.error(`unknown kind ${kind}`); process.exit(1); }
  for (const ext of ["wav", "mp3", "m4a"]) {          // sfx.py takes the first it finds
    const old = join(KIT, `${kind}.${ext}`);
    if (ext !== "wav" && existsSync(old)) { console.error(`${kind}: remove ${old} first`); process.exit(1); }
  }
  const out = join(KIT, `${kind}.wav`);
  if (source === "earshot") {
    if (!existsSync(EARSHOT)) { console.error(`no earshot: see vendor/SOURCES.md → earshot`); process.exit(1); }
    const [id, knobs] = BANK[kind];
    execFileSync(EARSHOT, ["sfx", "render", id, "-o", out, ...knobs], { stdio: "pipe" });
    const check = execFileSync(EARSHOT, ["sfx", "check", out], { encoding: "utf8" }).trim().split("\n")[0];
    kit[kind] = { source: "earshot", id, knobs };
    console.log(`${kind}\t${id}\t${check}`);
  } else if (source === "openverse") {
    const dir = join(KIT, "library", folderFor(kind));
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(wav|mp3|flac|ogg)$/.test(f)).sort() : [];
    if (!files.length) { console.error(`${kind}: no files in ${dir} — run sfx-fetch.mjs`); process.exit(1); }
    const src = join(dir, opt("--file", files[0]));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ac", "2", "-ar", "48000", out]);
    const credits = JSON.parse(readFileSync(join(KIT, "library", "credits.json"), "utf8"));
    const c = credits[src.slice(ROOT.length + 1)] || {};
    kit[kind] = { source: "openverse", file: src.slice(ROOT.length + 1), title: c.title, creator: c.creator, license: c.license };
    console.log(`${kind}\t${c.title} · ${c.creator} · ${c.license}`);
  } else { console.error(`unknown source ${source}`); process.exit(1); }
}
writeFileSync(kitPath, JSON.stringify(kit, null, 1));
