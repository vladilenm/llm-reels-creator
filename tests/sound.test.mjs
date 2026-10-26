import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { searchUrl, creditLine, licenseName, download } from "../scripts/ru/lib/openverse.mjs";
import { selectMusic, MOODS } from "../scripts/ru/music-fetch.mjs";
import { PALETTE, selectSfx, folderFor } from "../scripts/ru/lib/sfx-palette.mjs";
import { haveIds, migrateLegacy } from "../scripts/ru/sfx-fetch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (p = "snd-") => mkdtempSync(join(tmpdir(), p));
const py = (code) => spawnSync("python3", ["-c", code], { cwd: ROOT, encoding: "utf8" });
const ff = (...a) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); };

// ---------- library: Openverse ----------

test("openverse: search URL, licence names and the CC BY credit line", () => {
  const u = new URL(searchUrl("soft piano", { license: "cc0,by", source: "jamendo,freesound", page: 2 }));
  assert.equal(u.searchParams.get("license"), "cc0,by");
  assert.equal(u.searchParams.get("source"), "jamendo,freesound");
  assert.equal(u.searchParams.get("page"), "2");
  assert.equal(licenseName({ license: "cc0" }), "CC0");
  assert.equal(licenseName({ license: "by", license_version: "3.0" }), "CC BY 3.0");
  assert.equal(creditLine({ license: "cc0", title: "x", creator: "y" }), null);
  assert.equal(creditLine({ license: "by", license_version: "4.0", title: "Calm", creator: "Ann" }), "Музыка: «Calm» — Ann (CC BY 4.0)");
});

test("openverse download asks for the head of the file with a Range header", async () => {
  const d = tmp(); let seen;
  const fake = async (url, { headers }) => { seen = headers; return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; };
  const n = await download("https://x/y.mp3", join(d, "y.mp3"), { maxBytes: 1024 }, fake);
  assert.equal(n, 3);
  assert.equal(seen.Range, "bytes=0-1023");
  assert.deepEqual([...readFileSync(join(d, "y.mp3"))], [1, 2, 3]);
});

test("music-fetch keeps CC0 / CC BY instrumentals of 60 s – 8 min and skips seen ids", () => {
  const r = (o) => ({ id: "a", title: "Calm", creator: "c", license: "by", license_version: "4.0", duration: 120000, tags: [], url: "u", ...o });
  const got = selectMusic([
    r({ id: "ok" }), r({ id: "nd", license: "by-nd" }), r({ id: "sa", license: "by-sa" }), r({ id: "nc", license: "by-nc" }),
    r({ id: "short", duration: 30000 }), r({ id: "long", duration: 900000 }), r({ id: "voc", title: "Love song (vocal mix)" }),
    r({ id: "seen" }), r({ id: "inst", tags: [{ name: "instrumental" }] }), r({ id: "zero", license: "cc0" }),
  ], { mood: "спокойный", seen: new Set(["seen"]) });
  assert.deepEqual(got.map((x) => x.id), ["inst", "ok", "zero"]);
  assert.deepEqual(got[0].mood, ["спокойный"]);
  assert.equal(got[1].credit, "Музыка: «Calm» — c (CC BY 4.0)");
  assert.equal(got[2].credit, null);
  assert.equal(got[2].license_name, "CC0");
  assert.ok(Object.keys(MOODS).length >= 6);
});

test("sfx palette: every folder is a Real SFX role, the kit's tick lives in click_tick", () => {
  const expect = { whoosh: "whoosh", whoosh_big: "whoosh", whoosh_small: "whoosh", riser: "riser", hit: "hit",
    subdrop: "sub_drop", click: "click", click_tick: "click", pop: "pop", paper: "paper", glass: "glass",
    chime: "chime", keyboard: "typing", ambience: "ambience" };
  assert.deepEqual(Object.keys(PALETTE).sort(), Object.keys(expect).sort());
  const r = py(`import sys, json; sys.path.insert(0, ".claude/skills/real-sfx/scripts"); from common import tag_roles
print(json.dumps({k: tag_roles(f"main / {k} / x.mp3") for k in ${JSON.stringify(Object.keys(expect))}}))`);
  assert.equal(r.status, 0, r.stderr);
  const roles = JSON.parse(r.stdout);
  for (const [k, role] of Object.entries(expect)) assert.ok(roles[k].includes(role), `${k}: ${roles[k]}`);
  assert.equal(folderFor("tick"), "click_tick");
  assert.equal(folderFor("pop"), "pop");
});

test("sfx-fetch: CC0 Freesound files within the length limit, ids on disk skipped, legacy tick folder moved", () => {
  const r = (o) => ({ id: "a", license: "cc0", source: "freesound", duration: 300, ...o });
  const got = selectSfx([r({ id: "ok" }), r({ id: "by", license: "by" }), r({ id: "js", source: "jamendo" }),
    r({ id: "long", duration: 900 }), r({ id: "have" })], { maxMs: 400, have: new Set(["have"]) });
  assert.deepEqual(got.map((x) => x.id), ["ok"]);
  const d = tmp();
  mkdirSync(join(d, "library", "tick"), { recursive: true });
  writeFileSync(join(d, "library", "tick", "id1.mp3"), "x");
  mkdirSync(join(d, "rejected", "click_tick"), { recursive: true });
  writeFileSync(join(d, "rejected", "click_tick", "id2.mp3"), "x");
  const credits = migrateLegacy(join(d, "library"), { "brand/sfx/library/tick/id1.mp3": { kind: "tick" } });
  assert.ok(existsSync(join(d, "library", "click_tick", "id1.mp3")));
  assert.deepEqual(Object.keys(credits), ["brand/sfx/library/click_tick/id1.mp3"]);
  assert.equal(credits["brand/sfx/library/click_tick/id1.mp3"].kind, "click_tick");
  assert.deepEqual([...haveIds(d, "click_tick")].sort(), ["id1", "id2"]);
});

// ---------- library: measurements ----------

test("audio_measure: voice band, clipping, intro, evenness, attack, hiss, brightness, antiphase", () => {
  const r = py(`
import sys, numpy as np
sys.path.insert(0, "scripts/ru/lib"); import audio_measure as A
sr = 22050; t = np.arange(sr * 20) / sr; rng = np.random.default_rng(1)
hi = 0.5 * np.sin(2 * np.pi * 2000 * t); lo = 0.5 * np.sin(2 * np.pi * 100 * t)
assert A.band_share(hi, sr) > 0.9 and A.band_share(lo, sr) < 0.05
assert A.clip_fraction(np.clip(3 * lo, -1, 1)) > 0.3 and A.clip_fraction(lo) == 0
noise = 0.2 * rng.standard_normal(sr * 30)
i = A.intro_seconds(np.concatenate([np.zeros(sr * 10), noise]), sr); assert 9.0 <= i <= 10.5, i
assert A.loudness_range_db(noise, sr) < 1.5
steps = np.concatenate([noise[: sr * 5], 0.1 * noise[: sr * 5]] * 4)
assert A.loudness_range_db(steps, sr) > 12
s, rg = A.steadiest_window(np.concatenate([steps, noise]), sr, 0, dur_s=10, until_s=60); assert s >= 40 and rg < 1.5, (s, rg)
click = np.zeros(sr); click[100:300] = np.exp(-np.arange(200) / 20) * rng.standard_normal(200)
ramp = np.zeros(sr); ramp[:4410] = np.linspace(0, 1, 4410) * rng.standard_normal(4410) * 0.5
assert A.attack_ms(click, sr) < 5 and A.attack_ms(ramp, sr) > 100, (A.attack_ms(click, sr), A.attack_ms(ramp, sr))
a, b = A.audible_span(click, sr); assert b - a < 0.02
sr2 = 44100; k = np.arange(int(0.3 * sr2)) / sr2
hissy = 0.05 * rng.standard_normal(len(k)) + 0.8 * np.sin(2 * np.pi * 3000 * k) * np.exp(-60 * (k - 0.1)) * (k >= 0.1)
lv, fl = A.hiss(hissy, sr2); assert lv > -35 and fl > 0.4, (lv, fl)
t3 = np.arange(3 * sr2) / sr2
_, fl3 = A.hiss(0.5 * np.sin(2 * np.pi * 800 * t3) * np.sin(np.pi * t3 / 3), sr2); assert fl3 < 0.1, fl3
assert A.hiss(np.zeros(100), sr2) == (None, None)
assert A.stereo_corr(np.stack([lo, -lo], 1)) < -0.9 and A.stereo_corr(np.stack([lo, lo], 1)) > 0.99
assert 1800 < A.centroid_hz(hi, sr) < 2200
print("ok")
`);
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

const BEAT = "0.5*sin(2*PI*55*t)*exp(-20*mod(t\\,0.6))+0.08*sin(2*PI*220*t)+0.05*sin(2*PI*330*t)";

test("music_screen: a steady 100 BPM track passes with its tempo, a long intro and clipping fail", { timeout: 180000 }, () => {
  const d = tmp("music-");
  ff("-f", "lavfi", "-i", `aevalsrc=${BEAT}:s=22050:d=70`, join(d, "good.wav"));
  ff("-f", "lavfi", "-i", `aevalsrc=(${BEAT})*gte(t\\,12):s=22050:d=82`, join(d, "intro.wav"));
  ff("-f", "lavfi", "-i", `aevalsrc=4*(${BEAT}):s=22050:d=70`, join(d, "clip.wav"));
  writeFileSync(join(d, "candidates.json"), JSON.stringify(Object.fromEntries(
    ["good", "intro", "clip"].map((k) => [k, { file: join(d, `${k}.wav`) }]))));
  const r = spawnSync("python3", ["scripts/ru/music_screen.py", "--dir", d], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(join(d, "screen.json"), "utf8"));
  assert.equal(s.good.status, "pass", JSON.stringify(s.good));
  assert.ok(Math.abs(s.good.bpm - 100) < 3, `bpm ${s.good.bpm}`);
  assert.ok(s.good.range_db < 3 && s.good.excerpt_start >= 0, JSON.stringify(s.good));
  assert.deepEqual(s.intro.reasons, ["intro"]);
  assert.ok(s.clip.reasons.includes("clipping"));
});

test("sfx_screen: clipped, hissy and wrong-length files go to rejected/, the best per role stay, approved never move", { timeout: 60000 }, () => {
  const d = tmp("sfxs-"), lib = join(d, "library");
  for (const f of ["click", "whoosh"]) mkdirSync(join(lib, f), { recursive: true });
  const gen = (rel, expr, dur) => ff("-f", "lavfi", "-i", `aevalsrc=${expr}:s=44100:d=${dur}`, join(lib, rel));
  gen("click/good1.wav", "0.8*sin(2*PI*3000*t)*exp(-200*t)", 0.3);
  gen("click/good2.wav", "0.7*sin(2*PI*2500*t)*exp(-150*t)", 0.3);
  gen("click/good3.wav", "0.6*sin(2*PI*1000*t)*exp(-150*t)", 0.3);
  gen("click/clipped.wav", "4*sin(2*PI*3000*t)*exp(-20*t)", 0.3);
  gen("click/hissy.wav", "0.05*(2*random(0)-1)+0.8*sin(2*PI*3000*t)*exp(-200*(t-0.1))*gte(t\\,0.1)", 0.3);
  gen("whoosh/long.wav", "0.5*sin(2*PI*800*t)*sin(PI*t/3)", 3);
  writeFileSync(join(lib, "credits.json"), JSON.stringify({ "brand/sfx/library/click/clipped.wav": { kind: "click" },
    "brand/sfx/library/click/good3.wav": { kind: "click", approved: "2026-10-26" } }));
  const r = spawnSync("python3", ["scripts/ru/sfx_screen.py", "--lib", lib, "--per-role", "1"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(readFileSync(join(lib, "screen.json"), "utf8"));
  assert.equal(s["click/good1.wav"].status, "shortlist", JSON.stringify(s["click/good1.wav"]));
  assert.equal(s["click/good2.wav"].status, "reserve");
  assert.equal(s["click/good3.wav"].status, "approved");
  assert.ok(s["click/clipped.wav"].reasons.includes("clipping"));
  assert.ok(s["click/hissy.wav"].reasons.includes("noisy"), JSON.stringify(s["click/hissy.wav"]));
  assert.deepEqual(s["whoosh/long.wav"].reasons, ["length"]);
  assert.ok(existsSync(join(d, "rejected", "click", "clipped.wav")));
  assert.ok(existsSync(join(d, "reserve", "click", "good2.wav")));
  assert.ok(existsSync(join(lib, "click", "good1.wav")) && existsSync(join(lib, "click", "good3.wav")));
  const credits = JSON.parse(readFileSync(join(lib, "credits.json"), "utf8"));
  assert.ok("brand/sfx/rejected/click/clipped.wav" in credits, Object.keys(credits).join(", "));
});
