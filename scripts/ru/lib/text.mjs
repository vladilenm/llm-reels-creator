// Shared Russian text helpers for Reels Studio scripts and the patched
// cut-mistakes detector. Pure functions, no I/O except loadFillers().

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FILLERS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "ru-fillers.json");

// Comparison key: lowercase, ё→е, letters and digits only. «Э-э,» → «ээ».
// Display text is never changed; this key is only for matching.
export function normKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// Same normalization for a multi-word phrase, keeping word boundaries.
export function normPhrase(text) {
  return String(text ?? "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function cyrillicShare(words) {
  const letters = words.map((w) => normKey(w.text ?? w)).join("");
  if (!letters) return 0;
  const cyr = letters.match(/[Ѐ-ӿ]/g)?.length ?? 0;
  const latin = letters.match(/[a-z]/g)?.length ?? 0;
  return cyr / Math.max(1, cyr + latin);
}

export function loadFillers(path = FILLERS_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const phraseList = (list) => (list ?? []).map((p) => normPhrase(p)).filter((p) => p.length);
  return {
    stopwords: new Set((raw.stopwords ?? []).map(normKey)),
    hesitationWords: new Set((raw.hesitations?.words ?? []).map(normKey)),
    hesitationPatterns: (raw.hesitations?.patterns ?? []).map((p) => new RegExp(p, "u")),
    fillerPhrases: phraseList(raw.fillers?.words).sort((a, b) => b.length - a.length),
    retakeMarkers: phraseList(raw.retakeMarkers?.phrases).sort((a, b) => b.length - a.length),
    stemLength: raw.signature?.stemLength ?? 5,
    minTokenLength: raw.signature?.minTokenLength ?? 3,
  };
}

export function isHesitation(key, fillers) {
  if (!key) return false;
  return fillers.hesitationWords.has(key) || fillers.hesitationPatterns.some((re) => re.test(key));
}

// Longest phrase from `phrases` that starts at keys[i]; returns its length in words or 0.
export function matchPhraseAt(keys, i, phrases) {
  for (const p of phrases) {
    if (i + p.length > keys.length) continue;
    let ok = true;
    for (let k = 0; k < p.length; k++) if (keys[i + k] !== p[k]) { ok = false; break; }
    if (ok) return p.length;
  }
  return 0;
}

// Caption line breaking for Russian: at most `maxChars` per line, at most
// `maxLines` lines, never hyphenate inside a word. Returns null when the text
// does not fit (the caller starts a new cue). A single word longer than
// maxChars gets its own line rather than being split.
export function wrapLines(tokens, { maxChars = 22, maxLines = 2 } = {}) {
  const lines = [];
  let cur = "";
  for (const t of tokens) {
    const next = cur ? `${cur} ${t}` : t;
    if (next.length <= maxChars || !cur) cur = next;
    else {
      lines.push(cur);
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}
