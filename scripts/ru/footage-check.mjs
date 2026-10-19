#!/usr/bin/env node
// Remake footage check: what the customer dropped against what SCREEN.md asked for.
//
//   node scripts/ru/footage-check.mjs <remake project> [<folder>=inbox/<slug>] [--no-head] [--out FOOTAGE.json]
//
// - every video in the folder is probed; the talking-head take is the longest vertical one
//   (rotation applied), screen recordings are the rest
// - SCREEN.md recordings («**A-obsidian.mov**») are matched to files by name, loosely:
//   «obsidian.mp4», «A obsidian.MOV» and «A-obsidian.mov» all match «A-obsidian.mov»
// - head position: Apple Vision person masks on 3 frames of the take; the top of the head
//   above 35 % of the height means «голова высоко» → fx.json relocate for the window phrases
// Prints JSON; exit code 0 even with missing files (the report says what is missing).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, basename, extname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ROOT } from "./lib/brand.mjs";

const VIDEO = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm"]);
const key = (s) => basename(s, extname(s)).toLowerCase().replace(/^[a-z]\s*[-_ ]\s*(?=[a-zа-яё])/i, "").replace(/[^a-zа-яё0-9]+/gi, "");

// «**A-obsidian.mov** (~10 с) — …» → [{ name: "A-obsidian.mov", note: "…" }]
export function expectedRecordings(screenMd) {
  const out = [];
  for (const m of screenMd.matchAll(/\*\*([A-Za-zА-Яа-яЁё0-9][\w .\-]*\.(?:mov|mp4|m4v))\*\*([^\n]*)/g)) {
    if (!out.some((e) => e.name === m[1])) out.push({ name: m[1], note: m[2].replace(/^[\s—-]+/, "").trim() });
  }
  return out;
}

export function matchRecordings(expected, files) {
  const used = new Set();
  const rows = expected.map((e) => {
    const k = key(e.name);
    const f = files.find((x) => !used.has(x) && (key(x) === k || key(x).includes(k) || (key(x).length > 3 && k.includes(key(x)))));
    if (f) used.add(f);
    return { expected: e.name, file: f ?? null, note: e.note };
  });
  return { rows, extra: files.filter((f) => !used.has(f)) };
}

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height:stream_side_data=rotation", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  const v = (j.streams ?? []).find((s) => s.codec_type === "video") ?? {};
  const rot = Math.abs(Number((v.side_data_list ?? []).find((d) => "rotation" in d)?.rotation ?? 0));
  const [w, h] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  return { duration: Number(j.format?.duration ?? 0), width: w, height: h, vertical: h > w, audio: (j.streams ?? []).some((s) => s.codec_type === "audio") };
}

export function headTop(file, duration) {
  const dir = mkdtempSync(join(tmpdir(), "head-"));
  try {
    const fr = join(dir, "f"), mk = join(dir, "m");
    spawnSync("mkdir", ["-p", fr, mk]);
    [0.25, 0.5, 0.75].forEach((p, i) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(duration * p), "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", join(fr, `${String(i).padStart(5, "0")}.png`)]));
    const s = spawnSync("swift", [join(ROOT, "scripts/ru/fx/person-mask.swift"), fr, mk], { encoding: "utf8" });
    if (s.status !== 0) return null;
    const py = `import sys,glob\nfrom PIL import Image\nimport numpy as np\nv=[]\nfor f in sorted(glob.glob(sys.argv[1]+'/*.png')):\n  a=np.asarray(Image.open(f).convert('L'))>128\n  r=np.flatnonzero(a.any(1))\n  if len(r): v.append(r[0]/a.shape[0])\nprint(sorted(v)[len(v)//2] if v else -1)`;
    const p = spawnSync("python3", ["-c", py, mk], { encoding: "utf8" });
    const t = Number(p.stdout.trim());
    return t >= 0 ? Math.round(t * 1000) / 10 : null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function footageCheck(remake, folder, { head = true } = {}) {
  remake = resolve(remake);
  const slug = basename(remake).replace(/^\d{4}-\d{2}-\d{2}-remake-/, "");
  folder = resolve(folder ?? join(ROOT, "inbox", slug));
  if (!existsSync(folder)) throw new Error(`no footage folder: ${relative(ROOT, folder)}`);
  const files = readdirSync(folder).filter((f) => VIDEO.has(extname(f).toLowerCase())).map((f) => join(folder, f));
  const info = Object.fromEntries(files.map((f) => [f, probe(f)]));
  const vertical = files.filter((f) => info[f].vertical && info[f].audio).sort((a, b) => info[b].duration - info[a].duration);
  const take = vertical[0] ?? null;
  const screens = files.filter((f) => f !== take);
  const screenMd = existsSync(join(remake, "SCREEN.md")) ? readFileSync(join(remake, "SCREEN.md"), "utf8") : "";
  const { rows, extra } = matchRecordings(expectedRecordings(screenMd), screens);
  const rel = (f) => (f ? relative(ROOT, f) : null);
  const top = take && head ? headTop(take, info[take].duration) : null;
  return {
    folder: rel(folder),
    take: take ? { file: rel(take), ...info[take], head_top_pct: top, relocate: top != null ? top < 35 : null } : null,
    other_vertical: vertical.slice(1).map(rel),
    recordings: rows.map((r) => ({ ...r, file: rel(r.file), duration: r.file ? info[r.file].duration : null })),
    missing: rows.filter((r) => !r.file).map((r) => r.expected),
    extra: extra.map(rel),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.log("Usage: node scripts/ru/footage-check.mjs <remake project> [<folder>] [--no-head] [--out FOOTAGE.json]"); process.exit(1); }
  const pos = a.filter((x, i) => !x.startsWith("--") && a[i - 1] !== "--out");
  try {
    const r = footageCheck(pos[0], pos[1], { head: !a.includes("--no-head") });
    const s = JSON.stringify(r, null, 2);
    if (a.includes("--out")) writeFileSync(resolve(a[a.indexOf("--out") + 1]), s + "\n");
    console.log(s);
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
