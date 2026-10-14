#!/usr/bin/env node
// Append one run's metrics to runs.log.jsonl (SPEC §11). Measured values come
// from the project files; the rest are passed as flags.
//
//   node scripts/ru/log-run.mjs <project> [--review-iterations 2] [--transcription-cached true]
//        [--render-minutes 6.5] [--gate-b-changes 1] [--gate-c-changes 3] [--note "…"] [--dry-run]

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readStatus } from "./status.mjs";
import { ROOT } from "./lib/brand.mjs";

const read = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const dur = (p) => (existsSync(p) ? Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" }).stdout) : null);
const r1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10) / 10);

export function runMetrics(project, flags = {}) {
  const probe = read(join(project, "PROBE.json"));
  const edl = read(join(project, "EDL.json"));
  const plan = read(join(project, "broll/plan.json"));
  const st = readStatus(project);
  const m = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(basename(project));
  const final = dur(join(project, "renders/final.mp4")) ?? edl?.clean_duration ?? null;
  const num = (k) => (flags[k] !== undefined ? Number(flags[k]) : null);
  return {
    date: m?.[1] ?? new Date().toISOString().slice(0, 10),
    slug: m?.[2] ?? basename(project),
    source_secs: r1(probe?.summary?.duration ?? null),
    final_secs: r1(final),
    cut_secs: r1(edl?.removed ?? null),
    cuts: edl?.cuts ?? null,
    broll_clips: plan?.clips?.length ?? 0,
    review_iterations: num("review-iterations"),
    transcription_cached: flags["transcription-cached"] !== undefined ? flags["transcription-cached"] === "true" : null,
    render_minutes: num("render-minutes"),
    gate_b_changes: num("gate-b-changes"),
    gate_c_changes: num("gate-c-changes"),
    mode: st.mode ?? "kit",
    ...(flags.note ? { note: flags.note } : {}),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.log("Usage: node scripts/ru/log-run.mjs <project> [--review-iterations N] [--transcription-cached true|false] [--render-minutes N] [--gate-b-changes N] [--gate-c-changes N] [--note …] [--dry-run]"); process.exit(1); }
  const flags = {};
  for (let i = 1; i < a.length; i++) if (a[i].startsWith("--") && a[i] !== "--dry-run") flags[a[i].slice(2)] = a[++i];
  const row = runMetrics(resolve(a[0]), flags);
  if (!a.includes("--dry-run")) appendFileSync(join(ROOT, "runs.log.jsonl"), JSON.stringify(row) + "\n");
  console.log(JSON.stringify(row));
}
