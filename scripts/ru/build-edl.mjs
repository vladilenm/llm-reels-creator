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
//   --envelope DB  pauses by the audio envelope of --video, not by whisper words (whisper stretches
//                  words into silence): 10 ms windows below DB are silence (Vladilen: −55; quiet word
//                  ends sit at −45…−53). Word edges inside a silence move to it; every pause of at
//                  least --env-min S (0.12) inside or around a kept piece is cut down to --env-keep S
//                  (0.05) of silence on each side of speech; an approved cut that enters a word only
//                  where it is quieter than speech (−35 dB: breaths, clicks, fading tails) trims the
//                  word instead of snapping back to it (otherwise the snap would return the pause).
//                  The adjusted words go to work/transcript.words.env.json; the pauses still audible
//                  at --env-check DB (−42) are listed in work/pauses.remaining.md (+ .json) with ready
//                  source-time cuts, together with the cut words that never reach speech level
//                  (whisper put them on a breath or in silence: check them, or the caption loses them).
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

export const SPEECH_DB = -35;   // Vladilen's syllables sit at −18…−31 dB; breaths, clicks and word tails below

// Audio envelope: RMS dB per 10 ms window of 16 kHz mono; silences are runs below thr of ≥ 0.06 s.
export function envelopeOf(video, thr, win = 0.01) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${video}`);
  const b = r.stdout, n = Math.round(16000 * win), count = Math.floor(b.length / 2 / n);
  const db = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    let s = 0;
    for (let i = k * n; i < (k + 1) * n; i++) { const v = b.readInt16LE(i * 2) / 32768; s += v * v; }
    db[k] = 10 * Math.log10(s / n + 1e-12);
  }
  const sil = [];
  let st = null;
  for (let k = 0; k <= count; k++) {
    const q = k < count && db[k] < thr;
    if (q && st === null) st = k;
    if (!q && st !== null) { if ((k - st) * win >= 0.06) sil.push([st * win, k * win]); st = null; }
  }
  const maxDb = (a, z) => { let m = -200; for (let k = Math.max(0, Math.floor(a / win)); k < Math.min(count, Math.ceil(z / win)); k++) m = Math.max(m, db[k]); return m; };
  return { db, win, sil, maxDb };
}

// Whisper words end or start inside silence: pull those edges to the silence (moves words in place).
export function pullEdgesToSilence(words, sil) {
  const inSil = (t) => sil.find(([a, z]) => t > a && t < z);
  let moved = 0;
  for (const w of words) {
    const se = inSil(w.end); if (se && se[0] > w.start) { w.end = +(se[0] + 0.01).toFixed(3); moved++; }
    const ss = inSil(w.start); if (ss && ss[1] < w.end) { w.start = +(ss[1] - 0.01).toFixed(3); moved++; }
  }
  return moved;
}

// An approved cut that enters a word only where the word is quiet (a breath, a fading tail) trims the
// word instead of letting snapCutToWords move the cut out of it.
export function trimQuietEdges(cut, words, quiet) {
  for (const w of words) {
    if (cut.start > w.start && cut.start < w.end && quiet(cut.start, w.end)) w.end = cut.start;
    if (cut.end > w.start && cut.end < w.end && quiet(w.start, cut.end)) w.start = cut.end;
  }
  return cut;
}

// Pauses by the envelope inside the pieces that the other cuts keep: a silence of ≥ min inside a piece
// keeps `keep` s next to speech on each side; silence at the start or end of a piece (next to a join)
// is trimmed to `keep`; a piece that is silence only goes. Silence before the first word and after the
// last one stays with cut-silences and the approved cuts (the head and the tail of the reel).
export function envelopeCuts(deletes, duration, sil, { min = 0.12, keep = 0.05, first = 0, last = Infinity } = {}) {
  const keepRanges = [];
  let cur = 0;
  for (const d of deletes) { if (d.start > cur) keepRanges.push([cur, d.start]); cur = Math.max(cur, d.end); }
  if (cur < duration) keepRanges.push([cur, duration]);
  const out = [], f2 = (x) => x.toFixed(2);
  for (const [ks, ke] of keepRanges) {
    for (const [a, z] of sil) {
      const s = Math.max(a, ks), e = Math.min(z, ke);
      if (e <= s) continue;
      const atStart = s <= ks + 1e-6 && ks > 0, atEnd = e >= ke - 1e-6 && ke < duration;
      if (!(atStart && atEnd) && (e <= first + 0.01 || s >= last - 0.01)) continue;
      if (atStart && atEnd) out.push({ start: ks, end: ke, reasons: [`огибающая: кусок без речи ${f2(e - s)} с`] });
      else if (atStart && e - s > keep + 0.02) out.push({ start: ks, end: e - keep, reasons: [`огибающая: тишина после склейки ${f2(e - s)} с → ${f2(keep)} с`] });
      else if (atEnd && e - s > keep + 0.02) out.push({ start: s + keep, end: ke, reasons: [`огибающая: тишина до склейки ${f2(e - s)} с → ${f2(keep)} с`] });
      else if (!atStart && !atEnd && s > ks && e < ke && e - s >= min) out.push({ start: s + keep, end: e - keep, reasons: [`огибающая: пауза ${f2(e - s)} с → ${f2(2 * keep)} с`] });
    }
  }
  return out;
}

// Words never straddle an envelope cut: a start inside it moves after it, an end inside it (or a word
// spanning it) moves before it. Words left with no length are silence-only and drop out.
export function fitWordsToCuts(words, cuts) {
  const dropped = [];
  for (const w of words) {
    for (const c of cuts) {
      if (w.start >= c.start && w.start < c.end) w.start = +c.end.toFixed(3);
      if (w.end > c.start && w.end <= c.end) w.end = +c.start.toFixed(3);
      if (w.start < c.start && w.end > c.end) w.end = +c.start.toFixed(3);
    }
    if (w.end <= w.start) dropped.push(w.text);
  }
  return dropped;
}

// Pauses still audible at `thr` after the cut (quiet tails and breaths at −46…−53 dB read as a pause):
// runs ≥ min on the clean timeline, with the source pieces they come from and a cut that keeps `keep`.
export function remainingPauses(keepRanges, env, words, { thr = -42, min = 0.12, keep = 0.05 } = {}) {
  const k0 = (t) => Math.round(t / env.win);
  const rows = [];
  let clean = 0;
  for (const { start, end } of keepRanges) {
    for (let k = k0(start); k < k0(end) && k < env.db.length; k++) rows.push({ src: k * env.win, clean: clean + (k * env.win - start), q: env.db[k] < thr });
    clean += end - start;
  }
  const first = words[0]?.start ?? 0, last = words.at(-1)?.end ?? Infinity;
  const out = [];
  for (let i = 0; i < rows.length;) {
    if (!rows[i].q) { i++; continue; }
    let j = i;
    while (j < rows.length && rows[j].q) j++;
    const a = rows[i], z = rows[j - 1], len = (j - i) * env.win;
    if (len >= min && a.src > first && z.src + env.win < last) {
      const pieces = [];
      for (let k = i; k < j; k++) {
        if (!pieces.length || Math.abs(rows[k].src - rows[k - 1].src - env.win) > 1e-6) pieces.push({ start: rows[k].src, end: rows[k].src + env.win });
        else pieces.at(-1).end = rows[k].src + env.win;
      }
      const before = [...words].reverse().find((w) => w.end <= a.src + 0.02)?.text ?? "";
      const after = words.find((w) => w.start >= z.src + env.win - 0.02)?.text ?? "";
      const r3 = (x) => Math.round(x * 1000) / 1000;
      const cut = pieces.length === 1 && len - 2 * keep > 0.02 ? { start: r3(pieces[0].start + keep), end: r3(pieces[0].end - keep) } : null;
      out.push({ clean_start: r3(a.clean), clean_end: r3(z.clean + env.win), len: r3(len), between: `${before} | ${after}`, source: pieces.map((p) => [r3(p.start), r3(p.end)]), cut });
    }
    i = j;
  }
  return out;
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
  if (o.envelope && !o.video) throw new Error("--envelope needs --video (the audio is measured there)");
  const env = o.envelope ? envelopeOf(resolve(o.video), Number(o.envelope)) : null;
  const envMoved = env ? pullEdgesToSilence(words, env.sil) : 0;
  const envOpt = { thr: Number(o.envCheck ?? -42), min: Number(o.envMin ?? 0.12), keep: Number(o.envKeep ?? 0.05) };

  const silence = o.silenceEdl ? JSON.parse(readFileSync(resolve(o.silenceEdl), "utf8")) : { delete_ranges: [] };
  const silenceCuts = tightenPauses((silence.delete_ranges ?? []).map((d) => ({ start: d.start, end: d.end, reasons: d.reasons ?? [d.reason ?? "silence"] })), words, Number(o.maxPause));

  let approved;
  if (o.approved) approved = JSON.parse(readFileSync(resolve(o.approved), "utf8")).cuts ?? [];
  else if (o.accept === "recommended") approved = acceptedFromCandidates(JSON.parse(readFileSync(resolve(o.candidates), "utf8")));
  else throw new Error("--candidates needs --accept recommended");

  if (env) for (const c of approved) trimQuietEdges(c, words, (x, y) => env.maxDb(x, y) < SPEECH_DB);
  approved = approved.map((c) => snapCutToWords(c, words));
  const asRanges = (cuts) => cuts.map((c) => ({ start: c.start, end: c.end, reasons: [c.reason ?? "approved cut"] }));
  const envCuts = env ? envelopeCuts(mergeDeletes([...silenceCuts, ...asRanges(approved)]), duration, env.sil, { ...envOpt, first: words[0].start, last: words.at(-1).end }) : [];
  const envDropped = env ? fitWordsToCuts(words, envCuts) : [];
  const deletes = mergeDeletes([...silenceCuts, ...envCuts, ...asRanges(approved)])
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

  let source = resolve(o.transcript), remaining = [], quietCut = [];
  if (env) {
    source = join(work, "transcript.words.env.json");
    writeFileSync(source, JSON.stringify({ ...transcript, envelope: { silence_db: Number(o.envelope), ...envOpt, edges_moved: envMoved, dropped: envDropped } }, null, 1));
    remaining = remainingPauses(keep, env, words.filter((w) => w.end > w.start), envOpt);
    quietCut = words.filter((w) => deletes.some((d) => w.start < d.end && d.start < w.end) && env.maxDb(w.start, Math.max(w.end, w.start + 0.01)) < SPEECH_DB)
      .map((w) => ({ text: w.text, start: w.start, end: w.end, max_db: Math.round(env.maxDb(w.start, Math.max(w.end, w.start + 0.01))) }));
    writeFileSync(join(work, "pauses.remaining.json"), JSON.stringify({ check_db: envOpt.thr, min: envOpt.min, pauses: remaining, quiet_words_cut: quietCut }, null, 1));
    writeFileSync(join(work, "pauses.remaining.md"), [
      `# Паузы после чистки, слышные при ${envOpt.thr} дБ (≥ ${envOpt.min} с)`,
      "",
      `Тишина ниже ${o.envelope} дБ уже ужата до ${envOpt.keep} с у речи. Здесь — тихие хвосты и вдохи, которые читаются как пауза.`,
      "Решение за Claude: резать — добавить `cut` в work/cuts.approved.json (секунды исходника) и пересобрать.",
      "",
      "| Чистое время | Длина | Между словами | Исходник | Рез (исходник) |",
      "|---|---|---|---|---|",
      ...remaining.map((p) => `| ${p.clean_start.toFixed(2)}–${p.clean_end.toFixed(2)} | ${p.len.toFixed(2)} | ${p.between.replaceAll("|", "/")} | ${p.source.map(([x, y]) => `${x}–${y}`).join(", ")} | ${p.cut ? `${p.cut.start}–${p.cut.end}` : "через склейку: подрезать края"} |`),
      "",
      ...(quietCut.length ? [
        `## Тихие слова в резах (тише ${SPEECH_DB} дБ)`,
        "",
        "Whisper поставил их на вдох или в тишину: если слово сказано, поправь его время в transcript.words.json, иначе оно выпадет из субтитров.",
        "",
        ...quietCut.map((w) => `- «${w.text}» ${w.start}–${w.end} (макс. ${w.max_db} дБ)`),
        "",
      ] : []),
    ].join("\n"));
  }
  const merged = join(work, "cuts.merged.json");
  writeFileSync(merged, JSON.stringify({ cuts: edl.delete_ranges.map((d) => ({ start: d.start, end: d.end, reason: d.reasons.join("; ") })) }, null, 2));
  const args = [APPLY, source, "--cuts", merged, "--out-dir", work];
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
  const envReport = env ? { envelope: { silence_db: Number(o.envelope), pause_cuts: envCuts.length, edges_moved: envMoved, dropped_words: envDropped, remaining_pauses: remaining.length, quiet_words_cut: quietCut.map((w) => w.text) } } : {};
  console.log(JSON.stringify({ cuts: deletes.length, removed: r3(removed), clean_duration: edl.clean_duration, clean_words: clean.words.length, rendered: Boolean(o.video && o.render), ...envReport }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
