#!/usr/bin/env node
// S0 «Приём»: create the reel project, copy the source (the original is never
// touched), probe it, write PROBE.json / BRIEF.md / STATUS.md.
//
// Usage:
//   node scripts/ru/intake.mjs <source> --slug agents-10h [--brief "…"] [--mode kit|full]
//        [--density light|medium|heavy] [--review-cuts] [--principles] [--date 2026-10-12]
//        [--remake video-projects/<date>-remake-<slug>]
// --remake links an approved remake (scripts/ru/ref-intake.mjs, /remake): BRIEF.md
// points at its SCRIPT.md, STATUS.json keeps the path, and the remake's R4 is closed.
// Prints the project path. Refuses to overwrite an existing project (resume
// with scripts/ru/status.mjs <project> --next instead).

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { extname, join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readStatus, writeStatus, now } from "./status.mjs";
import { ensurePersonalFiles } from "./lib/personal.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  const rate = (x) => { const [n, d] = String(x ?? "0/1").split("/").map(Number); return d ? n / d : n; };
  const rotation = Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0);
  const swap = Math.abs(rotation) === 90 || Math.abs(rotation) === 270;
  const width = swap ? v?.height : v?.width;
  const height = swap ? v?.width : v?.height;
  const avg = rate(v?.avg_frame_rate), real = rate(v?.r_frame_rate);
  const summary = {
    duration: Number(j.format.duration),
    width, height, rotation,
    fps: +avg.toFixed(3),
    fps_rational: v?.avg_frame_rate,
    vfr: Math.abs(avg - real) / Math.max(1, real) > 0.05,
    video_codec: v?.codec_name, pix_fmt: v?.pix_fmt,
    color: { range: v?.color_range ?? null, space: v?.color_space ?? null, transfer: v?.color_transfer ?? null, primaries: v?.color_primaries ?? null },
    audio: a ? { codec: a.codec_name, sample_rate: Number(a.sample_rate), channels: a.channels } : null,
  };
  const warnings = [];
  if (!v) warnings.push("no video stream");
  if (!a) warnings.push("no audio stream: nothing to transcribe");
  if (v && !(width === 1080 && height === 1920)) warnings.push(`not 1080x1920 (${width}x${height}); final export will scale/pad to 1080x1920`);
  if (summary.vfr) warnings.push("variable frame rate: S2 renders a constant-rate clean.mp4");
  if (v?.codec_name === "hevc") warnings.push("HEVC source (typical iPhone); all deliverables are re-encoded to H.264");
  if (summary.color.transfer && /arib-std-b67|smpte2084/.test(summary.color.transfer)) warnings.push(`HDR source (${summary.color.transfer}); export tone-maps to SDR BT.709`);
  if (summary.duration > 180) warnings.push("longer than 3 minutes: this is not a reel");
  return { summary, warnings, raw: j };
}

function main() {
  const a = process.argv.slice(2);
  for (const f of ensurePersonalFiles()) console.error(`created ${f} from its .example template`);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const valueFlags = new Set(["--slug", "--brief", "--mode", "--density", "--date", "--remake"]);
  const src = a.find((x, i) => !x.startsWith("--") && !valueFlags.has(a[i - 1]));
  if (!src || !get("--slug")) {
    console.error('Usage: node scripts/ru/intake.mjs <source> --slug agents-10h [--brief "…"] [--mode kit|full] [--density medium] [--review-cuts] [--principles]');
    process.exit(1);
  }
  const source = resolve(src);
  if (!existsSync(source)) throw new Error(`source not found: ${source}`);
  const date = get("--date", new Date().toISOString().slice(0, 10));
  const slug = `${date}-${get("--slug")}`;
  const project = join(ROOT, "video-projects", slug);
  if (existsSync(project)) throw new Error(`project exists: ${relative(ROOT, project)} — resume it (scripts/ru/status.mjs ${relative(ROOT, project)} --next)`);
  const remake = get("--remake") ? resolve(get("--remake")) : null;
  if (remake && !existsSync(join(remake, "SCRIPT.md"))) throw new Error(`--remake: no SCRIPT.md in ${relative(ROOT, remake)} — finish /remake (ГЕЙТ R) first`);

  const nv = spawnSync(process.execPath, [join(ROOT, "scripts/new-video.mjs"), slug], { encoding: "utf8" });
  if (nv.status !== 0) throw new Error(nv.stderr || nv.stdout);
  for (const d of ["work", "broll", "captions", "review", "renders/kit/broll", "compositions"]) mkdirSync(join(project, d), { recursive: true });

  const ext = extname(source).toLowerCase() || ".mov";
  const raw = join(project, "assets", `raw${ext}`);
  copyFileSync(source, raw);

  const { summary, warnings, raw: probeRaw } = probe(raw);
  writeFileSync(join(project, "PROBE.json"), JSON.stringify({ source: relative(ROOT, source), copy: relative(project, raw), summary, warnings, ffprobe: probeRaw }, null, 2) + "\n");

  // Vertical project metadata; the starter's 16:9 placeholder composition is replaced.
  const meta = JSON.parse(readFileSync(join(project, "meta.json"), "utf8"));
  Object.assign(meta, { id: slug, name: slug, width: 1080, height: 1920, fps: Math.round(summary.fps) || 30 });
  writeFileSync(join(project, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  writeFileSync(join(project, "index.html"), `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${slug}</title></head><body style="margin:0;background:#000">
<!-- Reels Studio: deliverables are built by scripts/ru/*. This root is a placeholder
     so HyperFrames tooling recognises the folder; see STATUS.md and renders/. -->
<div id="root" data-composition-id="root" data-start="0" data-duration="1" data-width="1080" data-height="1920" style="width:1080px;height:1920px"></div>
<script>window.__timelines=window.__timelines||{};</script>
</body></html>
`);

  // Caption helpers (embedded-captions) look for node_modules in their project.
  try { symlinkSync("../../../node_modules", join(project, "captions", "node_modules"), "dir"); } catch {}

  const mode = get("--mode", "kit");
  const density = get("--density", "medium");
  const reviewCuts = a.includes("--review-cuts");
  const principles = a.includes("--principles");
  const brief = get("--brief", "");
  writeFileSync(join(project, "BRIEF.md"), [
    `# BRIEF · ${slug}`,
    "",
    `- Исходник: \`${relative(ROOT, source)}\` → копия \`${relative(project, raw)}\` (оригинал не трогаем)`,
    `- Бриф заказчика: ${brief ? `«${brief}»` : "—"}`,
    `- Режим: \`${mode}\` · плотность графики: \`${density}\` · ГЕЙТ A (--review-cuts): ${reviewCuts ? "включён" : "выключен"} · принципы сценария (--principles): ${principles ? "включены" : "выключены"}`,
    `- Исходник: ${summary.width}×${summary.height}, ${summary.fps} fps, ${summary.duration.toFixed(1)} с, ${summary.video_codec}${summary.audio ? `, звук ${summary.audio.codec} ${summary.audio.sample_rate} Гц` : ", без звука"}`,
    ...(warnings.length ? ["", "## Предупреждения", "", ...warnings.map((w) => `- ${w}`)] : []),
    ...(remake ? [
      "",
      "## Ремейк",
      "",
      `- Сценарий: \`${relative(project, join(remake, "SCRIPT.md"))}\` (утверждён на ГЕЙТЕ R), разбор референса: \`${relative(project, join(remake, "BREAKDOWN.md"))}\`.`,
      "- S2: сверять речь с текстом сценария — фраза, сказанная дважды, это дубль; слова не из сценария не резать без причины.",
      "- S3: план графики собирать из колонки «Что в кадре» сценария на чистом таймлайне; хуки — вариант из сценария плюс два своих.",
      "- Кадры, звук и текст референса в рилс не попадают.",
    ] : []),
    "",
    "## Прочитано перед творческой работой",
    "",
    "- `brand/brand.md`, `lessons.md`, `refs/NOTES.md`, `MOTION_PHILOSOPHY.md` — выводы из них Claude дописывает ниже в S0.",
    "",
  ].join("\n"));

  const s = readStatus(project);
  s.mode = mode; s.density = density; s.reviewCuts = reviewCuts; s.principles = principles; s.brief = brief;
  if (remake) {
    s.remake = relative(ROOT, remake);
    const r = readStatus(remake);
    if (r.stages?.R4) {
      r.stages.R4 = { state: "done", note: `сырьё снято → ${relative(ROOT, project)}`, at: now() };
      writeStatus(remake, r);
    }
  }
  s.stages.S0 = { state: "done", note: `${summary.duration.toFixed(1)} с, ${summary.width}×${summary.height}@${summary.fps}${warnings.length ? `, предупреждений: ${warnings.length}` : ""}`, at: now() };
  writeStatus(project, s);
  console.log(JSON.stringify({ project: relative(ROOT, project), summary, warnings }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
