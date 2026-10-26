// Openverse audio API (api.openverse.org) without a key: anonymous use allows 20 requests/min, 200/day.
// Shared by sfx-fetch.mjs (CC0 sounds) and music-fetch.mjs (CC0 / CC BY music).
import { writeFileSync } from "node:fs";

export const API = "https://api.openverse.org/v1/audio/";
const UA = { "User-Agent": "reels-studio-fetch" };
// CC BY-ND forbids syncing music to a picture (that is an adaptation); CC BY-SA would put the reel itself
// under BY-SA; NC is non-commercial. Design 2026-10-26: CC0 and CC BY only.
export const OK_LICENSES = new Set(["cc0", "by"]);
export const PAUSE_MS = 3200;                              // stays under 20 requests/min
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function searchUrl(q, { license = "cc0", source = null, page = 1, pageSize = 20, length = null } = {}) {
  const p = new URLSearchParams({ q, license, page: String(page), page_size: String(pageSize) });
  if (source) p.set("source", source);
  if (length) p.set("length", length);
  return `${API}?${p}`;
}

export async function search(q, opts = {}, fetchImpl = fetch) {
  const res = await fetchImpl(searchUrl(q, opts), { headers: UA });
  if (!res.ok) throw new Error(`Openverse ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).results ?? [];
}

// maxBytes: a Range request for the head of a long file (the screen needs ~90 s, not the whole track)
export async function download(url, file, { maxBytes = null } = {}, fetchImpl = fetch) {
  const headers = { ...UA, ...(maxBytes ? { Range: `bytes=0-${maxBytes - 1}` } : {}) };
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf.length;
}

export function licenseName(r) {
  if (r.license === "cc0") return "CC0";
  return `CC ${r.license.toUpperCase()} ${r.license_version || "4.0"}`;
}

// the line a CC BY track needs under the reel (CAPTION.md); CC0 needs none
export function creditLine(r) {
  return r.license === "cc0" ? null : `Музыка: «${r.title}» — ${r.creator} (${licenseName(r)})`;
}
