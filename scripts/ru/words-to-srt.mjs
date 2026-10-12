#!/usr/bin/env node
// Word transcript -> SRT.
//
//   --mode captions (default)  readable cues: ≤22 chars per line, ≤2 lines, no
//                              hyphenation inside words; a cue also breaks on a
//                              pause, at sentence ends and after --max-cue seconds.
//   --mode words               one cue per word with its exact start/end. Feed this
//                              to motion-broll's words.py: its per-cue estimate is
//                              then exact instead of ±0.2 s.
//
// Usage:
//   node scripts/ru/words-to-srt.mjs <transcript.json> [--mode captions|words]
//        [--out file.srt] [--max-chars 22] [--max-lines 2] [--gap 0.6] [--max-cue 4]

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wrapLines, normKey } from "./lib/text.mjs";

// Russian function words that should not end a caption line when the sentence goes on.
const DANGLING = new Set(["что", "чтобы", "и", "а", "но", "или", "в", "во", "на", "с", "со", "по", "к", "ко", "у", "о", "об", "из", "за", "для", "про", "от", "до", "при", "без", "под", "над", "перед", "через", "как", "потому", "чем", "то", "если", "когда", "где", "это", "не", "ни", "же", "the", "a", "an", "to", "of", "and"]);

// Where to split an overflowing cue: the latest index j (≥ 2 words stay) such that
// the previous word ends a clause («угрозой,») or word j opens a phrase («для …»,
// «в …»), without separating two function words («потому | что»). At most four
// words carry over. 0 = no good boundary, break where the line ran out.
export function phraseBreak(cur, { maxCarry = 4 } = {}) {
  for (let j = cur.length - 1; j >= 2 && cur.length - j <= maxCarry; j--) {
    const prev = cur[j - 1].text;
    if (/[,;:—–]$/.test(prev)) return j;
    if (DANGLING.has(normKey(cur[j].text)) && !DANGLING.has(normKey(prev))) return j;
  }
  return 0;
}

export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function timedWords(transcript) {
  return (transcript.words ?? [])
    .filter((w) => (w.type ? w.type === "word" : true))
    .filter((w) => Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)) && String(w.text ?? "").trim())
    .map((w) => ({ text: String(w.text).trim(), start: Number(w.start), end: Number(w.end) }));
}

export function buildCues(transcript, { mode = "captions", maxChars = 22, maxLines = 2, gap = 0.6, maxCue = 4 } = {}) {
  const words = timedWords(transcript);
  if (mode === "words") return words.map((w) => ({ start: w.start, end: w.end, lines: [w.text] }));

  // Group words into cues, then rebalance, then wrap into lines.
  const groups = [];
  let cur = [];
  for (const w of words) {
    if (cur.length) {
      const prev = cur.at(-1);
      const tooLong = w.end - cur[0].start > maxCue;
      const pause = w.start - prev.end > gap;
      const fits = wrapLines([...cur, w].map((x) => x.text), { maxChars, maxLines });
      if (pause || tooLong || !fits) {
        // Overflow mid-sentence: break at the last phrase boundary instead of
        // where the line ran out («…математика под | угрозой»).
        const j = pause ? 0 : phraseBreak(cur);
        groups.push(cur.slice(0, j || cur.length));
        cur = j ? cur.slice(j) : [];
      }
    }
    cur.push(w);
    if (/[.!?…]$/.test(w.text)) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  // A lone word that continues the previous cue's sentence («…каждую | неделю.»)
  // reads as an orphan: pull the previous cue's last word over when it still fits.
  for (let i = 1; i < groups.length; i++) {
    const g = groups[i], p = groups[i - 1];
    const continues = !/[.!?…]$/.test(p.at(-1).text) && g[0].start - p.at(-1).end <= gap;
    if (g.length === 1 && p.length >= 3 && continues && wrapLines([p.at(-1), ...g].map((x) => x.text), { maxChars, maxLines })) {
      g.unshift(p.pop());
    }
  }
  // A cue must not end on a word that only makes sense with what follows
  // («Пишите в комментарии, что | автоматизировать…»): move it to the next cue.
  for (let i = 0; i < groups.length - 1; i++) {
    const g = groups[i], nx = groups[i + 1], last = g.at(-1);
    const continues = !/[.!?…,;:]$/.test(last.text) && nx[0].start - last.end <= gap;
    if (g.length >= 2 && continues && DANGLING.has(normKey(last.text)) && wrapLines([last, ...nx].map((x) => x.text), { maxChars, maxLines })) {
      nx.unshift(g.pop());
    }
  }
  const cues = groups.map((g) => ({
    start: g[0].start,
    end: g.at(-1).end,
    lines: wrapLines(g.map((w) => w.text), { maxChars, maxLines }) ?? [g.map((w) => w.text).join(" ")],
  }));
  // No overlaps: a cue ends no later than the next one starts.
  for (let i = 0; i < cues.length - 1; i++) cues[i].end = Math.min(cues[i].end, cues[i + 1].start);
  return cues;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join("\n")}\n`).join("\n");
}

// Minimal validator used by tests and check scripts.
export function validateSrt(text) {
  const errors = [];
  const blocks = text.trim().split(/\n\s*\n/);
  let prevEnd = -1;
  const toSec = (t) => { const [h, m, r] = t.split(":"); const [s, ms] = r.split(","); return +h * 3600 + +m * 60 + +s + +ms / 1000; };
  blocks.forEach((b, i) => {
    const L = b.split("\n");
    if (L[0] !== String(i + 1)) errors.push(`cue ${i + 1}: bad index "${L[0]}"`);
    const m = /^(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})$/.exec(L[1] ?? "");
    if (!m) { errors.push(`cue ${i + 1}: bad timing line`); return; }
    const a = toSec(m[1]), z = toSec(m[2]);
    if (z < a) errors.push(`cue ${i + 1}: end before start`);
    if (a < prevEnd - 1e-6) errors.push(`cue ${i + 1}: overlaps previous`);
    if (L.length < 3 || !L.slice(2).join("").trim()) errors.push(`cue ${i + 1}: empty text`);
    prevEnd = z;
  });
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.log("Usage: node scripts/ru/words-to-srt.mjs <transcript.json> [--mode captions|words] [--out file.srt] [--max-chars 22] [--max-lines 2] [--gap 0.6] [--max-cue 4]");
    process.exit(args.length ? 0 : 1);
  }
  const o = { mode: "captions" };
  let input = null, out = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--mode") o.mode = args[++i];
    else if (a === "--out") out = args[++i];
    else if (a === "--max-chars") o.maxChars = Number(args[++i]);
    else if (a === "--max-lines") o.maxLines = Number(args[++i]);
    else if (a === "--gap") o.gap = Number(args[++i]);
    else if (a === "--max-cue") o.maxCue = Number(args[++i]);
    else input = a;
  }
  const srt = toSrt(buildCues(JSON.parse(readFileSync(resolve(input), "utf8")), o));
  const errors = validateSrt(srt);
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  if (out) { writeFileSync(resolve(out), srt); console.log(`wrote ${resolve(out)}`); }
  else process.stdout.write(srt);
}
