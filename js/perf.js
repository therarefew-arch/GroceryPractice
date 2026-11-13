'use strict';
// =====================================================================
//  Performance reviews and raises.
//  Every associate gets a review 14 days after they start (the probation
//  review), then every 28 days. The Crew tab shows who's due. A review is
//  four ratings (1 to 5) from the facts on file, and a raise from the merit
//  matrix.
//  - Rate from the facts. Rate someone below what they did and they feel
//    cheated. Rate them above it and the review is useless as documentation
//    (and the DM notices).
//  - Raise inside the matrix for their overall rating. Short a top
//    performer and they may walk. Overpay everybody and you blow the merit
//    budget (3% average).
//  - A review that's late tells people you don't care about their work.
// =====================================================================
const PERF_FIRST = 14, PERF_EVERY = 28, PERF_LATE = 3;
const MERIT_BUDGET = 3; // % average raise
const PERF_CATS = {
  prod: { name: 'Productivity', ask: 'How much good work do they get done?' },
  acc: { name: 'Accuracy', ask: 'Do they do it right the first time?' },
  att: { name: 'Attendance', ask: 'Do they show up for their shifts?' },
  team: { name: 'Teamwork', ask: 'How do they get along with the crew?' },
};
// overall rating → raise range (%)
const MERIT = [[2, 0, 0], [2.75, 1, 2], [3.5, 2, 3], [4.25, 3, 4], [9, 4, 5]];
const meritFor = o => { const m = MERIT.find(x => o < x[0]); return { lo: m[1], hi: m[2] }; };

function ensurePerf() {
  G.crew.forEach((c, i) => {
    if (c.nextReview == null) c.nextReview = (c.hired || 1) + PERF_FIRST + (c.hired ? 0 : i * 3);
    c.sched = c.sched || 0; c.callouts = c.callouts || 0; c.fights = c.fights || 0;
  });
  G.raises = G.raises || [];
}
const reviewDue = c => G.day >= c.nextReview;
const reviewsDue = () => G.crew.filter(reviewDue);

// What the facts say, 1 to 5 per category.
function perfEvidence(c) {
  ensureTrain(c);
  const days = Math.max(3, c.days || 0), rk = crewRank(c).key;
  const prod = clamp(Math.round(c.skill + (rk === 'star' ? 1 : rk === 'pro' ? 0.5 : rk === 'rookie' ? -0.5 : 0)), 1, 5);
  const mr = (c.mistakes || 0) / days * 10;
  const acc = clamp(Math.round(5 - mr * 1.2 + (trainAvg(c) >= 80 ? 0.5 : 0)), 1, 5);
  const cr = c.callouts / Math.max(4, c.sched);
  const att = cr === 0 ? 5 : cr < 0.05 ? 4 : cr < 0.1 ? 3 : cr < 0.2 ? 2 : 1;
  const fr = c.fights / Math.max(1, days / 20);
  const team = clamp(Math.round((fr < 0.5 ? (c.trait === 'social' || c.lead ? 5 : 4) : fr < 1.5 ? 3 : fr < 2.5 ? 2 : 1) - (c.trait === 'hothead' ? 0.5 : 0)), 1, 5);
  return { prod, acc, att, team };
}
const perfOverall = r => sum(Object.values(r)) / 4;
// The facts you see on the review sheet.
function perfFacts(c) {
  ensureTrain(c);
  return {
    prod: `Skill ${'★'.repeat(c.skill)} · rank ${crewRank(c).name} · ${c.days || 0} days worked`,
    acc: `${plural(c.mistakes || 0, 'mistake')} in ${c.days || 0} days · ${Math.round(trainAvg(c))}% trained · coached ${c.coached || 0} times`,
    att: `Called out ${c.callouts} of ${plural(c.sched, 'scheduled shift')}`,
    team: `Started ${plural(c.fights, 'argument')} · ${TRAITS[c.trait].name} (${TRAITS[c.trait].desc.toLowerCase()})${c.lead ? ' · Lead' : ''}`,
  };
}

// ---- writing the review ----
function submitReview(id, rates, raise) {
  const c = G.crew.find(x => x.id === id); if (!c || !reviewDue(c)) return null;
  const ev = perfEvidence(c), ovYou = perfOverall(rates), ovEv = perfOverall(ev), m = meritFor(ovEv);
  const gaps = Object.keys(PERF_CATS).map(k => ({ k, you: rates[k], ev: ev[k], d: rates[k] - ev[k] }));
  const gap = ovYou - ovEv, t = G.today;
  const verdict = { name: c.name, gaps, ovYou, ovEv, raise, lo: m.lo, hi: m.hi, notes: [] };
  const oldWage = c.wage;
  c.wage = +(c.wage * (1 + raise / 100)).toFixed(2);
  bump(c, 3, 'reviewed');
  if (gap <= -0.75 || gaps.some(g => g.d <= -2)) { bump(c, -8, 'review'); verdict.harsh = true; verdict.notes.push(`You rated ${c.name} below what the facts show. They read it as "my work doesn't count here."`); }
  else if (gap >= 0.75 || gaps.some(g => g.d >= 2)) { verdict.inflated = true; c.inflated = G.day; verdict.notes.push(`You rated ${c.name} above what the facts show. It feels nice today, but if you ever need to address a problem, this review says there wasn't one.`); }
  else verdict.notes.push('Your ratings match the facts. That\'s a review they can trust.');
  if (raise < m.lo) {
    bump(c, -6, 'review'); verdict.low = true;
    verdict.notes.push(`${raise}% is below the merit matrix for their rating (${m.lo}–${m.hi}%).`);
    if (ovEv >= 4 && !c.notice && Math.random() < 0.35) { c.notice = G.day + 3; mail(c.name, 'Putting in my notice', `I worked hard for that review, and the raise says otherwise. I found something else. My last day is ${dayLabel(c.notice)}.\n— ${c.name}`); verdict.notes.push(`${c.name} gave notice. Top performers know what they're worth.`); }
  } else if (raise > m.hi) { bump(c, 6, 'raise'); verdict.high = true; verdict.notes.push(`${raise}% is above the matrix (${m.lo}–${m.hi}%). It comes out of the merit budget everyone else shares.`); }
  else { bump(c, 4, 'raise'); verdict.notes.push(`${raise}% is inside the matrix (${m.lo}–${m.hi}%).`); }
  G.raises.push({ day: G.day, id: c.id, name: c.name, raise, ovEv: +ovEv.toFixed(2), ovYou: +ovYou.toFixed(2), from: oldWage, to: c.wage });
  G.raises = G.raises.slice(-60);
  c.nextReview = G.day + PERF_EVERY; c.lastReview = G.day;
  t.reviewsDone = (t.reviewsDone || 0) + 1;
  if (verdict.harsh || verdict.inflated) t.reviewsOff = (t.reviewsOff || 0) + 1;
  addXP(10, G.player);
  return verdict;
}
const meritAvg = () => { const r = (G.raises || []).slice(-20); return r.length ? sum(r.map(x => x.raise)) / r.length : 0; };

// ---- days ----
function perfStartDay() {
  ensurePerf();
  for (const c of G.crew) {
    if (G.day === c.nextReview) mail('Human Resources', `Review due: ${c.name}`, `${c.name}'s ${c.lastReview ? '' : 'probation '}performance review is due today. Office computer → Crew → 📝 Review.\nRate from the facts on file, then pick a raise from the merit matrix. Late reviews hurt morale.`);
    if (G.day - c.nextReview >= PERF_LATE) { bump(c, -2, 'review'); G.today.reviewsLate = (G.today.reviewsLate || 0) + 1; }
  }
}
function perfEndDay() {
  for (const c of G.crew) { if (curShift(c)) c.sched = (c.sched || 0) + 1; if (c.calledOut) c.callouts = (c.callouts || 0) + 1; }
}

// ---- the sheets ----
function reviewSheetHTML(c) {
  const f = perfFacts(c), sel = k => `<select id="rv-${k}">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n} · ${['Poor', 'Needs work', 'Meets', 'Exceeds', 'Outstanding'][n - 1]}</option>`).join('')}</select>`;
  let h = `<h2>📝 Performance review: ${esc(c.name)}</h2><p class="mute">${ROLES[c.role].name} · $${c.wage.toFixed(2)}/hr · ${c.lastReview ? `last review Day ${c.lastReview}` : 'probation review'}. Rate each area from the facts on file.</p><table>`;
  for (const [k, cat] of Object.entries(PERF_CATS)) h += `<tr><td><b>${cat.name}</b><div class="mute" style="font-size:12px">${cat.ask}</div></td><td>${f[k]}</td><td>${sel(k)}</td></tr>`;
  h += '</table>';
  h += `<p style="margin-top:8px"><b>Merit matrix</b> (overall rating → raise): ${MERIT.map((m, i) => `${i ? MERIT[i - 1][0] : 1}–${m[0] > 5 ? 5 : m[0]}: ${m[1] === m[2] ? `${m[1]}%` : `${m[1]}–${m[2]}%`}`).join(' · ')}. Budget: ${MERIT_BUDGET}% average; you're at ${(G.raises || []).length ? meritAvg().toFixed(1) + '%' : '—'}.</p>`;
  h += `<p>Raise: <select id="rv-raise">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}%  ($${(c.wage * (1 + n / 100)).toFixed(2)}/hr)</option>`).join('')}</select></p>`;
  h += `<div class="row" style="justify-content:flex-end;margin-top:12px"><button onclick="UI.hideModal()">Later</button><button class="primary" onclick="UI.reviewSubmit(${c.id})">Deliver the review</button></div>`;
  return h;
}
function reviewResultHTML(v) {
  let h = `<h2>${v.harsh || v.low || v.inflated || v.high ? '⚠' : '✅'} Review delivered: ${esc(v.name)}</h2><table><tr><th>Area</th><th class="n">You</th><th class="n">The facts</th></tr>`;
  h += v.gaps.map(g => `<tr><td>${PERF_CATS[g.k].name}</td><td class="n">${g.you}</td><td class="n ${Math.abs(g.d) >= 2 ? 'bad' : g.d ? 'warn' : 'good'}">${g.ev}</td></tr>`).join('');
  h += `<tr><td><b>Overall</b></td><td class="n"><b>${v.ovYou.toFixed(2)}</b></td><td class="n"><b>${v.ovEv.toFixed(2)}</b></td></tr></table>`;
  h += `<p>Raise: <b>${v.raise}%</b> (matrix for the facts: ${v.lo}–${v.hi}%)</p>` + v.notes.map(n => `<p>${esc(n)}</p>`).join('');
  return h + '<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="primary" onclick="UI.hideModal(); if (UI.open) UI.render();">Done</button></div>';
}

// ---- reports ----
function perfTips() {
  const due = reviewsDue(), tips = [];
  const late = due.filter(c => G.day - c.nextReview >= PERF_LATE);
  if (late.length) tips.push(`${plural(late.length, 'review')} ${late.length === 1 ? 'is' : 'are'} ${PERF_LATE}+ days late (${late.map(c => c.name).join(', ')}). Every day late costs their morale.`);
  else if (due.length) tips.push(`${plural(due.length, 'performance review')} due: ${due.map(c => c.name).join(', ')} (Crew tab → 📝 Review).`);
  return tips;
}
function perfDayExtras() {
  const t = G.today;
  return { reviewsDone: t.reviewsDone || 0, reviewsOff: t.reviewsOff || 0, reviewsLate: t.reviewsLate || 0 };
}
function perfReviewNotes(days, note, praise) {
  const done = sum(days.map(d => d.reviewsDone || 0)), off = sum(days.map(d => d.reviewsOff || 0)), late = sum(days.map(d => d.reviewsLate || 0));
  const avg = meritAvg(), n = (G.raises || []).length;
  if (late >= 3) note('Performance reviews', `Reviews ran late: ${late} associate-days past due this week.`,
    'A late review says "your work isn\'t worth an hour of my time." It costs morale every day it sits.',
    'Check the Crew tab for 📝 Review due and do them the day they come up.');
  if (off) note('Performance reviews', `${plural(off, 'review')} didn't match the facts on file.`,
    'Rate too low and good people feel cheated. Rate too high and the review is worthless when you need to address a problem.',
    'Rate each area from the facts: what they get done, mistakes, call-outs, arguments.');
  if (n >= 3 && avg > MERIT_BUDGET + 0.75) note('Merit budget', `Your raises average ${avg.toFixed(1)}%. The budget is ${MERIT_BUDGET}%.`,
    'Raises are permanent labor cost. Over budget, the store pays for it every week from now on.',
    'Use the merit matrix: save the top of the range for the top performers.');
  if (done && !off && late < 3) praise.push(`You delivered ${plural(done, 'review')} on time, rated from the facts.`);
}
