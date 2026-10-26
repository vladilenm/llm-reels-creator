import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p = "night-") => mkdtempSync(join(tmpdir(), p));
const py = (code) => spawnSync("python3", ["-c", code], { cwd: ROOT, encoding: "utf8" });
const ff = (...a) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

function buildClip(fragment, files = {}) {
  const d = tmp("clip-");
  mkdirSync(join(d, "clips"));
  for (const [name, buf] of Object.entries(files)) writeFileSync(join(d, "clips", name), buf);
  writeFileSync(join(d, "clips", "x.html"), fragment);
  const r = spawnSync("python3", ["scripts/ru/broll/build.py", join(d, "dist"), join(d, "clips", "x.html")], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return join(d, "dist", "x.html");
}

// a built clip in headless Chromium; at(t, fn, arg) seeks and evaluates fn(arg) in the page
async function openClip(fragment, files = {}) {
  const html = buildClip(fragment, files);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("file://" + html + "?render");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.READY || null);
  const at = async (t, fn, arg) => { await page.evaluate((x) => window.seek(x), t); return page.evaluate(fn, arg); };
  return { browser, at, errors };
}

// ---------- build ----------

test("build.py embeds the object kit and the display serif next to the screen kit", () => {
  const html = readFileSync(buildClip("<title>x</title><script>OK.run({T:1, mode:'panel', theme:'night'});</script>"), "utf8");
  assert.match(html, /OK\.run = /);
  assert.match(html, /OK\.O = \{\}/);
  assert.match(html, /font-family:'SK Display'/);
  assert.ok(html.indexOf("SK.run = ") < html.indexOf("OK.run = "), "screen kit first");
  assert.ok(html.indexOf("OK.run = ") < html.indexOf("OK.run({T:1"), "kits before the fragment");
});

// ---------- object kit ----------

test("object kit: true isometric projection, iso circles, six objects with a box, parts and a pose", () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8"), ctx);
  const OK = ctx.window.OK;
  const [x, y] = OK.iso(1, 0, 0);
  assert.ok(Math.abs(x - 0.866) < 1e-3 && Math.abs(y - 0.5) < 1e-9, `${x} ${y}`);
  assert.deepEqual([...OK.iso(0, 0, 1)].map((v) => +v.toFixed(6)), [0, -1]); // spread: the vm context has its own Array
  const [rx, ry] = OK.ellipse(10);
  assert.ok(Math.abs(rx - 12.247) < 1e-3 && Math.abs(ry - 7.071) < 1e-3, `${rx} ${ry}`);
  for (const k of ["database", "agent", "turntable", "speaker", "key", "folder"]) {
    const O = OK.O[k];
    assert.ok(O, k);
    assert.equal(O.vb.length, 4, k);
    assert.equal(typeof O.pose, "function", k);
    const svg = O.svg();
    assert.match(svg, /data-p="/, k);
    assert.doesNotMatch(svg, /NaN|undefined/, k);
  }
  assert.match(OK.css("night"), /\.ok-night \.fl\{fill:#1A1428/);
  assert.match(OK.css("light"), /\.ok-light \.ln\{fill:none;stroke:#17141C/);
});

// ---------- object scene ----------

const scene = (cfg) => `<title>x</title><script>OK.run(${JSON.stringify(cfg)});</script>`;

test("object scene: ghost → glass, the label lights with the active item, link draws, check pops, fly zooms in", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 3, mode: "panel", theme: "night",
    chapter: { idx: "01 — тест", l1: "Три", l2: "инструмента", y: 170, tin: 0.1 },
    items: [{ id: "a", kind: "agent", x: 540, y: 500, size: 190, tin: 0.2, label: { text: "агент" } },
      { id: "db", kind: "database", x: 300, y: 800, size: 200, tin: 0.5, label: { text: "Openverse" },
        states: [[1.0, { open: 1 }]], active: [[1.2, 1]], check: 1.4 }],
    links: [{ from: "a", to: "db", tin: 0.8, dur: 0.4 }], fly: { id: "db", t: 2.2, dur: 0.4 } }));
  try {
    const fo = (id) => +document.querySelector(`#ok-item-${id} .okobj`).getAttribute("fill-opacity");
    assert.ok(await c.at(0.3, fo, "a") < 0.5, "a ghost right after its tin");
    assert.ok(await c.at(1.0, fo, "a") > 0.95, "a in glass");
    assert.equal(await c.at(0.4, (id) => getComputedStyle(document.getElementById(`ok-item-${id}`)).display, "db"), "none");
    const lift = await c.at(1.8, () => document.querySelector('#ok-item-db [data-p="d2"]').getAttribute("transform"));
    assert.ok(-Number(/translate\(0 (-?[\d.]+)\)/.exec(lift)[1]) >= 20, lift);
    const col = (id) => getComputedStyle(document.getElementById(`ok-label-${id}`)).color;
    assert.equal(await c.at(0.95, col, "db"), "rgb(245, 243, 250)");
    assert.equal(await c.at(2.0, col, "db"), "rgb(183, 156, 255)");
    assert.ok(+(await c.at(1.8, () => document.getElementById("ok-check-db").style.opacity)) > 0.9);
    assert.ok(parseFloat(await c.at(1.3, () => document.getElementById("ok-link-0").style.strokeDashoffset)) < 1);
    assert.match(await c.at(1.3, () => document.getElementById("ok-link-0").getAttribute("d")), /^M540,588 /);
    const idx = () => document.getElementById("ok-idx").textContent;
    assert.ok((await c.at(0.2, idx)).length < "01 — тест".length);
    assert.equal(await c.at(1.0, idx), "01 — тест");
    const sc = await c.at(2.7, () => document.getElementById("ok-scene").style.transform);
    assert.ok(+/scale\(([\d.]+)\)/.exec(sc)[1] > 4, sc);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene full: light canvas wipes over the night, counter counts, objects drawn in the dark line", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 2, mode: "full", theme: "light", bg: { flip: [0, 0.35] },
    chapter: { idx: "01 — x", l1: "В Openverse", l2: "звуки", y: 420, tin: 0.1 },
    counter: { t: 0.3, to: 5220123, label: "аудио", y: 760, dur: 0.6 },
    items: [{ id: "db", kind: "database", x: 540, y: 1180, size: 230, tin: 0.3, ghost: false }],
    words: [{ text: "тест", font: "display", size: 120, y: 1500, t: 0.2 }] }));
  try {
    assert.equal(await c.at(0, () => getComputedStyle(document.getElementById("stage")).backgroundColor), "rgb(14, 11, 20)");
    const flip = () => +/inset\(0(?:px)? ([\d.]+)%/.exec(document.getElementById("ok-flip").style.clipPath)[1];
    assert.ok(await c.at(0.02, flip) > 50);
    assert.ok(await c.at(0.6, flip) < 1);
    assert.equal((await c.at(1.2, () => document.getElementById("ok-count").firstChild.textContent)).replace(/\s/g, ""), "5220123");
    assert.equal(await c.at(1.2, () => getComputedStyle(document.querySelector("#ok-item-db polygon, #ok-item-db path")).stroke), "rgb(23, 20, 28)");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene terminal: the command types, output lines arrive on their words, the key gets struck", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 3, mode: "panel", theme: "night",
    terminal: { x: 90, y: 330, w: 900, h: 430, title: "агент", lines: [{ t: 0.5, text: "curl x", kind: "cmd", dur: 0.5 }, { t: 1.2, text: "200 OK", kind: "ok" }] },
    items: [{ id: "k", kind: "key", x: 860, y: 380, size: 170, tin: 1.5, states: [[2.0, { struck: 1 }, 0.3]] }] }));
  try {
    const typed = await c.at(0.75, () => document.querySelector("#ok-row-0 .okx").textContent);
    assert.ok(typed.length >= 1 && typed.length < "curl x".length, typed);
    const op = () => +document.getElementById("ok-row-1").style.opacity;
    assert.equal(await c.at(1.1, op), 0);
    assert.ok(await c.at(1.6, op) > 0.95);
    assert.equal(await c.at(1.6, () => getComputedStyle(document.getElementById("ok-row-1")).color), "rgb(183, 156, 255)");
    const strike = () => +document.querySelector('#ok-item-k [data-p="strike"]').style.strokeDashoffset;
    assert.ok(await c.at(1.9, strike) > 0.95);
    assert.ok(await c.at(2.8, strike) < 0.1);
    assert.ok(await c.at(1.6, () => !!(document.getElementById("ok-term").compareDocumentPosition(document.getElementById("ok-scene")) & Node.DOCUMENT_POSITION_FOLLOWING)), "scene above the terminal");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});
