#!/usr/bin/env node
// A screen recording → a JPEG frame sequence the screen kit can play inside its browser window.
//
//   node scripts/ru/broll/screen-frames.mjs <recording> <out_dir> [--from s] [--to s] [--fps 30]
//        [--width 1600] [--crop x:y:w:h]
//
// Writes <out_dir>/00001.jpg … and <out_dir>/manifest.js (window.SKF["<dir name>"] = {n, fps, w, h}).
// In a clip: media: { term: { frames: "../screens/<dir name>", from: 0 } }.
// Keep each piece short (≤ 8 s): every frame is preloaded before the clip renders.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export function screenFrames(src, outDir, { from = 0, to = null, fps = 30, width = 1600, crop = null } = {}) {
  if (!existsSync(src)) throw new Error(`no such recording: ${src}`);
  outDir = resolve(outDir);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^\d{5}\.jpg$/.test(f)) rmSync(join(outDir, f));
  const vf = [crop ? `crop=${crop.replaceAll(":", ":")}` : null, `fps=${fps}`, `scale=${width}:-2:flags=lanczos`].filter(Boolean).join(",");
  const args = ["-loglevel", "error", "-y", "-ss", String(from), ...(to != null ? ["-to", String(to)] : []), "-i", src, "-vf", vf, "-q:v", "3", join(outDir, "%05d.jpg")];
  // -ss and -to are both input options here: ffmpeg reads -to as an absolute source time
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-800));
  const n = readdirSync(outDir).filter((f) => /^\d{5}\.jpg$/.test(f)).length;
  const p = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(outDir, "00001.jpg")], { encoding: "utf8" });
  const [w, h] = p.stdout.trim().split(",").map(Number);
  const key = basename(outDir);
  const man = { n, fps, w, h, src: basename(src), from, to };
  writeFileSync(join(outDir, "manifest.js"), `(window.SKF=window.SKF||{})[${JSON.stringify(key)}]=${JSON.stringify(man)};\n`);
  return { dir: outDir, ...man };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (a.length < 2) { console.log("Usage: node scripts/ru/broll/screen-frames.mjs <recording> <out_dir> [--from s] [--to s] [--fps 30] [--width 1600] [--crop x:y:w:h]"); process.exit(1); }
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  try {
    console.log(JSON.stringify(screenFrames(a[0], a[1], {
      from: Number(opt("--from", 0)), to: opt("--to", null) != null ? Number(opt("--to")) : null,
      fps: Number(opt("--fps", 30)), width: Number(opt("--width", 1600)), crop: opt("--crop", null),
    }), null, 2));
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
