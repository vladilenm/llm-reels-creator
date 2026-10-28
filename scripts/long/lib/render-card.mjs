// Renders one stage card into a ProRes 4444 clip with alpha: headless Chrome seeks the card's paused GSAP
// timeline frame by frame, ffmpeg encodes the transparent PNG frames. Deterministic, no network (GSAP is served
// from node_modules). Slots are filled in the page, before the card's own script runs, from the resolved plan.

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findChrome } from "../check-stage-cards.mjs";
import { sanitizeInline } from "./plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VERSION = 1;
const dbg = (...a) => { if (process.env.STAGE_DEBUG) console.error("[render-card]", ...a); };   // bump when the capture or the fill logic changes: it is part of the cache key

export async function launchBrowser() {
  const puppeteer = createRequire(join(ROOT, "package.json"))("puppeteer");
  return puppeteer.launch({ headless: true, executablePath: findChrome(), args: ["--no-sandbox"], protocolTimeout: 120000 });
}

// Runs in the page before the card's script. Returns nothing; problems are reported through window.__fillError.
export const fillInPage = (cfg) => {
  const root = document.querySelector("[data-composition-id]");
  root.dataset.duration = String(cfg.duration);
  const errors = [];
  for (const spec of cfg.specs) {
    const el = document.querySelector(`[data-slot="${spec.name}"]`);
    if (!el) continue;
    const v = cfg.values[spec.name];
    if (spec.type === "text") {
      el.innerHTML = v ?? "";
      if (!el.textContent.trim()) { el.innerHTML = ""; el.removeAttribute("data-at"); }
      el.querySelectorAll("em, mark").forEach((x) => x.setAttribute("data-at", "0"));
      continue;
    }
    const tpl = spec.template ? el.querySelector(spec.template) : el.firstElementChild;
    if (!tpl) { errors.push(`slot ${spec.name}: no template element ${spec.template || ""}`); continue; }
    const tplC = tpl.cloneNode(true);
    const jn = spec.joiner ? el.querySelector(spec.joiner) : null;
    const jnC = jn ? jn.cloneNode(true) : null;
    el.replaceChildren();
    (Array.isArray(v) ? v : []).forEach((item, k) => {
      if (k && jnC) el.appendChild(jnC.cloneNode(true));
      const node = tplC.cloneNode(true);
      if (spec.fields) {
        const obj = typeof item === "string" ? { [Object.keys(spec.fields)[0]]: item } : item;
        for (const f of Object.keys(spec.fields)) node.querySelectorAll(`[data-field="${f}"]`).forEach((x) => { x.innerHTML = obj[f] ?? ""; });
      } else node.innerHTML = typeof item === "string" ? item : "";
      el.appendChild(node);
    });
  }
  const timed = [...document.querySelectorAll("[data-at]")];
  if (timed.length !== cfg.at.length) errors.push(`the card has ${timed.length} timed elements (data-at), the plan gives ${cfg.at.length} reveal times in "at"`);
  else timed.forEach((x, i) => x.setAttribute("data-at", String(cfg.at[i])));
  window.__fillError = errors.join("; ");
};

export const overlayCss = `html, body { background: transparent !important; }
.stage { background: transparent !important; }
.stage .glow, .stage .grid, .stage .dock { display: none !important; }`;

export function cacheKey(card, style, fps) {
  const dir = dirname(card.ref.path);
  const h = createHash("sha256");
  h.update(JSON.stringify({ VERSION, fps, duration: card.duration, slots: card.slots, at: card.at, card: card.card }));
  for (const f of [card.ref.path, join(dir, "stage.css"), join(style.dir, "tokens.css")]) h.update(readFileSync(f));
  return h.digest("hex").slice(0, 12);
}

export function clipPath(workDir, card, key) { return join(workDir, "clips", `${card.card}-${key}.mov`); }

// Opens the card with its slots filled and the overlay look; the caller owns (and closes) the page.
async function openCard(browser, card) {
  const gsap = readFileSync(join(ROOT, "node_modules/gsap/dist/gsap.min.js"), "utf8");
  const html = readFileSync(card.ref.path, "utf8");
  const specs = card.ref.slots;
  const values = {};
  for (const s of specs) {
    const v = card.slots[s.name];
    values[s.name] = s.type === "text" ? (v === undefined ? "" : s.raw ? String(v) : sanitizeInline(v)) : (Array.isArray(v) ? v.map((it) => (typeof it === "string" ? sanitizeInline(it) : Object.fromEntries(Object.entries(it).map(([k, x]) => [k, sanitizeInline(String(x))])))) : []);
  }
  const cfg = { duration: card.duration, specs, values, at: card.at };
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  const url = pathToFileURL(card.ref.path).href;
  page.on("request", (r) => {
    if (r.url().includes("gsap.min.js")) return r.respond({ status: 200, contentType: "application/javascript", body: gsap });
    if (r.url() === url) {
      const at = html.indexOf("<script>");
      const body = html.replace("</head>", () => `<style>${overlayCss}</style></head>`).replace("<script>", () => `<script>(${fillInPage.toString()})(${JSON.stringify(cfg)});</script><script>`);
      return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: at < 0 ? html : body });
    }
    return r.continue();
  });
  dbg("goto", card.id);
  await page.goto(url, { waitUntil: "load" });
  dbg("loaded");
  await page.evaluate(() => document.fonts.ready);
  dbg("fonts ready");
  const fillError = await page.evaluate(() => window.__fillError);
  const problem = pageErrors.length ? `page error: ${pageErrors[0]}` : fillError || "";
  return { page, problem };
}

// Fast check without rendering: do the plan and the card agree (slots found, number of timed elements)?
export async function probeCard({ browser, card }) {
  const { page, problem } = await openCard(browser, card);
  try {
    const bad = problem || (await page.evaluate((id) => (window.__timelines && window.__timelines[id] ? "" : "the card did not register its timeline"), card.card));
    return bad ? `${card.id} (${card.card}): ${bad}` : null;
  } finally { await page.close(); }
}

// quality: ProRes qscale (lower is better and bigger)
export async function renderCard({ browser, card, style, out, fps, quality = 11, onProgress }) {
  mkdirSync(dirname(out), { recursive: true });
  const frames = Math.round(card.duration * fps);
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-qscale:v", String(quality), "-vendor", "apl0", out], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ff.stderr.on("data", (d) => { ffErr += d; });
  const closed = new Promise((res) => ff.on("close", res));
  let page;
  try {
    const opened = await openCard(browser, card);
    page = opened.page;
    if (opened.problem) throw new Error(`${card.id} (${card.card}): ${opened.problem}`);
    const timing = await page.evaluate((id) => {
      const tl = window.__timelines[id];
      const kids = tl.getChildren(false, true, true).map((c) => [c.startTime(), c.startTime() + c.duration() / (c.timeScale() || 1)]);
      const exit = kids.reduce((a, b) => (b[0] > a[0] ? b : a));
      const activeEnd = Math.max(0, ...kids.filter((k) => k !== exit).map((k) => k[1]));
      return { quiet: [activeEnd + 0.05, exit[0] - 0.05] };
    }, card.card);
    dbg("timing", JSON.stringify(timing));
    let prev = null;
    for (let k = 0; k < frames; k++) {
      const t = k / fps;
      let buf;
      if (prev && t > timing.quiet[0] && t < timing.quiet[1]) buf = prev;   // nothing moves between the last reveal and the exit
      else {
        // a block, not an arrow expression: seek() returns the timeline, which evaluate would try to serialize
        await page.evaluate((id, t) => { window.__timelines[id].seek(t, false); }, card.card, t);
        buf = Buffer.from(await page.screenshot({ omitBackground: true, type: "png" }));
        prev = buf;
      }
      if (!ff.stdin.write(buf)) await once(ff.stdin, "drain");
      if (onProgress && k % 30 === 0) onProgress(k / frames);
    }
    ff.stdin.end();
    const code = await closed;
    if (code !== 0) throw new Error(`${card.id}: ffmpeg exited with ${code}: ${ffErr.trim().slice(-300)}`);
    return { frames, bytes: statSync(out).size };
  } catch (e) {
    ff.stdin.destroy();
    throw e;
  } finally { if (page) await page.close(); }
}

export const clipExists = (p) => existsSync(p) && statSync(p).size > 0;
