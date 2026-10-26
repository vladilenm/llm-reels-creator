#!/usr/bin/env node
// S7 «Сборка»: clean.mp4 + B-roll clips + captions → preview / final / kit.
//
//   node scripts/ru/assemble.mjs <project> --preview       renders/preview.mp4 (540×960, ГЕЙТ C)
//   node scripts/ru/assemble.mjs <project> --final         renders/final.mp4 (mode full) + check-reel
//   node scripts/ru/assemble.mjs <project> --kit           renders/kit/* (mode kit)
//   --tag v2   base picture renders/picture.v2.mp4 → work/composite-*.v2.mov, renders/preview|final.v2.mp4
//              (a new look next to the approved one; the approved files stay untouched)
//
// Inputs (all times on the CLEAN timeline):
//   renders/clean.mp4
//   broll/plan.json   motion-broll plan: { title, video, fps, clips: [{ id, title, line, in, out, kind: "full"|"panel", file }] }
//                     (file paths relative to broll/; missing plan = no B-roll)
//   renders/kit/captions.mov  (optional; ProRes 4444 with alpha from make-captions.mjs)
//
// Full-frame clips replace the picture for [in, out]; panels and captions are
// alpha overlays. Hard cuts, original audio, the clip holds its last frame if
// its slot is longer (same contract as motion-broll's composite.py).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, resolve, basename, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exportReel } from "./export-reel.mjs";
import { ROOT } from "./lib/brand.mjs";

const tc = (t) => `${Math.floor(t / 60)}m${(t % 60).toFixed(2).replace(".", "s").padStart(5, "0")}`;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

export function loadPlan(project) {
  const p = join(project, "broll/plan.json");
  if (!existsSync(p)) return { clips: [] };
  const plan = JSON.parse(readFileSync(p, "utf8"));
  for (const c of plan.clips ?? []) {
    c.path = resolve(join(project, "broll"), c.file);
    if (!existsSync(c.path)) throw new Error(`B-roll file missing: ${c.file}`);
    if (!(c.out > c.in)) throw new Error(`clip ${c.id}: out must be after in`);
  }
  return plan;
}

// Clips over the speaker. "layer": "back" clips are already in the base, behind the speaker (night_base.py).
export const frontClips = (clips = []) => clips.filter((c) => c.layer !== "back");

// One ffmpeg pass: base video, then each clip overlaid in its window, then captions.
// Base picture: broll/plan.json `video` (relative to broll/, e.g. a renders/picture.mp4
// with edit effects and SFX baked in), else renders/clean.mp4. Its audio is the mix.
export function basePicture(project, plan = loadPlan(project), video) {
  const clean = join(project, "renders/clean.mp4");
  const base = video ? resolve(video) : plan.video ? resolve(join(project, "broll"), plan.video) : clean;
  if (!existsSync(base)) throw new Error(`${relative(project, base)} missing (${base === clean ? "run S2" : "build the picture first"})`);
  return base;
}

export function composite(project, out, { scale = 1, video } = {}) {
  const plan = loadPlan(project);
  const clean = basePicture(project, plan, video);
  const clips = frontClips(plan.clips);
  const captions = join(project, "renders/kit/captions.mov");
  const inputs = [clean, ...clips.map((c) => c.path), ...(existsSync(captions) ? [captions] : [])];
  const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
  const f = [`[0:v]scale=${W}:${H},setsar=1,format=yuva444p[b0]`];
  let last = "b0";
  clips.forEach((c, i) => {
    const k = i + 1;
    f.push(`[${k}:v]scale=${W}:${H},format=yuva444p,tpad=stop_mode=clone:stop_duration=30,setpts=PTS-STARTPTS+${c.in}/TB[c${k}]`);
    f.push(`[${last}][c${k}]overlay=0:0:enable='between(t,${c.in},${c.out})':eof_action=pass[b${k}]`);
    last = `b${k}`;
  });
  if (existsSync(captions)) {
    const k = inputs.length - 1;
    f.push(`[${k}:v]scale=${W}:${H},format=yuva444p[cap]`);
    f.push(`[${last}][cap]overlay=0:0:eof_action=pass[bc]`);
    last = "bc";
  }
  f.push(`[${last}]format=yuv420p[v]`);
  const args = ["-v", "error", "-y", ...inputs.flatMap((p) => ["-i", p]), "-filter_complex", f.join(";"), "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-c:a", "pcm_s16le", "-shortest", out];
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`composite failed: ${r.stderr.slice(-1200)}`);
  return { out, clips: clips.length, captions: existsSync(captions) };
}

export function buildKit(project) {
  const kit = join(project, "renders/kit");
  mkdirSync(join(kit, "broll"), { recursive: true });
  copyFileSync(join(project, "renders/clean.mp4"), join(kit, "clean.mp4"));
  const plan = loadPlan(project);
  const base = basePicture(project, plan);
  if (basename(base) !== "clean.mp4") copyFileSync(base, join(kit, basename(base)));
  const slug = basename(project);
  const rows = [];
  frontClips(plan.clips).forEach((c, i) => {
    const name = `${String(i + 1).padStart(2, "0")}-${String(c.id).replace(/^\d+-?/, "") || "clip"}_${tc(c.in)}${extname(c.path)}`;
    copyFileSync(c.path, join(kit, "broll", name));
    rows.push(`| broll/${name} | ${fmt(c.in)} | ${fmt(c.out)} | ${c.kind === "panel" ? "панель поверх (ProRes 4444, альфа) — дорожка над видео" : "полноэкранная врезка (MP4) — заменяет кадр"} | ${String(c.line ?? "").replaceAll("|", "/")} |`);
  });
  if (existsSync(join(project, "captions.srt"))) copyFileSync(join(project, "captions.srt"), join(kit, "captions.srt"));
  const hasCaps = existsSync(join(kit, "captions.mov"));
  // compare.html + viewer.html via motion-broll's page builder. It also writes an
  // English TIMING.md, so ours (Russian, with captions) is written after it.
  const preview = join(project, "renders/preview.mp4");
  if (existsSync(preview) && existsSync(join(project, "broll/plan.json"))) {
    const raw = JSON.parse(readFileSync(join(project, "broll/plan.json"), "utf8"));
    const kitPlan = { ...raw, clips: frontClips(raw.clips), video: relative(join(project, "broll"), join(kit, "clean.mp4")) };
    const tmpPlan = join(project, "broll/plan.kit.json");
    writeFileSync(tmpPlan, JSON.stringify(kitPlan, null, 2));
    copyFileSync(preview, join(kit, "preview.mp4"));
    const r = spawnSync("python3", [join(ROOT, ".claude/skills/motion-broll/scripts/make_pages.py"), tmpPlan, join(kit, "preview.mp4")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`make_pages failed: ${r.stderr}`);
  }
  writeFileSync(join(kit, "TIMING.md"), [
    `# TIMING · ${slug}`,
    "",
    "Таймлайн — `clean.mp4` (уже без пауз и дублей). Имя клипа заканчивается его точкой входа (`0m32s40` = 0:32.40).",
    "ProRes 4444 с альфой открывается в Premiere, Final Cut и DaVinci. CapCut альфу в ProRes может не поддерживать — тогда бери полноэкранные версии из `renders/preview.mp4` или попроси режим `full`.",
    "",
    "| Файл | In | Out | Как ставить | Фраза |",
    "|---|---|---|---|---|",
    ...rows,
    ...(hasCaps ? ["| captions.mov | 0:00.00 | конец | субтитры, ProRes 4444 с альфой — верхняя дорожка | все |"] : []),
    "| captions.srt | — | — | те же субтитры текстом (≤22 знака, ≤2 строки) | — |",
    "",
    "Звук мной не прослушан: громкость, музыку и склейки по интонации проверь на слух.",
    "",
  ].join("\n"));
  return { kit: relative(ROOT, kit), clips: frontClips(plan.clips).length };
}

function main() {
  const a = process.argv.slice(2);
  const project = resolve(a[0] ?? "");
  if (!a[0] || !existsSync(project)) { console.log("Usage: node scripts/ru/assemble.mjs <project> --preview | --final | --kit [--tag v2]"); process.exit(1); }
  const fps = JSON.parse(readFileSync(join(project, "meta.json"), "utf8")).fps ?? 30;
  const work = join(project, "work");
  mkdirSync(work, { recursive: true });
  const ti = a.indexOf("--tag"), tag = ti >= 0 ? a[ti + 1] : null, sfx = tag ? `.${tag}` : "";
  const video = tag ? join(project, `renders/picture${sfx}.mp4`) : undefined;
  if (a.includes("--preview")) {
    const c = composite(project, join(work, `composite-half${sfx}.mov`), { scale: 0.5, video });
    const r = exportReel(c.out, join(project, `renders/preview${sfx}.mp4`), { preview: true, fps });
    console.log(`preview → ${relative(ROOT, r.output)} (${c.clips} clips${c.captions ? " + captions" : ""})`);
  }
  if (a.includes("--final")) {
    const c = composite(project, join(work, `composite-full${sfx}.mov`), { video });
    const r = exportReel(c.out, join(project, `renders/final${sfx}.mp4`), { fps });
    for (const x of r.check.results) console.log(`${x.status.padEnd(4)}  ${x.item}${x.detail !== undefined ? ` — ${x.detail}` : ""}`);
    console.log(r.check.ok ? "RESULT: PASS" : "RESULT: FAIL");
    process.exitCode = r.check.ok ? 0 : 1;
  }
  if (a.includes("--kit")) {
    const k = buildKit(project);
    console.log(`kit → ${k.kit} (${k.clips} clips)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
