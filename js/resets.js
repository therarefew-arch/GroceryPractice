'use strict';
// =====================================================================
//  Planogram resets, every other Tuesday.
//  Corporate's space planners send a reset packet the Saturday before:
//  one aisle, which items are discontinued, which new items come in,
//  how many items move to new spots, and the new shelf labels.
//  - Discontinued items stop shipping the day the packet comes (they're
//    cut from your orders). Sell them down before Tuesday; whatever is
//    left gets pulled during the reset and goes to clearance at half price.
//  - The new items' first cases come on Monday night's truck.
//  - Tuesday: work the reset at the shelf (E, hold it), with your crew.
//    It's about 2½–3 hours of work: pull the discontinued items, move
//    everything to its new spot, set the new items. Hang the new labels
//    too (price tags in that aisle; a Scan/Price Clerk hangs them).
//  - While an aisle is torn up it looks empty to customers and sales
//    suffer, so start early (before the store opens) and finish fast.
//  - Due by close Tuesday. When the work is done and the labels are up,
//    the new set is live: the new items sell and get ordered from then on.
// =====================================================================
const RESET_ROTATION = ['A3', 'A1', 'HBC', 'A2', 'A4', 'FRZ'];
const RESET_HRS = 2.75;     // labor-demand hours on a reset day
const RESET_DISC_AT = 0.15; // share of the work that is pulling the discontinued items
const isResetDay = day => dowOf(day) === 'Tue' && weekOf(day) % 2 === 1;

function ensureResets() { G.resets = G.resets || []; }
const resetById = id => (G.resets || []).find(r => r.id === id);
const activeResets = () => (G.resets || []).filter(r => r.state !== 'done' && G.day >= r.day);
const resetLabelsLeft = rs => G.tags.filter(t => t.reset === rs.id).length;
const resetPct = rs => Math.min(100, Math.floor(rs.work / rs.need * 100));
const resetStage = rs => (rs.work < rs.need * RESET_DISC_AT ? 'Pulling discontinued items' : rs.work < rs.need * 0.85 ? 'Moving items to their new spots' : rs.work < rs.need ? 'Setting the new items' : 'Hanging the new labels');
// A reset's new labels go up once the set is done (they're for the new spots).
const tagReady = t => { if (!t.reset) return true; const rs = resetById(t.reset); return !rs || rs.work >= rs.need; };
const resetTorn = rs => rs.state !== 'done' && rs.work > 0 && rs.work < rs.need;

// ---- the packet (Saturday) and reset day (Tuesday) ----
function resetsStartDay() {
  ensureResets();
  RT.resetWorkers = {};
  G.resets = G.resets.filter(r => r.state !== 'done' || G.day - r.day <= 14);
  if (dowOf(G.day) === 'Sat' && isResetDay(G.day + 3) && !G.resets.some(r => r.day === G.day + 3)) makeResetPacket(G.day + 3);
  for (const rs of G.resets) {
    if (rs.day === G.day && rs.state === 'planned') {
      rs.state = 'active';
      const tiles = shuffle(MAPD.shelfTiles[rs.dept].slice());
      for (let i = 0; i < rs.labels; i++) { const t = tiles[i % tiles.length]; G.tags.push({ id: nid(), dept: rs.dept, x: t.x, y: t.y, kind: 'change', reset: rs.id }); }
    }
  }
}
function makeResetPacket(day) {
  const n = G.resets.length, dept = RESET_ROTATION[n % RESET_ROTATION.length], d = DEPT[dept];
  const carried = new Set(d.items.map(i => i[0]));
  const disc = d.items.slice().sort((a, b) => itemWeekUnits(a[0]) - itemWeekUnits(b[0]) || a[1] - b[1]).slice(0, 2).map(i => i[0]);
  const pool = shuffle(SIR_POOL[dept].filter(x => !carried.has(x) && !(G.sirs || []).some(s => s.item === x && s.status === 'open')));
  const avgW = sum(d.items.filter(i => disc.includes(i[0])).map(i => i[1])) / 2;
  const adds = pool.slice(0, 2).map(x => [x, Math.round(avgW * rand(1.0, 1.5))]);
  const moves = randi(4, 7);
  const rs = { id: nid(), day, dept, disc, adds, moves, labels: moves + adds.length, need: 60 + moves * 10 + adds.length * 15 + disc.length * 10, work: 0, state: 'planned', discPulled: false, packetDay: G.day };
  G.resets.push(rs);
  ensureCuts();
  disc.forEach(it => G.whOuts.push({ id: nid(), kind: 'out', disc: true, reset: rs.id, dept, item: it, from: G.day, back: 99999, slips: 0, cut: 0, hole: false, tagged: false, state: 'out', hidden: false, x: 0, y: 0 }));
  mail('Space Planning', `Planogram reset Tuesday: ${d.aisle} ${d.name}`, [
    `Your next planogram reset is ${d.aisle}, ${d.name}, on ${WEEKDAY_NAMES[dowIdx(day)]} (Day ${day}). Due by close.`,
    '',
    `Discontinued (they stop shipping today, so sell them down): ${disc.join(', ')}.`,
    `New items: ${adds.map(a => a[0]).join(', ')}. The first cases come on Monday night's truck.`,
    `Moves: ${moves} items change spots. New shelf labels: ${rs.labels}.`,
    '',
    `Plan the labor: about ${Math.round(rs.need / 60 * 10) / 10} hours of reset work, plus the labels. A torn-up aisle looks empty to customers, so start before the doors open and finish fast. Whatever is left of the discontinued items gets pulled during the reset and goes to clearance at half price.`,
  ].join('\n'));
}
// Monday night: the new items' first cases ride the truck.
function resetShip(dept, cs) {
  for (const rs of G.resets || []) {
    if (rs.dept !== dept || rs.day !== G.day + 1 || rs.shipped) continue;
    rs.shipped = true;
    rs.adds.forEach(([it]) => { cs.push({ d: dept, item: it }, { d: dept, item: it }); });
  }
}

// ---- the work ----
function resetWork(rs, amt, crew) {
  if (rs.state === 'done' || rs.work >= rs.need) return;
  if (!rs.startedAt) { rs.startedAt = G.time; rs.startedDay = G.day; }
  rs.work = Math.min(rs.need, rs.work + amt);
  if (!rs.discPulled && rs.work >= rs.need * RESET_DISC_AT) pullDiscontinued(rs, crew);
  if (rs.work >= rs.need) {
    const n = resetLabelsLeft(rs);
    toast(`📐 ${DEPT[rs.dept].aisle} is set to the new planogram.${n ? ` ${plural(n, 'new label')} still to hang.` : ''}`, 'good');
    resetCheckDone(rs);
  }
}
function pullDiscontinued(rs, crew) {
  rs.discPulled = true;
  const d = DEPT[rs.dept], s = G.stock[rs.dept], share = sum(rs.disc.map(it => itemShare(rs.dept, it)));
  let u = Math.round((s.shelf + s.back) * share);
  const fromShelf = Math.min(s.shelf, u); s.shelf -= fromShelf; u -= fromShelf;
  const fromBack = Math.min(s.back, u); s.back -= fromBack;
  const units = fromShelf + fromBack, loss = units * d.price * 0.5;
  G.today.resetMarkdown = (G.today.resetMarkdown || 0) + loss;
  rs.discUnits = units;
  toast(`📐 ${units} units of discontinued ${rs.disc.join(' and ')} pulled to clearance (half price, ${money(loss)} markdown).${units > d.upc * 2 ? ' Sell discontinued items down before the reset next time.' : ''}`, units > d.upc * 2 ? 'warn' : 'info');
}
function resetCheckDone(rs) {
  if (rs.state === 'done' || rs.work < rs.need || resetLabelsLeft(rs)) return;
  rs.state = 'done'; rs.doneAt = G.time; rs.doneDay = G.day;
  const d = DEPT[rs.dept];
  G.catalog = G.catalog || {};
  const keep = d.items.filter(i => !rs.disc.includes(i[0])).map(i => i.slice());
  rs.adds.forEach(a => { if (!keep.some(i => i[0] === a[0])) keep.push(a.slice()); });
  G.catalog[rs.dept] = keep;
  applyCatalog();
  G.whOuts = (G.whOuts || []).filter(o => o.reset !== rs.id);
  G.today.resetDone = 1;
  const late = G.day > rs.day;
  addXP(late ? 15 : 30, G.player);
  toast(`✅ Planogram reset complete: ${d.aisle} ${d.name}${late ? ' (late)' : ` at ${fmtTime(G.time)}`}. ${rs.adds.map(a => a[0]).join(' and ')} ${rs.adds.length > 1 ? 'are' : 'is'} on the shelf now.`, late ? 'info' : 'good');
  mail('Space Planning', `Reset complete: ${d.aisle}`, `${d.aisle} ${d.name} was reset ${late ? `late, on Day ${G.day}` : `on time at ${fmtTime(G.time)}`}. Compliance photo received.${rs.startedDay === rs.day && rs.startedAt > OPEN ? ` The aisle was torn up during store hours from ${fmtTime(rs.startedAt)}.` : ''}`);
}

// ---- you ----
function resetInteraction(shelfDept, shelf) {
  const rs = activeResets().find(r => r.dept === shelfDept && r.work < r.need);
  if (!rs) return null;
  return { label: `📐 Work the planogram reset (${resetPct(rs)}%): ${resetStage(rs).toLowerCase()}`, at: tileC(shelf), rep: true,
    fn: () => startWork(1, resetStage(rs), () => { resetWork(rs, 1.2, null); return rs.work < rs.need; }, true) };
}

// ---- crew ----
function planReset(c, r, only) {
  if (G.phase !== 'day') return null;
  RT.resetWorkers = RT.resetWorkers || {};
  const rs = activeResets().find(x => (!only || only.includes(x.dept)) && x.work < x.need && Object.keys(RT.resetWorkers).filter(k => RT.resetWorkers[k] === x.id).length < 3);
  if (!rs) return null;
  RT.resetWorkers[c.id] = rs.id;
  r.cleanups.push(() => { if (RT.resetWorkers[c.id] === rs.id) delete RT.resetWorkers[c.id]; });
  r.intent = `Planogram reset: ${DEPT[rs.dept].aisle}`;
  let t = 0;
  return [
    { go: () => MAPD.access[rs.dept] },
    { loop: dt => {
      r.label = resetStage(rs);
      if (rs.work >= rs.need || rs.state === 'done') { r.progress = 0; return true; }
      const k = dt * sf(c); t += k;
      resetWork(rs, k, c);
      r.progress = rs.work / rs.need;
      return t >= 60;
    } },
    { do: () => {
      if (rs.work < rs.need && rollMistake(c, 'stock', 0.15)) { rs.need += 8; floater(r.x, r.y - 1, 'Wrong spot! Redo', '#ff9f6b'); }
      return true;
    } },
  ];
}
const resetToday = () => activeResets().some(r => r.work < r.need);

// ---- time ----
function resetsTick() {
  for (const rs of activeResets()) {
    if (resetTorn(rs) && G.face) G.face[rs.dept] = Math.min(G.face[rs.dept], 55);
    if (rs.work >= rs.need) resetCheckDone(rs);
  }
}
function resetsHour(h) {
  if (h * 60 > OPEN && h * 60 <= CLOSE && activeResets().some(resetTorn)) G.today.resetTornHrs = (G.today.resetTornHrs || 0) + 1;
}
function resetsEndDay() {
  for (const rs of activeResets()) {
    G.today.resetLate = 1;
    if (!rs.lateMailed || G.day > rs.lateMailed) {
      rs.lateMailed = G.day;
      mail('District Manager', `Reset not finished: ${DEPT[rs.dept].aisle}`, `Space Planning says the ${DEPT[rs.dept].aisle} reset (due ${WEEKDAY_NAMES[dowIdx(rs.day)]}) still isn't complete: ${resetPct(rs)}% worked, ${plural(resetLabelsLeft(rs), 'label')} not hung. The new items can't sell until it's set. Get it done tomorrow.`);
    }
  }
}
const resetBadgeToday = () => (G.resets || []).some(rs => rs.doneDay === G.day && rs.day === G.day && rs.doneAt <= 720);
function resetTasks(add) {
  for (const rs of G.resets || []) {
    if (rs.state === 'done') continue;
    const d = DEPT[rs.dept];
    if (rs.day === G.day) add('reset-' + rs.id, 'reset', `Planogram reset: ${d.aisle} ${d.name}`, `Work it at the shelf (E) with your crew, and hang its ${rs.labels} new labels. A torn-up aisle loses sales: start before open`, 1375, 'by', { id: rs.id });
    else if (G.day > rs.day) add('reset-' + rs.id, 'reset', `LATE: planogram reset ${d.aisle}`, `Was due ${WEEKDAY_NAMES[dowIdx(rs.day)]}. Finish the work and the labels`, 1375, 'by', { id: rs.id });
    else if (G.day === rs.day - 1) add('resetprep-' + rs.id, 'resetprep', `Plan tomorrow's reset: ${d.aisle}`, `About ${Math.round(rs.need / 60 * 10) / 10} labor hours. Put people on early shifts (🗓 Schedule)`, 1375, 'at', { id: rs.id });
  }
}

// ---- reports ----
function resetsTips() {
  const t = G.today, tips = [];
  if (t.resetLate) tips.push(`The planogram reset isn't finished. Until it's set and labeled, the new items can't sell and the discontinued ones are still on the shelf.`);
  if (t.resetTornHrs >= 3) tips.push(`An aisle was torn up for a reset for ${t.resetTornHrs} hours while customers shopped. Start resets before the doors open, and put enough people on them to finish fast.`);
  if (t.resetMarkdown >= 20) tips.push(`Discontinued product cost ${money(t.resetMarkdown)} in clearance markdowns. The packet comes Saturday: sell discontinued items down (don't backstock more) before Tuesday.`);
  if (t.resetDone && !t.resetLate && !(t.resetTornHrs >= 3)) tips.push('Reset done on time. The new items are on the shelf and in your orders from now on.');
  return tips;
}
function resetsDayExtras() {
  const t = G.today;
  return { resetDone: t.resetDone || 0, resetLate: t.resetLate || 0, resetTornHrs: t.resetTornHrs || 0, resetMarkdown: Math.round(t.resetMarkdown || 0) };
}
function resetsReviewNotes(days, note, praise) {
  const late = days.filter(d => d.resetLate).length, torn = sum(days.map(d => d.resetTornHrs || 0)), done = sum(days.map(d => d.resetDone || 0));
  if (late) note('Planogram reset', `The reset ran past its due date (${late} day${late > 1 ? 's' : ''} late).`,
    'Space Planning sets the whole chain on the same day. A late reset means the new items aren\'t selling and the ad and the shelf labels don\'t match what\'s there.',
    'Read the packet Saturday, schedule the hours, start Tuesday before the doors open, and give the labels to a Scan/Price Clerk.');
  else if (torn >= 4) note('Planogram reset', `The reset aisle was torn up for ${torn} hours during store hours.`,
    'A half-set aisle looks empty: customers walk past product that\'s sitting right there.',
    'Start the reset at 5 AM with two or three people. It should be done before the lunch rush.');
  else if (done) praise.push('The planogram reset was done on time.');
}

// ---- office computer ----
function resetTodayHTML() {
  const list = (G.resets || []).filter(rs => rs.state !== 'done' || rs.doneDay === G.day);
  if (!list.length) return '';
  let h = '<h3>📐 Planogram reset</h3>';
  for (const rs of list) {
    const d = DEPT[rs.dept], when = rs.day > G.day ? `${WEEKDAY_NAMES[dowIdx(rs.day)]} (Day ${rs.day})` : rs.day === G.day ? 'today' : `<span class="bad">was due Day ${rs.day}</span>`;
    h += `<p><b>${d.aisle} ${d.name}</b>, ${when}. Discontinued: ${rs.disc.join(', ')}${rs.state === 'planned' ? ' <span class="mute">(no longer shipping: sell them down)</span>' : ''}. New: ${rs.adds.map(a => a[0]).join(', ')}. ${rs.moves} moves, ${rs.labels} new labels.</p>`;
    if (rs.state === 'done') h += `<p class="good">✓ Done at ${fmtTime(rs.doneAt)}${rs.doneDay !== rs.day ? ` on Day ${rs.doneDay}` : ''}.</p>`;
    else if (rs.state === 'active') h += `<p>Work: ${meter(resetPct(rs), '#e8962e')} ${resetPct(rs)}% (${resetStage(rs).toLowerCase()}) · Labels left: <b>${resetLabelsLeft(rs)}</b></p><p class="mute">E at the ${d.aisle} shelf to work it (hold E), and the crew helps: a ${d.name.split(' ')[0]} department clerk and anyone idle, or order someone ("Planogram reset"). The new labels are price tags in that aisle: they go up once the set is done.</p>`;
    else h += `<p class="mute">About ${Math.round(rs.need / 60 * 10) / 10} hours of work plus the labels. Schedule people early on reset day.</p>`;
  }
  return h;
}

// ---- drawing ----
function drawResetMarks() {
  if (!MAPD.signs || G.phase !== 'day') return;
  for (const rs of activeResets()) {
    const s = MAPD.signs[rs.dept]; if (!s) continue;
    badge(s.x + s.w / 2, s.y - 22, rs.work < rs.need ? `RESET ${resetPct(rs)}%` : `LABELS ${resetLabelsLeft(rs)}`, '#8a5200');
  }
}
