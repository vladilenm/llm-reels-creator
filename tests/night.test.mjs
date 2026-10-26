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
