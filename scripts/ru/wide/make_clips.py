#!/usr/bin/env python3
"""W4 клипы широкого рилса из broll/clips.json → broll/clips/*.html + broll/plan.json.

  python3 scripts/ru/wide/make_clips.py <project>

Два вида клипов (схема — .claude/skills/reel-wide/references/config.md):
  kits  — screen-kit: заголовки по разделам (titles, окно между ними не мигает) + окно, которое играет кадры
          render_screen.py 1:1; переходы между шотами whip / blur / cut.
  swaps — смена фона для OBS-карточки: всё вокруг карточки камеры уходит в тёмный фирменный фон (#0E0B14,
          фиолетовое свечение), карточка — прозрачное окно, крупный текст над ней. Без маски.
          items: ln (Golos 600) · big (Spectral курсив, свечение) · num (Plex Mono) · pill (ссылка);
          kind: line — мягкое появление, pop — пружина, count — счётчик 0 → число; fade_out: false — до конца;
          fade_in: false — тёмный слой сразу (вплотную после тёмной врезки, иначе в карточке видна врезка).
В plan.json смены фона идут последними: assemble.mjs кладёт их поверх окон, перекрытие на 0,15–0,3 с даёт
плавный уход окна под тёмный слой. Рендер: scripts/ru/wide/render-clips.sh <project>."""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import project

P = project(sys.argv[1]); B = P / "broll"
cfg = json.loads((B / "clips.json").read_text())
SH = {s["id"]: s for s in json.loads((B / "shots.json").read_text())}
lay = cfg.get("layout", {})
WIN = lay.get("win", {"x": 540, "y": 380, "w": 900, "h": 480, "tin": -1})
TY = lay.get("title_y", 200)
ID = [0, 0, 900]
(B / "clips").mkdir(exist_ok=True)


def kit(k):
    IN, OUT = k["in"], k["out"]
    media = {s: {"frames": f"../../screens/{s}", "from": 0.02, "url": SH[s]["url"]} for s, _ in k["shots"]}
    titles = [{**t, "y": TY, "tin": round(t["tin"] - IN, 3), **({"tout": round(t["tout"] - IN, 3)} if t.get("tout") else {})}
              for t in k["titles"]]
    c = {"T": round(OUT - IN, 3), "mode": "light", "tin": -1, "tout": None, "titles": titles, "win": WIN, "media": media,
         "shots": [[round(SH[s]["t0"] - IN, 3), s, ID, tr] for s, tr in k["shots"]]}
    (B / "clips" / f"{k['name']}.html").write_text(f"<title>{k['name']}</title>\n<script>\nSK.run({json.dumps(c, ensure_ascii=False)});\n</script>\n", encoding="utf8")
    return {"id": k["name"], "title": k["name"], "line": "", "in": IN, "out": OUT, "kind": "panel", "file": f"{k['name']}.mov"}


SWAP_CSS = """<style>
#sw{position:absolute;left:0;top:0;width:1080px;height:1920px;pointer-events:none;overflow:hidden}
/* смена фона: всё вокруг карточки камеры уходит в тёмный фирменный фон, карточка — прозрачное окно */
#sw .hole{position:absolute;left:48px;top:1100px;width:985px;height:900px;border-radius:68px;box-shadow:0 0 0 3000px #0E0B14}
#sw .glow{position:absolute;left:0;top:0;width:1080px;height:1100px;background:radial-gradient(70% 55% at 50% 100%,rgba(124,58,237,.42) 0%,rgba(124,58,237,.12) 45%,rgba(0,0,0,0) 72%)}
#sw .edge{position:absolute;left:48px;top:1100px;width:985px;height:900px;border-radius:68px;box-shadow:0 0 0 2px rgba(183,156,255,.75),0 0 46px 6px rgba(124,58,237,.45)}
#sw .ln{position:absolute;left:0;width:1080px;text-align:center;font-family:"SK Sans",sans-serif;font-weight:600;font-size:62px;letter-spacing:-.02em;line-height:1;color:#F5F3FA;white-space:nowrap;transform-origin:50% 50%}
#sw .big{position:absolute;left:0;width:1080px;text-align:center;font-family:"SK Serif",serif;font-style:italic;font-weight:600;line-height:1.05;letter-spacing:-.02em;color:#B79CFF;white-space:nowrap;transform-origin:50% 70%;
  text-shadow:0 0 40px rgba(183,156,255,.55),0 0 110px rgba(124,58,237,.55)}
#sw .num{position:absolute;left:0;width:1080px;text-align:center;font-family:"SK Mono",monospace;font-weight:500;line-height:1;letter-spacing:-.04em;color:#B79CFF;white-space:nowrap;transform-origin:50% 60%;
  text-shadow:0 0 40px rgba(183,156,255,.5),0 0 110px rgba(124,58,237,.5)}
#sw .pill{position:absolute;left:50%;transform-origin:50% 50%;padding:14px 30px;border-radius:18px;background:rgba(183,156,255,.12);box-shadow:0 0 0 2px rgba(183,156,255,.55);
  font-family:"SK Mono",monospace;font-weight:500;font-size:40px;line-height:1;color:#F5F3FA;white-space:nowrap}
</style>"""


def swap(s):
    IN, OUT = s["in"], s["out"]; T = round(OUT - IN, 3)
    items = [{"cls": i["cls"], "text": i["text"], "top": i["top"], "size": i.get("size"), "t": round(i["t"] - IN, 3), "kind": i.get("kind", "pop")}
             for i in s["items"]]
    html = f"""<title>{s['name']}</title>
{SWAP_CSS}
<script>
// {s.get('note', '')}
(function(){{
  const root = document.createElement("div"); root.id = "sw";
  document.getElementById("stage").appendChild(root);
  const mk = (cls, txt, top, size) => {{ const e = document.createElement("div"); e.className = cls; if (txt) e.textContent = txt; if (top != null) e.style.top = top + "px"; if (size) e.style.fontSize = size + "px"; root.appendChild(e); return e; }};
  const bg = [mk("hole"), mk("glow"), mk("edge")];
  const IT = {json.dumps(items, ensure_ascii=False)};
  const els = IT.map(it => mk(it.cls, it.kind === "count" ? "" : it.text, it.top, it.size));
  const T = {T}, OUT0 = {"T - 0.3" if s.get("fade_out", True) else "1e9"}, IN0 = {0.25 if s.get("fade_in", True) else 0};
  M.scene({{W:1080, H:1920, T, bg:null, center:[540, 960], intro:null,
    SH:{{none:{{w:0, h:0, r:0, bg:"#FFFFFF", cam:1}}}}, start:"none", SEQ:[], layers:[],
    extra:(t)=>{{
      const k = (IN0 ? M.eo(t / IN0) : 1) * (1 - M.eo((t - OUT0) / 0.3));
      bg.forEach(e => {{ e.style.opacity = k.toFixed(4); }});
      IT.forEach((it, i) => {{
        const e = els[i], v = M.vis(t, it.t - 0.07, OUT0 - 0.05, {{lin:0.3}});
        if (it.kind === "count") {{
          const p = M.eo((t - it.t) / 0.5); e.textContent = String(Math.round(+it.text * Math.max(0, p)));
        }}
        const pop = it.kind === "line" ? 1 : M.S(Math.max(0, t - it.t) * 1.6, 9.5, 0.7);
        const extra = it.cls === "pill" ? " translateX(-50%)" : "";
        M.apply(e, {{...v, s: (it.kind === "line" ? v.s : 0.82 + 0.18 * pop)}}, extra);
      }});
    }}}});
}})();
</script>
"""
    (B / "clips" / f"{s['name']}.html").write_text(html, encoding="utf8")
    return {"id": s["name"], "title": s["name"], "line": s.get("note", ""), "in": IN, "out": OUT, "kind": "panel", "file": f"{s['name']}.mov"}


clips = [kit(k) for k in cfg.get("kits", [])] + [swap(s) for s in cfg.get("swaps", [])]
plan = {"title": cfg.get("title", P.name), "video": "../renders/picture.mp4", "fps": cfg.get("fps", 25), "clips": clips}
(B / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf8")
print("клипы:", [c["id"] for c in clips])
