'use strict';
// =====================================================================
//  Core simulation: state, day/night cycle, crew AI, customers, player.
// =====================================================================
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const FLOAT_CAP = 40, CARRY_CAP = 3, PALLET_SIZE = 36;
const OPEN = 420, CLOSE = 1380, NIGHT_END = 1740;
const XP_PER_LEVEL = 400, OT_PER_PALLET = 15, LABOR_TARGET = 12;
const SAVE_KEY = 'groceryPractice.save.v1';
const VERSION = '0.0.21'; // bump the last number on every update

let G = null;   // persistent, saved state
let BG = null;  // pre-rendered static map
const RT = {    // runtime-only state (not saved)
  crew: {}, customers: [], vendorNpcs: {}, floaters: [], keys: {}, lastTs: 0, paused: false, modal: false,
  replenClaim: {}, custAcc: 0, outsWarned: {}, settings: { labels: true },
};

// ---------- utils ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sum = arr => arr.reduce((a, b) => a + b, 0);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function wpick(items, wfn) {
  let t = 0; for (const i of items) t += wfn(i);
  let r = Math.random() * t;
  for (const i of items) { r -= wfn(i); if (r <= 0) return i; }
  return items[items.length - 1];
}
function fmtTime(m) {
  m = Math.floor(m) % 1440;
  let h = Math.floor(m / 60); const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
}
// ---------- calendar ----------
const dowIdx = day => (day - 1) % 7;
const dowOf = day => WEEKDAYS[dowIdx(day)];
const weekOf = day => Math.floor((day - 1) / 7) + 1;
const dowFactor = day => DOW_FACTOR[dowOf(day)] || 1;
const trucksOn = day => TRUCK_SCHEDULE[dowOf(day)] || [];
const isTruckNight = day => trucksOn(day).length > 0;
const deptOnTruck = (dept, day) => trucksOn(day).some(t => TRUCK_TYPES[t].depts.includes(dept));
function nextTruckDay(day) { for (let d = day; d < day + 8; d++) if (isTruckNight(d)) return d; return day; }
function nextTruckDayFor(dept, day) { for (let d = day; d < day + 8; d++) if (deptOnTruck(dept, d)) return d; return day + 7; }
// Days of sales a department's order on truck night `td` has to cover (until its next truck is worked).
function coverDaysFor(dept, td) { return deptOnTruck(dept, td) ? nextTruckDayFor(dept, td + 1) - td : 0; }
function coverDays(td) { return Math.max(1, ...DEPTS.map(d => coverDaysFor(d.id, td))); }
const dayLabel = day => `Wk ${weekOf(day)} · ${dowOf(day)} · Day ${day}`;
const orderOpen = () => G.phase === 'day' && isTruckNight(G.day) && G.time < ORDER_CUTOFF && !G.orderLocked;

const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
const nid = () => G.nextId++;
const caseUnits = c => (c.u != null ? c.u : DEPT[c.d].upc);
function makeCase(dept) { const it = wpick(DEPT[dept].items, i => i[1]); return { d: dept, item: it[0] }; }

// ---------- world queries ----------
const floatById = id => G.floats.find(f => f.id === id);
const floatOf = dept => G.floats.find(f => f.dept === dept);
const shelfPct = dept => G.stock[dept].shelf / DEPT[dept].capU;
const canStock = dept => !coolerBlocked(dept) && DEPT[dept].capU - G.stock[dept].shelf >= DEPT[dept].upc * 0.5;
const endcapCount = dept => Object.values(G.endcaps).filter(v => v === dept).length;
const promoLift = dept => 1 + 0.12 * Math.min(2, endcapCount(dept));
const crewName = id => (G.crew.find(c => c.id === id) || { name: 'Someone' }).name;
const level = () => 1 + Math.floor(G.xp / XP_PER_LEVEL);
const title = () => TITLES[Math.min(TITLES.length - 1, level() - 1)];
const maxCrew = () => 3 + level();

function palletCases(dept) { let n = 0; for (const p of G.pallets) for (const c of p.cases) if (c.d === dept) n++; return n; }
function truckRemaining() { return sum(G.pallets.map(p => p.cases.length)) + sum(G.floats.map(f => f.cases.length)); }
function removeEmptyPallets() { G.pallets = G.pallets.filter(p => { if (p.cases.length) return true; palletEmptied(p); return false; }); }

function stockUnits(dept, u) {
  const s = G.stock[dept], d = DEPT[dept];
  const fit = Math.max(0, Math.min(u, d.capU - s.shelf));
  s.shelf += fit;
  s.back += u - fit;
  frontFromStocking(dept, fit);
  return fit;
}
// A case becomes shelf (or backstock) units. A recalled case keeps being recalled product.
function stockCase(cs) { const u = caseUnits(cs), fit = stockUnits(cs.d, u); if (cs.rc) recallIn(cs, fit, u - fit); return fit; }
function backCase(cs) { const u = caseUnits(cs); G.stock[cs.d].back += u; if (cs.rc) recallIn(cs, 0, u); }
function floatToBack(f) { f.cases.forEach(backCase); f.cases = []; }

function onHandUnits(dept) {
  let u = G.stock[dept].shelf + G.stock[dept].back;
  const add = cont => cont.cases.forEach(c => { if (c.d === dept) u += caseUnits(c); });
  G.pallets.forEach(add); G.trailer.forEach(add); G.floats.forEach(add);
  return u;
}

// ---------- forecasting ----------
const TRAFFIC_SUM = sum(Object.values(TRAFFIC));
function trafficRemaining(t) {
  let rem = 0;
  for (const [h, w] of Object.entries(TRAFFIC)) {
    const hs = h * 60;
    if (t <= hs) rem += w; else if (t < hs + 60) rem += w * (hs + 60 - t) / 60;
  }
  return rem / TRAFFIC_SUM;
}
function avgDemand(dept) { const h = G.history[dept].slice(-7); return sum(h) / h.length; }
function forecastUnits(dept) { return avgDemand(dept) * promoLift(dept); }
function forecastFor(dept, day) { return forecastUnits(dept) * dowFactor(day); }
function dsdUnits(dept) { return sum(VENDORS.filter(v => v.dept === dept).map(v => v.cases * DEPT[dept].upc)); }
function suggestedCases(dept, td) {
  td = td || nextTruckDay(G.day);
  const d = DEPT[dept], cover = coverDaysFor(dept, td);
  if (!cover) return 0;
  let need = 0;
  for (let k = 1; k <= cover; k++) need += forecastFor(dept, td + k);
  // what will still sell between now and the truck night
  let before = 0;
  for (let k = G.day; k <= td; k++) before += forecastFor(dept, k) * (k === G.day ? (G.phase === 'day' ? trafficRemaining(G.time) : 0) : 1);
  need += forecastFor(dept, td + 1) * 0.25 - (sysOnHand(dept) - before) - dsdUnits(dept) * 0.8 * cover;
  return Math.max(0, Math.ceil(need / d.upc));
}
function suggestedOrder() { const o = {}; DEPTS.forEach(d => { o[d.id] = suggestedCases(d.id); }); return o; }

// ---------- truck ----------
// night = tonight's real trucks: the warehouse cuts what it can't ship, and now and then a case is short.
function buildTruck(order, night) {
  const pallets = [], dry = [];
  DEPTS.forEach(d => {
    const n = Math.max(0, Math.floor(order[d.id] || 0));
    const cs = []; for (let i = 0; i < n; i++) cs.push(makeCase(d.id));
    if (night) { resetShip(d.id, cs); cutCases(d.id, cs); invoiceShorts(d.id, cs); }
    misShip(cs); truckDamage(cs);
    if (d.cold) { for (let i = 0; i < cs.length; i += PALLET_SIZE) pallets.push({ id: nid(), cold: true, cases: cs.slice(i, i + PALLET_SIZE) }); }
    else dry.push(...cs);
  });
  shuffle(dry);
  for (let i = 0; i < dry.length; i += PALLET_SIZE) pallets.push({ id: nid(), cold: false, cases: dry.slice(i, i + PALLET_SIZE) });
  return pallets;
}
function freeRecvSpot(near) {
  const taken = G.pallets.concat(G.empties || []);
  const spots = MAPD.recvSpots.filter(s => !s.reserved && !taken.some(p => Math.abs(p.x - s.x - 0.5) < 0.6 && Math.abs(p.y - s.y - 0.5) < 0.6));
  if (!spots.length) return null;
  if (near) spots.sort((a, b) => Math.hypot(a.x + 0.5 - near.x, a.y + 0.5 - near.y) - Math.hypot(b.x + 0.5 - near.x, b.y + 0.5 - near.y));
  return spots[0];
}
function placePallet(p, spot) {
  spot = spot || freeRecvSpot() || pick(MAPD.recvSpots);
  p.x = spot.x + 0.5; p.y = spot.y + 0.5;
  G.pallets.push(p);
}

// ---------- mail, toasts, xp ----------
function mail(from, subject, body) { G.emails.unshift({ id: nid(), day: G.day, time: G.time, from, subject, body, read: false }); }
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  if (typeof SFX !== 'undefined') (SFX[kind] || SFX.info)();
  setTimeout(() => el.remove(), 5000);
}
function floater(x, y, text, color) { RT.floaters.push({ x, y, text, color: color || '#fff', t: 0 }); }
function addXP(n, at) {
  const before = level();
  G.xp += n;
  if (G.today) G.today.xp += n;
  if (at) floater(at.x, at.y - 0.7, `+${n} XP`, '#ffd34d');
  if (level() > before) { confetti(G.player.x, G.player.y, 70); }
  if (level() > before) toast(`⭐ LEVEL UP! Level ${level()} — ${title()}. +1 crew slot unlocked.`, 'gold');
}

function makeCandidate() {
  const role = pick(Object.keys(ROLES)), skill = randi(1, 5);
  return {
    id: nid(), name: pick(FIRST_NAMES) + ' ' + pick(LAST_INITIALS) + '.', role, skill,
    shift: role === 'unloader' ? 'night' : pick(['open', 'truck6', 'truck7', 'truck8', 'mid', 'close', 'close']),
    wage: +(12.5 + skill * 1.25 + rand(0, 1)).toFixed(2),
    exp: hireTrainingBase(skill),
  };
}

function addTag(kind) {
  const dept = pick(DEPTS).id, t = pick(MAPD.shelfTiles[dept]);
  if (G.tags.some(x => x.x === t.x && x.y === t.y)) return;
  G.tags.push({ id: nid(), dept, x: t.x, y: t.y, kind });
}
function fixTag(tag, byPlayer) {
  G.tags = G.tags.filter(t => t !== tag);
  G.today.tagsFixed++;
  if (byPlayer) addXP(5, G.player);
}

// =====================================================================
//  Game lifecycle
// =====================================================================
function newGame() {
  G = {
    version: 1, day: 1, time: 300, phase: 'night', speed: 1, xp: 0, bank: 0, sat: 80, nextId: 1,
    stock: {}, pallets: [], trailer: [], floats: [], crew: [], candidates: [], emails: [], endcaps: {},
    history: {}, itemHistory: {}, order: null, orderSubmitted: false, tags: [], vendorsToday: [], badges: {},
    ad: null, today: null, lastResult: null, pastDays: [], nightLabor: 0, overtime: 0, nightPallets: 0,
    player: { x: 30.5, y: 6.5, fx: 0, fy: 1, carry: [], floatId: null, birdId: null, pallet: null, work: null, away: false },
  };
  applyCatalog();
  DEPTS.forEach(d => {
    G.stock[d.id] = { shelf: Math.round(d.capU * 0.3), back: d.upc };
    G.history[d.id] = Array.from({ length: 7 }, () => Math.round(d.demand * d.upc * rand(0.88, 1.12)));
    const wsum = sum(d.items.map(i => i[1]));
    d.items.forEach(([n, w]) => { G.itemHistory[n] = G.history[d.id].map(u => Math.round(u * w / wsum * rand(0.85, 1.15))); });
  });
  G.layout = null; ensureLayout();
  MAPD.floatSpots.forEach(s => G.floats.push({ id: nid(), dept: s.dept, x: s.x + 0.5, y: s.y + 0.5, homeX: s.x + 0.5, homeY: s.y + 0.5, cases: [], carriedBy: null, claimedBy: null, incoming: 0 }));
  MAPD.endcaps.forEach(e => { G.endcaps[e.id] = null; });
  G.endcaps[MAPD.endcaps[3].id] = 'A2';
  G.endcaps[MAPD.endcaps[5].id] = 'A3';
  G.crew.push({ id: nid(), name: 'Maria L.', role: 'breakdown', shift: 'open', skill: 3, wage: 16.25, calledOut: false });
  G.crew.push({ id: nid(), name: 'Devon P.', role: 'freight', shift: 'truck6', skill: 3, wage: 16.25, calledOut: false });
  G.crew.forEach(c => ensureMorale(ensureTrain(c, 40)));
  G.trash = [];
  ensureBackroom();
  ensureFacing();
  ensureCounts();
  ensureDamages();
  ensureCuts();
  ensureRecalls();
  ensureResets();
  buildTruck(suggestedOrder()).forEach(p => placePallet(p));
  RT.crew = {}; RT.customers = []; RT.vendorNpcs = {}; RT.replenClaim = {};
  mail('Store Training', 'Welcome to your store!', [
    'Welcome aboard! Last night\'s truck is sitting in Receiving (top-left, yellow area).',
    '',
    'Your first-day checklist:',
    '  1. Grab cases off a pallet [E] and sort them onto the matching department float (blue spots).',
    '  2. Push a built float [E] to its aisle and work it onto the shelf.',
    '  3. Dairy & Frozen pallets (blue outline) spoil if they sit — work them first.',
    '  4. Check in DSD vendors at the back door when they show up.',
    '  5. Hang the yellow price-change tags; fix red scan errors.',
    '  6. Before close, review Forecast & Order for tonight\'s truck.',
    '',
    'Maria (Truck Breakdown) and Devon (Freight Pusher) are on the Open shift. Hire more help in the Hiring tab — but watch labor %.',
  ].join('\n'));
  startDay();
}

function startDay() {
  G.phase = 'day';
  G.time = 300;
  if (G.day > 1) G.sat = G.sat * 0.6 + 32; // customers partly forgive overnight
  RT.customers = []; RT.outsWarned = {}; RT.custAcc = 0; RT.replenClaim = {}; RT.faceClaim = {}; RT.gobackClaim = null; RT.voWarned = {}; RT.dmgClaim = null; RT.reclaimClaim = null;
  ensureFacing(); ensureDamages();
  G.floats.forEach(f => {
    if (f.carriedBy === 'player') return;
    f.x = f.homeX; f.y = f.homeY; f.carriedBy = null; f.claimedBy = null; f.incoming = 0;
  });
  G.today = {
    sales: 0, customers: 0, units: {}, demand: {}, lost: {}, itemDemand: {}, requests: 0, misses: 0,
    labor: G.nightLabor, overtime: G.overtime, nightPallets: G.nightPallets, shrink: 0, spoiled: 0, scanLoss: 0,
    truckDoneAt: null, truckCases: truckRemaining(), tagsFixed: 0, vendorsIn: 0, vendorsMissed: 0,
    missorts: 0, youSorted: 0, youStocked: 0, xp: 0,
    goal: Math.round(sum(DEPTS.map(d => forecastFor(d.id, G.day) * d.price))),
  };
  G.nightLabor = 0; G.overtime = 0; G.nightPallets = 0;
  const nTags = 4 + (G.day % 3) * 2;
  for (let i = 0; i < nTags; i++) addTag('change');
  G.vendorsToday = VENDORS.map(v => ({ ...v, state: 'pending' }));
  G.candidates = [makeCandidate(), makeCandidate(), makeCandidate()];
  G.order = null; G.orderSubmitted = false; G.orderLocked = false; G.conflict = null;
  laborStartDay();
  G.crew.forEach(c => {
    c.calledOut = G.day > 1 && !!curShift(c) && Math.random() < calloutChance(ensureMorale(c));
    if (c.calledOut) mail(c.name, 'Can\'t make it in today', `Hey, I'm sick and can't make my ${SHIFTS[curShift(c)].name} shift today. Sorry!\n— ${c.name}`);
  });
  const dowNow = dowOf(G.day);
  if (!G.ad && G.day === 1) G.ad = { depts: shuffle(DEPTS.map(d => d.id)).slice(0, 2), from: 1 };
  if (dowNow === 'Mon') {
    G.nextAd = shuffle(DEPTS.map(d => d.id)).slice(0, 2);
    mail('District Manager', `Next ad chart: ${G.nextAd.map(d => DEPT[d].name).join(' & ')}`,
      `The new ad starts Wednesday. Plan your spots today, flip the endcaps Tuesday night (2 each for ${G.nextAd.map(d => DEPT[d].name).join(' and ')}), and verify it Wednesday morning.\nEndcaps lift sales, but only if the shelves behind them stay full.`);
  }
  if (dowNow === 'Wed' && G.nextAd) {
    G.ad = { depts: G.nextAd, from: G.day }; G.nextAd = null;
    mail('District Manager', 'New ad is live', `Today's ad features ${G.ad.depts.map(d => DEPT[d].name).join(' & ')}. Verify every ad endcap is up and full by noon.`);
  }
  eventsStartDay();
  backroomStartDay();
  countsStartDay();
  cutsStartDay();
  recallsStartDay();
  resetsStartDay();
  G.list = buildChecklist();
  shiftStartDay();
  const nt = nextTruckDay(G.day);
  mail('District Manager', `${WEEKDAY_NAMES[dowIdx(G.day)]} game plan (${dayLabel(G.day)})`, [
    `Morning! It's ${WEEKDAY_NAMES[dowIdx(G.day)]}, week ${weekOf(G.day)}. Here's today:`,
    `  • Tonight's trucks: ${trucksOn(G.day).join(', ') || 'none'}. Order due by ${fmtTime(ORDER_CUTOFF)}.`,
    `  • Invoices to close today: ${(TRUCK_SCHEDULE[dowOf(G.day - 1 || 7)] || []).join(', ')} + DSD`,
    `  • Backstock birds today: ${(BACKSTOCK_RUNS[dowNow] || []).map(d => DEPT[d].aisle).join(', ') || 'none'}`,
    `  • Sales goal: ${money(G.today.goal)}`,
    `  • Labor: ${LABOR_TARGET}% of sales or less`,
    `  • Truck: ${G.today.truckCases} cases — have it worked by noon`,
    `  • Price changes: ${G.tags.length} tags to hang`,
    `  • Reloads: ${stopText()} (${reloadUsed()}/${RELOAD_SLOTS} slots staged)`,
    `  • DSD today: ${VENDORS.map(v => `${fmtTime(v.time)} ${v.name}`).join(', ')}`,
    '',
    'Cold freight first. Let\'s have a great day.',
  ].join('\n'));
  save();
}

function despawnCrew(c) {
  const r = RT.crew[c.id];
  if (!r) return;
  finishPlan(c, r);
  r.inBuilding = false;
}

function endDay() {
  const t = G.today;
  G.vendorsToday.forEach(v => { if (v.state === 'waiting') { v.state = 'left'; t.vendorsMissed++; } });
  RT.vendorNpcs = {}; RT.customers = [];
  G.crew.forEach(despawnCrew);
  tenureDay();
  countsEndDay(); damagesEndDay(); cutsEndDay(); recallsEndDay(); resetsEndDay();
  const res = computeResults();
  res.tips.push(...moraleDay(res), ...eventsTips(), ...backroomTips(), ...facingTips(), ...countsTips(), ...damagesTips(), ...cutsTips(), ...recallsTips(), ...resetsTips());
  DEPTS.forEach(d => {
    G.history[d.id].push(t.demand[d.id] || 0);
    if (G.history[d.id].length > 14) G.history[d.id].shift();
    d.items.forEach(([n]) => { const h = G.itemHistory[n]; h.push(t.itemDemand[n] || 0); if (h.length > 14) h.shift(); });
  });
  res.badges.forEach(b => { G.badges[b] = (G.badges[b] || 0) + 1; });
  G.bank += res.bonus;
  addXP(res.xp);
  G.pastDays.push({ day: G.day, grade: res.grade, score: Math.round(res.score), sales: t.sales, goal: t.goal, laborPct: res.laborPct, inStock: res.inStock, truckDoneAt: t.truckDoneAt, ...dayExtras(res), ...laborDayExtras(), ...backroomDayExtras(), ...facingDayExtras(), ...countsDayExtras(), ...damagesDayExtras(), ...cutsDayExtras(), ...recallsDayExtras(), ...resetsDayExtras() });
  if (G.pastDays.length > 30) G.pastDays.shift();
  updateRecords(G.pastDays[G.pastDays.length - 1]);
  if (dowOf(G.day) === 'Fri') {
    const rv = buildWeekReview(weekOf(G.day));
    if (rv) { G.reviews = (G.reviews || []).concat([rv]).slice(-12); G.pendingReview = rv; mail('District Manager', `Week ${rv.week} review: ${rv.grade}`, reviewText(rv)); }
  }
  G.lastResult = res;
  G.phase = 'summary';
  save();
  UI.showSummary(res);
}

function computeResults() {
  const t = G.today;
  const laborPct = t.sales > 0 ? t.labor / t.sales * 100 : 100;
  const inStock = t.requests ? 1 - t.misses / t.requests : 1;
  const salesR = t.goal ? t.sales / t.goal : 1;
  const td = t.truckDoneAt;
  const tagsAll = t.tagsFixed + G.tags.length;
  const vAll = t.vendorsIn + t.vendorsMissed;
  const parts = [
    { name: 'Sales vs goal', detail: `${money(t.sales)} of ${money(t.goal)} (${Math.round(salesR * 100)}%)`, pts: 30 * clamp(salesR, 0, 1), max: 30 },
    { name: 'In-stock', detail: `${(inStock * 100).toFixed(1)}% · ${t.misses} customers hit an empty shelf`, pts: 25 * clamp((inStock - 0.8) / 0.18, 0, 1), max: 25 },
    { name: 'Labor', detail: `${laborPct.toFixed(1)}% of sales (${money(t.labor)})`, pts: laborPct <= LABOR_TARGET ? 20 : 20 * clamp((20 - laborPct) / 8, 0, 1), max: 20 },
    { name: 'Truck worked', detail: td ? `Done at ${fmtTime(td)}` : (t.truckCases ? `${truckRemaining()} cases still in the back` : 'No truck'), pts: t.truckCases === 0 ? 15 : !td ? 0 : td <= 720 ? 15 : td <= 960 ? 8 : 3, max: 15 },
    { name: 'Price integrity', detail: `${t.tagsFixed}/${tagsAll} tags & scan errors fixed`, pts: 5 * (tagsAll ? t.tagsFixed / tagsAll : 1), max: 5 },
    { name: 'DSD vendors', detail: `${t.vendorsIn}/${vAll} checked in`, pts: 5 * (vAll ? t.vendorsIn / vAll : 1), max: 5 },
  ];
  const score = sum(parts.map(p => p.pts));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const badges = [];
  if (td && td <= 600) badges.push('truck10');
  if (t.misses === 0 && t.requests > 50) badges.push('zeroOuts');
  if (t.sales > 0 && laborPct < 10) badges.push('laborHawk');
  if (t.vendorsMissed === 0 && t.vendorsIn > 0) badges.push('vendorPal');
  if (G.tags.length === 0) badges.push('tagTeam');
  if (t.spoiled === 0) badges.push('coldChain');
  if (G.ad && G.ad.depts.every(d => endcapCount(d) >= 2)) badges.push('adStar');
  if (grade === 'A') badges.push('straightA');
  if ((t.coached || 0) >= 4) badges.push('coach');
  if (facedAll(90) && !(G.gobacks || []).length) badges.push('facedUp');
  if (countsToday().length && countsToday().every(k => k.status === 'done')) badges.push('countKeeper');
  if (t.claims && !t.claimsMissed) badges.push('claimsClerk');
  if (shortsToday().length && shortsToday().every(s => s.state === 'claimed')) badges.push('shortStop');
  if (recallTodayBadge()) badges.push('recallReady');
  if (resetBadgeToday()) badges.push('resetCrew');
  const tips = [];
  if (t.misses) {
    const worst = Object.entries(t.lost).sort((a, b) => b[1] - a[1])[0];
    tips.push(`${t.misses} customers hit an empty shelf — worst was ${DEPT[worst[0]].name} (${worst[1]} units lost). Fill holes from backstock and order enough for tomorrow.`);
  }
  if (t.truckCases && (!td || td > 720)) tips.push('The truck wasn\'t worked by noon. Put more Breakdown/Freight hands on the Open shift, or hire a Night Unloader so pallets are ready at 5 AM.');
  if (t.spoiled) tips.push(`${t.spoiled} cold cases spoiled in the backroom (${money(t.shrink)}). Break down and work Dairy & Frozen first — every hour counts.`);
  if (laborPct > LABOR_TARGET) tips.push(`Labor ran ${laborPct.toFixed(1)}%. Trim overlapping shifts or move people to where the work is.`);
  if (laborPct < 8 && (t.misses > 20 || !td)) tips.push('Labor was lean but the store suffered — sometimes one more person pays for themselves.');
  if (G.tags.length) tips.push(`${G.tags.length} price tags / scan errors were left open. Unhung tags cause overcharges and complaints.`);
  if (t.vendorsMissed) tips.push(`${t.vendorsMissed} DSD vendor(s) left without being checked in. Put someone on DSD, or watch the back door.`);
  if (t.missorts) tips.push(`You tried ${t.missorts} case(s) on the wrong float. Know your aisles: ${DEPTS.map(d => `${d.aisle} ${d.name}`).join(' · ')}.`);
  if (t.crewMistakes) tips.push(`Your crew made ${t.crewMistakes} mistake(s) and you coached ${t.coached || 0}. Coach right away: that's how rookies become superstars.`);
  if ((G.trash || []).length) tips.push(`${G.trash.length} piece(s) of cardboard are still on the floor. Messy aisles lower customer satisfaction every hour.`);
  if (t.systemOrder) tips.push(`You missed the order window (${fmtTime(ORDER_CUTOFF)}) and the system order went instead. The system doesn't know your store: check Forecast & Order before the cutoff on every truck day.`);
  if (!tips.length) tips.push('Clean day. Try for a faster truck or tighter labor tomorrow.');
  const gradeXP = { A: 150, B: 100, C: 60, D: 30, F: 10 }[grade];
  return {
    day: G.day, grade, score, parts, laborPct, inStock, badges, tips,
    xp: gradeXP + badges.length * 25, bonus: { A: 150, B: 100, C: 50, D: 20, F: 0 }[grade],
    earnedToday: t.xp,
  };
}

function startNight() {
  G.phase = 'night';
  G.time = CLOSE;
  if (isTruckNight(G.day)) {
    if (!G.orderSubmitted) { G.order = suggestedOrder(); G.today.systemOrder = true; }
    const ord = G.order || suggestedOrder();
    G.trailer = buildTruck(ord, true);
    cutReport(ord);
    toast(`🚚 Tonight's trucks (${trucksOn(G.day).join(', ')}): ${G.trailer.length} pallets. Pull them into Receiving at the dock doors (top-left), or press "End night".`, 'info');
  } else {
    G.trailer = [];
    toast(`No truck tonight. Next truck: ${WEEKDAY_NAMES[dowIdx(nextTruckDay(G.day + 1))]} night. Press "End night" when you're ready.`, 'info');
  }
  G.orderSubmitted = true; G.orderLocked = true;
  shiftStartNight();
  save();
}

function endNight() {
  if (G.player.pallet) { if (G.player.pallet.empty) G.empties.push({ id: G.player.pallet.id, x: G.player.x, y: G.player.y }); else placePallet(G.player.pallet, freeRecvSpot(G.player)); G.player.pallet = null; }
  G.player.work = null;
  G.crew.forEach(despawnCrew);
  if (G.trailer.length) {
    const n = G.trailer.length, cost = n * OT_PER_PALLET;
    G.overtime += cost; G.nightLabor += cost;
    G.trailer.forEach(p => placePallet(p));
    G.trailer = [];
    toast(`Overtime crew unloaded ${n} pallet${n > 1 ? 's' : ''} (+${money(cost)} labor).`, 'warn');
  }
  MAPD.recvSpots.forEach(s => { s.reserved = null; });
  reloadsEndNight();
  G.day++;
  startDay();
}

function confirmEndNight() {
  if (G.phase !== 'night') return;
  const n = G.trailer.length;
  if (!n) return endNight();
  UI.ask('End the night?', `${n} pallet${n > 1 ? 's are' : ' is'} still on the trailer. An overtime crew will unload ${n > 1 ? 'them' : 'it'} for ${money(n * OT_PER_PALLET)} of labor (counts against tomorrow).`, 'End the night', () => { if (G.phase === 'night') endNight(); });
}

// =====================================================================
//  Main update
// =====================================================================
function isPaused() { return RT.paused || UI.open || RT.modal || !G || (G.phase !== 'day' && G.phase !== 'night'); }

function update(dt) {
  const night = G.phase === 'night';
  const gm = dt * (night ? 3 : 1);   // game minutes this step
  const prev = G.time;
  G.time += gm;
  mgrTick(gm);
  if (!night) {
    if (G.time >= CLOSE) { G.time = CLOSE; endDay(); return; }
    if (Math.floor(G.time / 60) !== Math.floor(prev / 60)) onHour(Math.floor(G.time / 60));
    spawnCustomers(gm);
    orderWindowTick(prev);
    listTick();
    recallsTick();
    resetsTick();
    conflictTick(gm);
    eventsTick(prev, gm);
    laborTick();
    if (G.time > OPEN && G.time < CLOSE - 60 && Math.random() < gm / 140) {
      const before = G.tags.length;
      addTag('error');
      if (G.tags.length > before) toast(`A customer reported a scan error in ${DEPT[G.tags[G.tags.length - 1].dept].name}.`, 'warn');
    }
    updateVendors(dt);
    updateCustomers(dt);
    if (!G.today.truckDoneAt && G.today.truckCases > 0 && truckRemaining() === 0) {
      G.today.truckDoneAt = G.time;
      toast(`🚚 Truck worked! Finished at ${fmtTime(G.time)}.`, 'good');
      addXP(20, G.player);
      confetti(G.player.x, G.player.y, 50);
    }
  } else if (G.time >= NIGHT_END) { endNight(); return; }
  updateCrew(dt, gm);
}

function orderWindowTick(prev) {
  if (!isTruckNight(G.day) || G.orderLocked) return;
  if (!G.orderSubmitted && prev < ORDER_CUTOFF - 60 && G.time >= ORDER_CUTOFF - 60) toast(`⏰ Order window closes at ${fmtTime(ORDER_CUTOFF)}: one hour left to submit tonight's order.`, 'warn');
  if (G.time >= ORDER_CUTOFF) {
    G.orderLocked = true;
    if (!G.orderSubmitted) {
      G.order = suggestedOrder(); G.orderSubmitted = true; G.today.systemOrder = true;
      mail('Replenishment System', 'Order window closed: system order sent', `No order was submitted by ${fmtTime(ORDER_CUTOFF)}, so the suggested order was sent automatically (${sum(Object.values(G.order))} cases). You can't change it now.`);
      toast('Order window closed. The system order was sent for you.', 'bad');
    } else toast(`Order window closed. Your order (${sum(Object.values(G.order))} cs) is locked in.`, 'info');
  }
}

function onHour(h) {
  if (h >= 9 && h <= 21) spoilCheck();
  mentorHour(); trashHour(); moraleHour(); eventsHour(h); backroomHour(); facingHour(h); damagesHour(); recallsHour(h); resetsHour(h);
  if (h === 13 && G.sat < 55) mail('Customer Service Desk', 'Complaints are piling up', 'We\'re getting a lot of complaints about empty shelves and wrong prices today. Can someone check the floor?');
  if (h === 16) toast('🛒 Rush hour is coming (4–7 PM). Top off the fast movers now!', 'warn');
  if (h % 2 === 0) save();
}

function spoilCheck() {
  let n = 0, loss = 0;
  const chk = cont => {
    cont.cases = cont.cases.filter(cs => {
      if (DEPT[cs.d].cold && Math.random() < 0.04) { n++; loss += caseUnits(cs) * DEPT[cs.d].price * 0.6; return false; }
      return true;
    });
  };
  G.pallets.forEach(chk); G.floats.forEach(chk);
  removeEmptyPallets();
  if (n) {
    G.today.shrink += loss; G.today.spoiled += n;
    toast(`❄ ${n} cold case${n > 1 ? 's' : ''} spoiled in the backroom (−${money(loss)}). Work Dairy & Frozen first!`, 'bad');
  }
}

// ---------- customers ----------
const CUST_PER_DAY = sum(DEPTS.map(d => d.demand * d.upc)) / 6;
const CUST_COLORS = ['#e76f51', '#f4a261', '#2a9d8f', '#264653', '#8ab17d', '#b5838d', '#6d597a', '#457b9d', '#e9c46a', '#a8dadc'];

function spawnCustomers(gm) {
  if (G.time < OPEN || G.time > CLOSE - 20) return;
  const w = TRAFFIC[Math.floor(G.time / 60)] || 0;
  const satMult = clamp(0.7 + 0.3 * G.sat / 80, 0.7, 1.08);
  RT.custAcc += CUST_PER_DAY * dowFactor(G.day) * satMult * w / TRAFFIC_SUM / 60 * gm;
  while (RT.custAcc >= 1) { RT.custAcc -= 1; spawnCustomer(); }
}

function spawnCustomer() {
  const n = randi(2, 4), stops = [], pool = DEPTS.slice();
  for (let i = 0; i < n && pool.length; i++) {
    const d = wpick(pool, x => x.demand * x.upc * promoLift(x.id) * catalogFactor(x.id) * seasonLift(x.id, G.day));
    stops.push(d.id); pool.splice(pool.indexOf(d), 1);
  }
  const door = pick(MAPD.frontDoor);
  const cu = { x: door.x + 0.5, y: door.y + 0.5, fx: 0, fy: -1, stops, i: 0, state: 'walk', t: 0, path: null, color: pick(CUST_COLORS), emote: null, emoteT: 0, speed: rand(2.0, 2.8) };
  routeCustomer(cu);
  RT.customers.push(cu);
}

function routeCustomer(cu) {
  let tiles;
  if (cu.state === 'walk') tiles = [pick(MAPD.access[cu.stops[cu.i]])];
  else if (cu.state === 'toReg') tiles = [pick(MAPD.registers)];
  else tiles = MAPD.frontDoor;
  const p = pathToTiles(cu, tiles);
  if (!p) { cu.dead = true; return; }
  setPath(cu, p);
}

function updateCustomers(dt) {
  for (const cu of RT.customers) {
    if (cu.emoteT > 0) cu.emoteT -= dt;
    if (cu.path) { if (moveAlong(cu, dt, cu.speed)) cu.path = null; else continue; }
    cu.t += dt;
    if (cu.state === 'walk') { cu.state = 'shop'; cu.t = 0; }
    else if (cu.state === 'shop' && cu.t > 1.2) {
      buy(cu, cu.stops[cu.i]); cu.i++;
      cu.state = cu.i < cu.stops.length ? 'walk' : 'toReg';
      routeCustomer(cu);
    } else if (cu.state === 'toReg') { cu.state = 'pay'; cu.t = 0; }
    else if (cu.state === 'pay' && cu.t > 1.8) { G.today.customers++; cu.state = 'leave'; routeCustomer(cu); }
    else if (cu.state === 'leave') cu.dead = true;
  }
  RT.customers = RT.customers.filter(c => !c.dead);
}

function buy(cu, dept) {
  const d = DEPT[dept], s = G.stock[dept], t = G.today;
  let q = randi(1, 3) + (endcapCount(dept) && Math.random() < 0.3 ? 1 : 0);
  const sl = seasonLift(dept, G.day);
  if (sl > 1 && Math.random() < Math.min(1, (sl - 1) * 1.6)) q++;
  t.requests++;
  t.demand[dept] = (t.demand[dept] || 0) + q;
  const it = wpick(d.items, i => i[1])[0];
  t.itemDemand[it] = (t.itemDemand[it] || 0) + q;
  if (s.shelf - codeExp(dept) <= 0) {
    t.misses++;
    countsOnOut(dept);
    t.lost[dept] = (t.lost[dept] || 0) + q;
    G.sat = Math.max(0, G.sat - 0.7);
    cu.emote = '!'; cu.emoteT = 2.5;
    if (!RT.outsWarned[dept] || G.time - RT.outsWarned[dept] > 60) {
      RT.outsWarned[dept] = G.time;
      toast(`OUT OF STOCK: ${d.name}! Customers are walking away empty-handed.`, 'bad');
    }
    return;
  }
  if (recallBlock(dept, it, cu)) return;
  if (outHole(dept, it, cu, q)) return;
  if (visualOut(dept, cu, q)) return;
  const got = Math.min(q, s.shelf - codeExp(dept));
  s.shelf -= got;
  t.sales += got * d.price - codesSold(dept, got, cu);
  t.units[dept] = (t.units[dept] || 0) + got;
  G.sat = Math.min(100, G.sat + 0.06);
  shopMess(dept, got, cu);
  countsOnBuy(dept, got);
  shelfDamage(dept, cu);
  const tag = G.tags.find(tg => tg.dept === dept && tg.kind === 'error') || G.tags.find(tg => tg.dept === dept);
  if (tag && Math.random() < (tag.kind === 'error' ? 0.08 : 0.03)) {
    t.scanLoss += 2.5; G.sat = Math.max(0, G.sat - 0.5);
    cu.emote = '$?'; cu.emoteT = 2.5;
  }
}

// ---------- DSD vendors ----------
function updateVendors(dt) {
  for (const v of G.vendorsToday) {
    let n = RT.vendorNpcs[v.name];
    if (v.state === 'pending' && G.time >= v.time && G.time < CLOSE - 30) {
      v.state = 'waiting'; v.arrived = G.time;
      n = RT.vendorNpcs[v.name] = { x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5, fx: 0, fy: 1, path: null, mode: 'wait', v };
      setPath(n, pathToTiles(n, [MAPD.vendorSpot]) || []);
      toast(`🚚 DSD: ${v.name} is at the back door with ${v.cases} cases of ${DEPT[v.dept].name}. Check them in!`, 'info');
    }
    if (v.state === 'waiting' && G.time - v.arrived > VENDOR_PATIENCE) {
      v.state = 'left'; G.today.vendorsMissed++; G.sat = Math.max(0, G.sat - 2);
      mail(v.name, 'Missed delivery', `We waited ${VENDOR_PATIENCE} minutes at your back door and nobody checked us in. ${v.cases} cases of ${DEPT[v.dept].name} were not delivered today.`);
      toast(`${v.name} gave up waiting and left. ${v.cases} cases not delivered.`, 'bad');
      if (n) { n.mode = 'exit'; setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []); }
    }
    if (!n) continue;
    if (n.path) { if (moveAlong(n, dt, 2.6)) n.path = null; else continue; }
    if (n.mode === 'toAisle') {
      for (let i = 0; i < v.cases; i++) stockUnits(v.dept, DEPT[v.dept].upc);
      v.state = 'done'; n.mode = 'exit';
      setPath(n, pathToTiles(n, [MAPD.staffDoor]) || []);
    } else if (n.mode === 'exit') delete RT.vendorNpcs[v.name];
  }
}

function checkInVendor(v, byPlayer) {
  vendorCredits(v);
  v.state = 'stocking';
  G.today.vendorsIn++;
  const n = RT.vendorNpcs[v.name];
  if (n) { n.mode = 'toAisle'; setPath(n, pathToTiles(n, MAPD.access[v.dept]) || []); }
  else { for (let i = 0; i < v.cases; i++) stockUnits(v.dept, DEPT[v.dept].upc); v.state = 'done'; }
  if (byPlayer) addXP(10, G.player);
  toast(`${v.name} checked in — stocking ${DEPT[v.dept].name}.`, 'good');
}

// =====================================================================
//  Movement helpers
// =====================================================================
function setPath(e, p) { e.path = [{ x: Math.floor(e.x), y: Math.floor(e.y) }].concat(p || []); }
function moveAlong(e, dt, speed) {
  let remain = speed * dt;
  while (remain > 0 && e.path.length) {
    const t = e.path[0], tx = t.x + 0.5, ty = t.y + 0.5;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d > 0.001) { e.fx = dx / d; e.fy = dy / d; }
    if (d <= remain) { e.x = tx; e.y = ty; remain -= d; e.path.shift(); }
    else { e.x += dx / d * remain; e.y += dy / d * remain; remain = 0; }
  }
  return e.path.length === 0;
}

// =====================================================================
//  Crew AI — each crew member runs a "plan": a list of steps.
//  Steps: {go, track?} walk to tiles · {wait,label} · {do} · {loop}
// =====================================================================
function rt(c) {
  return RT.crew[c.id] || (RT.crew[c.id] = {
    x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5, fx: 0, fy: 1, inBuilding: false, plan: null, path: null,
    carry: [], floatId: null, pallet: null, cleanups: [], progress: 0, label: '', intent: '', gobacks: [], damages: [],
  });
}
const sf = c => (0.7 + 0.12 * c.skill) * (isStar(c) ? 1.15 : 1) * moraleSpeed(c) * orderSpeed(c);
function onShift(c) {
  if (c.calledOut || c.sentHome === G.day) return false;
  const sk = curShift(c); if (!sk) return false;
  const s = SHIFTS[sk];
  return G.time >= s.start && G.time < s.end;
}

function finishPlan(c, r) {
  r.cleanups.forEach(fn => fn());
  r.cleanups = [];
  dropCrewGobacks(r); binCrewDamages(r);
  if (r.floatId) {
    const f = floatById(r.floatId);
    if (f) { f.carriedBy = null; if (f.claimedBy === c.id) f.claimedBy = null; }
    r.floatId = null;
  }
  if (r.birdId) { const b = G.birds[r.birdId]; if (b && b.carriedBy === c.id) { b.carriedBy = null; b.leftAt = G.time; b.leftDay = G.day; } if (b && b.claimedBy === c.id) b.claimedBy = null; r.birdId = null; }
  if (r.carry.length) { r.carry.forEach(backCase); r.carry = []; }
  if (r.pallet && r.pallet.empty) { G.empties.push({ id: r.pallet.id, x: r.x, y: r.y }); r.pallet = null; }
  if (r.pallet) {
    if (G.phase === 'night') G.trailer.unshift(r.pallet); else placePallet(r.pallet, freeRecvSpot(r));
    r.pallet = null;
  }
  r.plan = null; r.path = null; r.progress = 0; r.label = ''; r.intent = ''; r.onBreak = false;
}

function runPlan(c, r, dt) {
  if (r.hold > 0) { r.hold -= dt; r.label = 'Being coached'; r.progress = 0; return; }
  const s = r.plan[0];
  if (!s) return finishPlan(c, r);
  if (s.go) {
    if (!r.path) {
      const tiles = s.go();
      if (!tiles || !tiles.length) return finishPlan(c, r);
      const p = pathToTiles(r, tiles);
      if (!p) return finishPlan(c, r);
      setPath(r, p);
      if (s.track) { const t = s.track(); s._tgt = t ? { x: t.x, y: t.y } : null; }
    }
    if (s.track) {
      const t = s.track();
      if (!t) return finishPlan(c, r);
      if (s._tgt && dist(t, s._tgt) > 1.5) { r.path = null; return; }
    }
    if (moveAlong(r, dt, 3.0 * sf(c) * (r.floatId || r.pallet ? 0.8 : 1))) { r.path = null; r.plan.shift(); }
  } else if (s.wait != null) {
    s._t = (s._t || 0) + dt * sf(c);
    r.label = s.label; r.progress = s._t / s.wait;
    if (s._t >= s.wait) { r.progress = 0; r.plan.shift(); }
  } else if (s.do) {
    const res = s.do();
    r.plan.shift();
    if (res === false) return finishPlan(c, r);
    if (Array.isArray(res)) r.plan.unshift(...res);
  } else if (s.loop) {
    if (s.loop(dt)) r.plan.shift();
  }
}

function goEnt(getter) {
  return {
    go: () => {
      const e = getter(); if (!e) return null;
      const ex = Math.floor(e.x), ey = Math.floor(e.y);
      const ring = tilesAround(e, 1).filter(t => !(t.x === ex && t.y === ey));
      return ring.length ? ring : tilesAround(e, 1);
    },
    track: getter,
  };
}

function takeCases(p, dept, n) {
  const out = [];
  for (let i = p.cases.length - 1; i >= 0 && out.length < n; i--) if (p.cases[i].d === dept) out.push(p.cases.splice(i, 1)[0]);
  crushCheck(out, p, false);
  cardboard(out.length);
  if (!p.cases.length) removeEmptyPallets();
  return out;
}

function planBreakdown(c, r, only) {
  let best = null;
  for (const p of G.pallets) {
    const counts = {};
    for (const cs of p.cases) counts[cs.d] = (counts[cs.d] || 0) + 1;
    for (const dept in counts) {
      if (only && !only.includes(dept)) continue;
      const f = floatOf(dept);
      if (!f || (f.carriedBy && f.carriedBy !== 'player') || f.claimedBy) continue;
      const room = FLOAT_CAP - f.cases.length - f.incoming;
      if (room <= 0) continue;
      const score = counts[dept] + (DEPT[dept].cold ? 60 : 0) - dist(r, p) * 0.5 + rand(0, 3);
      if (!best || score > best.score) best = { p, dept, f, score, n: Math.min(CARRY_CAP, counts[dept], room) };
    }
  }
  if (!best) return null;
  const { p, dept, f, n } = best;
  let reserved = n;
  f.incoming += n;
  r.cleanups.push(() => { f.incoming = Math.max(0, f.incoming - reserved); reserved = 0; });
  r.intent = `Breaking down ${DEPT[dept].name}`;
  return [
    goEnt(() => (G.pallets.includes(p) ? p : null)),
    { wait: 0.9, label: 'Breaking down' },
    { do: () => { const taken = takeCases(p, dept, n); if (!taken.length) return false; r.carry = taken; return true; } },
    goEnt(() => f),
    { wait: f.crooked ? 1.0 : 0.4, label: f.crooked ? 'Building float (crooked, slow)' : 'Building float' },
    { do: () => {
      if ((f.claimedBy && f.claimedBy !== c.id) || dist(r, f) > 2.5) return false;
      if (r.carry.length && rollMistake(c, 'sort', 0.22)) {
        const others = G.floats.filter(o => o !== f && !o.carriedBy);
        if (others.length) { const cs = r.carry.pop(); cs.mis = true; pick(others).cases.push(cs); }
      }
      f.cases.push(...r.carry); r.carry = [];
      f.incoming = Math.max(0, f.incoming - reserved); reserved = 0;
      return true;
    } },
  ];
}

function planFreight(c, r, only, readyMin) {
  const cands = G.floats.filter(f => f.cases.length && !f.carriedBy && !f.claimedBy && !(f.incoming > 0) && (!only || only.includes(f.dept)) &&
    (f.cases.length >= readyMin || palletCases(f.dept) === 0 || f.cases.length >= FLOAT_CAP - 3 || G.time >= 660));
  if (!cands.length) return null;
  const score = f => f.cases.length + (DEPT[f.dept].cold ? 30 : 0);
  const f = cands.sort((a, b) => score(b) - score(a))[0];
  const dept = f.dept;
  f.claimedBy = c.id;
  r.cleanups.push(() => { if (f.claimedBy === c.id) f.claimedBy = null; });
  r.intent = `Pushing ${DEPT[dept].name} freight`;
  let t = 0;
  return [
    goEnt(() => f),
    { do: () => { if (f.carriedBy) return false; f.carriedBy = c.id; r.floatId = f.id; return true; } },
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Working freight';
      if (!f.cases.length || !canStock(dept)) { r.progress = 0; return true; }
      t += dt * sf(c); r.progress = t;
      if (t >= 1) {
        t = 0; const cs = f.cases.pop();
        if (cs.mis) { backCase(cs); floater(r.x, r.y - 1, 'Mis-sort! To backstock', '#ff9f6b'); } else stockCase(cs);
      }
      return false;
    } },
    { do: () => { if (rollMistake(c, 'stock', 0.12)) dropTrash(r); return true; } },
    { do: () => (f.cases.length ? [goEnt(() => birdOf(dept)), { wait: 1.2, label: 'Backstocking overflow' }, { do: () => { floatToBack(f); return true; } }] : true) },
    { go: () => tilesAround({ x: f.homeX, y: f.homeY }, 1).filter(tl => !(tl.x === Math.floor(f.homeX) && tl.y === Math.floor(f.homeY))) },
    { do: () => { f.carriedBy = null; r.floatId = null; f.x = f.homeX; f.y = f.homeY; f.claimedBy = null; knockFloat(f, c); return true; } },
  ];
}

function planReplen(c, r, only, threshold) {
  const cands = DEPTS.filter(d => (!only || only.includes(d.id)) && G.stock[d.id].back > 0 && shelfPct(d.id) < threshold && !RT.replenClaim[d.id]);
  if (!cands.length) return null;
  const d = cands.sort((a, b) => shelfPct(a.id) - shelfPct(b.id))[0], dept = d.id;
  RT.replenClaim[dept] = c.id;
  r.cleanups.push(() => { if (RT.replenClaim[dept] === c.id) delete RT.replenClaim[dept]; });
  r.intent = `Filling holes in ${d.name}`;
  let t = 0;
  return [
    goEnt(() => birdOf(dept)),
    { wait: 1.0, label: 'Pulling backstock' },
    { do: () => {
      const s = G.stock[dept];
      let u = Math.min(s.back, d.capU - s.shelf, d.upc * 4);
      if (u <= 0) return false;
      s.back -= u;
      while (u > 0) { const k = Math.min(d.upc, u); r.carry.push({ d: dept, item: 'Backstock', u: k }); u -= k; }
      return true;
    } },
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Filling holes';
      if (!r.carry.length) { r.progress = 0; return true; }
      t += dt * sf(c); r.progress = t / 0.8;
      if (t >= 0.8) { t = 0; const cs = r.carry.pop(); stockCase(cs); }
      return false;
    } },
    { do: () => { if (rollMistake(c, 'stock', 0.08)) dropTrash(r); return true; } },
  ];
}

function planDSD(c, r) {
  const v = G.vendorsToday.find(x => x.state === 'waiting' && !x.claimedBy && RT.vendorNpcs[x.name]);
  if (!v) return null;
  v.claimedBy = c.id;
  r.cleanups.push(() => { if (v.claimedBy === c.id) v.claimedBy = null; });
  r.intent = `Checking in ${v.name}`;
  return [
    goEnt(() => (v.state === 'waiting' ? RT.vendorNpcs[v.name] : null)),
    { wait: 2.5, label: 'Checking in vendor' },
    { do: () => {
      if (v.state !== 'waiting') return false;
      if (v.cases > 1 && rollMistake(c, 'dsd', 0.3)) { const short = Math.min(2, v.cases - 1); v.cases -= short; G.today.shrink += short * DEPT[v.dept].upc * DEPT[v.dept].price * 0.6; G.ohErr[v.dept] += short * DEPT[v.dept].upc; }
      checkInVendor(v, false); return true;
    } },
  ];
}

function planPrice(c, r) {
  const open = G.tags.filter(t => !t.claimedBy && tagReady(t));
  if (!open.length) return null;
  const tc = t => ({ x: t.x + 0.5, y: t.y + 0.5 });
  const tag = open.sort((a, b) => dist(r, tc(a)) - dist(r, tc(b)))[0];
  tag.claimedBy = c.id;
  r.cleanups.push(() => { if (tag.claimedBy === c.id) tag.claimedBy = null; });
  r.intent = tag.kind === 'error' ? 'Fixing a scan error' : 'Hanging price tags';
  return [
    { go: () => tilesAround(tc(tag), 1) },
    { wait: 2.2, label: tag.kind === 'error' ? 'Fixing scan error' : 'Hanging tag' },
    { do: () => {
      if (!G.tags.includes(tag)) return false;
      if (tag.kind !== 'error' && rollMistake(c, 'price', 0.25)) { tag.kind = 'error'; return true; }
      fixTag(tag, false); return true;
    } },
  ];
}

// Face an aisle: pull every item to the front edge until it's 99% faced.
function planFace(c, r, dept) {
  RT.faceClaim = RT.faceClaim || {};
  if (faceOf(dept) >= 97 || RT.faceClaim[dept] || coolerBlocked(dept)) return null;
  RT.faceClaim[dept] = c.id;
  r.cleanups.push(() => { if (RT.faceClaim[dept] === c.id) delete RT.faceClaim[dept]; });
  r.intent = `Facing ${DEPT[dept].aisle}`;
  return [
    { go: () => MAPD.access[dept] },
    { loop: dt => {
      r.label = 'Facing shelves';
      G.face[dept] = Math.min(100, G.face[dept] + 7 * dt * sf(c));
      r.progress = G.face[dept] / 100;
      if (G.face[dept] >= 99 || coolerBlocked(dept)) { r.progress = 0; return true; }
      return false;
    } },
  ];
}

function planUnload(c, r) {
  if (G.phase !== 'night' || !G.trailer.length) return null;
  const dock = pick(MAPD.dockTiles);
  r.intent = 'Unloading the trailer';
  return [
    { go: () => [dock] },
    { wait: 1.6, label: 'Jacking pallet' },
    { do: () => { const p = G.trailer.shift(); if (!p) return false; r.pallet = p; return true; } },
    { go: () => {
      const s = freeRecvSpot(r); if (!s) return null;
      s.reserved = c.id; r.spot = s;
      r.cleanups.push(() => { if (s.reserved === c.id) s.reserved = null; });
      return [s];
    } },
    { wait: 0.6, label: 'Dropping pallet' },
    { do: () => { r.spot.reserved = null; placePallet(r.pallet, r.spot); r.pallet = null; return true; } },
  ];
}

function planIdle(c, r) {
  const t = pick(MAPD.backroomTiles);
  r.intent = '';
  return [{ go: () => [t] }, { wait: rand(2, 4), label: '' }];
}

function brain(c, r) {
  const role = ROLES[c.role];
  switch (c.role) {
    case 'breakdown': return (backroomUrgent() ? planBackroom(c, r) : null) || planBreakdown(c, r) || planDamages(c, r) || planBackroom(c, r) || planFreight(c, r, null, 30) || planReplen(c, r, null, 0.5);
    case 'freight': return planFreight(c, r, null, 20) || planBirdRunToday(c, r) || planReplen(c, r, null, 0.6) || planBreakdown(c, r);
    case 'replen': return planBirdRunToday(c, r) || planReplen(c, r, null, 0.75) || planFreight(c, r, null, 25);
    case 'dsd': return planDSD(c, r) || planReplen(c, r, null, 0.6);
    case 'price': return planRecall(c, r) || planPrice(c, r) || planOutTag(c, r) || planCount(c, r) || planReclaim(c, r) || planReplen(c, r, null, 0.5);
    case 'unloader': return planUnload(c, r) || (backroomUrgent() ? planBackroom(c, r) : null) || planBreakdown(c, r) || planDamages(c, r) || planBackroom(c, r) || planFreight(c, r, null, 20);
    default: {
      const D = [role.dept];
      return planRecall(c, r, D) || (G.time >= 300 ? planReset(c, r, D) : null) || planReplen(c, r, D, 0.85) || planFreight(c, r, D, 6) || planBreakdown(c, r, D) || planCount(c, r, D) ||
        (backCases(role.dept) >= 3 && shelfPct(role.dept) < 0.95 ? planBirdRun(c, r, role.dept) : null) || planFace(c, r, role.dept);
    }
  }
}

function updateCrew(dt, gm) {
  for (const c of G.crew) {
    const r = rt(c), on = onShift(c);
    ensureTrain(c); trainingTick(c);
    if (on && !r.onBreak) { const pay = c.wage * otRate(c, gm) * gm / 60; if (G.phase === 'night') G.nightLabor += pay; else G.today.labor += pay; }
    if (!r.inBuilding) {
      if (r.plan) finishPlan(c, r);
      if (on) { r.inBuilding = true; r.x = MAPD.staffDoor.x + 0.5; r.y = MAPD.staffDoor.y + 0.5; }
      continue;
    }
    if (r.plan && on && !r.onBreak && !(r.hold > 0) && r.intent !== 'Going on lunch break' && coverNeeded(c)) finishPlan(c, r);
    const shf = SHIFTS[curShift(c)], slen = shf ? shf.end - shf.start : 0;
    if (on && !r.plan && slen > 360 && c.breakDay !== G.day && G.phase === 'day' && G.time >= shf.start + slen / 2 - 30) {
      c.breakDay = G.day; r.intent = 'Going on lunch break';
      r.plan = [{ go: () => tilesAround({ x: 36.5, y: 7.5 }, 1) }, { loop: () => {
        if (!r.onBreak) { r.onBreak = true; r.breakEnd = G.time + BREAK_MIN; r.intent = 'On lunch break (unpaid)'; }
        r.label = 'On break';
        if (G.time >= r.breakEnd) { r.onBreak = false; return true; }
        return false;
      } }];
    }
    if (!r.plan) {
      if (!on) { r.intent = 'Clocking out'; r.plan = [{ go: () => [MAPD.staffDoor] }, { do: () => { r.inBuilding = false; return true; } }]; }
      else if (G.phase === 'day' && rollMistake(c, 'focus', 0.025)) { r.plan = [{ wait: 6, label: 'On their phone' }]; r.intent = 'On their phone 📱'; }
      else r.plan = orderPlan(c, r) || coverPlan(c, r) || recoveryPlan(c, r) || brain(c, r) || helpPlan(c, r) || planIdle(c, r);
    }
    runPlan(c, r, dt);
    if (r.floatId) { const f = floatById(r.floatId); if (f) { f.x = r.x + r.fx * 0.6; f.y = r.y + r.fy * 0.6; } }
    if (r.birdId) { const b = G.birds[r.birdId]; if (b && b.carriedBy === c.id) { b.x = r.x + r.fx * 0.6; b.y = r.y + r.fy * 0.6; } }
  }
}

// =====================================================================
//  Player
// =====================================================================
function blockedAt(x, y, rad) {
  for (const [ox, oy] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) if (!walkable(Math.floor(x + ox), Math.floor(y + oy))) return true;
  return false;
}
function updatePlayer(dt) {
  const p = G.player, k = RT.keys;
  let dx = ((k.ArrowRight || k.KeyD || k.PadRight || k.TouchRight) ? 1 : 0) - ((k.ArrowLeft || k.KeyA || k.PadLeft || k.TouchLeft) ? 1 : 0);
  let dy = ((k.ArrowDown || k.KeyS || k.PadDown || k.TouchDown) ? 1 : 0) - ((k.ArrowUp || k.KeyW || k.PadUp || k.TouchUp) ? 1 : 0);
  let mag = 1;
  // Analog stick (phone joystick or gamepad): any direction, push further to go faster.
  const joy = [RT.touchJoy, RT.padJoy].find(j => j && Math.hypot(j.x, j.y) > 0.2), jm = joy ? Math.hypot(joy.x, joy.y) : 0;
  if (jm > 0.2) { dx = joy.x; dy = joy.y; mag = Math.min(1, jm * 1.3); }
  if (dx || dy) {
    p.work = null;
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    p.fx = dx; p.fy = dy;
    let sp = (k.ShiftLeft || k.ShiftRight || k.PadRun || k.TouchRun) ? 6.5 : 4.2;
    if (p.floatId || p.pallet || p.birdId) sp *= 0.75;
    movePlayer(p, dx * sp * mag * dt, dy * sp * mag * dt);
  }
  if (p.work) {
    p.work.t += dt;
    if (p.work.t >= p.work.dur) {
      const w = p.work, cont = w.done();
      if (w.repeat && cont) w.t = 0; else if (p.work === w) p.work = null;
    }
  }
  // Whatever you're pushing trails smoothly in front of you.
  const follow = e => { const a = Math.min(1, dt * 18); e.x += (p.x + p.fx * 0.7 - e.x) * a; e.y += (p.y + p.fy * 0.7 - e.y) * a; };
  if (p.floatId) { const f = floatById(p.floatId); if (f) follow(f); else p.floatId = null; }
  if (p.birdId) { const b = G.birds && G.birds[p.birdId]; if (b && b.carriedBy === 'player') follow(b); else p.birdId = null; }
}
// Move with wall sliding. If a wall corner catches you while you walk straight,
// ease around it toward whichever side is open.
function movePlayer(p, mx, my) {
  const R = 0.3;
  const side = free => { for (const o of [0.12, 0.24, 0.36, 0.48]) { const a = free(o), b = free(-o); if (a !== b) return a ? 1 : -1; if (a) return 0; } return 0; };
  if (mx) {
    if (!blockedAt(p.x + mx, p.y, R)) p.x += mx;
    else if (!my) { const s = side(o => !blockedAt(p.x + mx, p.y + o, R)); if (s && !blockedAt(p.x, p.y + s * Math.abs(mx), R)) p.y += s * Math.abs(mx); }
  }
  if (my) {
    if (!blockedAt(p.x, p.y + my, R)) p.y += my;
    else if (!mx) { const s = side(o => !blockedAt(p.x + o, p.y + my, R)); if (s && !blockedAt(p.x + s * Math.abs(my), p.y, R)) p.x += s * Math.abs(my); }
  }
}
// Hold E (or the E button) to keep doing repeatable things: picking cases, sorting, stocking.
function holdRepeat(dt) {
  const k = RT.keys, p = G.player;
  if (!(k.KeyE || k.Space || k.PadA || k.TouchE) || p.work || p.away) { RT.holdT = 0; return; }
  RT.holdT = (RT.holdT || 0) + dt;
  if (RT.holdT < 0.32) return;
  RT.holdT = 0.16;
  const it = getInteraction();
  if (it && it.fn && it.rep) it.fn();
}

function nearestTile(p, test, r) {
  let best = null, bd = r;
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (y < 0 || y >= MH || x < 0 || x >= MW) continue;
    const ch = MAPD.grid[y][x];
    if (!test(ch)) continue;
    const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
    if (d <= bd) { bd = d; best = { x, y, ch }; }
  }
  return best;
}
// Closest thing within r. Things in front of you win ties over things behind you.
function nearest(list, p, r, filter) {
  let best = null, bs = Infinity;
  for (const e of list) {
    if (filter && !filter(e)) continue;
    const d = dist(e, p); if (d > r) continue;
    const face = p.fx != null && d > 0.01 ? ((e.x - p.x) * p.fx + (e.y - p.y) * p.fy) / d : 0;
    const s = d - 0.45 * face;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
const tileC = t => (t ? { x: t.x + 0.5, y: t.y + 0.5 } : null);
const inRecv = p => p.x >= 1 && p.x < 9 && p.y >= 4 && p.y < 9;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const caseLabel = c => (RT.settings.labels && c.item !== 'Backstock' ? `${c.item} [${DEPT[c.d].aisle}]` : c.item === 'Backstock' ? `Backstock ${DEPT[c.d].name}` : c.item);
function startWork(dur, label, done, repeat) { G.player.work = { t: 0, dur, label, done, repeat: !!repeat }; }

// Context-sensitive [E] action for wherever the player is standing.
// Returns { label, fn, at, rep, alt }: `at` is what gets the highlight, `rep` means
// holding E repeats it, `alt` is the second action on [Q].
function getInteraction() {
  const p = G.player;
  if (G.phase !== 'day' && G.phase !== 'night') return null;
  if (p.away) return null;
  if (p.pallet && p.pallet.empty) return backroomInteraction(p);
  const pushing = p.floatId || p.birdId;
  const shelf = nearestTile(p, ch => !!SHELF_DEPT[ch], pushing ? 1.75 : 1.3);
  const shelfDept = shelf ? SHELF_DEPT[shelf.ch] : null;
  const bird = nearest(birdList(), p, 1.45, b => !b.carriedBy);

  if (p.pallet) {
    if (inRecv(p)) return { label: 'Drop pallet in Receiving', fn: playerDropPallet };
    return { label: 'Bring the pallet to the yellow RECEIVING area', fn: null };
  }
  if (p.floatId) {
    const f = floatById(p.floatId), n = f.cases.length, d = DEPT[f.dept];
    if (shelfDept === f.dept && n) return { label: `Work ${plural(n, 'case')} onto ${d.name}`, fn: () => playerWorkFloat(f), at: tileC(shelf) };
    if (shelfDept && shelfDept !== f.dept && n) return { label: `✗ This is ${DEPT[shelfDept].name} — your float is ${d.name} (${d.aisle})`, fn: null, bad: true };
    const own = nearest(birdList(), p, 1.7, b => b.dept === f.dept && !b.carriedBy);
    if (own && n) return { label: `Backstock ${plural(n, 'overflow case')} on the ${d.aisle} bird`, fn: () => { floatToBack(f); toast(`Overflow from the ${d.name} float went on its bird.`); }, at: own };
    if (Math.hypot(p.x - f.homeX, p.y - f.homeY) < 1.6) return { label: 'Park float at its home spot', fn: () => releaseFloat(true), at: { x: f.homeX, y: f.homeY } };
    return { label: 'Let go of the float', fn: () => releaseFloat(false) };
  }
  if (p.birdId) {
    const b = G.birds[p.birdId], d = DEPT[b.dept], n = backCases(b.dept);
    if (shelfDept === b.dept && n) return canStock(b.dept) ? { label: `Work backstock onto ${d.name} (${plural(n, 'case')} on the bird)`, fn: () => playerWorkBird(b), at: tileC(shelf) } : { label: `${d.name} shelf is full`, fn: null };
    if (shelfDept && shelfDept !== b.dept) return { label: `✗ This is ${DEPT[shelfDept].name}: your bird is ${d.name} (${d.aisle})`, fn: null, bad: true };
    if (Math.hypot(p.x - b.homeX, p.y - b.homeY) < 1.6) return { label: 'Park the bird at its spot in BACKSTOCK', fn: () => releaseBird(true), at: { x: b.homeX, y: b.homeY } };
    return { label: `Let go of the ${d.aisle} bird${n ? '' : ' (empty)'}`, fn: () => releaseBird(false) };
  }
  const cf = !p.work && conflictInteraction(p);
  if (cf) return cf;
  const ev = !p.work && eventsInteraction(p, shelfDept, true);
  if (ev) return ev;
  const coachee = G.crew.find(c => c.needsCoach && RT.crew[c.id] && RT.crew[c.id].inBuilding && dist(RT.crew[c.id], p) < 1.5);
  if (coachee && !p.work) return { label: `Coach ${coachee.name}: ${TRAIN_AREAS[coachee.needsCoach.area].mistake}`, fn: () => { const rr = RT.crew[coachee.id]; if (rr) rr.hold = 2.5; startWork(2.5, 'Coaching', () => coachCrew(coachee)); }, at: RT.crew[coachee.id] };
  const trash = nearest(G.trash || [], p, 1.3);
  if (trash) return { label: 'Pick up the cardboard', fn: () => pickUpTrash(trash), at: trash, rep: true };
  if (p.gobacks && p.gobacks.length) { const gi = gobackInteraction(p, shelfDept, shelf); if (gi) return gi; }
  else if (!p.carry.length) { const gp = gobackPickup(p); if (gp) return gp; }
  const dmi = damageInteraction(p); if (dmi) return dmi;
  const pal = nearest(G.pallets, p, 1.35);
  const fl = nearest(G.floats, p, 1.4, f => !f.carriedBy);
  if (p.carry.length) {
    if (fl) { const m = p.carry.filter(c => c.d === fl.dept).length; if (m) return { label: `Sort ${plural(m, 'case')} onto the ${DEPT[fl.dept].name} float`, fn: () => playerSort(fl), at: fl, rep: true }; }
    if (shelfDept) { const m = p.carry.filter(c => c.d === shelfDept).length; if (m) return { label: `Stock ${plural(m, 'case')} on the shelf`, fn: () => playerStockCarry(shelfDept), at: tileC(shelf), rep: true }; }
    if (bird) { const m = p.carry.filter(c => c.d === bird.dept).length; if (m) return { label: `Put ${plural(m, 'case')} on the ${DEPT[bird.dept].aisle} bird`, fn: () => playerCarryToBird(bird), at: bird, rep: true }; }
    if (pal && p.carry.length < CARRY_CAP) return { label: `Pick up more (${pal.cases.length} on pallet)`, fn: () => playerPick(pal), at: pal, rep: true };
    if (fl) return { label: `✗ None of your cases go on the ${DEPT[fl.dept].name} float`, fn: () => wrongFloat(fl), bad: true };
    if (bird) return { label: `✗ None of your cases go on the ${DEPT[bird.dept].aisle} bird (${DEPT[bird.dept].name})`, fn: null, bad: true };
    return null;
  }
  const pc = nearestTile(p, ch => ch === 'C', 1.6);
  if (pc) return { label: 'Use the computer (reports, email, hiring, ordering…)', fn: () => UI.openComputer(), at: tileC(pc) };
  const vend = G.vendorsToday.find(v => v.state === 'waiting' && RT.vendorNpcs[v.name] && dist(RT.vendorNpcs[v.name], p) < 1.6);
  if (vend) return { label: `Check in ${vend.name} (${vend.cases} cs ${DEPT[vend.dept].name})`, fn: () => startWork(2, 'Checking in vendor', () => { if (vend.state === 'waiting') checkInVendor(vend, true); }), at: RT.vendorNpcs[vend.name] };
  if (G.phase === 'night' && G.trailer.length && p.y < 4.4 && p.x > 1.5 && p.x < 6.5) {
    return { label: `Pull a pallet off the trailer (${G.trailer.length} left)`, fn: () => startWork(1, 'Jacking pallet', () => { const pl = G.trailer.shift(); if (pl) G.player.pallet = pl; }) };
  }
  const br = !p.work && backroomInteraction(p);
  if (br) return br;
  const tag = nearest(G.tags.filter(tagReady).map(t => ({ x: t.x + 0.5, y: t.y + 0.5, t })), p, 1.5);
  const rci = !p.work && recallInteraction(p, shelfDept, shelf, bird, pal, fl);
  if (rci) return rci;
  const oti = !p.work && outTagInteraction(p);
  if (tag) {
    const t = tag.t, pt = { label: t.kind === 'error' ? 'Fix scan error (shelf price ≠ register)' : 'Hang price change tag', fn: () => startWork(1.5, t.kind === 'error' ? 'Fixing scan error' : 'Hanging tag', () => { if (G.tags.includes(t)) fixTag(t, true); }), at: tag };
    if (!oti) return pt;
    return dist(oti.at, p) < dist(tag, p) ? { ...oti, alt: pt } : { ...pt, alt: oti };
  }
  if (oti) return oti;
  if (pal) { const top = pal.cases[pal.cases.length - 1], same = top ? pal.cases.filter(c => c.d === top.d).length : 0; return { label: `Pick up ${same > 1 ? Math.min(same, CARRY_CAP) + ' cases' : 'a case'} (${pal.cases.length} on pallet)`, fn: () => playerPick(pal), at: pal, rep: true }; }
  if (fl) {
    if (fl.claimedBy) return { label: `${crewName(fl.claimedBy)} is about to push this float`, fn: null };
    return { label: `Push the ${DEPT[fl.dept].name} float (${plural(fl.cases.length, 'case')})`, fn: () => grabFloat(fl), at: fl };
  }
  if (bird) {
    const n = backCases(bird.dept), d = DEPT[bird.dept];
    const push = { label: `Push the ${d.aisle} bird (${plural(n, 'case')})`, fn: () => grabBird(bird), at: bird };
    const pull = n ? { label: `Carry ${Math.min(n, CARRY_CAP)} cs`, fn: () => playerPullBack(bird.dept), at: bird } : null;
    const cb = !p.work && countBackAction(bird);
    if (cb) return { ...cb, alt: { label: 'Push the bird', fn: push.fn } };
    if (shelfDept === bird.dept && n && canStock(bird.dept)) return { label: `Work backstock onto ${d.name} (${plural(n, 'case')} on the bird)`, fn: () => playerWorkBird(bird), at: bird, alt: { label: 'Push the bird', fn: push.fn } };
    return { ...push, alt: pull };
  }
  const ev2 = !p.work && eventsInteraction(p, shelfDept, false);
  if (ev2) return ev2;
  const cs = !p.work && shelfDept && countShelfAction(shelfDept, shelf);
  if (cs) { const fi = faceInteraction(shelfDept, shelf); return fi ? { ...cs, alt: fi } : cs; }
  const rsi = !p.work && shelfDept && resetInteraction(shelfDept, shelf);
  if (rsi) { const fi = faceInteraction(shelfDept, shelf); return fi ? { ...rsi, alt: fi } : rsi; }
  const mi = !p.work && moraleInteraction(p);
  const fi = !p.work && faceInteraction(shelfDept, shelf);
  if (fi) return mi ? { ...fi, alt: mi } : fi;
  const sw = !p.work && !mi && backroomInteraction(p, true);
  if (sw) return sw;
  if (mi) return mi;
  const door = { x: MAPD.staffDoor.x + 0.5, y: MAPD.staffDoor.y + 0.5 };
  if (dist(door, p) < 1.2) return { label: 'Clock out and go home', fn: () => askGoHome(), at: door };
  if (shelfDept) return { label: `${DEPT[shelfDept].aisle} · ${DEPT[shelfDept].name}: shelf ${Math.round(shelfPct(shelfDept) * 100)}% full · ${Math.round(faceOf(shelfDept))}% faced${p.gobacks && p.gobacks.length ? ` · none of your go-backs go here (${gbSummary(p.gobacks)})` : ''}`, fn: null };
  return null;
}

// One press grabs as many cases as you can carry, as long as they're for the same department.
function playerPick(pal) {
  const p = G.player, room = CARRY_CAP - p.carry.length;
  if (room <= 0 || !pal.cases.length) return;
  const first = pal.cases.pop(), got = [first];
  for (let i = pal.cases.length - 1; i >= 0 && got.length < room; i--) if (pal.cases[i].d === first.d) got.push(pal.cases.splice(i, 1)[0]);
  crushCheck(got, pal, true);
  p.carry.push(...got);
  cardboard(got.length);
  if (!pal.cases.length) removeEmptyPallets();
  floater(p.x, p.y - 0.9, caseLabel(first) + (got.length > 1 ? ` +${got.length - 1}` : ''), DEPT[first.d].color);
  SFX.pick();
}
function playerSort(f) {
  const p = G.player, m = p.carry.filter(c => c.d === f.dept);
  p.carry = p.carry.filter(c => c.d !== f.dept);
  f.cases.push(...m);
  G.today.youSorted += m.length;
  addXP(m.length, f);
  SFX.stock(m.length); comboHit(m.length, G.player);
}
function wrongFloat(fl) {
  G.today.missorts++;
  const where = G.player.carry.map(c => `${c.item} → ${DEPT[c.d].aisle} ${DEPT[c.d].name}`).join(', ');
  toast(`Wrong float! That's ${DEPT[fl.dept].name}. ${RT.settings.labels ? where : 'Check the item and think about which aisle it lives in.'}`, 'warn');
}
function playerStockCarry(dept) {
  const p = G.player;
  if (!canStock(dept)) { toast(`${DEPT[dept].name} shelf is full — put these in backstock.`, 'warn'); return; }
  const m = p.carry.filter(c => c.d === dept);
  p.carry = p.carry.filter(c => c.d !== dept);
  m.forEach(stockCase);
  G.today.youStocked += m.length;
  addXP(m.length, p);
  SFX.stock(m.length); comboHit(m.length, p);
}
function playerCarryToBack() { const p = G.player; p.carry.forEach(backCase); p.carry = []; }
function playerCarryToBird(b) {
  const p = G.player, m = p.carry.filter(c => c.d === b.dept);
  m.forEach(backCase);
  p.carry = p.carry.filter(c => c.d !== b.dept);
  SFX.drop();
}
function playerPullBack(dept) {
  const p = G.player, d = DEPT[dept], s = G.stock[dept];
  let u = Math.min(s.back, d.upc * CARRY_CAP);
  s.back -= u;
  while (u > 0) { const k = Math.min(d.upc, u); p.carry.push({ d: dept, item: 'Backstock', u: k }); u -= k; }
}
function grabFloat(f) { f.carriedBy = 'player'; G.player.floatId = f.id; }
function releaseFloat(home) {
  const f = floatById(G.player.floatId);
  if (f) { f.carriedBy = null; if (home) { f.x = f.homeX; f.y = f.homeY; } }
  G.player.floatId = null;
}
function playerWorkFloat(f) {
  startWork(0.45, 'Working freight', () => {
    if (!canStock(f.dept)) { toast(`${DEPT[f.dept].name} shelf is full — take the overflow to backstock.`, 'warn'); return false; }
    const c = f.cases.pop();
    if (!c) return false;
    stockCase(c);
    G.today.youStocked++;
    addXP(1);
    if (!f.cases.length) { toast(`Float worked! +5 XP`, 'good'); addXP(5, G.player); return false; }
    return true;
  }, true);
}
function playerDropPallet() {
  const p = G.player, s = freeRecvSpot(p);
  if (s && Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y) < 3) placePallet(p.pallet, s);
  else { p.pallet.x = p.x; p.pallet.y = p.y; G.pallets.push(p.pallet); }
  p.pallet = null;
  G.nightPallets++;
  addXP(5, p);
}

// =====================================================================
//  Save / load
// =====================================================================
function save() {
  if (!G) return;
  try {
    const s = JSON.parse(JSON.stringify(G));
    s.player.work = null;
    for (const c of G.crew) {
      const r = RT.crew[c.id];
      if (!r) continue;
      r.carry.forEach(cs => { s.stock[cs.d].back += caseUnits(cs); });
      (r.gobacks || []).forEach(g => { (s.gobacks = s.gobacks || []).push({ ...g, where: 'cart' }); });
      (r.damages || []).forEach(d => { (s.damages = s.damages || []).push({ ...d, where: 'bin', x: RECLAIM_C.x, y: RECLAIM_C.y }); });
      if (r.pallet && r.pallet.empty) s.empties.push({ id: r.pallet.id, x: r.x, y: r.y });
      else if (r.pallet) { if (s.phase === 'night') s.trailer.unshift(r.pallet); else s.pallets.push({ ...r.pallet, x: r.x, y: r.y }); }
    }
    s.floats.forEach(f => { if (f.carriedBy !== 'player') f.carriedBy = null; f.claimedBy = null; f.incoming = 0; });
    s.tags.forEach(t => { t.claimedBy = null; });
    Object.values(s.birds || {}).forEach(b => { if (b.carriedBy !== 'player') b.carriedBy = null; b.claimedBy = null; });
    (s.spills || []).forEach(x => { x.claimedBy = null; });
    if (s.cooler) s.cooler.claimedBy = null;
    s.vendorsToday.forEach(v => {
      v.claimedBy = null;
      if (v.state === 'stocking') { s.stock[v.dept].back += v.cases * DEPT[v.dept].upc; v.state = 'done'; }
    });
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) { console.warn('Save failed', e); }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (s.version !== 1) return false;
    G = s;
    applyCatalog();
    G.trash = G.trash || [];
    G.crew.forEach(c => ensureMorale(ensureTrain(c, 40)));
    ensureLabor();
    ensureBackroom();
    ensureLayout();
    ensureFacing();
    ensureCounts();
    ensureDamages();
    ensureCuts();
    ensureRecalls();
    ensureResets();
    if (G.phase === 'day' && (!G.counts || G.counts.day !== G.day)) countsStartDay();
    if (!G.list && G.phase === 'day') G.list = buildChecklist();
    RT.crew = {}; RT.customers = []; RT.vendorNpcs = {}; RT.replenClaim = {}; RT.faceClaim = {}; RT.gobackClaim = null; RT.countClaim = {}; RT.dmgClaim = null; RT.reclaimClaim = null; RT.outTagClaim = {}; RT.holeWarned = {}; RT.recallClaim = {}; RT.recallWarned = {}; RT.resetWorkers = {};
    G.vendorsToday.forEach(v => {
      if (v.state === 'waiting') RT.vendorNpcs[v.name] = { x: MAPD.vendorSpot.x + 0.5, y: MAPD.vendorSpot.y + 0.5, fx: 0, fy: 1, path: null, mode: 'wait', v };
    });
    if (G.player.floatId && !floatById(G.player.floatId)) G.player.floatId = null;
    if (G.player.birdId && !(G.birds[G.player.birdId] && G.birds[G.player.birdId].carriedBy === 'player')) G.player.birdId = null;
    if (G.player.away == null) { // a save from before you were on the schedule: start it tomorrow
      G.player.away = false;
      if (G.today) G.today.endAsked = G.today.autoIn = mgrShift(G.day);
    }
    return true;
  } catch (e) { console.warn('Load failed', e); return false; }
}

// =====================================================================
//  Boot & loop
// =====================================================================
function frame(ts) {
  const dt = Math.min(0.05, (ts - (RT.lastTs || ts)) / 1000);
  RT.lastTs = ts;
  if (G) {
    pollGamepad();
    if (!isPaused()) {
      if (G.player.away) awayStep(dt); // off the clock: the crew runs the store, time flies
      else {
        // You move and work at game speed too: one player step for every game step.
        for (let i = 0; i < G.speed; i++) {
          updatePlayer(dt);
          update(dt);
          if ((G.phase !== 'day' && G.phase !== 'night') || G.player.away) break;
        }
        holdRepeat(dt);
      }
      shiftTick();
    }
    RT.floaters.forEach(f => { f.t += dt; f.y -= dt * 0.6; });
    RT.floaters = RT.floaters.filter(f => f.t < 1.4);
    render();
    UI.frame();
  }
  requestAnimationFrame(frame);
}

function boot() {
  buildMap();
  canvas.width = MW * TILE; canvas.height = MH * TILE;
  BG = drawBG();
  const mb = document.getElementById('btn-mute'); if (mb) mb.textContent = FX.muted ? '🔇' : '🔊';
  const ver = document.getElementById('ver'); if (ver) ver.textContent = 'v' + VERSION;
  document.title = 'Grocery Practice v' + VERSION;
  if (document.fonts) document.fonts.load(PX(8)).then(() => { BG = drawBG(); }).catch(() => {});
  UI.init();
  try { RT.settings.labels = localStorage.getItem('groceryPractice.labels') === 'on'; } catch (e) { /* ignore */ }
  if (load()) UI.showContinue();
  else { newGame(); UI.showWelcome(); }
  window.addEventListener('beforeunload', () => { if (G && (G.phase === 'day' || G.phase === 'night')) save(); });
  requestAnimationFrame(frame);
}
