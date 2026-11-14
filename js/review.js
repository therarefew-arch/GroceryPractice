'use strict';
// =====================================================================
//  Weekly District Manager review (every Friday close), records board,
//  and gamepad support.
//  The DM is harsh but fair: what he saw, why it matters, what to do.
// =====================================================================

// Extra numbers saved with each day for the weekly review and records.
function dayExtras(res) {
  const t = G.today, lp = listProgress();
  return {
    dow: dowOf(G.day), week: weekOf(G.day), listDone: lp.done, listTotal: lp.total, oos: t.oosLogged,
    coached: t.coached || 0, mistakes: t.crewMistakes || 0, systemOrder: !!t.systemOrder, vendorsMissed: t.vendorsMissed,
    vendorsIn: t.vendorsIn, spoiled: t.spoiled, tagsLeft: G.tags.length, misses: t.misses, requests: t.requests,
    labor: t.labor, trash: (G.trash || []).length, truckCases: t.truckCases,
    teamMorale: Math.round(teamMorale()), conflicts: t.conflicts || 0, conflictsIgnored: t.conflictsIgnored || 0, exits: t.exits || 0,
    incidents: t.incidents || 0, expFound: t.expFound || 0, inspFail: t.inspection ? !t.inspection.pass : false, dmWalk: t.dmWalk ? t.dmWalk.score : null,
  };
}

// ---- Records -------------------------------------------------------------
const RECORDS = {
  bestScore: { name: 'Best daily score', fmt: v => Math.round(v) + ' / 100', better: (a, b) => a > b },
  topSales: { name: 'Highest sales day', fmt: v => money(v), better: (a, b) => a > b },
  fastTruck: { name: 'Fastest truck worked', fmt: v => fmtTime(v), better: (a, b) => a < b },
  lowLabor: { name: 'Lowest labor %', fmt: v => v.toFixed(1) + '%', better: (a, b) => a < b },
  inStock: { name: 'Best in-stock', fmt: v => (v * 100).toFixed(1) + '%', better: (a, b) => a > b },
  lowOOS: { name: 'Lowest out-of-stock count', fmt: v => String(v), better: (a, b) => a < b },
  streak: { name: 'Longest B-or-better streak', fmt: v => v + ' days', better: (a, b) => a > b },
  coached: { name: 'Most coaching in a day', fmt: v => String(v), better: (a, b) => a > b },
};
function updateRecords(e) {
  G.records = G.records || {};
  const cand = {
    bestScore: e.score, topSales: e.sales, fastTruck: e.truckDoneAt || null,
    lowLabor: e.sales > 500 ? e.laborPct : null, inStock: e.requests > 50 ? e.inStock : null,
    lowOOS: e.oos != null ? e.oos : null, coached: e.coached || null,
  };
  // streak of B or better
  let s = 0; for (let i = G.pastDays.length - 1; i >= 0 && 'AB'.includes(G.pastDays[i].grade); i--) s++;
  cand.streak = s || null;
  const broke = [];
  for (const k in cand) {
    const v = cand[k];
    if (v == null) continue;
    const cur = G.records[k];
    if (!cur || RECORDS[k].better(v, cur.v)) { G.records[k] = { v, day: e.day }; if (cur) broke.push(RECORDS[k].name + ': ' + RECORDS[k].fmt(v)); }
  }
  if (broke.length) { toast('🏆 New record! ' + broke.join(' · '), 'gold'); }
}

// ---- Weekly review --------------------------------------------------------
function buildWeekReview(week) {
  const days = G.pastDays.filter(d => d.week === week);
  if (!days.length) return null;
  const S = (f) => sum(days.map(f));
  const sales = S(d => d.sales), goal = S(d => d.goal), labor = S(d => d.labor || 0);
  const laborPct = sales ? labor / sales * 100 : 0;
  const reqs = S(d => d.requests || 0), misses = S(d => d.misses || 0);
  const inStock = reqs ? 1 - misses / reqs : 1;
  const score = S(d => d.score) / days.length;
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const truckDays = days.filter(d => d.truckCases > 0), truckNoon = truckDays.filter(d => d.truckDoneAt && d.truckDoneAt <= 720).length;
  const listRate = S(d => d.listDone || 0) / Math.max(1, S(d => d.listTotal || 0));
  const oosDays = days.filter(d => d.oos != null), oosAvg = oosDays.length ? S(d => d.oos || 0) / oosDays.length : null;
  const sysOrders = days.filter(d => d.systemOrder).length;
  const vMiss = S(d => d.vendorsMissed || 0), mistakes = S(d => d.mistakes || 0), coached = S(d => d.coached || 0);
  const spoiled = S(d => d.spoiled || 0);
  const worst = days.slice().sort((a, b) => a.score - b.score)[0], best = days.slice().sort((a, b) => b.score - a.score)[0];
  const notes = [], praise = [];
  const note = (title, saw, why, fix, urgent) => (urgent ? notes.unshift({ title, saw, why, fix }) : notes.push({ title, saw, why, fix })); // urgent = customer safety: leads the review

  if (inStock < 0.95) note('In-stock', `In-stock ran ${(inStock * 100).toFixed(1)}% this week. ${misses} customers walked up to an empty shelf.`,
    'Every out is a sale you never get back, and a customer who just learned the store down the road has it. Outs also hide in your numbers: lost sales never show up as sales, so next week\'s forecast comes in low and the hole gets bigger.',
    'Fill holes from backstock before you touch anything new. Scan right after every bird run. On truck days, look at what is actually empty before you send the order. Don\'t just accept the suggestion.');
  else praise.push(`In-stock held at ${(inStock * 100).toFixed(1)}%. That's what customers notice first.`);

  if (laborPct > LABOR_TARGET) note('Labor', `Labor finished at ${laborPct.toFixed(1)}% of sales against a ${LABOR_TARGET}% target (${money(labor)} on ${money(sales)}).`,
    'Payroll is the biggest expense you control every single day. Every point over target comes straight out of profit, and it\'s the first number my boss asks me about.',
    'Build the schedule from the work, not from habit: heavy truck days get the truck shifts, light days get trimmed. Watch overlapping shifts, and send people home when the work is done.');
  else if (laborPct < LABOR_TARGET - 4 && inStock < 0.95) note('Labor (too lean)', `Labor was only ${laborPct.toFixed(1)}%, but the store paid for it in outs.`,
    'Cutting hours you need is not saving money. It moves the cost into lost sales and unhappy customers, where it\'s harder to see.',
    'Add hours where the work is: truck mornings and the evening close run. One more person often pays for themselves.');
  else praise.push(`Labor came in at ${laborPct.toFixed(1)}%, on target.`);

  laborReviewNotes(days, note, praise);
  successorReviewNotes(days, note, praise);
  standardsReviewNotes(days, note, praise);
  backroomReviewNotes(days, note); facingReviewNotes(days, note, praise); countsReviewNotes(days, note, praise); damagesReviewNotes(days, note, praise); cutsReviewNotes(days, note, praise); recallsReviewNotes(days, note, praise); resetsReviewNotes(days, note, praise); endcapsReviewNotes(days, note, praise); timeoffReviewNotes(days, note, praise); interviewReviewNotes(days, note, praise); huddleReviewNotes(days, note, praise); perfReviewNotes(days, note, praise); custReviewNotes(days, note, praise); weatherReviewNotes(days, note, praise); pnlReviewNotes(days, note, praise); repsReviewNotes(days, note, praise); dmReviewNotes(days, note, praise); discReviewNotes(days, note, praise);
  if (truckDays.length && truckNoon < truckDays.length) note('Truck', `The truck was worked by noon on ${truckNoon} of ${truckDays.length} truck days.`,
    'Freight still out at noon blocks the aisles during the busiest hours, cold product loses life every hour it sits, and backstock never gets run.',
    'Staff the truck shifts to the cases: about 45 cases an hour per person. Break down by aisle so floats go straight to the right aisle, and work cold first.');
  else if (truckDays.length) praise.push('Truck was done by noon every day. That\'s the foundation of everything else.');

  if (listRate < 0.8) note('The daily routine', `Only ${Math.round(listRate * 100)}% of the daily list got done.`,
    'The routine is what keeps small problems small: the water run, the bird runs, the close run, the count. Skip it and it all piles up on the next shift.',
    'Start every morning on the office computer → Today. Hand pieces of it to your crew, and check it again at 2 PM and at 6 PM.');
  else praise.push(`${Math.round(listRate * 100)}% of the daily list got done.`);

  if (sysOrders) note('Ordering', `You missed the order window ${sysOrders} time${sysOrders > 1 ? 's' : ''} and the system order went instead.`,
    'The system doesn\'t walk your aisles. It doesn\'t know about the display you built or the hole in dairy. Your order is the one chance to fix tomorrow before it happens.',
    `Block 30 minutes before ${fmtTime(ORDER_CUTOFF)} every day. Check the departments on tonight's trucks against what is actually on the shelf and in backstock.`);

  if (vMiss) note('DSD', `${vMiss} DSD vendor${vMiss > 1 ? 's' : ''} left without being checked in.`,
    'A vendor who leaves takes his product back with him, and that hole stays open until his next visit.',
    'Put someone on DSD in the morning, or keep an eye on the back door yourself when a vendor is due.');

  if (mistakes > 3 && coached < mistakes / 2) note('Coaching', `Your crew made ${mistakes} mistakes and you coached ${coached} of them.`,
    'Mistakes you let slide become how the job gets done. Your best people were coached by someone who cared enough to stop and show them.',
    'When you see the red "!", stop and coach right then. It takes two minutes and it pays back every shift after.');
  else if (coached) praise.push(`You coached ${coached} time${coached > 1 ? 's' : ''}. That's how you build superstars.`);

  const exits = S(d => d.exits || 0), ignored = S(d => d.conflictsIgnored || 0), mor = days[days.length - 1].teamMorale;
  if (exits || ignored || (mor != null && mor < 50)) note('Your people', `Team morale ended the week at ${mor != null ? mor + '%' : 'unknown'}${exits ? `, ${exits} people left` : ''}${ignored ? `, and ${ignored} argument${ignored > 1 ? 's' : ''} went unhandled` : ''}.`,
    'Every person who walks out costs you weeks of training and slows the whole crew down. Unhappy people work slower, call out more and argue more. The store runs on them.',
    'Thank people for good work every day (press E next to them). Keep schedules steady. Step into arguments right away. When a strong worker asks to move up, give them an answer.');
  else if (mor != null && mor >= 75) praise.push(`Team morale is ${mor}%. People want to work for you.`);

  const inc = S(d => d.incidents || 0), expF = S(d => d.expFound || 0), inspF = days.filter(d => d.inspFail).length;
  if (inc || expF || inspF) note('Store conditions', [inc && `${inc} customer slip incident${inc > 1 ? 's' : ''}`, expF && `customers found expired dairy ${expF} time${expF > 1 ? 's' : ''}`, inspF && `${inspF} failed health inspection${inspF > 1 ? 's' : ''}`].filter(Boolean).join(', ') + '.',
    'Safety and food quality aren\'t extra credit. One injured customer or one sick family can cost more than a month of sales, and it\'s what people remember about a store.',
    'Do the dairy code check every morning. Clean spills the moment you see them. When a case goes down, pull the product first.');

  if (oosAvg != null && oosAvg > OOS_GOAL) note('Out-of-stock count', `Your nightly count averaged ${Math.round(oosAvg)} against a goal of ${OOS_GOAL}.`,
    'The count tells you how the store looks to the last customer of the night and the first one tomorrow.',
    'Run the close run (water, milk, eggs, ice) on time, and fill holes from backstock before you log the count.');
  if (spoiled) note('Shrink', `${spoiled} cold cases spoiled in the back.`,
    'Spoiled product is money in the dumpster. You paid for it, you paid to unload it, and nobody bought it.',
    'Break down and work dairy and frozen first, every single morning, before anything dry.');

  const open = {
    A: 'Strong week. I don\'t say that lightly. Now do it again. Consistency is what gets you noticed.',
    B: 'Good week, not great. You\'re close. The gap between good and great is a few habits, and I\'ll tell you which ones.',
    C: 'Average week. I\'m not going to sugarcoat it: average stores don\'t get the remodel, and average managers don\'t get promoted. But everything below is fixable.',
    D: 'Rough week. I know some of it was out of your hands, but most of it wasn\'t. Here\'s what I need from you.',
    F: 'This was a bad week, and I won\'t pretend otherwise. I\'ve seen managers come back from worse, and I think you can. Read this carefully.',
  }[grade];
  return {
    week, grade, score, days: days.length, sales, goal, laborPct, inStock, truckNoon, truckDays: truckDays.length, listRate, oosAvg,
    best: best && { day: best.day, dow: best.dow, grade: best.grade }, worst: worst && { day: worst.day, dow: worst.dow, grade: worst.grade },
    open, notes: notes.slice(0, 4), also: notes.slice(4).map(n => n.title), praise,
    close: notes.length ? `Pick the top one or two above and own them next week. I'll be looking at ${notes[0].title.toLowerCase()} first.` : 'Keep doing exactly what you\'re doing.',
  };
}

function reviewText(r) {
  const lines = [r.open, '', `Week ${r.week}: ${r.grade} (${Math.round(r.score)} avg) · Sales ${money(r.sales)} of ${money(r.goal)} · Labor ${r.laborPct.toFixed(1)}% · In-stock ${(r.inStock * 100).toFixed(1)}%`, ''];
  r.notes.forEach(n => lines.push(`■ ${n.title}`, `What I saw: ${n.saw}`, `Why it matters: ${n.why}`, `Do this next week: ${n.fix}`, ''));
  if (r.also && r.also.length) lines.push('Also on my list: ' + r.also.join(', ') + '. Fix the ones above first.', '');
  if (r.praise.length) lines.push('What went right:', ...r.praise.map(p => '  • ' + p), '');
  lines.push(r.close, '', '— Your District Manager');
  return lines.join('\n');
}

// ---- Gamepad ---------------------------------------------------------------
const PAD = { prev: {} };
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && Array.from(pads).find(p => p);
  if (!gp || !G) return;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const k = RT.keys;
  k.PadLeft = ax < -0.4 || b(14); k.PadRight = ax > 0.4 || b(15); k.PadUp = ay < -0.4 || b(12); k.PadDown = ay > 0.4 || b(13);
  k.PadRun = b(1) || b(7);
  k.PadA = b(0);
  RT.padJoy = { x: ax, y: ay };
  const edge = i => b(i) && !PAD.prev[i];
  if (!RT.modal && !UI.open) {
    if (edge(0) && !isPaused() && !G.player.work) { RT.holdT = 0; const it = getInteraction(); if (it && it.fn) it.fn(); }
    if (edge(2) && !isPaused() && !G.player.work) { const it = getInteraction(); if (it && it.alt && it.alt.fn) it.alt.fn(); }
    if (edge(9)) RT.paused = !RT.paused;
    if (edge(5)) setZoom(CAM.target * 1.25);
    if (edge(4)) setZoom(CAM.target / 1.25);
  }
  PAD.prev = {}; gp.buttons.forEach((x, i) => { PAD.prev[i] = x.pressed; });
}
