#!/usr/bin/env node
// A screenshot of a source page for a `figure` card, with the place of a phrase marked for a highlight.
//
//   node scripts/long/web-shot.mjs <url> --out video-projects/<slug>/assets/web/<name>.png [--phrase "text on the page"]
//        [--width 1280] [--height 800] [--scale 2] [--wait 2500]
//
// Headless Chrome opens the page, hides fixed and sticky layers (cookie banners, sticky headers, chat bubbles) without
// accepting anything, scrolls the first occurrence of --phrase to the upper third, and saves the viewport. Next to the
// PNG it writes <name>.json: url, title, host, phrase, the phrase's box as a share of the image (x, y, w, h), time.
// Nothing is sent anywhere; the page is only read. Exit code 1 when the page does not load or the phrase is missing.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { findChrome } from "./check-stage-cards.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function args(argv) {
  const a = { _: [] };
  for (let k = 0; k < argv.length; k++) {
    if (!argv[k].startsWith("--")) { a._.push(argv[k]); continue; }
    a[argv[k].slice(2)] = argv[++k];
  }
  return a;
}

export async function webShot({ url, out, phrase, width = 1280, height = 800, scale = 2, wait = 2500 }) {
  const puppeteer = createRequire(resolve(ROOT, "package.json"))("puppeteer");
  const browser = await puppeteer.launch({ headless: true, executablePath: findChrome(), args: ["--no-sandbox"], protocolTimeout: 60000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Safari/537.36");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 45000 }));
    await new Promise((r) => setTimeout(r, wait));
    const found = await page.evaluate((phrase) => {
      // hide what floats over the content: banners, sticky bars, popups (nothing is clicked or accepted)
      for (const el of document.querySelectorAll("body *")) {
        const p = getComputedStyle(el).position;
        if (p === "fixed" || p === "sticky") el.style.setProperty("display", "none", "important");
      }
      document.documentElement.style.overflow = "auto";
      document.body.style.overflow = "auto";
      if (!phrase) { window.scrollTo(0, 0); return { ok: true }; }
      const norm = (s) => s.replace(/\s+/g, " ").toLowerCase();
      const want = norm(phrase);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const text = norm(n.nodeValue);
        const i = text.indexOf(want);
        if (i < 0 || !n.parentElement || n.parentElement.offsetParent === null) continue;
        const raw = n.nodeValue;
        // map the normalized index back to the raw text (collapsing whitespace only shortens it)
        let ri = 0, ni = 0;
        while (ni < i && ri < raw.length) { if (/\s/.test(raw[ri])) { while (ri < raw.length && /\s/.test(raw[ri])) ri++; ni++; } else { ri++; ni++; } }
        const range = document.createRange();
        range.setStart(n, ri);
        range.setEnd(n, Math.min(raw.length, ri + phrase.length));
        const first = range.getBoundingClientRect();
        window.scrollBy(0, first.top - innerHeight * 0.33);
        const rects = [...range.getClientRects()];
        const box = rects.reduce((b, r) => ({ l: Math.min(b.l, r.left), t: Math.min(b.t, r.top), r: Math.max(b.r, r.right), b: Math.max(b.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
        return { ok: true, box: { x: box.l / innerWidth, y: box.t / innerHeight, w: (box.r - box.l) / innerWidth, h: (box.b - box.t) / innerHeight } };
      }
      return { ok: false };
    }, phrase ?? null);
    if (!found.ok) throw new Error(`the phrase "${phrase}" is not on ${url}`);
    await new Promise((r) => setTimeout(r, 500));
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out, type: "png" });
    const meta = { url, title: await page.title(), host: new URL(page.url()).host.replace(/^www\./, ""), phrase: phrase ?? null, highlight: found.box ?? null, shotAt: new Date().toISOString().slice(0, 10), width, height, scale };
    writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(meta, null, 2) + "\n");
    return meta;
  } finally { await browser.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a._[0] || !a.out) { console.error("usage: web-shot.mjs <url> --out <file.png> [--phrase text]"); process.exit(2); }
  webShot({ url: a._[0], out: resolve(a.out), phrase: a.phrase, width: Number(a.width ?? 1280), height: Number(a.height ?? 800), scale: Number(a.scale ?? 2), wait: Number(a.wait ?? 2500) })
    .then((m) => { console.log(`${a.out}: ${m.host} · ${m.title.slice(0, 70)}${m.highlight ? ` · phrase at y ${(m.highlight.y * 100).toFixed(0)} %` : ""}`); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
