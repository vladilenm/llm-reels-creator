#!/usr/bin/env node
// S3→S4: apply an approved hook reorder (ГЕЙТ B) to the clean edit.
//
// PLAN.json `reorder`: [{ clean_from, clean_to, text? }, …] — pieces of the CURRENT
// clean timeline in their new order. Boundaries are snapped to word edges (never
// inside a word; at most 0.1 s of air, and never past the middle of the gap to the
// neighbouring word). The pieces are mapped back to source ranges through EDL.json
// and rendered in one pass from the raw file, with 10 ms audio fades at every join.
//
// Outputs: renders/clean.mp4 and transcript.clean.json are replaced (the previous
// versions are kept in work/*.before-reorder.*), EDL.json gains `order`.
//
// Usage: node scripts/ru/reorder.mjs <project> [--plan PLAN.json]

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sentenceCase } from "./build-edl.mjs";
import { normKey } from "./lib/text.mjs";

const r3 = (x) => Math.round(x * 1000) / 1000;

export function snapPiece(piece, words, { pad = 0.1 } = {}) {
  const mid = (w) => (w.start + w.end) / 2;
  const idx = words.map((w, i) => i).filter((i) => mid(words[i]) >= piece.clean_from && mid(words[i]) <= piece.clean_to);
  if (!idx.length) throw new Error(`reorder piece ${piece.clean_from}–${piece.clean_to} contains no words`);
  const first = idx[0], last = idx.at(-1);
  const prev = words[first - 1], next = words[last + 1];
  const a = Math.max(words[first].start - pad, prev ? (prev.end + words[first].start) / 2 : 0);
  const b = Math.min(words[last].end + pad, next ? (words[last].end + next.start) / 2 : Infinity);
  return { from: a, to: b, first, last };
}

// Map an interval of the clean timeline back to source ranges via EDL keep ranges.
export function cleanToSource(a, b, keep) {
  const out = [];
  let offset = 0;
  for (const k of keep) {
    const len = k.end - k.start;
    const lo = Math.max(a, offset), hi = Math.min(b, offset + len);
    if (hi > lo) out.push({ start: k.start + (lo - offset), end: k.start + (hi - offset) });
    offset += len;
  }
  return out;
}

function main() {
  const a = process.argv.slice(2);
  const project = resolve(a[0] ?? "");
  const pi = a.indexOf("--plan");
  const planPath = pi >= 0 ? resolve(a[pi + 1]) : join(project, "PLAN.json");
  if (!a[0] || !existsSync(planPath)) { console.log("Usage: node scripts/ru/reorder.mjs <project> [--plan PLAN.json]"); process.exit(1); }
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (!plan.reorder?.length) { console.log("PLAN.json has no reorder: nothing to do"); return; }
  const edl = JSON.parse(readFileSync(join(project, "EDL.json"), "utf8"));
  if (edl.order) throw new Error("EDL.json already has an order: rebuild S2 first (scripts/ru/build-edl.mjs) before reordering again");
  const t = JSON.parse(readFileSync(join(project, "transcript.clean.json"), "utf8"));
  const raw = join(project, edl.source ? edl.source.replace(/^.*?(assets\/)/, "$1") : "assets/raw.mov");
  const rawPath = existsSync(raw) ? raw : join(project, "assets/raw.mov");

  const pieces = plan.reorder.map((p) => ({ ...p, ...snapPiece(p, t.words) }));
  const order = pieces.map((p) => ({ clean_from: r3(p.from), clean_to: r3(p.to), text: t.words.slice(p.first, p.last + 1).map((w) => w.text).join(" "), source_ranges: cleanToSource(p.from, p.to, edl.keep_ranges).map((r) => ({ start: r3(r.start), end: r3(r.end) })) }));
  const ranges = order.flatMap((o, pi) => o.source_ranges.map((r, ri) => ({ ...r, join: ri === 0 && pi > 0 })));

  // New transcript: words of each piece, shifted onto the new timeline.
  const words = [];
  let offset = 0;
  for (const p of pieces) {
    for (const w of t.words.slice(p.first, p.last + 1)) words.push({ ...w, start: r3(offset + (w.start - p.from)), end: r3(offset + (w.end - p.from)) });
    offset += p.to - p.from;
  }
  const cased = sentenceCase(words).map((w) => ({ ...w, key: normKey(w.text) }));

  // Render: trim each source range, 10 ms fades at piece joins, concat.
  const f = [];
  ranges.forEach((r, i) => {
    const d = r.end - r.start;
    f.push(`[0:v]trim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    f.push(`[0:a]atrim=start=${r.start.toFixed(3)}:end=${r.end.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, d - 0.01).toFixed(3)}:d=0.01[a${i}]`);
  });
  f.push(`${ranges.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${ranges.length}:v=1:a=1[v][a]`);
  copyFileSync(join(project, "renders/clean.mp4"), join(project, "work/clean.before-reorder.mp4"));
  copyFileSync(join(project, "transcript.clean.json"), join(project, "work/transcript.clean.before-reorder.json"));
  const out = join(project, "renders/clean.mp4");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", rawPath, "-filter_complex", f.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-800)}`);

  const total = r3(offset);
  writeFileSync(join(project, "transcript.clean.json"), JSON.stringify({ ...t, text: cased.map((w) => w.text).join(" "), audio_duration_secs: total, reordered: true, words: cased }, null, 2) + "\n");
  edl.order = order;
  edl.clean_duration_before_reorder = edl.clean_duration;
  edl.clean_duration = total;
  writeFileSync(join(project, "EDL.json"), JSON.stringify(edl, null, 2) + "\n");
  console.log(JSON.stringify({ pieces: order.map((o) => `${o.clean_from}–${o.clean_to} «${o.text}»`), clean_duration: total, joins: pieces.length - 1 }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
