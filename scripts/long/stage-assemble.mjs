#!/usr/bin/env node
// Assembles the YouTube stage: the take + FACE.json (where the face is full-frame) + CARDS.json (idea cards).
//
//   node scripts/long/stage-assemble.mjs <project> [--preview | --final] [--check] [--review] [--no-verify]
//        [--video renders/clean.mp4] [--transcript transcript.words.json] [--face FACE.json] [--cards CARDS.json]
//        [--fps 30] [--jobs 3] [--loudnorm] [--keep-clips]
//
// <project> is video-projects/<slug>/. Inputs: the cleaned take (16:9, the timeline of the transcript),
// transcript.words.json, FACE.json (scripts/long/face-plan.mjs), CARDS.json (format in lib/plan.mjs).
// Work files go to <project>/stage/: still assets, one ProRes 4444 clip per card (cached by content), the resolved
// plan and the ffmpeg filter script. Output: renders/stage.preview.mp4 (960×540, quick) or renders/stage.final.mp4.
//
// Picture rules (style-library/03-vladilen-stage/DESIGN.md): the take is shown untreated where the face is full-frame;
// elsewhere the bare stage with the dock (a 2:3 crop of the same take at the right edge) and the card of the moment.
// Every change of state is a one-frame hard cut. The audio is the take's own (voice only); --loudnorm adds -14 LUFS.
// Exit code 1 on plan errors or failed verification.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStyle } from "./check-stage-cards.mjs";
import { loadTranscript, checkFace } from "./face-plan.mjs";
import { resolvePlan, validatePlan } from "./lib/plan.mjs";
import { buildStageGraph } from "./lib/filter.mjs";
import { launchBrowser, renderCard, probeCard, cacheKey, clipPath, clipExists } from "./lib/render-card.mjs";
import { makeStageAssets } from "./lib/stage-assets.mjs";
import { probe, snapFps, verifyStage } from "./lib/verify.mjs";
import { reviewSheets } from "./lib/review.mjs";

const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// File arguments use -/ from FFmpeg 7; the old spelling was removed in FFmpeg 9.
export function filterFileOption(version) {
  const major = Number(version.match(/^ffmpeg version n?(\d+)\./)?.[1]);
  return major > 0 && major < 7 ? "-filter_complex_script" : "-/filter_complex";
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let k = 0; k < argv.length; k++) {
    const x = argv[k];
    if (!x.startsWith("--")) { a._.push(x); continue; }
    const key = x.slice(2);
    if (["preview", "final", "check", "review", "no-verify", "loudnorm", "keep-clips"].includes(key)) a[key] = true;
    else a[key] = argv[++k];
  }
  return a;
}

export function reviewTimes(face, cards, fps) {
  const t = [];
  const seen = new Set();
  const add = (x) => { const v = Math.round(x * fps) / fps; if (!seen.has(v) && v >= 0) { seen.add(v); t.push(v); } };
  face.segments.slice(1).forEach((s) => { add(s.start - 1 / fps); add(s.start); });
  // each card once, when it has built up: a second after its last reveal, before it starts to leave
  for (const c of cards) { const last = c.at && c.at.length ? Math.max(...c.at) : 0.8; add(c.start + Math.max(0.6, Math.min(c.duration - 0.45, last + (c.card === "stage-figure" ? 3.2 : 1.0)))); }   // an illustration needs ~3 s to be drawn
  return t.sort((a, b) => a - b).slice(0, 48);
}

async function renderAll({ cards, style, workDir, fps, jobs, keep }) {
  const todo = [];
  const wanted = new Set();
  for (const c of cards) {
    const key = cacheKey(c, style, fps);
    c.clip = clipPath(workDir, c, key);
    wanted.add(c.clip);
    if (!clipExists(c.clip)) todo.push(c);
  }
  console.log(`cards: ${cards.length}, to render ${todo.length}, cached ${cards.length - todo.length}`);
  if (todo.length) {
    const browser = await launchBrowser();
    try {
      let next = 0, done = 0;
      const worker = async () => {
        while (next < todo.length) {
          const c = todo[next++];
          const t0 = Date.now();
          const r = await renderCard({ browser, card: c, style, out: c.clip, fps });
          console.log(`  ${++done}/${todo.length} ${c.id} ${c.card} ${c.duration} s → ${(r.bytes / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
    } finally { await browser.close(); }
  }
  if (!keep) {   // forget clips that no card uses any more
    const dir = join(workDir, "clips");
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (!wanted.has(join(dir, f))) rmSync(join(dir, f), { force: true });
  }
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const project = resolve(a._[0] ?? "");
  if (!a._[0] || !existsSync(project)) { console.error("usage: stage-assemble.mjs <project> [--preview|--final] [--check] [--review]"); process.exit(2); }
  const at = (flag, def) => resolve(project, a[flag] ?? def);
  const paths = { video: at("video", "renders/clean.mp4"), transcript: at("transcript", "transcript.words.json"), face: at("face", "FACE.json"), cards: at("cards", "CARDS.json") };
  for (const [k, p] of Object.entries(paths)) if (!existsSync(p)) { console.error(`${k} not found: ${relative(process.cwd(), p)}`); process.exit(2); }

  const style = loadStyle();
  const layout = style.manifest.layout;
  const transcript = loadTranscript(paths.transcript);
  const face = JSON.parse(readFileSync(paths.face, "utf8"));
  const plan = JSON.parse(readFileSync(paths.cards, "utf8"));
  const takeInfo = probe(paths.video);
  const fps = a.fps ? Number(a.fps) : snapFps(takeInfo.fps);
  const duration = takeInfo.duration;
  const totalFrames = Math.round(duration * fps);
  if (Math.abs(takeInfo.w / takeInfo.h - 16 / 9) > 0.02) console.log(`warning: the take is ${takeInfo.w}×${takeInfo.h}, not 16:9: it is stretched to the frame`);
  if (Math.abs(transcript.duration - duration) > 1) console.log(`warning: the transcript is ${transcript.duration.toFixed(1)} s, the take ${duration.toFixed(1)} s: they must share one timeline`);

  const faceCheck = checkFace(face, { ...transcript, duration });
  const resolved = resolvePlan(plan, { words: transcript.words, duration, fps, style, face, projectDir: project });
  const v = validatePlan(resolved, { words: transcript.words, duration, fps, face, plan });
  const errors = [...faceCheck.errors.map((e) => `FACE.json: ${e}`), ...v.errors];
  const warnings = [...faceCheck.warnings.map((e) => `FACE.json: ${e}`), ...v.warnings];
  console.log(`take ${takeInfo.w}×${takeInfo.h} ${fps} fps ${fmt(duration)} · face segments ${face.segments.length} · cards ${resolved.cards.length}`);
  for (const w of warnings) console.log(`warning ${w}`);
  for (const e of errors) console.log(`ERROR   ${e}`);
  const workDir = join(project, "stage");
  mkdirSync(workDir, { recursive: true });
  writeFileSync(join(workDir, "resolved.json"), JSON.stringify({ fps, duration, cards: resolved.cards.map(({ ref, ...c }) => c) }, null, 2) + "\n");
  if (errors.length) { console.log(`${errors.length} errors: nothing rendered`); process.exit(1); }
  // the plan against the cards themselves: slots found, the number of timed elements equals the number of "at" times
  if (!a["no-probe"]) {
    const browser = await launchBrowser();
    try {
      const problems = [];
      for (const c of resolved.cards) { const p = await probeCard({ browser, card: c }); if (p) problems.push(p); }
      for (const p of problems) console.log(`ERROR   ${p}`);
      if (problems.length) { console.log(`${problems.length} errors: nothing rendered`); process.exit(1); }
    } finally { await browser.close(); }
  }
  if (a.check) { console.log(`plan ok (${warnings.length} warnings)`); process.exit(0); }

  const mode = a.final ? "final" : "preview";
  const out = { w: mode === "final" ? layout.frame.w : 960, h: mode === "final" ? layout.frame.h : 540 };
  const outFile = join(project, "renders", `stage.${mode}.mp4`);
  mkdirSync(join(project, "renders"), { recursive: true });

  const browser = await launchBrowser();
  let assets;
  try { assets = await makeStageAssets({ browser, style, outDir: join(workDir, "assets") }); } finally { await browser.close(); }
  await renderAll({ cards: resolved.cards, style, workDir, fps, jobs: Number(a.jobs ?? 3), keep: a["keep-clips"] });

  // inputs: 0 take, 1 stage, 2 shadow, 3 mask, 4 border, then the cards
  const loop = (f) => ["-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", f];
  const inputs = ["-i", paths.video, ...loop(assets.stage), ...loop(assets.shadow), ...loop(assets.mask), ...loop(assets.border)];
  resolved.cards.forEach((c) => inputs.push("-i", c.clip));
  const { graph, crop, windows } = buildStageGraph({
    fps, totalFrames, takeSize: { w: takeInfo.w, h: takeInfo.h }, layout, dockCrop: face.dock.crop, segments: face.segments,
    cards: resolved.cards.map((c, k) => ({ index: 5 + k, startFrame: c.startFrame, endFrame: c.endFrame })),
    inputs: { take: 0, stage: 1, shadow: 2, mask: 3, border: 4 }, out,
  });
  const script = join(workDir, "filter.txt");
  writeFileSync(script, graph + "\n");
  // aq-mode=3 gives the dark areas more bits: the stage is a dark radial glow, the case where 8-bit H.264 shows rings
  const enc = mode === "final" ? ["-crf", "17", "-preset", "medium", "-x264-params", "aq-mode=3"] : ["-crf", "26", "-preset", "veryfast"];
  const audio = a.loudnorm ? ["-af", "loudnorm=I=-14:TP=-1.5:LRA=11"] : [];
  const version = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error(`ffmpeg -version failed: ${version.stderr || version.error?.message}`);
  const args = ["-y", "-hide_banner", "-v", "error", "-stats", ...inputs, filterFileOption(version.stdout), script, "-map", "[out]", "-map", "0:a?",
    "-c:v", "libx264", ...enc, "-pix_fmt", "yuv420p", "-r", String(fps), "-c:a", "aac", "-b:a", "192k", ...audio, "-t", duration.toFixed(3), "-movflags", "+faststart", outFile];
  console.log(`assembling ${mode} ${out.w}×${out.h}: dock crop ${crop.w}×${crop.h} at ${crop.x},${crop.y}`);
  const t0 = Date.now();
  const r = spawnSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(1); }
  console.log(`\nwritten ${relative(process.cwd(), outFile)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  let failed = 0;
  if (!a["no-verify"]) {
    const checks = await verifyStage({ out: outFile, take: paths.video, takeInfo, face, cards: resolved.cards, stagePng: assets.stage, layout, dockCrop: face.dock.crop, fps, totalFrames, relax: out.w < layout.frame.w ? 6 : 0, bg: (readFileSync(join(style.dir, "tokens.css"), "utf8").match(/--bg:\s*(#[0-9a-fA-F]{6})/) ?? [])[1] ?? "#0E0B14" });
    for (const c of checks) { console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name}: ${c.detail}`); if (!c.ok) failed++; }
  }
  if (a.review) {
    mkdirSync(join(project, "review"), { recursive: true });
    const files = await reviewSheets({ video: outFile, times: reviewTimes(face, resolved.cards, fps), fps, out: join(project, "review", `stage-${mode}`) });
    console.log(`review sheets (16:9, each frame labelled): ${files.map((f) => relative(process.cwd(), f)).join(", ")}`);
  }
  console.log("Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух.");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
