#!/usr/bin/env node
// FACE.json planner for the YouTube stage style (style-library/03-vladilen-stage).
//
// The speaker's face has three states on the stage:
//   full  the face fills the frame: hook, questions, personal lines, conclusions, closing
//   dock  a narrow crop at the right edge: the default
//   none  voice and large illustration only: set by hand, never proposed here
// This script reads a word transcript and proposes WHERE the face goes full-frame.
// Every boundary is a hard cut that lands in the breath between two sentences (the
// middle of the gap, at most 0.15 s from the last word), never inside a word. The
// proposal is a draft for the human gate: edit FACE.json, then run --check.
//
//   node scripts/long/face-plan.mjs <transcript.words.json> --out FACE.json
//        [--lang auto|ru|en] [--hook 2.0] [--share 0.07] [--min-gap 11] [--max-gap 75]
//        [--max-full 6] [--closing-max 12] [--min-score 2] [--dock-crop x,y,w,h]
//        [--source-aspect 1.7778] [--explain]
//   node scripts/long/face-plan.mjs --check FACE.json --transcript <transcript.words.json>
//
// Input: the normalized transcript of scripts/ru/normalize-transcript.mjs (`words[]` with
// text/start/end, `audio_duration_secs`, `cyrillic_share`). Times are seconds on the
// timeline of that transcript (the cleaned video), so run it after the cuts.
// Cues live in scripts/long/face-lexicon.json (ru, en). Exit code 1 only on structural errors.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULTS = {
  hookS: 2.0,          // the hook stays full-frame until the first word boundary after this
  share: 0.07,         // seconds of ordinary full-frame anchors, as a share of the video
  minGapS: 11,         // between two full-frame segments
  maxGapS: 75,         // longest stretch without the face returning full-frame
  minFullS: 1.5,
  maxFullS: 6,
  closingMaxS: 12,
  minScore: 2,
  halfGapCap: 0.15,    // a cut sits in the middle of the gap, at most this far from the last word
  sourceAspect: 16 / 9,
};
const STATES = new Set(["full", "dock", "none"]);
const r3 = (x) => Math.round(x * 1000) / 1000;
const L = "\\p{L}\\p{N}_";
const norm = (s) => s.toLowerCase().replaceAll("ё", "е");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function loadLexicon(lang, path = resolve(HERE, "face-lexicon.json")) {
  const lex = JSON.parse(readFileSync(path, "utf8"));
  const set = lex[lang];
  if (!set) throw new Error(`no lexicon for language "${lang}"`);
  const compile = (list) => {
    const alts = list.map((entry) => {
      const prefix = entry.endsWith("*");
      const body = escapeRe(norm(prefix ? entry.slice(0, -1) : entry)).replace(/ /g, "\\s+");
      return prefix ? `${body}[${L}]*` : body;
    });
    return new RegExp(`(?<![${L}])(?:${alts.join("|")})(?![${L}])`, "iu");
  };
  const out = { weights: lex.weights };
  for (const [name, list] of Object.entries(set)) out[name] = compile(list);
  return out;
}

export function loadTranscript(path) {
  const t = JSON.parse(readFileSync(path, "utf8"));
  const words = (t.words ?? []).filter((w) => !w.type || w.type === "word").map((w) => ({ text: w.text, start: Number(w.start), end: Number(w.end) }));
  if (!words.length) throw new Error(`${path}: no words`);
  const duration = Number(t.audio_duration_secs) || words.at(-1).end;
  return { words, duration, cyrillic: Number(t.cyrillic_share ?? 0), language: t.language_code ?? null };
}

// A sentence ends at . ? ! … or, without punctuation, at a pause of 0.6 s or more.
export function splitSentences(words) {
  const out = [];
  let cur = [];
  const flush = (next) => {
    const first = cur[0], last = cur.at(-1);
    out.push({
      i: out.length + 1, start: first.start, end: last.end, n: cur.length,
      text: cur.map((w) => w.text).join(" "), words: cur,
      gapAfter: next ? Math.max(0, next.start - last.end) : Infinity,
    });
    cur = [];
  };
  for (let k = 0; k < words.length; k++) {
    cur.push(words[k]);
    const next = words[k + 1];
    const punct = /[.?!…]["”»')\]]*$/.test(words[k].text);
    if (!next || punct || next.start - words[k].end >= 0.6) flush(next);
  }
  return out;
}

const NEVER = /(?!)/;
const words = (s, from, to) => norm(s.words.slice(from, to).map((w) => w.text).join(" ")).replace(/[?!.,;:"”»')\]]+/g, " ");

// Why a sentence might deserve the face: what a human editor would call a human beat.
// A "how do you…" question is the setup of an explanation, not a beat, so it scores nothing.
function cuesOf(sentence, prev, lex) {
  const text = norm(sentence.text);
  const head = words(sentence, 0, 3);
  const hit = {};
  const w = lex.weights;
  const isQuestion = /\?["”»')\]]*$/.test(sentence.text.trim()) && sentence.n <= 22;
  if (isQuestion && !(lex.procedural ?? NEVER).test(head)) hit.question = w.question;
  if (isQuestion && (lex.rhetorical ?? NEVER).test(words(sentence, -2))) hit.rhetorical = w.rhetorical;
  if (lex.firstPerson.test(text) && sentence.n <= 18) hit.firstPerson = w.firstPerson;
  if (lex.emotion.test(text)) hit.emotion = w.emotion;
  if ((lex.conclusion ?? NEVER).test(words(sentence, 0, 4)) && sentence.n <= 22) hit.conclusion = w.conclusion;
  if ((lex.section ?? NEVER).test(words(sentence, 0, 4)) && sentence.n <= 16) hit.section = w.section;
  if (lex.transition.test(head) && sentence.n <= 16) hit.transition = w.transition;
  if (lex.contrast.test(head)) hit.contrast = w.contrast;
  if (sentence.n <= 7 && prev && prev.n >= 15) hit.punch = w.punch;
  if (sentence.n <= 8) hit.short = w.short;
  if (sentence.n <= 14) hit.compact = w.compact;
  return { cues: hit, outro: lex.outro.test(text), offer: lex.offer.test(text) };
}

export function planFace(transcript, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const lang = o.lang && o.lang !== "auto" ? o.lang : transcript.cyrillic > 0.3 ? "ru" : "en";
  const lex = loadLexicon(lang);
  const duration = transcript.duration;
  const S = splitSentences(transcript.words);
  const info = S.map((s, k) => ({ ...cuesOf(s, S[k - 1], lex) }));
  const scoreOf = (names) => names.reduce((a, n) => a + (lex.weights[n] ?? 0), 0);
  // a cut sits in the middle of the breath between two sentences, at most halfGapCap from the word
  const cutBefore = (k) => (k === 0 ? 0 : r3(S[k - 1].end + Math.min(S[k - 1].gapAfter / 2, o.halfGapCap)));
  const cutAfter = (k) => (k === S.length - 1 ? r3(duration) : r3(S[k].end + Math.min(S[k].gapAfter / 2, o.halfGapCap)));

  // hook: from 0 to the first word boundary after hookS, preferring a punctuation mark
  let hookEnd = 0;
  {
    const words = transcript.words;
    const firstAfter = words.findIndex((w) => w.end >= o.hookS);
    let pick = firstAfter < 0 ? words.length - 1 : firstAfter;
    for (let k = pick; k < words.length && words[k].end <= o.hookS + 1.5; k++) if (/[,;:.!?]$/.test(words[k].text)) { pick = k; break; }
    const next = words[pick + 1];
    hookEnd = r3(next ? words[pick].end + Math.min(Math.max(0, next.start - words[pick].end) / 2, o.halfGapCap) : duration);
  }

  // closing: from the first outro-cue sentence in the last 15 % to the end; offer sentences stay in the dock
  const closeIdx = S.findIndex((s, k) => info[k].outro && s.start >= duration * 0.85);
  const closing = [];
  if (closeIdx >= 0) {
    let run = null;
    for (let k = closeIdx; k < S.length; k++) {
      if (info[k].offer) { run = null; continue; }
      if (!run || S[k].end - S[run.first].start > o.closingMaxS) { run = { first: k, last: k }; closing.push(run); } else run.last = k;
    }
  }
  const closingStart = closeIdx >= 0 ? S[closeIdx].start : duration;

  // candidate units: a sentence, or two short neighbours merged (so "Congratulations." is not a flash)
  const units = [];
  const addUnit = (a, b) => {
    const start = S[a].start, end = S[b].end, dur = end - start;
    const n = S.slice(a, b + 1).reduce((x, s) => x + s.n, 0);
    if (dur < o.minFullS || dur > o.maxFullS) return;
    if (start < hookEnd + o.minGapS || end > closingStart - o.minGapS * 0.5) return;
    if (S.slice(a, b + 1).some((_, d) => info[a + d].offer)) return;
    const names = [...new Set(S.slice(a, b + 1).flatMap((_, d) => Object.keys(info[a + d].cues)))];
    units.push({ first: a, last: b, start, end, dur, n, names, score: scoreOf(names) });
  };
  for (let k = 0; k < S.length; k++) {
    addUnit(k, k);
    if (k + 1 < S.length && S[k].n <= 8 && S[k + 1].n <= 8 && S[k].gapAfter <= 0.9) addUnit(k, k + 1);
  }

  // greedy: best score first; keep the minimum gap and the share budget
  const chosen = [];
  const budget = o.share * duration;
  let used = 0;
  const gapOk = (u) => [...chosen].every((c) => u.start - c.end >= o.minGapS || c.start - u.end >= o.minGapS) && u.start - hookEnd >= o.minGapS;
  for (const u of [...units].filter((u) => u.score >= o.minScore).sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (used + u.dur > budget) continue;
    if (!gapOk(u)) continue;
    chosen.push({ ...u, role: "anchor" });
    used += u.dur;
  }

  // keep-alive: no stretch longer than maxGapS without the face returning
  const bounds = () => [{ end: hookEnd }, ...[...chosen].sort((a, b) => a.start - b.start), { start: closingStart }];
  for (let guard = 0; guard < 200; guard++) {
    const b = bounds();
    let fixed = false;
    for (let k = 0; k + 1 < b.length; k++) {
      const from = b[k].end, to = b[k + 1].start;
      if (to - from <= o.maxGapS) continue;
      const mid = (from + to) / 2;
      const cand = units.filter((u) => u.start >= from + o.minGapS && u.end <= to - o.minGapS)
        .sort((a, c) => (c.score >= 1) - (a.score >= 1) || c.score - a.score || Math.abs(a.start - mid) - Math.abs(c.start - mid))[0];
      if (!cand) continue;
      chosen.push({ ...cand, role: "keep-alive" });
      fixed = true;
      break;
    }
    if (!fixed) break;
  }
  chosen.sort((a, b) => a.start - b.start);

  // assemble contiguous segments
  const full = [];
  full.push({ start: 0, end: hookEnd, role: "hook", why: ["hook"], sentences: [1, S.findIndex((s) => s.end >= hookEnd) + 1 || S.length], text: S[0].text });
  for (const u of chosen) {
    full.push({
      start: cutBefore(u.first), end: cutAfter(u.last),
      role: u.role, why: u.names.length ? u.names : ["keep-alive"], sentences: [u.first + 1, u.last + 1],
      text: S.slice(u.first, u.last + 1).map((s) => s.text).join(" "),
    });
  }
  for (const run of closing) {
    full.push({
      start: cutBefore(run.first), end: cutAfter(run.last),
      role: "closing", why: ["closing"], sentences: [run.first + 1, run.last + 1],
      text: S.slice(run.first, run.last + 1).map((s) => s.text).join(" "),
    });
  }
  full.sort((a, b) => a.start - b.start);

  const segments = [];
  let t = 0;
  for (const f of full) {
    if (f.start > t + 0.0005) segments.push({ state: "dock", start: r3(t), end: r3(f.start), role: "default" });
    segments.push({ state: "full", start: r3(f.start), end: r3(f.end), role: f.role, why: f.why, sentences: f.sentences, text: f.text });
    t = f.end;
  }
  if (t < duration - 0.0005) segments.push({ state: "dock", start: r3(t), end: r3(duration), role: "default" });
  segments.forEach((s, k) => { s.i = k + 1; });

  const crop = parseCrop(o.dockCrop, o.sourceAspect);
  const face = {
    version: 1,
    source: { transcript: o.transcriptName ?? null, duration: r3(duration), language: lang, sentences: S.length, words: transcript.words.length },
    params: {
      hookS: o.hookS, share: o.share, minGapS: o.minGapS, maxGapS: o.maxGapS, minFullS: o.minFullS, maxFullS: o.maxFullS,
      closingMaxS: o.closingMaxS, minScore: o.minScore,
    },
    dock: { side: "right", aspect: "2:3", crop, note: "normalized crop of the source frame; check against the first frame, the default assumes a centred speaker" },
    segments,
    stats: statsOf(segments, duration),
  };
  if (o.explain) face._explain = explain(units, chosen);
  return face;
}

function parseCrop(arg, aspect) {
  if (arg) {
    const [x, y, w, h] = String(arg).split(",").map(Number);
    if ([x, y, w, h].every(Number.isFinite)) return { x, y, w, h };
  }
  const h = 0.7, w = r3(h * (2 / 3) / aspect);
  return { x: r3((1 - w) / 2), y: 0.05, w, h };
}

function statsOf(segments, duration) {
  const by = {};
  for (const s of segments) { by[s.state] ??= { count: 0, seconds: 0 }; by[s.state].count++; by[s.state].seconds += s.end - s.start; }
  for (const k of Object.keys(by)) { by[k].seconds = r3(by[k].seconds); by[k].share = r3(by[k].seconds / duration); }
  const fulls = segments.filter((s) => s.state === "full");
  let longest = 0, shortestGap = Infinity, prevEnd = 0;
  for (const f of fulls) { longest = Math.max(longest, f.start - prevEnd); if (prevEnd > 0) shortestGap = Math.min(shortestGap, f.start - prevEnd); prevEnd = f.end; }
  longest = Math.max(longest, duration - prevEnd);
  return { ...by, longestWithoutFullS: r3(longest), shortestGapBetweenFullS: Number.isFinite(shortestGap) ? r3(shortestGap) : null };
}

function explain(units, chosen) {
  const picked = new Set(chosen.map((c) => `${c.first}-${c.last}`));
  return units.filter((u) => u.score > 0).sort((a, b) => b.score - a.score || a.start - b.start).slice(0, 40).map((u) => ({
    sentences: [u.first + 1, u.last + 1], at: r3(u.start), dur: r3(u.dur), score: u.score, cues: u.names, picked: picked.has(`${u.first}-${u.last}`),
  }));
}

// Structural problems are errors; style problems are warnings.
export function checkFace(face, transcript, opts = {}) {
  const o = { ...DEFAULTS, ...(face.params ?? {}), ...opts };
  const errors = [], warnings = [];
  const segs = face.segments ?? [];
  if (!segs.length) return { errors: ["no segments"], warnings };
  const duration = transcript.duration;
  if (Math.abs(segs[0].start) > 0.05) errors.push(`first segment starts at ${segs[0].start}, not 0`);
  if (Math.abs(segs.at(-1).end - duration) > 0.1) errors.push(`last segment ends at ${segs.at(-1).end}, video is ${r3(duration)} s`);
  segs.forEach((s, k) => {
    const tag = `segment ${s.i ?? k + 1} (${s.state} ${s.start}–${s.end})`;
    if (!STATES.has(s.state)) errors.push(`${tag}: unknown state "${s.state}"`);
    if (!(Number.isFinite(s.start) && Number.isFinite(s.end)) || s.end <= s.start) errors.push(`${tag}: empty or reversed`);
    const nx = segs[k + 1];
    if (nx) {
      if (Math.abs(nx.start - s.end) > 0.001) errors.push(`${tag}: gap or overlap with the next segment (${s.end} → ${nx.start})`);
      if (nx.state === s.state) warnings.push(`${tag}: the next segment has the same state, merge them`);
      const at = s.end;
      const inside = transcript.words.find((w) => at > w.start + 0.05 && at < w.end - 0.05);
      if (inside && s.role !== "hook" && !(nx.role === "hook")) warnings.push(`cut at ${at} falls inside the word "${inside.text}" (${r3(inside.start)}–${r3(inside.end)})`);
    }
    const dur = s.end - s.start;
    if (s.state === "full") {
      const cap = s.role === "closing" ? o.closingMaxS : o.maxFullS;
      if (dur < o.minFullS && s.role !== "hook") warnings.push(`${tag}: full-frame lasts ${r3(dur)} s, under ${o.minFullS} s`);
      if (dur > cap) warnings.push(`${tag}: full-frame lasts ${r3(dur)} s, over ${cap} s`);
    }
    if (s.state === "none" && dur > 75) warnings.push(`${tag}: no face for ${r3(dur)} s, over 75 s`);
  });
  if (segs[0].state !== "full") warnings.push("the video does not open with the face full-frame (no hook)");
  const st = statsOf(segs, duration);
  if (st.longestWithoutFullS > o.maxGapS) warnings.push(`the face is not full-frame for ${st.longestWithoutFullS} s in a row, over ${o.maxGapS} s`);
  if ((st.full?.share ?? 0) > 0.25) warnings.push(`full-frame share ${st.full.share} is over 0.25: the stage loses its point`);
  return { errors, warnings, stats: st };
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let k = 0; k < argv.length; k++) {
    const x = argv[k];
    if (!x.startsWith("--")) { a._.push(x); continue; }
    const key = x.slice(2);
    if (["explain"].includes(key)) a[key] = true;
    else a[key] = argv[++k];
  }
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.check) {
    if (!a.transcript) { console.error("--check needs --transcript <transcript.words.json>"); process.exit(2); }
    const face = JSON.parse(readFileSync(a.check, "utf8"));
    const res = checkFace(face, loadTranscript(a.transcript));
    for (const e of res.errors) console.log(`ERROR   ${e}`);
    for (const w of res.warnings) console.log(`warning ${w}`);
    console.log(`${res.errors.length} errors, ${res.warnings.length} warnings; full ${res.stats?.full?.count ?? 0} segments, ${res.stats?.full?.seconds ?? 0} s`);
    process.exit(res.errors.length ? 1 : 0);
  }
  const input = a._[0];
  if (!input) { console.error("usage: face-plan.mjs <transcript.words.json> --out FACE.json  |  --check FACE.json --transcript <words.json>"); process.exit(2); }
  const num = (v, d) => (v === undefined ? d : Number(v));
  const t = loadTranscript(input);
  const face = planFace(t, {
    lang: a.lang, hookS: num(a.hook, DEFAULTS.hookS), share: num(a.share, DEFAULTS.share), minGapS: num(a["min-gap"], DEFAULTS.minGapS),
    maxGapS: num(a["max-gap"], DEFAULTS.maxGapS), maxFullS: num(a["max-full"], DEFAULTS.maxFullS), closingMaxS: num(a["closing-max"], DEFAULTS.closingMaxS),
    minScore: num(a["min-score"], DEFAULTS.minScore), dockCrop: a["dock-crop"], sourceAspect: num(a["source-aspect"], DEFAULTS.sourceAspect),
    explain: Boolean(a.explain), transcriptName: input.split("/").at(-1),
  });
  const res = checkFace(face, t);
  const out = a.out ?? "FACE.json";
  writeFileSync(out, JSON.stringify(face, null, 2) + "\n");
  const f = face.stats.full;
  console.log(`${out}: ${f.count} full-frame segments, ${f.seconds} s (${(f.share * 100).toFixed(1)} %), longest stretch without the face ${face.stats.longestWithoutFullS} s, language ${face.source.language}`);
  for (const w of res.warnings) console.log(`warning ${w}`);
  for (const e of res.errors) console.log(`ERROR ${e}`);
  process.exit(res.errors.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
