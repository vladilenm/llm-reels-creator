#!/usr/bin/env node
// QA for the cards of the stage style (style-library/03-vladilen-stage).
//
//   node scripts/long/check-stage-cards.mjs [--style 03-vladilen-stage] [--card stage-quote] [--static] [--poster] [--hyperframes]
//
// Static (always, no browser): the card contract: root id = composition id = registered timeline, slots present,
// colors and fonts only through tokens, no autoAlpha/visibility/repeat:-1/random/Date.now, dock placeholder present.
// Browser (default; --static skips it): headless Chrome, GSAP served from node_modules, so no network.
//   · the timeline is paused and at least as long as data-duration (a shorter one flashes black in HyperFrames);
//   · the same frame rendered twice, in between seeking elsewhere, is identical (deterministic, seek-order independent);
//   · every slot filled to its maxChars/maxItems (style.json): no text outside the work area or its card, nothing
//     clipped, text at least 24 px and key slots at least their minPx (40);
//   · --poster writes preview/<card id>.png from the sample content, at the moment everything is shown.
// --hyperframes also runs the framework's own `lint`, `validate` (contrast) and `inspect` on a localized temp copy.
// Exit code 1 when any card has a problem.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIB = join(ROOT, "style-library");
const FRAME = { x: 96, y: 96, w: 1568, h: 888 };   // work area left of the face dock (style.json → layout.content)
const MIN_LABEL_PX = 24;

export function loadStyle(folder = "03-vladilen-stage") {
  const dir = join(LIB, folder);
  const manifest = JSON.parse(readFileSync(join(dir, "style.json"), "utf8"));
  return { dir, manifest, cards: manifest.cards.map((c) => ({ ...c, path: join(dir, c.file), compId: c.file.split("/").pop().replace(/\.html$/, "") })) };
}

const strip = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

// Contract problems of one card, from its source text only.
export function staticCheck(html, card) {
  const out = [];
  const src = strip(html);
  const id = card.compId;
  const root = src.match(/<div\b[^>]*\bdata-composition-id="([^"]+)"[^>]*>/);
  if (!root) return ["no element with data-composition-id"];
  if (root[1] !== id) out.push(`composition id "${root[1]}" differs from the file name "${id}"`);
  if (!new RegExp(`id="${id}"`).test(root[0])) out.push(`the root element has no id="${id}"`);
  for (const [attr, want] of [["data-start", "0"], ["data-width", "1920"], ["data-height", "1080"]]) {
    const m = root[0].match(new RegExp(`${attr}="([^"]*)"`));
    if (!m || m[1] !== want) out.push(`root ${attr} must be "${want}"`);
  }
  const dur = root[0].match(/data-duration="([\d.]+)"/);
  if (!dur) out.push("root has no numeric data-duration");
  else if (card.duration && (+dur[1] < card.duration.min || +dur[1] > card.duration.max)) out.push(`data-duration ${dur[1]} is outside the manifest range ${card.duration.min}–${card.duration.max}`);
  if (!new RegExp(`window\\.__timelines\\[\\s*["']${id}["']\\s*\\]\\s*=`).test(src)) out.push(`no window.__timelines["${id}"] registration`);
  if (!/gsap\.timeline\(\s*\{\s*paused:\s*true/.test(src)) out.push("the timeline is not created paused");
  for (const s of card.slots ?? []) if (!src.includes(`data-slot="${s.name}"`)) out.push(`slot "${s.name}" is not in the card`);
  if (/#[0-9a-fA-F]{3,8}(?![\w-])/.test(src)) out.push("a hex color is written in the card: use tokens");
  if (/font-family\s*:(?!\s*var\()/.test(src)) out.push("a font family is written in the card: use tokens");
  if (/rgba?\(\s*\d/.test(src.replace(/<script[\s\S]*?<\/script>/g, ""))) out.push("a literal rgb()/rgba() color is written in the card: use tokens");
  if (/autoAlpha|["']visibility["']/.test(src)) out.push("autoAlpha/visibility is animated: use opacity");
  if (/repeat\s*:\s*-1/.test(src)) out.push("repeat: -1 is not allowed");
  if (/Math\.random|Date\.now/.test(src)) out.push("non-deterministic call (Math.random/Date.now)");
  if (/<br\s*\/?>/.test(src)) out.push("<br> in card text: let text wrap");
  if (!src.includes('data-role="face-dock"')) out.push("no face-dock placeholder");
  if (!src.includes('href="../../tokens.css"')) out.push("tokens.css is not linked");
  if (!/\.to\([^;]*D - 0\.299\)/.test(src)) out.push("no exit tween ending after the slot (D - 0.299)");
  return out;
}

export function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  const roots = [join(homedir(), ".cache/puppeteer/chrome-headless-shell"), join(homedir(), ".cache/hyperframes/chrome/chrome-headless-shell")];
  for (const r of roots) {
    if (!existsSync(r)) continue;
    for (const v of readdirSync(r).sort().reverse()) {
      const dir = join(r, v);
      for (const sub of readdirSync(dir)) {
        const bin = join(dir, sub, "chrome-headless-shell");
        if (existsSync(bin)) return bin;
      }
    }
  }
  return undefined;
}

const FILLER = "задача контекст результат проверка пример критерий цель шаг".split(" ");

// Runs in the page before the card's own script: every slot gets its worst-case text.
const fillScript = (specs) => `(${((specs) => {
  const fill = (n) => { let s = "", i = 0; while (s.length < n) s += (s ? " " : "") + specs.__words[i++ % specs.__words.length]; return s.slice(0, n).trim(); };
  for (const [name, spec] of Object.entries(specs)) {
    if (name === "__words") continue;
    const el = document.querySelector(`[data-slot="${name}"]`);
    if (!el) continue;
    if (spec.type === "text") el.textContent = spec.stress ?? fill(spec.maxChars);
    else if (spec.type === "list") {
      [...el.children].forEach((kid) => {
        if (spec.fields) for (const [f, max] of Object.entries(spec.fields)) kid.querySelectorAll(`[data-field="${f}"]`).forEach((x) => { x.textContent = fill(max); });
        else if (kid.children.length === 0 || kid.tagName === "LI") kid.textContent = fill(spec.maxChars);
      });
    }
  }
}).toString()})(${JSON.stringify({ ...specs, __words: FILLER })});`;

// Runs in the page after the card is fully shown.
const measure = (frame, specs, minLabel) => {
  const issues = [];
  const inside = (r, f, tol = 2) => r.left >= f.x - tol && r.right <= f.x + f.w + tol && r.top >= f.y - tol && r.bottom <= f.y + f.h + tol;
  const describe = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "");
  const scene = document.querySelector(".scene-content");
  const walker = document.createTreeWalker(scene, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.nodeValue.trim();
    if (!txt) continue;
    const el = n.parentElement;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (!r.width) continue;
    const label = `"${txt.slice(0, 22)}${txt.length > 22 ? "…" : ""}"`;
    if (!inside(r, frame)) issues.push(`text ${label} leaves the work area (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`);
    const box = el.closest(".card");
    if (box) { const b = box.getBoundingClientRect(); if (!inside(r, { x: b.left, y: b.top, w: b.width, h: b.height })) issues.push(`text ${label} spills out of its card`); }
    const slotEl = el.closest("[data-slot]");
    const slot = slotEl ? slotEl.dataset.slot : null;
    const fieldEl = el.closest("[data-field]");
    const field = fieldEl ? fieldEl.dataset.field : null;
    const spec = slot ? specs[slot] : null;
    const min = spec && field && spec.fieldMin && spec.fieldMin[field] ? spec.fieldMin[field] : spec && spec.minPx ? spec.minPx : minLabel;
    const px = parseFloat(cs.fontSize);
    const key = `${slot}|${px}|${min}`;
    if (px + 0.01 < min && !seen.has(key)) { seen.add(key); issues.push(`text in ${slot || describe(el)} is ${px}px, under ${min}px`); }
  }
  for (const el of scene.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if ((cs.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1) || (cs.overflowY !== "visible" && el.scrollHeight > el.clientHeight + 1)) issues.push(`${describe(el)} clips its content (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
  }
  for (const box of scene.querySelectorAll(".card, .wrap")) {
    const b = box.getBoundingClientRect();
    if (!inside(b, frame)) issues.push(`${describe(box)} leaves the work area (${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)})`);
  }
  return issues;
};

async function browserChecks(cards, opts) {
  let puppeteer;
  try { puppeteer = createRequire(join(ROOT, "package.json"))("puppeteer"); }
  catch { return cards.map((c) => ({ card: c, problems: ["puppeteer is not installed (npm install)"] })); }
  const chrome = findChrome();
  const gsap = readFileSync(join(ROOT, "node_modules/gsap/dist/gsap.min.js"), "utf8");
  const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ["--no-sandbox"] });
  const results = [];
  try {
    for (const c of cards) {
      const problems = [];
      const html = readFileSync(c.path, "utf8");
      const specs = Object.fromEntries((c.slots ?? []).map((s) => [s.name, s]));
      const open = async (stress) => {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on("request", (r) => {
          const u = r.url();
          if (u.includes("gsap.min.js")) return r.respond({ status: 200, contentType: "application/javascript", body: gsap });
          if (stress && u === pathToFileURL(c.path).href) {
            const at = html.indexOf("<script>");
            const body = at < 0 ? html : html.slice(0, at) + `<script>${fillScript(specs)}</script>` + html.slice(at);
            return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body });
          }
          return r.continue();
        });
        page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
        await page.goto(pathToFileURL(c.path).href, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        return page;
      };
      const seek = (page, id, t) => page.evaluate((id, t) => { const tl = window.__timelines[id]; tl.pause(); tl.time(t); }, id, t);

      const page = await open(false);
      const info = await page.evaluate((id) => {
        const tl = window.__timelines && window.__timelines[id];
        const root = document.getElementById(id);
        return tl ? { paused: tl.paused(), duration: tl.duration(), data: parseFloat(root.dataset.duration) } : null;
      }, c.compId);
      if (!info) problems.push("the timeline is not registered at load");
      else {
        if (!info.paused) problems.push("the timeline is not paused");
        if (info.duration < info.data - 1e-6) problems.push(`timeline ${info.duration}s is shorter than data-duration ${info.data}s: a black frame flash in HyperFrames`);
        const t = Math.max(0.5, info.data - 0.8);
        await seek(page, c.compId, t);
        await new Promise((r) => setTimeout(r, 120));
        const a = await page.screenshot();
        await seek(page, c.compId, 0.35);
        await seek(page, c.compId, t);
        await new Promise((r) => setTimeout(r, 120));
        const b = await page.screenshot();
        if (!Buffer.from(a).equals(Buffer.from(b))) problems.push(`the frame at ${t}s differs after seeking elsewhere and back: not deterministic`);
        if (opts.poster) {
          const dest = c.preview?.poster ? join(dirname(c.path), "../..", c.preview.poster) : null;
          if (dest) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, a); }
        }
        // the sample content must also leave the work area untouched
        problems.push(...(await page.evaluate(measure, FRAME, specs, MIN_LABEL_PX)).map((m) => `sample: ${m}`));
      }
      await page.close();

      const stress = await open(true);
      const sinfo = await stress.evaluate((id) => ({ data: parseFloat(document.getElementById(id).dataset.duration) }), c.compId);
      await seek(stress, c.compId, Math.max(0.5, sinfo.data - 0.8));
      await new Promise((r) => setTimeout(r, 120));
      problems.push(...(await stress.evaluate(measure, FRAME, specs, MIN_LABEL_PX)).map((m) => `max text: ${m}`));
      await stress.close();
      results.push({ card: c, problems });
    }
  } finally { await browser.close(); }
  return results;
}

// The framework's own checks on a temp copy with fonts localized (HyperFrames rejects paths above the project root).
function frameworkChecks(card, style) {
  const dir = mkdtempSync(join(tmpdir(), "stage-hf-"));
  const out = [];
  try {
    mkdirSync(join(dir, "assets/fonts"), { recursive: true });
    const tokens = readFileSync(join(style.dir, "tokens.css"), "utf8").replace(/\.\.\/\.\.\/brand\/fonts\//g, "assets/fonts/");
    for (const f of tokens.matchAll(/assets\/fonts\/([\w.-]+)/g)) copyFileSync(join(ROOT, "brand/fonts", f[1]), join(dir, "assets/fonts", f[1]));
    writeFileSync(join(dir, "tokens.css"), tokens);
    copyFileSync(join(dirname(card.path), "stage.css"), join(dir, "stage.css"));
    copyFileSync(join(ROOT, "node_modules/gsap/dist/gsap.min.js"), join(dir, "gsap.min.js"));
    if (existsSync(join(style.dir, "icons/icons.js"))) copyFileSync(join(style.dir, "icons/icons.js"), join(dir, "icons.js"));
    writeFileSync(join(dir, "index.html"), readFileSync(card.path, "utf8").replace("../../tokens.css", "tokens.css").replace("../../icons/icons.js", "icons.js").replace(/https:\/\/cdn\.jsdelivr\.net[^"]+gsap\.min\.js/, "gsap.min.js"));
    const bin = join(ROOT, "node_modules/.bin/hyperframes");
    const env = { ...process.env };
    const chrome = findChrome();
    if (chrome) env.CHROME_BIN = chrome;
    for (const args of [["lint", "."], ["validate", "."], ["inspect", "."]]) {
      const r = spawnSync(bin, args, { cwd: dir, encoding: "utf8", timeout: 180000, env });
      const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
      const bad = r.status !== 0 || /✗/.test(text) || /[1-9]\d*\s+error/.test(text) || /WCAG AA contrast warnings/.test(text) || /overflow|clipp/i.test(text) && /issue|✗|⚠/.test(text);
      if (bad) out.push(`hyperframes ${args[0]}: ${text.replace(/\s+/g, " ").trim().slice(0, 360)}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return out;
}

async function main() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
  const style = loadStyle(get("style") ?? "03-vladilen-stage");
  let cards = style.cards;
  if (get("card")) cards = cards.filter((c) => c.compId === get("card") || c.id === get("card"));
  if (!cards.length) { console.error("no cards matched"); process.exit(2); }
  const results = cards.map((card) => ({ card, problems: staticCheck(readFileSync(card.path, "utf8"), card) }));
  if (!a.includes("--static")) {
    const dyn = await browserChecks(cards, { poster: a.includes("--poster") });
    dyn.forEach((d, i) => results[i].problems.push(...d.problems));
  }
  if (a.includes("--hyperframes")) results.forEach((r) => r.problems.push(...frameworkChecks(r.card, style)));
  let bad = 0;
  for (const r of results) {
    console.log(`${r.problems.length ? "FAIL" : "ok  "}  ${r.card.compId}${r.problems.length ? "" : `  (${(r.card.slots ?? []).length} slots)`}`);
    for (const p of r.problems) console.log(`        ${p}`);
    bad += r.problems.length ? 1 : 0;
  }
  console.log(`${results.length - bad}/${results.length} cards pass`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
