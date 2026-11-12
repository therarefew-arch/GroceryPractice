'use strict';
// =====================================================================
//  Backroom layout: the store can't change shape, but you can rearrange
//  the backroom. Movable: each department's float spot, reload staging
//  (8 slots, as a row or a 4x2 block) and the baler.
//  Rules: only on open backroom floor, never on receiving, the dock
//  doors, the doorways or the backstock rack aisle, and every walkable
//  tile in the store must stay reachable.
// =====================================================================
const LAYOUT_AREA = { x0: 1, x1: 33, y0: 3, y1: 9 };
function defaultLayout() {
  const floats = {};
  DEPTS.forEach((d, i) => { floats[d.id] = { x: 11 + i * 2, y: 5 }; });
  return { floats, reload: { x: 1, y: 9, shape: 'row' }, baler: { x: 9, y: 9 } };
}
const cloneLayout = L => JSON.parse(JSON.stringify(L));
function reloadTilesOf(r) {
  const out = [];
  if (r.shape === 'block') { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) out.push({ x: r.x + dx, y: r.y + dy }); }
  else for (let dx = 0; dx < 8; dx++) out.push({ x: r.x + dx, y: r.y });
  return out;
}
// Tiles nothing may be placed on.
function reservedTiles() {
  const s = new Set();
  const add = (x, y) => s.add(x + ',' + y);
  MAPD.dockTiles.forEach(t => add(t.x, t.y));
  add(MAPD.staffDoor.x, MAPD.staffDoor.y); add(MAPD.vendorSpot.x, MAPD.vendorSpot.y);
  DEPTS.forEach(d => { const a = rackAccess(d.id); add(a.x, a.y); });
  for (let x = 17; x <= 22; x++) add(x, 9); // in front of the sales-floor doors
  add(33, 6); // office doorway approach
  return s;
}
let BASE_GRID = null; // the map with no movable fixtures
function snapshotBase() {
  BASE_GRID = MAPD.grid.map(row => row.map(ch => (ch === 'f' || ch === 'L' || ch === 'K') ? '.' : ch));
}
// Check a whole layout. Returns null if OK, or the reason it isn't.
function layoutProblem(L) {
  if (!BASE_GRID) snapshotBase();
  const res = reservedTiles(), used = new Map();
  const claim = (x, y, what) => {
    if (x < LAYOUT_AREA.x0 || x > LAYOUT_AREA.x1 || y < LAYOUT_AREA.y0 || y > LAYOUT_AREA.y1) return `${what} has to stay inside the backroom.`;
    if (BASE_GRID[y][x] !== '.') return `${what} can only go on open backroom floor (not receiving, racks, walls or the office).`;
    if (res.has(x + ',' + y)) return `${what} would block a doorway, the dock or the backstock racks.`;
    if (used.has(x + ',' + y)) return `${what} overlaps ${used.get(x + ',' + y).replace(/^The /, 'the ')}.`;
    used.set(x + ',' + y, what);
    return null;
  };
  for (const d of DEPTS) { const f = L.floats[d.id]; const e = claim(f.x, f.y, `The ${d.name} float`); if (e) return e; }
  for (const t of reloadTilesOf(L.reload)) { const e = claim(t.x, t.y, 'Reload staging'); if (e) return e; }
  { const e = claim(L.baler.x, L.baler.y, 'The baler'); if (e) return e; }
  // Connectivity: every walkable tile must still be reachable.
  const g = BASE_GRID.map(r => r.slice());
  reloadTilesOf(L.reload).forEach(t => { g[t.y][t.x] = 'L'; });
  g[L.baler.y][L.baler.x] = 'K';
  const ok = (x, y) => y >= 0 && y < MH && x >= 0 && x < MW && WALKABLE.has(g[y][x]);
  let total = 0; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (ok(x, y)) total++;
  const seen = new Uint8Array(MW * MH), q = [MAPD.staffDoor.y * MW + MAPD.staffDoor.x]; seen[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const cx = q[i] % MW, cy = (q[i] / MW) | 0;
    for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy; if (ok(nx, ny) && !seen[ny * MW + nx]) { seen[ny * MW + nx] = 1; q.push(ny * MW + nx); } }
  }
  if (q.length < total) return 'That would wall off part of the backroom. Leave a path around everything.';
  // The baler and reload staging need an open side to work from.
  const side = tiles => tiles.some(t => DIRS.some(([dx, dy]) => ok(t.x + dx, t.y + dy)));
  if (!side([L.baler])) return 'The baler needs an open side to work from.';
  if (!side(reloadTilesOf(L.reload))) return 'Reload staging needs an open side to work from.';
  return null;
}
// Put a layout into the live map.
function applyLayout(L) {
  if (!BASE_GRID) snapshotBase();
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) MAPD.grid[y][x] = BASE_GRID[y][x];
  MAPD.floatSpots = DEPTS.map(d => ({ x: L.floats[d.id].x, y: L.floats[d.id].y, dept: d.id }));
  MAPD.floatSpots.forEach(s => { MAPD.grid[s.y][s.x] = 'f'; });
  RELOAD_TILES.length = 0; reloadTilesOf(L.reload).forEach(t => { RELOAD_TILES.push(t); MAPD.grid[t.y][t.x] = 'L'; });
  BALER.x = L.baler.x; BALER.y = L.baler.y; MAPD.grid[BALER.y][BALER.x] = 'K';
  MAPD.backroomTiles = [];
  for (let y = 3; y <= 9; y++) for (let x = 9; x <= 24; x++) if (walkable(x, y)) MAPD.backroomTiles.push({ x, y });
  if (G) {
    G.floats.forEach(f => {
      const s = MAPD.floatSpots.find(z => z.dept === f.dept); if (!s) return;
      const wasHome = Math.abs(f.x - f.homeX) < 0.1 && Math.abs(f.y - f.homeY) < 0.1;
      f.homeX = s.x + 0.5; f.homeY = s.y + 0.5;
      if (wasHome && f.carriedBy !== 'player') { f.x = f.homeX; f.y = f.homeY; }
    });
    const unstick = e => {
      if (walkable(Math.floor(e.x), Math.floor(e.y))) return;
      const t = pathToTiles({ x: MAPD.staffDoor.x, y: MAPD.staffDoor.y }, tilesAround(e, 2)) || [];
      const dest = t.length ? t[t.length - 1] : MAPD.staffDoor;
      e.x = dest.x + 0.5; e.y = dest.y + 0.5;
    };
    unstick(G.player);
    G.crew.forEach(c => { const r = RT.crew[c.id]; if (r) { if (r.plan) finishPlan(c, r); r.path = null; unstick(r); } });
  }
  if (typeof drawBG === 'function' && typeof canvas !== 'undefined' && BG) BG = drawBG();
}
function moveFixture(fix, x, y, shape) {
  const L = cloneLayout(G.layout || defaultLayout());
  if (fix === 'reload') L.reload = { x, y, shape: shape || L.reload.shape };
  else if (fix === 'baler') L.baler = { x, y };
  else L.floats[fix] = { x, y };
  const why = layoutProblem(L);
  if (why) return why;
  G.layout = L; applyLayout(L); save();
  return null;
}
function resetLayout() { G.layout = null; applyLayout(defaultLayout()); save(); }
let DEFAULT_STATS = null;
function ensureLayout() {
  applyLayout(defaultLayout());
  DEFAULT_STATS = layoutStats();
  if (G.layout && layoutProblem(G.layout)) G.layout = null;
  if (G.layout) applyLayout(G.layout);
}
// What's at a tile, for the editor.
function fixtureAt(x, y) {
  const s = MAPD.floatSpots.find(z => z.x === x && z.y === y); if (s) return s.dept;
  if (RELOAD_TILES.some(t => t.x === x && t.y === y)) return 'reload';
  if (BALER.x === x && BALER.y === y) return 'baler';
  return null;
}
const fixtureName = f => f === 'reload' ? 'Reload staging' : f === 'baler' ? 'Baler' : `${DEPT[f].name} float`;

// ---- walk metrics: shorter trips = faster truck ----
function walkLen(from, tiles) { const p = pathToTiles(from, tiles); return p ? p.length : 99; }
function layoutStats() {
  const recv = { x: 5.5, y: 6.5 };
  const totalDemand = sum(DEPTS.map(d => d.demand));
  let freight = 0;
  for (const s of MAPD.floatSpots) {
    const d = DEPT[s.dept], w = d.demand / totalDemand;
    const a = walkLen(recv, [s]), b = walkLen({ x: s.x + 0.5, y: s.y + 0.5 }, MAPD.access[s.dept]);
    freight += w * (a + b);
  }
  const ring = tiles => { const out = []; tiles.forEach(t => DIRS.forEach(([dx, dy]) => { if (walkable(t.x + dx, t.y + dy)) out.push({ x: t.x + dx, y: t.y + dy }); })); return out; };
  return {
    freight,                                       // receiving → float → sales floor, demand-weighted
    baler: walkLen(recv, ring([BALER])),           // receiving → baler
    reload: walkLen(recv, ring(RELOAD_TILES)),     // receiving → reload staging
    dock: walkLen({ x: 3.5, y: 3.5 }, ring(RELOAD_TILES)), // dock → reload staging (loading reloads)
  };
}
