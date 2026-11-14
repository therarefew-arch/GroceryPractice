'use strict';
// =====================================================================
//  Crew morale, team conflicts, promotions to Lead, notice & exit interviews.
//  Morale 0–100 changes work speed and call-outs. Unhappy people give notice.
//  Every choice comes with the "why" so you learn what works on a real crew.
// =====================================================================
const TRAITS = {
  easygoing: { name: 'Easygoing', argue: 0.4, desc: 'Rolls with it' },
  hothead: { name: 'Hothead', argue: 2.2, desc: 'Quick temper under pressure' },
  perfectionist: { name: 'Perfectionist', argue: 1.2, desc: 'Hates sloppy work from others' },
  social: { name: 'Social', argue: 0.8, desc: 'Lifts the team, talks a lot' },
  quiet: { name: 'Quiet', argue: 0.6, desc: 'Bottles it up' },
};
const MAX_LEADS = 2, LEAD_RAISE = 1.5, CONFLICT_WINDOW = 40;

const GRIPE_TEXT = {
  schedule: 'My schedule kept changing. I couldn\'t plan my life around this job.',
  ignored: 'I worked hard and nobody ever said a word about it.',
  conflict: 'The drama on this team never got dealt with.',
  sentHome: 'Getting sent home in front of everyone stuck with me.',
  passedOver: 'I asked about moving up and got passed over.',
  rough: 'Every day felt like a losing battle. We were always behind.',
  letGo: 'Watching people get let go out of nowhere made me feel like I was next.',
  writeup: 'That write-up felt unfair.',
  timeoff: 'I asked for a day off that mattered and didn\'t get it, or never even got an answer.',
  avail: 'I told you when I could work, and you kept scheduling me when I couldn\'t.',
  review: 'My review was late, or it didn\'t match the work I actually did. The raise said the same thing.',
};
const FIX_TEXT = {
  schedule: 'Keep schedules steady. Change someone\'s shift only when you have to, and tell them why.',
  ignored: 'Recognize good work out loud. Walk up to a crew member and press E to thank them. It takes five seconds and costs nothing.',
  conflict: 'Step in on arguments right away. Conflict you ignore spreads to the whole team.',
  sentHome: 'Save sending people home for serious problems, like a scene in front of customers.',
  passedOver: 'When a strong worker asks to move up, promote them or tell them exactly what it will take.',
  rough: 'Bad days wear people down. Get the truck and the in-stock under control and the mood follows.',
  letGo: 'Coach and document before you fire anyone. The team watches how you treat people.',
  writeup: 'Write people up for real problems, and explain why. A write-up for a small thing feels like a grudge.',
  timeoff: 'Answer time-off requests fast, and say yes when you can cover it. Approved early, a day off is easy to schedule around.',
  avail: 'Schedule people inside their availability. The red cells on the schedule are shifts nobody will work.',
  review: 'Do reviews on time, rate from the facts, and pay raises from the merit matrix.',
};
const LIKE_TEXT = {
  praised: 'You did notice my work. That meant something.',
  coached: 'I learned a lot from the coaching.',
  promoted: 'You gave me a shot as a lead. I won\'t forget that.',
  fair: 'You handled the drama fairly.',
  heard: 'When I needed a day off, you made it work.',
  direction: 'Every morning I knew what mattered that day.',
  raise: 'My review was fair, and the raise matched it.',
};

function ensureMorale(c) {
  if (c.morale == null) c.morale = 70;
  if (!c.trait) c.trait = pick(Object.keys(TRAITS));
  c.gripes = c.gripes || {}; c.likes = c.likes || {};
  if (c.strikes == null) c.strikes = 0;
  if (c.lastPraised == null) c.lastPraised = G ? G.day : 1;
  return c;
}
function bump(c, n, why) {
  ensureMorale(c);
  c.morale = clamp(c.morale + n, 0, 100);
  if (why) { const b = n < 0 ? c.gripes : c.likes; b[why] = (b[why] || 0) + Math.abs(n); }
}
function teamBump(n, why, except) { G.crew.forEach(c => { if (c !== except) bump(c, n, why); }); }
function teamMorale() { return G.crew.length ? sum(G.crew.map(c => ensureMorale(c).morale)) / G.crew.length : 70; }
function moodOf(c) {
  const m = ensureMorale(c).morale;
  return m >= 80 ? { icon: '😄', name: 'Fired up', col: '#57f287' } : m >= 60 ? { icon: '🙂', name: 'Good', col: '#9be38f' }
    : m >= 40 ? { icon: '😐', name: 'Meh', col: '#f0c94a' } : m >= 20 ? { icon: '😟', name: 'Unhappy', col: '#ff9f6b' } : { icon: '😡', name: 'Ready to quit', col: '#ff5a4e' };
}
// Work-speed multiplier from morale and the Lead role.
function moraleSpeed(c) {
  const m = ensureMorale(c).morale;
  return (m < 25 ? 0.85 : m < 45 ? 0.93 : m >= 80 ? 1.05 : 1) * (c.lead ? 1.05 : 1) * asmSpeed(c);
}
function calloutChance(c) { const m = ensureMorale(c).morale; return Math.max(0.01, 0.04 + (m < 40 ? 0.08 : 0) + (m < 20 ? 0.06 : 0) + (REL_CALLOUT[c.rel] || 0)); }
function sentHomeToday(c) { return c.sentHome === G.day; }
function leadOnShift() { return G.crew.some(c => c.lead && onShift(c)); }
function canPromote(c) {
  const rk = crewRank(c).key;
  return !c.lead && (rk === 'pro' || rk === 'star') && (c.days || 0) >= 5 && G.crew.filter(x => x.lead).length < MAX_LEADS;
}

// ---- Recognition / stay talk (player actions) ------------------------------
function praiseCrew(c) {
  c.praisedDay = G.day; c.lastPraised = G.day;
  bump(c, 8, 'praised');
  stdPraise(c); ownerPraise(c);
  const r = RT.crew[c.id]; if (r) floater(r.x, r.y - 1.3, '+morale', '#57f287');
  toast(`👏 You thanked ${c.name} for their work. ${moodOf(c).icon}`, 'good');
}
function stayTalk(c) {
  c.stayTalk = true;
  bump(c, 15, 'praised');
  toast(c.morale >= 35 ? `${c.name}: "Okay… maybe I'll give it another shot."` : `${c.name}: "I appreciate it, but I don't know."`, c.morale >= 35 ? 'good' : 'warn');
}
function moraleInteraction(p) {
  const near = G.crew.filter(c => { const r = RT.crew[c.id]; return r && r.inBuilding && onShift(c) && dist(r, p) < 1.4; });
  const quitter = near.find(c => c.notice && !c.stayTalk);
  if (quitter) return { label: `Ask ${quitter.name} to stay (gave notice)`, fn: () => startWork(2, 'Talking', () => stayTalk(quitter)) };
  const pr = near.find(c => c.praisedDay !== G.day);
  if (pr) return { label: `Thank ${pr.name} for their work (+morale)`, fn: () => startWork(1, 'Recognizing', () => praiseCrew(pr)) };
  return null;
}

// ---- Conflicts --------------------------------------------------------------
const CONFLICT_TOPICS = [
  { sev: 1, t: (a, b) => `${a} is upset that ${b} left a half-worked float in the aisle.` },
  { sev: 1, t: (a, b) => `${a} and ${b} are arguing over who gets the pallet jack.` },
  { sev: 1, t: (a, b) => `${a} thinks ${b} is taking way too long on break.` },
  { sev: 1, t: (a, b) => `${a} and ${b} can't agree on how the shelf should be faced.` },
  { sev: 2, t: (a, b) => `${a} says ${b} always leaves the hard work for everyone else.` },
  { sev: 2, t: (a, b) => `${a} snapped at ${b} over a shift swap that fell through.` },
  { sev: 2, t: (a, b) => `${a} is complaining loudly about ${b} to the rest of the crew.` },
  { sev: 3, t: (a, b) => `${a} is yelling at ${b} on the sales floor. Customers are staring.` },
  { sev: 3, t: (a, b) => `${a} shoved a cart into ${b}'s float on purpose.` },
];
const SEV_NAME = { 1: 'Minor', 2: 'Heated', 3: 'Serious' };

function conflictHour() {
  if (G.phase !== 'day' || G.conflict || (G.today.conflicts || 0) >= 2 || G.time - (G.lastConflictEnd || -999) < 180 && G.time > (G.lastConflictEnd || 0) || G.time < OPEN || G.time > CLOSE - 90) return;
  const here = G.crew.filter(c => { const r = RT.crew[c.id]; return onShift(c) && r && r.inBuilding && !r.onBreak; });
  if (here.length < 2) return;
  const w = here.map(c => TRAITS[ensureMorale(c).trait].argue * (c.morale < 40 ? 2 : c.morale < 60 ? 1.3 : 1) * (isStar(c) || c.lead ? 0.4 : 1));
  const chance = 0.05 * (sum(w) / w.length) * (teamMorale() < 50 ? 1.6 : 1) * (leadOnShift() ? 0.6 : 1);
  if (Math.random() > chance) return;
  let roll = Math.random() * sum(w), ai = 0;
  while (ai < w.length - 1 && (roll -= w[ai]) > 0) ai++;
  const a = here[ai], b = pick(here.filter(c => c !== a));
  startConflict(a, b);
}
function startConflict(a, b, topic) {
  const tp = topic || pick(CONFLICT_TOPICS.filter(t => t.sev <= (a.trait === 'hothead' || a.morale < 35 ? 3 : 2)));
  const id = nid();
  G.conflict = { id, a: a.id, b: b.id, sev: tp.sev, text: tp.t(a.name, b.name), start: G.time };
  a.fights = (a.fights || 0) + 1; // on file for their review (js/perf.js)
  G.today.conflicts = (G.today.conflicts || 0) + 1;
  const ra = rt(a), rb = rt(b);
  finishPlan(a, ra); finishPlan(b, rb);
  const hold = (r, other) => ({ loop: () => { r.label = 'Arguing!'; r.intent = `Arguing with ${other.name}`; return !G.conflict || G.conflict.id !== id; } });
  ra.plan = [hold(ra, b)];
  rb.plan = [{ go: () => { const ring = tilesAround(ra, 1).filter(t => !(t.x === Math.floor(ra.x) && t.y === Math.floor(ra.y))); return ring.length ? ring : tilesAround(ra, 2); } }, hold(rb, a)];
  ra.intent = rb.intent = 'Arguing';
  toast(`⚡ ${G.conflict.text} Go step in (${SEV_NAME[tp.sev].toLowerCase()}).`, 'warn');
}
function conflictCrew() { const k = G.conflict; return k ? [G.crew.find(c => c.id === k.a), G.crew.find(c => c.id === k.b)] : []; }
function conflictTick(gm) {
  const k = G.conflict; if (!k) return;
  const [a, b] = conflictCrew();
  if (!a || !b || !onShift(a) || !onShift(b)) { G.conflict = null; return; }
  if (k.sev >= 2) G.sat = Math.max(0, G.sat - 0.02 * k.sev * gm);
  // You're not here: a Lead on shift steps in.
  const lead = G.player.away && G.time - k.start >= 10 && G.crew.find(c => c.lead && onShift(c) && c !== a && c !== b);
  if (lead) {
    G.conflict = null; G.lastConflictEnd = G.time; G.today.leadSettled = (G.today.leadSettled || 0) + 1;
    toast(`◆ ${lead.name} (Lead) stepped in and settled it between ${a.name} and ${b.name}.`, 'good');
    return;
  }
  if (G.time - k.start >= CONFLICT_WINDOW) {
    bump(a, -6, 'conflict'); bump(b, -6, 'conflict'); teamBump(-2, 'conflict', null);
    G.today.conflictsIgnored = (G.today.conflictsIgnored || 0) + 1;
    G.conflict = null; G.lastConflictEnd = G.time;
    toast(`😤 Nobody stepped in between ${a.name} and ${b.name}. The whole team noticed. (morale down)${G.player.away ? ' Schedule a Lead for the hours you are off.' : ''}`, 'bad');
  }
}
function conflictInteraction(p) {
  if (!G.conflict) return null;
  const [a, b] = conflictCrew();
  const near = [a, b].some(c => c && RT.crew[c.id] && dist(RT.crew[c.id], p) < 1.8);
  return near ? { label: `Step in: ${a.name} and ${b.name} are arguing`, fn: () => UI.showConflict() } : null;
}

// The right call depends on how serious it is and the instigator's history.
function resolveConflict(choice) {
  const k = G.conflict; if (!k) return;
  const [a, b] = conflictCrew();
  const sev = k.sev, priors = a.strikes;
  let verdict, why, good;
  const end = () => { G.conflict = null; G.lastConflictEnd = G.time; [a, b].forEach(c => { const r = RT.crew[c.id]; if (r && r.plan) finishPlan(c, r); }); };
  if (choice === 'talk') {
    if (sev === 1 || (sev === 2 && priors === 0)) {
      bump(a, 5, 'fair'); bump(b, 5, 'fair'); teamBump(1, null);
      good = true; verdict = 'Good call: you talked it out.';
      why = 'A small conflict is a communication problem, not a discipline problem. Pulling both sides aside, letting each one talk and agreeing on a fix shows the team you take them seriously, without punishing anyone.';
    } else {
      bump(b, -6, 'conflict'); teamBump(-1, 'conflict');
      good = false; verdict = 'Too soft for this one.';
      why = sev === 3 ? 'A scene in front of customers is a conduct issue. A friendly talk tells everyone, including the person on the receiving end, that it\'s acceptable.' : `${a.name} already has a write-up on file. Talking again without consequences teaches them nothing changes.`;
    }
  } else if (choice === 'split') {
    bump(a, -1); bump(b, -1);
    good = sev <= 2; verdict = sev <= 2 ? 'It works for today.' : 'You stopped the scene, but that\'s it.';
    why = 'Splitting them up ends the moment, but nothing gets solved and it tends to come back. It\'s fine when you\'re slammed. Follow up with both of them later.';
  } else if (choice === 'writeup') {
    a.strikes++; bump(a, sev === 1 ? -10 : -5, 'writeup'); discFromConflict(a);
    if (sev >= 2) { bump(b, 4, 'fair'); good = true; verdict = `Documented: ${a.name} now has ${a.strikes} write-up${a.strikes > 1 ? 's' : ''}.`; why = 'Heated or serious behavior needs to be on paper. It sets a clear expectation, and if it keeps happening you have the history to act on.'; }
    else { teamBump(-1, 'writeup'); good = false; verdict = 'A write-up for that is heavy-handed.'; why = 'A disagreement about a float or a pallet jack isn\'t misconduct. Writing it up feels like a grudge and makes people stop telling you about problems.'; }
  } else if (choice === 'home') {
    a.sentHome = G.day; bump(a, -12, 'sentHome');
    const r = RT.crew[a.id]; if (r) finishPlan(a, r);
    if (sev === 3) { bump(b, 5, 'fair'); good = true; verdict = `${a.name} was sent home for the day.`; why = 'Yelling or getting physical in front of customers can\'t continue on the floor. Sending them home ends it right away and protects your customers and the other worker. Follow up with a write-up tomorrow.'; a.strikes++; }
    else { teamBump(-3, 'sentHome', a); good = false; verdict = 'Sending someone home for that was harsh.'; why = 'You lost a worker\'s hours for the rest of the shift and the team saw a punishment that didn\'t fit the problem. Save it for serious conduct.'; }
  } else if (choice === 'fire') {
    if (sev === 3 && priors >= 2) { good = true; verdict = `${a.name} was let go.`; why = `This was the third serious problem and it\'s all documented. Keeping ${a.name} would tell the rest of the crew the rules don\'t matter.`; teamBump(3, 'fair', a); }
    else { good = false; verdict = `${a.name} was let go, and the team is rattled.`; why = priors < 2 ? 'Firing without a documented history looks like a snap decision. Everyone on the crew is now wondering if they\'re next. Coach first, then write up, then terminate.' : 'Firing over a minor or heated argument is out of proportion, even with a history.'; teamBump(-6, 'letGo', a); }
    end();
    letGo(a, 'fired', true);
    G.today.conflictsHandled = (G.today.conflictsHandled || 0) + (good ? 1 : 0);
    return { good, verdict, why };
  }
  end();
  G.today.conflictsHandled = (G.today.conflictsHandled || 0) + (good ? 1 : 0);
  if (good) addXP(15, G.player);
  return { good, verdict, why };
}

// ---- Promotions ---------------------------------------------------------------
function promoteCrew(c) {
  if (!canPromote(c)) return;
  c.lead = true; c.wage = +(c.wage + LEAD_RAISE).toFixed(2); c.promoAsk = null;
  bump(c, 25, 'promoted');
  G.crew.forEach(o => { if (o !== c && o.promoAsk) { bump(o, -6, 'passedOver'); } });
  const r = RT.crew[c.id]; if (r && r.inBuilding) confetti(r.x, r.y, 50);
  toast(`🎖 ${c.name} is now a Department Lead (+$${LEAD_RAISE.toFixed(2)}/hr).`, 'gold');
  mail(c.name, 'Thank you!', `I won't let you down. I'll keep the new folks on track and help keep the peace on my shift.\n— ${c.name}`);
}
function promoAskHour() {
  if (G.phase !== 'day') return;
  for (const c of G.crew) {
    if (c.promoAsk || c.lead || (c.promoAskAfter || 0) > G.day || !canPromote(c) || !onShift(c) || Math.random() > 0.04) continue;
    c.promoAsk = G.day;
    mail(c.name, 'Can we talk about moving up?', `I've been here ${c.days} days and I think I'm ready to be a lead. Can you think about it? (Promote me from Crew & Schedule.)\n— ${c.name}`);
    toast(`📈 ${c.name} asked about a promotion. Answer within 3 days.`, 'info');
    return;
  }
}

// ---- Leaving: notice, quitting, firing, exit interviews -----------------------
function letGo(c, why, silent) {
  if (!silent) teamBump(c.strikes >= 2 ? 2 : -4, c.strikes >= 2 ? 'fair' : 'letGo', c);
  if (RT.crew[c.id]) { despawnCrew(c); delete RT.crew[c.id]; }
  G.crew = G.crew.filter(x => x !== c);
  if (G.conflict && (G.conflict.a === c.id || G.conflict.b === c.id)) G.conflict = null;
  exitInterview(c, why);
}
function exitInterview(c, why) {
  const top = Object.entries(c.gripes || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
  const like = Object.entries(c.likes || {}).sort((a, b) => b[1] - a[1]).map(e => e[0]).find(k => LIKE_TEXT[k]);
  const e = { name: c.name, day: G.day, why, days: c.days || 0, morale: Math.round(c.morale), gripes: top, like: like || null, rank: crewRank(c).key };
  G.exits = (G.exits || []).concat([e]).slice(-20);
  G.today.exits = (G.today.exits || 0) + 1;
  if (why === 'quit') {
    const body = [`Exit interview: ${c.name}, ${c.days || 0} days with us.`, '',
      'Why are you leaving?', ...(top.length ? top.map(g => '  "' + GRIPE_TEXT[g] + '"') : ['  "It just wasn\'t working out."']), '',
      'Anything we did right?', '  "' + (like ? LIKE_TEXT[like] : 'Honestly? Not much I can think of.') + '"', '',
      'What this means for you:', ...(top.length ? top.map(g => '  • ' + FIX_TEXT[g]) : ['  • Check in with your crew more often.'])];
    mail('HR', `Exit interview: ${c.name}`, body.join('\n'));
    toast(`🚪 ${c.name} quit. Read the exit interview in your email.`, 'bad');
  } else {
    mail('HR', `Separation: ${c.name}`, `${c.name} was let go after ${c.days || 0} days. Write-ups on file: ${c.strikes || 0}.\n${(c.strikes || 0) < 2 ? 'Note: without documentation, terminations hurt team trust. Coach, then write up, then terminate.' : 'Termination was documented. That protects the store and shows the team the rules are real.'}`);
  }
}

// End of day: grades move morale, then notice and quitting.
function moraleDay(res) {
  const notes = [];
  for (const c of G.crew.slice()) {
    ensureMorale(c);
    const worked = !c.calledOut && !sentHomeToday(c);
    if (worked) { if ('AB'.includes(res.grade)) bump(c, 3); else if ('DF'.includes(res.grade)) bump(c, -3, 'rough'); }
    if (G.day - c.lastPraised >= 3 && worked) bump(c, -2, 'ignored');
    if (isStar(c)) bump(c, 2);
    c.morale += (65 - c.morale) * 0.08;
    if (c.promoAsk && G.day - c.promoAsk >= 3 && !c.lead) { bump(c, -12, 'passedOver'); c.promoAsk = null; c.promoAskAfter = G.day + 7; notes.push(`${c.name} asked about a promotion 3 days ago and heard nothing back. Morale took a hit.`); }
    if (c.notice) {
      if (G.day >= c.notice) {
        if (c.morale >= 35) { c.notice = null; c.stayTalk = false; mail(c.name, 'I\'m staying', `Things have been better lately. I'm taking back my notice.\n— ${c.name}`); notes.push(`${c.name} took back their notice. Whatever you did worked.`); }
        else { notes.push(`${c.name} quit. Their exit interview is in your email: read it, it tells you what to fix.`); letGo(c, 'quit', true); teamBump(-3, 'letGo'); }
      }
    } else if (c.morale < 20 && Math.random() < 0.45) {
      c.notice = G.day + 3;
      mail(c.name, 'Two weeks… well, three days', `I'm putting in my notice. My last day is ${dayLabel(c.notice)}.\n— ${c.name}`);
      notes.push(`${c.name} gave notice (morale ${Math.round(c.morale)}%). Talk to them on the floor and turn things around within 3 days.`);
    }
  }
  if (G.today.conflictsIgnored) notes.push(`${G.today.conflictsIgnored} argument(s) went unhandled. Step in fast: walk up and press E.`);
  if (teamMorale() < 45) notes.push(`Team morale is ${Math.round(teamMorale())}%. Low morale means slower work and more call-outs. Thank people (E near a worker), keep schedules steady and handle conflicts.`);
  return notes;
}

function moraleHour() {
  if (G.phase !== 'day') return;
  if (leadOnShift()) G.crew.forEach(c => { if (!c.lead && onShift(c)) bump(c, 0.5); });
  conflictHour();
  promoAskHour();
}

// Two pulsing red bolts over people who are arguing.
function drawArgueBubble(r, top) {
  const a = 0.6 + 0.4 * Math.sin(performance.now() / 110);
  const x = Math.round(r.x * T), y = Math.round(top - 26);
  ctx.save(); ctx.shadowColor = '#ff8c1a'; ctx.shadowBlur = 12 * a;
  ctx.fillStyle = '#ff8c1a'; ctx.fillRect(x - 8, y - 7, 16, 13); ctx.fillRect(x - 2, y + 6, 4, 3);
  ctx.restore();
  label(ctx, '!!', x, y, { font: PX(9), color: '#1a0d00' });
}
