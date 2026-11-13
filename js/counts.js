'use strict';
// =====================================================================
//  On-hand accuracy and cycle counts.
//  The system keeps its own on-hand for every department: what came in on
//  the invoices, minus what scanned at the register. The building doesn't
//  always agree. Product walks out the door, the warehouse ships the wrong
//  case, somebody signs for a short DSD delivery. The system never hears
//  about it, so its on-hand drifts away from what's really there.
//  - The suggested order (and the system order) use the SYSTEM on-hand.
//    Phantom inventory (the system thinks you have it, you don't) means it
//    orders too little and you run out. The other way, it over-orders.
//  - A cycle count fixes it: count the shelf (E at the shelf) and the
//    backstock (E at the aisle's bird), and the system takes your count.
//  - Every morning the system picks 2 departments to count: first any
//    department where customers found the shelf AND the bird empty while
//    the system still showed stock, then whatever was counted longest ago.
// =====================================================================
const COUNT_PER_DAY = 2;
const MISSHIP_CHANCE = 0.012; // per dry case on the warehouse truck
const countTol = counted => Math.max(3, Math.abs(counted) * 0.03); // a count within this is "accurate"

function ensureCounts() {
  const fresh = !G.ohErr;
  G.ohErr = G.ohErr || {}; G.countLog = G.countLog || {}; G.ohFlag = G.ohFlag || {}; G.countHist = G.countHist || [];
  // You inherit a store whose on-hand hasn't been counted in a while.
  DEPTS.forEach(d => { if (G.ohErr[d.id] == null) G.ohErr[d.id] = fresh ? Math.round(rand(-0.4, 1.6) * d.upc) : 0; });
}
const heldGobacks = () => (G.gobacks || []).concat(G.player.gobacks || [], ...Object.values(RT.crew || {}).map(r => r.gobacks || []));
const trueOnHand = dept => onHandUnits(dept) + heldGobacks().filter(g => g.dept === dept).length;
const sysOnHand = dept => Math.max(0, Math.round(trueOnHand(dept) + ((G.ohErr && G.ohErr[dept]) || 0)));
const countsToday = () => (G.counts && G.counts.day === G.day ? G.counts.list : []);
const countOpen = dept => countsToday().find(k => k.dept === dept && k.status === 'open');
const daysSinceCount = dept => (G.countLog && G.countLog[dept] ? G.day - G.countLog[dept].day : null);

// ---- how the system drifts ----
// A shopper pockets something: gone from the shelf, never scanned.
function countsOnBuy(dept, got) {
  if (Math.random() < (THEFT_RATE[dept] || 0) * got && G.stock[dept].shelf > 0) {
    G.stock[dept].shelf--; G.ohErr[dept]++;
  }
}
// A customer finds the shelf empty. If the back is empty too but the system
// shows stock, that's phantom inventory: it goes on tomorrow's count list.
function countsOnOut(dept) {
  const s = G.stock[dept];
  if (s.shelf <= 0 && s.back <= 0 && G.ohErr[dept] >= DEPT[dept].upc) {
    G.ohFlag[dept] = (G.ohFlag[dept] || 0) + 1;
    G.today.phantomOuts = (G.today.phantomOuts || 0) + 1;
  }
}
// The warehouse picks the wrong case: the invoice says one department, the box is another.
function misShip(cases) {
  if (!G.ohErr) return;
  const dry = DEPTS.filter(d => !d.cold).map(d => d.id);
  cases.forEach((cs, i) => {
    if (DEPT[cs.d].cold || Math.random() >= MISSHIP_CHANCE) return;
    const other = pick(dry.filter(x => x !== cs.d));
    G.ohErr[cs.d] += DEPT[cs.d].upc; G.ohErr[other] -= DEPT[other].upc;
    cases[i] = makeCase(other);
  });
}

// ---- the daily count list ----
function countsStartDay() {
  ensureCounts();
  RT.countClaim = {};
  const score = d => (G.ohFlag[d] ? 1000 + G.ohFlag[d] : 0) + Math.min(500, daysSinceCount(d) == null ? 500 : daysSinceCount(d)) + Math.random();
  const ds = DEPTS.map(d => d.id).sort((a, b) => score(b) - score(a)).slice(0, COUNT_PER_DAY);
  G.counts = { day: G.day, list: ds.map(d => countItem(d)) };
}
function countItem(dept, why) {
  return {
    dept, shelf: null, back: null, by: null, status: 'open',
    why: why || (G.ohFlag[dept] ? `customers found it empty while the system showed stock (${G.ohFlag[dept]}×)` : daysSinceCount(dept) == null ? 'not counted since you took over' : `last counted ${daysSinceCount(dept)} day${daysSinceCount(dept) === 1 ? '' : 's'} ago`),
  };
}
function countAdd(dept) {
  if (G.phase !== 'day') return false;
  if (!G.counts || G.counts.day !== G.day) G.counts = { day: G.day, list: [] };
  if (countOpen(dept)) return false;
  G.counts.list.push(countItem(dept, 'added by you'));
  return true;
}
function countsEndDay() {
  countsToday().forEach(k => { if (k.status === 'open') { k.status = 'missed'; G.today.countsMissed = (G.today.countsMissed || 0) + 1; } });
}
// Both halves counted: the system takes the count.
function postCount(k, crew) {
  const dept = k.dept, d = DEPT[dept], sys = sysOnHand(dept), actual = trueOnHand(dept);
  let miss = 0;
  if (crew && rollMistake(crew, 'count', 0.35)) miss = (Math.random() < 0.5 ? -1 : 1) * Math.max(d.upc, Math.round(actual * rand(0.06, 0.15)));
  G.ohErr[dept] = miss;
  const counted = Math.max(0, actual + miss), variance = counted - sys, t = G.today;
  Object.assign(k, { status: 'done', sys, counted, variance, by: crew ? crew.name : 'you', at: G.time });
  G.ohFlag[dept] = 0;
  G.countLog[dept] = { day: G.day, sys, counted, variance, by: k.by };
  G.countHist = G.countHist.concat([{ day: G.day, dept, sys, counted, variance, by: k.by, ok: Math.abs(variance) <= countTol(counted) }]).slice(-60);
  t.countsDone = (t.countsDone || 0) + 1;
  if (variance < 0) t.countShrink = (t.countShrink || 0) + -variance * d.price * 0.6;
  const v = `${variance > 0 ? '+' : ''}${variance} units, ${variance < 0 ? '-' : '+'}${money(Math.abs(variance) * d.price * 0.6)}`;
  const rest = Math.max(0, counted - (k.shelf || 0) - (k.back || 0)), onEc = Math.min(rest, ecUnits(dept)), freight = rest - onEc;
  const what = `${k.shelf} on the shelf + ${k.back} in backstock${onEc ? ` + ${onEc} on endcaps` : ''}${freight ? ` + ${freight} still in freight` : ''} = ${counted}`;
  if (crew) toast(`🔢 ${crew.name.split(' ')[0]} counted ${d.aisle}: system ${sys}, real ${counted} (${v}).`, 'info');
  else {
    addXP(8, G.player);
    toast(`🔢 Cycle count, ${d.aisle} ${d.name}: the system said ${sys}. Really: ${what} (${v}). ${variance < -d.upc ? 'That was phantom inventory: the suggested order goes up now.' : variance > d.upc ? 'The system didn\'t know about it: the suggested order was too high.' : 'Close enough. On-hand fixed.'}`, Math.abs(variance) > d.upc ? 'warn' : 'good');
  }
}

// ---- you ----
const countBusy = dept => RT.countClaim && RT.countClaim[dept];
function countShelfAction(dept, shelf) {
  const k = countOpen(dept);
  if (!k || k.shelf != null || countBusy(dept)) return null;
  return { label: `Cycle count: count the ${DEPT[dept].aisle} shelf`, at: tileC(shelf), fn: () => startWork(1.5 + G.stock[dept].shelf / 200, 'Counting the shelf', () => {
    if (k.status !== 'open') return;
    k.shelf = G.stock[dept].shelf; k.by = k.by || 'you';
    if (k.back == null) toast(`Shelf counted: ${k.shelf} units. Now count the backstock on the ${DEPT[dept].aisle} bird.`, 'info'); else postCount(k, null);
  }) };
}
function countBackAction(bird) {
  const dept = bird.dept, k = countOpen(dept);
  if (!k || k.back != null || countBusy(dept)) return null;
  return { label: `Cycle count: count the ${DEPT[dept].aisle} backstock (${plural(backCases(dept), 'case')} on the bird)`, at: bird, fn: () => startWork(1 + G.stock[dept].back / 200, 'Counting backstock', () => {
    if (k.status !== 'open') return;
    k.back = G.stock[dept].back; k.by = k.by || 'you';
    if (k.shelf == null) toast(`Backstock counted: ${k.back} units. Now count the ${DEPT[dept].aisle} shelf.`, 'info'); else postCount(k, null);
  }) };
}

// ---- crew ----
// Count whatever's open (only = limit to these departments). Skips halves already counted.
function planCount(c, r, only) {
  if (G.phase !== 'day') return null;
  RT.countClaim = RT.countClaim || {};
  const k = countsToday().find(x => x.status === 'open' && !RT.countClaim[x.dept] && (!only || only.includes(x.dept)));
  if (!k) return null;
  const dept = k.dept;
  RT.countClaim[dept] = c.id;
  r.cleanups.push(() => { if (RT.countClaim[dept] === c.id) delete RT.countClaim[dept]; });
  r.intent = `Cycle count: ${DEPT[dept].aisle}`;
  return [
    { do: () => (k.shelf != null ? true : [
      { go: () => MAPD.access[dept] },
      { wait: 3 + G.stock[dept].shelf / 100, label: 'Counting the shelf' },
      { do: () => { if (k.status !== 'open') return false; k.shelf = G.stock[dept].shelf; return true; } },
    ]) },
    { do: () => (k.back != null ? true : [
      goEnt(() => birdOf(dept)),
      { wait: 2 + G.stock[dept].back / 100, label: 'Counting backstock' },
      { do: () => { if (k.status !== 'open') return false; k.back = G.stock[dept].back; return true; } },
    ]) },
    { do: () => { if (k.status === 'open') postCount(k, c); return true; } },
  ];
}

// ---- reports ----
function countsTips() {
  const t = G.today, tips = [], missed = countsToday().filter(k => k.status === 'missed');
  if (missed.length) tips.push(`${plural(missed.length, 'cycle count')} didn't get done (${missed.map(k => DEPT[k.dept].aisle).join(', ')}). Every day it waits, the system's on-hand drifts further from the shelf, and the order follows the system.`);
  if (t.phantomOuts) tips.push(`${t.phantomOuts} customer(s) found a shelf and its bird empty while the system showed product on hand: phantom inventory. The suggested order thinks you're covered. Count it, then order.`);
  const big = countsToday().filter(k => k.status === 'done' && k.variance < -DEPT[k.dept].upc);
  if (big.length) tips.push(`Counts found ${money(t.countShrink || 0)} of product the system thought you had (${big.map(k => `${DEPT[k.dept].aisle} ${k.variance}`).join(', ')}). That's unknown shrink: theft, mis-shipped cases and short deliveries nobody caught.`);
  return tips;
}
function countsDayExtras() {
  const t = G.today;
  return { countsDone: t.countsDone || 0, countsMissed: t.countsMissed || 0, phantomOuts: t.phantomOuts || 0, countShrink: Math.round(t.countShrink || 0) };
}
function countsReviewNotes(days, note, praise) {
  const missed = sum(days.map(d => d.countsMissed || 0)), done = sum(days.map(d => d.countsDone || 0)), ph = sum(days.map(d => d.phantomOuts || 0));
  if (missed >= 3) note('Cycle counts', `${missed} cycle counts were skipped this week (${done} done).`,
    'The order runs off the system on-hand. When nobody counts, theft and receiving mistakes pile up as phantom inventory, and the truck shows up short of what the shelf needs.',
    'Count every department on the list, every day. If you can\'t, give the counts to a Scan/Price Clerk or order someone to do them.');
  else if (done >= 5 && !missed) praise.push(`All ${done} cycle counts got done this week.`);
  if (ph >= 10) note('Phantom inventory', `${ph} times a customer found a shelf and its backstock empty while the system said we had it.`,
    'Phantom on-hand stops the reorder: the system won\'t send what it thinks is already here.',
    'When a shelf is empty and the bird is empty, add that department to today\'s counts (🔢 Counts) before you order.');
}

// ---- drawing ----
// A clipboard on the aisle sign or bird that still needs counting.
function drawCountMarks() {
  const open = countsToday().filter(k => k.status === 'open');
  if (!open.length || G.phase !== 'day') return;
  const a = 0.6 + 0.4 * Math.sin(performance.now() / 300);
  const clip = (x, y) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000'; ctx.fillRect(x + 1, y + 1, 9, 11);
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(x, y, 9, 11);
    ctx.fillStyle = '#8a6d3b'; ctx.fillRect(x + 2, y - 1, 5, 3);
    ctx.fillStyle = '#5a6270'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 4 + i * 2, 5, 1);
    ctx.globalAlpha = 1;
  };
  open.forEach(k => {
    const s = MAPD.signs && MAPD.signs[k.dept];
    if (s && k.shelf == null) clip(s.x + s.w + 3, s.y - 16);
    const b = birdOf(k.dept);
    if (b && k.back == null) clip(Math.round(b.x * T + 9), Math.round(b.y * T - 18));
  });
}
