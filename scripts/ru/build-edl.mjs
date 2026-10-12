#!/usr/bin/env node
// S2 "Чистка": one EDL on the SOURCE timeline, one render from the raw file.
//
// Inputs (all on the source timeline):
//   --transcript   transcript.words.json             (normalized, source seconds)
//   --silence-edl  work/source.silence-edl.json      (cut-silences, run WITHOUT --apply)
//   --approved     work/cuts.approved.json           ({ cuts: [{start,end,reason}] } after review)
//   --candidates   work/source.cut-candidates.json   (alternative to --approved:
//                  with --accept recommended, every candidate whose recommend is
//                  "cut" is approved — for fixtures and dry runs only; a real run
//                  goes through Claude's manual review of the whole transcript)
//   --video        assets/raw.mov
//   --project      video-projects/<slug>   (outputs: EDL.json, CUTS.md,
//                  transcript.clean.json, renders/clean.mp4, work/cuts.merged.json)
//   --no-render    write EDL/CUTS/transcript only
//   --max-pause S  widen silence cuts so at most S seconds of pause stay between
//                  two words (55 % after the word, 45 % before the next; head/tail trims untouched)
//
// Rendering and retiming are delegated to the chassis' cut-mistakes/apply-cuts.mjs
// so there is one implementation of trim+concat.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normKey } from "./lib/text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APPLY = join(ROOT, ".claude/skills/cut-mistakes/scripts/apply-cuts.mjs");

export function mergeDeletes(ranges) {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => ({ start: r.start, end: r.end, reasons: [...(r.reasons ?? [r.reason ?? "cut"])] }))
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r.start <= last.end + 0.02) {
      last.end = Math.max(last.end, r.end);
      for (const x of r.reasons) if (!last.reasons.includes(x)) last.reasons.push(x);
    } else out.push(r);
  }
  return out;
}

export function acceptedFromCandidates(doc) {
  return (doc.candidates ?? [])
    .filter((c) => c.recommend === "cut")
    .map((c) => ({ start: c.cut.start, end: c.cut.end, reason: `${c.type}: ${c.removes}`.slice(0, 160) }));
}

// Snap an approved cut to word edges: a boundary that lands inside a word by a
// little (typed or rounded times) would otherwise drop that word from the clean
// transcript while its audio stays in the video. A start inside a word's tail
// moves to the word's end; an end inside a word's head moves to its start.
export function snapCutToWords(cut, words, { tol = 0.12 } = {}) {
  let { start, end } = cut;
  for (const w of words) {
    if (end > w.start && end < w.end && end - w.start <= tol) end = w.start;
    if (start > w.start && start < w.end && w.end - start <= tol) start = w.end;
  }
  return { ...cut, start, end };
}

// Pace: widen silence cuts so the pause left between two words is at most maxPause.
// Only grows a cut, never enters a word; head and tail trims (no word on one side) stay.
export function tightenPauses(cuts, words, maxPause) {
  if (!(maxPause > 0)) return cuts;
  return cuts.map((d) => {
    const prev = [...words].reverse().find((w) => w.end <= d.start + 0.02);
    const next = words.find((w) => w.start >= d.end - 0.02);
    if (!prev || !next) return d;
    const kept = (d.start - prev.end) + (next.start - d.end);
    if (kept <= maxPause + 1e-6) return d;
    const start = Math.min(d.start, Math.max(prev.end, prev.end + maxPause * 0.55));
    const end = Math.max(d.end, Math.min(next.start, next.start - maxPause * 0.45));
    return { ...d, start, end, reasons: [...d.reasons, `темп: пауза ≤ ${maxPause} с`] };
  });
}

// Sentence case after cuts: «…агентов. агенты берут…» → «…агентов. Агенты берут…».
export function sentenceCase(words) {
  return words.map((w, i) => {
    const prev = words[i - 1];
    if (i === 0 || /[.!?…]$/.test(prev.text)) {
      const t = w.text.replace(/^(\P{L}*)(\p{Ll})/u, (_, lead, ch) => lead + ch.toUpperCase());
      return t === w.text ? w : { ...w, text: t };
    }
    return w;
  });
}

const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`; };

function main() {
  const a = process.argv.slice(2);
  const o = { accept: null, render: true };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--no-render") o.render = false;
    else if (k.startsWith("--")) o[k.slice(2).replace(/-(.)/g, (_, c) => c.toUpperCase())] = a[++i];
  }
  if (!o.transcript || !o.project || (!o.approved && !o.candidates)) {
    console.log("Usage: node scripts/ru/build-edl.mjs --transcript T --silence-edl S (--approved A | --candidates C --accept recommended) --video V --project DIR [--no-render]");
    process.exit(1);
  }
  const project = resolve(o.project);
  const work = join(project, "work");
  mkdirSync(work, { recursive: true });
  mkdirSync(join(project, "renders"), { recursive: true });

  const transcript = JSON.parse(readFileSync(resolve(o.transcript), "utf8"));
  const words = transcript.words.filter((w) => (w.type ? w.type === "word" : true));
  const duration = Number(transcript.audio_duration_secs);

  const silence = o.silenceEdl ? JSON.parse(readFileSync(resolve(o.silenceEdl), "utf8")) : { delete_ranges: [] };
  const silenceCuts = tightenPauses((silence.delete_ranges ?? []).map((d) => ({ start: d.start, end: d.end, reasons: d.reasons ?? [d.reason ?? "silence"] })), words, Number(o.maxPause));

  let approved;
  if (o.approved) approved = JSON.parse(readFileSync(resolve(o.approved), "utf8")).cuts ?? [];
  else if (o.accept === "recommended") approved = acceptedFromCandidates(JSON.parse(readFileSync(resolve(o.candidates), "utf8")));
  else throw new Error("--candidates needs --accept recommended");

  approved = approved.map((c) => snapCutToWords(c, words));
  const deletes = mergeDeletes([...silenceCuts, ...approved.map((c) => ({ start: c.start, end: c.end, reasons: [c.reason ?? "approved cut"] }))])
    .map((d) => ({ ...d, start: Math.max(0, d.start), end: Math.min(duration, d.end) }))
    .filter((d) => d.end > d.start);
  for (const d of deletes) {
    d.removed_text = words.filter((w) => w.start < d.end && d.start < w.end).map((w) => w.text).join(" ");
  }
  const keep = [];
  let cur = 0;
  for (const d of deletes) { if (d.start > cur) keep.push({ start: cur, end: d.start }); cur = Math.max(cur, d.end); }
  if (cur < duration) keep.push({ start: cur, end: duration });
  const removed = deletes.reduce((s, d) => s + d.end - d.start, 0);
  const r3 = (x) => Math.round(x * 1000) / 1000;

  const edl = {
    timeline: "source",
    source: o.video ? resolve(o.video).replace(ROOT + "/", "") : null,
    source_duration: r3(duration),
    clean_duration: r3(duration - removed),
    removed: r3(removed),
    cuts: deletes.length,
    delete_ranges: deletes.map((d) => ({ start: r3(d.start), end: r3(d.end), reasons: d.reasons, removed_text: d.removed_text })),
    keep_ranges: keep.map((k) => ({ start: r3(k.start), end: r3(k.end) })),
  };
  writeFileSync(join(project, "EDL.json"), JSON.stringify(edl, null, 2) + "\n");
  writeFileSync(join(project, "CUTS.md"), [
    "# CUTS",
    "",
    `Source ${fmt(duration)} → clean ${fmt(duration - removed)} · removed ${removed.toFixed(2)}s in ${deletes.length} cuts.`,
    "Times are source seconds. Words-only reasons come from the detector; manual decisions say so.",
    "",
    "| # | In | Out | Len | Reason | Removed words |",
    "|---|---|---|---|---|---|",
    ...deletes.map((d, i) => `| ${i + 1} | ${fmt(d.start)} | ${fmt(d.end)} | ${(d.end - d.start).toFixed(2)} | ${d.reasons.join("; ").replaceAll("|", "/")} | ${d.removed_text.replaceAll("|", "/") || "—"} |`),
    "",
  ].join("\n"));

  const merged = join(work, "cuts.merged.json");
  writeFileSync(merged, JSON.stringify({ cuts: edl.delete_ranges.map((d) => ({ start: d.start, end: d.end, reason: d.reasons.join("; ") })) }, null, 2));
  const args = [APPLY, resolve(o.transcript), "--cuts", merged, "--out-dir", work];
  if (o.video) args.push("--video", resolve(o.video), "--output", join(project, "renders/clean.mp4"));
  if (o.video && o.render) args.push("--apply");
  const r = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(r.status ?? 1); }

  const mt = JSON.parse(readFileSync(join(work, "source.mistakes-transcript.json"), "utf8"));
  const clean = {
    text: sentenceCase(mt.words).map((w) => w.text).join(" "),
    language_code: transcript.language_code ?? null,
    audio_duration_secs: mt.audio_duration_secs,
    source_audio_duration_secs: r3(duration),
    timeline: "clean",
    words: sentenceCase(mt.words).map((w) => ({ ...w, type: "word", key: normKey(w.text) })),
  };
  writeFileSync(join(project, "transcript.clean.json"), JSON.stringify(clean, null, 2) + "\n");
  console.log(JSON.stringify({ cuts: deletes.length, removed: r3(removed), clean_duration: edl.clean_duration, clean_words: clean.words.length, rendered: Boolean(o.video && o.render) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
