'use strict';
// =====================================================================
//  Juice: synth sound effects, combo streaks, confetti, minimap.
//  No audio files — every sound is generated with WebAudio.
// =====================================================================
const FX = {
  muted: false, ac: null,
  combo: { n: 0, last: 0, best: 0 },
  parts: [],
};
try { FX.muted = localStorage.getItem('groceryPractice.muted') === '1'; } catch (e) { /* ignore */ }

// ---- Sound -----------------------------------------------------------
function sfxInit() {
  if (FX.ac) return;
  try { FX.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { FX.ac = null; }
}
function tone(freq, dur, opts) {
  if (FX.muted || !FX.ac) return;
  opts = opts || {};
  const ac = FX.ac, t0 = ac.currentTime + (opts.delay || 0);
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = opts.type || 'square';
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const v = (opts.vol || 0.06);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const SFX = {
  pick() { tone(520, 0.05, { vol: 0.04 }); },
  drop() { tone(330, 0.06, { vol: 0.04, to: 220 }); },
  stock(n) { const b = 600 + Math.min(n, 10) * 40; tone(b, 0.06, { vol: 0.05 }); tone(b * 1.5, 0.08, { vol: 0.05, delay: 0.06 }); },
  good() { [523, 659, 784].forEach((f, i) => tone(f, 0.12, { vol: 0.05, type: 'triangle', delay: i * 0.07 })); },
  gold() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { vol: 0.06, type: 'triangle', delay: i * 0.08 })); },
  warn() { tone(260, 0.12, { vol: 0.05, type: 'sawtooth', to: 200 }); },
  bad() { tone(180, 0.22, { vol: 0.06, type: 'sawtooth', to: 110 }); },
  info() { tone(880, 0.05, { vol: 0.03, type: 'triangle' }); tone(1175, 0.07, { vol: 0.03, type: 'triangle', delay: 0.05 }); },
  combo(n) { tone(500 + n * 70, 0.07, { vol: 0.05, type: 'square' }); tone(750 + n * 105, 0.09, { vol: 0.04, type: 'triangle', delay: 0.05 }); },
  cash() { tone(1568, 0.04, { vol: 0.012, type: 'triangle' }); tone(2093, 0.06, { vol: 0.012, type: 'triangle', delay: 0.04 }); },
};
function toggleMute() {
  FX.muted = !FX.muted;
  try { localStorage.setItem('groceryPractice.muted', FX.muted ? '1' : '0'); } catch (e) { /* ignore */ }
  const b = document.getElementById('btn-mute'); if (b) b.textContent = FX.muted ? '🔇' : '🔊';
  if (!FX.muted) { sfxInit(); SFX.info(); }
}
window.addEventListener('keydown', sfxInit);
window.addEventListener('pointerdown', sfxInit);

// ---- Combo: chain your own sorts/stocks within 6 seconds ------------------
const COMBO_WINDOW = 6000;
function comboHit(cases, at) {
  if (cases <= 0) return;
  const c = FX.combo, now = performance.now();
  c.n = now - c.last < COMBO_WINDOW ? Math.min(c.n + 1, 10) : 1;
  c.last = now;
  if (c.n > c.best) c.best = c.n;
  if (c.n >= 3) {
    const bonus = c.n - 2;
    G.xp += bonus; if (G.today) G.today.xp += bonus;
    floater(at.x, at.y - 1.3, `COMBO x${c.n}  +${bonus}`, '#42d7ff');
    SFX.combo(c.n);
    if (c.n === 5 || c.n === 10) confetti(at.x, at.y, c.n === 10 ? 60 : 25);
  }
}
function comboLeft() { const c = FX.combo; return c.n ? clamp(1 - (performance.now() - c.last) / COMBO_WINDOW, 0, 1) : 0; }

// ---- Confetti (world space, tiles) ---------------------------------------
const CONF_COLORS = ['#ffd34d', '#42d7ff', '#57f287', '#ff5a4e', '#ffb238', '#c58cff'];
function confetti(x, y, n) {
  for (let i = 0; i < (n || 40); i++) {
    const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 5;
    FX.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, t: 0, life: 1 + Math.random() * 0.8, c: CONF_COLORS[i % CONF_COLORS.length], r: Math.random() * 6 });
  }
}
function drawParticles(dt) {
  FX.parts = FX.parts.filter(p => (p.t += dt) < p.life);
  for (const p of FX.parts) {
    p.vy += 9 * dt; p.vx *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 10;
    ctx.globalAlpha = clamp((p.life - p.t) * 2, 0, 1);
    ctx.fillStyle = p.c;
    const w = 4 * Math.abs(Math.cos(p.r));
    ctx.fillRect(Math.round(p.x * T - w / 2), Math.round(p.y * T - 2), Math.max(1, w), 4);
  }
  ctx.globalAlpha = 1;
}

// ---- Screen-space HUD bits on the canvas ----------------------------------
function drawComboMeter() {
  const left = comboLeft(), n = FX.combo.n;
  if (!left || n < 2) return;
  const x = 16, y = 16, w = 150;
  ctx.fillStyle = 'rgba(10,8,6,0.8)'; ctx.fillRect(x, y, w, 34);
  ctx.strokeStyle = '#42d7ff'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 33);
  label(ctx, `COMBO x${n}`, x + 10, y + 12, { font: PX(12), align: 'left', color: '#bff2ff', glow: '#42d7ff' });
  glowRect(ctx, x + 8, y + 24, (w - 16) * left, 4, '#42d7ff', 8);
}

function drawMinimap() {
  if (CAM.zoom < 1.15) return;
  const s = 0.17, W = MW * T * s, H = MH * T * s, x = 14, y = canvas.height - H - 14;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, W + 6, H + 6);
  ctx.drawImage(BG, x, y, W, H);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffb238'; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, W + 6, H + 6); ctx.lineWidth = 1;
  const dot = (e, c, r) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + e.x * T * s - r / 2), Math.round(y + e.y * T * s - r / 2), r, r); };
  RT.customers.forEach(cu => dot(cu, '#9aa5b5', 2));
  G.floats.forEach(f => dot(f, DEPT[f.dept].color, 3));
  G.crew.forEach(c => { const r = RT.crew[c.id]; if (r && r.inBuilding) dot(r, ROLES[c.role].color, 4); });
  Object.values(RT.vendorNpcs).forEach(n => dot(n, '#57f287', 4));
  for (const dept in MAPD.shelfTiles) if (G.stock[dept].shelf <= 0 && Math.floor(performance.now() / 300) % 2) MAPD.shelfTiles[dept].forEach(t => dot({ x: t.x + 0.5, y: t.y + 0.5 }, '#ff3b30', 3));
  dot(G.player, '#ffd34d', 6);
  ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x + CAM.x * s + 0.5, y + CAM.y * s + 0.5, canvas.width / CAM.zoom * s, canvas.height / CAM.zoom * s);
}

// ---- Hover a worker to see what they're doing -----------------------------
const MOUSE = { x: -1, y: -1, in: false };
canvas.addEventListener('mousemove', e => {
  const b = canvas.getBoundingClientRect();
  MOUSE.x = (e.clientX - b.left) * canvas.width / b.width;
  MOUSE.y = (e.clientY - b.top) * canvas.height / b.height;
  MOUSE.in = true;
});
canvas.addEventListener('mouseleave', () => { MOUSE.in = false; });

// Screen (canvas px) -> world tiles, using the camera from the last frame.
function mouseWorld() { return { x: (MOUSE.x / CAM.zoom + CAM.x) / T, y: (MOUSE.y / CAM.zoom + CAM.y) / T }; }

function hoveredCrew() {
  if (!MOUSE.in || !G) return null;
  const m = mouseWorld();
  let best = null, bd = 0.75;
  for (const c of G.crew) {
    const r = RT.crew[c.id];
    if (!r || !r.inBuilding) continue;
    const d = Math.hypot(r.x - m.x, (r.y - 0.2) - m.y);
    if (d < bd) { bd = d; best = { c, r }; }
  }
  return best;
}

const TIP = '20px VT323, monospace', TIP_S = '18px VT323, monospace';
function drawCrewTooltip() {
  const h = hoveredCrew();
  canvas.style.cursor = h ? 'pointer' : '';
  if (!h) return;
  const { c, r } = h, role = ROLES[c.role];
  const sx = (r.x * T - CAM.x) * CAM.zoom, sy = (r.y * T - CAM.y) * CAM.zoom;
  ctx.save(); ctx.shadowColor = role.color; ctx.shadowBlur = 12; ctx.strokeStyle = role.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(sx, sy + 12 * CAM.zoom, 14 * CAM.zoom, 6 * CAM.zoom, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();

  const doing = r.intent || r.label || 'Looking for work';
  const lines = [
    { t: c.name.toUpperCase(), f: PX(12), col: '#fff3d6' },
    { t: role.name.toUpperCase(), f: PX(8), col: role.color },
    { t: '▶ ' + doing, f: TIP, col: '#57f287' },
  ];
  if (r.label && r.intent && r.label !== r.intent) lines.push({ t: '   ' + r.label + (r.progress > 0 ? ` (${Math.round(r.progress * 100)}%)` : ''), f: TIP_S, col: '#bff2ff' });
  if (r.carry.length) {
    const counts = {};
    r.carry.forEach(k => { counts[k.d] = (counts[k.d] || 0) + 1; });
    lines.push({ t: 'Carrying: ' + Object.entries(counts).map(([d, n]) => `${n} ${DEPT[d].name}`).join(', '), f: TIP_S, col: '#ffe6b8' });
  }
  if (r.pallet) lines.push({ t: `Pallet jack: ${r.pallet.cases.length} cases`, f: TIP_S, col: '#ffe6b8' });
  if (r.floatId) { const f = G.floats.find(f => f.id === r.floatId); if (f) lines.push({ t: `Pushing ${DEPT[f.dept].name} float · ${f.cases.length} cs`, f: TIP_S, col: '#ffe6b8' }); }
  const sh = SHIFTS[c.shift];
  lines.push({ t: `${sh ? sh.name : c.shift} · Skill ${'★'.repeat(c.skill)}${'☆'.repeat(5 - c.skill)} · $${(+c.wage || 0).toFixed(2)}/hr`, f: TIP_S, col: '#b08a52' });

  let w = 0;
  lines.forEach(l => { ctx.font = l.f; w = Math.max(w, ctx.measureText(l.t).width); });
  w += 24; const lh = 20, hgt = lines.length * lh + 14;
  let x = sx + 22, y = sy - hgt / 2;
  if (x + w > canvas.width - 8) x = sx - 22 - w;
  y = clamp(y, 8, canvas.height - hgt - 8);
  ctx.fillStyle = 'rgba(12,9,6,0.94)'; ctx.fillRect(x, y, w, hgt);
  ctx.fillStyle = role.color; ctx.fillRect(x, y, 3, hgt);
  ctx.strokeStyle = '#c98a2a'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
  lines.forEach((l, i) => label(ctx, l.t, x + 12, y + 17 + i * lh, { font: l.f, align: 'left', color: l.col }));
}
