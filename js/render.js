'use strict';
// =====================================================================
//  Rendering (canvas). Static map is pre-drawn once into BG.
// =====================================================================
const T = TILE;

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function label(g, text, x, y, opts) {
  opts = opts || {};
  g.font = opts.font || 'bold 10px system-ui, sans-serif';
  g.textAlign = opts.align || 'center';
  g.textBaseline = 'middle';
  if (opts.outline) { g.lineWidth = 3; g.strokeStyle = opts.outline; g.strokeText(text, x, y); g.lineWidth = 1; }
  g.fillStyle = opts.color || '#fff';
  g.fillText(text, x, y);
  g.textBaseline = 'alphabetic';
}
const noise = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000;

function drawBG() {
  const b = document.createElement('canvas');
  b.width = MW * T; b.height = MH * T;
  const g = b.getContext('2d');
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const ch = MAPD.grid[y][x], px = x * T, py = y * T;
    let floor;
    if (ch === '~') floor = '#2b2e34';
    else if (y < 10) floor = (ch === 'o' || ch === 'C') ? ((x + y) % 2 ? '#b39a76' : '#ab926e') : '#8e949c';
    else floor = (x + y) % 2 ? '#ece7dc' : '#e2dccf';
    g.fillStyle = floor; g.fillRect(px, py, T, T);
    if (ch === '~') { g.fillStyle = 'rgba(255,255,255,0.03)'; for (let i = 0; i < 4; i++) g.fillRect(px + noise(x, y + i) * T, py + noise(y, x + i) * T, 2, 2); }
    if (y < 10 && y > 2 && ch !== '#' && ch !== 'o' && ch !== 'C') { g.strokeStyle = 'rgba(0,0,0,0.06)'; g.strokeRect(px + 0.5, py + 0.5, T, T); }
    if (ch === '#') { g.fillStyle = '#434a58'; g.fillRect(px, py, T, T); g.fillStyle = '#525a6a'; g.fillRect(px, py, T, 4); }
    if (ch === 'D') {
      g.fillStyle = '#2a2a2a'; g.fillRect(px, py, T, T);
      g.fillStyle = '#f2c94c';
      g.save(); g.beginPath(); g.rect(px, py, T, T); g.clip();
      for (let i = -T; i < T * 2; i += 10) { g.beginPath(); g.moveTo(px + i, py + T); g.lineTo(px + i + 5, py + T); g.lineTo(px + i + 5 + T, py); g.lineTo(px + i + T, py); g.closePath(); g.fill(); }
      g.restore();
    }
    if (ch === 'v') { g.fillStyle = '#3d7a4f'; g.fillRect(px + 2, py, T - 4, T); label(g, 'DSD', px + T / 2, py + T / 2, { font: 'bold 9px system-ui' }); }
    if (ch === 'X') { g.fillStyle = '#9fd8f7'; g.fillRect(px, py + 8, T, T - 16); g.strokeStyle = '#5aa9d6'; g.strokeRect(px + 0.5, py + 8.5, T - 1, T - 17); }
    if (ch === '=') { g.fillStyle = '#8b6b4a'; g.fillRect(px + 1, py + 6, T - 2, T - 12); g.fillStyle = '#5c4630'; g.fillRect(px + T / 2 - 1, py + 6, 2, T - 12); }
    if (ch === 'R') {
      g.fillStyle = '#3a3f4b'; rrect(g, px + 2, py + 4, T - 4, T - 8, 4); g.fill();
      g.fillStyle = '#7ee0a1'; g.fillRect(px + 8, py + 8, 10, 6);
      g.fillStyle = '#222'; g.fillRect(px + 4, py + 18, T - 8, 6);
    }
    if (ch === 'C') {
      g.fillStyle = '#6b4f33'; g.fillRect(px, py + 4, T, T - 8);
      if (x === 36) { g.fillStyle = '#111'; g.fillRect(px + 14, py + 6, 30, 16); g.fillStyle = '#3fa9f5'; g.fillRect(px + 16, py + 8, 26, 12); g.fillStyle = '#222'; g.fillRect(px + 26, py + 22, 6, 4); }
    }
  }
  // Zone markings
  g.strokeStyle = '#f2c94c'; g.setLineDash([6, 4]); g.lineWidth = 2;
  g.strokeRect(1 * T + 2, 4 * T + 2, 8 * T - 4, 5 * T - 4);
  g.setLineDash([]); g.lineWidth = 1;
  label(g, 'RECEIVING', 5 * T, 9.5 * T, { color: '#f2c94c', font: 'bold 11px system-ui' });
  MAPD.floatSpots.forEach(s => {
    g.strokeStyle = '#4aa3df'; g.lineWidth = 2; g.strokeRect(s.x * T + 2, s.y * T + 2, T - 4, T - 4); g.lineWidth = 1;
    label(g, DEPT[s.dept].id, s.x * T + T / 2, (s.y + 1) * T + 9, { color: '#cfe8ff', font: 'bold 9px system-ui' });
  });
  label(g, 'FLOAT STAGING', 17.5 * T, 4.3 * T, { color: '#cfe8ff', font: 'bold 11px system-ui' });
  label(g, 'DOCK DOORS', 4 * T, 3.5 * T, { color: '#3a3f4b', font: 'bold 10px system-ui' });
  label(g, 'BACKSTOCK', 30.5 * T, 2.5 * T, { color: '#ddd', font: 'bold 10px system-ui' });
  label(g, 'OFFICE', 36.5 * T, 2.5 * T, { color: '#ddd', font: 'bold 10px system-ui' });
  label(g, 'TRUCK YARD', 20 * T, 1 * T, { color: '#666', font: 'bold 14px system-ui' });
  label(g, 'PARKING LOT', 20 * T, 25.5 * T, { color: '#666', font: 'bold 12px system-ui' });
  label(g, 'ENTRANCE', 20 * T, 23.5 * T, { color: '#8a8478', font: 'bold 10px system-ui' });
  // Aisle signs
  for (const [gx, ch] of GONDOLAS) {
    const d = DEPT[SHELF_DEPT[ch]];
    const cx = gx * T + T / 2, cy = 11.5 * T;
    g.fillStyle = d.color; rrect(g, cx - 44, cy - 13, 88, 26, 5); g.fill();
    label(g, d.aisle.toUpperCase(), cx, cy - 5, { font: 'bold 9px system-ui' });
    label(g, d.name, cx, cy + 6, { font: '9px system-ui' });
  }
  const dai = DEPT.DAI;
  g.fillStyle = dai.color; rrect(g, 37 * T - 6, 10.6 * T, T + 12, 13, 4); g.fill();
  label(g, 'DAIRY', 37.5 * T + 3, 11.0 * T, { font: 'bold 9px system-ui' });
  return b;
}

function drawShelves() {
  for (const dept in MAPD.shelfTiles) {
    const d = DEPT[dept], pct = shelfPct(dept), out = G.stock[dept].shelf <= 0;
    const base = dept === 'DAI' ? '#b9dff0' : dept === 'FRZ' ? '#d3f1f4' : '#6b5844';
    for (const t of MAPD.shelfTiles[dept]) {
      const px = t.x * T, py = t.y * T;
      ctx.fillStyle = base; ctx.fillRect(px + 2, py + 1, T - 4, T - 2);
      const local = clamp(pct * 1.25 - noise(t.x, t.y) * 0.35, 0, 1);
      const filled = Math.round(local * 9);
      for (let i = 0; i < 9; i++) {
        const cx = i % 3, cy = (i / 3) | 0;
        ctx.fillStyle = (8 - i) < filled ? d.color : 'rgba(0,0,0,0.25)';
        ctx.fillRect(px + 5 + cx * 8, py + 4 + cy * 9, 6, 7);
      }
      if (out) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 1, T - 4, T - 2); ctx.lineWidth = 1; }
    }
  }
}

function drawRacks() {
  for (const d of DEPTS) {
    const t = MAPD.rackTile[d.id], px = t.x * T, py = t.y * T;
    ctx.fillStyle = '#5b6370'; ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
    ctx.fillStyle = '#3d434d'; ctx.fillRect(px + 1, py + 15, T - 2, 2);
    const cs = Math.ceil(G.stock[d.id].back / d.upc);
    for (let i = 0; i < Math.min(cs, 6); i++) {
      const cx = i % 3, cy = (i / 3) | 0;
      ctx.fillStyle = d.color; ctx.fillRect(px + 4 + cx * 9, py + 4 + cy * 14, 7, 9);
    }
    label(ctx, String(cs), px + T - 6, py + T - 6, { font: 'bold 9px system-ui', outline: '#000' });
  }
}

function drawEndcaps() {
  for (const e of MAPD.endcaps) {
    const dept = G.endcaps[e.id], px = e.x * T, py = e.y * T;
    ctx.fillStyle = dept ? DEPT[dept].color : '#a8987f';
    ctx.fillRect(px + 2, py + 3, T - 4, T - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.strokeRect(px + 2.5, py + 3.5, T - 5, T - 7);
    if (dept) label(ctx, '★', px + T / 2, py + T / 2, { font: 'bold 13px system-ui', color: '#fff8d6' });
  }
}

function drawTags() {
  const blink = Math.floor(performance.now() / 400) % 2;
  for (const t of G.tags) {
    const px = t.x * T, py = t.y * T;
    ctx.fillStyle = t.kind === 'error' ? (blink ? '#ff3b30' : '#a51d16') : '#ffd84d';
    ctx.fillRect(px + T - 14, py + 1, 12, 9);
    label(ctx, '$', px + T - 8, py + 6, { font: 'bold 8px system-ui', color: '#000' });
  }
}

function badge(x, y, text, bg) {
  ctx.font = 'bold 10px system-ui';
  const w = Math.max(14, ctx.measureText(text).width + 6);
  ctx.fillStyle = bg || '#111'; rrect(ctx, x - w / 2, y - 7, w, 14, 7); ctx.fill();
  label(ctx, text, x, y + 0.5, { font: 'bold 10px system-ui' });
}

function drawPallet(p, x0, y0) {
  const s = 26, x = (x0 != null ? x0 : p.x) * T - s / 2, y = (y0 != null ? y0 : p.y) * T - s / 2;
  ctx.fillStyle = '#9a7046'; ctx.fillRect(x, y, s, s);
  ctx.fillStyle = '#7d5835'; for (let i = 0; i < 3; i++) ctx.fillRect(x, y + 4 + i * 9, s, 2);
  p.cases.slice(-9).forEach((c, i) => {
    const cx = i % 3, cy = (i / 3) | 0;
    ctx.fillStyle = DEPT[c.d].color; ctx.fillRect(x + 2 + cx * 8, y + 2 + cy * 8, 7, 7);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.strokeRect(x + 2.5 + cx * 8, y + 2.5 + cy * 8, 6, 6);
  });
  if (p.cold) { ctx.strokeStyle = '#9be3ff'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2); ctx.lineWidth = 1; }
  badge(x + s - 1, y + s - 1, String(p.cases.length), p.cold ? '#1b6fa8' : '#111');
}

function drawFloat(f) {
  const w = 28, h = 20, x = f.x * T - w / 2, y = f.y * T - h / 2, d = DEPT[f.dept];
  ctx.fillStyle = '#4b5563'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 1;
  ctx.fillStyle = d.color; ctx.fillRect(x, y - 4, w, 4);
  const n = f.cases.length, vis = Math.min(8, Math.ceil(n / 5));
  for (let i = 0; i < vis; i++) { const cx = i % 4, cy = (i / 4) | 0; ctx.fillStyle = d.color; ctx.fillRect(x + 2 + cx * 6.5, y + 3 + cy * 8, 5.5, 6.5); }
  if (n) badge(x + w, y - 2, String(n), '#1d4ed8');
  const atHome = Math.abs(f.x - f.homeX) < 0.1 && Math.abs(f.y - f.homeY) < 0.1;
  if (!atHome) label(ctx, d.id, f.x * T, y + h + 7, { font: 'bold 9px system-ui', outline: '#000' });
}

function drawPerson(x, y, r, fill, stroke, text) {
  ctx.beginPath(); ctx.arc(x * T, y * T, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); ctx.lineWidth = 1;
  if (text) label(ctx, text, x * T, y * T + 0.5, { font: 'bold 8px system-ui' });
}
function drawCarry(x, y, carry) {
  carry.forEach((c, i) => {
    ctx.fillStyle = DEPT[c.d].color; ctx.fillRect(x * T - 6 + i * 3, y * T - 24 - i * 6, 12, 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeRect(x * T - 5.5 + i * 3, y * T - 23.5 - i * 6, 11, 7);
  });
}
function drawProgress(x, y, p) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x * T - 12, y * T + 13, 24, 4);
  ctx.fillStyle = '#7ee0a1'; ctx.fillRect(x * T - 12, y * T + 13, 24 * clamp(p, 0, 1), 4);
}

function drawCrew(c, r) {
  if (r.pallet) drawPallet(r.pallet, r.x + r.fx * 0.6, r.y + r.fy * 0.6);
  const initials = c.name.split(' ').map(s => s[0]).join('');
  drawPerson(r.x, r.y, 10, ROLES[c.role].color, '#fff', initials);
  label(ctx, c.name.split(' ')[0], r.x * T, r.y * T - 16, { font: 'bold 9px system-ui', outline: 'rgba(0,0,0,0.8)' });
  if (r.carry.length) drawCarry(r.x, r.y - 0.1, r.carry.slice(0, 4));
  if (r.progress > 0) drawProgress(r.x, r.y, r.progress);
}

function drawCustomer(cu) {
  drawPerson(cu.x, cu.y, 7, cu.color, 'rgba(0,0,0,0.35)');
  if (cu.emoteT > 0) {
    ctx.fillStyle = '#fff'; rrect(ctx, cu.x * T - 9, cu.y * T - 24, 18, 13, 4); ctx.fill();
    label(ctx, cu.emote, cu.x * T, cu.y * T - 17, { font: 'bold 9px system-ui', color: '#d00' });
  }
}

function drawVendor(n) {
  drawPerson(n.x, n.y, 10, '#2f855a', '#c6f6d5', 'DSD');
  const v = n.v;
  if (v && v.state === 'waiting') {
    const left = 1 - (G.time - v.arrived) / VENDOR_PATIENCE;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(n.x * T - 14, n.y * T - 20, 28, 4);
    ctx.fillStyle = left > 0.5 ? '#7ee0a1' : left > 0.25 ? '#f0b429' : '#e5534b';
    ctx.fillRect(n.x * T - 14, n.y * T - 20, 28 * clamp(left, 0, 1), 4);
    label(ctx, v.name, n.x * T, n.y * T - 28, { font: 'bold 9px system-ui', outline: 'rgba(0,0,0,0.8)' });
  }
}

function drawPlayer() {
  const p = G.player;
  if (p.pallet) drawPallet(p.pallet, p.x + p.fx * 0.7, p.y + p.fy * 0.7);
  ctx.beginPath();
  ctx.moveTo(p.x * T + p.fx * 18, p.y * T + p.fy * 18);
  ctx.lineTo(p.x * T + p.fx * 12 - p.fy * 5, p.y * T + p.fy * 12 + p.fx * 5);
  ctx.lineTo(p.x * T + p.fx * 12 + p.fy * 5, p.y * T + p.fy * 12 - p.fx * 5);
  ctx.closePath(); ctx.fillStyle = '#ffd34d'; ctx.fill();
  drawPerson(p.x, p.y, 12, '#1e6fd9', '#ffd34d', 'YOU');
  if (p.carry.length) drawCarry(p.x, p.y, p.carry);
  if (p.work) drawProgress(p.x, p.y + 0.15, p.work.t / p.work.dur);
}

function drawTrailer() {
  const x = 1.2 * T, y = 0.15 * T, w = 5.6 * T, h = 1.75 * T;
  ctx.fillStyle = '#d9dde3'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a929e'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); ctx.lineWidth = 1;
  for (let i = 0; i < Math.min(G.trailer.length, 10); i++) {
    ctx.fillStyle = G.trailer[i].cold ? '#6cc4ee' : '#b08a5a';
    ctx.fillRect(x + 8 + i * 17, y + h - 20, 14, 14);
  }
  label(ctx, G.trailer.length ? `TRAILER · ${plural(G.trailer.length, 'pallet')}` : 'TRAILER EMPTY', x + w / 2, y + 14, { font: 'bold 12px system-ui', color: '#222' });
}

function render() {
  ctx.drawImage(BG, 0, 0);
  drawShelves(); drawRacks(); drawEndcaps(); drawTags();
  if (G.phase === 'night') drawTrailer();
  G.pallets.forEach(p => drawPallet(p));
  G.floats.forEach(drawFloat);
  RT.customers.forEach(drawCustomer);
  Object.values(RT.vendorNpcs).forEach(drawVendor);
  G.crew.forEach(c => { const r = RT.crew[c.id]; if (r && r.inBuilding) drawCrew(c, r); });
  drawPlayer();
  RT.floaters.forEach(f => {
    ctx.globalAlpha = clamp(1.4 - f.t, 0, 1);
    label(ctx, f.text, f.x * T, f.y * T, { font: 'bold 11px system-ui', color: f.color, outline: 'rgba(0,0,0,0.85)' });
    ctx.globalAlpha = 1;
  });
  if (G.phase === 'night') {
    ctx.fillStyle = 'rgba(10,15,40,0.5)'; ctx.fillRect(T, 11 * T, (MW - 2) * T, 13 * T);
    label(ctx, 'STORE CLOSED — night truck', 20 * T, 17 * T, { font: 'bold 18px system-ui', color: 'rgba(255,255,255,0.6)' });
  } else if (G.phase === 'day' && G.time < OPEN) {
    label(ctx, `Doors open at 7:00 AM`, 20 * T, 17 * T, { font: 'bold 16px system-ui', color: 'rgba(0,0,0,0.25)' });
  }
}
