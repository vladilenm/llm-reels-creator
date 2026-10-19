#!/usr/bin/env node
// A faster cut of the finished reel: the whole composite (picture, graphics, captions, sound) sped
// up together, the voice keeps its pitch (atempo). Run after `assemble.mjs <project> --final`.
//
//   node scripts/ru/speed-variant.mjs <project> [--factor 1.1] [--tag v2]
//   → work/composite-full[.tag].x<factor>.mov, renders/final[.tag].x<factor>.mp4 (+ check-reel)
//
// Customer, 2026-10-19: «ускорил бы на 10–15 %, чтобы динамичнее… дай на 10 %».

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exportReel } from "./export-reel.mjs";
import { ROOT } from "./lib/brand.mjs";

export function speedVariant(project, { factor = 1.1, tag = null } = {}) {
  project = resolve(project);
  if (!(factor > 1 && factor <= 1.5)) throw new Error(`factor ${factor}: expected 1 < factor ≤ 1.5`);
  const sfx = tag ? `.${tag}` : "";
  const src = join(project, `work/composite-full${sfx}.mov`);
  if (!existsSync(src)) throw new Error(`no ${relative(ROOT, src)} — run assemble.mjs ${relative(ROOT, project)} --final${tag ? ` --tag ${tag}` : ""} first`);
  const final = join(project, `renders/final${sfx}.mp4`);
  const fpsOut = existsSync(final)
    ? spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", final], { encoding: "utf8" }).stdout.trim()
    : "30/1";
  const [n, d] = fpsOut.split("/").map(Number);
  const fps = Math.round((n / (d || 1)) * 1000) / 1000;
  const x = `x${factor}`;
  const mid = join(project, `work/composite-full${sfx}.${x}.mov`);
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-filter_complex",
    `[0:v]setpts=PTS/${factor},fps=${fps}[v];[0:a]atempo=${factor}[a]`, "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "12", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", mid], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr.slice(-800));
  const out = join(project, `renders/final${sfx}.${x}.mp4`);
  const res = exportReel(mid, out, { fps });
  return { out: relative(ROOT, out), factor, fps, check: res };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.log("Usage: node scripts/ru/speed-variant.mjs <project> [--factor 1.1] [--tag v2]"); process.exit(1); }
  const opt = (k, v) => (a.includes(k) ? a[a.indexOf(k) + 1] : v);
  try {
    const r = speedVariant(a[0], { factor: Number(opt("--factor", 1.1)), tag: opt("--tag", null) });
    const c = r.check?.check ?? r.check;
    console.log(JSON.stringify({ out: r.out, factor: r.factor, fps: r.fps, result: c?.result ?? c?.ok ?? null }, null, 2));
    if (c && (c.result === "FAIL" || c.ok === false)) process.exit(2);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
