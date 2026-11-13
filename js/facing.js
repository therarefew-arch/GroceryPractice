'use strict';
// =====================================================================
//  Facing and go-backs.
//  - Every aisle has a "faced" level: 100% means every item is pulled to
//    the front edge, labels out. Every customer who shops an aisle leaves
//    it a little messier. Working freight onto a shelf fronts it a little.
//  - An unfaced aisle looks empty even when it isn't: below 70% faced,
//    customers walk past product they can't see (a "visual out"), and the
//    messy aisle drags satisfaction every hour.
//  - Recovery: face every aisle at 5 PM, before the dinner rush, and again
//    before close. [E] at a shelf faces it. Crew on shift do recovery from
//    5 to 6 PM and from 9 PM to close.
//  - Go-backs: things customers changed their minds about. Most get left at
//    the registers (the go-back cart at the front end); some get dumped on
//    the wrong shelf (strays). Return each one to its own aisle. Cold
//    go-backs spoil after 30 minutes out of the cooler.
// =====================================================================
const FACE_DROP = 55;        // a full day of shopping with no facing takes an aisle down about this much
const FACE_GOOD = 85;        // recovery target
const VISUAL_OUT = 70;       // below this, customers start missing product they can't see
const GOBACK_CHANCE = 0.03;  // per shopping stop
const GOBACK_STRAY = 0.35;   // share of go-backs dumped on the wrong shelf
const GOBACK_COLD_MIN = 30;  // cold go-backs spoil after this long
const GOBACK_CARRY = 12;     // go-backs you can carry at once
const GOBACK_CART = { x: 16.5, y: 22.5 };
const RECOVERY = [[1020, 1080], [1260, CLOSE]]; // 5–6 PM and 9 PM to close

function ensureFacing() {
  G.face = G.face || {};
  DEPTS.forEach(d => { if (G.face[d.id] == null) G.face[d.id] = 95; });
  G.gobacks = G.gobacks || [];
  G.player.gobacks = G.player.gobacks || [];
}
const faceOf = d => (G.face && G.face[d] != null ? G.face[d] : 100);
const faceAvg = () => sum(DEPTS.map(d => faceOf(d.id))) / DEPTS.length;
const facedAll = pct => DEPTS.every(d => faceOf(d.id) >= pct);
const messiest = () => DEPTS.slice().sort((a, b) => faceOf(a.id) - faceOf(b.id))[0].id;
const recoveryNow = () => G.phase === 'day' && RECOVERY.some(([a, b]) => G.time >= a && G.time < b);
const gobacksCart = () => (G.gobacks || []).filter(g => g.where === 'cart');
const strays = () => (G.gobacks || []).filter(g => g.where === 'stray');
const coldGobacks = () => (G.gobacks || []).filter(g => DEPT[g.dept].cold);
const gbSummary = list => { const n = {}; list.forEach(g => { n[g.dept] = (n[g.dept] || 0) + 1; }); return Object.entries(n).map(([d, k]) => `${DEPT[d].aisle}${k > 1 ? ' ×' + k : ''}`).join(', '); };

// ---- customers ----
// Below VISUAL_OUT, a shopper can walk right past product that's pushed to the back.
function visualOut(dept, cu, q) {
  const f = faceOf(dept);
  if (f >= VISUAL_OUT || Math.random() > (VISUAL_OUT - f) / VISUAL_OUT * 0.25) return false;
  const t = G.today;
  t.misses++; t.lost[dept] = (t.lost[dept] || 0) + q; t.visualOuts = (t.visualOuts || 0) + 1;
  G.sat = Math.max(0, G.sat - 0.4);
  cu.emote = '?'; cu.emoteT = 2.5;
  RT.voWarned = RT.voWarned || {};
  if (!RT.voWarned[dept] || G.time - RT.voWarned[dept] > 90) {
    RT.voWarned[dept] = G.time;
    toast(`👀 A customer couldn't find product in ${DEPT[dept].aisle} (${Math.round(f)}% faced). It's there, just pushed to the back. Face it!`, 'warn');
  }
  return true;
}
// Every shopper leaves the aisle a little messier, and sometimes leaves a go-back.
function shopMess(dept, got, cu) {
  const d = DEPT[dept];
  G.face[dept] = Math.max(0, G.face[dept] - FACE_DROP / (d.demand * d.upc) * got * rand(0.6, 1.4));
  if (got > 0 && G.stock[dept].shelf > 0 && Math.random() < GOBACK_CHANCE) {
    G.stock[dept].shelf--;
    const item = wpick(d.items, i => i[1])[0], next = cu && cu.stops[cu.i + 1];
    if (next && Math.random() < GOBACK_STRAY / 0.6) {
      const t = pick(MAPD.access[next]);
      G.gobacks.push({ id: nid(), dept, item, where: 'stray', in: next, x: t.x + rand(0.25, 0.75), y: t.y + rand(0.25, 0.75), at: G.time, day: G.day });
      G.face[next] = Math.max(0, G.face[next] - 3);
    } else G.gobacks.push({ id: nid(), dept, item, where: 'cart', at: G.time, day: G.day });
  }
}
// Working freight puts fresh product at the front edge.
function frontFromStocking(dept, units) {
  if (!G.face || units <= 0) return;
  G.face[dept] = Math.min(100, G.face[dept] + units / DEPT[dept].upc * 0.6);
}
function returnGoback(g) { stockUnits(g.dept, 1); }

// ---- you ----
function playerFace(dept) {
  startWork(0.5, 'Facing', () => {
    G.face[dept] = Math.min(100, G.face[dept] + 6);
    addXP(1);
    if (G.face[dept] >= 100) { toast(`${DEPT[dept].aisle} faced. +3 XP`, 'good'); addXP(3, G.player); return false; }
    return true;
  }, true);
}
function playerTakeCart() {
  const p = G.player, room = GOBACK_CARRY - p.gobacks.length;
  const take = gobacksCart().sort((a, b) => (DEPT[b.dept].cold ? 1 : 0) - (DEPT[a.dept].cold ? 1 : 0)).slice(0, room);
  G.gobacks = G.gobacks.filter(g => !take.includes(g));
  p.gobacks.push(...take);
  if (take.length) SFX.pick();
}
function playerPickStray(s) {
  const p = G.player;
  if (p.gobacks.length >= GOBACK_CARRY) return;
  G.gobacks = G.gobacks.filter(g => g !== s);
  p.gobacks.push(s);
  SFX.pick();
}
function playerReturnGobacks(dept) {
  const p = G.player, m = p.gobacks.filter(g => g.dept === dept);
  p.gobacks = p.gobacks.filter(g => g.dept !== dept);
  m.forEach(returnGoback);
  G.today.gobacksDone = (G.today.gobacksDone || 0) + m.length;
  addXP(m.length, p);
  SFX.stock(m.length);
}
function playerDropGobacks() { const p = G.player; p.gobacks.forEach(g => { g.where = 'cart'; G.gobacks.push(g); }); p.gobacks = []; }
// [E] options while you hold go-backs. Falls through (returns null) when nothing applies.
function gobackInteraction(p, shelfDept, shelf) {
  if (!p.gobacks || !p.gobacks.length) return null;
  const m = shelfDept ? p.gobacks.filter(g => g.dept === shelfDept).length : 0;
  if (m) return { label: `Return ${plural(m, 'go-back')} to ${DEPT[shelfDept].aisle}`, fn: () => playerReturnGobacks(shelfDept), at: tileC(shelf), rep: true };
  const s = p.gobacks.length < GOBACK_CARRY && nearest(strays(), p, 1.3);
  if (s) return { label: `Pick up a stray go-back: ${s.item} (goes in ${DEPT[s.dept].aisle})`, fn: () => playerPickStray(s), at: s, rep: true };
  if (dist(GOBACK_CART, p) < 1.5) {
    if (gobacksCart().length && p.gobacks.length < GOBACK_CARRY) return { label: `Take more go-backs (${gobacksCart().length} on the cart)`, fn: playerTakeCart, at: GOBACK_CART, alt: { label: 'Put yours back on the cart', fn: playerDropGobacks } };
    return { label: 'Put your go-backs back on the cart', fn: playerDropGobacks, at: GOBACK_CART };
  }
  return null; // at the wrong shelf you can still face it; the shelf label says where your go-backs go
}
// [E] with empty hands.
function gobackPickup(p) {
  const s = nearest(strays(), p, 1.3);
  if (s) return { label: `Pick up a stray go-back: ${s.item} (goes in ${DEPT[s.dept].aisle})`, fn: () => playerPickStray(s), at: s, rep: true };
  const n = gobacksCart().length;
  if (dist(GOBACK_CART, p) < 1.5) return n ? { label: `Grab go-backs from the cart (${n}${coldGobacks().some(g => g.where === 'cart') ? ', some cold!' : ''})`, fn: playerTakeCart, at: GOBACK_CART } : { label: 'Go-back cart is empty', fn: null };
  return null;
}
function faceInteraction(shelfDept, shelf) {
  if (!shelfDept || faceOf(shelfDept) >= 97 || coolerBlocked(shelfDept)) return null;
  return { label: `Face ${DEPT[shelfDept].aisle} (${Math.round(faceOf(shelfDept))}% faced)`, fn: () => playerFace(shelfDept), at: tileC(shelf) };
}

// ---- crew ----
// Recovery: from 5–6 PM and 9 PM to close, crew on the floor face and work go-backs.
function recoveryPlan(c, r) {
  if (!recoveryNow() || c.role === 'unloader') return null;
  if (['breakdown', 'freight'].includes(c.role) && truckRemaining() > 0 && G.time < 1260) return null;
  if (c.role === 'dsd' && G.vendorsToday.some(v => v.state === 'waiting')) return null;
  const cold = coldGobacks().length;
  return (cold || gobacksCart().length >= 4 || strays().length ? planGobacks(c, r) : null) ||
    planFaceMessiest(c, r, FACE_GOOD + 7) || planGobacks(c, r);
}
function planFaceMessiest(c, r, below) {
  const ds = DEPTS.map(d => d.id).filter(d => faceOf(d) < below && !(RT.faceClaim || {})[d]).sort((a, b) => faceOf(a) - faceOf(b));
  return ds.length ? planFace(c, r, ds[0]) : null;
}
// Outside recovery: work go-backs when they pile up or anything cold is sitting out.
const gobacksUrgent = () => coldGobacks().some(g => G.time - g.at >= 8 || g.day !== G.day) || gobacksCart().length >= 10 || strays().length >= 3;
function planGobacks(c, r) {
  if (RT.gobackClaim && RT.gobackClaim !== c.id) return null;
  const cart = gobacksCart(), st = strays().sort((a, b) => dist(r, a) - dist(r, b)).slice(0, 4);
  if (!cart.length && !st.length) return null;
  RT.gobackClaim = c.id;
  r.cleanups.push(() => { if (RT.gobackClaim === c.id) RT.gobackClaim = null; });
  r.gobacks = r.gobacks || [];
  r.intent = 'Working go-backs';
  const steps = [];
  if (cart.length) steps.push(
    { go: () => tilesAround(GOBACK_CART, 1) },
    { wait: 0.6, label: 'Loading go-backs' },
    { do: () => { const take = gobacksCart().slice(0, 20); G.gobacks = G.gobacks.filter(g => !take.includes(g)); r.gobacks.push(...take); return true; } });
  st.forEach(s => steps.push(
    { go: () => (G.gobacks.includes(s) ? tilesAround(s, 1) : null) },
    { do: () => { if (G.gobacks.includes(s)) { G.gobacks = G.gobacks.filter(g => g !== s); r.gobacks.push(s); } return true; } }));
  // then walk the store, coldest first
  steps.push({ do: () => {
    const depts = [...new Set(r.gobacks.map(g => g.dept))].sort((a, b) => (DEPT[b].cold ? 1 : 0) - (DEPT[a].cold ? 1 : 0));
    const out = [];
    depts.forEach(d => out.push(
      { go: () => MAPD.access[d] },
      { wait: 0.25 * Math.max(1, r.gobacks.filter(g => g.dept === d).length), label: 'Returning go-backs' },
      { do: () => { const m = r.gobacks.filter(g => g.dept === d); r.gobacks = r.gobacks.filter(g => g.dept !== d); m.forEach(returnGoback); G.today.gobacksDone = (G.today.gobacksDone || 0) + m.length; return true; } }));
    return out.length ? out : true;
  } });
  return steps;
}
// Called from finishPlan: anything still in hand goes back on the cart.
function dropCrewGobacks(r) {
  if (!r.gobacks || !r.gobacks.length) return;
  r.gobacks.forEach(g => { g.where = 'cart'; G.gobacks.push(g); });
  r.gobacks = [];
}

// ---- time ----
function facingHour(h) {
  if (G.phase !== 'day') return;
  // Cold go-backs spoil after 30 minutes out of the cooler.
  const bad = (G.gobacks || []).filter(g => DEPT[g.dept].cold && (g.day !== G.day || G.time - g.at >= GOBACK_COLD_MIN));
  if (bad.length) {
    G.gobacks = G.gobacks.filter(g => !bad.includes(g));
    const loss = sum(bad.map(g => DEPT[g.dept].price * 0.6));
    G.today.shrink += loss; G.today.gobackSpoiled = (G.today.gobackSpoiled || 0) + bad.length;
    toast(`❄ ${plural(bad.length, 'cold go-back')} sat out too long and went in the trash (−${money(loss)}). Work cold go-backs first.`, 'bad');
  }
  if (G.time >= OPEN) {
    DEPTS.forEach(d => { const f = faceOf(d.id); if (f < 60) G.sat = Math.max(0, G.sat - (60 - f) / 100); });
    G.sat = Math.max(0, G.sat - 0.1 * strays().length - (gobacksCart().length > 15 ? 0.4 : 0));
  }
  if (h === 17) toast(`🧹 5 PM recovery: face every aisle (${Math.round(faceAvg())}% on average) and work the go-backs before the dinner rush.`, 'warn');
  if (h === 21) toast(`🧹 Close recovery: face every aisle and clear the go-backs before 10:50 PM.`, 'warn');
}
function facingTips() {
  const t = G.today, tips = [];
  if (t.visualOuts) tips.push(`${t.visualOuts} customer(s) couldn't find product that was on the shelf, pushed to the back of an unfaced aisle. Face at 5 PM and before close: a faced aisle sells.`);
  if (t.gobackSpoiled) tips.push(`${t.gobackSpoiled} cold go-back(s) spoiled before anyone put them back. Work cold go-backs first, every time you pass the front end.`);
  const left = (G.gobacks || []).length;
  if (left) tips.push(`${left} go-back(s) were left at close (${gbSummary(G.gobacks)}). They aren't for sale until they're back on their shelf.`);
  if (!facedAll(FACE_GOOD)) tips.push(`Not every aisle was faced at close (lowest: ${DEPT[messiest()].aisle} at ${Math.round(faceOf(messiest()))}%). The morning crew starts behind and the first customers see a messy store.`);
  return tips;
}
function facingDayExtras() {
  return { faceClose: Math.round(faceAvg()), faceMin: Math.round(faceOf(messiest())), visualOuts: G.today.visualOuts || 0, gobacksLeft: (G.gobacks || []).length, gobackSpoiled: G.today.gobackSpoiled || 0 };
}
function facingReviewNotes(days, note, praise) {
  const unfaced = days.filter(d => d.faceMin != null && d.faceMin < FACE_GOOD).length, vo = sum(days.map(d => d.visualOuts || 0));
  const spoiled = sum(days.map(d => d.gobackSpoiled || 0)), left = Math.max(0, ...days.map(d => d.gobacksLeft || 0));
  if (unfaced >= 2 || vo > 10) note('Recovery (facing)', `${unfaced} night${unfaced === 1 ? '' : 's'} closed with an aisle under ${FACE_GOOD}% faced, and ${vo} customer${vo === 1 ? '' : 's'} couldn't find product that was on the shelf.`,
    'Product pushed to the back looks like an out. Customers don\'t dig; they leave. Facing is the cheapest sales you will ever make.',
    'Run recovery at 5 PM and before close every night. Schedule your closers so somebody is there to do it, and face as you walk.');
  else if (days.length >= 3 && unfaced === 0) praise.push('Every aisle was faced at close all week.');
  if (spoiled > 3 || left > 10) note('Go-backs', [spoiled > 3 && `${spoiled} cold go-backs spoiled`, left > 10 && `up to ${left} go-backs were left at close`].filter(Boolean).join(', ') + '.',
    'A go-back is a sale waiting on a shelf it isn\'t on. Cold go-backs are money in the trash after 30 minutes.',
    'Clear the go-back cart every time you pass the front end, cold first, and make go-backs part of recovery.');
}

// ---- drawing ----
function drawGobacks() {
  // the cart at the front end
  const n = gobacksCart().length, x = Math.round(GOBACK_CART.x * T - 12), y = Math.round(GOBACK_CART.y * T - 10);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x + 3, y + 3, 24, 20);
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 22, 14); ctx.lineWidth = 1;
  ctx.fillStyle = '#0b0d10'; ctx.fillRect(x + 2, y + 17, 3, 3); ctx.fillRect(x + 19, y + 17, 3, 3);
  gobacksCart().slice(0, 8).forEach((g, i) => { ctx.fillStyle = DEPT[g.dept].color; ctx.fillRect(x + 3 + (i % 4) * 5, y + 3 + ((i / 4) | 0) * 6, 4, 5); });
  if (n) label(ctx, String(n), x + 24, y + 2, { font: PX(8), outline: '#000', color: coldGobacks().some(g => g.where === 'cart') ? '#9be3ff' : '#fff' });
  label(ctx, 'GO-BACKS', GOBACK_CART.x * T, y + 28, { font: PX(6), color: 'rgba(255,255,255,0.6)', outline: '#000' });
  // strays dumped on the wrong shelf
  const blink = (performance.now() / 500 | 0) % 2;
  strays().forEach(s => {
    const sx = Math.round(s.x * T - 4), sy = Math.round(s.y * T - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx + 1, sy + 1, 8, 8);
    ctx.fillStyle = DEPT[s.dept].color; ctx.fillRect(sx, sy, 8, 8);
    if (blink) { ctx.strokeStyle = DEPT[s.dept].cold ? '#9be3ff' : '#ffd34d'; ctx.strokeRect(sx - 1.5, sy - 1.5, 11, 11); }
  });
}
// A little basket of go-backs next to you.
function drawHeldGobacks(p) {
  if (!p.gobacks || !p.gobacks.length) return;
  const x = Math.round(p.x * T + 8), y = Math.round(p.y * T - 2);
  ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y, 12, 9);
  ctx.fillStyle = '#7f1d14'; ctx.fillRect(x + 1, y + 1, 10, 3);
  p.gobacks.slice(0, 3).forEach((g, i) => { ctx.fillStyle = DEPT[g.dept].color; ctx.fillRect(x + 1 + i * 4, y - 3, 3, 4); });
  label(ctx, String(p.gobacks.length), x + 14, y + 8, { font: PX(7), outline: '#000' });
}
// Faced bar under each aisle sign: green, amber, red.
function drawFaceBars() {
  if (!MAPD.signs) return;
  for (const d in MAPD.signs) {
    const s = MAPD.signs[d], f = faceOf(d) / 100;
    ctx.fillStyle = '#000'; ctx.fillRect(s.x, s.y, s.w, 3);
    ctx.fillStyle = f >= FACE_GOOD / 100 ? PAL.green : f >= VISUAL_OUT / 100 ? '#f0b429' : '#e5534b';
    ctx.fillRect(s.x, s.y, Math.round(s.w * f), 3);
  }
}
