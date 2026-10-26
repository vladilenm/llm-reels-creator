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
