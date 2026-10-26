import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, lstatSync, existsSync, rmSync, utimesSync } from "node:fs";
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

test("object kit: smooth() runs a Catmull-Rom curve through its points, closed or open", () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "scripts/ru/broll/object-kit.js"), "utf8"), ctx);
  const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const closed = [...ctx.window.OK.smooth(sq, 4)], open = [...ctx.window.OK.smooth(sq, 4, false)];
  assert.equal(closed.length, 16, "closed: per samples per segment");
  assert.equal(open.length, 13, "open: (n − 1) · per + 1");
  sq.forEach((p, i) => assert.deepEqual([...closed[i * 4]].map(Math.round), p, `closed passes through point ${i}`));
  sq.forEach((p, i) => assert.deepEqual([...open[i * 4]].map(Math.round), p, `open passes through point ${i}`));
  assert.deepEqual([...open.at(-1)], sq.at(-1), "open ends on its last point");
  const mid = closed[2];                                   // between (0,0) and (100,0): bulges less than a few units
  assert.ok(mid[0] > 30 && mid[0] < 70 && Math.abs(mid[1]) < 15, `a smooth middle sample ${mid}`);
  assert.equal(ctx.window.OK.smooth(sq).length, 16, "per defaults to 4");
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
    assert.match(await c.at(1.3, () => document.getElementById("ok-link-0").getAttribute("d")), /^M540,613 /, "500 + the agent's default label offset 69 (12 under its lowest point) + 44");
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

test("object scene callouts: the plate opens from the leader end, to the right for dx > 0 and to the left for dx < 0", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 3, mode: "panel", theme: "night",
    callouts: [{ at: [300, 900], text: "вправо", t: 0.5, dx: 170, dy: -80 }, { at: [800, 900], text: "влево", t: 0.5, dx: -170, dy: -80 }] }));
  try {
    // the part of the plate that shows, in screen px, from its clip-path (inset: top right bottom left) and its box
    const shown = (id) => {
      const e = document.getElementById(id), r = e.getBoundingClientRect(), w = r.width;
      const len = (s) => { const m = /calc\(\s*([-\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)/.exec(s);
        return m ? (+m[1] / 100) * w + (m[2] === "-" ? -1 : 1) * +m[3] : s.endsWith("%") ? (parseFloat(s) / 100) * w : parseFloat(s); };
      const m = /inset\(\s*(\S+)\s+(calc\([^)]*\)|\S+)\s+(\S+)\s+(calc\([^)]*\)|\S+)/.exec(e.style.clipPath);
      return { x0: r.left + len(m[4]), x1: r.right - len(m[2]), left: r.left, right: r.right };
    };
    const mid = 0.8;                                          // 0.3 s after t: the wipe is half done
    const R = await c.at(mid, shown, "ok-co-0"), L = await c.at(mid, shown, "ok-co-1");
    assert.ok(R.x0 <= R.left - 19 && R.x1 < R.right - 10, `dx > 0 opens from its left end: ${JSON.stringify(R)}`);
    assert.ok(L.x1 >= L.right + 19 && L.x0 > L.left + 10, `dx < 0 opens from its right end, the leader's: ${JSON.stringify(L)}`);
    assert.ok(L.x1 - L.x0 > 20 && R.x1 - R.x0 > 20, "something shows at mid-wipe");
    for (const id of ["ok-co-0", "ok-co-1"]) {
      const f = await c.at(1.5, shown, id);
      assert.ok(f.x0 <= f.left - 19 && f.x1 >= f.right + 19, `${id} fully open: ${JSON.stringify(f)}`);
    }
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene: a label without dy sits below the object's lowest point, an explicit dy wins, the link starts under the label", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 2, mode: "panel", theme: "night",
    items: [{ id: "tt", kind: "turntable", x: 540, y: 600, size: 240, tin: 0, label: { text: "вертушка" } },
      { id: "fx", kind: "turntable", x: 300, y: 1100, size: 240, tin: 0, label: { text: "dy 44", dy: 44 } },
      { id: "kk", kind: "key", x: 780, y: 1100, size: 160, tin: 0, label: { text: "ключ" } }],
    links: [{ from: "tt", to: "fx", tin: 0.1, dur: 0.3 }] }));
  try {
    const geo = (id) => { const s = document.getElementById("ok-item-" + id), l = document.getElementById("ok-label-" + id);
      return { bottom: parseFloat(s.style.top) + +s.getAttribute("height"), top: parseFloat(l.style.top), y: parseFloat(l.style.top) }; };
    const tt = await c.at(1, geo, "tt"), fx = await c.at(1, geo, "fx"), kk = await c.at(1, geo, "kk");
    assert.ok(Math.abs(tt.top - (tt.bottom + 12)) < 0.2, `the label top ${tt.top} is 12 px below the svg bottom ${tt.bottom}`);
    assert.equal(fx.top, 1100 + 44, "an explicit dy wins");
    assert.ok(fx.top < fx.bottom, "…even when it overlaps the object");
    const want = await c.at(1, (kind) => { const [, vy, vw, vh] = OK.O[kind].vb; return 1100 + Math.max(44, (vy + vh) * (160 / vw) + 12); }, "key");
    assert.ok(Math.abs(kk.top - want) < 0.2, `a key: the label top ${kk.top} is ${want} (the 44 px minimum if it is short)`);
    const d = await c.at(1, () => document.getElementById("ok-link-0").getAttribute("d"));
    const y1 = +/^M[\d.]+,([\d.]+)/.exec(d)[1];
    assert.ok(Math.abs(y1 - (tt.top + 44)) < 0.6, `the link starts 44 px under the label top: ${y1} vs ${tt.top}`);
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene prompt: the text is typed in full before send, the reply never comes before the typing ends", { timeout: 60000 }, async () => {
  const text = "стеклянный звон";
  const run = (p) => openClip(scene({ T: 4, mode: "panel", theme: "night", prompt: { y: 300, w: 860, text, t: 0.5, ...p } }));
  const txt = () => document.getElementById("ok-prompt-text").textContent;
  const rep = () => { const e = document.getElementById("ok-prompt-reply"); return getComputedStyle(e).display === "none" ? 0 : +e.style.opacity; };
  let c = await run({ dur: 0.9, send: 1.0, reply: { t: 0.9, text: "ответ" } });     // send 0.5 s after t: typing gets 0.23 s
  try {
    assert.ok((await c.at(0.8, txt)).length < text.length, "still typing right after its start");
    assert.equal(await c.at(0.99, txt), text, "typed in full before send (it ends at send − 0.02 = 0.98)");
    assert.equal(await c.at(1.0, txt), text);
    assert.equal(await c.at(0.95, rep), 0, "the reply waits for the end of the typing, not its own earlier time");
    assert.ok(await c.at(1.3, rep) > 0.9, "and comes right after");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
  c = await run({ dur: 0.6, send: 1.4, reply: { t: 1.6, text: "ответ" } });           // roomy send: the given duration is kept
  try {
    assert.ok((await c.at(1.1, txt)).length < text.length, "dur 0.6 is kept when send is far");
    assert.equal(await c.at(1.4, txt), text);
  } finally { await c.browser.close(); }
  c = await run({ dur: 0.9, send: 0.6, reply: { t: 0.7, text: "ответ" } });           // send right after the start: never below 0.15 s
  try {
    assert.equal(await c.at(0.75 + 0.16, txt), text, "the floor is 0.15 s");
    assert.ok((await c.at(0.75 + 0.05, txt)).length < text.length);
  } finally { await c.browser.close(); }
});

test("object scene chapter: a key with the same idx does not type it again, a changed idx types it again", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 5, mode: "panel", theme: "night",
    chapter: { idx: "01 — тест", l1: "Раз", l2: "два", y: 200, tin: 0.1, keys: [[1.5, { l1: "Три" }], [3, { idx: "02 — другой", l1: "Четыре" }]] } }));
  try {
    const idx = () => { const b = [...document.querySelectorAll(".okidx")].find((e) => e.parentElement.style.display !== "none"); return b ? b.textContent : null; };
    assert.equal(await c.at(1.0, idx), "01 — тест");
    assert.equal(await c.at(1.55, idx), "01 — тест", "an unchanged idx stays whole on the key");
    assert.equal(await c.at(1.51, idx), "01 — тест");
    assert.ok((await c.at(3.05, idx)).length < "02 — другой".length, "a changed idx types again");
    assert.equal(await c.at(3.6, idx), "02 — другой");
    // the lines still wipe on every key
    const clip = () => [...document.querySelectorAll(".okt1")].find((e) => e.parentElement.style.display !== "none").style.clipPath;
    assert.notEqual(await c.at(1.6, clip), await c.at(2.5, clip), "l1 wipes in on the key");
    assert.deepEqual(c.errors, []);
  } finally { await c.browser.close(); }
});

test("object scene drops: a dropped object fades in over 0.1 s instead of popping in", { timeout: 60000 }, async () => {
  const c = await openClip(scene({ T: 2, mode: "panel", theme: "night",
    items: [{ id: "f", kind: "folder", x: 540, y: 900, size: 200, tin: 0 }], drops: [{ into: "f", kind: "document", n: 1, t: 0.3, size: 70 }] }));
  try {
    const op = () => { const e = document.getElementById("ok-drop-0-0"); return getComputedStyle(e).display === "none" ? null : +e.style.opacity; };
    const a = await c.at(0.32, op), b = await c.at(0.35, op), d = await c.at(0.5, op);
    assert.ok(a != null && a < 0.35, `starts transparent: ${a}`);
    assert.ok(b > a && b < 0.8, `fading: ${b}`);
    assert.ok(d > 0.99, `solid after 0.1 s: ${d}`);
    assert.ok(await c.at(0.3 + 0.55 + 0.19, op) < 0.1, "and still sinks away at the end");
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

test("object scene terminal: fs sets the code size, line height, title and caret; without fs the old 26/40", { timeout: 60000 }, async () => {
  const term = (fs) => scene({ T: 2, mode: "panel", theme: "night", terminal: { x: 40, y: 340, w: 1000, h: 560, title: "агент",
    ...(fs ? { fs } : {}), tin: -0.2, lines: [{ t: 0.2, text: "curl x", kind: "cmd", dur: 0.3 }] } });
  const st = () => {
    const b = getComputedStyle(document.getElementById("ok-term")), car = getComputedStyle(document.querySelector("#ok-row-0 .okcar"));
    return [b.fontSize, b.lineHeight, getComputedStyle(document.querySelector("#ok-term > div:first-child")).fontSize, car.width, car.height];
  };
  const big = await openClip(term(34));
  try {
    assert.deepEqual(await big.at(1.0, st), ["34px", "52px", "31px", "18px", "39px"]);
    assert.deepEqual(big.errors, []);
  } finally { await big.browser.close(); }
  const small = await openClip(term(0));
  try {
    assert.deepEqual(await small.at(1.0, st), ["26px", "40px", "30px", "14px", "30px"]);
  } finally { await small.browser.close(); }
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

test("applyHide: a group's linger tail does not come back after the hide window, a spoken word past the window does", async () => {
  const { applyHide } = await import("../scripts/ru/make-captions.mjs");
  const hide = [{ in: 39.62, out: 44.36 }];
  // spoken 43.42–44.30 inside the window, 0.6 s linger to 44.90: only the tail would be left after 44.36
  const tail = { start: 43.42, end: 44.9, lines: [[{ text: "хвост", start: 43.42, end: 44.3 }]] };
  assert.deepEqual(applyHide([tail], hide), [], "a cue spoken inside the window leaves nothing after it");
  const edge = { start: 43.42, end: 44.9, lines: [[{ text: "ровно", start: 43.42, end: 44.36 }]] };
  assert.deepEqual(applyHide([edge], hide), [], "a last word ending exactly at the window end is not spoken after it");
  const past = { start: 43.42, end: 45.2, lines: [[{ text: "раз", start: 43.42, end: 43.8 }, { text: "два", start: 44.2, end: 44.8 }]] };
  assert.deepEqual(applyHide([past], hide).map((c) => [c.start, c.end]), [[44.36, 45.2]], "a word spoken after the window keeps the rest");
  const before = { start: 38.5, end: 40.2, lines: [[{ text: "до", start: 38.5, end: 39.9 }]] };
  assert.deepEqual(applyHide([before], hide).map((c) => [c.start, c.end]), [[38.5, 39.62]], "a cue that starts before the window is still cut at its edge");
  assert.equal(applyHide([{ start: 50, end: 51, lines: [[{ text: "после", start: 50, end: 50.8 }]] }], hide).length, 1, "outside the window: untouched");
});

test("kinetic captions: a theme edge within 0.05 s after a group's start still ends the group there", async () => {
  const { kineticGroups, kineticConfig, kineticHtml } = await import("../scripts/ru/make-captions.mjs");
  const { loadBrand } = await import("../scripts/ru/lib/brand.mjs");
  const brand = loadBrand();
  const words = [{ text: "Раз", start: 1, end: 1.3 }, { text: "два", start: 1.35, end: 1.6 }];
  const ov = { style: "kinetic", kinetic: { theme_default: "dark", theme_keys: [{ at: 1.05, theme: "light" }, { at: 3, theme: "dark" }] } };
  const g = kineticGroups({ words }, kineticConfig(brand, ov), ov);
  const html = kineticHtml(g, { duration: 4, brand, fontUrl: "a.ttf", accentUrl: "b.ttf", overrides: ov });
  const m = /id="c0" class="kg dark clip" data-start="([\d.]+)" data-duration="([\d.]+)"/.exec(html);
  assert.ok(m, "the first group is dark");
  assert.ok(Number(m[1]) + Number(m[2]) <= 1.05 + 1e-6, `the dark group ends at the edge 1.05, not ${Number(m[1]) + Number(m[2])}`);
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

test("night_base frame_count: round(video-stream duration × fps), not the native frame count", { timeout: 60000 }, () => {
  const d = tmp("fc-");
  ff("-f", "lavfi", "-i", "color=c=red:s=64x64:r=30:d=0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(d, "a.mp4"));      // 12 native frames at 30 fps
  const r = py(`import sys, json
sys.path.insert(0, "scripts/ru/wide")
from night_base import frame_count
out = {"at25": frame_count(${JSON.stringify(join(d, "a.mp4"))}, 25), "at30": frame_count(${JSON.stringify(join(d, "a.mp4"))}, 30)}
try: frame_count(${JSON.stringify(join(d, "missing.mp4"))}, 25)
except SystemExit as e: out["missing"] = str(e)
open(${JSON.stringify(join(d, "nofile.txt"))}, "w").write("not a video")
try: frame_count(${JSON.stringify(join(d, "nofile.txt"))}, 25)
except SystemExit as e: out["junk"] = str(e)
print(json.dumps(out))`);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.equal(o.at25, 10, "0.4 s at the project's 25 fps is 10 frames, as frames() reads them (a 30 fps file has 12 native ones)");
  assert.equal(o.at30, 12);
  assert.match(o.missing, /ffprobe не прочитал/);
  assert.ok(o.junk, "a file without a video stream stops with a message");
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

// ---------- cine: планы спикера ----------

const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
const cinePy = (code) => {
  const r = py(`import sys, json; sys.path.insert(0, "scripts/ru/wide")\nimport cine\n${code}`);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
};

test("cine shots: mid before the first key, an expo-out move, a cut with dur 0, motion only while moving", () => {
  const o = cinePy(`
sh = [(1.0, "side-right", 0.6), (3.0, "close", 0.0)]
print(json.dumps({"before": cine.state(sh, 0.5), "start": cine.state(sh, 1.0), "half": cine.state(sh, 1.06),
  "end": cine.state(sh, 1.7), "cut": cine.state(sh, 3.0), "mv": [cine.moving(sh, t) for t in (0.99, 1.0, 1.59, 1.6, 3.0)],
  "pad": [cine.moving(sh, 0.8, 0.3), cine.moving(sh, 0.6, 0.3)], "shutter": cine.shutter(25)}))`);
  assert.deepEqual(o.before, [1, 0, 0]);
  assert.deepEqual(o.start, [1, 0, 0]);
  near(o.half[0], 0.93); near(o.half[1], 120); near(o.half[2], -0.5);
  near(o.end[0], 0.86); near(o.end[1], 240); near(o.end[2], -1);
  near(o.cut[0], 1.38); near(o.cut[1], 0); near(o.cut[2], 0);
  assert.deepEqual(o.mv, [false, true, true, false, false]);
  assert.deepEqual(o.pad, [true, false]);
  o.shutter.forEach((v, i) => near(v, [-0.0075, -0.0025, 0.0025, 0.0075][i], 1e-9));
});

test("cine load_shots: no file is no shots; unknown shot, unsorted at, negative dur and a non-mid accent window stop the run", () => {
  const d = tmp("shots-"), p = join(d, "shots.json");
  const load = (shots, acc = "[]") => {
    if (shots) writeFileSync(p, JSON.stringify({ shots }));
    return py(`import sys, json, pathlib; sys.path.insert(0, "scripts/ru/wide")\nimport cine\nprint(json.dumps(cine.load_shots(pathlib.Path(${JSON.stringify(p)}), ${acc})))`);
  };
  let r = load(null);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "[]");
  r = load([{ at: 0, shot: "close", dur: 0 }, { at: 2, shot: "mid" }], "[(3.0, 4.0)]");
  assert.equal(r.status, 0, r.stderr); assert.deepEqual(JSON.parse(r.stdout), [[0, "close", 0], [2, "mid", 0.6]]);
  r = load([{ at: 0, shot: "wide" }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /план 'wide'/);
  r = load([{ at: 2, shot: "mid" }, { at: 1, shot: "close" }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /не по возрастанию/);
  r = load([{ at: 1, shot: "close", dur: -1 }]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /dur < 0/);
  r = load([{ at: 0, shot: "side-left", dur: 0 }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /окне акцента 3\.00–4\.00.*at 0/);
  r = load([{ at: 0, shot: "mid", dur: 0 }, { at: 3.5, shot: "close" }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0); assert.match(r.stderr, /at 3\.5/);
  r = load([{ at: 2.8, shot: "mid" }], "[(3.0, 4.0)]");
  assert.notEqual(r.status, 0, "a move into mid that is still running at the window start"); assert.match(r.stderr, /at 2\.8/);
});

test("cine affine and feather: the shot scales from the frame bottom after the punch-in; only a card edge inside the frame fades", () => {
  const o = cinePy(`
import numpy as np
A = cine.affine(0.86, 240.0)
fwd = lambda x, y: ((x - A[2]) / A[0], (y - A[5]) / A[4])
m = np.ones((4, 1080), np.float32)
mid = cine.feather(m, *cine.card_edges(1.0, 0.0, -3, 1088))
side = cine.feather(m, *cine.card_edges(0.86, 240.0, -3, 1088))
P = cine.affine(1.0, 0.0, 1.05)
print(json.dumps({"bottom": fwd(540, 1920), "top": fwd(540, 1030), "edges": cine.card_edges(0.86, 240.0, -3, 1088),
  "mid_same": bool((mid == m).all()), "side": [float(side[0, x]) for x in (300, 400, 500, 1000)],
  "punch": [P[0], P[2], P[4], P[5]]}))`);
  near(o.bottom[0], 780); near(o.bottom[1], 1920);
  near(o.top[1], 1154.6, 0.1);
  near(o.edges[0], 313.02, 0.01); near(o.edges[1], 1248.7, 0.01);
  assert.equal(o.mid_same, true, "mid: both card edges are off the frame, the mask is untouched");
  near(o.side[0], 0); near(o.side[1], 0.5436, 1e-3); near(o.side[2], 1); near(o.side[3], 1);
  near(o.punch[0], 1 / 1.05); near(o.punch[1], 540 - 540 / 1.05); near(o.punch[3], 1330 - 1330 / 1.05);
});

test("cine light: the grade pulls shadows to night black and keeps highlights; wrap lights the inner edge; key on the graphics side; halo pulse", () => {
  const o = cinePy(`
import numpy as np
g = cine.grade(np.array([[[0, 0, 0], [40, 40, 40], [200, 180, 170], [255, 255, 255]]], np.float32))
m = np.zeros((200, 200), np.float32); m[50:150, 50:150] = 1
rgb = np.full((200, 200, 3), 60, np.float32); bg = np.zeros((200, 200, 3), np.float32); bg[..., 2] = 255
w = cine.wrap(rgb, m, bg)
kR, kL, k0 = cine.key(rgb, m, 1.0), cine.key(rgb, m, -1.0), cine.key(rgb, m, 0.0)
print(json.dumps({"g": g[0].round(1).tolist(), "edge": w[100, 52].tolist(), "centre": w[100, 100].tolist(),
  "kR": [float(kR[100, 147, 0]), float(kR[100, 52, 0])], "kL": [float(kL[100, 52, 0]), float(kL[100, 147, 0])],
  "k0": bool((k0 == rgb).all()), "pulse": [cine.pulse(t, [5.0]) for t in (4.9, 5.0, 5.4, 5.79, 5.8)]}))`);
  const [black, dark, skin, white] = o.g;
  assert.ok(black[2] > black[0] && black[2] > 8 && black[0] < 15, `black → night purple-black ${black}`);
  assert.ok(dark[0] < 40 && dark[2] > dark[0], `dark grey goes darker and purple ${dark}`);
  assert.deepEqual(skin, [200, 180, 170], "light tones are untouched");
  assert.deepEqual(white, [255, 255, 255]);
  assert.ok(o.edge[2] > 120 && o.edge[0] < 61, `the inner edge takes the blue background ${o.edge}`);
  assert.ok(o.centre[2] < 62, `the centre stays ${o.centre}`);
  assert.ok(o.kR[0] > o.kR[1] + 15, `side +1: light on the right edge ${o.kR}`);
  assert.ok(o.kL[0] > o.kL[1] + 15, `side −1: light on the left edge ${o.kL}`);
  assert.equal(o.k0, true, "side 0: no key");
  near(o.pulse[0], 1); near(o.pulse[1], 1); near(o.pulse[2], 1.6); assert.ok(o.pulse[3] > 1 && o.pulse[3] < 1.05); near(o.pulse[4], 1);
});

// ---------- night base: кино-режим ----------

function frameRGB(video, n) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${n})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, String(r.stderr));
  const w = r.stdout.length / 3 / 1920;
  return (x, y) => { const i = (y * w + x) * 3; return [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; };
}

function cineProject(prefix, { fx, shots, dur = 0.4 } = {}) {
  const P = tmp(prefix);
  for (const d of ["assets", "renders", "broll", "work", "fx/masks"]) mkdirSync(join(P, d), { recursive: true });
  writeFileSync(join(P, "assets/raw.mp4"), "");
  writeFileSync(join(P, "PROBE.json"), JSON.stringify({ summary: { fps: 25 } }));
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [{ start: 0, end: dur }] }));
  ff("-f", "lavfi", "-i", `color=c=red:s=1080x1920:r=25:d=${dur}`, "-f", "lavfi", "-i", `sine=f=220:d=${dur}:sample_rate=48000`,
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(P, "renders/clean.mp4"));
  const r = py(`from PIL import Image, ImageDraw
import pathlib
d = pathlib.Path(${JSON.stringify(join(P, "fx/masks"))})
for i in range(${Math.round(dur * 25)}):
    m = Image.new("L", (989, 822), 0); ImageDraw.Draw(m).rectangle((300, 200, 700, 600), fill=255); m.save(d / f"{i:05d}.png")`);
  assert.equal(r.status, 0, r.stderr);
  if (fx) writeFileSync(join(P, "fx/fx.json"), JSON.stringify(fx));
  if (shots) writeFileSync(join(P, "work/shots.json"), JSON.stringify({ shots }));
  return P;
}
const nb = (P, ...a) => spawnSync("python3", ["scripts/ru/wide/night_base.py", P, ...a], { cwd: ROOT, encoding: "utf8" });
const frameCount = (video) => spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", video], { encoding: "utf8" }).stdout.trim();

test("night_base cine: side-right puts the speaker right and smaller, shots need cine, the grade darkens the speaker", { timeout: 120000 }, () => {
  const P = cineProject("cine1-", { fx: { look: "night", cine: true }, shots: [{ at: 0, shot: "side-right", dur: 0 }] });
  const out = join(P, "renders/picture.base.mp4");
  let r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  let px = frameRGB(out, 5);
  assert.ok(px(900, 1500)[0] > 150 && px(900, 1500)[1] < 70, `speaker on the right ${px(900, 1500)}`);
  assert.ok(px(400, 1500)[0] < 70, `night where mid had the speaker ${px(400, 1500)}`);
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  px = frameRGB(out, 5);
  assert.ok(px(400, 1500)[0] > 150, "without cine work/shots.json is ignored: the speaker stays mid");
  const plain = px(547, 1456)[0];
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night", cine: true }));
  rmSync(join(P, "work/shots.json"));
  r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const graded = frameRGB(out, 5)(547, 1456)[0];
  assert.ok(graded < plain - 15 && graded > 170, `grade ${plain} → ${graded}`);
  assert.match(r.stdout, /кино вкл/);
});

test("night_base cine: a move smears the speaker's edges only while it moves; --until cuts the base", { timeout: 120000 }, () => {
  const P = cineProject("cine2-", { fx: { look: "night", cine: true }, shots: [{ at: 0.08, shot: "side-right", dur: 0.24 }] });
  const out = join(P, "renders/picture.base.mp4");
  const r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const soft = (n) => {                       // half-red pixels on a row: the speaker's edges blended with the night
    const px = frameRGB(out, n); let k = 0;
    for (let x = 150; x < 1060; x++) { const [R, G] = px(x, 1500); if (R - G > 60 && R - G < 170) k++; }
    return k;
  };
  const still = soft(9), moving = soft(3);
  assert.ok(still <= 14, `static edges are sharp: ${still}`);
  assert.ok(moving >= 24, `moving edges are smeared: ${moving}`);
  const u = nb(P, "--until", "0.2"); assert.equal(u.status, 0, u.stderr + u.stdout);
  assert.equal(frameCount(out), "5");
});

test("night_base cine: a non-mid shot in a night accent window stops the run and names the key", { timeout: 60000 }, () => {
  const P = cineProject("cine3-", { fx: { look: "night", cine: true }, shots: [{ at: 0, shot: "close", dur: 0 }] });
  ff("-f", "lavfi", "-i", "color=c=green:s=1080x1920:r=25:d=0.16", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/acc.mp4"));
  writeFileSync(join(P, "work/accents.json"), JSON.stringify({ accents: [{ id: "a", in: 0.04, out: 0.2, kind: "night", file: "broll/acc.mp4" }] }));
  const r = nb(P);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /окне акцента 0\.04–0\.20.*at 0/);
});

test("night_base cine punch: an active punch-in eases out with the move instead of snapping; mid entered after a move starts unpunched", { timeout: 60000 }, () => {
  const r = py(`import sys, json; sys.path.insert(0, "scripts/ru/wide")
import night_base as nb
a = {"fps": 25, "shots": [(2.0, "side-right", 0.6)], "toggles": [25, 150]}
b = {"fps": 25, "shots": [(1.0, "side-left", 0.0), (2.0, "mid", 0.6)], "toggles": [75, 200]}
print(json.dumps({"a": [nb.punch_cine(f, a) for f in (49, 50, 51, 55, 65)], "b": [nb.punch_cine(f, b) for f in (60, 70, 80)]}))`);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout.trim().split("\n").pop());
  near(o.a[0], 1.05); near(o.a[1], 1.05, 1e-6);
  assert.ok(o.a[2] < 1.05 && o.a[2] > 1.0, `eases, not snaps: ${o.a[2]}`);
  assert.ok(o.a[3] < 1.006, `nearly gone a third into the move: ${o.a[3]}`);
  near(o.a[4], 1.0);
  near(o.b[0], 1.0, 1e-9); near(o.b[1], 1.0, 1e-9); near(o.b[2], 1.05);
});

test("night_base cine: punch-in toggles stay in mid and 0.3 s away from a move; without cine every join counts as before", { timeout: 120000 }, () => {
  const P = cineProject("cine4-", { fx: { look: "night", cine: true }, shots: [{ at: 1.0, shot: "side-right", dur: 0.6 }], dur: 2.0 });
  writeFileSync(join(P, "EDL.json"), JSON.stringify({ keep_ranges: [0, 1, 2, 3, 4].map((k) => ({ start: k, end: k + 0.4 })) }));
  let r = nb(P, "--until", "0.2"); assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /наезды \[10\]/);
  writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night" }));
  r = nb(P, "--until", "0.2"); assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /наезды \[10, 40\]/);     // joins at frames 10/20/30/40, the old rule keeps ≥ 1 s between toggles
});

test("night_base cine glow: night_bg_at(dx = 0) is the plain night background, the shoulder glow follows dx", { timeout: 60000 }, () => {
  const r = py(`import sys, json; sys.path.insert(0, "scripts/ru/wide")
import numpy as np
import night_base as nb
plain = nb.night_bg(10, 25, grain=False)
at0, at240 = nb.night_bg_at(10, 25, 0), nb.night_bg_at(10, 25, 240)
tot = lambda im, x, y: float(im[y, x].sum())
print(json.dumps({"shape": list(at0.shape), "dtype": str(at0.dtype), "diff": float(np.abs(at0 - plain).max()),
                  "l0": tot(at0, 300, 1900), "r0": tot(at0, 780, 1900), "l240": tot(at240, 300, 1900), "r240": tot(at240, 780, 1900),
                  "top": float(np.abs(at240[:400] - at0[:400]).max())}))`);
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.deepEqual(o.shape, [1920, 1080, 3]); assert.equal(o.dtype, "float32");
  assert.ok(o.diff < 1e-3, `dx 0 is night_bg without grain: max diff ${o.diff}`);
  near(o.l0, o.r0);
  assert.ok(o.r240 > o.l240 + 20, `dx 240 puts the brightest part under the speaker: right ${o.r240}, left ${o.l240}`);
  assert.ok(o.top < 5, `the top glow and the grid stay where they are: ${o.top}`);
});

test("night_base cine: only \"cine\": true turns the cine layer on, any other value reads as off (assemble.mjs does the same)", { timeout: 120000 }, () => {
  for (const v of [1, "true"]) {
    const P = cineProject("cine5-", { fx: { look: "night", cine: v } });
    const r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /кино выкл/, `cine ${JSON.stringify(v)}`);
  }
});

test("night_base: a back clip lies behind the speaker, a missing back file stops the run; assemble does not overlay it again", { timeout: 120000 }, async () => {
  const P = cineProject("back-");
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=0:y=1200:w=1080:h=100:color=0x00FF00@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "broll/back.mov"));
  const clip = { id: "w", in: 0, out: 0.4, kind: "panel", file: "back.mov" };
  const plan = (c) => writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4", clips: [c] }));
  plan({ ...clip, layer: "back" });
  let r = nb(P); assert.equal(r.status, 0, r.stderr + r.stdout);
  const px = frameRGB(join(P, "renders/picture.base.mp4"), 5);
  assert.ok(px(100, 1250)[1] > 150 && px(100, 1250)[0] < 90, `back clip over the night ${px(100, 1250)}`);
  assert.ok(px(547, 1260)[0] > 170 && px(547, 1260)[1] < 70, `the speaker covers it ${px(547, 1260)}`);

  ff("-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=25:d=0.4", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const back = composite(P, join(P, "work/c-back.mov"));
  assert.equal(back.clips, 0);
  assert.ok(frameRGB(join(P, "work/c-back.mov"), 5)(100, 1250)[1] < 90, "a back clip is already in the base");
  plan(clip);
  composite(P, join(P, "work/c-front.mov"));
  assert.ok(frameRGB(join(P, "work/c-front.mov"), 5)(100, 1250)[1] > 150, "a clip without layer stays in front");

  plan({ ...clip, layer: "back" }); rmSync(join(P, "broll/back.mov"));
  r = nb(P);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /нет файлов back-клипов: broll\/back\.mov/);
});

// ---------- assemble: финиш кадра ----------

function patch(get, x, y, r = 2) {
  const v = [];
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const p = get(x + i, y + j); v.push((p[0] + p[1] + p[2]) / 3); }
  const mean = v.reduce((a, b) => a + b) / v.length;
  return { mean, std: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) };
}

test("assemble cine finish: glow on night clips only while they play, none on light ones; vignette and grain only with cine; captions stay clean on top", { timeout: 180000 }, async () => {
  const P = tmp("fin-");
  for (const d of ["assets", "renders/kit", "broll", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
  ff("-f", "lavfi", "-i", "color=c=0x808080:s=1080x1920:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=500:y=900:w=80:h=80:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "broll/sq.mov"));
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=1,format=rgba,drawbox=x=100:y=100:w=200:h=100:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "renders/kit/captions.mov"));
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const run = (name, fx, theme) => {
    writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4",
      clips: [{ id: "sq", in: 0.4, out: 0.8, kind: "panel", file: "sq.mov", ...(theme ? { theme } : {}) }] }));
    if (fx) writeFileSync(join(P, "fx/fx.json"), JSON.stringify(fx)); else rmSync(join(P, "fx/fx.json"), { force: true });
    const out = join(P, `work/${name}.mov`);
    composite(P, out);
    return (n) => frameRGB(out, n);
  };
  const A = run("plain"), B = run("cine", { look: "night", cine: true }), C = run("light", { look: "night", cine: true }, "light"), N = run("nolook", { cine: true });
  const a5 = A(5), a15 = A(15), b5 = B(5), b15 = B(15), c15 = C(15), n5 = N(5), n15 = N(15);
  assert.ok(patch(b15, 586, 940).mean > patch(a15, 586, 940).mean + 15, "glow next to the square while the clip plays");
  assert.ok(Math.abs(patch(b5, 586, 940).mean - patch(a5, 586, 940).mean) < 5, "no glow before the clip");
  assert.ok(Math.abs(patch(c15, 586, 940).mean - patch(a15, 586, 940).mean) < 6, "a light clip gets no glow");
  assert.ok(patch(b5, 40, 40, 4).mean < patch(b5, 540, 960, 4).mean - 20, "vignette with cine");
  assert.ok(Math.abs(patch(b5, 540, 960, 4).mean - patch(a5, 540, 960, 4).mean) < 2, "levels unchanged by the finish where the vignette is ~1");
  assert.ok(Math.abs(patch(a5, 40, 40, 4).mean - patch(a5, 540, 960, 4).mean) < 3, "no vignette without cine");
  assert.ok(patch(b5, 540, 700, 10).std > 1.2, "grain with cine");
  assert.ok(patch(a5, 540, 700, 10).std < 0.8, "no grain without cine");
  // the finish belongs to the night look: { cine: true } without look: "night" renders as the plain composite
  assert.ok(Math.abs(patch(n15, 586, 940).mean - patch(a15, 586, 940).mean) < 2, "cine without the night look: no glow");
  assert.ok(Math.abs(patch(n5, 40, 40, 4).mean - patch(a5, 40, 40, 4).mean) < 2 && patch(n5, 540, 700, 10).std < 0.8, "cine without the night look: no vignette, no grain");
  const cap = patch(b5, 200, 150, 3);
  assert.ok(cap.mean > 248 && cap.std < 1.5, `captions over the finish stay clean ${cap.mean} ${cap.std}`);
  writeFileSync(join(P, "fx/fx.json"), "{ nope");
  assert.throws(() => composite(P, join(P, "work/x.mov")), /fx\/fx\.json: /);
});

function patchRGB(get, x, y, r = 4) {
  const s = [0, 0, 0]; let n = 0;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const p = get(x + i, y + j); for (let c = 0; c < 3; c++) s[c] += p[c]; n++; }
  return s.map((v) => v / n);
}

test("assemble cine finish: the frame's colours stay put however many night clips there are, and every clip still glows", { timeout: 240000 }, async () => {
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const squares = [[100, 300], [800, 300], [100, 1500]], windows = [[0.2, 0.4], [0.4, 0.6], [0.6, 0.8]];
  for (const base of ["0x3C1E78", "0x0E0B14"]) {
    const P = tmp("drift-");
    for (const d of ["renders/kit", "broll", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
    ff("-f", "lavfi", "-i", `color=c=${base}:s=1080x1920:r=25:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
    squares.forEach(([x, y], i) => ff("-f", "lavfi", "-i", `color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=${x}:y=${y}:w=80:h=80:color=white@1:t=fill:replace=1`,
      "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, `broll/sq${i}.mov`)));
    writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4",
      clips: windows.map(([a, b], i) => ({ id: `sq${i}`, in: a, out: b, kind: "panel", file: `sq${i}.mov` })) }));
    composite(P, join(P, "work/plain.mov"));
    writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night", cine: true }));
    composite(P, join(P, "work/cine.mov"));
    const mids = windows.map(([a, b]) => Math.round((a + b) / 2 * 25));   // frames 7, 12, 17
    // before the first clip and inside each of the three: the middle of the frame is where the finish does nothing but the RGB round trip
    for (const n of [3, ...mids]) {
      const a = patchRGB(frameRGB(join(P, "work/plain.mov"), n), 540, 960), b = patchRGB(frameRGB(join(P, "work/cine.mov"), n), 540, 960);
      a.forEach((v, c) => assert.ok(Math.abs(v - b[c]) <= 2, `${base} frame ${n} channel ${c}: plain ${a.map((q) => q.toFixed(1))} cine ${b.map((q) => q.toFixed(1))}`));
    }
    // every clip glows next to its square while it plays (against the same spot after all of them are gone)
    const after = frameRGB(join(P, "work/cine.mov"), 23);
    squares.forEach(([x, y], i) => {
      const on = patchRGB(frameRGB(join(P, "work/cine.mov"), mids[i]), x + 86, y + 40, 2), off = patchRGB(after, x + 86, y + 40, 2);
      const d = (on[0] + on[1] + on[2] - off[0] - off[1] - off[2]) / 3;
      assert.ok(d > 10, `${base} clip ${i} glow ${d.toFixed(1)}`);
    });
  }
});

test("assemble cine finish: only light lines glow — a dark panel and the night background of a full clip stay put, the glow beside the lines stays", { timeout: 240000 }, async () => {
  const { composite, GLOW } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const P = tmp("thr-");
  for (const d of ["renders/kit", "broll", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
  ff("-f", "lavfi", "-i", "color=c=0x0D0913:s=1080x1920:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  // a dark glass panel (rgba(24,18,38,.94)) with a white square and a 4 px white line in it
  ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.4,format=rgba,drawbox=x=260:y=660:w=560:h=600:color=0x181226@0.94:t=fill:replace=1,drawbox=x=500:y=900:w=80:h=80:color=white@1:t=fill:replace=1,drawbox=x=700:y=800:w=4:h=300:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, "broll/panel.mov"));
  // a full night clip: opaque night background and a white square
  ff("-f", "lavfi", "-i", "color=c=0x0E0B14:s=1080x1920:r=25:d=0.4,drawbox=x=500:y=900:w=80:h=80:color=white:t=fill",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "broll/full.mp4"));
  const plan = (c) => writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4", clips: [c] }));
  const cases = [
    ["panel", { id: "p", in: 0.4, out: 0.8, kind: "panel", file: "panel.mov" }, [[300, 700], [780, 1220], [540, 720], [540, 1200]]],
    ["full", { id: "f", in: 0.4, out: 0.8, kind: "full", file: "full.mp4" }, [[300, 700], [780, 1220], [540, 720], [540, 1200]]],
  ];
  for (const [name, clip, far] of cases) {
    plan(clip);
    rmSync(join(P, "fx/fx.json"), { force: true });
    composite(P, join(P, `work/${name}-plain.mov`));
    writeFileSync(join(P, "fx/fx.json"), JSON.stringify({ look: "night", cine: true }));
    composite(P, join(P, `work/${name}-cine.mov`));
    const a = frameRGB(join(P, `work/${name}-plain.mov`), 15), b = frameRGB(join(P, `work/${name}-cine.mov`), 15);
    // 60+ px from every white shape the finish adds nothing (a dark surface is not a light line): the same colour as the plain render
    for (const [x, y] of far) {
      const pa = patchRGB(a, x, y), pb = patchRGB(b, x, y);
      pa.forEach((v, c) => assert.ok(Math.abs(v - pb[c]) <= 2, `${name} (${x}, ${y}) channel ${c}: plain ${pa.map((q) => q.toFixed(1))} cine ${pb.map((q) => q.toFixed(1))}`));
    }
    // 6–10 px beside the square the glow is still there
    const ga = patchRGB(a, 588, 940, 2), gb = patchRGB(b, 588, 940, 2);
    const d = (gb[0] + gb[1] + gb[2] - ga[0] - ga[1] - ga[2]) / 3;
    assert.ok(d > 8, `${name}: glow beside the square ${d.toFixed(1)}`);
    if (name === "panel") {   // a thin line glows too (its blur is weak, the threshold must not eat it)
      const la = patchRGB(a, 712, 950, 2), lb = patchRGB(b, 712, 950, 2);
      const dl = (lb[0] + lb[1] + lb[2] - la[0] - la[1] - la[2]) / 3;
      assert.ok(dl > 8, `panel: glow beside the 4 px line ${dl.toFixed(1)}`);
    }
  }
  assert.equal(GLOW.threshold, 0.3, "the glow source is cut at 30 %");
});

test("assemble: warns about overlapping glow windows and about a base older than its back clip; quiet otherwise", { timeout: 180000 }, async () => {
  const { composite } = await import(new URL("../scripts/ru/assemble.mjs", import.meta.url));
  const P = tmp("warn-");
  for (const d of ["renders/kit", "broll", "work", "fx"]) mkdirSync(join(P, d), { recursive: true });
  ff("-f", "lavfi", "-i", "color=c=0x808080:s=1080x1920:r=25:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(P, "renders/picture.mp4"));
  for (const n of ["a", "b", "back"]) ff("-f", "lavfi", "-i", "color=c=black@0.0:s=1080x1920:r=25:d=0.6,format=rgba,drawbox=x=500:y=900:w=80:h=80:color=white@1:t=fill:replace=1",
    "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le", join(P, `broll/${n}.mov`));
  const clip = (id, a, b, extra = {}) => ({ id, in: a, out: b, kind: "panel", file: `${id}.mov`, ...extra });
  const run = (clips, fx) => {
    writeFileSync(join(P, "broll/plan.json"), JSON.stringify({ video: "../renders/picture.mp4", clips }));
    if (fx) writeFileSync(join(P, "fx/fx.json"), JSON.stringify(fx)); else rmSync(join(P, "fx/fx.json"), { force: true });
    const lines = [], warn = console.warn;
    console.warn = (...a) => lines.push(a.join(" "));
    try { composite(P, join(P, "work/w.mov"), { scale: 0.25 }); } finally { console.warn = warn; }
    return lines;
  };
  const night = { look: "night", cine: true };
  const a = clip("a", 0, 0.4), b = clip("b", 0.2, 0.6);
  const over = run([a, b], night);
  assert.equal(over.length, 1, over.join("\n"));
  assert.match(over[0], /\ba\b.*\bb\b|\bb\b.*\ba\b/, "names both clips");
  assert.deepEqual(run([a, clip("b", 0.4, 0.8)], night), [], "touching windows are fine");
  assert.deepEqual(run([a, clip("b", 0.38, 0.8)], night), [], "less than a frame of overlap is fine");
  assert.deepEqual(run([a, clip("b", 0.2, 0.6, { theme: "light" })], night), [], "a light clip has no glow to collide with");
  assert.deepEqual(run([a, clip("b", 0.2, 0.6, { glow: false })], night), [], "glow: false has no glow to collide with");
  assert.deepEqual(run([a, b]), [], "no cine, no glow, nothing to warn about");

  // a back clip that is newer than the base: the base is stale
  const now = Date.now() / 1000;
  utimesSync(join(P, "renders/picture.mp4"), now - 100, now - 100);
  utimesSync(join(P, "broll/back.mov"), now - 200, now - 200);
  assert.deepEqual(run([a, clip("back", 0, 0.4, { layer: "back" })], night), [], "base newer than the back clip");
  utimesSync(join(P, "broll/back.mov"), now - 10, now - 10);
  const stale = run([a, clip("back", 0, 0.4, { layer: "back" })], night);
  assert.equal(stale.length, 1, stale.join("\n"));
  assert.match(stale[0], /night_base\.py/);
  assert.match(stale[0], /back/);
});
