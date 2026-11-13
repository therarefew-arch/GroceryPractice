'use strict';
// =====================================================================
//  The morning huddle.
//  Between 5:30 and 8:00 AM, press E in the break room to pull the crew on
//  the clock together for five minutes: yesterday's numbers, today's plan,
//  ONE priority, and a shout-out.
//  - The priority focuses the crew: half the mistakes in that kind of work
//    all day. Pick the thing that matters most today (a recall beats
//    everything; a big truck, a reset, the ad flip, a pile of tags...) and
//    the crew gets clear direction (+morale).
//  - A shout-out in front of the team is worth more than a thank-you in the
//    aisle.
//  - Skip it and nothing breaks, but nobody knows what today is about.
// =====================================================================
const HUDDLE_SPOT = { x: 36.5, y: 7.5 }; // the break room
const HUDDLE_FROM = 330, HUDDLE_TO = 480; // 5:30 to 8:00 AM
const HUDDLE_MIN = 5;

const huddleHeld = () => !!(G.today && G.today.huddle);
const huddleOpen = () => G.phase === 'day' && G.time >= HUDDLE_FROM && G.time < HUDDLE_TO && !huddleHeld();
const huddleCrew = () => G.crew.filter(c => { const r = RT.crew[c.id]; return onShift(c) && r && r.inBuilding && !r.onBreak; });
// Mistakes in the huddle's focus area happen half as often today.
const huddleMistakeMult = area => (G.today && G.today.huddle && G.today.huddle.area === area ? 0.5 : 1);

// What today could be about, most urgent first.
function huddlePriorities() {
  const last = G.pastDays[G.pastDays.length - 1], t = G.today, out = [];
  const add = (key, label, why, area, w) => out.push({ key, label, why, area, w });
  const rc = openRecalls().filter(rs => rs.state === 'open');
  if (rc.length) add('recall', `Pull the recall: ${rc[0].item}`, 'Recalled product on the shelf is a safety problem and a fine. It beats everything.', null, 100);
  if (resetToday()) add('reset', `Planogram reset in ${DEPT[activeResets()[0].dept].aisle}`, 'The aisle is torn up until it\'s done, and it\'s due today.', 'stock', 30);
  if (dowOf(G.day) === 'Tue' && G.nextAd) add('ad', 'Flip the ad tonight (endcaps from 6 PM)', 'Wednesday\'s ad depends on tonight\'s flip.', null, 14);
  add('truck', `Work the truck by noon (${t.truckCases || 0} cases)`, 'Freight that\'s still in the back at noon is holes on the shelf all afternoon.', 'sort', 3 + (t.truckCases || 0) / 40);
  if (last) add('instock', `Fill the holes (in-stock was ${(last.inStock * 100).toFixed(1)}% yesterday)`, 'Every hole is a customer who leaves without it.', 'stock', last.inStock < 0.95 ? (0.95 - last.inStock) * 120 : 1);
  if (G.tags.length) add('price', `Price integrity (${plural(G.tags.length, 'tag')} to hang)`, 'Wrong prices cost money at the register and trust with customers.', 'price', G.tags.length / 3);
  if ((G.vendorsToday || []).length) add('dsd', `Check in DSD right (${plural(G.vendorsToday.length, 'vendor')} today)`, 'A short delivery we sign for is money we never get back.', 'dsd', 2);
  if (G.list && G.list.some(x => x.kind === 'counts')) add('counts', 'Cycle counts done right', 'A bad count makes the computer order wrong for weeks.', 'count', 4);
  add('phones', 'Phones away, stay on task', 'Phone breaks on the clock add up.', 'focus', 1.5);
  return out.sort((a, b) => b.w - a.w);
}

function huddleInteraction(p) {
  if (!huddleOpen() || dist(p, HUDDLE_SPOT) > 2.2) return null;
  const n = huddleCrew().length;
  return { label: `📣 Hold the morning huddle (${plural(n, 'associate')} on the clock)`, at: HUDDLE_SPOT, fn: () => UI.huddle() };
}

function holdHuddle(key, shoutId) {
  if (!huddleOpen()) return;
  const pr = huddlePriorities(), pick1 = pr.find(x => x.key === key) || pr[0], best = pr[0];
  const crew = huddleCrew(), right = pick1.key === best.key;
  G.today.huddle = { at: G.time, key: pick1.key, area: pick1.area, best: best.key, right, n: crew.length };
  for (const c of crew) {
    bump(c, right ? 3 : 1, right ? 'direction' : null);
    const r = RT.crew[c.id];
    if (r) { finishPlan(c, r); r.intent = 'Morning huddle'; r.plan = [{ go: () => tilesAround(HUDDLE_SPOT, 2) }, { wait: HUDDLE_MIN, label: 'Morning huddle' }]; }
  }
  const sc = G.crew.find(c => c.id === +shoutId);
  if (sc) {
    sc.praisedDay = G.day; sc.lastPraised = G.day; bump(sc, 10, 'praised'); G.today.huddle.shout = sc.name;
    crew.filter(c => c !== sc).forEach(c => bump(c, c.trait === 'social' ? 2 : 1, null));
  }
  startWork(HUDDLE_MIN, 'Morning huddle', () => {});
  addXP(5, G.player);
  toast(right ? `📣 Huddle done. Everyone knows today is about: ${pick1.label}.` : `📣 Huddle done. Today's focus: ${pick1.label}. (The bigger thing today was: ${best.label}.)`, right ? 'good' : 'warn');
}

// ---- the huddle sheet ----
function huddleSheetHTML() {
  const last = G.pastDays[G.pastDays.length - 1], t = G.today, pr = huddlePriorities(), crew = huddleCrew();
  const today = G.crew.filter(c => curShift(c) && !c.calledOut);
  let h = `<h2>📣 Morning huddle</h2><p class="mute">${plural(crew.length, 'associate')} on the clock. Five minutes: last night and yesterday, today's plan, one priority, one shout-out.</p>`;
  h += '<div class="card"><b>Yesterday</b><br>' + (last
    ? `Sales ${money(last.sales)} vs goal ${money(last.goal)} (<span class="${last.sales >= last.goal ? 'good' : 'bad'}">${last.sales >= last.goal ? '+' : ''}${money(last.sales - last.goal)}</span>) · in-stock <span class="${last.inStock >= 0.95 ? 'good' : 'bad'}">${(last.inStock * 100).toFixed(1)}%</span> · truck ${last.truckDoneAt != null ? `done ${fmtTime(last.truckDoneAt)}` : '<span class="bad">not finished</span>'} · labor ${last.laborPct.toFixed(1)}% · grade <b>${last.grade}</b>`
    : 'First day: no numbers yet.') + '</div>';
  const specials = [resetToday() ? `planogram reset in ${DEPT[activeResets()[0].dept].aisle}` : '', openRecalls().length ? `recall open: ${openRecalls()[0].item}` : '', dowOf(G.day) === 'Tue' && G.nextAd ? 'ad flip tonight' : '', dowOf(G.day) === 'Wed' && G.ad ? 'new ad starts today' : ''].filter(Boolean);
  h += `<div class="card" style="margin-top:8px"><b>Today</b> ${WX[wxKind(G.day)].icon} ${WX[wxKind(G.day)].name}${wxPrestorm(G.day) ? ' <span class="warn">(stock-up day before the storm)</span>' : ''}<br>Sales goal ${money(t.goal)} · truck ${t.truckCases || 0} cases · ${plural((G.vendorsToday || []).length, 'DSD vendor')} · ${plural(G.tags.length, 'price tag')}${specials.length ? ` · <span class="warn">${specials.join(' · ')}</span>` : ''}<br><span class="mute">On today: ${today.map(c => `${esc(c.name)} (${SHIFTS[curShift(c)].name})`).join(', ') || 'nobody'}</span></div>`;
  h += `<div style="margin-top:10px"><b>Today's one priority</b> <span class="mute">(the crew makes half the mistakes in that work today)</span>`;
  // shown in no particular order: reading the day is the point
  h += shuffle(pr.slice(0, 6)).map(x => `<label style="display:block;margin:4px 0;cursor:pointer"><input type="radio" name="hp" value="${x.key}"> ${esc(x.label)}</label>`).join('') + '</div>';
  h += `<div style="margin-top:8px"><b>Shout-out</b> <select id="hs"><option value="">— nobody today —</option>${G.crew.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select> <span class="mute">recognition in front of the team</span></div>`;
  h += `<div class="row" style="justify-content:flex-end;margin-top:12px"><span id="hpwarn" class="warn" style="display:none">Pick today's priority first.</span><button onclick="UI.hideModal()">Not now</button><button class="primary" onclick="const r = document.querySelector('input[name=hp]:checked'); if (!r) { document.getElementById('hpwarn').style.display = 'inline'; return; } const s = document.getElementById('hs').value; UI.hideModal(); holdHuddle(r.value, s);">Hold the huddle (${HUDDLE_MIN} min)</button></div>`;
  return h;
}

// ---- reports ----
function huddleTips() {
  const h = G.today.huddle, tips = [];
  if (!h && mgrHuddleDay(G.day)) tips.push('No morning huddle today. Five minutes in the break room before 8 AM (E there) tells the crew what today is about, and focuses them on one thing.');
  else if (h && !h.right) tips.push(`Today's huddle focused on the wrong thing. The biggest issue was: ${huddlePriorities()[0] ? huddlePriorities()[0].label : 'something else'}. Read the day before you pick.`);
  return tips;
}
// A day you could have held one: you opened (in by 8 AM).
function mgrHuddleDay(day) { const sk = mgrShift(day); return !!(sk && SHIFTS[sk].start < HUDDLE_TO); }
function huddleDayExtras() {
  const h = G.today.huddle;
  return { huddle: h ? 1 : 0, huddleRight: h && h.right ? 1 : 0, huddleChance: mgrHuddleDay(G.day) ? 1 : 0, huddleShout: h && h.shout ? 1 : 0 };
}
function huddleReviewNotes(days, note, praise) {
  const held = sum(days.map(d => d.huddle || 0)), chances = sum(days.map(d => d.huddleChance || 0)), right = sum(days.map(d => d.huddleRight || 0));
  if (!chances) return;
  if (held < chances / 2) note('Morning huddle', `You held ${held} morning huddle${held === 1 ? '' : 's'} on ${chances} morning${chances === 1 ? '' : 's'} you opened.`,
    'Without a huddle the crew starts the day without a plan. They work hard on whatever is in front of them, not on what matters today.',
    'Every morning you open: five minutes in the break room before 8 AM. Yesterday\'s numbers, today\'s plan, one priority, one shout-out.');
  else if (held && right < held / 2) note('Morning huddle', `${held - right} of your ${held} huddles focused on something other than the day's biggest issue.`,
    'The priority you name is what the crew works on first. Name the wrong one and the real problem waits.',
    'Read the day first: a recall beats everything, then a reset or the ad flip, then a big truck or a bad in-stock day.');
  else if (held >= chances - 1) praise.push(`You held a morning huddle ${held} of ${chances} mornings, and pointed the crew at the right thing.`);
}

// A marker over the break room while the huddle window is open.
function drawHuddleMark() {
  if (!huddleOpen() || !mgrShift(G.day)) return;
  const blink = Math.floor(performance.now() / 500) % 2;
  badge(HUDDLE_SPOT.x * T, HUDDLE_SPOT.y * T - 18, '📣 HUDDLE', blink ? '#8a5200' : '#333');
}
