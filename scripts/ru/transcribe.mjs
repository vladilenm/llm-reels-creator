#!/usr/bin/env node
// S1 transcription with a provider switch and a shared SHA-256 cache.
//
//   --provider openai      (default) OpenAI `whisper-1`, verbose_json with word
//                          timestamps. The only OpenAI model that returns word
//                          times. A Russian verbatim prompt keeps fillers and
//                          retake markers in the text.
//   --provider elevenlabs  ElevenLabs Scribe v2 via scripts/transcribe-elevenlabs.mjs
//                          (needs a network route ElevenLabs accepts).
//
// Output is the provider's raw response plus `_provider`; normalize it with
// scripts/ru/normalize-transcript.mjs (accepts both shapes).
// A cache hit (same file bytes + provider + model + language + prompt) copies the
// stored response and makes no paid call.
//
// Usage:
//   node scripts/ru/transcribe.mjs <media> --out transcript.raw.json
//        [--provider openai|elevenlabs] [--language ru|en|auto] [--no-cache]
// `--language auto` lets the provider detect the language (a foreign reference
// reel for /remake); the Russian verbatim prompt is used only for `ru`.
// Env / .env: OPENAI_API_KEY or ELEVENLABS_API_KEY; TRANSCRIBE_PROVIDER sets the default.

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, createReadStream, openAsBlob, statSync, rmSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
export const OPENAI_MODEL = "whisper-1";
// Whisper follows the style of its prompt: a verbatim, disfluent Russian sample
// makes it keep «э-э», «ну», «вот» and «стоп, ещё раз» instead of cleaning them up.
export const RU_PROMPT = "Э-э, ну, вот, значит… Так, стоп, ещё раз. Мм, короче, агенты, нейросети, фронтенд, React, Claude.";

export function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return undefined;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*?)\\s*$`));
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

export async function sha256File(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}

export function cacheKey({ sha, provider, model, language, prompt }) {
  const p = prompt ? createHash("sha256").update(prompt).digest("hex").slice(0, 8) : "noprompt";
  return `${sha}.${provider}.${model}.${language || "auto"}.${p}`;
}

function extractAudio(media, dir) {
  const out = join(dir, "audio.mp3");
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", media, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "64k", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg audio extraction failed: ${r.stderr}`);
  return out;
}

async function openaiTranscribe(media, { language, prompt }) {
  const key = readEnv("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (env or .env)");
  const dir = mkdtempSync(join(tmpdir(), "stt-"));
  try {
    const audio = extractAudio(media, dir);
    const mb = statSync(audio).size / 2 ** 20;
    if (mb > 24.5) throw new Error(`audio is ${mb.toFixed(1)} MB; OpenAI accepts 25 MB — split the source first`);
    const form = new FormData();
    form.append("file", await openAsBlob(audio), "audio.mp3");
    form.append("model", OPENAI_MODEL);
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    form.append("temperature", "0");
    if (language) form.append("language", language);
    if (prompt) form.append("prompt", prompt);
    const t0 = Date.now();
    const res = await fetch(OPENAI_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const body = await res.text();
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status} after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${body.slice(0, 500)}`);
    return { ...JSON.parse(body), _provider: "openai", _model: OPENAI_MODEL, _seconds: (Date.now() - t0) / 1000 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function elevenlabsTranscribe(media, out, { language, noCache }) {
  const args = [join(ROOT, "scripts/transcribe-elevenlabs.mjs"), media, "--output", out, "--language", language ?? "ru", "--model", "scribe_v2"];
  if (noCache) args.push("--no-cache");
  const r = spawnSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) throw new Error(`ElevenLabs failed: ${(r.stderr || r.stdout).slice(0, 600)}`);
  const json = JSON.parse(readFileSync(out, "utf8"));
  return { ...json, _provider: "elevenlabs", _model: "scribe_v2", _cached: /cached/.test(r.stdout) };
}

export async function transcribe(media, { out, provider, language = "ru", cache = true, cacheDir = join(ROOT, ".cache/transcripts") } = {}) {
  provider = provider || readEnv("TRANSCRIBE_PROVIDER") || "openai";
  if (language === "auto") language = "";
  media = resolve(media);
  out = resolve(out);
  const sha = await sha256File(media);
  if (provider === "elevenlabs") {
    const json = elevenlabsTranscribe(media, out, { language, noCache: !cache });
    writeFileSync(out, JSON.stringify(json, null, 2));
    return { provider, cached: json._cached, sha, out };
  }
  if (provider !== "openai") throw new Error(`unknown provider: ${provider}`);
  const key = cacheKey({ sha, provider, model: OPENAI_MODEL, language, prompt: language === "ru" ? RU_PROMPT : "" });
  const cached = join(cacheDir, `${key}.json`);
  if (cache && existsSync(cached)) {
    copyFileSync(cached, out);
    return { provider, cached: true, sha, out };
  }
  const json = await openaiTranscribe(media, { language, prompt: language === "ru" ? RU_PROMPT : "" });
  writeFileSync(out, JSON.stringify(json, null, 2));
  if (cache) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cached, JSON.stringify(json, null, 2)); }
  return { provider, cached: false, sha, out, words: json.words?.length ?? 0, seconds: json._seconds };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  if (!a.length || a.includes("--help")) {
    console.log("Usage: node scripts/ru/transcribe.mjs <media> --out transcript.raw.json [--provider openai|elevenlabs] [--language ru|en|auto] [--no-cache] [--cache-dir dir]");
    process.exit(a.length ? 0 : 1);
  }
  const o = { cache: true };
  let media = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--out") o.out = a[++i];
    else if (a[i] === "--provider") o.provider = a[++i];
    else if (a[i] === "--language") o.language = a[++i];
    else if (a[i] === "--cache-dir") o.cacheDir = resolve(a[++i]);
    else if (a[i] === "--no-cache") o.cache = false;
    else media = a[i];
  }
  o.out ??= join(dirname(resolve(media)), `${basename(media).replace(/\.[^.]+$/, "")}.transcript.raw.json`);
  try {
    const r = await transcribe(media, o);
    console.log(`${r.cached ? "cached (no API call)" : "transcribed"} · ${r.provider} · sha256 ${r.sha.slice(0, 12)}… → ${r.out}`);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
