#!/usr/bin/env node
// S6 contact sheets: frames at given times, tiled, each with its timecode and
// the Instagram Reels safe zone drawn on top (text/logos must stay inside
// y 360–1420 and left of x 960; the dimmed areas are covered by the app UI).
//
//   node scripts/ru/contact-sheet.mjs <video> --out review/sheet-01.png
//        [--times 0,1.5,3.2] [--every 2] [--plan PLAN.json] [--cols 5] [--width 270] [--no-zones|--label-only]
//
// --plan adds every event time in PLAN.json (`events[].at` / `in` / `out`, seconds
// on the clean timeline). Frame 0 is always included (the cover frame).
// More than --max (default 20) frames are split into sheet-01, sheet-02, …
// --from/--to limit the sheet to a window (e.g. a hook frame by frame: --from 0 --to 3 --every 0.2).

import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const fmt = (t) => { const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, "0")}`; };

// The video stream, not the container: audio often runs a few frames longer, and a
// seek past the last picture makes ffmpeg exit 0 without writing a frame.
function duration(video) {
  const probe = (args) => Number(spawnSync("ffprobe", ["-v", "error", ...args, "-of", "default=nw=1:nk=1", video], { encoding: "utf8" }).stdout.trim());
  const stream = probe(["-select_streams", "v:0", "-show_entries", "stream=duration"]);
  return Number.isFinite(stream) && stream > 0 ? stream : probe(["-show_entries", "format=duration"]);
}

export function planTimes(plan) {
  const out = [];
  for (const e of plan.events ?? plan.clips ?? []) for (const k of ["at", "in", "out"]) if (Number.isFinite(Number(e[k]))) out.push(Number(e[k]));
  return out;
}

// zones = true: safe zones + timecode; "label": timecode only (true colours, for
// studying a reference reel); false: bare frames.
function zoneSvg(w, h, label, zones = true) {
  const s = w / 1080;
  const area = zones === "label" ? "" : `
  <rect x="0" y="0" width="${w}" height="${360 * s}" fill="#ff2d55" fill-opacity="0.18"/>
  <rect x="0" y="${1420 * s}" width="${w}" height="${h - 1420 * s}" fill="#ff2d55" fill-opacity="0.18"/>
  <rect x="${960 * s}" y="${360 * s}" width="${w - 960 * s}" height="${1060 * s}" fill="#ff2d55" fill-opacity="0.18"/>
  <rect x="0.5" y="${360 * s}" width="${960 * s}" height="${1060 * s}" fill="none" stroke="#ff2d55" stroke-width="1" stroke-dasharray="4 3"/>`;
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${area}
  <rect x="0" y="${h - 22}" width="${w}" height="22" fill="#000" fill-opacity="0.7"/>
  <text x="6" y="${h - 6}" font-family="Menlo, monospace" font-size="13" fill="#fff">${label}</text>
</svg>`);
}

export async function contactSheets(video, { out, times = [], every, plan, cols = 5, width = 270, zones = true, max = 20, from = 0, to = Infinity } = {}) {
  video = resolve(video);
  const dur = duration(video);
  const set = new Set([from, ...times]);
  if (every) for (let t = from + every; t < dur && t <= to + 1e-6; t += every) set.add(+t.toFixed(3));
  if (plan) for (const t of planTimes(JSON.parse(readFileSync(plan, "utf8")))) set.add(t);
  const all = [...set].filter((t) => t >= from && t <= to && t < dur).sort((a, b) => a - b);
  const height = Math.round((width * 1920) / 1080);
  const tmp = mkdtempSync(join(tmpdir(), "sheet-"));
  const outs = [];
  try {
    const tiles = [];
    for (const [i, t] of all.entries()) {
      const png = join(tmp, `f${i}.png`);
      // Seek a hair before the end so the last frame exists.
      const at = Math.min(t, Math.max(0, dur - 0.04));
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", video, "-frames:v", "1", "-vf", `scale=${width}:${height}`, png]);
      if (r.status !== 0) throw new Error(`frame at ${t}s failed`);
      const layers = zones ? [{ input: zoneSvg(width, height, fmt(t), zones), top: 0, left: 0 }] : [];
      tiles.push(await sharp(png).composite(layers).png().toBuffer());
    }
    mkdirSync(dirname(resolve(out)), { recursive: true });
    for (let s = 0; s * max < tiles.length; s++) {
      const chunk = tiles.slice(s * max, (s + 1) * max);
      const rows = Math.ceil(chunk.length / cols);
      const gap = 6;
      const W = cols * width + (cols + 1) * gap, H = rows * height + (rows + 1) * gap;
      const file = tiles.length > max ? join(dirname(resolve(out)), `${basename(out, extname(out))}-${String(s + 1).padStart(2, "0")}.png`) : resolve(out);
      await sharp({ create: { width: W, height: H, channels: 3, background: "#111" } })
        .composite(chunk.map((buf, i) => ({ input: buf, left: gap + (i % cols) * (width + gap), top: gap + Math.floor(i / cols) * (height + gap) })))
        .png().toFile(file);
      outs.push(file);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { sheets: outs, times: all };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!a[0] || !get("--out")) {
    console.log("Usage: node scripts/ru/contact-sheet.mjs <video> --out sheet.png [--times 0,1.5] [--every 2] [--plan PLAN.json] [--from s] [--to s] [--cols 5] [--width 270] [--no-zones|--label-only]");
    process.exit(1);
  }
  const r = await contactSheets(a[0], {
    out: get("--out"),
    times: (get("--times") ?? "").split(",").filter(Boolean).map(Number),
    every: get("--every") ? Number(get("--every")) : undefined,
    plan: get("--plan"),
    from: get("--from") ? Number(get("--from")) : undefined,
    to: get("--to") ? Number(get("--to")) : undefined,
    cols: get("--cols") ? Number(get("--cols")) : undefined,
    width: get("--width") ? Number(get("--width")) : undefined,
    zones: a.includes("--label-only") ? "label" : !a.includes("--no-zones"),
  });
  console.log(`${r.times.length} frames → ${r.sheets.join(", ")}`);
}
