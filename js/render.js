'use strict';
// =====================================================================
//  Rendering (canvas). Sci-fi pixel look: dark metal floor plates,
//  beveled steel walls, glowing screens, amber circuit-grid outside.
//  The static map is pre-drawn once into BG; OVERLAY adds scanlines.
// =====================================================================
const T = TILE;
const PX = (size, bold) => `${bold === false ? '' : 'bold '}${size}px Silkscreen, 'Courier New', monospace`;
const PAL = {
  void: '#0b090c', grid: 'rgba(240,170,40,0.10)', gridHi: 'rgba(255,190,60,0.38)', amber: '#ffb238',
  plateA: '#3b3f43', plateB: '#363a3e', seam: '#1d2023', bevel: 'rgba(255,255,255,0.06)',
  floorA: '#454a4c', floorB: '#3f4446',
  wallHi: '#c5ccd6', wall: '#7c8592', wallLo: '#3a404a', wallCore: '#262b33',
  cyan: '#42d7ff', cyanDim: '#1b6f8c', plate: '#14223a', plateEdge: '#5fb8e8', green: '#57f287',
};

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function label(g, text, x, y, opts) {
  opts = opts || {};
  g.font = opts.font || PX(8);
  g.textAlign = opts.align || 'center';
  g.textBaseline = 'middle';
  if (opts.glow) { g.shadowColor = opts.glow; g.shadowBlur = 8; }
  if (opts.outline) { g.lineWidth = 3; g.strokeStyle = opts.outline; g.lineJoin = 'round'; g.strokeText(text, x, y); g.lineWidth = 1; }
  g.fillStyle = opts.color || '#fff';
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.textBaseline = 'alphabetic';
}
// Navy nameplate with a cyan rim, like a desk sign.
function nameplate(g, text, x, y, opts) {
  opts = opts || {};
  g.font = opts.font || PX(8);
  const w = Math.ceil(g.measureText(text).width) + (opts.pad || 10), h = opts.h || 13;
  const rx = Math.round(x - w / 2), ry = Math.round(y - h / 2);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(rx + 2, ry + 2, w, h);
  g.fillStyle = opts.bg || PAL.plate; g.fillRect(rx, ry, w, h);
  g.fillStyle = opts.edge || PAL.plateEdge; g.fillRect(rx, ry, w, 2);
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(rx, ry + 2, w, 1);
  g.strokeStyle = opts.edge || PAL.plateEdge; g.globalAlpha = 0.6; g.strokeRect(rx + 0.5, ry + 0.5, w - 1, h - 1); g.globalAlpha = 1;
  label(g, text, x, y + 1, { font: g.font, color: opts.color || '#f2f7ff' });
  return w;
}
const noise = (x, y) => ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000;
const isWall = (x, y) => y >= 0 && y < MH && x >= 0 && x < MW && MAPD.grid[y][x] === '#';

function glowRect(g, x, y, w, h, color, blur) {
  g.save(); g.shadowColor = color; g.shadowBlur = blur || 10; g.fillStyle = color; g.fillRect(x, y, w, h); g.restore();
}

// A glowing monitor (used by registers and the office PC).
function screen(g, x, y, w, h, color, lines) {
  g.fillStyle = '#0a0f14'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  glowRect(g, x, y, w, h, color, 12);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, w, 1);
  if (lines) { g.fillStyle = 'rgba(0,30,40,0.45)'; for (let i = 3; i < h - 1; i += 3) g.fillRect(x + 2, y + i, (w - 4) * (0.4 + noise(x, i) * 0.6), 1); }
}

// Light-gray beveled frame (desk/shelf/pod housing).
function housing(g, x, y, w, h) {
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = '#9aa2ab'; g.fillRect(x, y, w, h);
  g.fillStyle = '#d5dbe2'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
  g.fillStyle = '#5d646d'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
}

function conveyor(g, x, y, len, vertical) {
  const w = vertical ? 10 : len, h = vertical ? len : 10;
  g.fillStyle = '#1a1d21'; g.fillRect(x, y, w, h);
  g.fillStyle = '#6d747d';
  if (vertical) { g.fillRect(x, y, 2, h); g.fillRect(x + w - 2, y, 2, h); for (let i = 2; i < h; i += 4) g.fillRect(x + 2, y + i, w - 4, 1); }
  else { g.fillRect(x, y, w, 2); g.fillRect(x, y + h - 2, w, 2); for (let i = 2; i < w; i += 4) g.fillRect(x + i, y + 2, 1, h - 4); }
  g.fillStyle = 'rgba(66,215,255,0.5)';
  if (vertical) for (let i = 8; i < h; i += 24) g.fillRect(x + 3, y + i, 4, 2);
  else for (let i = 8; i < w; i += 24) g.fillRect(x + i, y + 4, 2, 2);
}

function drawOutside(g) {
  g.fillStyle = PAL.void; g.fillRect(0, 0, MW * T, MH * T);
  // dim red haze blobs
  for (const [cx, cy, r] of [[300, 18, 60], [930, 30, 70], [1180, 812, 70], [120, 818, 55], [700, 830, 50]]) {
    const gr = g.createRadialGradient(cx, cy, 4, cx, cy, r);
    gr.addColorStop(0, 'rgba(150,40,50,0.35)'); gr.addColorStop(1, 'rgba(150,40,50,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // amber circuit grid
  g.lineWidth = 1;
  for (let x = 0; x <= MW * T; x += T / 2) { g.strokeStyle = x % (T * 2) === 0 ? PAL.gridHi : PAL.grid; g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, MH * T); g.stroke(); }
  for (let y = 0; y <= MH * T; y += T / 2) { g.strokeStyle = y % (T * 2) === 0 ? PAL.gridHi : PAL.grid; g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(MW * T, y + 0.5); g.stroke(); }
  // specks and bright nodes
  for (let i = 0; i < 520; i++) {
    const x = noise(i, 7) * MW * T, y = noise(13, i) * MH * T, b = noise(i, i);
    g.fillStyle = b > 0.93 ? '#ffd27a' : b > 0.7 ? 'rgba(255,190,90,0.55)' : 'rgba(255,255,255,0.25)';
    g.fillRect(Math.round(x), Math.round(y), b > 0.93 ? 2 : 1, b > 0.93 ? 2 : 1);
  }
  // a couple of glowing trace lines
  g.save(); g.shadowColor = PAL.amber; g.shadowBlur = 6; g.strokeStyle = 'rgba(255,178,56,0.7)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, 1.25 * T); g.lineTo(7 * T, 1.25 * T); g.lineTo(7.5 * T, 0.6 * T); g.lineTo(16 * T, 0.6 * T); g.stroke();
  g.beginPath(); g.moveTo(24 * T, 25.4 * T); g.lineTo(31 * T, 25.4 * T); g.lineTo(32 * T, 24.9 * T); g.lineTo(MW * T, 24.9 * T); g.stroke();
  g.restore(); g.lineWidth = 1;
}

function drawFloorTile(g, x, y, ch) {
  const px = x * T, py = y * T, n = noise(x, y);
  const sales = y > 10;
  const office = ch === 'o' || ch === 'C';
  g.fillStyle = office ? ((x + y) % 2 ? '#2c3b44' : '#29373f') : sales ? ((x + y) % 2 ? PAL.floorA : PAL.floorB) : ((x + y) % 2 ? PAL.plateA : PAL.plateB);
  g.fillRect(px, py, T, T);
  // grate texture
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 4; i < T; i += 4) g.fillRect(px + 2, py + i, T - 4, 1);
  if (n > 0.6) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(px + 4, py + 4, T - 8, T - 8); }
  // seams + bevel
  g.fillStyle = PAL.seam; g.fillRect(px, py + T - 1, T, 1); g.fillRect(px + T - 1, py, 1, T);
  g.fillStyle = PAL.bevel; g.fillRect(px, py, T - 1, 1); g.fillRect(px, py, 1, T - 1);
  // rivets
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(px + 3, py + 3, 1, 1); g.fillRect(px + T - 5, py + T - 5, 1, 1);
}

function drawWallTile(g, x, y) {
  const px = x * T, py = y * T;
  g.fillStyle = PAL.wallCore; g.fillRect(px, py, T, T);
  // the steel band sits in the middle 20px of the tile and connects to neighbours
  const m = 6, s = T - 2 * m;
  const L = isWall(x - 1, y), R = isWall(x + 1, y);
  const U = isWall(x, y - 1), D = isWall(x, y + 1);
  const bx = L ? px : px + m, ex = R ? px + T : px + m + s;
  const by = U ? py : py + m, ey = D ? py + T : py + m + s;
  g.fillStyle = PAL.wall; g.fillRect(bx, py + m, ex - bx, s); g.fillRect(px + m, by, s, ey - by);
  g.fillStyle = PAL.wallHi; g.fillRect(bx, py + m, ex - bx, 2); g.fillRect(px + m, by, 2, ey - by);
  g.fillStyle = PAL.wallLo; g.fillRect(bx, py + m + s - 3, ex - bx, 3); g.fillRect(px + m + s - 3, by, 3, ey - by);
  g.fillStyle = '#5a626e'; g.fillRect(bx, py + m + 6, ex - bx, 1);
  // inner groove
  g.fillStyle = 'rgba(0,0,0,0.35)'; if (L || R) g.fillRect(bx, py + T / 2, ex - bx, 1);
}

function drawBG() {
  const b = document.createElement('canvas');
  b.width = MW * T; b.height = MH * T;
  const g = b.getContext('2d');
  drawOutside(g);

  // building shadow + rim glow
  g.save(); g.shadowColor = 'rgba(120,200,255,0.35)'; g.shadowBlur = 24; g.fillStyle = '#1c2026';
  rrect(g, 0, 2 * T, MW * T, 23 * T, 18); g.fill(); g.restore();

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const ch = MAPD.grid[y][x], px = x * T, py = y * T;
    if (ch === '~') continue;
    if (ch === '#') { drawWallTile(g, x, y); continue; }
    drawFloorTile(g, x, y, ch);
    if (ch === 'r') { g.fillStyle = 'rgba(255,178,56,0.05)'; g.fillRect(px, py, T, T); }
    if (ch === 'D') {
      g.fillStyle = PAL.wallCore; g.fillRect(px, py, T, T);
      g.fillStyle = '#1a1c20'; g.fillRect(px + 1, py + 6, T - 2, T - 12);
      g.save(); g.beginPath(); g.rect(px + 1, py + 6, T - 2, T - 12); g.clip(); g.fillStyle = '#e8a92a';
      for (let i = -T; i < T * 2; i += 10) { g.beginPath(); g.moveTo(px + i, py + T); g.lineTo(px + i + 5, py + T); g.lineTo(px + i + 5 + T, py); g.lineTo(px + i + T, py); g.closePath(); g.fill(); }
      g.restore();
      glowRect(g, px + T / 2 - 3, py + T - 5, 6, 3, (x % 2) ? '#ff5544' : PAL.green, 8);
    }
    if (ch === 'v') {
      g.fillStyle = PAL.wallCore; g.fillRect(px, py, T, T);
      g.fillStyle = '#21402c'; g.fillRect(px + 3, py + 4, T - 6, T - 8);
      glowRect(g, px + 6, py + 6, T - 12, 2, PAL.green, 8);
      label(g, 'DSD', px + T / 2, py + T / 2 + 3, { font: PX(8), color: '#bdf7cf' });
    }
    if (ch === 'X') {
      g.fillStyle = PAL.wallCore; g.fillRect(px, py, T, T);
      g.fillStyle = 'rgba(66,215,255,0.18)'; g.fillRect(px, py + 8, T, T - 16);
      glowRect(g, px, py + 8, T, 2, PAL.cyan, 10); glowRect(g, px, py + T - 10, T, 2, PAL.cyan, 10);
    }
    if (ch === '=') {
      g.fillStyle = PAL.wallCore; g.fillRect(px, py, T, T);
      g.fillStyle = '#2a3038'; g.fillRect(px + 1, py + 5, T - 2, T - 10);
      g.fillStyle = 'rgba(66,215,255,0.25)'; g.fillRect(px + 1, py + 5, T - 2, T - 10);
      g.fillStyle = '#111'; g.fillRect(px + T / 2 - 1, py + 5, 2, T - 10);
      glowRect(g, px + 2, py + 5, T - 4, 1, PAL.cyan, 6);
    }
    if (ch === 'R') {
      housing(g, px + 1, py + 4, T - 2, T - 6);
      g.fillStyle = '#2b3038'; g.fillRect(px + 4, py + 15, T - 8, T - 21);
      screen(g, px + 9, py + 6, 14, 7, PAL.cyan, true);
    }
    if (ch === 'C') {
      housing(g, px, py + 2, T, T - 6);
    }
  }
  // Office workstation: screen over both desk tiles, plus a chair
  {
    const px = 36 * T, py = 3 * T;
    screen(g, px + 8, py + 5, 48, 14, PAL.cyan, false);
    label(g, 'STORENET', px + T, py + 13, { font: PX(7, false), color: '#062a38' });
    g.fillStyle = '#2b3a55'; g.fillRect(px + T - 7, py + T + 4, 14, 10);
    g.fillStyle = '#3d5277'; g.fillRect(px + T - 7, py + T + 4, 14, 3);
    g.fillStyle = '#111'; g.fillRect(px + T - 1, py + T + 14, 2, 4);
  }

  // Ceiling lights along the top wall and the sales-floor wall
  for (const lx of [8, 14, 20, 30]) glowRect(g, lx * T, 2 * T + 9, 18, 4, '#f2f6ff', 14);
  for (const lx of [4, 10, 16, 24, 30, 36]) glowRect(g, lx * T + 6, 10 * T + 9, 18, 4, '#f2f6ff', 14);

  // Conveyors (decor) along the receiving zone and float staging
  conveyor(g, 1 * T + 4, 9 * T + 11, 8 * T - 8, false);

  // Receiving zone: amber hazard border
  g.save(); g.shadowColor = PAL.amber; g.shadowBlur = 8; g.strokeStyle = PAL.amber; g.setLineDash([6, 4]); g.lineWidth = 2;
  g.strokeRect(1 * T + 2, 4 * T + 2, 8 * T - 4, 5 * T - 4); g.restore();
  MAPD.floatSpots.forEach(s => {
    g.save(); g.shadowColor = PAL.cyan; g.shadowBlur = 6; g.strokeStyle = 'rgba(66,215,255,0.8)'; g.lineWidth = 1.5;
    g.strokeRect(s.x * T + 3, s.y * T + 3, T - 6, T - 6); g.restore();
    g.fillStyle = DEPT[s.dept].color; g.fillRect(s.x * T + 3, (s.y + 1) * T + 2, T - 6, 2);
  });
  // Bird parking spots (the birds themselves move)
  drawBirdSpots(g);

  // Zone nameplates
  nameplate(g, 'RECEIVING', 5 * T, 3.55 * T, { edge: PAL.amber, color: '#ffe2a6', font: PX(8) });
  { const fs = MAPD.floatSpots, cx = sum(fs.map(s => s.x)) / fs.length + 0.5, cy = Math.min(...fs.map(s => s.y)); nameplate(g, 'FLOAT STAGING', cx * T, (cy - 0.8) * T, { font: PX(8) }); }
  nameplate(g, 'BACKSTOCK', 30.5 * T, 4.75 * T, { font: PX(8) });
  nameplate(g, 'OFFICE', 36.5 * T, 9.35 * T, { font: PX(8) });
  label(g, 'TRUCK YARD', 20 * T, 1 * T, { font: PX(14), color: '#ffcf70', glow: PAL.amber });
  label(g, 'PARKING LOT', 20 * T, 25.5 * T, { font: PX(10), color: '#ffcf70', glow: PAL.amber });
  label(g, 'ENTRANCE', 20 * T, 23.5 * T, { font: PX(8), color: 'rgba(66,215,255,0.7)' });
  // Aisle signs as desk nameplates
  for (const [gx, ch] of GONDOLAS) {
    const d = DEPT[SHELF_DEPT[ch]];
    const cx = gx * T + T / 2, cy = 11.45 * T;
    const w = nameplate(g, d.aisle.toUpperCase(), cx, cy - 5, { font: PX(8), h: 12 });
    (MAPD.signs = MAPD.signs || {})[SHELF_DEPT[ch]] = { x: Math.round(cx - w / 2), y: Math.round(cy + 13), w };
    g.fillStyle = '#0d1626'; g.fillRect(Math.round(cx - w / 2), Math.round(cy + 1), w, 10);
    g.fillStyle = d.color; g.fillRect(Math.round(cx - w / 2), Math.round(cy + 10), w, 2);
    label(g, d.name.toUpperCase(), cx, cy + 6, { font: PX(6, false), color: '#9fc8e6' });
  }
  { const w = nameplate(g, 'DAIRY', 37.5 * T + 2, 11.0 * T, { font: PX(8), h: 12, edge: DEPT.DAI.color }); (MAPD.signs = MAPD.signs || {}).DAI = { x: Math.round(37.5 * T + 2 - w / 2), y: Math.round(11.0 * T + 8), w }; }
  return b;
}

// Scanlines + vignette, drawn over everything each frame.
let OVERLAY = null;
function drawOverlay() {
  const b = document.createElement('canvas');
  b.width = MW * T; b.height = MH * T;
  const g = b.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.10)';
  for (let y = 0; y < b.height; y += 3) g.fillRect(0, y, b.width, 1);
  const gr = g.createRadialGradient(b.width / 2, b.height / 2, b.height * 0.45, b.width / 2, b.height / 2, b.width * 0.7);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = gr; g.fillRect(0, 0, b.width, b.height);
  return b;
}

function drawShelves() {
  for (const dept in MAPD.shelfTiles) {
    const d = DEPT[dept], pct = shelfPct(dept), out = G.stock[dept].shelf <= 0;
    const mess = 1 - faceOf(dept) / 100; // unfaced product sits pushed back and in shadow
    const cold = d.cold;
    for (const t of MAPD.shelfTiles[dept]) {
      const px = t.x * T, py = t.y * T;
      housing(ctx, px + 1, py, T - 2, T);
      ctx.fillStyle = cold ? '#0b2733' : '#151a20'; ctx.fillRect(px + 4, py + 3, T - 8, T - 6);
      if (cold) { ctx.fillStyle = 'rgba(66,215,255,0.12)'; ctx.fillRect(px + 4, py + 3, T - 8, T - 6); }
      const local = clamp(pct * 1.25 - noise(t.x, t.y) * 0.35, 0, 1);
      const filled = Math.round(local * 9);
      for (let i = 0; i < 9; i++) {
        const cx = i % 3, cy = (i / 3) | 0;
        const has = (8 - i) < filled, messy = has && noise(t.x * 9 + i, t.y * 5 + 3) < mess * 1.15;
        const sx = px + 6 + cx * 7, sy = py + 5 + cy * 8 - (messy ? 2 : 0);
        ctx.fillStyle = has ? d.color : 'rgba(255,255,255,0.05)';
        ctx.fillRect(sx, sy, messy ? 5 : 6, messy ? 5 : 6);
        if (messy) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx, sy, 5, 5); }
        else if (has) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(sx, sy, 6, 1); }
      }
      if (out) {
        const a = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        ctx.save(); ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 10; ctx.strokeStyle = `rgba(255,59,48,${0.6 + a * 0.4})`; ctx.lineWidth = 2;
        ctx.strokeRect(px + 2, py + 1, T - 4, T - 2); ctx.restore();
      }
    }
  }
}

// Pulsing corner brackets around whatever [E] will act on.
function drawTarget() {
  const t = RT.hl; if (!t) return;
  const s = 15 + Math.sin(performance.now() / 160) * 1.5, x = t.x * T, y = t.y * T, L = 6;
  ctx.save(); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 6;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.moveTo(x + sx * s, y + sy * (s - L)); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * (s - L), y + sy * s); ctx.stroke();
  }
  ctx.restore();
}

function drawEndcaps() {
  for (const e of MAPD.endcaps) {
    const dept = G.endcaps[e.id], px = e.x * T, py = e.y * T;
    housing(ctx, px + 1, py + 3, T - 2, T - 6);
    ctx.fillStyle = '#151a20'; ctx.fillRect(px + 4, py + 6, T - 8, T - 12);
    if (dept) {
      glowRect(ctx, px + 5, py + 7, T - 10, T - 14, DEPT[dept].color, 10);
      label(ctx, '★', px + T / 2, py + T / 2 + 1, { font: 'bold 12px system-ui', color: '#fff8d6' });
    }
  }
}

function drawTags() {
  const blink = Math.floor(performance.now() / 400) % 2;
  for (const t of G.tags) {
    const px = t.x * T, py = t.y * T, err = t.kind === 'error';
    glowRect(ctx, px + T - 14, py + 1, 12, 9, err ? (blink ? '#ff3b30' : '#a51d16') : '#ffd84d', err ? 12 : 6);
    label(ctx, '$', px + T - 8, py + 6, { font: PX(8), color: '#000' });
  }
}

function badge(x, y, text, bg) {
  ctx.font = PX(8);
  const w = Math.max(14, ctx.measureText(text).width + 6);
  ctx.fillStyle = bg || '#111'; ctx.fillRect(Math.round(x - w / 2), Math.round(y - 6), w, 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.strokeRect(Math.round(x - w / 2) + 0.5, Math.round(y - 6) + 0.5, w - 1, 11);
  label(ctx, text, x, y + 1, { font: PX(8) });
}

function drawPallet(p, x0, y0) {
  const s = 26, x = Math.round((x0 != null ? x0 : p.x) * T - s / 2), y = Math.round((y0 != null ? y0 : p.y) * T - s / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 3, y + 3, s, s);
  ctx.fillStyle = '#8a6a48'; ctx.fillRect(x, y, s, s);
  ctx.fillStyle = '#6b4f33'; for (let i = 0; i < 3; i++) ctx.fillRect(x, y + 4 + i * 9, s, 2);
  p.cases.slice(-9).forEach((c, i) => {
    const cx = i % 3, cy = (i / 3) | 0, bx = x + 2 + cx * 8, by = y + 2 + cy * 8;
    ctx.fillStyle = DEPT[c.d].color; ctx.fillRect(bx, by, 7, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx, by, 7, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bx, by + 6, 7, 1);
  });
  if (p.cold) { ctx.save(); ctx.shadowColor = PAL.cyan; ctx.shadowBlur = 8; ctx.strokeStyle = '#9be3ff'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, s + 2, s + 2); ctx.restore(); }
  badge(x + s - 1, y + s - 1, String(p.cases.length), p.cold ? '#1b6fa8' : '#14223a');
}

function drawFloat(f) {
  const w = 28, h = 20, x = Math.round(f.x * T - w / 2), y = Math.round(f.y * T - h / 2), d = DEPT[f.dept];
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 3, y + 3, w, h);
  housing(ctx, x, y, w, h);
  ctx.fillStyle = '#1a1e24'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  glowRect(ctx, x, y - 3, w, 3, d.color, 6);
  const n = f.cases.length, vis = Math.min(8, Math.ceil(n / 5));
  for (let i = 0; i < vis; i++) { const cx = i % 4, cy = (i / 4) | 0; ctx.fillStyle = d.color; ctx.fillRect(x + 4 + cx * 5.5, y + 4 + cy * 6, 4.5, 5); }
  if (n) badge(x + w, y - 2, String(n), '#14223a');
  const atHome = Math.abs(f.x - f.homeX) < 0.1 && Math.abs(f.y - f.homeY) < 0.1;
  if (!atHome) label(ctx, d.id, f.x * T, y + h + 7, { font: PX(8), outline: '#000' });
}

// ---- Pixel people ------------------------------------------------------
const lastPos = new WeakMap();
function stepPhase(e) {
  const prev = lastPos.get(e), moving = prev && (Math.abs(prev.x - e.x) + Math.abs(prev.y - e.y)) > 0.0005;
  let ph = prev ? prev.ph : 0;
  if (moving) ph += 0.35;
  lastPos.set(e, { x: e.x, y: e.y, ph });
  return moving ? ph : null;
}
const SKIN = ['#f1c7a3', '#d9a07a', '#a86f4c', '#7a4a32', '#e8b48f'];
const HAIR = ['#2b1d14', '#5a3a22', '#c99a4b', '#111', '#8a2f1f', '#d8d8d8'];
// Draws a little top-down pixel figure centred at (x,y) tiles. u = pixel unit size.
function pixelPerson(e, shirt, opts) {
  opts = opts || {};
  const u = opts.u || 2, cx = Math.round(e.x * T), cy = Math.round(e.y * T);
  const seed = opts.seed || 0;
  const ph = stepPhase(e);
  const leg = ph == null ? 0 : Math.round(Math.sin(ph) * 1.5);
  const bob = ph == null ? 0 : (Math.sin(ph * 2) > 0 ? -1 : 0);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(cx, cy + 6 * u, 4 * u, 1.5 * u, 0, 0, Math.PI * 2); ctx.fill();
  if (opts.ring) { ctx.save(); ctx.shadowColor = opts.ring; ctx.shadowBlur = 10; ctx.strokeStyle = opts.ring; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(cx, cy + 6 * u, 5.5 * u, 2.2 * u, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  const top = cy - 7 * u + bob;
  const P = (gx, gy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(cx + gx * u, top + gy * u, w * u, h * u); };
  const pants = opts.pants || '#2a3140';
  // legs
  P(-2, 9, 2, 3 + leg, pants); P(0, 9, 2, 3 - leg, pants);
  P(-2, 11 + leg, 2, 1, '#111'); P(0, 11 - leg, 2, 1, '#111');
  // torso + arms
  P(-3, 4, 6, 5, shirt); P(-3, 4, 6, 1, 'rgba(255,255,255,0.25)');
  P(-4, 5 - leg * 0.5, 1, 3, shirt); P(3, 5 + leg * 0.5, 1, 3, shirt);
  P(-4, 8 - leg * 0.5, 1, 1, SKIN[seed % SKIN.length]); P(3, 8 + leg * 0.5, 1, 1, SKIN[seed % SKIN.length]);
  if (opts.vest) { P(-3, 4, 1, 5, opts.vest); P(2, 4, 1, 5, opts.vest); }
  // head
  P(-2, 0, 4, 4, SKIN[seed % SKIN.length]);
  P(-2, 0, 4, 1, opts.hat || HAIR[(seed >> 2) % HAIR.length]);
  if (opts.hat) P(-3, 1, 6, 1, opts.hat);
  // eyes (facing down shows face, facing up shows hair)
  if (e.fy < -0.5) P(-2, 1, 4, 2, HAIR[(seed >> 2) % HAIR.length]);
  else { P(-1, 2, 1, 1, '#111'); P(1, 2, 1, 1, '#111'); }
  return top;
}
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

function drawCarry(x, y, carry) {
  carry.forEach((c, i) => {
    const bx = Math.round(x * T - 6 + i * 3), by = Math.round(y * T - 26 - i * 6);
    ctx.fillStyle = DEPT[c.d].color; ctx.fillRect(bx, by, 12, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx, by, 12, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(bx + 0.5, by + 0.5, 11, 7);
  });
}
function drawProgress(x, y, p) {
  const bx = Math.round(x * T - 12), by = Math.round(y * T + 15);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, 26, 6);
  glowRect(ctx, bx, by, 24 * clamp(p, 0, 1), 4, PAL.green, 6);
}

function drawCrew(c, r) {
  if (r.pallet) drawPallet(r.pallet, r.x + r.fx * 0.6, r.y + r.fy * 0.6);
  const role = ROLES[c.role];
  const star = isStar(c);
  const top = pixelPerson(r, role.color, { seed: hash(c.name), vest: 'rgba(0,0,0,0.25)', ring: star ? '#ffd34d' : null });
  const first = (c.lead ? '◆ ' : '') + c.name.split(' ')[0].toUpperCase();
  nameplate(ctx, star ? '★ ' + first : first, r.x * T, top - 9, star ? { font: PX(8), h: 12, edge: '#ffd34d', color: '#ffe9a0', bg: '#2a2208' } : { font: PX(8), h: 12, edge: role.color });
  if (c.order) label(ctx, '📌', r.x * T + 13, top - 9, { font: PX(8) });
  if (G.conflict && (G.conflict.a === c.id || G.conflict.b === c.id)) drawArgueBubble(r, top);
  else if (c.needsCoach) drawCoachBubble(r, top);
  if (r.carry.length) drawCarry(r.x, r.y - 0.1, r.carry.slice(0, 4));
  if (r.progress > 0) drawProgress(r.x, r.y, r.progress);
}

function drawCustomer(cu) {
  if (cu._seed == null) cu._seed = (Math.random() * 1000) | 0;
  const top = pixelPerson(cu, cu.color, { seed: cu._seed, u: 1.5, pants: '#3a3f4a' });
  if (cu.emoteT > 0) {
    ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(cu.x * T - 9), Math.round(top - 16), 18, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(cu.x * T - 2), Math.round(top - 4), 4, 3);
    label(ctx, cu.emote, cu.x * T, top - 9.5, { font: 'bold 9px system-ui', color: '#d00' });
  }
}

function drawVendor(n) {
  const top = pixelPerson(n, '#2f855a', { seed: hash(n.v ? n.v.name : 'v'), hat: '#1f5c3d' });
  const v = n.v;
  if (v && v.state === 'waiting') {
    const left = 1 - (G.time - v.arrived) / VENDOR_PATIENCE;
    nameplate(ctx, v.name.toUpperCase(), n.x * T, top - 16, { font: PX(8), h: 12, edge: PAL.green });
    const bx = Math.round(n.x * T - 14), by = Math.round(top - 7);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, 30, 6);
    glowRect(ctx, bx, by, 28 * clamp(left, 0, 1), 4, left > 0.5 ? PAL.green : left > 0.25 ? '#f0b429' : '#e5534b', 6);
  } else nameplate(ctx, 'DSD', n.x * T, top - 9, { font: PX(8), h: 12, edge: PAL.green });
}

function drawPlayer() {
  const p = G.player;
  if (p.pallet) drawPallet(p.pallet, p.x + p.fx * 0.7, p.y + p.fy * 0.7);
  // facing chevron
  ctx.save(); ctx.shadowColor = '#ffd34d'; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(p.x * T + p.fx * 20, p.y * T + 4 + p.fy * 20);
  ctx.lineTo(p.x * T + p.fx * 14 - p.fy * 5, p.y * T + 4 + p.fy * 14 + p.fx * 5);
  ctx.lineTo(p.x * T + p.fx * 14 + p.fy * 5, p.y * T + 4 + p.fy * 14 - p.fx * 5);
  ctx.closePath(); ctx.fillStyle = '#ffd34d'; ctx.fill(); ctx.restore();
  const top = pixelPerson(p, '#1e6fd9', { seed: 7, ring: '#ffd34d', vest: '#ffd34d' });
  nameplate(ctx, 'YOU', p.x * T, top - 9, { font: PX(8), h: 12, edge: '#ffd34d', color: '#ffe9a0', bg: '#2a2208' });
  if (p.carry.length) drawCarry(p.x, p.y, p.carry);
  if (p.work) drawProgress(p.x, p.y + 0.15, p.work.t / p.work.dur);
}

function drawTrailer() {
  const x = 1.2 * T, y = 0.15 * T, w = 5.6 * T, h = 1.75 * T;
  housing(ctx, x, y, w, h);
  ctx.fillStyle = '#1a1e24'; ctx.fillRect(x + 4, y + 18, w - 8, h - 22);
  for (let i = 0; i < Math.min(G.trailer.length, 10); i++) {
    ctx.fillStyle = G.trailer[i].cold ? '#6cc4ee' : '#b08a5a';
    ctx.fillRect(x + 8 + i * 17, y + h - 20, 14, 14);
  }
  label(ctx, G.trailer.length ? `TRAILER · ${plural(G.trailer.length, 'pallet')}`.toUpperCase() : 'TRAILER EMPTY', x + w / 2, y + 10, { font: PX(8), color: '#14223a' });
}

// ---- Camera: scroll wheel zooms in on the player --------------------------
const CAM = { zoom: 1, target: 1, min: 1, max: 3.5 };
try { const z = parseFloat(localStorage.getItem('groceryPractice.zoom')); if (z >= CAM.min && z <= CAM.max) CAM.zoom = CAM.target = z; } catch (e) { /* ignore */ }
function setZoom(z) {
  CAM.target = clamp(z, CAM.min, CAM.max);
  if (CAM.target < 1.03) CAM.target = 1;
  try { localStorage.setItem('groceryPractice.zoom', String(CAM.target)); } catch (e) { /* ignore */ }
}
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  setZoom(CAM.target * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });

function applyCamera() {
  const zt = G.player.away ? 1 : CAM.target;
  CAM.zoom += (zt - CAM.zoom) * 0.2;
  if (Math.abs(zt - CAM.zoom) < 0.002) CAM.zoom = zt;
  const z = CAM.zoom, W = MW * T, H = MH * T, vw = W / z, vh = H / z;
  const p = G.player;
  const cx = clamp(p.x * T - vw / 2, 0, W - vw), cy = clamp(p.y * T - vh / 2, 0, H - vh);
  CAM.x = cx; CAM.y = cy;
  ctx.setTransform(z, 0, 0, z, -cx * z, -cy * z);
  ctx.imageSmoothingEnabled = z === 1;
}

let lastRenderTs = 0;
function render() {
  const now = performance.now(), rdt = lastRenderTs ? Math.min(0.05, (now - lastRenderTs) / 1000) : 0.016;
  lastRenderTs = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, canvas.width, canvas.height);
  applyCamera();
  ctx.drawImage(BG, 0, 0);
  drawShelves(); drawFaceBars(); drawEndcaps(); drawTags(); drawTrash(); drawEvents(); drawBackroom();
  if (G.phase === 'night') drawTrailer();
  G.pallets.forEach(p => drawPallet(p));
  G.floats.forEach(drawFloatMaybeCrooked);
  drawBirds();
  drawGobacks();
  drawCountMarks();
  RT.customers.forEach(drawCustomer);
  Object.values(RT.vendorNpcs).forEach(drawVendor);
  G.crew.forEach(c => { const r = RT.crew[c.id]; if (r && r.inBuilding) drawCrew(c, r); });
  if (!G.player.away) { drawTarget(); drawPlayer(); drawHeldGobacks(G.player); }
  RT.floaters.forEach(f => {
    ctx.globalAlpha = clamp(1.4 - f.t, 0, 1);
    label(ctx, f.text, f.x * T, f.y * T, { font: PX(10), color: f.color, outline: 'rgba(0,0,0,0.9)' });
    ctx.globalAlpha = 1;
  });
  drawParticles(rdt);
  if (G.phase === 'night') {
    ctx.fillStyle = 'rgba(5,10,30,0.6)'; ctx.fillRect(T, 11 * T, (MW - 2) * T, 13 * T);
    label(ctx, 'STORE CLOSED · NIGHT TRUCK', 20 * T, 17 * T, { font: PX(18), color: 'rgba(66,215,255,0.7)', glow: PAL.cyan });
  } else if (G.phase === 'day' && G.time < OPEN) {
    label(ctx, 'DOORS OPEN AT 7:00 AM', 20 * T, 17 * T, { font: PX(16), color: 'rgba(66,215,255,0.35)', glow: PAL.cyan });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  if (!OVERLAY) OVERLAY = drawOverlay();
  ctx.drawImage(OVERLAY, 0, 0);
  drawComboMeter();
  drawMinimap();
  drawCrewTooltip();
}
