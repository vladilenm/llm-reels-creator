/* Reels Studio screen kit for motion-broll clips (built by scripts/ru/broll/build.py).
   «Окно над головой»: the speaker stays full-frame and low in the shot; above the head sit a
   two-line title (grotesque + Playfair Italic on an accent plate), a row of app icons and a macOS
   browser window that plays our own screenshots / screen recordings with camera moves, text
   highlights, a focus ring, a cursor and a star counter. mode 'dark' is the full-frame insert on
   the brand background; mode 'card' is a full-frame light card on the brand canvas («Плагин номер
   один» + window). A numbered list (name blurred, stars visible) is the «top N» hook. Every style is a pure function of t (engine contract); media are preloaded
   and render.js / beats.js wait for window.READY before the first seek.

   SK.run({
     T, mode:'light'|'dark'|'card', tin:0, tout:null, theme?:'night',
       night look (2026-10-26): no title plate (wipes, italic in accent_light, title.idx = typed chapter index),
       glass window whose frame draws in by a line, light running along its top edge on entry and shot changes,
       win.enter:'fly' (arrives from depth after an object scene's fly) | 'grid' (assembles from the grid's cells),
       win.layers:{t, dur:0.9, n:3, gap:80, tilt:22, orbit:5, labels:[]} (opens into a stack of glass layers),
       marks kind 'lens' {keys:[[t,x,y]], r, zoom, t0, t1}, kind 'pull' {rect:[x,y,w,h] media px, t, dur:0.8, to:[x,y]
       frame px, scale:1.5, tout} (a piece leaves the window and lands on its place), glass list rows, a night card
     title:{l1, l2, y:372, tin?, tout?},          captions ≈1000–1070, the head starts ≈1095 (SHOOT.md)
     titles:[{l1, l2, y?, tin, tout}],            several titles in turn over one window (sections of a long clip)
     icons:{y:548, size:56, items:[{label, src?}], active:[[t, index]], tin?, tout?},
     win:{x:540, y:624, w:820, h:340, keys:[[t,{x?,y?,w?,h?}]], tin?, tout?, bar:52, pager?:'1/5'},
     media:{id:{src:'file.png'} | {frames:'dir', from:0}, url:'github.com/…'},   paths relative to the fragment
     shots:[[t, id, [x, y, w], trans:'whip'|'blur'|'cut']],   camera = visible media rect (x, y, width)
     cams:[[t, [x, y, w], dur=0.7]],                          camera moves inside the current shot
     marks:[{kind:'hl'|'ring'|'blur', rect:[x,y,w,h], t0, t1, shot?}],   media pixels; blur hides private text
     cursor:{keys:[[t, x, y]], clicks:[t]},                    media pixels
     counter:{t, from:0, to:314, suffix:'k', label:'звёзд на GitHub', x:540, y:880, tout?, lead?:'hide'},
     list:{y:600, w:820, row:78, items:[{name, stars:'108k', t, lit?}], blur:[t0, t1|null], active:[[t, i]], tout?,
           cols?:2, gap?:24, rh?:62, mono?:true},   cols: column-major grid; rh: row height; no stars → no star pill
   })                                                                                              */
(function(){
const SK = window.SK = window.SK || {};
const {clamp, eo, eio} = M;
const B = SK.BRAND || {accent:'#7C3AED', accent_light:'#B79CFF', accent_soft:'#EDE6FF', background:'#0E0B14', ink:'#F5F3FA'};
const W = 1080, H = 1920, INK_DARK = '#17141C';
const rgba = (hex, a)=>{const [r,g,b]=M.hex(hex); return `rgba(${r},${g},${b},${a})`;};
const url = (p)=>/^(data:|file:|https?:|\/)/.test(p) ? p : (SK.BASE || '') + p;

const css = `
#sk{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;font-family:'SK Sans','Geist',sans-serif;z-index:5}
#sk .a{position:absolute}
.sk-haze{left:0;top:0;width:${W}px;height:${H}px;background:linear-gradient(180deg,rgba(255,255,255,.66) 0%,rgba(255,255,255,.5) 34%,rgba(255,255,255,.18) 50%,rgba(255,255,255,0) 60%)}
.sk-glow{left:0;top:0;width:${W}px;height:${H}px;background:radial-gradient(120% 55% at 50% 108%,${rgba(B.accent,.42)} 0%,${rgba(B.accent,.12)} 45%,rgba(0,0,0,0) 70%),radial-gradient(90% 40% at 50% -8%,${rgba(B.accent_light,.14)} 0%,rgba(0,0,0,0) 60%)}
.sk-t1{left:0;width:${W}px;text-align:center;font-weight:700;font-size:56px;letter-spacing:-.02em;line-height:1;color:${INK_DARK};white-space:nowrap}
.sk-t2w{left:0;width:${W}px;display:flex;justify-content:center}
.sk-t2{position:relative;padding:6px 26px 14px;border-radius:16px;background:${B.accent};color:#fff;font-family:'SK Serif',serif;font-style:italic;font-weight:600;font-size:68px;line-height:1;letter-spacing:-.01em;white-space:nowrap;box-shadow:0 10px 30px -10px ${rgba(B.accent,.6)}}
.sk-ic{border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;letter-spacing:-.02em;overflow:hidden}
.sk-ic img{width:100%;height:100%;object-fit:contain}
.sk-win{border-radius:26px;background:#fff;overflow:hidden;transform-origin:50% 50%}
.sk-bar{position:absolute;left:0;top:0;right:0;background:#F7F6FA;border-bottom:1px solid #ECE9F2}
.sk-dot{position:absolute;top:50%;width:15px;height:15px;margin-top:-7.5px;border-radius:50%}
.sk-url{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);height:32px;padding:0 22px;border-radius:10px;background:#EEECF3;color:#6B6577;font-weight:500;font-size:20px;line-height:32px;white-space:nowrap;max-width:62%;overflow:hidden;text-overflow:ellipsis}
.sk-cv{position:absolute;left:0}
.sk-count{left:0;top:0;padding:22px 40px 24px;border-radius:30px;background:#fff;text-align:center;transform-origin:50% 50%;box-shadow:0 0 0 2px ${rgba(B.accent_light,.9)},0 24px 60px -18px rgba(25,12,50,.45)}
.sk-num{display:flex;justify-content:center;font-weight:800;font-size:128px;line-height:1;letter-spacing:-.04em;color:${B.accent};height:128px;overflow:hidden}
.sk-col{display:inline-block;height:128px;overflow:hidden}
.sk-col>div{display:flex;flex-direction:column}
.sk-col span{height:128px;display:block}
.sk-lbl{margin-top:8px;font-weight:600;font-size:30px;color:#6B6577;white-space:nowrap}
.sk-pg{position:absolute;top:50%;right:18px;transform:translateY(-50%);height:30px;padding:0 14px;border-radius:15px;background:${INK_DARK};color:#fff;font-family:'SK Mono',monospace;font-weight:500;font-size:18px;line-height:30px;white-space:nowrap}
.sk-row{height:62px;display:flex;align-items:center;gap:18px}
.sk-rn{width:44px;text-align:right;font-family:'SK Mono',monospace;font-weight:500;font-size:34px;color:#A39DB0}
.sk-rp{flex:1;height:62px;border-radius:16px;background:#fff;display:flex;align-items:center;gap:16px;padding:0 22px;box-shadow:0 0 0 1.5px #E3DFEA,0 10px 26px -14px rgba(30,15,60,.35)}
.sk-rd{width:30px;height:30px;border-radius:9px;background:${B.accent_soft}}
.sk-rt{font-weight:600;font-size:30px;color:${INK_DARK};letter-spacing:-.01em;white-space:nowrap}
.sk-rs{height:62px;border-radius:16px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 20px;box-shadow:0 0 0 1.5px #E3DFEA,0 10px 26px -14px rgba(30,15,60,.35);font-weight:600;font-size:26px;color:#4A4458;white-space:nowrap}
.sk-rs b{font-family:'SK Mono',monospace;font-weight:500;color:${INK_DARK}}
.sk-idx{left:0;width:${W}px;text-align:center;font-family:'SK Mono',monospace;font-weight:500;font-size:30px;letter-spacing:.06em;color:${B.accent_light};white-space:nowrap}
.sk-edge{width:140px;height:3px;border-radius:2px;background:linear-gradient(90deg,${rgba(B.accent_light,0)},#F1E9FF,${rgba(B.accent_light,0)});box-shadow:0 0 14px 3px ${rgba(B.accent_light,.8)}}
.sk-draw{overflow:visible}
.sk-grid{left:-200px;top:-200px;width:${W+400}px;height:${H+400}px;background-image:linear-gradient(${rgba(B.accent_light,.10)} 2px,transparent 2px),linear-gradient(90deg,${rgba(B.accent_light,.10)} 2px,transparent 2px);background-size:84px 84px}
.sk-pull{border-radius:10px;transform-origin:0 0;box-shadow:0 0 0 3px ${rgba(B.accent_light,.6)},0 0 40px 6px ${rgba(B.accent,.45)}}
.sk-ly{border-radius:26px;background:#1A1428;transform-origin:50% 50%;box-shadow:0 0 0 3px ${rgba(B.accent_light,.35)},0 0 40px 2px ${rgba(B.accent,.22)}}
.sk-lyl{position:absolute;left:28px;top:16px;font-family:'SK Mono',monospace;font-weight:500;font-size:30px;color:rgba(245,243,250,.72)}
`;

// keyed interpolation: [{t, v:[...], dur, ease}] → t => v; a new key starts from wherever the last one was
function keyed(keys){
  keys = keys.slice().sort((a,b)=>a.t-b.t);
  const lerp = (a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u);
  const starts = [keys[0].v];
  const at = (t,n)=>{
    let i = 0; for(let j=1;j<n;j++) if(t>=keys[j].t) i=j;
    if(i===0) return keys[0].v;
    const k = keys[i], u = k.dur>0 ? k.ease((t-k.t)/k.dur) : 1;
    return lerp(starts[i], k.v, u);
  };
  for(let i=1;i<keys.length;i++) starts[i] = at(keys[i].t-1e-6, i);
  return t=>at(t, keys.length);
}
const SPRINGY = x=>M.S(x*0.9,9.5,0.82);   // eased spring on a 0..1 clock (slight settle)
const ex = x=>x<=0?0:x>=1?1:1-Math.pow(2,-10*x);    // expo-out: the long brake of the night look

SK.run = (cfg)=>{
  const T = cfg.T, dark = cfg.mode==='dark', card = cfg.mode==='card', night = cfg.theme==='night';
  const tin = cfg.tin ?? 0, tout = cfg.tout ?? null;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id='sk'; document.getElementById('stage').appendChild(root);
  const el = (cls, parent=root, tag='div')=>{const e=document.createElement(tag); e.className=cls; parent.appendChild(e); return e;};
  const vis = (t, a, b, o)=>M.vis(t, a ?? tin, b === undefined ? tout : b, o);

  const haze = dark ? el('a sk-glow') : el('a sk-haze');
  if(card || (night && !dark)) haze.style.display = 'none';
  if(night && (dark || card)) el('a sk-grid');          // the night card is the night background, not the light canvas

  // ---------- titles ----------
  const titles = (cfg.titles || (cfg.title ? [cfg.title] : [])).map((c)=>{
    const y = c.y ?? cfg.title?.y ?? 372;
    const t1 = el('a sk-t1'); t1.textContent = c.l1 || ''; t1.style.top = y+'px';
    if(dark || night) t1.style.color = B.ink;
    const w2 = el('a sk-t2w'); w2.style.top = (y+66)+'px';
    const t2 = el('sk-t2', w2); const tx = el('', t2, 'span'); tx.textContent = c.l2 || '';
    let idx = null;
    if(night){
      Object.assign(t2.style, {background:'transparent', boxShadow:'none', padding:'0 4px 8px', color:B.accent_light});
      if(c.idx){ idx = el('a sk-idx'); idx.style.top = (y-52)+'px'; }
    }
    return {c, t1, w2, t2, tx, idx};
  });

  // ---------- icons ----------
  let icons = null;
  if(cfg.icons){
    const c = cfg.icons, n = c.items.length, size = c.size ?? 56, gap = 20, y = c.y ?? 548;
    const x0 = W/2 - (n*size + (n-1)*gap)/2;
    const act = M.step(c.active?.[0]?.[1] ?? 0, c.active || []);
    const nodes = c.items.map((it,i)=>{
      const d = el('a sk-ic'); d.style.left = (x0+i*(size+gap))+'px'; d.style.top = y+'px';
      d.style.width = d.style.height = size+'px';
      if(it.src){ const im = el('', d, 'img'); im.src = url(it.src); }
      else d.textContent = (it.mono || it.label.replace(/[^A-Za-zА-Яа-яЁё0-9]/g,'').slice(0,2));
      // per-item activity as a spring so the highlight slides, not blinks
      const keys = (c.active||[]).map(([t,k])=>[t, k===i?1:0, M.FAST]);
      return {d, it, on: M.track((c.active?.[0]?.[1] ?? 0)===i?1:0, keys)};
    });
    icons = {c, nodes, act};
  }

  // ---------- window ----------
  const wc = cfg.win || {};
  const bar = wc.bar ?? 52;
  const g0 = {x:wc.x ?? 540, y:wc.y ?? 624, w:wc.w ?? 820, h:wc.h ?? 340};
  const wkeys = [{t:-1, v:[g0.x,g0.y,g0.w,g0.h], dur:0, ease:eo}];
  let prev = [g0.x,g0.y,g0.w,g0.h];
  for(const [t,o] of (wc.keys||[])){ const v=[o.x??prev[0],o.y??prev[1],o.w??prev[2],o.h??prev[3]]; wkeys.push({t, v, dur:o.dur ?? 0.7, ease:SPRINGY}); prev=v; }
  const wgeo = keyed(wkeys);
  const win = el('a sk-win');
  win.style.boxShadow = dark
    ? `0 0 0 3px ${B.accent_light},0 0 46px 6px ${rgba(B.accent,.45)},0 30px 80px -20px rgba(0,0,0,.7)`
    : `0 0 0 3px ${rgba(B.accent_light,.95)},0 0 40px 4px ${rgba(B.accent,.24)},0 26px 60px -22px rgba(30,15,60,.38)`;
  const barEl = el('sk-bar', win); barEl.style.height = bar+'px';
  ['#FF5F57','#FEBC2E','#28C840'].forEach((c,i)=>{const d=el('sk-dot',barEl); d.style.background=c; d.style.left=(22+i*25)+'px';});
  const urlEl = el('sk-url', barEl);
  let drawSvg = null, drawRect = null, edge = null;
  if(night){
    win.style.background = '#1A1428';
    win.style.boxShadow = `0 0 0 3px ${rgba(B.accent_light,.45)},0 0 44px 4px ${rgba(B.accent,.28)},0 30px 80px -20px rgba(0,0,0,.7)`;
    Object.assign(barEl.style, {background:'rgba(255,255,255,.04)', borderBottom:`1px solid ${rgba(B.accent_light,.18)}`});
    Object.assign(urlEl.style, {background:'rgba(255,255,255,.06)', color:'rgba(245,243,250,.68)', fontFamily:"'SK Mono',monospace"});
    if(wc.enter !== 'fly' && wc.enter !== 'grid'){
      drawSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); drawSvg.setAttribute('class', 'a sk-draw'); root.appendChild(drawSvg);
      drawRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for(const [k,v] of Object.entries({x:2, y:2, rx:26, fill:'none', stroke:B.accent_light, 'stroke-width':3, pathLength:1, 'stroke-dasharray':1})) drawRect.setAttribute(k, v);
      drawSvg.appendChild(drawRect);
    }
    edge = el('a sk-edge');
  }
  const pgEl = wc.pager ? el('sk-pg', barEl) : null;
  if(pgEl) pgEl.textContent = wc.pager;
  const cv = el('sk-cv', win, 'canvas'); cv.style.top = bar+'px';
  const ctx = cv.getContext('2d');
  // «сборка из сетки»: the cells inside the window rect light up, then the window fills in (night, enter:'grid')
  let gridIn = null;
  if(night && wc.enter === 'grid'){
    gridIn = OK.gridCells(root, [g0.x-g0.w/2, g0.y, g0.w, g0.h], {t:(wc.tin ?? tin), dur:0.8, id:'sk-cells'});
    root.insertBefore(gridIn.el, win);
  }
  // «слои в глубину»: glass layers behind the window (the deepest first in the DOM), the stack tilts and slowly turns
  const LY = night && wc.layers ? wc.layers : null;
  const ghosts = [];
  if(LY) for(let i=0; i<(LY.n ?? 3)-1; i++){
    const g = el('a sk-ly'); g.id = 'sk-ly-'+i; root.insertBefore(g, ghosts[i-1] || win);
    if(LY.labels?.[i]){ const lb = el('sk-lyl', g); lb.textContent = LY.labels[i]; }
    ghosts.push(g);
  }

  // ---------- media ----------
  const media = cfg.media || {}, BM = {};
  const loads = [];
  const loadImg = (src)=>new Promise((res)=>{const im=new Image(); im.onload=()=>res(im); im.onerror=()=>{console.error('SK: cannot load '+src); res(null);}; im.src=url(src);});
  const loadScript = (src)=>new Promise((res)=>{const s=document.createElement('script'); s.onload=res; s.onerror=()=>{console.error('SK: cannot load '+src); res();}; s.src=url(src); document.head.appendChild(s);});
  for(const [id,m] of Object.entries(media)){
    if(m.src) loads.push(loadImg(m.src).then(im=>{BM[id]={w:im?.naturalWidth||1,h:im?.naturalHeight||1,frame:()=>im};}));
    else if(m.frames) loads.push(loadScript(m.frames.replace(/\/$/,'')+'/manifest.js').then(async()=>{
      const key = m.frames.replace(/\/$/,'').split('/').pop(), man = (window.SKF||{})[key];
      if(!man){ console.error('SK: no manifest for '+m.frames); return; }
      const ims = await Promise.all(Array.from({length:man.n},(_,i)=>loadImg(`${m.frames.replace(/\/$/,'')}/${String(i+1).padStart(5,'0')}.jpg`)));
      BM[id] = {w:man.w, h:man.h, fps:man.fps, n:man.n, frame:(lt)=>ims[clamp(Math.floor((lt + (m.from||0))*man.fps),0,man.n-1)]};
    }));
  }

  // shots and camera: one keyed camera; a shot change jumps (dur 0), cams ease
  const shots = (cfg.shots||[]).slice().sort((a,b)=>a[0]-b[0]);
  const ckeys = [];
  for(const s of shots) ckeys.push({t:s[0], v:s[2], dur:0, ease:eo});
  for(const c of (cfg.cams||[])) ckeys.push({t:c[0], v:c[1], dur:c[2] ?? 0.7, ease:eio});
  if(!ckeys.length) ckeys.push({t:0, v:[0,0,1000], dur:0, ease:eo});
  const cam = keyed(ckeys);
  const shotAt = (t)=>{let i=0; for(let j=0;j<shots.length;j++) if(t>=shots[j][0]) i=j; return i;};
  const TR = {whip:0.34, blur:0.3, cut:0};

  const drawMedia = (i, t, cw, ch, dx, alpha, blurPx, smear)=>{
    const s = shots[i]; if(!s) return;
    const bm = BM[s[1]]; if(!bm) return;
    const im = bm.frame(t - s[0]); if(!im) return;
    const [x,y,w] = cam(Math.max(t, s[0]));  // the incoming shot is drawn at its own first camera
    const h = w*ch/cw;
    ctx.save(); ctx.globalAlpha = alpha;
    if(blurPx>0.3) ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
    const n = smear>2 ? 7 : 1;
    if(n>1) ctx.globalAlpha = alpha/n*1.6;
    for(let k=0;k<n;k++){
      const off = n>1 ? (k/(n-1)-0.5)*smear : 0;
      ctx.drawImage(im, x, y, w, h, dx+off, 0, cw, ch);
    }
    ctx.restore();
  };
  const toScreen = (t, cw, ch)=>{const [x,y,w]=cam(t), k=cw/w; return (px,py)=>[(px-x)*k,(py-y)*k,k];};

  const cpath = cfg.cursor ? M.path(cfg.cursor.keys) : null;
  const cpress = cfg.cursor ? M.presses(cfg.cursor.clicks||[]) : null;
  const CUR = new Path2D('M3 3 L3 41 L12.5 32 L19 47 L25.5 44.2 L19.2 29.8 L32 29.8 Z');

  const rr = (x,y,w,h,r)=>{ctx.beginPath(); ctx.roundRect(x,y,w,h,r);};
  // lens (night look): outside dims, the circle shows the media under it ×zoom, a ring in accent_light
  const lensCv = document.createElement('canvas'), lctx = lensCv.getContext('2d');
  const drawLens = (m, t, map, cw, ch)=>{
    const r = m.r ?? 110, z = m.zoom ?? 1.9, at = m._p || (m._p = M.path(m.keys));
    const p = at(t), [sx, sy] = map(p.x, p.y);
    const o = clamp((t-m.t0)/0.2) * (m.t1!=null ? 1-clamp((t-m.t1)/0.2) : 1);
    if(o<=0.002) return;
    const d = Math.ceil(2*r), src = r/z;
    if(lensCv.width!==d){ lensCv.width = d; lensCv.height = d; }
    lctx.clearRect(0,0,d,d); lctx.drawImage(cv, sx-src, sy-src, 2*src, 2*src, 0, 0, d, d);
    ctx.save(); ctx.globalAlpha = o;
    ctx.beginPath(); ctx.rect(0,0,cw,ch); ctx.arc(sx, sy, r, 0, Math.PI*2, true); ctx.fillStyle = 'rgba(14,11,20,.62)'; ctx.fill('evenodd');
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.clip(); ctx.drawImage(lensCv, sx-r, sy-r); ctx.restore();
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.lineWidth = 3; ctx.strokeStyle = B.accent_light;
    ctx.shadowColor = rgba(B.accent_light,.9); ctx.shadowBlur = 18; ctx.stroke(); ctx.restore();
  };

  const drawCanvas = (t, cw, ch)=>{
    ctx.clearRect(0,0,cw,ch); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,cw,ch);
    if(!shots.length) return;
    const i = shotAt(t);
    // transition window around the boundary of shot i (or i+1 when we are just before it)
    let j = -1, u = 0;
    for(const k of [i, i+1]){
      const s = shots[k]; if(!s || k===0) continue;
      const d = TR[s[3] || 'whip'] ?? 0.34; if(!d) continue;
      if(t >= s[0]-d/2 && t < s[0]+d/2){ j = k; u = eio((t-(s[0]-d/2))/d); }
    }
    if(j<0){ drawMedia(i, t, cw, ch, 0, 1, 0, 0); }
    else{
      const kind = shots[j][3] || 'whip', tOut = Math.min(t, shots[j][0]-1e-3);
      if(kind==='whip'){
        const sm = Math.sin(Math.PI*u)*cw*0.22;
        drawMedia(j-1, tOut, cw, ch, -u*cw, 1, Math.sin(Math.PI*u)*3, sm);
        drawMedia(j, t, cw, ch, (1-u)*cw, 1, Math.sin(Math.PI*u)*3, sm);
      }else{
        const b = Math.sin(Math.PI*u)*16;
        drawMedia(j-1, tOut, cw, ch, 0, 1-u, b, 0);
        drawMedia(j, t, cw, ch, 0, u, b, 0);
      }
      return;  // marks and cursor wait for the transition to land
    }
    const map = toScreen(t, cw, ch);
    for(const m of (cfg.marks||[])){
      if(m.kind==='pull') continue;
      if(t < m.t0 || (m.t1!=null && t > m.t1+0.2)) continue;
      if(m.shot!=null && m.shot!==shots[i][1]) continue;
      if(m.kind==='lens'){ drawLens(m, t, map, cw, ch); continue; }
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
      const out = m.t1!=null ? 1-eo((t-m.t1)/0.2) : 1;
      if(m.kind==='blur'){
        ctx.save(); rr(x, y, w, h, 8); ctx.clip(); ctx.filter = `blur(${m.px ?? 10}px)`;
        ctx.drawImage(cv, 0, 0); ctx.filter = 'none'; ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.restore();
        continue;
      }
      if(m.kind==='hl'){
        const p = eio((t-m.t0)/(m.dur ?? 0.38));
        ctx.save(); ctx.globalCompositeOperation = night ? 'screen' : 'multiply'; ctx.globalAlpha=0.9*out;
        ctx.fillStyle = night ? rgba(B.accent,.6) : dark ? rgba(B.accent_light,.55) : '#D9CBFF';
        rr(x-4, y-3, (w+8)*p, h+6, 6); ctx.fill(); ctx.restore();
      }else if(m.kind==='ring'){
        const a = M.S(t-m.t0, 16, 0.62), sc = 1.18-0.18*a, cx = x+w/2, cy = y+h/2;
        ctx.save(); ctx.globalAlpha = clamp((t-m.t0)/0.12)*out;
        ctx.strokeStyle = dark ? B.accent_light : B.accent; ctx.lineWidth = 4;
        ctx.shadowColor = rgba(B.accent_light, .9); ctx.shadowBlur = 18;
        rr(cx-(w/2+10)*sc, cy-(h/2+8)*sc, (w+20)*sc, (h+16)*sc, 14*sc); ctx.stroke(); ctx.restore();
      }
    }
    for(const p of pulls){
      const m = p.m;
      if(t < m.t || (m.tout!=null && t > m.tout+0.3)) continue;
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
      const pw = Math.max(1, Math.round(w)), ph = Math.max(1, Math.round(h));
      if(p.c.width!==pw || p.c.height!==ph){ p.c.width = pw; p.c.height = ph; p.c.style.width = pw+'px'; p.c.style.height = ph+'px'; }
      p.cx.clearRect(0,0,pw,ph); p.cx.drawImage(cv, x, y, w, h, 0, 0, pw, ph);
      const u = ex((t-m.t)/(m.dur ?? 0.8));
      ctx.save(); ctx.fillStyle = `rgba(14,11,20,${(0.6*u).toFixed(3)})`; rr(x-4, y-4, w+8, h+8, 8); ctx.fill(); ctx.restore();
      p.src = {x, y, w, h, u};
    }
    if(cpath && t >= cfg.cursor.keys[0][0] && t <= (cfg.cursor.until ?? T)){
      const c = cpath(t), [x,y] = map(c.x, c.y), s = 0.95*(1-0.13*cpress(t));
      ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.translate(-3,-3);
      ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
      ctx.fillStyle='#0B0B0B'; ctx.fill(CUR); ctx.shadowColor='transparent';
      ctx.lineWidth=2.6; ctx.lineJoin='round'; ctx.strokeStyle='#fff'; ctx.stroke(CUR); ctx.restore();
    }
  };

  // «вытягивание»: a piece of the window (a name, a line) leaves it and flies to its own place in the frame
  const pulls = (cfg.marks||[]).filter(m=>m.kind==='pull').map((m,i)=>{
    const c = el('a sk-pull', root, 'canvas'); c.id = 'sk-pull-'+i;
    return {m, c, cx:c.getContext('2d'), src:null};
  });

  // ---------- list («top N»: number, blurred name, stars) ----------
  let list = null;
  if(cfg.list){
    const c = cfg.list, w = c.w ?? 820, row = c.row ?? 78, y0 = c.y ?? 600;
    const cols = c.cols ?? 1, gap = c.gap ?? 24, per = Math.ceil(c.items.length/cols), cw = (w - gap*(cols-1))/cols;
    const rows = c.items.map((it,i)=>{
      const col = Math.floor(i/per), k = i % per;
      const r = el('a sk-row'); r.style.left = (W/2-w/2+col*(cw+gap))+'px'; r.style.width = cw+'px'; r.style.top = (y0+k*row)+'px';
      if(c.rh){ r.style.height = c.rh+'px'; }
      const n = el('sk-rn', r); n.textContent = String(i+1);
      const pill = el('sk-rp', r); el('sk-rd', pill); const nm = el('sk-rt', pill, 'span'); nm.textContent = it.name;
      if(c.rh) pill.style.height = c.rh+'px';
      if(c.mono){ nm.style.fontFamily = "'SK Mono',monospace"; nm.style.fontWeight = 500; }
      if(it.stars!=null){ const st = el('sk-rs', r); st.innerHTML = '★ Star <b></b>'; st.querySelector('b').textContent = it.stars; if(c.rh) st.style.height = c.rh+'px'; }
      if(night){
        Object.assign(pill.style, {background:'#1A1428', boxShadow:`0 0 0 2px ${rgba(B.accent_light,.35)},0 10px 26px -14px rgba(0,0,0,.6)`});
        nm.style.color = B.ink; pill.firstChild.style.background = rgba(B.accent_light,.25);
        const st = r.querySelector('.sk-rs');
        if(st){ Object.assign(st.style, {background:'#1A1428', boxShadow:`0 0 0 2px ${rgba(B.accent_light,.35)}`, color:'rgba(245,243,250,.7)'}); st.querySelector('b').style.color = B.ink; }
      }
      // it.lit: the number lights up and stays (a count); c.active: one row at a time
      const keys = it.lit!=null ? [[it.lit, 1, M.FAST]] : (c.active||[]).map(([t,k])=>[t, k===i?1:0, M.FAST]);
      return {r, n, nm, it, on: M.track(0, keys)};
    });
    list = {c, rows};
  }

  // ---------- counter ----------
  let counter = null;
  if(cfg.counter){
    const c = cfg.counter, box = el('a sk-count'), num = el('sk-num', box), lbl = el('sk-lbl', box);
    lbl.textContent = c.label || '';
    const digits = String(c.to).length, cols = [];
    for(let d=0; d<digits; d++){
      const col = el('sk-col', num), strip = el('', col);
      for(let k=0;k<20;k++){ const s=el('', strip, 'span'); s.textContent = k%10; }
      cols.push(strip);
    }
    if(c.suffix){ const s = el('', num, 'span'); s.textContent = c.suffix; }
    if(night){
      Object.assign(box.style, {background:'#1A1428', boxShadow:`0 0 0 3px ${rgba(B.accent_light,.9)},0 0 46px 4px ${rgba(B.accent,.35)}`});
      Object.assign(num.style, {color:B.ink, fontFamily:"'SK Mono',monospace", fontWeight:500}); lbl.style.color = 'rgba(245,243,250,.7)';
    }
    counter = {c, box, cols, digits};
  }

  // night titles: a wipe left → right, the italic line in accent_light without a plate, the chapter index typed
  const nightTitle = (title, t, a, b)=>{
    const o = (t < a ? 0 : 1) * (b==null ? 1 : 1-clamp((t-b)/0.3));
    for(const e of [title.t1, title.w2, title.idx]) if(e){ e.style.display = o>0.002 ? '' : 'none'; e.style.opacity = o.toFixed(3); }
    if(o<=0.002) return;
    title.t1.style.clipPath = `inset(-20% ${(100-100*ex((t-a)/0.7)).toFixed(2)}% -20% 0)`;
    title.t2.style.clipPath = `inset(-20% ${(100-100*ex((t-a-0.12)/0.7)).toFixed(2)}% -20% 0)`;
    if(title.idx){ const s = title.c.idx; M.setText(title.idx, s.slice(0, Math.round(s.length*clamp((t-a)/0.4)))); }
  };
  // the line that draws the window frame on entry, then the light along the top edge on entry and every shot change
  const edgeTimes = night ? [...(wc.enter === 'fly' ? [] : [(wc.tin ?? tin) + (wc.enter === 'grid' ? 0.75 : 0.45)]), ...shots.slice(1).map(s=>s[0])] : [];
  const nightFrame = (t, x, y, w, h, wa, o)=>{
    if(drawSvg){
      Object.assign(drawSvg.style, {left:(x-w/2-2)+'px', top:(y-2)+'px', width:(w+4)+'px', height:(h+4)+'px'});
      drawSvg.setAttribute('width', w+4); drawSvg.setAttribute('height', h+4);
      drawRect.setAttribute('width', w); drawRect.setAttribute('height', h);
      drawRect.style.strokeDashoffset = (1-ex(wa/0.6)).toFixed(4);
      drawSvg.style.opacity = (o*(1-clamp((wa-0.6)/0.3))).toFixed(3);
      drawSvg.style.display = wa < 0 || o<=0.002 ? 'none' : '';
    }
    let u = -1; for(const te of edgeTimes){ const v = (t-te)/0.8; if(v>=0 && v<1) u = v; }
    edge.style.display = u<0 || o<=0.002 ? 'none' : '';
    if(u>=0){
      edge.style.left = (x-w/2-140+(w+140)*eio(u)).toFixed(1)+'px'; edge.style.top = (y-2).toFixed(1)+'px';
      edge.style.opacity = (Math.sin(Math.PI*u)*o).toFixed(3);
    }
  };

  let lastW = 0, lastH = 0;
  const draw = (t)=>{
    const pv = vis(t, tin, tout, {lin:0.32});
    haze.style.opacity = (dark ? 1 : pv.o).toFixed(3);

    for(const title of titles){
      const c = title.c, a = c.tin ?? tin + 0.1, b = c.tout === undefined ? tout : c.tout;
      if(night){ nightTitle(title, t, a, b); continue; }
      M.apply(title.t1, vis(t, a, b));
      const v2 = vis(t, a+0.12, b, {lin:0.3});
      if(M.apply(title.w2, {...v2, blur:0, s:1})){
        const p = M.S(t-a-0.12, 13, 0.9);       // the plate wipes open left → right, then the italic lands
        title.t2.style.clipPath = `inset(0 ${(100-100*clamp(p)).toFixed(2)}% 0 0 round 16px)`;
        const tv = vis(t, a+0.22, b, {lin:0.28}); title.tx.style.opacity = tv.o.toFixed(3);
        title.tx.style.filter = tv.blur>0.05 ? `blur(${tv.blur.toFixed(2)}px)` : 'none';
      }
    }

    if(icons){
      const c = icons.c;
      icons.nodes.forEach((n,i)=>{
        const v = vis(t, (c.tin ?? tin+0.18) + i*0.06, c.tout === undefined ? tout : c.tout);
        const on = clamp(n.on(t));
        if(!M.apply(n.d, {...v, s:v.s*(1+0.1*on)})) return;
        if(n.it.src){ n.d.style.background='#fff'; n.d.firstChild.style.filter=`grayscale(${1-on}) opacity(${0.45+0.55*on})`; n.d.style.boxShadow=`0 0 0 ${1.5+1.5*on}px ${on>0.5?B.accent_light:'#E3DFEA'}`; }
        else{
          const mix = (a,b2)=>{const A=M.hex(a),Bc=M.hex(b2); return `rgb(${A.map((x,k)=>Math.round(x+(Bc[k]-x)*on)).join(',')})`;};
          n.d.style.background = mix(dark?'#2A2236':'#FFFFFF', B.accent);
          n.d.style.color = mix(dark?'#8E86A0':'#A39DB0', '#FFFFFF');
          n.d.style.boxShadow = `0 0 0 1.5px ${on>0.5?'transparent':(dark?'#3A3148':'#E3DFEA')}, 0 8px 20px -8px ${rgba(B.accent, .7*on)}`;
        }
      });
    }

    const [x,y,w,h] = wgeo(t);
    for(const p of pulls) p.src = null;
    if(gridIn) gridIn.draw(t);
    let wv = vis(t, wc.tin ?? tin, wc.tout === undefined ? tout : wc.tout, {lin:0.34});
    if(night){
      const wa = t - (wc.tin ?? tin), wo = wc.tout === undefined ? tout : wc.tout;
      const o = (wa < 0 ? 0 : 1) * (wo==null ? 1 : 1-clamp((t-wo)/0.3));
      if(wc.enter === 'fly'){ const u = ex(wa/0.6); wv = {o:o*clamp(wa/0.25), blur:(1-u)*6, s:0.35+0.65*u}; }
      else if(wc.enter === 'grid'){ const u = clamp((wa-0.42)/0.3); wv = {o:o*u, blur:(1-u)*8, s:0.97+0.03*u}; win.style.clipPath = 'none'; }
      else {
        // the content wipes left → right; the clip leaves 120 px around so the ring, glow and drop shadow stay visible
        // (empty at u=0, shadow room on every side at u=1; same trick as the terminal in object-scene.js)
        wv = {o, blur:0, s:1}; const u = ex((wa-0.15)/0.6);
        win.style.clipPath = `inset(-120px calc(${(100-100*u).toFixed(2)}% + ${(120-240*u).toFixed(1)}px) -120px -120px round 26px)`;
      }
      nightFrame(t, x, y, w, h, wa, o);
    }
    let ext = '';
    if(LY){
      const u = ex((t-LY.t)/(LY.dur ?? 0.9));
      ext = ` perspective(1800px) rotateX(${((LY.tilt ?? 22)*u).toFixed(2)}deg) rotateY(${((LY.orbit ?? 5)*u*Math.sin((t-LY.t)*0.7)).toFixed(2)}deg)`;
      ghosts.forEach((g,i)=>{
        const show = u>0.002 && wv.o>0.002;
        g.style.display = show ? '' : 'none'; if(!show) return;
        Object.assign(g.style, {left:(x-w/2).toFixed(2)+'px', top:y.toFixed(2)+'px', width:w.toFixed(2)+'px', height:h.toFixed(2)+'px'});
        g.style.opacity = (u*wv.o*(1-0.22*i)).toFixed(3);
        g.style.transform = `translateY(${(-(LY.gap ?? 80)*(i+1)*u).toFixed(1)}px) scale(${(1-0.05*(i+1)*u).toFixed(4)})${ext}`;
      });
    }
    if(M.apply(win, wv, ext)){
      win.style.left = (x-w/2).toFixed(2)+'px'; win.style.top = y.toFixed(2)+'px';
      win.style.width = w.toFixed(2)+'px'; win.style.height = h.toFixed(2)+'px';
      const cw = Math.round(w), ch = Math.round(h-bar);
      if(cw!==lastW || ch!==lastH){ cv.width = cw; cv.height = ch; cv.style.width = cw+'px'; cv.style.height = ch+'px'; lastW=cw; lastH=ch; }
      const s = shots[shotAt(t)]; M.setText(urlEl, (s && media[s[1]]?.url) || wc.url || '');
      drawCanvas(t, cw, ch);
    }
    for(const p of pulls){
      const m = p.m, s = p.src;
      p.c.style.display = s && wv.o>0.002 ? '' : 'none';
      if(!s) continue;
      const sc = 1+((m.scale ?? 1.5)-1)*s.u, x0 = x-w/2+s.x, y0 = y+bar+s.y, x1 = m.to[0]-s.w*sc/2, y1 = m.to[1]-s.h*sc/2;
      p.c.style.left = (x0+(x1-x0)*s.u).toFixed(1)+'px'; p.c.style.top = (y0+(y1-y0)*s.u).toFixed(1)+'px';
      p.c.style.transform = `scale(${sc.toFixed(4)})`;
      p.c.style.opacity = (m.tout==null ? 1 : 1-clamp((t-m.tout)/0.3)).toFixed(3);
    }

    if(list){
      const c = list.c, [b0, b1] = c.blur ?? [-1, null];
      list.rows.forEach((x,i)=>{
        const v = vis(t, x.it.t ?? (tin+0.2+i*0.12), c.tout === undefined ? tout : c.tout, {lin:0.3});
        if(!M.apply(x.r, v)) return;
        x.r.style.transform = `translateY(${(14*(1-clamp((t-(x.it.t ?? 0))/0.35))).toFixed(1)}px) scale(${v.s.toFixed(4)})`;
        const on = clamp(x.on(t));
        const mix = (a,b2)=>{const A=M.hex(a),Bc=M.hex(b2); return `rgb(${A.map((q,k)=>Math.round(q+(Bc[k]-q)*on)).join(',')})`;};
        x.n.style.color = mix(night ? '#6E6680' : '#A39DB0', night ? B.accent_light : B.accent);
        x.n.style.transform = `scale(${(1+0.18*on).toFixed(3)})`;
        const hid = t >= b0 && (b1==null || t < b1) ? 1 : clamp(1-(t-b1)/0.3);
        x.nm.style.filter = hid>0.01 ? `blur(${(9*hid).toFixed(2)}px)` : 'none';
      });
    }

    if(counter){
      const c = counter.c, v = M.vis(t, c.t, c.tout ?? null, {lin:0.3});
      const pop = M.S(t-c.t, 15, 0.6);
      if(M.apply(counter.box, {...v, s:0.6+0.4*pop})){
        counter.box.style.left = ((c.x ?? 540) - counter.box.offsetWidth/2).toFixed(1)+'px';
        counter.box.style.top = ((c.y ?? 880) - counter.box.offsetHeight/2).toFixed(1)+'px';
        const p = eo((t-c.t-0.05)/(c.dur ?? 1.0)), val = (c.from ?? 0) + (c.to-(c.from ?? 0))*p;
        counter.cols.forEach((strip,d)=>{
          // odometer: the last digit rolls continuously, a higher one only turns while the
          // digits below it pass from 9 to 0
          const pow = Math.pow(10, counter.digits-1-d);
          const pos = d===counter.digits-1 ? val % 10
            : Math.floor(val/pow) % 10 + clamp((val % pow) - (pow-1));
          const rolling = p < 0.98 && (d===counter.digits-1 || (val % pow) > pow-1);
          strip.style.transform = `translateY(${(-pos*128).toFixed(1)}px)`;
          strip.style.filter = rolling ? 'blur(1.5px)' : 'none';
          // lead:'hide' keeps a leading digit hidden until the value reaches it (no «09 920»)
          strip.parentNode.style.opacity = d===counter.digits-1 || val >= pow ? 1
            : c.lead==='hide' ? 0 : clamp(val/pow*1.5, 0.15, 1).toFixed(3);
        });
      }
    }
  };

  window.READY = Promise.all(loads).then(()=>{ if(window.__skT!=null) draw(window.__skT); });
  M.scene({W, H, T, bg: dark || (card && night) ? B.background : card ? (B.canvas || '#EFEDF4') : null, center:[W/2, H/2], intro:null,
    SH:{none:{w:0, h:0, r:0, bg:'#FFFFFF', cam:1}}, start:'none', SEQ:[],
    extra:(t)=>{ window.__skT = t; draw(t); }});
  document.getElementById('shape').style.display = 'none';
};
})();
