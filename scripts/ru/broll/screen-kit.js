/* Reels Studio screen kit for motion-broll clips (built by scripts/ru/broll/build.py).
   «Окно над головой»: the speaker stays full-frame and low in the shot; above the head sit a
   two-line title (grotesque + Playfair Italic on an accent plate), a row of app icons and a macOS
   browser window that plays our own screenshots / screen recordings with camera moves, text
   highlights, a focus ring, a cursor and a star counter. mode 'dark' is the full-frame insert on
   the brand background; mode 'card' is a full-frame light card on the brand canvas («Плагин номер
   один» + window). A numbered list (name blurred, stars visible) is the «top N» hook. Every style is a pure function of t (engine contract); media are preloaded
   and render.js / beats.js wait for window.READY before the first seek.

   SK.run({
     T, mode:'light'|'dark'|'card', tin:0, tout:null,
     title:{l1, l2, y:372, tin?, tout?},          captions ≈1000–1070, the head starts ≈1095 (SHOOT.md)
     icons:{y:548, size:56, items:[{label, src?}], active:[[t, index]], tin?, tout?},
     win:{x:540, y:624, w:820, h:340, keys:[[t,{x?,y?,w?,h?}]], tin?, tout?, bar:52, pager?:'1/5'},
     media:{id:{src:'file.png'} | {frames:'dir', from:0}, url:'github.com/…'},   paths relative to the fragment
     shots:[[t, id, [x, y, w], trans:'whip'|'blur'|'cut']],   camera = visible media rect (x, y, width)
     cams:[[t, [x, y, w], dur=0.7]],                          camera moves inside the current shot
     marks:[{kind:'hl'|'ring'|'blur', rect:[x,y,w,h], t0, t1, shot?}],   media pixels; blur hides private text
     cursor:{keys:[[t, x, y]], clicks:[t]},                    media pixels
     counter:{t, from:0, to:314, suffix:'k', label:'звёзд на GitHub', x:540, y:880, tout?, lead?:'hide'},
     list:{y:600, w:820, row:78, items:[{name, stars:'108k', t, lit?}], blur:[t0, t1|null], active:[[t, i]], tout?},
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

SK.run = (cfg)=>{
  const T = cfg.T, dark = cfg.mode==='dark', card = cfg.mode==='card';
  const tin = cfg.tin ?? 0, tout = cfg.tout ?? null;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const root = document.createElement('div'); root.id='sk'; document.getElementById('stage').appendChild(root);
  const el = (cls, parent=root, tag='div')=>{const e=document.createElement(tag); e.className=cls; parent.appendChild(e); return e;};
  const vis = (t, a, b, o)=>M.vis(t, a ?? tin, b === undefined ? tout : b, o);

  const haze = dark ? el('a sk-glow') : el('a sk-haze');
  if(card) haze.style.display = 'none';

  // ---------- title ----------
  let title = null;
  if(cfg.title){
    const c = cfg.title, y = c.y ?? 372;
    const t1 = el('a sk-t1'); t1.textContent = c.l1 || ''; t1.style.top = y+'px';
    if(dark) t1.style.color = B.ink;
    const w2 = el('a sk-t2w'); w2.style.top = (y+66)+'px';
    const t2 = el('sk-t2', w2); const tx = el('', t2, 'span'); tx.textContent = c.l2 || '';
    title = {c, t1, w2, t2, tx};
  }

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
  const pgEl = wc.pager ? el('sk-pg', barEl) : null;
  if(pgEl) pgEl.textContent = wc.pager;
  const cv = el('sk-cv', win, 'canvas'); cv.style.top = bar+'px';
  const ctx = cv.getContext('2d');

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
      if(t < m.t0 || (m.t1!=null && t > m.t1+0.2)) continue;
      if(m.shot!=null && m.shot!==shots[i][1]) continue;
      const [x,y,k] = map(m.rect[0], m.rect[1]), w = m.rect[2]*k, h = m.rect[3]*k;
      const out = m.t1!=null ? 1-eo((t-m.t1)/0.2) : 1;
      if(m.kind==='blur'){
        ctx.save(); rr(x, y, w, h, 8); ctx.clip(); ctx.filter = `blur(${m.px ?? 10}px)`;
        ctx.drawImage(cv, 0, 0); ctx.filter = 'none'; ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill(); ctx.restore();
        continue;
      }
      if(m.kind==='hl'){
        const p = eio((t-m.t0)/(m.dur ?? 0.38));
        ctx.save(); ctx.globalCompositeOperation='multiply'; ctx.globalAlpha=0.9*out;
        ctx.fillStyle = dark ? rgba(B.accent_light,.55) : '#D9CBFF';
        rr(x-4, y-3, (w+8)*p, h+6, 6); ctx.fill(); ctx.restore();
      }else if(m.kind==='ring'){
        const a = M.S(t-m.t0, 16, 0.62), sc = 1.18-0.18*a, cx = x+w/2, cy = y+h/2;
        ctx.save(); ctx.globalAlpha = clamp((t-m.t0)/0.12)*out;
        ctx.strokeStyle = dark ? B.accent_light : B.accent; ctx.lineWidth = 4;
        ctx.shadowColor = rgba(B.accent_light, .9); ctx.shadowBlur = 18;
        rr(cx-(w/2+10)*sc, cy-(h/2+8)*sc, (w+20)*sc, (h+16)*sc, 14*sc); ctx.stroke(); ctx.restore();
      }
    }
    if(cpath && t >= cfg.cursor.keys[0][0] && t <= (cfg.cursor.until ?? T)){
      const c = cpath(t), [x,y] = map(c.x, c.y), s = 0.95*(1-0.13*cpress(t));
      ctx.save(); ctx.translate(x,y); ctx.scale(s,s); ctx.translate(-3,-3);
      ctx.shadowColor='rgba(0,0,0,.3)'; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
      ctx.fillStyle='#0B0B0B'; ctx.fill(CUR); ctx.shadowColor='transparent';
      ctx.lineWidth=2.6; ctx.lineJoin='round'; ctx.strokeStyle='#fff'; ctx.stroke(CUR); ctx.restore();
    }
  };

  // ---------- list («top N»: number, blurred name, stars) ----------
  let list = null;
  if(cfg.list){
    const c = cfg.list, w = c.w ?? 820, row = c.row ?? 78, y0 = c.y ?? 600;
    const rows = c.items.map((it,i)=>{
      const r = el('a sk-row'); r.style.left = (W/2-w/2)+'px'; r.style.width = w+'px'; r.style.top = (y0+i*row)+'px';
      const n = el('sk-rn', r); n.textContent = String(i+1);
      const pill = el('sk-rp', r); el('sk-rd', pill); const nm = el('sk-rt', pill, 'span'); nm.textContent = it.name;
      const st = el('sk-rs', r); st.innerHTML = '★ Star <b></b>'; st.querySelector('b').textContent = it.stars;
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
    counter = {c, box, cols, digits};
  }

  let lastW = 0, lastH = 0;
  const draw = (t)=>{
    const pv = vis(t, tin, tout, {lin:0.32});
    haze.style.opacity = (dark ? 1 : pv.o).toFixed(3);

    if(title){
      const c = title.c, a = c.tin ?? tin + 0.1, b = c.tout === undefined ? tout : c.tout;
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
    const wv = vis(t, wc.tin ?? tin, wc.tout === undefined ? tout : wc.tout, {lin:0.34});
    if(M.apply(win, wv)){
      win.style.left = (x-w/2).toFixed(2)+'px'; win.style.top = y.toFixed(2)+'px';
      win.style.width = w.toFixed(2)+'px'; win.style.height = h.toFixed(2)+'px';
      const cw = Math.round(w), ch = Math.round(h-bar);
      if(cw!==lastW || ch!==lastH){ cv.width = cw; cv.height = ch; cv.style.width = cw+'px'; cv.style.height = ch+'px'; lastW=cw; lastH=ch; }
      const s = shots[shotAt(t)]; M.setText(urlEl, (s && media[s[1]]?.url) || wc.url || '');
      drawCanvas(t, cw, ch);
    }

    if(list){
      const c = list.c, [b0, b1] = c.blur ?? [-1, null];
      list.rows.forEach((x,i)=>{
        const v = vis(t, x.it.t ?? (tin+0.2+i*0.12), c.tout === undefined ? tout : c.tout, {lin:0.3});
        if(!M.apply(x.r, v)) return;
        x.r.style.transform = `translateY(${(14*(1-clamp((t-(x.it.t ?? 0))/0.35))).toFixed(1)}px) scale(${v.s.toFixed(4)})`;
        const on = clamp(x.on(t));
        const mix = (a,b2)=>{const A=M.hex(a),Bc=M.hex(b2); return `rgb(${A.map((q,k)=>Math.round(q+(Bc[k]-q)*on)).join(',')})`;};
        x.n.style.color = mix('#A39DB0', B.accent);
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
  M.scene({W, H, T, bg: dark ? B.background : card ? (B.canvas || '#EFEDF4') : null, center:[W/2, H/2], intro:null,
    SH:{none:{w:0, h:0, r:0, bg:'#FFFFFF', cam:1}}, start:'none', SEQ:[],
    extra:(t)=>{ window.__skT = t; draw(t); }});
  document.getElementById('shape').style.display = 'none';
};
})();
