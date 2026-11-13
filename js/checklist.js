'use strict';
// =====================================================================
//  Daily checklist: the real floor-board routine, checked automatically.
//  Each task is { id, kind, arg, label, sub, due, mode, status }.
//    mode 'by' = done as soon as the check passes, missed if still open at `due`
//    mode 'at' = checked once at `due`
//  Plus one random stretch goal a day.
// =====================================================================
const TASK_XP = 10, LIST_BONUS_XP = 40;

function oosCount() {
  // Empty facings on the sales floor, counted the same way the shelves are drawn.
  let holes = 0;
  for (const dept in MAPD.shelfTiles) {
    const pct = shelfPct(dept);
    for (const t of MAPD.shelfTiles[dept]) holes += 9 - Math.round(clamp(pct * 1.25 - noise(t.x, t.y) * 0.35, 0, 1) * 9);
  }
  return holes;
}

function lastNightTrucks() { return TRUCK_SCHEDULE[dowOf(G.day - 1 || 7)] || []; }
function truckWorked(type) {
  return TRUCK_TYPES[type].depts.every(d => palletCases(d) === 0 && !G.floats.some(f => f.dept === d && f.cases.length));
}
function dsdAllDone() { return G.vendorsToday.every(v => v.state === 'done' || v.state === 'left' || v.state === 'stocking'); }

const TASK_CHECK = {
  shelf: a => shelfPct(a.dept) >= a.pct,
  shelves: a => a.depts.every(d => shelfPct(d) >= a.pct),
  backstock: a => G.stock[a.dept].back <= DEPT[a.dept].upc * 2 || !canStock(a.dept),
  invoices: () => (G.today.invoicesClosed || []).length >= lastNightTrucks().length + 1,
  oos: () => G.today.oosLogged != null,
  blitz: () => DEPTS.every(d => shelfPct(d.id) >= 0.4),
  adflip: () => !!G.nextAd && G.nextAd.every(d => endcapCount(d) >= 2),
  adverify: () => !!G.ad && G.ad.depts.every(d => endcapCount(d) >= 2 && shelfPct(d) >= 0.6),
  closers: () => G.crew.filter(c => curShift(c) === 'close' && !c.calledOut).length >= CLOSERS_REQUIRED,
  truck10: () => !!G.today.truckDoneAt && G.today.truckDoneAt <= 600,
  labor: a => G.today.sales > 0 && G.today.labor / G.today.sales * 100 <= a.pct,
  coach: a => (G.today.coached || 0) >= a.n,
  noOuts: a => !(G.today.lost[a.dept] > 0),
  clean: () => !(G.trash || []).length,
  codes: a => !codesNeedWork(a.dept),
  swept: a => sweptAfter(a.after),
  empties: () => !G.empties.length,
  floatsStraight: () => !crookedFloats().length,
  birds: () => !birdsOnFloor().length,
  faced: a => G.time >= (a.from || 0) && facedAll(a.pct),
  gobacks: a => (G.gobacks || []).length <= (a.max || 0) && !coldGobacks().length,
  forecast: () => { const f = G.fc && G.fc[weekOf(G.day) + 1]; return !!f && f.by === 'you'; },
  schedule: () => { const s = G.sched && G.sched[weekOf(G.day) + 1]; return !!s && s.posted && s.postedBy === 'you'; },
};

function buildChecklist() {
  const L = [], dow = dowOf(G.day);
  const add = (id, kind, label, sub, due, mode, arg) => L.push({ id, kind, label, sub: sub || '', due, mode, arg: arg || {}, status: 'open' });
  add('water', 'shelf', 'Water pallets run (Aisle 2 beverage)', 'Shelf 90% full before doors open', OPEN, 'by', { dept: 'A2', pct: 0.9 });
  add('paper', 'shelf', 'Paper pallets run (Aisle 4 paper)', 'Shelf 90% full before doors open', OPEN, 'by', { dept: 'A4', pct: 0.9 });
  add('codes', 'codes', 'Dairy code check', 'Pull expired, mark down short-dated, rotate oldest to the front (E at the dairy shelf)', 600, 'by', { dept: 'DAI' });
  (BACKSTOCK_RUNS[dow] || []).forEach(d => add('bs-' + d, 'backstock', `Backstock run: ${DEPT[d].aisle} birds`, 'Work backstock to the shelf by noon', 720, 'by', { dept: d }));
  const trucks = lastNightTrucks();
  add('invoices', 'invoices', `Invoices closed: ${trucks.join(', ')} + DSD`, 'Office computer → Today. A truck closes once its freight is worked', 1370, 'by');
  if (dow === 'Mon') add('forecast', 'forecast', 'Forecast next week', `Office computer → Labor. Window closes ${fmtTime(FORECAST_CUTOFF)}`, FORECAST_CUTOFF, 'by');
  if (dow === 'Thu') add('schedule', 'schedule', 'Post next week\'s schedule', 'Check it against labor demand first (Schedule + Labor tabs)', SCHED_CUTOFF, 'by');
  if (dow === 'Mon' && G.nextAd) add('adplan', 'adflip', 'Plan spots for tomorrow\'s ad chart', `New ad: ${G.nextAd.map(d => DEPT[d].name).join(' & ')}`, 1375, 'at');
  if (dow === 'Tue' && G.nextAd) add('adflip', 'adflip', 'Ad flip tonight', `Set 2 endcaps each for ${G.nextAd.map(d => DEPT[d].name).join(' & ')} before close`, 1375, 'at');
  if (dow === 'Wed' && G.ad) add('adverify', 'adverify', 'Verify the new ad', 'Ad endcaps up and those shelves 60%+ by noon', 720, 'at');
  if (['Fri', 'Sat', 'Sun'].includes(dow)) BLITZ_TIMES.forEach(t => add('blitz-' + t, 'blitz', `Blitz ${fmtTime(t)}`, 'Every department 40%+', t, 'at'));
  add('face5', 'faced', 'Recovery at 5 PM: face every aisle', 'Every aisle 85%+ faced between 5 and 6 PM, before the dinner rush', 1080, 'by', { pct: FACE_GOOD, from: 1020 });
  add('dairy6', 'shelf', 'Dairy hole check (6 PM)', 'Dairy 80%+ at 6:00 PM', 1080, 'at', { dept: 'DAI', pct: 0.8 });
  if (maxCrew() >= 6) add('closers', 'closers', `${CLOSERS_REQUIRED} closers on the schedule`, 'Store rule: 3 grocery closers a night', 840, 'at');
  add('closerun', 'shelves', 'Close run: water, milk, eggs, ice', 'Beverage, dairy and frozen 85%+ at 10:45 PM', 1365, 'at', { depts: ['A2', 'DAI', 'FRZ'], pct: 0.85 });
  add('faceclose', 'faced', 'Close recovery: face every aisle', 'Every aisle 85%+ faced at 10:50 PM', 1370, 'at', { pct: FACE_GOOD });
  add('gobacks', 'gobacks', 'Go-backs worked', 'Go-back cart and strays cleared at 10:50 PM (2 or fewer, nothing cold)', 1370, 'at', { max: 2 });
  add('sweep-mid', 'swept', 'Mid-day backroom sweep', 'E anywhere in the backroom, between 11 AM and 3 PM', 900, 'by', { after: 660 });
  add('birds', 'birds', 'No birds on the sales floor', 'Every bird is parked in BACKSTOCK and nothing overflows (checked at 2 PM)', 840, 'at');
  add('empties', 'empties', 'Empty pallets stacked in reload staging', 'Nothing left on the receiving spots at close', 1375, 'at');
  add('floats', 'floatsStraight', 'Float staging straight', 'Every float square on its home spot at close', 1375, 'at');
  add('sweep-close', 'swept', 'End-of-day backroom sweep', 'Sweep after 9 PM', 1378, 'by', { after: 1260 });
  add('backroom', 'clean', 'Backroom cleaned and organized', 'No cardboard left on the floor at close', 1375, 'at');
  add('oos', 'oos', 'Out-of-stock count logged', `Office computer → Today, after bills close (goal ${OOS_GOAL} or less)`, 1378, 'by');
  // one stretch goal
  const stretch = pick([
    ['s-truck10', 'truck10', 'Stretch: truck worked by 10:00 AM', '', 600, 'by', {}],
    ['s-labor', 'labor', 'Stretch: labor 11% or less', 'Checked at close', 1376, 'at', { pct: 11 }],
    ['s-coach', 'coach', 'Stretch: coach 2 crew members', '', 1376, 'by', { n: 2 }],
    ['s-dairy', 'noOuts', 'Stretch: no customer finds Dairy empty', 'Checked at close', 1376, 'at', { dept: 'DAI' }],
    ['s-frz', 'noOuts', 'Stretch: no customer finds Frozen empty', 'Checked at close', 1376, 'at', { dept: 'FRZ' }],
  ]);
  add(...stretch);
  L[L.length - 1].stretch = true;
  return L;
}

function listTick() {
  if (!G.list) return;
  for (const t of G.list) {
    if (t.status !== 'open') continue;
    const ok = !!TASK_CHECK[t.kind](t.arg);
    if (t.mode === 'by' && ok) finishTask(t, true);
    else if (G.time >= t.due) finishTask(t, t.mode === 'at' ? ok : false);
  }
}
function finishTask(t, ok) {
  t.status = ok ? 'done' : 'missed';
  if (ok) {
    addXP(t.stretch ? 25 : TASK_XP, G.player);
    toast(`✅ ${t.label}`, 'good');
    if (G.list.every(x => x.status === 'done')) {
      addXP(LIST_BONUS_XP, G.player);
      toast(`📋 Day complete: every task checked off! +${LIST_BONUS_XP} XP`, 'gold');
      confetti(G.player.x, G.player.y, 70);
    }
  } else toast(`✗ Missed: ${t.label}`, 'bad');
}
function listProgress() { const L = G.list || []; return { done: L.filter(t => t.status === 'done').length, total: L.length }; }

// Office computer actions
function closeInvoice(type) {
  G.today.invoicesClosed = G.today.invoicesClosed || [];
  if (G.today.invoicesClosed.includes(type)) return;
  G.today.invoicesClosed.push(type);
  toast(`Invoice closed: ${type}.`, 'good');
}
function logOOS() {
  const n = oosCount();
  G.today.oosLogged = n;
  G.oosLog = (G.oosLog || []).concat([{ day: G.day, n }]).slice(-60);
  toast(`Out-of-stock count logged: ${n} ${n <= OOS_GOAL ? '(goal met)' : `(goal ${OOS_GOAL})`}.`, n <= OOS_GOAL ? 'good' : 'warn');
}
