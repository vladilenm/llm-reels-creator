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
  assert.match(r.stdout, /кадров без маски: 1 \(первые: 3\)/);
  const out = join(P, "renders/picture.base.mp4");
  const n = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out], { encoding: "utf8" });
  assert.equal(n.stdout.trim(), "10", "every frame of clean.mp4 is rendered");
  assert.ok(pixel(out, 3, 547, 1456)[0] < 100, "frame 3 has no mask: no speaker");
  const g3 = pixel(out, 3, 100, 300);
  assert.ok(g3[0] < 50 && g3[1] < 50 && g3[2] < 70, `frame 3 stays night ${g3}`);
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
