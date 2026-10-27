// The brand sound palette «чисто и дорого» (design 2026-10-26): library folder → Openverse queries and
// length limits (ms). Folder names are Real SFX roles — its build_index.py reads the role from the folder:
// a tick lives in click_tick (a bare "tick" folder gets no role), a low drop in subdrop.
export const PALETTE = {
  whoosh:       { maxMs: 1600, queries: ["whoosh soft air", "swish soft", "whoosh"] },
  whoosh_big:   { maxMs: 2500, queries: ["cinematic whoosh soft", "whoosh transition"] },
  whoosh_small: { maxMs: 800, queries: ["swish short", "swoosh small"] },
  riser:        { maxMs: 5000, queries: ["soft riser", "swell", "reverse cymbal"] },
  hit:          { maxMs: 3000, queries: ["soft impact", "thud", "cinematic hit soft"] },
  subdrop:      { maxMs: 3500, queries: ["sub drop", "low boom", "sub bass hit"] },
  click:        { maxMs: 400, queries: ["switch click", "pen click", "mouse click"] },
  click_tick:   { maxMs: 400, queries: ["tick soft", "wood tick"] },
  pop:          { maxMs: 500, queries: ["soft pop", "bubble pop"] },
  paper:        { maxMs: 1500, queries: ["paper slide", "paper swipe"] },
  glass:        { maxMs: 1500, queries: ["glass tap", "glass ding soft"] },
  chime:        { maxMs: 3000, queries: ["shimmer", "soft bell", "mallet chime"] },
  keyboard:     { maxMs: 8000, queries: ["mechanical keyboard typing", "keyboard typing quiet"] },
  ambience:     { minMs: 10000, maxMs: 120000, long: true, queries: ["room tone", "quiet room ambience"] },
};

// sfx.py / sfx-kit.mjs kinds whose library folder has another name
const KIT_FOLDER = { tick: "click_tick" };
export const folderFor = (kind) => KIT_FOLDER[kind] ?? kind;

// library folders renamed since 2026-10-25 (sfx-fetch.mjs moves them once)
export const LEGACY = { tick: "click_tick" };

export function selectSfx(results, { minMs = 0, maxMs, have = new Set() }) {
  return results.filter((r) => r.license === "cc0" && r.source === "freesound" && r.duration
    && r.duration >= minMs && r.duration <= maxMs && !have.has(r.id));
}
