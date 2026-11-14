'use strict';
// =====================================================================
//  Backroom upkeep: empty pallets, the baler, reload staging, truck stop
//  order, sweeping, crooked floats and overflowing birds.
//  - Every broken-down pallet leaves an EMPTY pallet on its receiving spot.
//    Stack empties in RELOAD STAGING (bottom-left) or receiving fills up.
//  - Every case broken down leaves cardboard. The baler holds BALE_SIZE
//    cases' worth; when it's full, make a bale or cardboard hits the floor.
//  - Reload staging has RELOAD_SLOTS slots: a stack of 15 empties or 1 bale each.
//  - Trucks take reloads at night, but only if they have room: last stop on
//    the route = takes everything; middle stop = a little; first stop = none.
//  - The backroom gets dirty with every case. Sweep mid-day and at close.
//  - Floats get knocked crooked in float staging. Crooked floats slow the
//    breakdown and look sloppy. Straighten them.
//  - Each aisle's bird (2-tier backstock float) holds BIRD_CASES cases. Past
//    that, backstock overflows onto the sales floor and blocks the aisle.
// =====================================================================
const BALE_SIZE = 80, STACK = 15, RELOAD_SLOTS = 8, BIRD_CASES = 14;
const RELOAD_TILES = [1, 2, 3, 4, 5, 6, 7, 8].map(x => ({ x, y: 9 }));
const BALER = { x: 9, y: 9 };
const STOP_ROOM = { 1: 0, 2: 3, 3: 99 }; // reload slots a truck can take, by stop (of 3)

function setupBackroom() {
  RELOAD_TILES.forEach(t => { MAPD.grid[t.y][t.x] = 'L'; });
  MAPD.grid[BALER.y][BALER.x] = 'K';
  setupReclaim();
}
function ensureBackroom() {
  G.empties = G.empties || [];
  G.baler = G.baler || 0;
  G.reload = G.reload || { pallets: 0, bales: 0 };
  if (G.dirt == null) G.dirt = 10;
  G.floats.forEach(f => { if (f.crooked == null) f.crooked = false; });
  ensureBirds();
}
const reloadUsed = () => Math.ceil(G.reload.pallets / STACK) + G.reload.bales;
const reloadFree = () => RELOAD_SLOTS - reloadUsed();
// Can one more empty pallet go on the stacks?
const canStackEmpty = () => G.reload.pallets % STACK !== 0 || reloadFree() > 0;
const nearReload = p => RELOAD_TILES.some(t => Math.hypot(p.x - t.x - 0.5, p.y - t.y - 0.5) < 1.3);
const workTiles = tiles => { const out = []; tiles.forEach(t => DIRS.forEach(([dx, dy]) => { if (walkable(t.x + dx, t.y + dy)) out.push({ x: t.x + dx, y: t.y + dy }); })); return out; };
const nearBaler = p => Math.hypot(p.x - BALER.x - 0.5, p.y - BALER.y - 0.5) < 1.5;
const inBackroom = p => p.y < 10 && p.x < 34;

// ---- empty pallets ----
// Called instead of silently deleting a broken-down pallet.
function palletEmptied(p) {
  G.empties.push({ id: nid(), x: p.x, y: p.y });
  G.dirt = Math.min(100, G.dirt + 0.6);
}
function stackEmpty() {
  if (!canStackEmpty()) { toast('Reload staging is full. Load reloads on tonight\'s truck, or bale less often.', 'warn'); return false; }
  G.reload.pallets++;
  return true;
}
// ---- cardboard, baler, bales ----
function cardboard(n) {
  G.dirt = Math.min(100, G.dirt + 0.05 * n);
  const room = BALE_SIZE - G.baler, inb = Math.min(room, n);
  G.baler += inb;
  if (n - inb > 0) {
    G.cardOver = (G.cardOver || 0) + n - inb;
    while (G.cardOver >= 6) { G.cardOver -= 6; const t = pick(MAPD.backroomTiles.filter(t => t.y >= 6)); dropTrash({ x: t.x + 0.5, y: t.y + 0.5 }); }
  }
  if (G.baler >= BALE_SIZE && !RT.balerWarned) { RT.balerWarned = true; toast('🧱 The baler is full. Make a bale (E at the baler, bottom-left) or cardboard ends up on the floor.', 'warn'); }
}
function makeBale(byPlayer) {
  if (G.baler < BALE_SIZE * 0.5) return false;
  if (reloadFree() <= 0) { if (byPlayer) toast('No room in reload staging for a bale. Get reloads on a truck first.', 'warn'); return false; }
  G.baler = 0; G.reload.bales++; RT.balerWarned = false;
  G.today.bales = (G.today.bales || 0) + 1;
  if (byPlayer) { addXP(6, G.player); toast('🧱 Bale made and staged for reload.', 'good'); }
  return true;
}
// ---- trucks & reloads ----
function planStops() {
  const tr = trucksOn(G.day);
  G.today.stops = {};
  tr.forEach(t => { G.today.stops[t] = randi(1, 3); });
}
const reloadRoomTonight = () => sum(Object.values((G.today && G.today.stops) || {}).map(s => STOP_ROOM[s]));
function stopText() {
  const st = (G.today && G.today.stops) || {};
  const k = Object.keys(st);
  if (!k.length) return 'No trucks tonight: reloads stay put.';
  return k.map(t => `${t}: stop ${st[t]} of 3${st[t] === 3 ? ' (last stop, takes all reloads)' : st[t] === 1 ? ' (first stop, no room)' : ` (room for ${STOP_ROOM[st[t]]} slots)`}`).join(' · ');
}
function loadReload() {
  const room = reloadRoomTonight() - (G.today.reloaded || 0);
  if (room <= 0) return false;
  if (G.reload.bales) G.reload.bales--;
  else if (G.reload.pallets) G.reload.pallets -= Math.min(STACK, G.reload.pallets);
  else return false;
  G.today.reloaded = (G.today.reloaded || 0) + 1;
  return true;
}
function reloadInteraction(p) {
  if (G.phase !== 'night' || G.trailer.length || !(p.y < 4.4 && p.x > 1.5 && p.x < 6.5)) return null;
  const room = reloadRoomTonight() - (G.today.reloaded || 0), staged = reloadUsed();
  if (!staged) return null;
  if (room <= 0) return { label: `No room on tonight's trucks for reloads (${stopText()})`, fn: null };
  return { label: `Load reloads onto the trailer (${staged} staged, room for ${Math.min(room, 99)})`, fn: () => startWork(1.5, 'Loading reloads', () => { if (loadReload()) { addXP(3, G.player); SFX.drop(); } }) };
}
// The night unloader (if any) loads what fits; the rest waits.
function reloadsEndNight() {
  if (G.crew.some(c => c.role === 'unloader' && curShift(c) === 'night' && !c.calledOut)) while (loadReload());
  const left = reloadUsed();
  if (left >= RELOAD_SLOTS - 1) mail('Warehouse', 'Reload staging is full', `You have ${left} of ${RELOAD_SLOTS} reload slots used (${G.reload.pallets} empty pallets, ${G.reload.bales} bales).\nWhen reload staging fills, empty pallets pile up in receiving and there's nowhere to drop tomorrow's freight. Load reloads every time a truck is your last stop.`);
}
// ---- sweeping ----
function sweep(byPlayer) {
  G.dirt = 0;
  G.today.sweeps = (G.today.sweeps || []).concat([G.time]);
  if (byPlayer) { addXP(5, G.player); toast('🧹 Backroom swept.', 'good'); }
}
const sweptAfter = t => (G.today.sweeps || []).some(x => x >= t);
// ---- floats ----
function knockFloat(f, c) {
  const p = c ? 0.05 + 0.25 * (1 - trainAvg(c) / 100) : 0.05;
  if (Math.random() < p) f.crooked = true;
}
const crookedFloats = () => G.floats.filter(f => !f.carriedBy && (f.crooked || Math.abs(f.x - f.homeX) > 0.1 || Math.abs(f.y - f.homeY) > 0.1));
// ---- birds ----
const birdCap = d => BIRD_CASES * DEPT[d].upc;
const birdOver = d => !DEPT[d].cold && G.stock[d].back > birdCap(d);
const birdsOver = () => DEPTS.filter(d => birdOver(d.id)).map(d => d.id);
// Overflowing birds plus birds somebody left parked on the sales floor.
const birdsOnFloor = () => [...new Set(birdsOver().concat(birdsLeftOut().map(b => b.dept)))];
function birdSpot(d) {
  const g = GONDOLAS.find(([, ch]) => SHELF_DEPT[ch] === d);
  if (g) return { x: g[0] + 1.5, y: 12.5 };
  return { x: 20, y: 11.5 };
}

// ---- interactions ----
function backroomInteraction(p, late) {
  if (late) return inBackroom(p) && G.dirt >= 20 && G.phase === 'day' && !p.carry.length && !p.floatId && !p.pallet ? { label: `Sweep the backroom (dirt ${Math.round(G.dirt)}%)`, fn: () => startWork(4, 'Sweeping', () => sweep(true)) } : null;
  if (p.pallet && p.pallet.empty) {
    if (nearReload(p)) return { label: canStackEmpty() ? `Stack the empty pallet (${G.reload.pallets % STACK}/${STACK} on this stack)` : '✗ Reload staging is full', fn: canStackEmpty() ? () => { if (stackEmpty()) { p.pallet = null; addXP(2, p); SFX.drop(); } } : null, bad: !canStackEmpty() };
    return { label: 'Take the empty pallet to RELOAD STAGING (bottom-left)', fn: null };
  }
  if (p.carry.length || p.floatId || p.pallet) return null;
  const rl = reloadInteraction(p); if (rl) return rl;
  const e = nearest(G.empties, p, 1.15);
  if (e) return { label: 'Jack the empty pallet', fn: () => startWork(0.6, 'Jacking empty', () => { if (!G.empties.includes(e)) return; G.empties = G.empties.filter(x => x !== e); p.pallet = { id: e.id, empty: true, cases: [] }; }) };
  if (nearBaler(p)) {
    if (G.baler >= BALE_SIZE * 0.5) return { label: `Make a bale (baler ${Math.round(G.baler / BALE_SIZE * 100)}% full)`, fn: () => startWork(3, 'Baling cardboard', () => makeBale(true)) };
    return { label: `Baler ${Math.round(G.baler / BALE_SIZE * 100)}% full · Reload staging ${reloadUsed()}/${RELOAD_SLOTS} slots`, fn: null };
  }
  const f = nearest(G.floats, p, 1.2, x => !x.carriedBy && x.crooked);
  if (f) return { label: `Straighten the ${DEPT[f.dept].name} float`, fn: () => startWork(0.8, 'Straightening float', () => { f.crooked = false; f.x = f.homeX; f.y = f.homeY; addXP(1, p); }) };
  return null;
}

// ---- crew plans ----
// Breakdown / unloader crew: stack empties, make bales, sweep when it's bad.
function planBackroom(c, r) {
  if (G.empties.length && canStackEmpty() && !RT.emptyClaim) {
    const e = G.empties[0]; RT.emptyClaim = e.id;
    r.cleanups.push(() => { if (RT.emptyClaim === e.id) RT.emptyClaim = null; });
    r.intent = 'Stacking empty pallets';
    return [
      goEnt(() => (G.empties.includes(e) ? e : null)),
      { wait: 0.6, label: 'Jacking empty' },
      { do: () => { if (!G.empties.includes(e)) return false; G.empties = G.empties.filter(x => x !== e); r.pallet = { id: e.id, empty: true, cases: [] }; return true; } },
      { go: () => workTiles(RELOAD_TILES) },
      { wait: 0.5, label: 'Stacking' },
      { do: () => { if (stackEmpty()) r.pallet = null; else { r.pallet = null; G.empties.push({ id: e.id, x: r.x, y: r.y }); } RT.emptyClaim = null; return true; } },
    ];
  }
  if (G.baler >= BALE_SIZE && reloadFree() > 0) {
    r.intent = 'Making a bale';
    return [{ go: () => workTiles([BALER]) }, { wait: 3, label: 'Baling' }, { do: () => { makeBale(false); return true; } }];
  }
  if (G.dirt >= 60 && G.phase === 'day') {
    r.intent = 'Sweeping the backroom';
    return [{ go: () => [pick(MAPD.backroomTiles)] }, { wait: 4, label: 'Sweeping' }, { do: () => { sweep(false); return true; } }];
  }
  return null;
}

// Stop breaking down to deal with the backroom when it is about to choke.
const backroomUrgent = () => (G.baler >= BALE_SIZE && reloadFree() > 0) || (G.empties.length >= 4 && canStackEmpty() && !RT.emptyClaim);

// ---- time ----
function backroomHour() {
  if (G.phase !== 'day') return;
  G.dirt = Math.min(100, G.dirt + 1.5);
  G.floats.forEach(f => { if (!f.carriedBy && Math.random() < 0.06) f.crooked = true; });
  const over = birdsOnFloor();
  if (G.time >= OPEN && over.length) {
    G.sat = Math.max(0, G.sat - 0.6 * over.length);
    G.today.birdHours = (G.today.birdHours || 0) + over.length;
  }
  if (G.empties.length >= 6 && !G.today.emptyWarned) { G.today.emptyWarned = true; toast(`${G.empties.length} empty pallets are taking up receiving. Stack them in reload staging.`, 'warn'); }
}
function backroomStartDay() {
  ensureBackroom();
  planStops();
}
function backroomCheck() {
  return { dirt: G.dirt, empties: G.empties.length, baler: G.baler >= BALE_SIZE, birds: birdsOnFloor(), crooked: crookedFloats().length, reloadFull: reloadUsed() > RELOAD_SLOTS - 1 };
}
function backroomTips() {
  const b = backroomCheck(), tips = [];
  if (b.birds.length) tips.push(`Birds overflowed onto the sales floor in ${b.birds.map(d => DEPT[d].aisle).join(', ')}. Run backstock on its day, and order less of what's already sitting in the back.`);
  if (b.empties > 3) tips.push(`${b.empties} empty pallets were left in receiving. Stack them in reload staging so tomorrow's freight has somewhere to go.`);
  if (!sweptAfter(1260) && b.dirt > 30) tips.push('The backroom wasn\'t swept at close. A dirty backroom fails inspections and hides hazards.');
  return tips;
}
function backroomDayExtras() {
  const b = backroomCheck();
  return { birdHours: G.today.birdHours || 0, emptiesLeft: b.empties, dirtClose: Math.round(b.dirt), swept: (G.today.sweeps || []).length, bales: G.today.bales || 0, reloaded: G.today.reloaded || 0 };
}
function backroomReviewNotes(days, note) {
  const S = f => sum(days.map(f));
  const bh = S(d => d.birdHours || 0), emp = Math.max(0, ...days.map(d => d.emptiesLeft || 0)), dirty = days.filter(d => (d.dirtClose || 0) > 40).length;
  if (bh > 3) note('Backstock (birds)', `Birds overflowed onto the sales floor for ${bh} aisle-hours this week.`,
    'A bird in the aisle is a wall in front of the customer. It also means you ordered more than the shelf and the bird can hold, which is cash sitting in the back.',
    'Run every backstock day before noon. When a bird is full, cut the order for that aisle until it\'s worked down.');
  if (emp > 4 || dirty > 1) note('Backroom', [emp > 4 && `up to ${emp} empty pallets left in receiving`, dirty > 1 && `the backroom closed dirty ${dirty} night${dirty > 1 ? 's' : ''}`].filter(Boolean).join(', ') + '.',
    'The backroom is where the whole store\'s speed starts. When receiving is full of empties and the floor is a mess, the truck takes longer and someone gets hurt.',
    'Stack empties as pallets come apart, bale when the baler\'s full, load reloads on every last-stop truck, and sweep mid-day and at close.');
}

// ---- drawing ----
function drawBackroom() {
  // reload staging
  const used = [];
  for (let i = 0; i < Math.ceil(G.reload.pallets / STACK); i++) used.push({ kind: 'p', n: i === Math.ceil(G.reload.pallets / STACK) - 1 ? (G.reload.pallets - 1) % STACK + 1 : STACK });
  for (let i = 0; i < G.reload.bales; i++) used.push({ kind: 'b' });
  RELOAD_TILES.forEach((t, i) => {
    const px = t.x * T, py = t.y * T, u = used[i];
    ctx.strokeStyle = 'rgba(66,215,255,0.35)'; ctx.setLineDash([3, 3]); ctx.strokeRect(px + 2, py + 2, T - 4, T - 4); ctx.setLineDash([]);
    if (!u) return;
    if (u.kind === 'p') {
      const h = 4 + Math.round(u.n / STACK * 18);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px + 6, py + T - 4 - h + 2, T - 10, h);
      for (let k = 0; k < h; k += 3) { ctx.fillStyle = k % 6 ? '#6b4f33' : '#8a6a48'; ctx.fillRect(px + 4, py + T - 5 - k, T - 8, 2); }
      label(ctx, String(u.n), px + T - 6, py + 8, { font: PX(7), outline: '#000' });
    } else {
      ctx.fillStyle = '#7a5530'; ctx.fillRect(px + 4, py + 5, T - 8, T - 9);
      ctx.fillStyle = '#b8874f'; for (let k = 0; k < 4; k++) ctx.fillRect(px + 4, py + 8 + k * 5, T - 8, 2);
      ctx.fillStyle = '#ccc'; ctx.fillRect(px + 10, py + 5, 1, T - 9); ctx.fillRect(px + 20, py + 5, 1, T - 9);
    }
  });
  const rx = sum(RELOAD_TILES.map(t => t.x)) / RELOAD_TILES.length + 0.5, ry = Math.max(...RELOAD_TILES.map(t => t.y)) + 1;
  label(ctx, `RELOAD ${reloadUsed()}/${RELOAD_SLOTS}`, rx * T, ry * T - 2, { font: PX(7), color: 'rgba(66,215,255,0.8)', outline: '#000' });
  // baler
  const bx = BALER.x * T, by = BALER.y * T, fill = clamp(G.baler / BALE_SIZE, 0, 1);
  ctx.fillStyle = '#2b3038'; ctx.fillRect(bx + 2, by + 2, T - 4, T - 4);
  ctx.fillStyle = '#111'; ctx.fillRect(bx + 6, by + 6, T - 12, T - 12);
  ctx.fillStyle = '#b8874f'; ctx.fillRect(bx + 6, by + 6 + (T - 12) * (1 - fill), T - 12, (T - 12) * fill);
  ctx.strokeStyle = fill >= 1 ? '#e5534b' : '#5d646d'; ctx.lineWidth = 2; ctx.strokeRect(bx + 2, by + 2, T - 4, T - 4); ctx.lineWidth = 1;
  label(ctx, 'BALER', bx + T / 2, by - 3, { font: PX(6), outline: '#000' });
  // empties
  G.empties.forEach(e => {
    const s = 26, x = Math.round(e.x * T - s / 2), y = Math.round(e.y * T - s / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 3, y + 3, s, s);
    ctx.fillStyle = '#8a6a48'; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = '#4b3722'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 2 + i * 7, y, 3, s);
  });
  // dirt
  if (G.dirt > 15) {
    const a = clamp((G.dirt - 15) / 85, 0, 1) * 0.55;
    for (const t of MAPD.backroomTiles) {
      if (noise(t.x * 3, t.y * 7) > 0.55) continue;
      ctx.fillStyle = `rgba(60,45,25,${a})`;
      ctx.fillRect(t.x * T + 6 + noise(t.x, t.y) * 14, t.y * T + 8 + noise(t.y, t.x) * 12, 5, 3);
      ctx.fillRect(t.x * T + 18 - noise(t.x, t.y) * 8, t.y * T + 20, 3, 2);
    }
  }
  // overflowing birds on the sales floor
  for (const d of birdsOver()) {
    const s = birdSpot(d), x = s.x * T - 12, y = s.y * T - 12, col = DEPT[d].color;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 3, 24, 24);
    ctx.fillStyle = '#3a3f47'; ctx.fillRect(x, y, 24, 24);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) { ctx.fillStyle = col; ctx.fillRect(x + 2 + i * 7, y + 2 + k * 11, 6, 9); }
    const blink = (performance.now() / 400 | 0) % 2;
    if (blink) label(ctx, 'OVERFLOW', s.x * T, y - 4, { font: PX(7), color: '#ff8c1a', outline: '#000' });
  }
}
// Crooked floats: drawn by wrapping drawFloat.
function drawFloatMaybeCrooked(f) {
  if (!f.crooked || f.carriedBy) return drawFloat(f);
  ctx.save(); ctx.translate(f.x * T, f.y * T); ctx.rotate(0.35); ctx.translate(-f.x * T + 3, -f.y * T + 2);
  drawFloat(f); ctx.restore();
}
