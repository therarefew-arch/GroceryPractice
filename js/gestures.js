'use strict';
// =====================================================================
//  Touch gestures on the store (phone controls only):
//  - Drag one finger to look around; pinch to zoom. Moving brings the camera back to you.
//  - Tap the floor to walk there (tap a shelf, pallet or float to walk up to it and face it).
//  - Press and hold (0.2 s) on yourself, then drag: you walk there and do the main action.
//  - Press and hold on an associate, then drag them onto an aisle (pick what they do
//    there) or onto receiving (work the truck). Valid spots light up; a bad drop
//    slides back.
//  Plus the button settings: size, left-handed, and moving the buttons (Options).
// =====================================================================
const GEST = { ptrs: new Map(), mode: '', timer: 0, sx: 0, sy: 0, px0: 0, py0: 0, d0: 0, z0: 1, noClickUntil: 0 };
let DRAG = null; // { kind: 'crew'|'me', c, from:{x,y}, sx, sy (screen), tgt, ret }
const DRAG_HOLD_MS = 200;

// ---- coordinates ----
function canvasPt(cx, cy) { const b = canvas.getBoundingClientRect(); return { x: (cx - b.left) * canvas.width / b.width, y: (cy - b.top) * canvas.height / b.height, b }; }
function worldAt(cx, cy) { const c = canvasPt(cx, cy); return { x: (c.x / CAM.zoom + CAM.x) / T, y: (c.y / CAM.zoom + CAM.y) / T }; }
function crewAtWorld(w) {
  let best = null, bd = 0.85;
  for (const c of G.crew) { const r = RT.crew[c.id]; if (!r || !r.inBuilding) continue; const d = Math.hypot(r.x - w.x, (r.y - 0.2) - w.y); if (d < bd) { bd = d; best = c; } }
  return best;
}
const gestOk = () => G && !RT.modal && !UI.open && (G.phase === 'day' || G.phase === 'night') && !document.body.classList.contains('ctrl-move');

// ---- tap to walk ----
function walkTo(w, act) {
  const p = G.player; if (p.away) return false;
  const tx = Math.floor(w.x), ty = Math.floor(w.y);
  const open = walkable(tx, ty);
  const goals = open ? [{ x: tx, y: ty }] : tilesAround({ x: tx + 0.5, y: ty + 0.5 }, 1);
  if (!goals.length) return false;
  const path = pathToTiles(p, goals);
  if (!path) return false;
  RT.walk = { path, face: open ? null : { x: tx + 0.5, y: ty + 0.5 }, dest: { x: tx + 0.5, y: ty + 0.5 }, act, best: null, stuck: 0 };
  if (!path.length) walkArrive(p);
  return true;
}
// called from updatePlayer when no stick or key is pushed
function walkDir(p, dt) {
  const w = RT.walk;
  while (w.path.length && Math.hypot(w.path[0].x + 0.5 - p.x, w.path[0].y + 0.5 - p.y) < 0.18) { w.path.shift(); w.best = null; w.stuck = 0; }
  if (!w.path.length) { walkArrive(p); return null; }
  const n = w.path[0], d = Math.hypot(n.x + 0.5 - p.x, n.y + 0.5 - p.y);
  if (w.best == null || d < w.best - 0.04) { w.best = d; w.stuck = 0; } else if ((w.stuck += dt) > 1.2) { RT.walk = null; return null; }
  return { x: n.x + 0.5 - p.x, y: n.y + 0.5 - p.y };
}
function walkArrive(p) {
  const w = RT.walk; RT.walk = null; if (!w) return;
  if (w.face) { const dx = w.face.x - p.x, dy = w.face.y - p.y, l = Math.hypot(dx, dy) || 1; p.fx = dx / l; p.fy = dy / l; }
  if (w.act) setTimeout(() => { if (typeof doMainAction === 'function') doMainAction(); }, 30);
}

// ---- drop targets for an associate ----
function deptAtWorld(w) {
  const tx = Math.floor(w.x), ty = Math.floor(w.y);
  for (const d in MAPD.shelfTiles) {
    if (MAPD.shelfTiles[d].some(t => t.x === tx && t.y === ty)) return d;
    if ((MAPD.access[d] || []).some(t => t.x === tx && t.y === ty)) return d;
  }
  return null;
}
function crewDropAt(w) {
  const d = deptAtWorld(w); if (d) return { kind: 'dept', dept: d };
  const tx = Math.floor(w.x), ty = Math.floor(w.y), ch = MAPD.grid[ty] && MAPD.grid[ty][tx];
  if (ch === 'r' || (MAPD.recvSpots || []).some(t => t.x === tx && t.y === ty)) return { kind: 'truck' };
  return null;
}
function crewDrop(c, t) {
  const first = c.name.split(' ')[0];
  if (t.kind === 'truck') { UI.order(c.id, G.phase === 'night' ? 'unload' : 'truck'); toast(`📌 ${first}: ${G.phase === 'night' ? 'unload the trailer' : 'work the truck'}.`, 'info'); return; }
  const D = DEPT[t.dept];
  const b = (k, extra) => `<button onclick="UI.order(${c.id},'${k}','${t.dept}'); toast('📌 ${esc(first)}: ${esc(ORDERS[k].name.toLowerCase())}, ${esc(D.aisle)}.', 'info')"><span class="am-i">${{ freight: '🚚', fill: '🕳', bird: '🐦', face: '🧹', count: '🔢' }[k]}</span>${esc(ORDERS[k].name)}${extra ? ` <span class="mute">${extra}</span>` : ''}</button>`;
  UI.showModal(`<h2>📌 ${esc(first)} → ${esc(D.aisle)}</h2><p class="mute">${esc(D.name)} · shelf ${Math.round(clamp(shelfPct(t.dept), 0, 1) * 100)}% full · ${Math.round(faceOf(t.dept))}% faced</p>
    <div class="actmenu">${b('freight')}${b('fill')}${b('bird')}${b('face')}${b('count')}</div>
    <div class="row" style="justify-content:space-between;margin-top:10px"><button onclick="UI.hideModal(); showOrders(G.crew.find(x => x.id === ${c.id}))">All orders…</button><button onclick="UI.hideModal()">Cancel</button></div>`);
}

// ---- pointer handling on the store ----
function gestDown(e) {
  if (!e.isTrusted || !TOUCH || !gestOk()) return;
  GEST.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (GEST.ptrs.size === 2) { // pinch
    clearTimeout(GEST.timer);
    if (DRAG) dragCancel();
    const [a, b] = [...GEST.ptrs.values()];
    GEST.mode = 'pinch'; GEST.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; GEST.z0 = CAM.target;
    return;
  }
  if (GEST.ptrs.size > 2) return;
  GEST.mode = 'pending'; GEST.sx = e.clientX; GEST.sy = e.clientY; GEST.px0 = CAM.px || 0; GEST.py0 = CAM.py || 0;
  const w = worldAt(e.clientX, e.clientY), p = G.player;
  const c = crewAtWorld(w), me = !p.away && Math.hypot(p.x - w.x, p.y - 0.2 - w.y) < 0.9;
  clearTimeout(GEST.timer);
  if ((c && !p.away && onShift(c)) || me) {
    GEST.timer = setTimeout(() => {
      if (GEST.mode !== 'pending') return;
      GEST.mode = 'drag';
      const r = c && !me ? RT.crew[c.id] : null;
      DRAG = { kind: me ? 'me' : 'crew', c: me ? null : c, from: me ? { x: p.x, y: p.y } : { x: r.x, y: r.y }, sx: GEST.sx, sy: GEST.sy, tgt: null, edge: null };
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* ignore */ }
      dragUpdate();
    }, DRAG_HOLD_MS);
  }
}
function gestMove(e) {
  if (!GEST.ptrs.has(e.pointerId)) return;
  GEST.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (GEST.mode === 'pinch' && GEST.ptrs.size >= 2) {
    const [a, b] = [...GEST.ptrs.values()];
    const z = clamp(GEST.z0 * Math.hypot(a.x - b.x, a.y - b.y) / GEST.d0, CAM.min, CAM.max);
    setZoom(z); CAM.zoom = CAM.target;
    return;
  }
  const moved = Math.hypot(e.clientX - GEST.sx, e.clientY - GEST.sy);
  if (GEST.mode === 'pending' && moved > 10) { clearTimeout(GEST.timer); GEST.mode = 'pan'; }
  if (GEST.mode === 'pan') {
    const b = canvas.getBoundingClientRect(), k = canvas.width / b.width / CAM.zoom;
    CAM.px = GEST.px0 - (e.clientX - GEST.sx) * k; CAM.py = GEST.py0 - (e.clientY - GEST.sy) * k;
  } else if (GEST.mode === 'drag' && DRAG) { DRAG.sx = e.clientX; DRAG.sy = e.clientY; dragUpdate(); }
}
function gestUp(e) {
  if (!GEST.ptrs.has(e.pointerId)) return;
  GEST.ptrs.delete(e.pointerId);
  clearTimeout(GEST.timer);
  if (GEST.mode === 'drag' && DRAG) { dragDrop(e.type === 'pointercancel'); GEST.noClickUntil = performance.now() + 400; }
  else if (GEST.mode === 'pan' || GEST.mode === 'pinch') GEST.noClickUntil = performance.now() + 400;
  if (!GEST.ptrs.size) GEST.mode = '';
  else if (GEST.mode === 'pinch') GEST.mode = 'done'; // one finger still down after a pinch: ignore it
}
function dragUpdate() {
  if (!DRAG) return;
  const b = canvas.getBoundingClientRect(), m = 44;
  DRAG.edge = { x: DRAG.sx < b.left + m ? -1 : DRAG.sx > b.right - m ? 1 : 0, y: DRAG.sy < b.top + m ? -1 : DRAG.sy > b.bottom - m ? 1 : 0 };
  const w = worldAt(DRAG.sx, DRAG.sy);
  const key = Math.floor(w.x) + ',' + Math.floor(w.y);
  if (key === DRAG.key) return;
  DRAG.key = key;
  if (DRAG.kind === 'crew') DRAG.tgt = crewDropAt(w);
  else {
    const tx = Math.floor(w.x), ty = Math.floor(w.y);
    const goals = walkable(tx, ty) ? [{ x: tx, y: ty }] : tilesAround({ x: tx + 0.5, y: ty + 0.5 }, 1);
    DRAG.tgt = goals.length && pathToTiles(G.player, goals) ? { kind: 'spot', x: tx, y: ty } : null;
  }
}
function dragDrop(cancel) {
  const d = DRAG; if (!d) return;
  if (!cancel && d.tgt && gestOk()) {
    DRAG = null;
    if (d.kind === 'me') walkTo(worldAt(d.sx, d.sy), true);
    else crewDrop(d.c, d.tgt);
    return;
  }
  dragCancel();
}
function dragCancel() { if (DRAG) { DRAG.ret = { t0: performance.now(), at: worldAt(DRAG.sx, DRAG.sy) }; DRAG.tgt = null; } GEST.mode = ''; }

// a plain tap on the store: walk there (tapping an associate still opens their orders: js/orders.js)
canvas.addEventListener('click', e => {
  if (!TOUCH || !gestOk() || performance.now() < GEST.noClickUntil || isPaused()) return;
  const w = worldAt(e.clientX, e.clientY);
  if (crewAtWorld(w)) return;
  if (G.player.away) return;
  if (!walkTo(w, false)) RT.walkMiss = { x: w.x, y: w.y, t: performance.now() };
});
canvas.addEventListener('pointerdown', gestDown);
canvas.addEventListener('pointermove', gestMove);
canvas.addEventListener('pointerup', gestUp);
canvas.addEventListener('pointercancel', gestUp);

// ---- drawing (world space, called from render) ----
function drawGestures() {
  const now = performance.now();
  // the spot you're walking to
  if (RT.walk && RT.walk.dest) {
    const d = RT.walk.dest, a = 0.5 + 0.3 * Math.sin(now / 120);
    ctx.save(); ctx.strokeStyle = `rgba(255,211,77,${a})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(d.x * T, d.y * T, 12, 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  if (RT.walkMiss && now - RT.walkMiss.t < 500) {
    const m = RT.walkMiss; ctx.save(); ctx.strokeStyle = '#ff5a4e'; ctx.lineWidth = 3; ctx.globalAlpha = 1 - (now - m.t) / 500;
    ctx.beginPath(); ctx.moveTo(m.x * T - 7, m.y * T - 7); ctx.lineTo(m.x * T + 7, m.y * T + 7); ctx.moveTo(m.x * T + 7, m.y * T - 7); ctx.lineTo(m.x * T - 7, m.y * T + 7); ctx.stroke(); ctx.restore();
  }
  if (!DRAG) return;
  // auto-scroll when the finger is near the edge
  if (DRAG.edge && !DRAG.ret && (DRAG.edge.x || DRAG.edge.y)) { CAM.px = (CAM.px || 0) + DRAG.edge.x * 9 / CAM.zoom; CAM.py = (CAM.py || 0) + DRAG.edge.y * 9 / CAM.zoom; DRAG.key = null; dragUpdate(); }
  ctx.save();
  // light up every valid spot, the one under the finger brighter
  if (DRAG.kind === 'crew' && !DRAG.ret) {
    for (const d in MAPD.shelfTiles) {
      const hot = DRAG.tgt && DRAG.tgt.kind === 'dept' && DRAG.tgt.dept === d;
      ctx.fillStyle = hot ? 'rgba(87,242,135,0.45)' : 'rgba(66,215,255,0.16)';
      MAPD.shelfTiles[d].concat(MAPD.access[d] || []).forEach(t => ctx.fillRect(t.x * T, t.y * T, T, T));
      if (hot) { const t = MAPD.shelfTiles[d][0]; label(ctx, DEPT[d].aisle.toUpperCase(), t.x * T + T / 2, t.y * T - 6, { font: PX(10), color: '#57f287', outline: 'rgba(0,0,0,0.9)' }); }
    }
    const hotR = DRAG.tgt && DRAG.tgt.kind === 'truck';
    ctx.fillStyle = hotR ? 'rgba(87,242,135,0.4)' : 'rgba(66,215,255,0.12)';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (MAPD.grid[y][x] === 'r') ctx.fillRect(x * T, y * T, T, T);
  } else if (DRAG.kind === 'me' && DRAG.tgt && !DRAG.ret) {
    ctx.fillStyle = 'rgba(87,242,135,0.35)'; ctx.fillRect(DRAG.tgt.x * T, DRAG.tgt.y * T, T, T);
  }
  // the dragged one follows the finger, a little bigger, just above it so the finger doesn't hide it
  let at;
  if (DRAG.ret) {
    const k = Math.min(1, (now - DRAG.ret.t0) / 200), e = 1 - Math.pow(1 - k, 3);
    at = { x: DRAG.ret.at.x + (DRAG.from.x - DRAG.ret.at.x) * e, y: DRAG.ret.at.y - 1.3 * (1 - e) + (DRAG.from.y - DRAG.ret.at.y) * e };
    if (k >= 1) DRAG = null;
  } else { const w = worldAt(DRAG.sx, DRAG.sy); at = { x: w.x, y: w.y - 1.3 }; }
  if (DRAG) {
    const col = DRAG.kind === 'me' ? PAL.gold || '#ffd34d' : ROLES[DRAG.c.role].color;
    ctx.setLineDash([5, 4]); ctx.strokeStyle = DRAG.tgt ? '#57f287' : col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(DRAG.from.x * T, DRAG.from.y * T); ctx.lineTo(at.x * T, at.y * T); ctx.stroke(); ctx.setLineDash([]);
    ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(at.x * T, at.y * T, 15, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = DRAG.tgt ? '#57f287' : '#fff'; ctx.lineWidth = 2; ctx.stroke();
    const ini = DRAG.kind === 'me' ? 'YOU' : DRAG.c.name.split(' ').map(s => s[0]).join('').slice(0, 2);
    label(ctx, ini, at.x * T, at.y * T + 3, { font: PX(DRAG.kind === 'me' ? 7 : 9), color: '#10100c' });
  }
  ctx.restore();
}

// =====================================================================
//  Button settings: size, left-handed, and moving the buttons.
// =====================================================================
const CTRL = { scale: 1, lefty: false, pos: null };
try { Object.assign(CTRL, JSON.parse(localStorage.getItem('groceryPractice.ctrl') || '{}')); } catch (e) { /* ignore */ }
function ctrlSave() { try { localStorage.setItem('groceryPractice.ctrl', JSON.stringify({ scale: CTRL.scale, lefty: CTRL.lefty, pos: CTRL.pos })); } catch (e) { /* ignore */ } }
function applyCtrl() {
  const s = document.documentElement.style;
  s.setProperty('--tscale', CTRL.scale);
  s.setProperty('--tbx', ((CTRL.pos && CTRL.pos.x) || 0) + 'px');
  s.setProperty('--tby', ((CTRL.pos && CTRL.pos.y) || 0) + 'px');
  document.body.classList.toggle('lefty', !!CTRL.lefty);
  if (typeof phoneLayout === 'function') phoneLayout(); else if (typeof layoutJoyZone === 'function') layoutJoyZone();
}
function ctrlSet(k, v) { CTRL[k] = v; if (k === 'lefty' || k === 'scale') CTRL.pos = null; ctrlSave(); applyCtrl(); }
function ctrlPrefsHTML(refresh) {
  const sz = (v, lab) => `<button class="${CTRL.scale === v ? 'on' : ''}" onclick="ctrlSet('scale', ${v}); ${refresh}">${lab}</button>`;
  return `<div class="opt"><div class="opt-l">Button size</div><div class="seg">${sz(1, 'Normal')}${sz(1.2, 'Large')}${sz(1.4, 'X-Large')}</div></div>
    <div class="opt"><div class="opt-l">Left-handed<div class="mute">Buttons on the left, joystick on the right</div></div><div class="opt-c"><button class="${CTRL.lefty ? 'on' : ''}" onclick="ctrlSet('lefty', !CTRL.lefty); ${refresh}">${CTRL.lefty ? 'On' : 'Off'}</button></div></div>
    <div class="opt"><div class="opt-l">Button position<div class="mute">Drag them where your thumb rests</div></div><div class="opt-c"><button onclick="ctrlMove()">✋ Move buttons</button>${CTRL.pos ? `<button onclick="ctrlSet('pos', null); ${refresh}">Reset</button>` : ''}</div></div>`;
}
// Move mode: the game pauses, drag the button cluster, tap Done.
function ctrlMove() {
  if (!TOUCH || !$('tbtns')) return;
  UI.hideModal(); if (typeof sheetClose === 'function') sheetClose();
  CTRL.wasPaused = RT.paused; RT.paused = true;
  document.body.classList.add('ctrl-move');
  let bar = $('ctrlbar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'ctrlbar'; document.body.appendChild(bar); }
  bar.innerHTML = '<span>✋ Drag the buttons where your thumb rests</span><button onclick="ctrlSet(\'pos\', null)">Reset</button><button class="primary" onclick="ctrlMoveDone()">Done</button>';
  bar.classList.remove('hidden');
}
function ctrlMoveDone() {
  document.body.classList.remove('ctrl-move');
  const bar = $('ctrlbar'); if (bar) bar.classList.add('hidden');
  RT.paused = !!CTRL.wasPaused; ctrlSave();
}
(function setupCtrlMove() {
  const tb = $('tbtns'); if (!tb) return;
  let st = null;
  tb.addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('ctrl-move')) return;
    e.stopPropagation(); e.preventDefault();
    st = { x: e.clientX, y: e.clientY, p: Object.assign({ x: 0, y: 0 }, CTRL.pos), id: e.pointerId };
    try { tb.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }, true);
  tb.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    CTRL.pos = { x: st.p.x + e.clientX - st.x, y: st.p.y + e.clientY - st.y };
    applyCtrl();
    // keep it on the screen
    const r = tb.getBoundingClientRect();
    if (r.left < 0) CTRL.pos.x -= r.left; if (r.right > innerWidth) CTRL.pos.x -= r.right - innerWidth;
    if (r.top < 0) CTRL.pos.y -= r.top; if (r.bottom > innerHeight) CTRL.pos.y -= r.bottom - innerHeight;
    applyCtrl();
  }, true);
  const end = e => { if (st && e.pointerId === st.id) { st = null; ctrlSave(); } };
  tb.addEventListener('pointerup', end, true); tb.addEventListener('pointercancel', end, true);
})();
applyCtrl();
