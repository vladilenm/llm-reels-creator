// CARDS.json: the plan of idea cards on the stage. Pure functions, no browser, no ffmpeg.
//
//   {
//     "version": 1,
//     "lead": 0.2, "tail": 0.3, "revealLead": 0.15,        // optional defaults (seconds)
//     "facts": ["12 %"],                                    // numbers the customer confirmed, for metric cards
//     "cards": [{
//       "id": "c1",                                         // optional
//       "card": "quote",                                    // quote|term|doc|steps|compare|metric|flow|chat|base
//       "from": "хорошая карточка",                         // phrase: the card starts `lead` before its first word
//       "until": "за секунду",                              // phrase: the card ends `tail` after its last word
//       "start": 12.4, "end": 19.0,                         // or seconds on the video timeline instead of phrases
//       "slots": { "quote": "Одна <em>мысль</em>", "source": "…" },   // text, or arrays for list slots
//       "at": ["мысль"]                                     // reveals, in DOM order: a phrase or absolute seconds
//     }]
//   }
//
// A phrase may be {"phrase": "…", "nth": 2} when it occurs more than once. Times are on the timeline of the
// transcript (the cleaned video). Slots that the plan does not name are emptied, so sample text never reaches a video.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { loadStyle } from "../check-stage-cards.mjs";

// names of the style's line icons (icons/icons.js holds a JSON object literal)
export function iconNames(style) {
  const p = join(style.dir, "icons/icons.js");
  if (!existsSync(p)) return null;
  const src = readFileSync(p, "utf8");
  const a = src.indexOf("window.STAGE_ICONS = ") + "window.STAGE_ICONS = ".length;
  const b = src.indexOf("};", a) + 1;
  return new Set(Object.keys(JSON.parse(src.slice(a, b))));
}

const IMAGE = /\.(png|jpe?g|webp|svg)$/i;

// Paths to project files in slots: a raw slot (svg) gets the file's markup, any other image path becomes a file URL
// for the page; a screenshot next to its web-shot .json also fills host, mark and label. Missing files are errors.
export function resolveAssets(slots, specs, projectDir, label, errors) {
  const out = structuredClone(slots);
  const file = (v, where) => {
    const p = resolvePath(projectDir, v);
    if (!existsSync(p)) { errors.push(`${where}: no file ${v}`); return null; }
    return p;
  };
  for (const s of specs) {
    const v = out[s.name];
    if (typeof v === "string" && IMAGE.test(v)) {
      const p = file(v, `${label}.${s.name}`);
      if (!p) continue;
      if (s.raw) out[s.name] = readFileSync(p, "utf8").replace(/<\?xml[^>]*>/, "").trim();
      else {
        out[s.name] = pathToFileURL(p).href;
        const meta = p.replace(IMAGE, ".json");
        if (s.name === "image" && existsSync(meta)) {
          const m = JSON.parse(readFileSync(meta, "utf8"));
          out.host ??= m.host;
          if (m.highlight && out.mark === undefined) out.mark = [m.highlight.x, m.highlight.y, m.highlight.w, m.highlight.h].map((x) => x.toFixed(4)).join(",");
          out.label ??= `ИСТОЧНИК · ${m.host}`;
        }
      }
    }
    if (Array.isArray(v)) v.forEach((it, k) => {
      if (!it || typeof it !== "object") return;
      for (const [f, x] of Object.entries(it)) if (typeof x === "string" && IMAGE.test(x)) { const p = file(x, `${label}.${s.name}[${k}].${f}`); if (p) out[s.name][k][f] = pathToFileURL(p).href; }
    });
  }
  return out;
}

export const DEFAULTS = { lead: 0.2, tail: 0.3, revealLead: 0.15, maxOverlap: 0.3, minReveal: 0.4, maxEmptyStage: 6 };
const r3 = (x) => Math.round(x * 1000) / 1000;

export const norm = (s) => String(s).toLowerCase().replaceAll("ё", "е").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
export const stripTags = (s) => String(s).replace(/<[^>]*>/g, "");

// Only <em> and <mark> survive in a slot value; everything else is escaped.
export function sanitizeInline(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&lt;(\/?)(em|mark)&gt;/g, "<$1$2>");
}

// First occurrence of the phrase at or after `after` seconds (nth = 2 for the second, and so on).
export function findPhrase(words, phrase, { after = 0, nth = 1 } = {}) {
  const want = norm(phrase).split(" ").filter(Boolean);
  if (!want.length) return null;
  const toks = words.map((w) => norm(w.text));
  let seen = 0;
  for (let i = 0; i < words.length; i++) {
    if (words[i].start < after - 0.001) continue;
    let j = i, k = 0;
    while (j < words.length && k < want.length) {
      if (!toks[j]) { j++; continue; }
      if (toks[j] !== want[k]) break;
      j++; k++;
    }
    if (k === want.length && ++seen === nth) {
      let last = j - 1;
      while (last > i && !toks[last]) last--;
      return { first: i, last, start: words[i].start, end: words[last].end };
    }
  }
  return null;
}

const asSpec = (v) => (typeof v === "object" && v !== null ? v : { phrase: v });

// Resolve one time reference: a number is taken as is, a phrase is looked up.
function resolveRef(ref, words, { edge, after = 0, errors, label }) {
  if (typeof ref === "number") return ref;
  const spec = asSpec(ref);
  const hit = findPhrase(words, spec.phrase, { after: spec.after ?? after, nth: spec.nth ?? 1 });
  if (!hit) { errors.push(`${label}: the phrase "${spec.phrase}" is not in the transcript${(spec.after ?? after) > 0 ? ` after ${r3(spec.after ?? after)} s` : ""}`); return null; }
  return edge === "end" ? hit.end : hit.start;
}

export function resolvePlan(plan, { words, duration, fps, style = loadStyle(), face, projectDir }) {
  const errors = [], warnings = [];
  const o = { ...DEFAULTS, ...Object.fromEntries(["lead", "tail", "revealLead"].filter((k) => plan[k] !== undefined).map((k) => [k, plan[k]])) };
  const snap = (t) => Math.round(t * fps) / fps;
  const cards = [];
  (plan.cards ?? []).forEach((c, idx) => {
    const id = c.id ?? `c${idx + 1}`;
    const label = `card ${id}`;
    const ref = style.cards.find((x) => x.compId === c.card || x.compId === `stage-${c.card}` || x.id === c.card);
    if (!ref) { errors.push(`${label}: unknown card "${c.card}" (have ${style.cards.map((x) => x.compId.replace("stage-", "")).join(", ")})`); return; }
    const lead = c.lead ?? o.lead, tail = c.tail ?? o.tail;
    if (c.start === undefined && c.from === undefined) { errors.push(`${label}: no start (give "from": a phrase, or "start": seconds)`); return; }
    if (c.end === undefined && c.until === undefined) { errors.push(`${label}: no end (give "until": a phrase, or "end": seconds)`); return; }
    let start = c.start, end = c.end;
    if (start === undefined) {
      const t = resolveRef(c.from, words, { edge: "start", errors, label: `${label} from` });
      start = t === null ? null : Math.max(0, t - lead);
    }
    if (end === undefined) {
      const t = resolveRef(c.until, words, { edge: "end", after: start ?? 0, errors, label: `${label} until` });
      end = t === null ? null : t + tail;
    }
    if (start === null || end === null || start === undefined || end === undefined) { if (start === undefined || end === undefined) errors.push(`${label}: no start/end (give "from"/"until" or "start"/"end")`); return; }
    start = snap(start); end = snap(end);
    const rel = [], abs = [];
    for (const [k, a] of (c.at ?? []).entries()) {
      const t = typeof a === "number" ? a : resolveRef(a, words, { edge: "start", after: Math.max(0, start - 0.5), errors, label: `${label} at[${k}]` });
      if (t === null) continue;
      const when = typeof a === "number" ? t : t - o.revealLead;
      abs.push(r3(when)); rel.push(r3(when - start));
    }
    const slots = projectDir ? resolveAssets(c.slots ?? {}, ref.slots, projectDir, label, errors) : (c.slots ?? {});
    cards.push({ id, card: ref.compId, ref, start: r3(start), end: r3(end), duration: r3(end - start), startFrame: Math.round(start * fps), endFrame: Math.round(end * fps), slots, at: rel, atAbs: abs });
  });
  return { cards, errors, warnings, options: o };
}

export function validatePlan(resolved, { words, duration, fps, face, plan = {}, style = loadStyle() }) {
  const errors = [...resolved.errors], warnings = [...resolved.warnings];
  const icons = iconNames(style);
  const checkIcon = (label, name) => { if (icons && name && !IMAGE.test(String(name)) && !/^file:/.test(String(name)) && !icons.has(String(name))) errors.push(`${label}: no icon "${name}" (have ${[...icons].join(", ")})`); };
  const o = { ...DEFAULTS, ...resolved.options };
  const spoken = norm(words.map((w) => w.text).join(" "));
  for (const c of resolved.cards) {
    const label = `card ${c.id}`;
    const { min, max } = c.ref.duration ?? { min: 0, max: 1e9 };
    if (c.start < 0 || c.end > duration + 0.5) errors.push(`${label}: ${c.start}–${c.end} s is outside the video (0–${r3(duration)} s)`);
    if (c.end <= c.start) errors.push(`${label}: ends before it starts`);
    else if (c.duration < min - 0.001 || c.duration > max + 0.001) errors.push(`${label}: lasts ${c.duration} s, the card allows ${min}–${max} s`);
    const specs = Object.fromEntries(c.ref.slots.map((s) => [s.name, s]));
    for (const name of Object.keys(c.slots)) if (!specs[name]) errors.push(`${label}: the card has no slot "${name}" (have ${Object.keys(specs).join(", ")})`);
    for (const s of c.ref.slots) {
      const v = c.slots[s.name];
      const empty = v === undefined || v === "" || (Array.isArray(v) && !v.length);
      if (s.required && empty) { errors.push(`${label}: the required slot "${s.name}" is empty`); continue; }
      if (empty) continue;
      if (s.icon) checkIcon(`${label}.${s.name}`, v);
      for (const f of s.icons ?? []) if (Array.isArray(v)) v.forEach((it, k) => { if (it && typeof it === "object") checkIcon(`${label}.${s.name}[${k}].${f}`, it[f]); });
      if (s.type === "text") {
        if (typeof v !== "string") errors.push(`${label}.${s.name}: a text slot takes a string`);
        else if (stripTags(v).length > s.maxChars) errors.push(`${label}.${s.name}: ${stripTags(v).length} characters, the limit is ${s.maxChars}`);
      } else if (!Array.isArray(v)) errors.push(`${label}.${s.name}: a list slot takes an array`);
      else {
        if (v.length > s.maxItems) errors.push(`${label}.${s.name}: ${v.length} items, the limit is ${s.maxItems}`);
        v.forEach((item, k) => {
          if (s.fields) {
            const obj = typeof item === "string" ? { [Object.keys(s.fields)[0]]: item } : item;
            for (const [f, val] of Object.entries(obj)) {
              if (!(f in s.fields)) errors.push(`${label}.${s.name}[${k}]: unknown field "${f}" (have ${Object.keys(s.fields).join(", ")})`);
              else if (stripTags(String(val)).length > s.fields[f]) errors.push(`${label}.${s.name}[${k}].${f}: ${stripTags(String(val)).length} characters, the limit is ${s.fields[f]}`);
            }
          } else if (stripTags(String(item)).length > s.maxChars) errors.push(`${label}.${s.name}[${k}]: ${stripTags(String(item)).length} characters, the limit is ${s.maxChars}`);
        });
      }
    }
    // reveals: inside the card, apart, and before the card starts to leave
    c.at.forEach((t, k) => {
      if (k && t < c.at[k - 1] - 0.001) warnings.push(`${label}: reveal ${k + 1} (${t} s) comes before reveal ${k} (${c.at[k - 1]} s)`);
      else if (k && t - c.at[k - 1] < o.minReveal) warnings.push(`${label}: reveals ${k} and ${k + 1} are ${r3(t - c.at[k - 1])} s apart, under ${o.minReveal} s: they read as one`);
      if (t < 0.3) warnings.push(`${label}: reveal ${k + 1} at ${t} s is before the card has entered (0.3 s)`);
      if (t > c.duration - 0.5) warnings.push(`${label}: reveal ${k + 1} at ${t} s is after the card has started to leave (${r3(c.duration - 0.3)} s)`);
    });
    if (c.ref.compId === "stage-metric" && c.slots.value) {
      const digits = stripTags(c.slots.value).replace(/[^\d]/g, "");
      const tag = String(c.slots.tag ?? "");
      const confirmed = (plan.facts ?? []).some((f) => String(f).replace(/[^\d]/g, "") === digits);
      if (digits && !/иллюстрац/i.test(tag) && !confirmed && !new RegExp(`(^|\\D)${digits}(\\D|$)`).test(spoken)) {
        warnings.push(`${label}: the number ${stripTags(c.slots.value)} is neither spoken nor listed in "facts", and the card is not tagged ИЛЛЮСТРАЦИЯ`);
      }
    }
  }
  // one idea at a time
  const sorted = [...resolved.cards].sort((a, b) => a.start - b.start);
  sorted.forEach((c, k) => {
    const n = sorted[k + 1];
    if (n && c.end - n.start > o.maxOverlap + 1e-6) errors.push(`cards ${c.id} and ${n.id} overlap by ${r3(c.end - n.start)} s, the limit is ${o.maxOverlap} s (one idea at a time)`);
  });
  if (face) {
    const full = face.segments.filter((s) => s.state === "full");
    for (const c of sorted) {
      const hidden = full.reduce((a, s) => a + Math.max(0, Math.min(c.end, s.end) - Math.max(c.start, s.start)), 0);
      if (hidden > 0.3) warnings.push(`card ${c.id} is hidden behind the full-frame face for ${r3(hidden)} s: shorten it or move the face`);
    }
    // empty stage: stretches where the face is not full-frame and no card is shown
    const covered = sorted.map((c) => [c.start, c.end]);
    for (const s of face.segments.filter((x) => x.state !== "full")) {
      let t = s.start;
      for (const [a, b] of covered.filter(([a, b]) => b > s.start && a < s.end)) {
        if (a - t > o.maxEmptyStage) warnings.push(`the stage is empty from ${r3(t)} to ${r3(a)} s (${r3(a - t)} s without a card)`);
        t = Math.max(t, b);
      }
      if (s.end - t > o.maxEmptyStage) warnings.push(`the stage is empty from ${r3(t)} to ${r3(s.end)} s (${r3(s.end - t)} s without a card)`);
    }
  }
  return { errors, warnings };
}
