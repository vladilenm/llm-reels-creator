#!/usr/bin/env node
// S5 captions: «anchor rail» for Russian vertical reels; «kinetic» (PLAN.json captions.style) for remakes
// with a card above the head — see kineticHtml below.
//
// transcript.clean.json → cues (≤22 chars × ≤2 lines, no hyphenation) →
//   <project>/captions/index.html   transparent 1080×1920 HyperFrames composition
//   <project>/captions.srt          the same cues as SRT
//   <project>/renders/kit/captions.mov   ProRes 4444 with alpha (with --render)
//
// Style follows embedded-captions' rail rules (quiet lower rail, ≥0.5 s on screen,
// 150–250 ms fades, glyph-local shadow) with the active word in the brand accent.
// Fonts come from brand/brand.md and are glyph-checked against every caption
// character before anything renders: a missing glyph is an error.
//
// Usage: node scripts/ru/make-captions.mjs <project> [--render] [--transcript path]

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve, basename, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildCues, toSrt, validateSrt, DANGLING } from "./words-to-srt.mjs";
import { checkGlyphs } from "./check-glyphs.mjs";
import { loadBrand, ROOT } from "./lib/brand.mjs";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r3 = (x) => Math.round(x * 1000) / 1000;

export function captionCues(transcript, brand) {
  const c = brand.captions;
  const cues = buildCues(transcript, { maxChars: c.max_chars_per_line, maxLines: c.max_lines, gap: 0.6, maxCue: 3.6 });
  // Map words back onto lines so each word can light up at its own start.
  const words = transcript.words.filter((w) => (w.type ? w.type === "word" : true));
  let wi = 0;
  return cues.map((cue) => {
    const lines = cue.lines.map((line) => line.split(" ").map((t) => {
      const w = words[wi++];
      return { text: t, start: w?.start ?? cue.start, end: w?.end ?? cue.end };
    }));
    // Keep every cue on screen at least 0.5 s (rail rule) without overlapping the next one.
    // A cue that starts within the first 0.25 s starts at frame 0 (cover + muted hook).
    const start = cue.start < 0.25 ? 0 : cue.start;
    return { start, end: Math.max(cue.end, start + 0.5), lines };
  }).map((cue, i, all) => ({ ...cue, end: Math.min(cue.end, all[i + 1]?.start ?? Infinity) }));
}

// Optional per-reel overrides from PLAN.json `captions`:
//   hide: [{ in, out }]               no captions in these clean-timeline windows
//   baseline_keys: [{ at, baseline_y }] baseline over time, linear between keys,
//                                     brand baseline before the first key
export function applyHide(cues, hide = []) {
  return cues.flatMap((cue) => {
    let { start, end } = cue;
    for (const h of hide) {
      if (start >= h.in && end <= h.out) return [];
      if (start < h.out && end > h.out && start >= h.in) start = h.out;
      if (start < h.in && end > h.in && end <= h.out) end = h.in;
    }
    return end - start < 0.05 ? [] : [{ ...cue, start, end }];
  });
}

export function baselineAt(keys = [], t, base) {
  if (!keys.length || t <= keys[0].at) return keys.length && t === keys[0].at ? keys[0].baseline_y : base;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.at) return a.baseline_y + (b.baseline_y - a.baseline_y) * ((t - a.at) / Math.max(1e-6, b.at - a.at));
  }
  return keys.at(-1).baseline_y;
}

export function captionsHtml(cues, { duration, brand, fontUrl, fps = 30, overrides = {} }) {
  const c = brand.captions;
  const lineH = Math.round(c.font_px * 1.3);
  const keys = [...(overrides.baseline_keys ?? [])].sort((a, b) => a.at - b.at);
  const base = (t) => baselineAt(keys, t, c.baseline_y);
  const clips = cues.map((cue, i) => {
    const d = Math.max(0.05, cue.end - cue.start);
    const top = base(cue.start) - lineH * cue.lines.length;
    const lines = cue.lines.map((ln, li) => `<div class="ln"><span class="bg">${ln.map((w, wj) => `<span class="w" id="w${i}_${li}_${wj}">${esc(w.text)}</span>`).join(" ")}</span></div>`).join("");
    return `<div id="c${i}" class="cue clip" data-start="${r3(cue.start)}" data-duration="${r3(d)}" data-track-index="0" style="top:${top}px">${lines}</div>`;
  }).join("\n");
  const tl = cues.map((cue, i) => {
    const d = cue.end - cue.start;
    // The first cue is fully on screen at frame 0: the hook must read with the sound off.
    const out = cue.start < 0.25
      ? [`tl.set("#c${i}",{opacity:1,y:0},0);`]
      : [`tl.fromTo("#c${i}",{opacity:0,y:14},{opacity:1,y:0,duration:0.18,ease:"power2.out"},${r3(cue.start)});`];
    cue.lines.forEach((ln, li) => ln.forEach((w, wj) => {
      out.push(`tl.set("#w${i}_${li}_${wj}",{color:"${c.active_color}"},${r3(Math.max(cue.start, w.start))});`);
      out.push(`tl.set("#w${i}_${li}_${wj}",{color:"${c.color}"},${r3(Math.min(cue.end, Math.max(w.end, w.start + 0.12)))});`);
    }));
    // Baseline moves inside the cue ride a y tween between consecutive keys.
    for (let k = 1; k < keys.length; k++) {
      const a = keys[k - 1], b = keys[k];
      if (b.baseline_y === a.baseline_y || b.at <= cue.start || a.at >= cue.end) continue;
      const t0 = Math.max(a.at, cue.start), t1 = Math.min(b.at, cue.end);
      out.push(`tl.to("#c${i}",{y:${r3(base(t1) - base(cue.start))},duration:${r3(t1 - t0)},ease:"power3.inOut"},${r3(t0)});`);
    }
    if (d > 0.3) out.push(`tl.to("#c${i}",{opacity:0,duration:0.15,ease:"power1.in"},${r3(cue.end - 0.15)});`);
    return out.join("\n");
  }).join("\n");
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>captions</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face{font-family:"ReelCaption";src:url("${fontUrl}");font-weight:${c.weight};font-style:normal;font-display:block}
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:transparent}
#captions{position:relative;width:1080px;height:1920px;overflow:hidden;background:transparent}
.cue{position:absolute;left:80px;width:880px;text-align:center;font-family:"ReelCaption";font-weight:${c.weight};font-size:${c.font_px}px;line-height:${lineH}px;color:${c.color};letter-spacing:-0.01em;text-shadow:${c.shadow};opacity:0}
.ln{white-space:nowrap}
.ln>span.bg{display:inline-block;padding:2px 18px 6px;border-radius:18px;background:${c.backdrop ?? "transparent"}}
.w{display:inline}
</style></head><body>
<div id="captions" data-composition-id="captions" data-start="0" data-duration="${r3(duration)}" data-width="1080" data-height="1920" data-fps="${fps}">
${clips}
</div>
<script>
const tl=gsap.timeline({paused:true});
${tl}
tl.set({}, {}, ${r3(duration)});
window.__timelines=window.__timelines||{};window.__timelines["captions"]=tl;
</script></body></html>
`;
}

// ---------- «kinetic»: 1–3 words between the window and the head (remakes with a card above) ----------
// PLAN.json captions: { style: "kinetic", kinetic: { y_keys: [{at, y}], theme_keys: [{at, theme: "light"|"dark"}],
//                       theme_default: "light"|"dark" (the night look: "dark"),
//                       (fx/fx.json look "night": dark by default, light over light windows — nightCaptions),
//                       accent: [word start time], accent_words: ["бесплатно"], breaks: [word start time] } }
// Defaults below, overridable in brand.md captions.kinetic. Future words of a group wait dimmed and
// blurred; each lights up on its own start. The accent word is the brand serif italic (font_serif.italic)
// (light theme: dark text on a light wall; dark theme: white, accent with a glow).
export const KINETIC = {
  font_px: 72, weight: 700, accent_scale: 1.12, max_chars: 18, max_words: 3, gap: 0.35, y: 1030,
  accent_font: null, // null → brand.font_serif.italic
  light: { color: "#17141C", dim: "#A9A3B5", accent: null, shadow: "0 0 18px rgba(255,255,255,.75)" },
  dark: { color: "#FFFFFF", dim: "rgba(255,255,255,.42)", accent: null, shadow: "0 2px 10px rgba(0,0,0,.45)" },
};
const kText = (s) => String(s).replace(/[.,;:]+$/u, "");
const kKey = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function kineticConfig(brand, overrides = {}) {
  const b = brand.captions?.kinetic ?? {}, o = overrides.kinetic ?? {};
  const k = { ...KINETIC, ...b, ...o, light: { ...KINETIC.light, ...b.light, ...o.light }, dark: { ...KINETIC.dark, ...b.dark, ...o.dark } };
  k.accent_font ??= brand.font_serif?.italic ?? "brand/fonts/PlayfairDisplay-Italic-Variable.ttf";
  k.light.accent ??= brand.accent ?? "#7C3AED";
  k.dark.accent ??= brand.accent_light ?? brand.accent ?? "#B79CFF";
  return k;
}

export function kineticGroups(transcript, k, overrides = {}) {
  const words = transcript.words.filter((w) => (w.type ? w.type === "word" : true) && String(w.text ?? "").trim());
  const acc = new Set((overrides.kinetic?.accent_words ?? []).map(kKey));
  const accT = overrides.kinetic?.accent ?? [], brk = overrides.kinetic?.breaks ?? [];
  const groups = [];
  let cur = [];
  for (const [i, w] of words.entries()) {
    const text = kText(w.text);
    const len = [...cur.map((x) => x.text), text].join(" ").length;
    const gapBefore = cur.length ? w.start - cur.at(-1).end : 0;
    const forced = brk.some((t) => Math.abs(t - w.start) <= 0.06);
    if (cur.length && (forced || cur.length >= k.max_words || len > k.max_chars || gapBefore > k.gap)) {
      // a preposition or conjunction never ends a group: it moves on with the word it belongs to
      const carry = !forced && gapBefore <= k.gap && cur.length > 1 && DANGLING.has(kKey(cur.at(-1).text)) ? [cur.pop()] : [];
      groups.push(cur); cur = carry;
    }
    const accent = acc.has(kKey(w.text)) || accT.some((t) => Math.abs(t - w.start) <= 0.06);
    cur.push({ text, start: w.start, end: w.end, accent });
    if (/[.!?…,;:—]$/u.test(String(w.text).trim()) || i === words.length - 1) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, i, all) => {
    const start = g[0].start < 0.25 && i === 0 ? 0 : g[0].start;
    const next = all[i + 1]?.[0].start ?? Infinity;
    return { start, end: Math.min(next, g.at(-1).end + 0.6), lines: [g] };
  });
}

const keyAt = (keys = [], t, field, base) => {
  let v = base;
  for (const k of [...keys].sort((a, b) => a.at - b.at)) if (t >= k.at) v = k[field];
  return v;
};

export function kineticHtml(groups, { duration, brand, fontUrl, accentUrl, fps = 30, overrides = {} }) {
  const k = kineticConfig(brand, overrides), o = overrides.kinetic ?? {};
  const lineH = Math.round(k.font_px * 1.25);
  const yKeys = (o.y_keys ?? []).map((x) => ({ at: x.at, baseline_y: x.y }));
  // a group's height is fixed at its start: end it where the height changes, or it lands on the face
  // for the frames between a card's exit and the next group (2026-10-24 youtube-skills)
  groups = groups.map((g) => {
    const y0 = baselineAt(yKeys, g.start, k.y);
    const change = yKeys.filter((x) => x.at > g.start + 0.05 && baselineAt(yKeys, x.at, k.y) !== y0).map((x) => x.at);
    return change.length ? { ...g, end: Math.min(g.end, Math.min(...change)) } : g;
  });
  const clips = groups.map((g, i) => {
    const d = Math.max(0.05, g.end - g.start);
    const th = keyAt(o.theme_keys, g.start, "theme", o.theme_default ?? "light") === "dark" ? "dark" : "light";
    const top = Math.round(baselineAt(yKeys, g.start, k.y) - lineH / 2);
    const ws = g.lines[0].map((w, j) => `<span class="w${w.accent ? " acc" : ""}" id="k${i}_${j}">${esc(w.text)}</span>`).join(" ");
    return `<div id="c${i}" class="kg ${th} clip" data-start="${r3(g.start)}" data-duration="${r3(d)}" data-track-index="0" style="top:${top}px">${ws}</div>`;
  }).join("\n");
  const tl = groups.map((g, i) => {
    const th = keyAt(o.theme_keys, g.start, "theme", o.theme_default ?? "light") === "dark" ? k.dark : k.light;
    const out = g.start < 0.25 ? [`tl.set("#c${i}",{opacity:1,y:0},0);`]
      : [`tl.fromTo("#c${i}",{opacity:0,y:10},{opacity:1,y:0,duration:0.16,ease:"power2.out"},${r3(g.start)});`];
    g.lines[0].forEach((w, j) => {
      const col = w.accent ? th.accent : th.color;
      const at = Math.max(g.start, w.start);
      if (at - g.start < 0.02) out.push(`tl.set("#k${i}_${j}",{color:"${col}",opacity:1,filter:"blur(0px)"},${r3(g.start)});`);
      else out.push(`tl.set("#k${i}_${j}",{color:"${th.dim}",opacity:0.55,filter:"blur(3px)"},${r3(g.start)});`,
        `tl.to("#k${i}_${j}",{color:"${col}",opacity:1,filter:"blur(0px)",duration:0.14,ease:"power2.out"},${r3(at)});`);
    });
    if (g.end - g.start > 0.25) out.push(`tl.to("#c${i}",{opacity:0,duration:0.1,ease:"power1.in"},${r3(g.end - 0.1)});`);
    return out.join("\n");
  }).join("\n");
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>captions</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face{font-family:"ReelCaption";src:url("${fontUrl}");font-weight:${k.weight};font-style:normal;font-display:block}
@font-face{font-family:"ReelAccent";src:url("${accentUrl}");font-weight:400 900;font-style:italic;font-display:block}
*{box-sizing:border-box}
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:transparent}
#captions{position:relative;width:1080px;height:1920px;overflow:hidden;background:transparent}
.kg{position:absolute;left:60px;width:960px;text-align:center;white-space:nowrap;font-family:"ReelCaption";font-weight:${k.weight};font-size:${k.font_px}px;line-height:${lineH}px;letter-spacing:-0.02em;opacity:0}
.kg.light{color:${k.light.color};text-shadow:${k.light.shadow}}
.kg.dark{color:${k.dark.color};text-shadow:${k.dark.shadow}}
.w{display:inline-block}
.acc{font-family:"ReelAccent";font-style:italic;font-weight:600;font-size:${Math.round(k.font_px * k.accent_scale)}px;letter-spacing:-0.01em}
.kg.dark .acc{text-shadow:0 0 22px ${k.dark.accent},0 0 6px ${k.dark.accent}}
</style></head><body>
<div id="captions" data-composition-id="captions" data-start="0" data-duration="${r3(duration)}" data-width="1080" data-height="1920" data-fps="${fps}">
${clips}
</div>
<script>
const tl=gsap.timeline({paused:true});
${tl}
tl.set({}, {}, ${r3(duration)});
window.__timelines=window.__timelines||{};window.__timelines["captions"]=tl;
</script></body></html>
`;
}

// The night look (fx/fx.json "look": "night"): kinetic captions are dark by default and switch to the light theme over
// light windows by themselves — light accents (work/accents.json kind "light") and full clips with theme "light" in
// broll/plan.json. Explicit theme_default / theme_keys in PLAN.json win.
export function nightCaptions(project, overrides = {}) {
  const read = (p) => (existsSync(join(project, p)) ? JSON.parse(readFileSync(join(project, p), "utf8")) : null);
  if (read("fx/fx.json")?.look !== "night") return overrides;
  const k = { ...(overrides.kinetic ?? {}) };
  k.theme_default ??= "dark";
  if (k.theme_keys == null) {
    const win = [...(read("work/accents.json")?.accents ?? []).filter((a) => a.kind === "light"),
      ...(read("broll/plan.json")?.clips ?? []).filter((c) => c.kind === "full" && c.theme === "light")];
    k.theme_keys = win.sort((a, b) => a.in - b.in).flatMap((w) => [{ at: w.in, theme: "light" }, { at: w.out, theme: k.theme_default }]);
  }
  return { ...overrides, kinetic: k };
}

export function makeCaptions(project, { render = false, transcript } = {}) {
  project = resolve(project);
  const brand = loadBrand();
  const t = JSON.parse(readFileSync(transcript ?? join(project, "transcript.clean.json"), "utf8"));
  const duration = Number(t.audio_duration_secs);
  const fps = JSON.parse(readFileSync(join(project, "meta.json"), "utf8")).fps ?? 30;
  const planPath = join(project, "PLAN.json");
  const overrides = nightCaptions(project, existsSync(planPath) ? (JSON.parse(readFileSync(planPath, "utf8")).captions ?? {}) : {});
  const kinetic = (overrides.style ?? brand.captions.style) === "kinetic";
  const cues = applyHide(kinetic ? kineticGroups(t, kineticConfig(brand, overrides), overrides) : captionCues(t, brand), overrides.hide);

  // Font: the brand body font at the caption weight, else the closest weight.
  const files = brand.font_body?.files ?? {};
  const weight = String(brand.captions.weight);
  const fontRel = files[weight] ?? Object.values(files).at(-1);
  if (!fontRel) throw new Error("brand.md has no font_body.files");
  const fontSrc = join(ROOT, fontRel);
  const text = cues.flatMap((c) => c.lines.flat().filter((w) => !w.accent).map((w) => w.text)).join(" ");
  const g = checkGlyphs({ fonts: [fontSrc], text });
  const accentSrc = kinetic ? join(ROOT, kineticConfig(brand, overrides).accent_font) : null;
  if (kinetic) {
    const accText = cues.flatMap((c) => c.lines.flat().filter((w) => w.accent).map((w) => w.text)).join(" ");
    const ga = checkGlyphs({ fonts: [accentSrc], text: accText || "а" });
    if (!ga.ok) throw new Error(`accent font ${basename(accentSrc)} lacks glyphs: ${ga.missing.map((m) => `${m.char} ${m.codepoint}`).join(", ")}`);
  }
  if (!g.ok) throw new Error(`caption font ${basename(fontSrc)} lacks glyphs: ${g.missing.map((m) => `${m.char} ${m.codepoint}`).join(", ")}`);

  const dir = join(project, "captions");
  mkdirSync(join(dir, "fonts"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  copyFileSync(fontSrc, join(dir, "fonts", basename(fontSrc)));
  if (accentSrc) copyFileSync(accentSrc, join(dir, "fonts", basename(accentSrc)));
  copyFileSync(join(ROOT, "node_modules/gsap/dist/gsap.min.js"), join(dir, "assets/gsap.min.js"));
  const opts = { duration, brand, fontUrl: `fonts/${basename(fontSrc)}`, fps, overrides };
  writeFileSync(join(dir, "index.html"), kinetic
    ? kineticHtml(cues, { ...opts, accentUrl: `fonts/${basename(accentSrc)}` })
    : captionsHtml(cues, opts));
  if (!existsSync(join(dir, "meta.json"))) writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: "captions", name: "captions", width: 1080, height: 1920, fps }, null, 2) + "\n");

  const srt = toSrt(cues.map((c) => ({ start: c.start, end: c.end, lines: c.lines.map((l) => l.map((w) => w.text).join(" ")) })));
  const errs = validateSrt(srt);
  if (errs.length) throw new Error(`SRT invalid: ${errs.join("; ")}`);
  writeFileSync(join(project, "captions.srt"), srt);

  const result = { style: kinetic ? "kinetic" : "anchor-rail", cues: cues.length, duration, font: relative(ROOT, fontSrc), html: relative(ROOT, join(dir, "index.html")), srt: relative(ROOT, join(project, "captions.srt")) };
  if (render) {
    mkdirSync(join(project, "renders/kit"), { recursive: true });
    const out = join(project, "renders/kit/captions.mov");
    const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" };
    const lint = spawnSync("npx", ["hyperframes", "lint"], { cwd: dir, encoding: "utf8", env });
    if (/[1-9]\d* error\(s\)/.test(lint.stdout + lint.stderr)) throw new Error(`captions lint failed:\n${lint.stdout}${lint.stderr}`);
    const r = spawnSync("npx", ["hyperframes", "render", dir, "--format", "mov", "--fps", String(fps), "--quiet", "-o", out], { cwd: ROOT, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(`captions render failed:\n${(r.stderr || r.stdout).slice(-1500)}`);
    result.mov = relative(ROOT, out);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a[0]) { console.log("Usage: node scripts/ru/make-captions.mjs <project> [--render] [--transcript path]"); process.exit(1); }
  const i = a.indexOf("--transcript");
  try { console.log(JSON.stringify(makeCaptions(a[0], { render: a.includes("--render"), transcript: i >= 0 ? a[i + 1] : undefined }), null, 2)); }
  catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
