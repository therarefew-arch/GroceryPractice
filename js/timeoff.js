'use strict';
// =====================================================================
//  Availability and time-off requests.
//  - Every associate has availability: the days and hours they can work
//    (students after 2 PM on weekdays, parents done by 5 PM, no Sundays...).
//    Schedule someone outside it and they don't come in. Now and then
//    someone's availability changes, starting two weeks out.
//  - Associates ask for days off (1 to 3 weeks out). Answer every request
//    before that week's schedule posts (Thursday 5 PM the week before).
//    Approve: they're off that day (the schedule cell goes Off) and you
//    cover the hours. Deny: they're unhappy, and some "call in sick" anyway.
//    Ignore it until the schedule posts and that counts as a no, only worse.
// =====================================================================
const AVAIL_AM_END = 17 * 60;   // 'am': the shift has to end by 5 PM
const AVAIL_PM_START = 14 * 60; // 'pm': the shift can't start before 2 PM
const PTO_CHANCE = 0.035;       // per associate per day
const AVAIL_CHANGE_CHANCE = 0.05; // per day, one associate
const PTO_REASONS = [
  ['my cousin\'s wedding', true], ['a funeral out of town', true], ['a court date I can\'t move', true], ['my kid\'s surgery', true],
  ['a doctor\'s appointment', false], ['my kid\'s school play', false], ['family in from out of town', false], ['a concert I got tickets for months ago', false],
  ['moving into my new place', false], ['my sister\'s graduation', false], ['a dentist appointment', false], ['a trip I planned with my partner', false],
];
const AVAIL_PROFILES = {
  open: { w: 35, row: () => WEEKDAYS.map(() => 'any') },
  student: { w: 20, row: () => WEEKDAYS.map((_, i) => i >= 2 ? 'pm' : 'any') },
  parent: { w: 20, row: () => WEEKDAYS.map((_, i) => i === 1 ? 'none' : i >= 2 ? 'am' : 'any') },
  sunday: { w: 15, row: () => WEEKDAYS.map((_, i) => i === 1 ? 'none' : 'any') },
  secondJob: { w: 10, row: () => { const no = shuffle([2, 3, 4, 5, 6]).slice(0, 2); return WEEKDAYS.map((_, i) => no.includes(i) ? 'none' : 'any'); } },
};

const shiftFits = (a, sk) => {
  if (!sk || sk === OFF) return true;
  const s = SHIFTS[sk]; if (!s) return true;
  return a === 'any' || !a ? true : a === 'none' ? false : a === 'am' ? s.end <= AVAIL_AM_END : s.start >= AVAIL_PM_START;
};
// availability in a given week (a change can start two weeks out)
const availFor = (c, w) => (c.availNext && w >= c.availNext.from ? c.availNext.row : c.avail) || [];
const availOk = (c, i, sk) => shiftFits((c.avail || [])[i], sk);
function makeAvail(usual) {
  for (let k = 0; k < 8; k++) {
    const prof = wpick(Object.entries(AVAIL_PROFILES), e => e[1].w)[1], row = prof.row();
    if (row.filter(a => shiftFits(a, usual)).length >= 5) return row;
  }
  return WEEKDAYS.map(() => 'any');
}
const AVAIL_WORD = { none: 'off', am: 'done by 5 PM', pm: 'after 2 PM' };
function availText(row) {
  if (!row || row.every(a => a === 'any')) return 'Open availability';
  const parts = [];
  for (const k of ['none', 'am', 'pm']) {
    const days = WEEKDAYS.filter((_, i) => row[i] === k);
    if (!days.length) continue;
    const wk = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const label = days.length === 5 && wk.every(d => days.includes(d)) ? 'Mon–Fri' : days.join('/');
    parts.push(k === 'none' ? `can't work ${label}` : `${label} ${AVAIL_WORD[k]}`);
  }
  return parts.join(' · ');
}
// Shift that fits their availability for that day, closest to the one asked for (or Off).
function fitShift(c, i, sk) {
  if (availOk(c, i, sk)) return sk;
  const s = SHIFTS[sk];
  const ok = Object.keys(SHIFTS).filter(k => k !== 'night' && availOk(c, i, k)).sort((a, b) => Math.abs(SHIFTS[a].start - s.start) - Math.abs(SHIFTS[b].start - s.start));
  return ok[0] || OFF;
}

function ensureTimeoff() {
  G.pto = G.pto || [];
  G.crew.forEach(c => { if (!c.avail) c.avail = makeAvail(c.shift); });
  (G.candidates || []).forEach(k => { if (!k.avail) k.avail = makeAvail(k.shift); });
}
const ptoById = id => G.pto.find(p => p.id === id);
const ptoPending = () => G.pto.filter(p => p.state === 'pending' && G.crew.some(c => c.id === p.cid));
const ptoApproved = (cid, day) => G.pto.find(p => p.cid === cid && p.day === day && p.state === 'approved');
const ptoOf = (cid, day) => G.pto.find(p => p.cid === cid && p.day === day);
const dayName = day => `${dowOf(day)} ${fmtMD(day)}`;
// A request goes unanswered past the posting of that week's schedule.
const ptoPostedWeek = p => { const s = G.sched && G.sched[weekOf(p.day)]; return !!(s && s.posted); };
// Answer by: that week's posting, or (asked after it posted) within 2 days, and always before the day itself.
const ptoPostDay = p => weekStart(weekOf(p.day) - 1) + 5; // the Thursday that week's schedule posts
const ptoDeadline = p => Math.min(p.day - 1, Math.max(ptoPostDay(p), p.asked + 2));
const ptoLate = p => p.day <= G.day || G.day > ptoDeadline(p) || (G.day === ptoDeadline(p) && ptoDeadline(p) === ptoPostDay(p) && ptoPostedWeek(p));
const ptoDueText = p => ptoDeadline(p) === ptoPostDay(p) ? `answer by Thu ${fmtMD(ptoPostDay(p))}, when that week posts` : `answer by ${dayName(ptoDeadline(p))}`;

// New weeks: approved days off are off.
function ptoApplyWeek(w, s) {
  for (const p of G.pto) if (p.state === 'approved' && weekOf(p.day) === w && s.rows[p.cid]) s.rows[p.cid][dowIdx(p.day)] = OFF;
}

// ---- answering ----
function answerPto(id, yes) {
  const p = ptoById(id), c = p && G.crew.find(x => x.id === p.cid);
  if (!p || !c || p.state !== 'pending') return;
  const t = G.today;
  if (yes) {
    p.state = 'approved'; bump(c, 3, 'heard');
    t.ptoOk = (t.ptoOk || 0) + 1;
    const s = G.sched && G.sched[weekOf(p.day)], i = dowIdx(p.day), was = s && s.rows[c.id] && s.rows[c.id][i];
    if (s && s.rows[c.id]) s.rows[c.id][i] = OFF;
    toast(`✅ ${c.name} is off ${dayName(p.day)}.${was && was !== OFF ? ` They were on ${SHIFTS[was].name}: cover those hours.` : ''}`, 'good');
  } else {
    p.state = 'denied'; bump(c, p.big ? -10 : -5, 'timeoff');
    p.skip = Math.random() < (p.big ? 0.6 : 0.3);
    t.ptoNo = (t.ptoNo || 0) + 1;
    toast(`❌ Told ${c.name} no for ${dayName(p.day)}.${p.big ? ' That one mattered to them.' : ''}`, 'warn');
  }
}

// ---- days ----
function timeoffStartDay() {
  ensureTimeoff();
  const t = G.today, w = weekOf(G.day);
  // availability changes take effect
  for (const c of G.crew) if (c.availNext && w >= c.availNext.from) { c.avail = c.availNext.row; delete c.availNext; }
  // new requests
  for (const c of G.crew) {
    if (G.day < 2 || c.notice || Math.random() > PTO_CHANCE) continue;
    const day = G.day + randi(6, 20);
    if (G.pto.some(p => p.cid === c.id && Math.abs(p.day - day) < 3)) continue;
    const [reason, big] = pick(PTO_REASONS);
    const p = { id: nid(), cid: c.id, name: c.name, day, reason, big, state: 'pending', asked: G.day };

    G.pto.push(p);
    const s = G.sched && G.sched[weekOf(day)], sk = s && s.rows[c.id] ? s.rows[c.id][dowIdx(day)] : null;
    mail(c.name, `Time-off request: ${dayName(day)}`, `Hi, can I have ${dayName(day)} off? It's for ${reason}.${sk && sk !== OFF ? ` I'm down for ${SHIFTS[sk].name} that day.` : ''}\nPlease let me know before that week's schedule goes up.\n— ${c.name}\n\n(Answer it in the office computer → 🗓 Schedule → Time-off requests.)`);
    t.ptoAsked = (t.ptoAsked || 0) + 1;
  }
  // an availability change, two weeks out
  if (G.day >= 5 && Math.random() < AVAIL_CHANGE_CHANCE) {
    const c = pick(G.crew.filter(x => !x.availNext && (x.days || 0) >= 3 && !x.notice));
    if (c) {
      let row = null;
      for (let k = 0; k < 6 && !row; k++) { const r = makeAvail(c.shift); if (r.join() !== c.avail.join()) row = r; }
      if (row) {
        c.availNext = { from: w + 2, row };
        mail(c.name, 'My availability is changing', `Hi, starting week ${w + 2} (${fmtMD(weekStart(w + 2))}) my availability changes.\nRight now: ${availText(c.avail)}.\nStarting then: ${availText(row)}.\nSorry, it's out of my hands (school, family, my other job). Please schedule around it.\n— ${c.name}`);
      }
    }
  }
}
// After the morning call-out roll: who doesn't come in because of the schedule.
function timeoffCallouts() {
  const t = G.today, i = dowIdx(G.day);
  for (const c of G.crew) {
    const sk = curShift(c);
    if (!sk || c.calledOut) continue;
    const p = ptoOf(c.id, G.day);
    if (p && p.state === 'approved') {
      c.calledOut = true; bump(c, -6, 'timeoff'); t.ptoNoShow = (t.ptoNoShow || 0) + 1;
      mail(c.name, 'I had today off', `Hey, you approved today off for me (${p.reason}), but I'm on the schedule. I'm not coming in. Please check the schedule before it posts.\n— ${c.name}`);
    } else if (p && (p.state === 'denied' || p.state === 'ignored') && p.skip) {
      c.calledOut = true; t.ptoSkip = (t.ptoSkip || 0) + 1;
      mail(c.name, 'Can\'t make it in today', `Hey, I'm sick and can't make my ${SHIFTS[sk].name} shift today. Sorry!\n— ${c.name}`);
    } else if (!availOk(c, i, sk)) {
      c.calledOut = true; bump(c, -4, 'avail'); t.availNoShow = (t.availNoShow || 0) + 1;
      mail(c.name, 'I\'m not available today', `You have me on ${SHIFTS[sk].name} today, but my availability is: ${availText(c.avail)}. I can't make it. Please schedule me inside my availability.\n— ${c.name}`);
    }
  }
}
// Each hour: requests nobody answered before the schedule posted count as a no.
function timeoffHour() {
  for (const p of ptoPending()) {
    if (!ptoLate(p)) continue;
    const c = G.crew.find(x => x.id === p.cid);
    p.state = 'ignored'; p.skip = Math.random() < 0.45;
    bump(c, -7, 'timeoff');
    G.today.ptoIgnored = (G.today.ptoIgnored || 0) + 1;
    toast(`⏰ ${c.name}'s time-off request for ${dayName(p.day)} never got an answer in time. They took that as a no.`, 'bad');
  }
}
// Schedule cells that won't work: outside availability, or on an approved day off.
function schedProblems(w) {
  const s = schedFor(w), ws = weekStart(w), out = [];
  for (const c of G.crew) {
    const row = s.rows[c.id]; if (!row) continue;
    row.forEach((sk, i) => {
      if (sk === OFF) return;
      if (ptoApproved(c.id, ws + i)) out.push({ c, i, why: 'approved day off' });
      else if (!shiftFits(availFor(c, w)[i], sk)) out.push({ c, i, why: `not available (${availText(availFor(c, w))})` });
    });
  }
  return out;
}

// ---- reports ----
function timeoffTips() {
  const t = G.today, tips = [];
  if (t.availNoShow) tips.push(`${plural(t.availNoShow, 'associate')} didn't come in because you scheduled them outside their availability. The schedule screen marks those cells red: fix them before it posts.`);
  if (t.ptoNoShow) tips.push(`${plural(t.ptoNoShow, 'associate')} had today approved off but were still on the schedule. Approving a request means taking them off that day.`);
  if (t.ptoIgnored) tips.push(`${plural(t.ptoIgnored, 'time-off request')} went unanswered until the schedule posted. A late "no" is worse than a "no": answer requests in the Schedule tab.`);
  if (ptoPending().length) tips.push(`${plural(ptoPending().length, 'time-off request')} ${ptoPending().length === 1 ? 'is' : 'are'} waiting for your answer (🗓 Schedule).`);
  return tips;
}
function timeoffDayExtras() {
  const t = G.today;
  return { ptoAsked: t.ptoAsked || 0, ptoOk: t.ptoOk || 0, ptoNo: t.ptoNo || 0, ptoIgnored: t.ptoIgnored || 0, ptoNoShow: t.ptoNoShow || 0, ptoSkip: t.ptoSkip || 0, availNoShow: t.availNoShow || 0 };
}
function timeoffReviewNotes(days, note, praise) {
  const s = k => sum(days.map(d => d[k] || 0));
  const ign = s('ptoIgnored'), noShow = s('ptoNoShow') + s('availNoShow'), no = s('ptoNo'), ok = s('ptoOk'), skip = s('ptoSkip');
  if (noShow) note('Scheduling', `${plural(noShow, 'shift')} went unworked because people were scheduled when they couldn't work (outside their availability or on an approved day off).`,
    'That\'s a hole in the day you made yourself, and it tells the crew you don\'t read what they tell you.',
    'Before you post, check every red cell on the schedule. Availability and approved days off come first; then fill the hours.', noShow >= 3);
  if (ign) note('Time-off requests', `${plural(ign, 'request')} went unanswered until the schedule posted.`,
    'People plan their lives around the answer. Silence is the worst answer.',
    'Answer every request within a day or two, and always before Thursday\'s schedule posts.');
  else if (no > ok + 1) note('Time-off requests', `You said no to ${no} of ${no + ok} time-off requests${skip ? `, and ${skip} of those people called in "sick" that day anyway` : ''}.`,
    'A denied request for something that matters costs more than the shift: morale drops, and the shift often goes unworked anyway.',
    'Say yes when you can cover it. Approved early, a day off is easy to schedule around.');
  else if (ok + no >= 2) praise.push(`You answered every time-off request on time (${ok} approved, ${no} denied).`);
}

// ---- Schedule tab: the requests panel ----
function ptoPanelHTML(w) {
  const pend = ptoPending().sort((a, b) => a.day - b.day);
  const soon = G.pto.filter(p => p.state === 'approved' && p.day >= G.day && p.day < G.day + 21 && G.crew.some(c => c.id === p.cid)).sort((a, b) => a.day - b.day);
  let h = `<div class="card" style="margin:8px 0"><b>✋ Time-off requests</b> <span class="mute">Answer before that week's schedule posts (Thursday ${fmtTime(SCHED_CUTOFF)} the week before). Approving takes them off that day.</span>`;
  if (!pend.length) h += '<div class="mute" style="margin-top:4px">Nothing waiting.</div>';
  for (const p of pend) {
    const c = G.crew.find(x => x.id === p.cid), s = G.sched && G.sched[weekOf(p.day)], sk = s && s.rows[c.id] ? s.rows[c.id][dowIdx(p.day)] : null;
    const offThen = G.pto.filter(q => q !== p && q.day === p.day && q.state === 'approved').map(q => q.name);
    const due = ptoDueText(p);
    h += `<div style="margin-top:6px">${esc(c.name)}: <b>${dayName(p.day)}</b> (week ${weekOf(p.day)}) for ${esc(p.reason)}${p.big ? ' <span class="warn">matters a lot to them</span>' : ''} · ${sk && sk !== OFF ? `scheduled ${SHIFTS[sk].name}` : 'not scheduled yet'}${offThen.length ? ` · already off that day: ${offThen.map(esc).join(', ')}` : ''} · <span class="mute">${due}</span>
      <button class="primary" onclick="UI.ptoAnswer(${p.id},true)">Approve</button> <button onclick="UI.ptoAnswer(${p.id},false)">Deny</button></div>`;
  }
  if (soon.length) h += `<div class="mute" style="margin-top:6px">Approved days off coming up: ${soon.map(p => `${esc(p.name)} ${dayName(p.day)}`).join(' · ')}</div>`;
  const probs = schedProblems(w);
  if (probs.length) h += `<div class="bad" style="margin-top:6px">⚠ ${plural(probs.length, 'shift')} this week won't be worked (red cells): ${probs.slice(0, 5).map(x => `${esc(x.c.name)} ${WEEKDAYS[x.i]}`).join(', ')}${probs.length > 5 ? '…' : ''}.</div>`;
  return h + '</div>';
}
