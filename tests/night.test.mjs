import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, lstatSync, existsSync } from "node:fs";
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

// every object of a batch: drawn in both themes, every pose extreme (t 0.2: all states 0; t 1.6: all 1) stays
// inside its vb (±4 units), nothing throws. A failure prints the bbox: widen that object's vb, never move the drawing.
async function checkObjects(kinds) {
  const items = kinds.map((kind, i) => ({ id: "o" + i, kind, x: 140 + (i % 4) * 260, y: 300 + Math.floor(i / 4) * 330, size: 200, tin: 0, ghost: false,
    states: [[0.5, { open: 1, fill: 1, on: 1, spin: 0.5, play: 1, struck: 1 }, 0.2]], active: [[0.5, 1]] }));
  for (const theme of ["night", "light"]) {
    const c = await openClip(scene({ T: 2, mode: "full", theme, items }));
    try {
      for (const t of [0.2, 1.6]) {
        const out = await c.at(t, (ids) => ids.map((id) => {
          const svg = document.getElementById("ok-item-" + id), b = svg.querySelector(".okobj").getBBox();
          return { id, vb: svg.getAttribute("viewBox").split(" ").map(Number), bb: [b.x, b.y, b.width, b.height] };
        }), items.map((it) => it.id));
        for (const o of out) {
          const [x, y, w, h] = o.vb, [bx, by, bw, bh] = o.bb, kind = kinds[+o.id.slice(1)];
          assert.ok(bw > 20 && bh > 20, `${kind} ${theme} t=${t}: drawn (${o.bb})`);
          assert.ok(bx >= x - 4 && by >= y - 4 && bx + bw <= x + w + 4 && by + bh <= y + h + 4,
            `${kind} ${theme} t=${t}: bbox ${o.bb.map(Math.round)} outside vb ${o.vb}`);
        }
      }
      assert.deepEqual(c.errors, []);
    } finally { await c.browser.close(); }
  }
}

test("object kit, part 1: the work desk — nine objects in both themes, every pose inside its box", { timeout: 120000 }, async () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8"), ctx);
  const OK = ctx.window.OK;
  assert.equal(typeof OK.face, "function");
  assert.match(OK.face([[0, 0], [10, 0], [10, 10]], 0, "fl", "q"), /<polygon class="fl" data-p="q" points="0,0 8\.7,5 8\.7,-5"\/>/);
  assert.match(OK.plate([[0, 0], [10, 0], [10, 10]], 8, { id: "p" }), /^<g data-p="p"><polygon class="fr"[^>]*\/><polygon class="fl"[^>]*\/><\/g>$/);
  assert.equal(OK.circ(0, 0, 10, 4).length, 4);
  await checkObjects(["document", "laptop", "terminal", "browser", "phone", "chat", "code", "graph", "server"]);
});

test("object kit, part 2: tools — nine objects in both themes, every pose inside its box", { timeout: 120000 }, async () => {
  await checkObjects(["cloud", "lock", "gear", "magnifier", "star", "plugin", "camera", "mic", "montage"]);
});

test("object kit, part 3: meaning, money, sound — eight objects, 32 in all, each listed in the header", { timeout: 120000 }, async () => {
  const src = readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8");
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const kinds = Object.keys(ctx.window.OK.O);
  assert.equal(kinds.length, 32, kinds.join(" "));
  const head = src.slice(0, src.indexOf("(function(){"));
  for (const k of kinds) assert.match(head, new RegExp(`\\b${k}\\b`), `${k} is listed in the header`);
  await checkObjects(["fan", "chart", "clock", "money", "checklist", "mail", "rocket", "ear"]);
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

test("object scene: «перестройка» moves an item and its link follows, tout takes it away; «выноски» and «возврат» draw on their words", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 4, mode: "panel", theme: "night",
    items: [{ id: "a", kind: "agent", x: 540, y: 600, size: 220, tin: 0, keys: [[1.0, { y: 420, size: 150 }, 0.6]], label: { text: "агент" } },
      { id: "b", kind: "database", x: 300, y: 900, size: 160, tin: 0, tout: 3.0 },
      { id: "c", kind: "speaker", x: 780, y: 900, size: 160, tin: 0 }],
    links: [{ from: "a", to: "b", tin: 0.1, dur: 0.3 }],
    callouts: [{ at: "c", text: "whoosh", t: 0.5, dx: -170, dy: -80 }, { at: [540, 1200], text: "точно в кадр", t: 1.2 }],
    returns: { to: "a", from: ["b", "c"], t: 2.0, gap: 0.15, dur: 0.4 } }));
  try {
    const top = () => parseFloat(document.getElementById("ok-item-a").style.top);
    const t0 = await c.at(0.9, top), t1 = await c.at(2.5, top);
    assert.ok(t1 < t0 - 120, `the agent moved up ${t0} → ${t1}`);
    assert.ok(Math.abs(await c.at(2.5, () => +document.getElementById("ok-item-a").getAttribute("width")) - 150) < 1, "and shrank to 150");
    const linkY = () => +document.getElementById("ok-link-0").getAttribute("d").match(/^M[\d.]+,([\d.]+)/)[1];
    assert.ok(await c.at(2.5, linkY) < await c.at(0.9, linkY) - 120, "the link starts under the moved agent");
    const vis = (id) => { const s = getComputedStyle(document.getElementById(id)); return s.display !== "none" && +s.opacity > 0.5; };
    assert.equal(await c.at(3.5, vis, "ok-item-b"), false, "b left on tout");
    const away = (id) => { const s = getComputedStyle(document.getElementById(id)); return s.display === "none" || +s.opacity < 0.05; };
    assert.equal(await c.at(3.5, away, "ok-link-0"), true, "the link to b leaves with b");
    assert.equal(await c.at(3.5, away, "ok-ret-0"), true, "so does the return arrow from b");
    assert.equal(await c.at(3.5, away, "ok-ret-head-0"), true, "and its head");
    assert.equal(await c.at(3.5, away, "ok-ret-1"), false, "the arrow from c stays");
    assert.equal(await c.at(0.4, vis, "ok-co-0"), false, "the plate waits for its word");
    assert.equal(await c.at(1.3, vis, "ok-co-0"), true);
    assert.equal(await c.at(1.3, () => document.getElementById("ok-co-0").textContent), "whoosh");
    assert.ok((await c.at(1.3, () => getComputedStyle(document.getElementById("ok-co-0")).clipPath)).includes("-20px"), "the plate's clip leaves room for its ring");
    assert.ok(await c.at(1.3, () => document.getElementById("ok-co-0").getBoundingClientRect().right) < 780, "dx < 0 puts the plate left of its item");
    assert.equal(await c.at(1.9, () => getComputedStyle(document.getElementById("ok-ret-0")).display), "none");
    const ho = (n) => +getComputedStyle(document.getElementById("ok-ret-head-" + n)).opacity;
    assert.ok(await c.at(2.2, ho, 1) < 0.1, "the second arrow comes after the first");
    assert.ok(await c.at(2.9, ho, 0) > 0.9 && await c.at(2.9, ho, 1) > 0.9, "both arrows end with heads");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene: drops fall into a folder, the morph grows a timeline the playhead lights, the prompt types and sends, cells assemble an item", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 5, mode: "full", theme: "night",
    items: [{ id: "f", kind: "folder", x: 300, y: 700, size: 200, tin: 0, states: [[0.2, { open: 1 }]] },
      { id: "tt", kind: "turntable", x: 540, y: 1100, size: 220, tin: 0 },
      { id: "g", kind: "gear", x: 800, y: 700, size: 160, tin: 9 }],
    drops: [{ into: "f", kind: "document", n: 2, t: 0.3, gap: 0.2, size: 70 }],
    links: [{ from: "f", to: "tt", tin: 0.1, dur: 0.3 }],
    morph: { from: "tt", t: 1.5, dur: 0.6, y: 1150, w: 700, dots: [{ at: 0.2, t: 2.2 }, { at: 0.8, t: 2.3 }], head: { t0: 2.4, t1: 3.0 } },
    prompt: { y: 300, w: 860, text: "стеклянный звон", t: 0.5, dur: 0.6, send: 1.4, reply: { t: 1.6, text: "0 результатов" } },
    assemble: { rect: [720, 560, 168, 168], t: 3.2, dur: 0.6, then: "g" } }));
  try {
    const box = (id) => { const e = document.getElementById(id); return getComputedStyle(e).display === "none" ? null : e.getBoundingClientRect().toJSON(); };
    const d0a = await c.at(0.5, box, "ok-drop-0-0"), d0b = await c.at(0.75, box, "ok-drop-0-0");
    assert.ok(d0a && d0b && d0b.top > d0a.top + 40, "the first file falls");
    assert.equal(await c.at(1.3, box, "ok-drop-0-0"), null, "and sinks into the folder");
    assert.equal(await c.at(0.35, box, "ok-drop-0-1"), null, "the second waits for its gap");
    assert.ok(await c.at(2.2, () => +document.getElementById("ok-item-tt").style.opacity) < 0.05, "the turntable folds away");
    const away = (id) => { const s = getComputedStyle(document.getElementById(id)); return s.display === "none" || +s.opacity < 0.05; };
    assert.equal(await c.at(1.0, away, "ok-link-0"), false, "the link to the turntable is drawn");
    assert.equal(await c.at(2.2, away, "ok-link-0"), true, "and leaves with the folded turntable");
    const tl = () => { const l = document.getElementById("ok-tl"); return +l.getAttribute("x2") - +l.getAttribute("x1"); };
    assert.ok(Math.abs(await c.at(2.6, tl) - 700) < 2, "the timeline reaches its width");
    const fill = (i) => document.getElementById("ok-tl-dot-" + i).getAttribute("fill");
    assert.equal(await c.at(2.6, fill, 0), "#B79CFF", "the playhead lit the first dot");
    assert.notEqual(await c.at(2.6, fill, 1), "#B79CFF", "not yet the second");
    assert.equal(await c.at(3.1, fill, 1), "#B79CFF");
    const txt = () => document.getElementById("ok-prompt-text").textContent;
    assert.ok((await c.at(0.9, txt)).length < "стеклянный звон".length);
    assert.equal(await c.at(1.4, txt), "стеклянный звон");
    assert.equal(await c.at(1.9, () => getComputedStyle(document.getElementById("ok-prompt-send")).backgroundColor), "rgb(124, 58, 237)", "send lights in the accent");
    assert.equal(await c.at(1.5, () => getComputedStyle(document.getElementById("ok-prompt-reply")).display), "none");
    assert.equal(await c.at(2.2, () => document.getElementById("ok-prompt-reply").textContent), "0 результатов");
    const lit = () => [...document.querySelectorAll("#ok-cells > div")].filter((e) => +e.style.opacity > 0.3).length;
    assert.ok(await c.at(3.45, lit) >= 2, "cells light up");
    assert.equal(await c.at(3.95, lit), 0, "and are gone as the gear appears");
    assert.ok(await c.at(3.95, () => +document.getElementById("ok-item-g").style.opacity) > 0.8, "the gear is assembled");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene: assemble cells sit on the light theme's own grid (84·n + 2), only cells whose centre is in the rect light; panel mode throws", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 2, mode: "full", theme: "light", bg: { flip: [0, 0.3] },
    assemble: { rect: [756, 588, 168, 168], t: 0.5, dur: 0.6 } }));
  try {
    const cells = () => [...document.querySelectorAll("#ok-cells > div")].map((e) => ({ left: parseFloat(e.style.left), top: parseFloat(e.style.top), on: +e.style.opacity > 0.3 }));
    const cs = await c.at(0.75, cells);
    assert.equal(cs.length, 4, "a 168 px rect on the grid holds four cells");
    assert.ok(cs.every((e) => e.on), "all four are lit");
    assert.ok(cs.every((e) => e.left % 84 === 2 && e.top % 84 === 2), JSON.stringify(cs));
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  const q = await openClip(scene({ T: 2, mode: "full", theme: "night", assemble: { rect: [100, 100, 10, 10], t: 0.5, dur: 0.6 } }));
  try {
    const lone = await q.at(0.8, () => [...document.querySelectorAll("#ok-cells > div")].map((e) => [e.style.left, e.style.top, +e.style.opacity > 0.3]));
    assert.deepEqual(lone, [["54px", "54px", true]], "a rect too small for a cell centre keeps the cell under its centre, lit");
  } finally { await q.browser.close(); }
  const p = await openClip(scene({ T: 2, mode: "panel", theme: "night", assemble: { rect: [756, 588, 168, 168], t: 0.5 } }));
  try { assert.ok(p.errors.some((m) => /assemble needs mode 'full'/.test(m)), p.errors.join("|")); } finally { await p.browser.close(); }
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
    assert.match(await c.at(1.6, () => getComputedStyle(document.getElementById("ok-term")).clipPath), /-60px/, "the glow is not clipped");
    assert.equal(await c.at(1.6, () => getComputedStyle(document.querySelector("#ok-term > div:first-child")).fontSize), "30px");
    assert.ok(await c.at(1.6, () => !!(document.getElementById("ok-term").compareDocumentPosition(document.getElementById("ok-scene")) & Node.DOCUMENT_POSITION_FOLLOWING)), "scene above the terminal");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

// ---------- screen kit night ----------

test("screen kit night: no title plate, typed chapter index, the frame draws in, edge light on a shot change, lens runs", { timeout: 60000 }, async () => {
  const d = tmp("png-"); ff("-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1", join(d, "a.png"));
  const c = await openClip(`<title>x</title><script>SK.run(${JSON.stringify({ T: 3, mode: "light", theme: "night", tin: 0,
    title: { idx: "01 — тест", l1: "Claude", l2: "делает", y: 200, tin: 0 },
    win: { x: 540, y: 380, w: 900, h: 480, tin: 0 }, media: { a: { src: "a.png" } },
    shots: [[0, "a", [0, 0, 640]], [1.5, "a", [100, 0, 500], "cut"]],
    marks: [{ kind: "lens", keys: [[1.8, 320, 180], [2.4, 400, 200]], r: 100, zoom: 2, t0: 1.8, t1: 2.6 }] })});</script>`,
    { "a.png": readFileSync(join(d, "a.png")) });
  try {
    const plate = await c.at(0.8, () => { const s = getComputedStyle(document.querySelector(".sk-t2")); return [s.backgroundColor, s.color]; });
    assert.deepEqual(plate, ["rgba(0, 0, 0, 0)", "rgb(183, 156, 255)"]);
    const idx = () => document.querySelector(".sk-idx").textContent;
    assert.ok((await c.at(0.15, idx)).length < "01 — тест".length);
    assert.equal(await c.at(0.8, idx), "01 — тест");
    const off = () => +document.querySelector(".sk-draw rect").style.strokeDashoffset;
    const mid = await c.at(0.2, off);
    assert.ok(mid > 0.02 && mid < 0.98, `dashoffset ${mid}`);
    assert.ok(await c.at(0.9, off) < 0.01);
    const edge = () => [+document.querySelector(".sk-edge").style.opacity, parseFloat(document.querySelector(".sk-edge").style.left)];
    const [o1, l1] = await c.at(1.7, edge), [o2, l2] = await c.at(2.0, edge);
    assert.ok(o2 > 0.2 && l2 > l1, `edge ${o1} ${l1} → ${o2} ${l2}`);
    const [clip, shadow] = await c.at(1.0, () => { const s = getComputedStyle(document.querySelector(".sk-win")); return [s.clipPath, s.boxShadow]; });
    assert.ok(clip.includes("-120px"), `the clip leaves room for the shadow: ${clip}`);
    assert.ok(shadow.includes("3px"), `3 px ring: ${shadow}`);
    await c.at(2.2, () => 0);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("screen kit night: glass list rows, a night card, a pulled name flies to its place, the window assembles from cells and opens into layers", { timeout: 120000 }, async () => {
  const d = tmp("png-"); ff("-f", "lavfi", "-i", "testsrc2=size=640x360", "-frames:v", "1", join(d, "a.png"));
  ff("-f", "lavfi", "-i", "color=c=white:size=640x360", "-frames:v", "1", join(d, "b.png"));
  const files = { "a.png": readFileSync(join(d, "a.png")), "b.png": readFileSync(join(d, "b.png")) };
  const sk = (cfg) => `<title>x</title><script>SK.run(${JSON.stringify(cfg)});</script>`;
  let c = await openClip(sk({ T: 2, mode: "card", theme: "night", tin: 0, title: { l1: "Три", l2: "ссылки", y: 260, tin: 0 }, win: { tin: 999 },
    list: { y: 500, w: 760, row: 92, items: [{ name: "Openverse API", stars: "411", t: 0.2 }, { name: "Real SFX", t: 0.3 }] } }), files);
  try {
    assert.equal(await c.at(1, () => getComputedStyle(document.querySelector(".sk-rp")).backgroundColor), "rgb(26, 20, 40)", "glass row");
    assert.ok((await c.at(1, () => getComputedStyle(document.querySelector(".sk-rp")).boxShadow)).includes("3px"), "3 px ring on the row");
    const star = await c.at(1, () => { const s = getComputedStyle(document.querySelector(".sk-rs")); return [s.boxShadow, s.fontSize]; });
    assert.ok(star[0].includes("3px") && star[1] === "30px", `star pill: ring 3 px, label 30 px ${star}`);
    assert.equal(await c.at(1, () => getComputedStyle(document.querySelector(".sk-rt")).color), "rgb(245, 243, 250)");
    assert.ok(await c.at(1, () => !!document.querySelector("#sk .sk-grid")), "the night card has the grid");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  c = await openClip(sk({ T: 4, mode: "dark", theme: "night", tin: 0,
    title: { l1: "Инструмент 2", l2: "", y: 470, tin: 0 },
    win: { x: 540, y: 700, w: 900, h: 480, tin: 0, enter: "grid", layers: { t: 2.6, dur: 0.6, n: 3, gap: 80, labels: ["pop", "hit"] } },
    media: { a: { src: "a.png" } }, shots: [[0, "a", [0, 0, 640]]],
    marks: [{ kind: "pull", rect: [200, 100, 160, 40], t: 1.2, dur: 0.6, to: [540, 600], scale: 2 }] }), files);
  try {
    const lit = () => [...document.querySelectorAll("#sk-cells > div")].filter((e) => +e.style.opacity > 0.3).length;
    assert.ok(await c.at(0.3, lit) > 3, "cells light inside the window rect");
    // M.apply hides an invisible element with display:none and leaves its opacity as it was
    const wo = () => { const s = getComputedStyle(document.querySelector(".sk-win")); return s.display === "none" ? 0 : +s.opacity; };
    assert.ok(await c.at(0.2, wo) < 0.05, "the window waits for the cells");
    assert.ok(await c.at(1.0, wo) > 0.95);
    assert.equal(await c.at(1.0, lit), 0, "the cells are gone");
    assert.equal(await c.at(1.1, () => getComputedStyle(document.getElementById("sk-pull-0")).display), "none");
    const r = await c.at(2.0, () => document.getElementById("sk-pull-0").getBoundingClientRect().toJSON());
    // media 640 px in a 900 px window: k = 1.40625; 160×40 → 225×56.25, ×2 → 450×112.5, centred on (540, 600)
    assert.ok(Math.abs(r.left + r.width / 2 - 540) < 4 && Math.abs(r.top + r.height / 2 - 600) < 4, `pulled to its place ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.width - 450) < 6, `scaled ×2: ${r.width}`);
    const ly = await c.at(3.4, () => [...document.querySelectorAll(".sk-ly")].map((e) => [getComputedStyle(e).display, +e.style.opacity, e.style.transform]));
    assert.equal(ly.length, 2, "n − 1 glass layers behind the window");
    for (const [disp, o, tf] of ly) { assert.equal(disp, "block"); assert.ok(o > 0.5 && /rotateX\(2\d(\.\d+)?deg\)/.test(tf), tf); }
    assert.notEqual(await c.at(3.4, () => getComputedStyle(document.querySelector(".sk-win")).transform), "none");
    assert.equal(await c.at(3.4, () => document.querySelector("#sk-ly-0 .sk-lyl").textContent), "pop");     // the deepest layer is first in the DOM, so ask for the nearest one by id
    // the title paints after (over) the layers, the deepest layer first
    assert.ok(await c.at(3.4, () => document.getElementById("sk-ly-0").compareDocumentPosition(document.querySelector(".sk-t1")) & Node.DOCUMENT_POSITION_FOLLOWING), "title after the layers");
    assert.ok(await c.at(3.4, () => document.getElementById("sk-ly-1").compareDocumentPosition(document.getElementById("sk-ly-0")) & Node.DOCUMENT_POSITION_FOLLOWING), "the deepest layer first");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  // the pulled piece lives on its own: the shot changes and the window leaves, the piece stays the same
  // (data: images keep the canvases readable; a file: image would taint them)
  const uri = (n) => "data:image/png;base64," + files[n].toString("base64");
  c = await openClip(sk({ T: 5, mode: "dark", theme: "night", tin: 0, title: { l1: "Инструмент 2", l2: "", y: 470, tin: 0 },
    win: { x: 540, y: 700, w: 900, h: 480, tin: 0, enter: "grid", tout: 3.0 },
    media: { a: { src: uri("a.png") }, b: { src: uri("b.png") } }, shots: [[0, "a", [0, 0, 640]], [3.0, "b", [0, 0, 640], "whip"]],
    marks: [{ kind: "pull", rect: [200, 100, 160, 40], t: 1.2, dur: 0.6, to: [540, 600], scale: 2, tout: 4.5 }] }), files);
  try {
    const piece = () => { const e = document.getElementById("sk-pull-0"), d = e.getContext("2d").getImageData(0, 0, e.width, e.height).data;
      let a = 0, h = 0; for (let i = 0; i < d.length; i++) { a += d[i]; h = (h * 31 + d[i]) >>> 0; }
      const b = e.getBoundingClientRect(); return { sum: a, hash: h, w: e.width, h: e.height, bw: b.width, bh: b.height, display: getComputedStyle(e).display, op: +e.style.opacity, cx: b.left + b.width / 2, cy: b.top + b.height / 2 }; };
    const p2 = await c.at(2.0, piece), p3 = await c.at(3.05, piece), p4 = await c.at(3.6, piece);
    // 160×40 media px × k0 1.40625 × scale 2: the canvas holds the media rect at its landed resolution (no CSS upscale)
    assert.ok(p2.sum > 0 && p2.w === 450 && p2.h === 113, `the piece is cut at its landed size: ${JSON.stringify(p2)}`);
    assert.ok(Math.abs(p2.bw - 450) < 2 && Math.abs(p2.bh - 112.5) < 2, `landed at scale 1: ${p2.bw} × ${p2.bh}`);
    for (const q of [p3, p4]) assert.ok(q.display !== "none" && q.op > 0.99 && Math.abs(q.cx - 540) < 4 && Math.abs(q.cy - 600) < 4, `the piece stays on its place ${JSON.stringify(q)}`);
    assert.deepEqual([p4.sum, p4.hash], [p2.sum, p2.hash], "the pixels do not follow the shot change or the window");
    const wDisp = await c.at(3.6, () => getComputedStyle(document.querySelector(".sk-win")).display);
    assert.equal(wDisp, "none", "the window is gone, the piece is not");
    assert.equal((await c.at(4.9, piece)).display, "none", "the piece leaves after its tout");
    // the source dim sits on the window only while the pull's shot is on
    const area = () => { const d = document.querySelector(".sk-cv").getContext("2d").getImageData(281, 140, 225, 56).data; let a = 0; for (let i = 0; i < d.length; i += 4) a += d[i] + d[i + 1] + d[i + 2]; return a; };
    const before = await c.at(1.0, area), dimmed = await c.at(2.0, area);
    assert.ok(before > 0 && dimmed < before * 0.8, `the source dims after the pull: ${before} → ${dimmed}`);
    const white = await c.at(3.25, () => [...document.querySelector(".sk-cv").getContext("2d").getImageData(393, 168, 1, 1).data]);
    assert.deepEqual(white, [255, 255, 255, 255], "the new shot is not dimmed");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  // the clip-level tout takes the piece away too, when the pull has none of its own
  c = await openClip(sk({ T: 4, tout: 2.5, mode: "dark", theme: "night", tin: 0, win: { x: 540, y: 700, w: 900, h: 480, tin: 0, enter: "grid" },
    media: { a: { src: "a.png" } }, shots: [[0, "a", [0, 0, 640]]],
    marks: [{ kind: "pull", rect: [200, 100, 160, 40], t: 1.2, dur: 0.6, to: [540, 600], scale: 2 }] }), files);
  try {
    const shown = () => { const e = document.getElementById("sk-pull-0"); return [getComputedStyle(e).display, +e.style.opacity]; };
    const [d1, o1] = await c.at(2.0, shown), [d2, o2] = await c.at(2.65, shown), [d3] = await c.at(2.9, shown);
    assert.ok(d1 !== "none" && o1 > 0.99, "the piece is on before the clip's tout");
    assert.ok(d2 !== "none" && o2 > 0.01 && o2 < 0.99, `the piece fades with the clip's tout: ${o2}`);
    assert.equal(d3, "none", "the piece is gone 0.3 s after the clip's tout");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  // wrong configs stop with a named error
  const errs = async (cfg) => { const k = await openClip(sk(cfg), files); try { return k.errors; } finally { await k.browser.close(); } };
  const noTo = await errs({ T: 2, mode: "dark", theme: "night", tin: 0, media: { a: { src: "a.png" } }, shots: [[0, "a", [0, 0, 640]]], marks: [{ kind: "hl", rect: [0, 0, 9, 9], t0: 0, t1: 1 }, { kind: "pull", rect: [200, 100, 160, 40], t: 1 }] });
  assert.ok(noTo.some((m) => m.includes("SK: marks[1] kind 'pull' needs rect and to")), `pull without to: ${noTo}`);
  const noRect = await errs({ T: 2, mode: "dark", theme: "night", tin: 0, media: { a: { src: "a.png" } }, shots: [[0, "a", [0, 0, 640]]], marks: [{ kind: "pull", to: [540, 600], t: 1 }] });
  assert.ok(noRect.some((m) => m.includes("SK: marks[0] kind 'pull' needs rect and to")), `pull without rect: ${noRect}`);
  const noGrid = await errs({ T: 2, mode: "light", theme: "night", tin: 0, win: { enter: "grid" } });
  assert.ok(noGrid.some((m) => m.includes("SK: win.enter 'grid' needs mode 'dark' or 'card' (the cells sit on the clip's grid)")), `grid entry in light mode: ${noGrid}`);
});

// ---------- captions ----------

test("kinetic captions: theme_default sets the theme where no key says otherwise", async () => {
  const { kineticGroups, kineticConfig, kineticHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const brand = loadBrand();
  const words = [{ text: "Раз", start: 0, end: 0.3 }, { text: "два.", start: 0.35, end: 0.6 }, { text: "Три", start: 1.6, end: 1.9 }];
  const ov = { style: "kinetic", kinetic: { theme_default: "dark", theme_keys: [{ at: 1.5, theme: "light" }] } };
  const k = kineticConfig(brand, ov), g = kineticGroups({ words }, k, ov);
  const html = kineticHtml(g, { duration: 3, brand, fontUrl: "a.ttf", accentUrl: "b.ttf", overrides: ov });
  assert.match(html, /id="c0" class="kg dark clip"/);
  assert.match(html, /id="c1" class="kg light clip"/);
});

test("kinetic captions in the night look: dark by default, light over light accents and light full clips", async () => {
  const { nightCaptions } = await import("../scripts/ru/make-captions.mjs");
  const P = tmp("cap-");
  for (const d of ["fx", "work", "broll"]) mkdirSync(join(P, d));
  assert.deepEqual(nightCaptions(P, { hide: [] }), { hide: [] }, "no fx.json look: nothing changes");
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "n", in: 1, out: 2, kind: "night", file: "a" }, { id: "l", in: 30, out: 34, kind: "light", file: "b" }] }));
  writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ clips: [{ id: "c", in: 10, out: 12, kind: "full", theme: "light", file: "c.mp4" }, { id: "p", in: 12, out: 14, kind: "panel", file: "p.mov" }] }));
  const k = nightCaptions(P, { style: "kinetic" }).kinetic;
  assert.equal(k.theme_default, "dark");
  assert.deepEqual(k.theme_keys, [{ at: 10, theme: "light" }, { at: 12, theme: "dark" }, { at: 30, theme: "light" }, { at: 34, theme: "dark" }]);
  assert.deepEqual(nightCaptions(P, { kinetic: { theme_keys: [{ at: 5, theme: "light" }] } }).kinetic.theme_keys, [{ at: 5, theme: "light" }], "explicit keys win");
});

test("lightWindows: accents and light full clips, sorted, overlapping and touching windows merged; nightCaptions emits one pair per merged window", async () => {
  const { lightWindows, nightCaptions } = await import("../scripts/ru/make-captions.mjs");
  const P = tmp("lw-");
  for (const d of ["fx", "work", "broll"]) mkdirSync(join(P, d));
  assert.deepEqual(lightWindows(P), [], "no files: no windows");
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "n", in: 1, out: 2, kind: "night", file: "a" }, { id: "b", in: 20, out: 22, kind: "light", file: "b" }, { id: "a", in: 10, out: 14, kind: "light", file: "a" }] }));
  writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ clips: [{ id: "c", in: 12, out: 13, kind: "full", theme: "light", file: "c.mp4" }, { id: "t", in: 22, out: 25, kind: "full", theme: "light", file: "t.mp4" }, { id: "p", in: 40, out: 41, kind: "panel", theme: "light", file: "p.mov" }] }));
  assert.deepEqual(lightWindows(P), [{ in: 10, out: 14 }, { in: 20, out: 25 }]);
  assert.equal(lightWindows(P, { merge: false }).length, 4, "unmerged: every source window");
  assert.deepEqual(nightCaptions(P, {}).kinetic.theme_keys,
    [{ at: 10, theme: "light" }, { at: 14, theme: "dark" }, { at: 20, theme: "light" }, { at: 25, theme: "dark" }]);
  writeFileSync(join(P, "work/accents.json"), "{ not json");
  assert.throws(() => lightWindows(P), /work\/accents\.json: /, "a broken JSON names its file");
});

test("kinetic captions: a theme edge ends a group and starts another, a group never spills across it", async () => {
  const { kineticGroups, kineticConfig, kineticHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const brand = loadBrand();
  const words = "Раз два три четыре пять шесть семь".split(" ").map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const run = (edges) => {
    const ov = { style: "kinetic", kinetic: { theme_default: "dark", theme_keys: [{ at: edges[0], theme: "light" }, { at: edges[1], theme: "dark" }] } };
    const g = kineticGroups({ words }, kineticConfig(brand, ov), ov);
    const html = kineticHtml(g, { duration: 4, brand, fontUrl: "a.ttf", accentUrl: "b.ttf", overrides: ov });
    const clips = [...html.matchAll(/id="c(\d+)" class="kg (light|dark) clip" data-start="([\d.]+)" data-duration="([\d.]+)"/g)]
      .map((m) => ({ theme: m[2], start: Number(m[3]), end: Number(m[3]) + Number(m[4]) }));
    assert.equal(clips.length, g.length);
    const inside = (t) => t >= edges[0] && t < edges[1];
    g.forEach((grp, i) => {
      const w = grp.lines[0];
      assert.ok(w.every((x) => inside(x.start) === inside(w[0].start)), `group ${i} straddles an edge: ${w.map((x) => x.text)}`);
      assert.equal(clips[i].theme, inside(w[0].start) ? "light" : "dark", `group ${i} theme`);
      for (const e of edges) assert.ok(!(clips[i].start < e && clips[i].end > e + 1e-6), `group ${i} (${clips[i].start}–${clips[i].end}) crosses ${e}`);
    });
    return g;
  };
  // edges on word starts: Раз два | три четыре | пять шесть семь
  assert.deepEqual(run([0.8, 1.6]).map((x) => x.lines[0].map((w) => w.text).join(" ")), ["Раз два", "три четыре", "пять шесть семь"]);
  // edges between word starts: a word belongs to the side its start is on
  assert.deepEqual(run([0.9, 1.7]).map((x) => x.lines[0].map((w) => w.text).join(" ")), ["Раз два три", "четыре пять", "шесть семь"]);
});

test("motion-check: known verbs, none twice in a row, at least 5 verbs, each on its word, 1–2 light accents", async () => {
  const { checkMotion, VERBS } = await import("../scripts/ru/motion-check.mjs");
  assert.equal(Object.keys(VERBS).length, 16);
  const words = [["Поэтому", 9.01], ["три", 9.70], ["бесплатных", 9.92], ["инструмента", 10.38], ["исправляют", 11.48], ["Openverse", 12.78]].map(([text, start]) => ({ text, start }));
  const ok = [{ at: 9.01, word: "Поэтому", verb: "materialize" }, { at: 9.70, word: "три", verb: "chapter" }, { at: 9.92, word: "бесплатных", verb: "materialize" },
    { at: 10.38, word: "инструмента", verb: "tree" }, { at: 11.48, word: "исправляют", verb: "active" }, { at: 11.70, word: "исправляют", verb: "fly" },
    { at: 12.60, word: "Openverse", verb: "lens" }];
  const r = checkMotion(ok, words, 1);
  assert.deepEqual(r.errors, []);
  assert.match(r.table, /\| 12,60 \| Openverse \| линза \|/);
  assert.ok(checkMotion([...ok.slice(0, 2), { at: 9.92, word: "бесплатных", verb: "chapter" }, ...ok.slice(3)], words, 1).errors.some((e) => /второй раз подряд/.test(e)));
  assert.ok(checkMotion([{ ...ok[0], verb: "zoom" }, ...ok.slice(1)], words, 1).errors.some((e) => /неизвестный глагол/.test(e)));
  assert.ok(checkMotion([{ ...ok[0], at: 9.5 }, ...ok.slice(1)], words, 1).errors.some((e) => /нет в ±0,25/.test(e)));
  assert.ok(checkMotion(ok.slice(0, 4), words, 1).errors.some((e) => /не меньше 5/.test(e)));
  assert.ok(checkMotion(ok, words, 3).errors.some((e) => /светлых акцентов 3/.test(e)));
  assert.equal(checkMotion(ok, words, 0).warnings.length, 1);
});

test("motion-check: malformed entries are errors, ё folds to е, table cells are escaped", async () => {
  const { checkMotion } = await import("../scripts/ru/motion-check.mjs");
  const words = [{ text: "Всё", start: 1 }, { text: "дерево", start: 2 }, { text: "три", start: 3 }].map((w) => ({ ...w }));
  const good = [{ at: 1, word: "все", verb: "fly", what: "a | b\nc" }, { at: 2, word: "дерево", verb: "tree" }, { at: 3, word: "три", verb: "chapter" }];
  const r = checkMotion(good, words, 1);
  assert.deepEqual(r.errors.filter((e) => !/не меньше 5/.test(e)), [], "«все» matches «Всё»");
  assert.match(r.table, /\| 1,00 \| все \| сквозной пролёт \| a \\\| b c \|/, "the pipe is escaped, the newline is a space");
  const bad = checkMotion([{ at: "1", word: "Всё", verb: "fly" }, { at: 2, verb: "tree" }, { at: 2.5, word: 7, verb: "tree" }, null,
    { at: 3, word: "три", verb: "toString" }, { at: 3, word: "три", verb: "__proto__" }], words, 1);
  for (const n of [1, 2, 3, 4]) assert.ok(bad.errors.some((e) => e.startsWith(`запись ${n}: `)), `запись ${n}: ${bad.errors}`);
  assert.equal(bad.errors.filter((e) => /неизвестный глагол/.test(e)).length, 2, "toString and __proto__ are not verbs");
  assert.doesNotThrow(() => checkMotion("nope", words, 1));
  assert.ok(checkMotion("nope", words, 1).errors.some((e) => /motion.*списком/.test(e)));
});

test("motionCheck(project): counts accents and light full clips, writes MOTION.md, names a broken JSON", async () => {
  const { motionCheck } = await import("../scripts/ru/motion-check.mjs");
  const P = tmp("mc-");
  for (const d of ["work", "broll"]) mkdirSync(join(P, d));
  writeFileSync(join(P, "transcript.clean.json"), JSON.stringify({ words: [{ text: "Раз", start: 1, type: "word" }, { text: " ", start: 1.2, type: "spacing" }, { text: "два.", start: 2, type: "word" }] }));
  writeFileSync(join(P, "PLAN.json"), JSON.stringify({ motion: [{ at: 1, word: "Раз", verb: "fly", what: "пролёт" }, { at: 2, word: "два", verb: "lens" }] }));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "l", in: 5, out: 6, kind: "light", file: "a" }, { id: "n", in: 7, out: 8, kind: "night", file: "b" }] }));
  writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ clips: [{ id: "c", in: 5.5, out: 6.5, kind: "full", theme: "light", file: "c.mp4" }, { id: "p", in: 9, out: 10, kind: "panel", file: "p.mov" }] }));
  const r = motionCheck(P);
  assert.equal(r.lights, 2, "source windows are counted, not merged ones");
  assert.ok(r.errors.some((e) => /не меньше 5/.test(e)));
  const md = readFileSync(join(P, "MOTION.md"), "utf8");
  assert.match(md, /^# Раскадровка движений/);
  assert.match(md, /\| Время \| Слово \| Глагол \| Что в кадре \|/);
  assert.match(md, /\| 2,00 \| два \| линза \| *\|/);
  writeFileSync(join(P, "PLAN.json"), "{ nope");
  assert.throws(() => motionCheck(P), /PLAN\.json: /);
});

// ---------- night base ----------

function pixel(video, n, x, y) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, String(r.stderr));
  const i = (y * 1080 + x) * 3;
  return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]];
}

test("night_base: night background, the speaker by the mask with a halo, an accent replaces the background, --card", { timeout: 120000 }, () => {
  const P = tmp("nb-");
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 0.2 }, { start: 1, end: 1.2 }] }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.4", "-f", "lavfi", "-i", "sine=f=220:d=0.4:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "color=c=green:s=1080x1920:r=25:d=0.16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/acc.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "a", in: 0.04, out: 0.2, kind: "night", file: "broll/acc.mp4" }] }));
  const r0 = py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for i in range(10):
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(r0.status, 0, r0.stderr);
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = join(P, "renders/picture.base.mp4");
  const [pr, pg] = pixel(out, 7, 547, 1456);
  assert.ok(pr > 170 && pg < 70, `speaker ${pr},${pg}`);
  const bg = pixel(out, 7, 100, 300);
  assert.ok(bg[0] < 50 && bg[1] < 50 && bg[2] < 70, `night ${bg}`);
  const acc = pixel(out, 2, 100, 300);
  assert.ok(acc[1] > 100 && acc[0] < 80, `accent ${acc}`);
  assert.ok(pixel(out, 2, 547, 1456)[0] > 170, "the speaker stays over the accent");
  assert.ok(pixel(out, 7, 322, 1456)[2] > pixel(out, 7, 310, 1456)[2] + 8, "halo 5 px outside the silhouette, not 17 px out");
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--card"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(pixel(out, 7, 540, 1500)[0] > 170, "card shows the camera");
  const sum = (p) => p[0] + p[1] + p[2];
  assert.ok(sum(pixel(out, 7, 47, 1300)) > sum(pixel(out, 7, 20, 1300)) + 60, "card frame line");
});

test("night_base: masks are found by frame name, a clip shorter than its window is held, a missing accent file stops the run", { timeout: 120000 }, () => {
  const P = tmp("nb2-");
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 0.4 }] }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.4", "-f", "lavfi", "-i", "sine=f=220:d=0.4:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  // a two-frame accent clip: green, then blue
  ff("-filter_complex", "color=c=green:s=1080x1920:r=25:d=0.04[a];color=c=blue:s=1080x1920:r=25:d=0.04[b];[a][b]concat=n=2:v=1:a=0",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/acc2.mp4"));
  // window A: frames 1-2 (clip is long enough); window B: frames 5-8 (clip is two frames: the last one is held)
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [
    { id: "a", in: 0.04, out: 0.12, kind: "night", file: "broll/acc2.mp4" },
    { id: "b", in: 0.2, out: 0.36, kind: "night", file: "broll/acc2.mp4" }] }));
  const r0 = py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for i in range(10):
    if i == 3: continue
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(r0.status, 0, r0.stderr);
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /кадров без своей маски: 1 \(первые: 3\) · взяты у соседей: 1 · пустых: 0/);
  const out = join(P, "renders/picture.base.mp4");
  const n = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out], { encoding: "utf8" });
  assert.equal(n.stdout.trim(), "10", "every frame of clean.mp4 is rendered");
  assert.ok(pixel(out, 3, 547, 1456)[0] > 170, "frame 3 has no mask of its own: it borrows the neighbour's, the speaker stays");
  assert.ok(pixel(out, 4, 547, 1456)[0] > 170, "frame 4 (a neighbour of the gap) keeps its speaker");
  assert.ok(pixel(out, 7, 547, 1456)[0] > 170, "frame 7 keeps its speaker");
  const a1 = pixel(out, 1, 100, 300);
  assert.ok(a1[1] > 100 && a1[0] < 80, `window A starts on the green frame ${a1}`);
  const b5 = pixel(out, 5, 100, 300);
  assert.ok(b5[1] > 100 && b5[2] < 80, `the same file in window B restarts from its first frame ${b5}`);
  const b8 = pixel(out, 8, 100, 300);
  assert.ok(b8[2] > 100 && b8[1] < 80, `the clip is shorter than the window: its last frame is held ${b8}`);
  const n9 = pixel(out, 9, 100, 300);
  assert.ok(n9[0] < 50 && n9[1] < 50 && n9[2] < 70, `after the window: night ${n9}`);
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "x", in: 0.04, out: 0.2, kind: "night", file: "broll/missing.mp4" }] }));
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "a missing accent file stops the run");
  assert.match(r.stderr, /broll\/missing\.mp4/);
});

test("night_base: a light accent puts a soft neutral shadow behind the speaker, too many frames without a mask stop the run", { timeout: 120000 }, () => {
  const P = tmp("nb4-");
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: 0.4 }] }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.4", "-f", "lavfi", "-i", "sine=f=220:d=0.4:sample_rate=48000",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  ff("-f", "lavfi", "-i", "color=c=white:s=1080x1920:r=25:d=0.2", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/light.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "l", in: 0.04, out: 0.2, kind: "light", file: "broll/light.mp4" }] }));
  const masks = (skip) => py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for p in d.glob("*.png"): p.unlink()
for i in range(10):
    if i in ${JSON.stringify(skip)}: continue
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(masks([]).status, 0);
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = join(P, "renders/picture.base.mp4");
  const far = pixel(out, 2, 100, 300), near = pixel(out, 2, 322, 1456);
  assert.ok(far[0] > 240 && far[1] > 240 && far[2] > 240, `the light canvas ${far}`);
  assert.ok(near[0] < far[0] - 10, `a shadow next to the silhouette ${near}`);
  assert.ok(near[0] < far[0] - 20, `the shadow is the 35 % ink one, not the faint purple halo ${near}`);
  assert.ok(Math.abs(near[0] - near[2]) < 12, `neutral, not a purple halo ${near}`);
  assert.ok(pixel(out, 2, 547, 1456)[1] < 100, "the speaker (red) stays over the white light accent");
  assert.equal(masks([3, 4, 5, 6, 7, 8]).status, 0);
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "6 of 10 frames without a mask: stale masks, stop");
  assert.match(r.stderr, /без своей маски/);
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--allow-missing"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "x", in: 0.04, out: 0.2, kind: "dark", file: "broll/light.mp4" }] }));
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P], { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(r.status, 0, "an unknown accent kind stops the run");
  assert.match(r.stderr, /kind/);
});

test("night_base mask_src: a frame without a mask borrows the nearest neighbour within 3 frames, never across a cut", { timeout: 60000 }, () => {
  const r = py(`import sys, json
sys.path.insert(0, "scripts/ru/wide")
from night_base import mask_src
M = lambda *ks: {k: "x" for k in ks}
print(json.dumps({
  "own": mask_src(M(3, 2), 3, set()),
  "reach3": mask_src(M(0), 3, set()), "reach4": mask_src(M(0), 4, set()), "reach3_fwd": mask_src(M(6), 3, set()), "reach4_fwd": mask_src(M(7), 3, set()),
  "earlier_first": mask_src(M(2, 4), 3, set()),
  "cut_far_falls_to_near": mask_src(M(4, 6), 5, {5}), "cut_only_far": mask_src(M(4), 5, {5}),
  "cut_ahead": mask_src(M(5), 4, {5}),
  "same_side_of_a_cut": mask_src(M(6), 5, {5}),
}))`);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout.trim().split("\n").pop()), {
    own: 3, reach3: 0, reach4: null, reach3_fwd: 6, reach4_fwd: null, earlier_first: 2,
    cut_far_falls_to_near: 6, cut_only_far: null, cut_ahead: null, same_side_of_a_cut: 6,
  });
});

test("night_base --prep: stale frames and masks are cleared, a symlinked fx/masks is unlinked and its target is never touched", { timeout: 120000 }, () => {
  const P = tmp("nb3-");
  for (const d of ["assets", "renders", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  ff("-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=25:d=0.12", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/clean.mp4"));
  const other = tmp("nb3-other-"), other2 = tmp("nb3-other2-");   // the folders of "another, approved project"
  writeFileSync(join(other, "00099.png"), "approved mask");
  writeFileSync(join(other2, "00099.png"), "approved frame");
  symlinkSync(other, join(P, "fx/masks"));
  symlinkSync(other2, join(P, "work/card-frames"));
  let r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--prep"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const d of ["fx/masks", "work/card-frames"]) {
    assert.ok(!lstatSync(join(P, d)).isSymbolicLink(), `${d} is a real folder now`);
    assert.ok(!existsSync(join(P, d, "00099.png")), `${d}: nothing of the other project came along`);
  }
  assert.ok(existsSync(join(P, "fx/masks/00000.png")), "masks are generated");
  assert.equal(readFileSync(join(other, "00099.png"), "utf8"), "approved mask", "the symlink target keeps its file");
  assert.equal(readFileSync(join(other2, "00099.png"), "utf8"), "approved frame", "the symlink target keeps its file");
  writeFileSync(join(P, "fx/masks/00099.png"), "stale");          // a real folder is cleared
  r = spawnSync("python3", ["scripts/ru/wide/night_base.py", P, "--prep"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(!existsSync(join(P, "fx/masks/00099.png")), "a stale mask of a previous run is gone");
  assert.ok(existsSync(join(P, "fx/masks/00000.png")));
});
