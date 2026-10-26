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
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, statSync } from "node:fs";
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

// fx/fx.json "cine": true with "look": "night" — the frame finish (docs/superpowers/specs/2026-10-26-night-cine-slice-design.md):
// night clips get a soft glow (a blurred copy of their light lines screened over them), the whole frame a vignette and
// grain; captions go on top, clean. threshold: the glow source is cut at this level (0–1, per channel, stretched to full
// range) before the blur, so only light lines glow and dark panels or the night background of a full clip don't lift.
export const GLOW = { sigma: 10, opacity: 0.7, threshold: 0.3 };
export const FINISH = { vignette: "PI/8", grain: 5, seed: 7 };

export function readCine(project) {
  const p = join(project, "fx/fx.json");
  if (!existsSync(p)) return false;
  try { const fx = JSON.parse(readFileSync(p, "utf8")); return fx.cine === true && fx.look === "night"; }
  catch (e) { throw new Error(`fx/fx.json: ${e.message}`); }
}

// One ffmpeg pass: base video, then each clip overlaid in its window, then captions.
// Base picture: broll/plan.json `video` (relative to broll/, e.g. a renders/picture.mp4
// with edit effects and SFX baked in), else renders/clean.mp4. Its audio is the mix.
export function basePicture(project, plan = loadPlan(project), video) {
  const clean = join(project, "renders/clean.mp4");
  const base = video ? resolve(video) : plan.video ? resolve(join(project, "broll"), plan.video) : clean;
  if (!existsSync(base)) throw new Error(`${relative(project, base)} missing (${base === clean ? "run S2" : "build the picture first"})`);
  return base;
}

// A "layer": "back" clip lives in the base picture (night_base.py), so a clip file newer than the base means a stale base.
function warnStaleBase(plan, base) {
  const stale = (plan.clips ?? []).filter((c) => c.layer === "back" && statSync(c.path).mtimeMs > statSync(base).mtimeMs);
  if (stale.length) console.warn(`assemble: back clip ${stale.map((c) => c.id).join(", ")} is newer than the base picture ${basename(base)}: rebuild the base with night_base.py (the back clip lives in the base)`);
}

// Two glowing clips whose windows overlap by more than a frame: on the overlap only the later clip's glow shows.
function warnGlowOverlaps(glows, fps) {
  glows.forEach((a, i) => glows.slice(i + 1).forEach((b) => {
    const over = Math.min(a.out, b.out) - Math.max(a.in, b.in);
    if (over > 1 / fps + 1e-9) console.warn(`assemble: clips ${a.id} and ${b.id} overlap by ${over.toFixed(2)} s: only the glow of ${b.id} (the later one) shows there`);
  }));
}

export function composite(project, out, { scale = 1, video } = {}) {
  const plan = loadPlan(project);
  const clean = basePicture(project, plan, video);
  const clips = frontClips(plan.clips);
  const cine = readCine(project);
  const captions = join(project, "renders/kit/captions.mov");
  const inputs = [clean, ...clips.map((c) => c.path), ...(existsSync(captions) ? [captions] : [])];
  const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
  const f = [`[0:v]scale=${W}:${H},setsar=1,format=yuva444p[b0]`];
  let last = "b0";
  // cine: overlay keeps 4:4:4 (its default 4:2:0 output shifts levels once the frame goes through RGB)
  const ov = cine ? ":format=yuv444" : "";
  const glows = [];   // night clips that glow: { k, id, in, out }
  warnStaleBase(plan, clean);
  clips.forEach((c, i) => {
    const k = i + 1, en = `enable='between(t,${c.in},${c.out})'`;
    const src = `[${k}:v]scale=${W}:${H},format=yuva444p,tpad=stop_mode=clone:stop_duration=30`;
    if (!(cine && c.theme !== "light" && c.glow !== false)) f.push(`${src},setpts=PTS-STARTPTS+${c.in}/TB[c${k}]`);
    else {
      // the glow branch: only the clip's own window (+0.1 s: the window is inclusive of its last frame), the clip blurred
      // with its alpha premultiplied (black where it is empty), moved to its start; a clip shorter than the window holds its last frame
      // (the threshold goes before the blur: only light lines feed the glow)
      glows.push({ k, id: c.id, in: c.in, out: c.out });
      const th = GLOW.threshold;
      f.push(`${src},split[s${k}][h${k}]`, `[s${k}]setpts=PTS-STARTPTS+${c.in}/TB[c${k}]`,
        `[h${k}]trim=duration=${+(c.out - c.in + 0.1).toFixed(3)},format=gbrap,premultiply=inplace=1,format=gbrp,colorlevels=rimin=${th}:gimin=${th}:bimin=${th},gblur=sigma=${+(GLOW.sigma * scale).toFixed(2)},setpts=PTS-STARTPTS+${c.in}/TB[g${k}]`);
    }
    f.push(`[${last}][c${k}]overlay=0:0:${en}:eof_action=pass${ov}[b${k}]`);
    last = `b${k}`;
  });
  if (cine) {
    if (glows.length) {
      warnGlowOverlaps(glows, Number(plan.fps) > 0 ? Number(plan.fps) : 25);
      // one glow for the whole frame: a black plate with the frame's timing gets every blurred branch in its window,
      // then ONE screen blend of the frame with the plate (black = no change), so the frame makes a single RGB round
      // trip however many night clips there are. Where two glow windows overlap, the later clip's glow wins
      // (an RGB overlay replaces; screen-blending the branches onto the plate instead shifted the frame's levels again).
      f.push(`[${last}]split[m][pl]`, `[pl]format=gbrp,colorchannelmixer=rr=0:gg=0:bb=0[p0]`);
      let plate = "p0";
      for (const g of glows) {
        f.push(`[${plate}][g${g.k}]overlay=0:0:enable='between(t,${g.in},${g.out})':eof_action=pass:format=gbrp[p${g.k}]`);
        plate = `p${g.k}`;
      }
      f.push(`[m]format=gbrp[mr]`, `[mr][${plate}]blend=all_mode=screen:all_opacity=${GLOW.opacity}:shortest=1,format=yuva444p[glow]`);
      last = "glow";
    }
    f.push(`[${last}]format=yuv444p,vignette=angle=${FINISH.vignette},noise=c0s=${FINISH.grain}:c0f=t:all_seed=${FINISH.seed},format=yuva444p[fin]`);
    last = "fin";
  }
  if (existsSync(captions)) {
    const k = inputs.length - 1;
    f.push(`[${k}:v]scale=${W}:${H},format=yuva444p[cap]`);
    // empirical workaround: after the RGB path ffmpeg's default 4:2:0 overlay brings the white captions out at ~218
    // (a range quirk); in 4:4:4 they stay at full white
    f.push(`[${last}][cap]overlay=0:0:eof_action=pass${ov}[bc]`);
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
