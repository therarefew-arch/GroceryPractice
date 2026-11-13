'use strict';
// =====================================================================
//  Labor: weekly schedules, the Monday forecast, labor demand and the
//  Labor Demand Exception report.
//  - Store weeks run Saturday to Friday.
//  - Monday: forecast NEXT week's sales (window closes 5 PM). Labor demand
//    for that week is earned from your forecast.
//  - Thursday: post NEXT week's schedule (window closes 5 PM). After it is
//    posted, every change upsets the person you change.
//  - Over 40 paid hours in a week is overtime (1.5x).
// =====================================================================
const FORECAST_CUTOFF = 17 * 60;   // Monday 5:00 PM
const SCHED_CUTOFF = 17 * 60;      // Thursday 5:00 PM
const OT_WEEKLY_MIN = 40 * 60;
const DAY1_DATE = Date.UTC(2026, 10, 14); // Day 1 is Saturday 11/14/2026
const OFF = 'off';
const OFF_PAIRS = [[2, 3], [4, 5], [3, 4], [2, 5], [3, 5], [2, 4]]; // Mon/Tue, Wed/Thu, ... (weekends are busy)
// You (the store manager) have a row too. Default: opens, off Tuesday and Wednesday.
const MGR = 'mgr';
const MGR_DEFAULT = ['open', 'open', 'open', OFF, OFF, 'open', 'open'];

// Game-scale labor standards (the game moves ~150–300 cases a day, not 1,500).
const STD = {
  dryCPH: 18,      // HV/LV/KeHe cases per labor hour: unload, break down, push, work
  coldCPH: 14,     // dairy / frozen cases per hour
  dairyDaily: 1.5, // code check, rotation, hole check
  frozenDaily: 1,
  dsdPerVendor: 0.5,
  rplnUnitsPH: 350, // units sold per replenishment hour
  rplnMin: 3,
  recovery: 1.5,
  countHrs: 0.4,    // per cycle count (shelf + backstock)    // facing and go-backs at 5 PM and close
  tagHrs: 0.25,     // per price change tag
  adFlip: 3,        // Tue night
  adVerify: 1,      // Wed
};
// Report rows. `roles` = game crew roles whose scheduled hours count here.
const LD_ROWS = [
  { key: 'dairy', name: 'GR-Dairy', roles: ['dairy'] },
  { key: 'dsd', name: 'GR-DSD Receiving', roles: ['dsd'] },
  { key: 'frozen', name: 'GR-Frozen', roles: ['frozen'] },
  { key: 'truck', name: 'GR-HV-LV-DSD', roles: ['breakdown', 'freight', 'hbc', 'unloader'] },
  { key: 'rpln', name: 'GR-HV-LV-DSD-RPLN', roles: ['replen'] },
  { key: 'liquor', name: 'GR-Liquor', roles: [] },
  { key: 'scan', name: 'GR-Scan Price', roles: ['price'] },
];
const LD_WEEKLY = [
  [{ key: 'mgr', name: 'GR-Mgr' }, { key: 'pog', name: 'GR-POG Imp/Inv/Periodic Clean' }],
  [{ key: 'fs', name: 'GR-FS Sampling' }, { key: 'misc', name: 'GR-Misc' }, { key: 'train', name: 'GR-Train' }],
];
const roleRow = role => (LD_ROWS.find(r => r.roles.includes(role)) || LD_ROWS[3]).key;

// ---------- dates ----------
function dateOf(day) { const d = new Date(DAY1_DATE + (day - 1) * 864e5); return { m: d.getUTCMonth() + 1, d: d.getUTCDate(), y: d.getUTCFullYear() }; }
function fmtMD(day) { const t = dateOf(day); return `${t.m}/${t.d}`; }
function fmtMDY(day) { const t = dateOf(day); return `${String(t.m).padStart(2, '0')}/${String(t.d).padStart(2, '0')}/${t.y}`; }
const weekStart = w => (w - 1) * 7 + 1;

// ---------- shifts & schedules ----------
function paidMin(sk) {
  const s = SHIFTS[sk]; if (!s) return 0;
  const len = s.end - s.start;
  return len > 360 ? len - BREAK_MIN : len;
}
function defaultRow(c, idx) {
  const off = OFF_PAIRS[(idx != null ? idx : G.crew.indexOf(c)) % OFF_PAIRS.length];
  return WEEKDAYS.map((_, i) => off.includes(i) ? OFF : c.shift);
}
// The schedule for a week. Missing weeks are built from last week (or usual shifts).
function schedFor(w) {
  G.sched = G.sched || {};
  let s = G.sched[w];
  const prev = G.sched[w - 1];
  if (!s) {
    s = G.sched[w] = { posted: false, rows: {} };
    G.crew.forEach((c, i) => { s.rows[c.id] = prev && prev.rows[c.id] ? prev.rows[c.id].slice() : defaultRow(c, i); });
  }
  G.crew.forEach((c, i) => { if (!s.rows[c.id]) s.rows[c.id] = defaultRow(c, i); });
  if (!s.rows[MGR]) s.rows[MGR] = prev && prev.rows[MGR] ? prev.rows[MGR].slice() : MGR_DEFAULT.slice();
  return s;
}
function schedOf(c, day) {
  const s = G.sched && G.sched[weekOf(day)];
  const row = s && s.rows[c.id];
  if (!row) return c.shift;
  const v = row[dowIdx(day)];
  return v === OFF ? null : v;
}
const curShift = c => schedOf(c, G.day);
// Hire mid-week: schedule them this week (from today) and next week.
function schedNewHire(c) {
  const w = weekOf(G.day);
  [w, w + 1].forEach(wk => {
    if (!G.sched || !G.sched[wk]) return;
    const row = defaultRow(c);
    if (wk === w) for (let i = 0; i < dowIdx(G.day); i++) row[i] = OFF;
    G.sched[wk].rows[c.id] = row;
  });
  c.hired = G.day;
}
// Changing a cell. Changes to a posted schedule (from today on) cost morale.
function setSched(w, id, i, v) {
  if (id === MGR) return setMgrSched(w, i, v);
  const s = schedFor(w), c = G.crew.find(x => x.id === id); if (!c) return;
  const row = s.rows[id], cw = weekOf(G.day);
  if (w < cw || (w === cw && i < dowIdx(G.day))) return; // the past is the past
  if (row[i] === v) return;
  const today = w === cw && i === dowIdx(G.day);
  if (s.posted && (c.days || 0) > 0) bump(c, today ? -6 : -4, 'schedule');
  row[i] = v;
  if (today) { const r = RT.crew[c.id]; if (r && r.plan) finishPlan(c, r); }
}
// Your own row: no morale cost, and today can change (you'll clock in or go home to match).
function setMgrSched(w, i, v) {
  const s = schedFor(w), cw = weekOf(G.day);
  if (w < cw || (w === cw && i < dowIdx(G.day))) return;
  s.rows[MGR][i] = v;
}
// Salaried: a manager's shift counts in full (no unpaid lunch).
const mgrShiftMin = sk => (sk && sk !== OFF && SHIFTS[sk] ? SHIFTS[sk].end - SHIFTS[sk].start : 0);
const mgrPaidMin = w => sum((schedFor(w).rows[MGR] || []).map(mgrShiftMin));
function mgrShift(day) {
  const s = G.sched && G.sched[weekOf(day)], v = s && s.rows[MGR] ? s.rows[MGR][dowIdx(day)] : 'open';
  return v === OFF || !SHIFTS[v] ? null : v;
}
function postSchedule(w) {
  const s = schedFor(w);
  if (s.posted) return;
  s.posted = true; s.postedDay = G.day; s.postedBy = 'you';
  toast(`🗓 Week ${w} schedule posted.`, 'good');
}
function weekPaidMin(w, c) {
  const s = schedFor(w); const row = s.rows[c.id] || [];
  return sum(row.map(v => v === OFF ? 0 : paidMin(v)));
}
// Paid minutes so far this week, for overtime.
function otRate(c, gm) {
  const w = weekOf(G.day);
  if (!c.wk || c.wk.w !== w) c.wk = { w, min: 0 };
  c.wk.min += gm;
  return c.wk.min > OT_WEEKLY_MIN ? 1.5 : 1;
}

// ---------- forecast ----------
// A week's forecast: base units per dept (snapshot), the system's daily sales,
// and your adjustment per day in percent.
function makeForecast(w, lockNow) {
  G.fc = G.fc || {};
  if (G.fc[w]) return G.fc[w];
  const base = {}; DEPTS.forEach(d => { base[d.id] = forecastUnits(d.id); });
  const f = { w, base, adj: [0, 0, 0, 0, 0, 0, 0], locked: !!lockNow, by: lockNow ? 'system' : null };
  f.sys = WEEKDAYS.map((_, i) => fcSales(f, weekStart(w) + i, true));
  return (G.fc[w] = f);
}
function fcFor(day) { return G.fc && (G.fc[weekOf(day)] || G.fc[weekOf(day) - 1]); }
function fcUnits(dept, day, f, sys) {
  f = f || fcFor(day);
  if (!f) return forecastFor(dept, day);
  const a = sys || weekOf(day) !== f.w ? 0 : f.adj[dowIdx(day)];
  return f.base[dept] * dowFactor(day) * (1 + a / 100);
}
function fcSales(f, day, sys) { return sum(DEPTS.map(d => fcUnits(d.id, day, f, sys) * d.price)); }
function lockForecast(w, by) {
  const f = G.fc && G.fc[w]; if (!f || f.locked) return;
  f.locked = true; f.by = by; f.lockedDay = G.day;
  if (by === 'you') toast(`📈 Week ${w} forecast submitted. Labor demand is set.`, 'good');
}
const forecastOpen = () => G.phase === 'day' && dowOf(G.day) === 'Mon' && G.time < FORECAST_CUTOFF && G.fc && G.fc[weekOf(G.day) + 1] && !G.fc[weekOf(G.day) + 1].locked;

// ---------- labor demand ----------
function truckCasesFc(dept, day) {
  const td = day - 1;
  if (td < 1 || !deptOnTruck(dept, td)) return 0;
  const cover = coverDaysFor(dept, td);
  let u = 0; for (let k = 1; k <= cover; k++) u += fcUnits(dept, td + k);
  return u / DEPT[dept].upc;
}
function dayDemand(day) {
  const cases = id => truckCasesFc(id, day);
  const dry = sum(DEPTS.filter(d => !d.cold).map(d => cases(d.id)));
  const units = sum(DEPTS.map(d => fcUnits(d.id, day)));
  const dow = dowOf(day), tags = 4 + (day % 3) * 2;
  return {
    dairy: cases('DAI') / STD.coldCPH + STD.dairyDaily,
    dsd: VENDORS.length * STD.dsdPerVendor,
    frozen: cases('FRZ') / STD.coldCPH + STD.frozenDaily,
    truck: dry / STD.dryCPH,
    rpln: Math.max(STD.rplnMin, units / STD.rplnUnitsPH) + STD.recovery,
    liquor: 0,
    scan: tags * STD.tagHrs + COUNT_PER_DAY * STD.countHrs + (dow === 'Tue' ? STD.adFlip : 0) + (dow === 'Wed' ? STD.adVerify : 0),
  };
}
function weeklyDemand(w) {
  const sea = typeof seasonOfWeek === 'function' && seasonOfWeek(w);
  const ws = weekStart(w), we = ws + 6;
  const newbies = G.crew.filter(c => c.hired && c.hired >= ws - 3 && c.hired <= we).length;
  return { mgr: 45, pog: 3 + (sea ? 2 : 0), fs: sea ? 4 : 2, misc: 7, train: newbies * 4 };
}
function scheduledByRow(w) {
  const s = schedFor(w), out = {};
  LD_ROWS.forEach(r => { out[r.key] = [0, 0, 0, 0, 0, 0, 0]; });
  G.crew.forEach(c => {
    const row = s.rows[c.id]; if (!row) return;
    row.forEach((v, i) => { if (v !== OFF) out[roleRow(c.role)][i] += paidMin(v) / 60; });
  });
  return out;
}
const r2 = n => Math.round(n * 4) / 4; // the real report rounds to quarter hours
function exceptionReport(w) {
  const ws = weekStart(w), dm = {}, sc = scheduledByRow(w);
  LD_ROWS.forEach(r => { dm[r.key] = []; });
  for (let i = 0; i < 7; i++) { const d = dayDemand(ws + i); LD_ROWS.forEach(r => dm[r.key].push(r2(d[r.key]))); }
  const rows = [];
  const tot = a => sum(a);
  const sub = [[0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]];
  LD_ROWS.forEach(r => {
    const s = sc[r.key].map(r2);
    rows.push({ name: r.name, dmd: dm[r.key], sch: s, tD: tot(dm[r.key]), tS: tot(s) });
    for (let i = 0; i < 7; i++) { sub[0][i] += dm[r.key][i]; sub[1][i] += s[i]; }
  });
  let run = { dmd: sub[0], sch: sub[1], tD: tot(sub[0]), tS: tot(sub[1]) };
  rows.push({ name: 'Sub Total', total: true, ...run });
  const wk = weeklyDemand(w), mgrSched = r2(mgrPaidMin(w) / 60);
  LD_WEEKLY.forEach((sec, si) => {
    sec.forEach(r => {
      const s = r.key === 'mgr' ? mgrSched : 0;
      rows.push({ name: r.name, weekly: true, tD: wk[r.key], tS: s });
      run = { ...run, tD: run.tD + wk[r.key], tS: run.tS + s };
    });
    rows.push({ name: si === 0 ? 'Sub Total' : 'Grand Total', total: true, weeklyTot: true, ...run });
  });
  return { w, from: ws, to: ws + 6, rows, fc: G.fc && G.fc[w] };
}
const ldNum = n => n < 0 ? `(${Math.abs(n).toFixed(2)})` : n.toFixed(2);
const ldFlag = (d, s) => Math.abs(s - d) > 2 || (d > 0 && Math.abs(s - d) / d > 0.1);

// ---------- day hooks ----------
function ensureLabor() {
  const w = weekOf(G.day);
  if (!G.fc || !G.fc[w]) makeForecast(w, true);
  schedFor(w).posted = true;
}
function laborStartDay() {
  ensureLabor();
  const w = weekOf(G.day), dow = dowOf(G.day);
  if (dow === 'Mon') {
    makeForecast(w + 1, false);
    const sea = typeof seasonOfWeek === 'function' && seasonOfWeek(w + 1);
    mail('District Manager', `Forecast week ${w + 1} by ${fmtTime(FORECAST_CUTOFF)} today`,
      [`It's Monday: forecast next week (${fmtMD(weekStart(w + 1))} to ${fmtMD(weekStart(w + 1) + 6)}) by ${fmtTime(FORECAST_CUTOFF)}. Office computer → Labor.`,
        '',
        'The system forecast is last week\'s average times the day-of-week pattern. It does NOT know about:',
        sea ? `  • ${sea.name} next week (it lifts ${Object.keys(sea.lift).map(d => DEPT[d].name).join(', ')}${sea.days ? ', mostly ' + sea.days.join('/') : ''})` : '  • anything special next week (no seasonal event this time)',
        '  • the new ad chart, weather, or anything you know about your customers',
        '',
        'Why it matters: your forecast earns your labor demand. Forecast low and you won\'t have the hours to run the store. Forecast high and you\'ll staff to sales that never come. I grade the forecast against what actually sells.',
        `If you miss the window, the system forecast goes in as-is. Then write next week's schedule and post it by Thursday ${fmtTime(SCHED_CUTOFF)}.`].join('\n'));
  }
  if (dow === 'Thu') {
    schedFor(w + 1);
    mail('District Manager', `Post week ${w + 1}'s schedule by ${fmtTime(SCHED_CUTOFF)}`,
      `Next week's schedule posts today at ${fmtTime(SCHED_CUTOFF)}. Check it against your Labor Demand Exception report before you post (Office computer → Schedule and → Labor).\nAny row off by more than 2 hours or 10% is an exception you need to be able to explain.\nWhy post on time: people plan their lives around it. Changes after it's posted cost you trust.`);
  }
}
function laborTick() {
  if (G.phase !== 'day') return;
  const w = weekOf(G.day), dow = dowOf(G.day);
  if (dow === 'Mon' && G.time >= FORECAST_CUTOFF && G.fc && G.fc[w + 1] && !G.fc[w + 1].locked) {
    lockForecast(w + 1, 'system');
    G.today.fcMissed = true;
    toast('⏰ The forecast window closed. The system forecast went in for next week.', 'bad');
  }
  if (dow === 'Thu' && G.time >= SCHED_CUTOFF) {
    const s = schedFor(w + 1);
    if (!s.posted) { s.posted = true; s.postedDay = G.day; s.postedBy = 'auto'; G.today.schedLate = true; toast('⏰ Next week\'s schedule auto-posted as it was. Check it against labor demand.', 'warn'); }
  }
}
// Daily numbers for the weekly review.
function laborDayExtras() {
  const w = weekOf(G.day), i = dowIdx(G.day);
  const f = G.fc && G.fc[w];
  const s = scheduledByRow(w), d = dayDemand(G.day);
  return {
    fcSales: f ? fcSales(f, G.day) : null, sysSales: f ? f.sys[i] : null, fcBy: f ? f.by : null,
    ldDmd: sum(LD_ROWS.map(r => d[r.key])), ldSched: sum(LD_ROWS.map(r => s[r.key][i])),
    otHrs: sum(G.crew.map(c => c.wk && c.wk.w === w ? Math.max(0, c.wk.min - OT_WEEKLY_MIN) : 0)) / 60,
    fcMissed: !!G.today.fcMissed, schedLate: !!G.today.schedLate,
  };
}
// Notes for the weekly DM review.
function laborReviewNotes(days, note, praise) {
  const S = f => sum(days.map(f));
  const fcDays = days.filter(d => d.fcSales != null);
  if (fcDays.length >= 3) {
    const fc = S(d => d.fcSales), act = S(d => d.sales), err = fc ? (act - fc) / fc : 0;
    const by = fcDays[0].fcBy;
    if (Math.abs(err) > 0.08) note('Forecast', `${by === 'you' ? 'Your' : 'The system'} forecast called ${money(fc)} for these days; you sold ${money(act)} (${err > 0 ? '+' : ''}${(err * 100).toFixed(1)}%).`,
      'The forecast is where the week\'s labor comes from. Miss low and the hours aren\'t there when customers are. Miss high and you pay people to wait for sales that never come.',
      by === 'you' ? 'On Monday, start from last week\'s actual by day, then adjust for the ad, the season and anything you know. Aim within 5%.' : 'Do the forecast yourself on Monday before 5 PM. The system can\'t see seasons or ads.');
    else if (by === 'you') praise.push(`Your forecast landed within ${Math.abs(err * 100).toFixed(1)}% of actual sales.`);
  }
  const dm = S(d => d.ldDmd || 0), sc = S(d => d.ldSched || 0);
  if (dm > 0 && ldFlag(dm, sc)) note('Schedule vs demand', `You scheduled ${sc.toFixed(1)} hours against ${dm.toFixed(1)} hours of labor demand (${sc > dm ? '+' : ''}${(sc - dm).toFixed(1)}).`,
    sc > dm ? 'Hours over demand are paid hours with no work behind them. That is how labor percent gets away from you without anyone noticing.' : 'Hours under demand means the work doesn\'t get done: the truck runs late, holes don\'t get filled, and your best people burn out.',
    'Before you post, run the Labor Demand Exception report. Fix any row that\'s off more than 2 hours or 10%, by day, not just for the week.');
  else if (dm > 0) praise.push('Your schedule matched labor demand.');
  const ot = Math.max(0, ...days.map(d => d.otHrs || 0));
  if (ot > 2) note('Overtime', `${ot.toFixed(1)} hours of overtime this week.`,
    'Overtime costs time and a half. Sometimes it\'s the right call, but planned overtime is a scheduling mistake.',
    'Keep everyone at 40 hours or less when you write the schedule. Spread the hours, or hire.');
  if (days.some(d => d.fcMissed)) note('Missed forecast window', 'The forecast window closed Monday and the system forecast went in.', 'You know your store better than the system does. Every time it goes in untouched, you give up control of next week\'s labor.', 'Put the forecast on Monday\'s list and do it before lunch.');
  if (days.some(d => d.schedLate)) note('Schedule not posted', 'You didn\'t post next week\'s schedule; it auto-posted on Thursday.', 'People plan their lives around the schedule. Posting it late, or changing it after, is one of the fastest ways to lose good people.', 'Write next week\'s schedule Wednesday, check it against demand, and post it Thursday morning.');
}
