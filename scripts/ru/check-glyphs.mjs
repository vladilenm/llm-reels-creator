#!/usr/bin/env node
// Fail loudly when a font stack lacks a glyph for any character we will render.
// Browsers silently substitute a system font for missing glyphs; on Cyrillic
// that is the classic "Latin-subset Inter" bug. A character passes if ANY font in
// the stack has it (that is the stack the composition declares).
//
// Usage:
//   node scripts/ru/check-glyphs.mjs --font brand/fonts/Inter.woff2 [--font …]
//        [--text "…"] [--srt captions.srt] [--html file.html …] [--json transcript.json]
// Exit code 1 and a list of missing characters when anything is not covered.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");

const fontCache = new Map();
export function openFont(path) {
  const p = resolve(path);
  if (!fontCache.has(p)) {
    let f = fontkit.openSync(p);
    if (f.fonts) f = f.fonts[0]; // collection
    fontCache.set(p, f);
  }
  return fontCache.get(p);
}

// Characters that never need a glyph: whitespace, controls, joiners, variation selectors.
const IGNORABLE = /[\s\p{Cc}\p{Cf}︀-️]/u;

export function checkGlyphs({ fonts, text }) {
  if (!fonts?.length) throw new Error("no fonts given");
  const faces = fonts.map(openFont);
  const missing = new Map();
  for (const ch of new Set(String(text))) {
    if (IGNORABLE.test(ch)) continue;
    const cp = ch.codePointAt(0);
    if (!faces.some((f) => f.hasGlyphForCodePoint(cp))) missing.set(ch, `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
  }
  return {
    ok: missing.size === 0,
    fonts: faces.map((f) => f.familyName),
    missing: [...missing].map(([char, codepoint]) => ({ char, codepoint })),
  };
}

// Visible text of an HTML composition: drop scripts/styles/tags, decode basic entities.
export function htmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

export function srtText(srt) {
  return srt.split(/\r?\n/).filter((l) => l && !/^\d+$/.test(l) && !/-->/.test(l)).join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const fonts = [];
  const parts = [];
  for (let i = 0; i < a.length; i++) {
    const k = a[i], v = a[i + 1];
    if (k === "--font") { fonts.push(v); i++; }
    else if (k === "--text") { parts.push(v); i++; }
    else if (k === "--srt") { parts.push(srtText(readFileSync(v, "utf8"))); i++; }
    else if (k === "--html") { parts.push(htmlText(readFileSync(v, "utf8"))); i++; }
    else if (k === "--json") { parts.push((JSON.parse(readFileSync(v, "utf8")).words ?? []).map((w) => w.text).join(" ")); i++; }
  }
  if (!fonts.length || !parts.length) {
    console.log("Usage: node scripts/ru/check-glyphs.mjs --font F [--font F2] (--text T | --srt S | --html H | --json J)…");
    process.exit(1);
  }
  const r = checkGlyphs({ fonts, text: parts.join(" ") });
  if (r.ok) console.log(`PASS glyphs: every character is covered by ${r.fonts.join(", ")}`);
  else {
    console.error(`FAIL glyphs: ${r.missing.length} character(s) missing from ${r.fonts.join(", ")}:`);
    for (const m of r.missing) console.error(`  ${m.char}  ${m.codepoint}`);
    process.exit(1);
  }
}
