#!/usr/bin/env node
// R0 «Приём референса» for /remake: someone else's reel → a remake project with
// the data Claude needs to take it apart. The reference is copied (the original is
// never touched) and is never used in our renders — only studied.
//
//   node scripts/ru/ref-intake.mjs <reference> --slug claude-one-phrase [--brief "…"]
//        [--principles] [--date 2026-10-13] [--every 0.5] [--scene 0.3] [--projects-dir video-projects]
//
// Writes video-projects/<date>-remake-<slug>/:
//   assets/ref.<ext>        copy of the reference (gitignored)
//   REF.json                probe, shots (scene cuts), audio summary
//   review/ref-every*.png   frames every --every s with timecodes (reading burned-in
//                           captions, graphics, framing)
//   review/ref-shots*.png   one frame per shot (locations, rhythm)
//   BRIEF.md, STATUS.md     remake stages R0–R4 (scripts/ru/status.mjs)
// Prints the project path. Refuses to overwrite an existing project.
//
// After R1 (transcript.words.json exists):
//   node scripts/ru/ref-intake.mjs --gaps <project>
// adds REF.json "speech" (words, words per second, talk share) and "audio.gaps":
// loudness inside the pauses between words — a music bed shows up there.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { probe } from "./intake.mjs";
import { contactSheets } from "./contact-sheet.mjs";
import { readStatus, writeStatus, now } from "./status.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const r3 = (x) => Math.round(x * 1000) / 1000;

// Hard cuts from ffmpeg's scene score. Cuts closer than `minGap` merge (a flash or
// a fast wipe reads as one change). Returns shots covering [0, duration].
export function detectShots(file, duration, { threshold = 0.3, minGap = 0.3 } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 2 ** 20 });
  if (r.status !== 0) throw new Error(`scene detection failed: ${r.stderr.slice(-400)}`);
  const cuts = [];
  for (const m of r.stderr.matchAll(/pts_time:\s*([\d.]+)/g)) {
    const t = Number(m[1]);
    if (t > minGap && t < duration - minGap && (!cuts.length || t - cuts.at(-1) >= minGap)) cuts.push(t);
  }
  const edges = [0, ...cuts, duration];
  return edges.slice(0, -1).map((start, i) => ({ i: i + 1, start: r3(start), end: r3(edges[i + 1]), dur: r3(edges[i + 1] - start) }));
}

// Loudness and pauses, for a reader who cannot hear: a bed of music or room tone
// under the speech shows up as almost no silence between phrases.
export function audioSummary(file, duration) {
  const vol = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  if (vol.status !== 0) return null;
  const num = (re) => { const m = vol.stderr.match(re); return m ? Number(m[1]) : null; };
  const sil = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", "silencedetect=noise=-40dB:d=0.25", "-f", "null", "-"], { encoding: "utf8" });
  const silences = [...sil.stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const silent = silences.reduce((a, b) => a + b, 0);
  return {
    mean_db: num(/mean_volume:\s*(-?[\d.]+) dB/),
    max_db: num(/max_volume:\s*(-?[\d.]+) dB/),
    silences_over_0_25s: silences.length,
    silence_share: r3(duration ? silent / duration : 0),
    note: silent / Math.max(duration, 1) < 0.03
      ? "тишины почти нет: либо музыка/фон под голосом, либо паузы вырезаны встык — уточни по `--gaps` после транскрипции"
      : "есть заметные паузы тише −40 дБ: сплошной музыки под голосом, скорее всего, нет",
  };
}

export function speechStats(words, duration) {
  const spoken = words.length ? words.at(-1).end - words[0].start : 0;
  const gaps = [];
  for (let i = 1; i < words.length; i++) {
    const g = words[i].start - words[i - 1].end;
    if (g >= 0.25) gaps.push({ start: r3(words[i - 1].end), end: r3(words[i].start), dur: r3(g) });
  }
  return {
    words: words.length,
    first_word_at: r3(words[0]?.start ?? 0),
    words_per_second: r3(spoken ? words.length / spoken : 0),
    talk_share: r3(duration ? words.reduce((a, w) => a + (w.end - w.start), 0) / duration : 0),
    gaps,
  };
}

function gapLoudness(file, gaps) {
  const out = [];
  for (const g of gaps) {
    // Trim 60 ms at both ends so word tails and breaths do not count.
    const t = g.dur - 0.12;
    if (t < 0.12) continue;
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(g.start + 0.06), "-t", String(t), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
    const m = r.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
    if (m) out.push({ ...g, mean_db: Number(m[1]) });
  }
  return out;
}

function gapsMain(projectArg) {
  const project = resolve(projectArg);
  const refJson = join(project, "REF.json");
  const words = join(project, "transcript.words.json");
  if (!existsSync(refJson) || !existsSync(words)) throw new Error("need REF.json and transcript.words.json (run R0 and R1 first)");
  const ref = JSON.parse(readFileSync(refJson, "utf8"));
  const t = JSON.parse(readFileSync(words, "utf8"));
  const speech = speechStats(t.words, ref.summary.duration);
  const measured = gapLoudness(join(project, ref.copy), speech.gaps);
  const dbs = measured.map((g) => g.mean_db).sort((a, b) => a - b);
  const median = dbs.length ? dbs[Math.floor(dbs.length / 2)] : null;
  const verdict = median === null ? "пауз ≥ 0,25 с нет: речь идёт встык, проверить музыку по цифрам нельзя"
    : median > -38 ? "в паузах громко: под голосом, вероятно, музыка или фон"
    : median > -50 ? "в паузах тихий фон: возможно, тихая музыка или шум комнаты"
    : "в паузах тишина: музыки под голосом, скорее всего, нет";
  const { gaps: _g, ...rest } = speech;
  ref.speech = { ...rest, language: t.language_code ?? null };
  ref.audio = { ...(ref.audio ?? {}), gaps: { count: measured.length, median_db: median, verdict, items: measured } };
  writeFileSync(refJson, JSON.stringify(ref, null, 2) + "\n");
  return { speech: ref.speech, gaps: { count: measured.length, median_db: median, verdict } };
}

function main() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const valueFlags = new Set(["--slug", "--brief", "--date", "--every", "--scene", "--projects-dir"]);
  const src = a.find((x, i) => !x.startsWith("--") && !valueFlags.has(a[i - 1]));
  const slugArg = get("--slug");
  if (!src || !slugArg) {
    console.error('Usage: node scripts/ru/ref-intake.mjs <reference> --slug name [--brief "…"] [--principles] [--every 0.5] [--scene 0.3] [--date YYYY-MM-DD] [--projects-dir dir]');
    process.exit(1);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugArg)) throw new Error("slug: lowercase Latin kebab-case");
  const source = resolve(src);
  if (!existsSync(source)) throw new Error(`reference not found: ${source}`);
  const date = get("--date", new Date().toISOString().slice(0, 10));
  const slug = `${date}-remake-${slugArg}`;
  const project = join(resolve(get("--projects-dir", join(ROOT, "video-projects"))), slug);
  if (existsSync(project)) throw new Error(`project exists: ${relative(ROOT, project)} — resume it (scripts/ru/status.mjs ${relative(ROOT, project)} --next)`);
  for (const d of ["assets", "review"]) mkdirSync(join(project, d), { recursive: true });

  const ref = join(project, "assets", `ref${extname(source).toLowerCase() || ".mp4"}`);
  copyFileSync(source, ref);
  const { summary, warnings: probeWarnings } = probe(ref);
  // intake's warnings are about exporting our reel; for a reference only these matter.
  const warnings = probeWarnings.filter((w) => /no video|no audio|longer than/.test(w));
  if (summary.width && summary.height && Math.abs(summary.width / summary.height - 9 / 16) > 0.02) warnings.push(`not 9:16 (${summary.width}×${summary.height}): contact sheets are drawn 9:16 and look stretched`);

  const shots = detectShots(ref, summary.duration, { threshold: Number(get("--scene", 0.3)) });
  const audio = summary.audio ? audioSummary(ref, summary.duration) : null;
  const durs = shots.map((s) => s.dur).sort((x, y) => x - y);
  const rhythm = {
    shots: shots.length,
    median_shot: r3(durs[Math.floor(durs.length / 2)] ?? 0),
    shortest: durs[0] ?? 0,
    longest: durs.at(-1) ?? 0,
    cuts_per_10s: r3(summary.duration ? ((shots.length - 1) / summary.duration) * 10 : 0),
  };
  writeFileSync(join(project, "REF.json"), JSON.stringify({ source: relative(ROOT, source), copy: relative(project, ref), summary, warnings, rhythm, shots, audio }, null, 2) + "\n");
  return { project, ref, summary, warnings, shots, rhythm, audio, slug, source, brief: get("--brief", ""), principles: a.includes("--principles"), every: Number(get("--every", 0.5)) };
}

async function sheets(ctx) {
  const { project, ref, shots, every } = ctx;
  const timeline = await contactSheets(ref, { out: join(project, "review", "ref-every.png"), every, width: 300, cols: 6, max: 24, zones: "label" });
  const mids = shots.map((s) => r3(s.start + Math.min(s.dur / 2, 0.6)));
  const shotSheets = await contactSheets(ref, { out: join(project, "review", "ref-shots.png"), times: mids, width: 300, cols: 6, max: 24, zones: "label" });
  return { timeline: timeline.sheets, shots: shotSheets.sheets };
}

function writeBrief(ctx, sheetFiles) {
  const { project, summary, warnings, rhythm, audio, slug, source, brief, principles } = ctx;
  const rel = (f) => relative(project, f);
  writeFileSync(join(project, "BRIEF.md"), [
    `# BRIEF · ${slug}`,
    "",
    "Ремейк чужого рилса: разбираем референс, адаптируем текст под Владилена, даём схему",
    "съёмки, потом сырьё идёт в обычный `/reel … --remake`. Референс только изучаем: его",
    "кадры, звук и текст в наш рилс не попадают.",
    "",
    `- Референс: \`${relative(ROOT, source)}\` → копия \`assets/${rel(ctx.ref).split("/").pop()}\``,
    `- Бриф заказчика: ${brief ? `«${brief}»` : "—"}`,
    `- Принципы сценария (--principles): ${principles ? "включены — проверка в R3, `PRINCIPLES.md`" : "выключены"}`,
    `- ${summary.width}×${summary.height}, ${summary.fps} fps, ${summary.duration.toFixed(1)} с${summary.audio ? "" : ", без звука"}`,
    `- Склеек: ${rhythm.shots - 1}, медианный план ${rhythm.median_shot} с (${rhythm.shortest}–${rhythm.longest} с), ${rhythm.cuts_per_10s} склейки на 10 с`,
    audio ? `- Звук (по цифрам, не на слух): средняя громкость ${audio.mean_db} дБ, пауз тише −40 дБ: ${audio.silences_over_0_25s}; ${audio.note}` : "- Звук: нет дорожки",
    `- Кадры: ${[...sheetFiles.timeline, ...sheetFiles.shots].map((f) => `\`${rel(f)}\``).join(", ")}`,
    ...(warnings.length ? ["", "## Предупреждения", "", ...warnings.map((w) => `- ${w}`)] : []),
    "",
  ].join("\n"));
  const s = readStatus(project, { kind: "remake" });
  s.kind = "remake";
  s.brief = brief;
  s.principles = principles;
  s.stages.R0 = { state: "done", note: `${summary.duration.toFixed(1)} с, ${rhythm.shots} планов, листов кадров: ${sheetFiles.timeline.length + sheetFiles.shots.length}`, at: now() };
  writeStatus(project, s);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const gi = process.argv.indexOf("--gaps");
    if (gi >= 0) {
      console.log(JSON.stringify(gapsMain(process.argv[gi + 1] ?? ""), null, 2));
      process.exit(0);
    }
    const ctx = main();
    const files = await sheets(ctx);
    writeBrief(ctx, files);
    console.log(JSON.stringify({ project: relative(ROOT, ctx.project), duration: ctx.summary.duration, rhythm: ctx.rhythm, audio: ctx.audio, sheets: files, warnings: ctx.warnings }, null, 2));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
