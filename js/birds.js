'use strict';
// =====================================================================
//  Backstock birds: each aisle's backstock lives on a "bird", a 2-tier
//  cart on wheels parked in BACKSTOCK. Push it out to its aisle and work
//  it straight onto the shelf (much faster than carrying 3 cases at a
//  time), then bring it back to its spot.
//  - [E] at a bird pushes it. [Q] carries a few cases instead.
//  - At the bird's own aisle, [E] works backstock onto the shelf.
//  - A bird left out on the sales floor is a wall in front of the
//    customer. If nobody's using it, the crew puts it away after a while.
//  - Replenishment (and Freight once the truck is out) run the birds on
//    each aisle's backstock day. Department clerks run their own.
// =====================================================================
const BIRD_IDLE_MIN = 20; // a bird nobody touches for this long gets put away

function ensureBirds() {
  G.birds = G.birds || {};
  DEPTS.forEach(d => {
    const t = MAPD.rackTile[d.id];
    let b = G.birds[d.id];
    if (!b) b = G.birds[d.id] = { dept: d.id, x: t.x + 0.5, y: t.y + 0.5, carriedBy: null, claimedBy: null };
    b.homeX = t.x + 0.5; b.homeY = t.y + 0.5;
  });
}
const birdOf = d => G.birds && G.birds[d];
const birdList = () => (G.birds ? DEPTS.map(d => G.birds[d.id]).filter(Boolean) : []);
const birdAtHome = b => Math.abs(b.x - b.homeX) < 0.2 && Math.abs(b.y - b.homeY) < 0.2;
const backCases = d => Math.ceil(G.stock[d].back / DEPT[d].upc);
// Birds parked on the sales floor with nobody pushing them.
const birdsLeftOut = () => birdList().filter(b => !b.carriedBy && b.y >= 10.5);

// ---- you ----
function grabBird(b) {
  if (b.carriedBy) return;
  b.carriedBy = 'player'; b.claimedBy = null;
  G.player.birdId = b.dept;
  SFX.pick();
}
function releaseBird(home) {
  const b = G.birds[G.player.birdId];
  if (b) {
    b.carriedBy = null;
    if (home) { b.x = b.homeX; b.y = b.homeY; addXP(1, G.player); }
    else { b.leftAt = G.time; b.leftDay = G.day; }
  }
  G.player.birdId = null;
}
function playerWorkBird(b) {
  startWork(0.4, 'Working backstock', () => {
    const d = DEPT[b.dept], s = G.stock[b.dept];
    if (!canStock(b.dept)) { toast(`${d.name} shelf is full. Take the bird back to BACKSTOCK.`, 'info'); return false; }
    const u = Math.min(s.back, d.upc);
    if (u <= 0) return false;
    s.back -= u; stockUnits(b.dept, u);
    G.today.youStocked++;
    addXP(1);
    if (s.back <= 0) { toast(`${d.aisle} bird worked! +4 XP. Take it back to BACKSTOCK.`, 'good'); addXP(4, G.player); return false; }
    return true;
  }, true);
}

// ---- crew ----
// Push the bird to its aisle, work it until the shelf is full or the bird is empty, bring it home.
function planBirdRun(c, r, dept) {
  const b = birdOf(dept), d = DEPT[dept];
  if (!b || b.carriedBy || (b.claimedBy && b.claimedBy !== c.id) || G.stock[dept].back < d.upc || !canStock(dept) || RT.replenClaim[dept]) return null;
  b.claimedBy = c.id;
  RT.replenClaim[dept] = c.id;
  r.cleanups.push(() => { if (b.claimedBy === c.id) b.claimedBy = null; if (RT.replenClaim[dept] === c.id) delete RT.replenClaim[dept]; });
  r.intent = `Running the ${d.aisle} bird`;
  let t = 0;
  return [
    goEnt(() => (b.carriedBy ? null : b)),
    { do: () => { if (b.carriedBy) return false; b.carriedBy = c.id; r.birdId = dept; return true; } },
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Working backstock';
      if (G.stock[dept].back <= 0 || !canStock(dept)) { r.progress = 0; return true; }
      t += dt * sf(c); r.progress = t / 0.5;
      if (t >= 0.5) { t = 0; const u = Math.min(G.stock[dept].back, d.upc); G.stock[dept].back -= u; stockUnits(dept, u); }
      return false;
    } },
    { do: () => { if (rollMistake(c, 'stock', 0.1)) dropTrash(r); return true; } },
    { go: () => [rackAccess(dept)] },
    { do: () => { b.carriedBy = null; b.claimedBy = null; r.birdId = null; b.x = b.homeX; b.y = b.homeY; return true; } },
  ];
}
// Today's backstock run (and any bird that's overflowing), until 5 PM.
function planBirdRunToday(c, r) {
  if (G.phase !== 'day' || G.time >= 1020) return null;
  const want = (BACKSTOCK_RUNS[dowOf(G.day)] || []).concat(birdsOver());
  for (const d of want) {
    if (G.stock[d].back < DEPT[d].upc * 2 || shelfPct(d) >= 0.95) continue;
    const p = planBirdRun(c, r, d); if (p) return p;
  }
  return null;
}
// Put away a bird somebody left out.
function planReturnBird(c, r) {
  const b = birdList().find(x => !x.carriedBy && !x.claimedBy && !birdAtHome(x) && (x.leftDay !== G.day || G.time - (x.leftAt || 0) >= BIRD_IDLE_MIN));
  if (!b) return null;
  b.claimedBy = c.id;
  r.cleanups.push(() => { if (b.claimedBy === c.id) b.claimedBy = null; });
  r.intent = `Putting the ${DEPT[b.dept].aisle} bird away`;
  return [
    goEnt(() => (b.carriedBy ? null : b)),
    { do: () => { if (b.carriedBy) return false; b.carriedBy = c.id; r.birdId = b.dept; return true; } },
    { go: () => [rackAccess(b.dept)] },
    { do: () => { b.carriedBy = null; b.claimedBy = null; r.birdId = null; b.x = b.homeX; b.y = b.homeY; return true; } },
  ];
}

// ---- drawing ----
function drawBirdSpots(g) {
  for (const d of DEPTS) {
    const t = MAPD.rackTile[d.id], x = t.x * T, y = t.y * T;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, y + 3, T - 6, T - 6);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.setLineDash([3, 3]); g.strokeRect(x + 3.5, y + 3.5, T - 7, T - 7); g.setLineDash([]);
    g.fillStyle = d.color; g.fillRect(x + 3, y + T - 5, T - 6, 2);
  }
}
function drawBirds() {
  for (const b of birdList()) {
    const d = DEPT[b.dept], w = 26, h = 24, x = Math.round(b.x * T - w / 2), y = Math.round(b.y * T - h / 2);
    const cs = backCases(b.dept), vis = cs ? Math.max(1, Math.round(Math.min(cs, BIRD_CASES) / BIRD_CASES * 6)) : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 3, w, h);
    // wheels
    ctx.fillStyle = '#0b0d10'; for (const [wx, wy] of [[1, h - 2], [w - 4, h - 2], [1, -1], [w - 4, -1]]) ctx.fillRect(x + wx, y + wy, 3, 3);
    // frame and two tiers
    ctx.fillStyle = '#5d646d'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a1e24'; ctx.fillRect(x + 2, y + 2, w - 4, 9); ctx.fillRect(x + 2, y + 13, w - 4, 9);
    for (let i = 0; i < vis; i++) { const cx = i % 3, cy = (i / 3) | 0; ctx.fillStyle = d.color; ctx.fillRect(x + 3 + cx * 7, y + (cy ? 3 : 14), 6, 7); }
    glowRect(ctx, x, y - 2, w, 2, d.color, 5);
    label(ctx, String(cs), x + w - 3, y + h - 2, { font: PX(8), outline: '#000' });
    if (!birdAtHome(b)) label(ctx, d.id, b.x * T, y + h + 8, { font: PX(8), outline: '#000' });
  }
}
