'use strict';
// =====================================================================
//  Progressive discipline.
//  Attendance and repeat performance problems go on file:
//  - Tardy: clocked in late (they aren't working or paid until they show).
//  - No-call no-show: didn't come in and didn't call.
//  - Repeat mistake: a trained associate making the same mistake again
//    within a week (a rookie's mistakes are a training problem: coach them).
//  Calling out sick with notice is not on this list.
//  The steps: documented verbal → written warning → final written warning
//  → termination. Each step needs a new problem since the last one.
//  A no-call no-show goes straight to a final; a second one ends the job.
//  Skip a step and HR sends it back; write someone up with nothing on file
//  and it looks like a grudge. Let problems sit and the team notices.
// =====================================================================
const DISC_LEVELS = ['None', 'Documented verbal', 'Written warning', 'Final written warning', 'Termination'];
const DISC_OPEN_DAYS = 14;   // a problem older than this is too old to act on
const DISC_STALE = 5;        // days before the team notices nobody acted
const DISC_HELP_DAYS = 21;   // after a step, problems are half as likely
const INFR = {
  tardy: { name: 'Tardy', icon: '⏰' },
  ncns: { name: 'No-call no-show', icon: '🚫' },
  repeat: { name: 'Repeat mistake', icon: '🔁' },
};
// What goes in the write-up: [key, text, belongs]
const DISC_DOC = [
  ['dates', 'The date and time of each incident', true],
  ['policy', 'The policy or expectation that was broken', true],
  ['expect', 'What has to change, starting now', true],
  ['next', 'What happens if it happens again (the next step)', true],
  ['sign', 'Their signature (or "refused to sign" and a witness)', true],
  ['attitude', 'Your opinion of their attitude', false],
  ['rumor', 'Complaints from coworkers you didn\'t see yourself', false],
  ['compare', 'How they compare to other associates', false],
];

function ensureDisc(c) { if (!c.disc) c.disc = { level: 0, day: null, hist: [] }; c.infr = c.infr || []; return c; }
function logInfr(c, kind, detail) {
  ensureDisc(c);
  c.infr.push({ id: nid(), kind, day: G.day, detail, handled: false });
  c.infr = c.infr.filter(i => i.day >= G.day - 45);
}
const discOpen = c => ensureDisc(c).infr.filter(i => !i.handled && i.day >= G.day - DISC_OPEN_DAYS);
// The step policy calls for right now (0 = nothing yet, just coach).
function discCalledFor(c) {
  const o = discOpen(c), lv = ensureDisc(c).disc.level;
  if (!o.length) return 0;
  if (o.some(i => i.kind === 'ncns')) return lv >= 3 ? 4 : 3;
  const n = o.filter(i => i.kind === 'tardy').length + o.filter(i => i.kind === 'repeat').length * 2;
  if (n < 2) return 0;
  return Math.min(4, lv + 1);
}
const discDue = c => discCalledFor(c) > 0;
const discMult = c => (ensureDisc(c).disc.day != null && G.day - c.disc.day <= DISC_HELP_DAYS ? 0.5 : 1);

// ---- days ----
function discStartDay() {
  for (const c of G.crew) {
    ensureDisc(c); c.lateDay = null; c.ncnsSeen = false; c.lateSeen = false;
    const sk = curShift(c);
    if (!sk || c.calledOut || G.day < 2) continue;
    const m = ensureMorale(c).morale, poor = c.rel === 'poor' ? 1 : 0, low = m < 40 ? 1 : 0, mult = discMult(c);
    if (Math.random() < (0.008 + poor * 0.025 + low * 0.015) * mult) { c.calledOut = true; c.ncnsDay = G.day; logInfr(c, 'ncns', `${SHIFTS[sk].name} shift`); continue; }
    if (Math.random() < (0.035 + poor * 0.06 + low * 0.04) * mult) { c.lateDay = G.day; c.lateMin = randi(8, 40); logInfr(c, 'tardy', `${c.lateMin} min late for ${SHIFTS[sk].name}`); }
  }
  // problems nobody acted on: the team sees it
  for (const c of G.crew) {
    const o = discOpen(c);
    if (discDue(c) && o.length && G.day - Math.min(...o.map(i => i.day)) >= DISC_STALE && c.discStaleDay !== G.day) {
      c.discStaleDay = G.day; teamBump(-1, null, c); G.today.discStale = (G.today.discStale || 0) + 1;
    }
  }
}
const isLate = c => c.lateDay === G.day && curShift(c) && G.time < SHIFTS[curShift(c)].start + c.lateMin;
function discHour() {
  for (const c of G.crew) {
    const sk = curShift(c); if (!sk) continue;
    const st = SHIFTS[sk].start;
    if (c.ncnsDay === G.day && !c.ncnsSeen && G.time >= st + 15) { c.ncnsSeen = true; toast(`🚫 ${c.name} never showed up for their ${SHIFTS[sk].name} shift, and didn't call. That's a no-call no-show.`, 'bad'); }
    if (c.lateDay === G.day && !c.lateSeen && G.time >= st + c.lateMin) { c.lateSeen = true; toast(`⏰ ${c.name} clocked in ${c.lateMin} minutes late.`, 'warn'); }
  }
}
// Called from rollMistake: the same mistake again from someone who's trained.
function discMistake(c, area) {
  c.mlog = (c.mlog || []).filter(m => m.day >= G.day - 7);
  const again = c.mlog.some(m => m.area === area);
  c.mlog.push({ area, day: G.day });
  if (again && ensureTrain(c).train[area] >= 60 && !ensureDisc(c).infr.some(i => i.kind === 'repeat' && i.area === area && i.day >= G.day - 7)) {
    logInfr(c, 'repeat', TRAIN_AREAS[area].mistake); c.infr[c.infr.length - 1].area = area;
  }
}
// A write-up from a floor conflict counts as a step too.
function discFromConflict(c) { ensureDisc(c); if (c.disc.level < 3) { c.disc.level++; c.disc.day = G.day; c.disc.hist.push({ day: G.day, level: c.disc.level, why: 'Conduct (argument on the floor)' }); } }

// ---- the write-up ----
function discSheetHTML(c) {
  ensureDisc(c);
  const o = discOpen(c), old = c.infr.filter(i => !o.includes(i));
  const row = i => `<tr><td>${dayLabel(i.day)}</td><td>${INFR[i.kind].icon} ${INFR[i.kind].name}</td><td class="mute">${esc(i.detail || '')}</td><td>${i.handled ? '<span class="mute">addressed</span>' : i.day < G.day - DISC_OPEN_DAYS ? '<span class="mute">too old</span>' : '<span class="warn">open</span>'}</td></tr>`;
  return `<h2>✎ Corrective action: ${esc(c.name)}</h2>
    <p>Current step: <b>${DISC_LEVELS[c.disc.level]}</b>${c.disc.day != null ? ` (Day ${c.disc.day})` : ''}. Call-outs with notice: ${c.callouts || 0} (sick calls aren't discipline).</p>
    <table><tr><th>Day</th><th>Problem</th><th>Detail</th><th>Status</th></tr>${o.concat(old).slice(-10).map(row).join('') || '<tr><td colspan="4" class="mute">Nothing on file.</td></tr>'}</table>
    <p class="mute" style="margin-top:6px">Policy: documented verbal → written → final → termination, one step per new problem. Two tardies (or one repeat mistake by a trained associate) earns the next step. A no-call no-show goes straight to a final; a second one ends employment.</p>
    <h3>Action</h3><div>${DISC_LEVELS.map((l, k) => `<label style="display:block"><input type="radio" name="dc-lv" value="${k}" ${k === 0 ? 'checked' : ''}> ${k === 0 ? 'Coach only, no paperwork' : l}</label>`).join('')}</div>
    <h3>What goes in the write-up</h3><div>${shuffle(DISC_DOC.slice()).map(([k, t]) => `<label style="display:block"><input type="checkbox" class="dc-doc" value="${k}"> ${esc(t)}</label>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px"><button onclick="UI.hideModal()">Cancel</button><button class="primary" onclick="UI.discSubmit(${c.id})">Deliver it</button></div>`;
}
// Returns {good, title, why}
function discDeliver(id, lv, docs) {
  const c = G.crew.find(x => x.id === id); if (!c) return null;
  ensureDisc(c);
  const t = G.today, right = discCalledFor(c), o = discOpen(c);
  const missing = DISC_DOC.filter(d => d[2] && !docs.includes(d[0])), extra = DISC_DOC.filter(d => !d[2] && docs.includes(d[0]));
  const docNote = lv > 0 && (missing.length || extra.length) ? ` Documentation: ${[missing.length && `missing ${missing.map(d => d[1].toLowerCase()).join('; ')}`, extra.length && `remove ${extra.map(d => d[1].toLowerCase()).join('; ')} (opinions and hearsay don't belong in a write-up)`].filter(Boolean).join('. ')}.` : '';
  const hr = (subj, body) => mail('HR', subj, `${body}\n— HR`);
  t.discActs = (t.discActs || 0) + 1;
  if (lv === 0) {
    if (right === 0) { if (o.length) bump(c, 1, 'fair'); return { good: 'best', title: 'Coached', why: o.length ? 'One problem isn\'t a pattern yet. A quick private talk about the expectation is the right first move, and it\'s on your radar now.' : 'Nothing on file. Coaching is always fine.' }; }
    t.discSoft = (t.discSoft || 0) + 1;
    return { good: 'bad', title: 'Too soft', why: `Policy calls for a ${DISC_LEVELS[right].toLowerCase()} here. Talking again without paperwork tells them nothing changes, and tells the team the rules are optional.` };
  }
  if (!o.length) {
    bump(c, -8, 'writeup'); t.discHr = (t.discHr || 0) + 1;
    hr(`Write-up returned: ${c.name}`, `There's nothing open on file for ${c.name} to support a ${DISC_LEVELS[lv].toLowerCase()}. Discipline has to be tied to a documented problem, or it looks like a grudge (and could look like retaliation).`);
    return { good: 'bad', title: 'HR sent it back', why: 'Nothing open on file. Discipline needs a documented problem behind it. They feel targeted, and the team heard about it.' };
  }
  if (lv > right) {
    t.discHr = (t.discHr || 0) + 1;
    hr(`${DISC_LEVELS[lv]} returned: ${c.name}`, `${c.name} is at "${DISC_LEVELS[c.disc.level]}". Policy calls for ${right ? `a ${DISC_LEVELS[right].toLowerCase()}` : 'coaching only (one problem isn\'t a pattern yet)'}. We don't skip steps: it isn't fair to the associate, and it won't hold up if they challenge it.${lv === 4 ? ' The termination is not approved.' : ''}`);
    return { good: 'bad', title: lv === 4 ? 'HR didn\'t approve the termination' : 'HR sent it back: you skipped a step', why: `They're at "${DISC_LEVELS[c.disc.level]}". The next step is ${right ? DISC_LEVELS[right].toLowerCase() : 'coaching (it isn\'t a pattern yet)'}. Progressive discipline only works if every step happens: the associate gets a fair chance to fix it, and the store is protected if it ends in a termination.` };
  }
  // delivered (right step, or a lighter one than called for)
  o.forEach(i => { i.handled = true; });
  const docOk = !missing.length && !extra.length;
  if (!docOk) t.discDocBad = (t.discDocBad || 0) + 1;
  if (lv === 4) {
    t.discFired = (t.discFired || 0) + 1;
    hr(`Separation approved: ${c.name}`, `Termination for ${c.name} is approved: every step is on file.${docNote ? ' Note: ' + docNote : ''}`);
    c.strikes = Math.max(c.strikes || 0, 3);
    letGo(c, 'fired');
    return { good: docOk ? 'best' : 'ok', title: `${c.name} was let go`, why: `Every step was documented, so this was fair and it will hold up. The team saw the rules are real.${docNote}` };
  }
  c.disc.level = lv; c.disc.day = G.day; c.disc.hist.push({ day: G.day, level: lv, why: o.map(i => INFR[i.kind].name).join(', ') });
  c.strikes = (c.strikes || 0) + 1; bump(c, -4, 'writeup');
  if (lv < right) { t.discSoft = (t.discSoft || 0) + 1; return { good: 'ok', title: `${DISC_LEVELS[lv]} delivered (lighter than policy)`, why: `Policy called for a ${DISC_LEVELS[right].toLowerCase()}. Going lighter than the policy is inconsistent: the next person with the same record will expect the same break.${docNote}` }; }
  addXP(docOk ? 10 : 4, G.player);
  return { good: docOk ? 'best' : 'ok', title: `${DISC_LEVELS[lv]} delivered`, why: `Right step, and it's on file. ${lv === 3 ? 'They know the next problem ends the job.' : 'They know what the next step is.'}${docOk ? ' The write-up has the facts, the policy, the expectation, the next step and a signature, and nothing else.' : docNote}` };
}
function discResultHTML(r) {
  return `<h2>${r.good === 'best' ? '✅' : r.good === 'bad' ? '❌' : '➖'} ${esc(r.title)}</h2><p>${esc(r.why)}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="primary" onclick="UI.hideModal(); UI.openComputer(); UI.setTab('crew')">OK</button></div>`;
}
const discBadge = c => { ensureDisc(c); const o = discOpen(c), lv = c.disc.level; return `${lv ? ` <span class="warn" title="Discipline step">✎ ${DISC_LEVELS[lv].replace(' warning', '').replace('Documented ', '')}</span>` : ''}${o.length ? ` <span class="${discDue(c) ? 'bad' : 'mute'}" title="Open problems">${o.map(i => INFR[i.kind].icon).join('')}</span>` : ''}`; };

// ---- checklist & reports ----
function discTasks(add) {
  const due = G.crew.filter(c => discDue(c));
  if (due.length) add('disc', 'disc', 'Corrective action', `${due.map(c => c.name).join(', ')}: attendance or repeat problems on file (Crew tab → ✎)`, 1380, 'by');
}
function discTips() {
  const t = G.today, tips = [];
  if (t.discStale) tips.push(`${plural(t.discStale, 'associate')} has had problems on file for ${DISC_STALE}+ days with no action. The rest of the crew notices who gets away with it.`);
  if (t.discHr) tips.push('HR sent a write-up back today. Follow the steps: verbal, written, final, termination, one per new problem.');
  return tips;
}
function discDayExtras() {
  const t = G.today;
  return { discActs: t.discActs || 0, discHr: t.discHr || 0, discSoft: t.discSoft || 0, discStale: t.discStale || 0, discDocBad: t.discDocBad || 0, discFired: t.discFired || 0,
    tardies: G.crew.filter(c => c.lateDay === G.day).length, ncns: G.crew.filter(c => c.ncnsDay === G.day).length };
}
function discReviewNotes(days, note, praise) {
  const s = k => sum(days.map(d => d[k] || 0));
  if (s('discHr')) note('Discipline', `HR sent back ${plural(s('discHr'), 'write-up')} this week.`,
    'Skipped steps and write-ups with nothing on file don\'t hold up, and they feel unfair to the associate and the team.',
    'Check the step they\'re on (Crew tab → ✎). Verbal, written, final, termination: one step per new problem. A no-call no-show goes to a final.');
  if (s('discStale') >= 3) note('Discipline', 'Attendance problems sat on file with no action.',
    'When one person can show up late again and again, the people who show up on time stop caring.',
    'Act within a few days of the second problem. It\'s on your checklist when someone is due.');
  if (s('discDocBad')) note('Discipline', `${plural(s('discDocBad'), 'write-up')} had documentation problems.`,
    'A write-up is a legal document. Missing facts or added opinions make it worthless if it\'s ever challenged.',
    'Dates and times, the policy, the expectation, the next step, and a signature. No opinions, no hearsay, no comparisons.');
  if (s('discSoft') >= 2) note('Discipline', 'You went lighter than the policy more than once.',
    'Inconsistent discipline is unfair: the next person with the same record will expect the same break.',
    'Follow the policy the same way for everyone.');
  if (s('discActs') && !s('discHr') && !s('discDocBad') && !s('discSoft')) praise.push('Every corrective action this week followed the steps and was documented right.');
}
