#!/usr/bin/env node
// Agent 2 — Cut Mistakes & Repeats : candidate finder
// Scans a word-level transcript for likely mistakes the speaker would want gone:
//   - stutters / immediate word repeats ("the the", "I-I-I", "that that")
//   - retakes / duplicate sentences (a line re-recorded; keep the clean take)
//   - false starts (an abandoned phrase that restarts)
//
// This is MECHANICAL detection only. It proposes candidate cut ranges with rich
// context + a confidence + a default recommendation, but it does NOT decide.
// The agent reviews each candidate in context (review-gate) before apply-cuts
// renders anything.
//
// Input: any { words: [{ text, start, end, type? }] } transcript — typically
// Agent 1's <stem>.silence-transcript.json (so cuts land on the silenced timeline).
//
// Output (next to the transcript, or --out-dir):
//   <stem>.cut-candidates.json   structured candidates for the agent to review
//   <stem>.cut-candidates.md     human-readable proposal
//
// Usage:
//   node find-cut-candidates.mjs <transcript.json> [--out-dir dir] [--lang auto|ru|en] [--fillers file.json]
//
// Language config (Reels Studio patch): stop words, hesitation sounds, verbal
// fillers and retake markers live in a JSON file instead of being hard-coded.
//   en → ../config/en.json            ru → <repo>/scripts/ru/ru-fillers.json
// `--lang auto` (default) picks ru when most letters are Cyrillic. Extra
// candidate types from the config: `hesitation` (э-э, мм — recommend cut),
// `filler` (ну, типа, короче — review only), `retake_marker` («стоп, ещё раз» —
// cut the marker and the abandoned fragment before it).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";
import { normKey, normPhrase, cyrillicShare, loadFillers, isHesitation, matchPhraseAt } from "../../../../scripts/ru/lib/text.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const args = argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.log("Usage: node find-cut-candidates.mjs <transcript.json> [--out-dir dir] [--lang auto|ru|en] [--fillers file.json]");
  exit(args.length === 0 ? 1 : 0);
}
let transcriptArg = null, outDirArg = null, langArg = "auto", fillersArg = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out-dir") outDirArg = args[++i];
  else if (args[i] === "--lang") langArg = args[++i];
  else if (args[i] === "--fillers") fillersArg = args[++i];
  else if (!transcriptArg) transcriptArg = args[i];
}
const transcriptPath = resolve(transcriptArg);
const transcript = JSON.parse(readFileSync(transcriptPath, "utf8"));
if (!Array.isArray(transcript.words)) { console.error("transcript has no words[]"); exit(1); }

const lang = langArg === "auto"
  ? (cyrillicShare(transcript.words.filter((w) => (w.type ? w.type === "word" : true))) >= 0.5 ? "ru" : "en")
  : langArg;
const fillersPath = fillersArg
  ? resolve(fillersArg)
  : lang === "ru" ? join(SCRIPT_DIR, "../../../../scripts/ru/ru-fillers.json") : join(SCRIPT_DIR, "../config/en.json");
const vocab = loadFillers(fillersPath);

function cleanToken(text) {
  return normKey(text);
}
function displayText(ws) {
  return ws.map((w) => w.text).join(" ").replace(/\s+([,.!?;:])/g, "$1");
}
function fmt(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

const words = transcript.words
  .filter((w) => (w.type ? w.type === "word" : true))
  .filter((w) => Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
  .map((w, index) => ({ index, text: w.text, token: cleanToken(w.text), start: Number(w.start), end: Number(w.end) }));

if (words.length === 0) { console.error("no timed words"); exit(1); }

const candidates = [];
let cid = 0;
const ctx = (i, before = 6, after = 6) =>
  displayText(words.slice(Math.max(0, i - before), Math.min(words.length, i + after)));

// ---- 1) stutters / immediate repeats ----
for (let i = 1; i < words.length; i++) {
  const a = words[i - 1], b = words[i];
  if (!b.token || b.token.length < 1) continue;
  if (isHesitation(b.token, vocab)) continue; // «э э» is reported as hesitation below
  const closeGap = b.start - a.end < 0.5;
  if (a.token === b.token && closeGap) {
    candidates.push({
      id: `c${String(++cid).padStart(3, "0")}`,
      type: "stutter",
      confidence: "high",
      recommend: "cut",
      // remove the first utterance, keep the second
      cut: { start: Number(a.start.toFixed(3)), end: Number(b.start.toFixed(3)) },
      removes: a.text,
      keeps: b.text,
      context: ctx(i),
      note: `repeated "${a.token}"`,
    });
  }
}

// ---- 1b) hesitations and verbal fillers (from the language config) ----
const keys = words.map((w) => w.token);
for (let i = 0; i < words.length; i++) {
  if (isHesitation(keys[i], vocab)) {
    // Remove the sound plus the air up to the next word, so the join is word-to-word.
    const next = words[i + 1];
    const end = next ? Math.min(next.start, words[i].end + 0.25) : words[i].end;
    candidates.push({
      id: `c${String(++cid).padStart(3, "0")}`,
      type: "hesitation",
      confidence: "high",
      recommend: "cut",
      cut: { start: Number(words[i].start.toFixed(3)), end: Number(end.toFixed(3)) },
      removes: words[i].text,
      context: ctx(i),
      note: `hesitation "${keys[i]}"`,
    });
    continue;
  }
  const n = matchPhraseAt(keys, i, vocab.fillerPhrases);
  if (n) {
    const last = words[i + n - 1];
    candidates.push({
      id: `c${String(++cid).padStart(3, "0")}`,
      type: "filler",
      confidence: "low",
      recommend: "review",
      cut: { start: Number(words[i].start.toFixed(3)), end: Number(last.end.toFixed(3)) },
      removes: displayText(words.slice(i, i + n)),
      context: ctx(i),
      note: "verbal filler: often meaningful, cut only if it reads as padding",
    });
    i += n - 1;
  }
}

// ---- 1c) retake markers: «…экономят время. Стоп, ещё раз. Агенты экономят часы…» ----
// The marker itself is always cut. The fragment before it (back to the previous
// sentence end or pause) is the abandoned take; it is a strong cut when the
// restart after the marker repeats its opening words.
const stemOf = (t) => t.slice(0, vocab.stemLength);
for (let i = 0; i < words.length; i++) {
  let n = matchPhraseAt(keys, i, vocab.retakeMarkers);
  if (!n) continue;
  // Chain adjacent markers: «Стоп, ещё раз» is one marker, not two.
  for (let m; (m = matchPhraseAt(keys, i + n, vocab.retakeMarkers)); ) n += m;
  // A marker that is clearly mid-sentence (no punctuation or pause around it) is ordinary speech.
  const before = words[i - 1], after = words[i + n];
  const lastMarker = words[i + n - 1];
  const pausedBefore = !before || /[.!?,…]$/.test(before.text) || words[i].start - before.end > 0.35;
  const pausedAfter = !after || /[.!?,…]$/.test(lastMarker.text) || after.start - lastMarker.end > 0.35;
  if (!pausedBefore || !pausedAfter) { i += n - 1; continue; }
  // Abandoned fragment: walk back to the previous sentence end / long pause.
  // The word right before the marker may itself end with "." (it ends the
  // fragment), so boundaries only count once at least one word is included.
  let fs = i;
  while (fs > 0 && i - fs < 25) {
    const p = words[fs - 1];
    if (fs < i && (/[.!?…]$/.test(p.text) || words[fs].start - p.end > 0.85)) break;
    fs -= 1;
  }
  // Restart overlap: the opening words after the marker vs the fragment.
  const frag = keys.slice(fs, i).filter((k) => k && !vocab.stopwords.has(k)).map(stemOf);
  const restart = keys.slice(i + n, i + n + Math.max(4, frag.length + 2)).filter((k) => k && !vocab.stopwords.has(k)).map(stemOf);
  const shared = frag.filter((t) => restart.includes(t)).length;
  const repeats = frag.length > 0 && shared / frag.length >= 0.4;
  const cutEnd = after ? after.start : lastMarker.end;
  candidates.push({
    id: `c${String(++cid).padStart(3, "0")}`,
    type: "retake_marker",
    confidence: repeats ? "high" : "medium",
    recommend: repeats ? "cut" : "review",
    cut: { start: Number(words[repeats ? fs : i].start.toFixed(3)), end: Number(cutEnd.toFixed(3)) },
    removes: displayText(words.slice(repeats ? fs : i, i + n)),
    keeps: displayText(words.slice(i + n, i + n + 8)),
    marker: displayText(words.slice(i, i + n)),
    context: ctx(i, 10, 10),
    note: repeats
      ? `marker "${displayText(words.slice(i, i + n))}" + restart repeats ${shared}/${frag.length} content words of the fragment before it`
      : `marker "${displayText(words.slice(i, i + n))}" — no clear restart; review whether the fragment before it is abandoned`,
  });
  i += n - 1;
}

// ---- build segments (for retake / false-start detection) ----
const segments = [];
let segStart = 0;
for (let i = 1; i < words.length; i++) {
  const prev = words[i - 1], cur = words[i];
  const gap = cur.start - prev.end;
  const elapsed = cur.end - words[segStart].start;
  const sentenceEnd = /[.!?]$/.test(prev.text ?? "");
  if (gap > 0.85 || (sentenceEnd && elapsed >= 7.5) || elapsed >= 16) {
    segments.push({ id: segments.length + 1, wordStart: segStart, wordEnd: i - 1, start: words[segStart].start, end: prev.end, text: displayText(words.slice(segStart, i)) });
    segStart = i;
  }
}
segments.push({ id: segments.length + 1, wordStart: segStart, wordEnd: words.length - 1, start: words[segStart].start, end: words.at(-1).end, text: displayText(words.slice(segStart)) });

// Stop words come from the language config; Russian tokens are compared on a
// prefix (stemLength) because the language is inflected.
const stop = vocab.stopwords;
function signature(seg) {
  return normPhrase(seg.text)
    .filter((t) => t.length >= vocab.minTokenLength && !stop.has(t) && !isHesitation(t, vocab))
    .map((t) => (lang === "ru" ? t.slice(0, vocab.stemLength) : t))
    .slice(0, 18);
}
function jaccard(a, b) {
  const as = new Set(a), bs = new Set(b);
  let overlap = 0;
  for (const x of as) if (bs.has(x)) overlap++;
  return overlap / Math.max(1, new Set([...as, ...bs]).size);
}
const sigs = segments.map(signature);

// ---- 2) retakes / duplicate sentences (keep the later, cleaner take) ----
for (let i = 0; i < segments.length; i++) {
  for (let j = i + 1; j < Math.min(segments.length, i + 9); j++) {
    if (segments[j].start - segments[i].end > 75) break;
    const score = jaccard(sigs[i], sigs[j]);
    const sameOpening = sigs[i].slice(0, 4).filter((t, idx) => t === sigs[j][idx]).length >= 2;
    if (score >= 0.34 || (score >= 0.24 && sameOpening)) {
      const firstLen = segments[i].end - segments[i].start;
      // A short first take that restarts soon after reads as a false start.
      const isFalseStart = sameOpening && firstLen < 6 && segments[j].start - segments[i].end < 12;
      candidates.push({
        id: `c${String(++cid).padStart(3, "0")}`,
        type: isFalseStart ? "false_start" : "retake",
        confidence: score >= 0.45 ? "high" : score >= 0.34 ? "medium" : "low",
        recommend: score >= 0.34 ? "cut" : "review",
        score: Number(score.toFixed(3)),
        // default: remove the earlier take up to the start of the cleaner restart
        cut: { start: Number(segments[i].start.toFixed(3)), end: Number(segments[j].start.toFixed(3)) },
        removes: segments[i].text,
        keeps: segments[j].text,
        gapBetween: Number((segments[j].start - segments[i].end).toFixed(2)),
        note: `seg ${segments[i].id} ~ seg ${segments[j].id} (jaccard ${score.toFixed(2)}${sameOpening ? ", same opening" : ""})`,
      });
    }
  }
}

// sort by time, de-dupe overlapping retake/false-start proposals (keep highest score)
candidates.sort((a, b) => a.cut.start - b.cut.start);

const byType = candidates.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});
const totalProposed = candidates.filter((c) => c.recommend === "cut").reduce((s, c) => s + (c.cut.end - c.cut.start), 0);

const stem = basename(transcriptPath, extname(transcriptPath)).replace(/[-.]?(silence-)?transcript.*$/i, "") || "source";
const outDir = outDirArg ? resolve(outDirArg) : dirname(transcriptPath);
mkdirSync(outDir, { recursive: true });

const out = {
  agent: "cut-mistakes",
  language: lang,
  vocabulary: fillersPath,
  source_transcript: transcriptPath,
  word_count: words.length,
  segment_count: segments.length,
  counts: byType,
  proposed_cut_seconds: Number(totalProposed.toFixed(2)),
  candidates,
};
const jsonPath = join(outDir, `${stem}.cut-candidates.json`);
writeFileSync(jsonPath, JSON.stringify(out, null, 2));

const md = [
  "# Cut-Mistakes Candidates",
  "",
  `Transcript: ${basename(transcriptPath)} · ${words.length} words · ${segments.length} segments`,
  `Found: ${candidates.length} candidates (` + Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(", ") + ")",
  `Default proposed cuts total ~${totalProposed.toFixed(1)}s. **Review before applying.**`,
  "",
  ...candidates.map((c) =>
    [
      `## ${c.id} · ${c.type} · ${c.confidence} · recommend: ${c.recommend}`,
      `cut ${fmt(c.cut.start)}–${fmt(c.cut.end)} (${(c.cut.end - c.cut.start).toFixed(2)}s) — ${c.note}`,
      "",
      `- removes: ${c.removes}`,
      c.keeps ? `- keeps:   ${c.keeps}` : null,
      c.context ? `- context: …${c.context}…` : null,
      "",
    ].filter(Boolean).join("\n")),
].join("\n");
writeFileSync(join(outDir, `${stem}.cut-candidates.md`), md);

console.log(JSON.stringify({ candidates: candidates.length, counts: byType, proposedCutSeconds: Number(totalProposed.toFixed(2)), outputs: { json: jsonPath, md: join(outDir, `${stem}.cut-candidates.md`) } }, null, 2));
