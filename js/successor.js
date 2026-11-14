'use strict';
// =====================================================================
//  Growing a successor: pick one associate to develop, give them stretch
//  tasks, coach them, and grow them into a Lead and then an Assistant
//  Manager. A store manager's real job is to build the bench.
//  - Pick a protégé in Crew & Schedule (🌱 Successor). Pro or Superstar,
//    5+ days with us.
//  - Stretch tasks: one a day, on a day they work. Each one is a real piece
//    of a manager's job (run the truck, lead the 5 PM recovery, close the
//    store...). How it goes depends on their skill, their morale, how the
//    store actually did at that job today, and whether you set them up
//    with a talk first.
//  - Development talk: walk up and press E once a day. Before a task it
//    sets them up; after a rough one it's the debrief.
//  - Readiness 50 → promote to Lead. Readiness 100 and 7 days as Lead →
//    Assistant Manager (one per store). An ASM on shift keeps the whole
//    crew a little faster and settles fights while you're away.
//  - After about 3 weeks as ASM, the district asks if they're ready for a
//    store of their own. Letting them go is the best thing on your record.
// =====================================================================
const DEV_LEAD = 50, DEV_ASM = 100, ASM_RAISE = 2.5, ASM_LEAD_DAYS = 7, ASM_OWN_STORE = 21;
const shiftOf = c => SHIFTS[curShift(c)] || null;
const worksBy = (c, m) => { const s = shiftOf(c); return !!s && s.start <= m; };
const worksAt = (c, m) => { const s = shiftOf(c); return !!s && s.start <= m && s.end > m; };
const DEV_TASKS = {
  truck: { stage: 'lead', name: 'Run the truck', desc: 'They run the freight crew: who works what, cold first, done by 10 AM.',
    can: c => worksBy(c, 480), went: () => !!G.today.truckDoneAt && G.today.truckDoneAt <= 600,
    lesson: 'Running freight is the first leadership job: plan the pallets, put people where the cases are, and finish before the customers come.' },
  recovery: { stage: 'lead', name: 'Lead the 5 PM recovery', desc: 'They walk the aisles with the crew at 5 PM: face, go-backs, outs.',
    can: c => worksAt(c, 1020), went: () => G.sat >= 60,
    lesson: 'A lead learns to see the store the way a customer does, and to get other people moving without doing it all themselves.' },
  train: { stage: 'lead', name: 'Train a new hire', desc: 'They take a rookie under their wing for the shift.',
    can: c => worksAt(c, 720) && G.crew.some(o => o !== c && crewRank(o).key === 'rookie' && curShift(o)), went: () => true,
    lesson: 'Teaching someone else is how a good worker becomes a leader. They learn their own job twice as well.' },
  adflip: { stage: 'lead', name: 'Run the ad flip', desc: 'Tuesday night: they flip every planned endcap with the closing crew.',
    can: c => dowOf(G.day) === 'Tue' && worksAt(c, 1200), went: () => ecPending().length === 0,
    lesson: 'Owning a deadline that the whole district sees teaches planning: product on the bird Monday, people on the floor Tuesday.' },
  close: { stage: 'asm', name: 'Close the store', desc: 'They have the keys tonight: the close run, the last walk, the lock-up.',
    can: c => worksAt(c, 1320), went: res => 'ABC'.includes(res.grade[0]),
    lesson: 'Closing alone means every call is theirs. It is the first time they feel what your job is like.' },
  order: { stage: 'asm', name: 'Write the order', desc: 'They read the forecast and write tomorrow\'s order with you checking it.',
    can: c => worksBy(c, 900), went: res => res.inStock >= 0.95,
    lesson: 'Ordering is where the money is. An assistant manager has to see sales, outs and backstock as one picture.' },
  floor: { stage: 'asm', name: 'Handle the customers', desc: 'Every complaint and question on the floor goes to them today.',
    can: c => worksAt(c, 720), went: () => G.sat >= 70,
    lesson: 'Customers test patience and judgment. Handling them well is what makes a crew trust a manager.' },
  labor: { stage: 'asm', name: 'Run labor today', desc: 'They decide breaks, who goes home early, and who covers what.',
    can: c => worksAt(c, 720), went: res => res.laborPct <= LABOR_TARGET + 1,
    lesson: 'Labor is the biggest cost they will ever control. Sending someone home is a skill, and so is keeping them.' },
};

function devC() { const d = G.dev; return d && G.crew.find(c => c.id === d.id) || null; }
const devStage = c => (c.lead ? 'asm' : 'lead');
const asmOf = () => G.crew.find(c => c.asm) || null;
const asmOnShift = () => G.crew.some(c => c.asm && onShift(c));
const canDevelop = c => !c.asm && (c.lead || ((crewRank(c).key === 'pro' || isStar(c)) && (c.days || 0) >= 5));
function devPick(c) {
  if (!canDevelop(c)) return;
  const was = devC();
  G.dev = { id: c.id, ready: was === c ? G.dev.ready : 0, task: null, talkDay: 0, debrief: false, history: was === c ? G.dev.history : [] };
  bump(c, 6);
  toast(`🌱 ${c.name} is your protégé. Give them a stretch task on a day they work, and talk with them.`, 'good');
}
function devStop() { const c = devC(); if (c) bump(c, -8); G.dev = null; }
function devAssign(k) {
  const c = devC(), tk = DEV_TASKS[k];
  if (!c || !tk || G.dev.task || tk.stage !== devStage(c) || !tk.can(c)) return;
  G.dev.task = { k, day: G.day, prepped: G.dev.talkDay === G.day };
  toast(`🌱 ${c.name}: "${tk.name}" today. ${G.dev.task.prepped ? 'You already talked it through.' : 'Talk it through with them first (E) if you want to set them up.'}`, 'info');
}

// ---- you: the development talk ----
function devInteraction(p) {
  const c = devC(), r = c && RT.crew[c.id];
  if (!c || G.dev.talkDay === G.day || !r || !r.inBuilding || !onShift(c) || dist(r, p) > 1.5) return null;
  const tk = G.dev.task && G.dev.task.day === G.day ? DEV_TASKS[G.dev.task.k] : null;
  const what = G.dev.debrief ? 'debrief yesterday' : tk ? `set them up for "${tk.name}"` : 'where they want to grow';
  return { label: `🌱 Development talk with ${c.name} (${what})`, fn: () => talkOpen(c, 'dev') };
}
function devTalk(c) {
  const d = G.dev; d.talkDay = G.day;
  let gain = 4;
  if (d.debrief) { gain += 6; bump(c, 4); d.debrief = false; }
  if (d.task && d.task.day === G.day) d.task.prepped = true;
  d.ready = Math.min(DEV_ASM, d.ready + gain); bump(c, 3);
  const r = RT.crew[c.id]; if (r) { r.hold = 2; floater(r.x, r.y - 1.3, `+${gain} ready`, '#57f287'); }
  addXP(4, G.player);
  toast(`🌱 You talked with ${c.name}. Readiness ${Math.round(d.ready)}/${c.lead ? DEV_ASM : DEV_LEAD}.`, 'good');
}

// ---- end of day: how the stretch task went ----
function successorDay(res) {
  const tips = [], c = devC(), d = G.dev;
  if (!c) { if (d) G.dev = null; return tips; }
  if (!d.task || d.task.day !== G.day) return tips;
  const k = d.task.k, tk = DEV_TASKS[k], prepped = !!d.task.prepped, here = !c.calledOut && c.sentHome !== G.day;
  d.task = null;
  if (!here) { tips.push(`${c.name} wasn't here for "${tk.name}". Give them the stretch task on a day they work.`); return tips; }
  const went = !!tk.went(res), m = c.morale;
  // their skill, their morale, how the store really did at it today, and whether you set them up
  const p = clamp(0.35 + (isStar(c) ? 0.2 : crewRank(c).key === 'pro' ? 0.1 : 0) + (m >= 60 ? 0.1 : m < 40 ? -0.1 : 0) + (went ? 0.25 : -0.1) + (prepped ? 0.2 : 0), 0.1, 0.95);
  return tips.concat(devResolve(c, k, went, p, prepped));
}
function devResolve(c, k, went, p, prepped) {
  const tk = DEV_TASKS[k];
  const d = G.dev, ok = Math.random() < p, tips = [];
  if (ok) {
    const gain = prepped ? 15 : 22;
    d.ready = Math.min(DEV_ASM, d.ready + gain); bump(c, 5); addXP(15);
    d.history = (d.history || []).concat([{ day: G.day, k, ok: true }]).slice(-20);
    tips.push(`🌱 ${c.name} handled "${tk.name}" well (+${gain} readiness${prepped ? '' : ', more for doing it on their own'}). ${tk.lesson}`);
  } else {
    d.ready = Math.min(DEV_ASM, d.ready + 5); bump(c, prepped ? -2 : -5); d.debrief = true;
    d.history = (d.history || []).concat([{ day: G.day, k, ok: false }]).slice(-20);
    tips.push(`🌱 "${tk.name}" got away from ${c.name} today${went ? '' : ' (the store had a rough day at it too)'}. That's how people learn, if someone talks it through with them: give them a debrief talk tomorrow (E). ${prepped ? '' : 'Next time, set them up with a talk before the task.'}`);
  }
  const need = c.lead ? DEV_ASM : DEV_LEAD;
  if (d.ready >= need) tips.push(c.lead ? (c.leadDay && G.day - c.leadDay < ASM_LEAD_DAYS ? `${c.name} is ready on paper, but needs ${ASM_LEAD_DAYS} days as a Lead first.` : `${c.name} is ready to be your Assistant Manager. Promote them in Crew & Schedule.`) : `${c.name} is ready to be a Lead. Promote them in Crew & Schedule.`);
  return tips;
}

// ---- promotions ----
function devPromoteLead() {
  const c = devC(); if (!c || c.lead || G.dev.ready < DEV_LEAD) return;
  if (!canPromote(c)) { toast(`You already have ${MAX_LEADS} Leads.`, 'warn'); return; }
  promoteCrew(c); c.leadDay = G.day;
}
function canAsm(c) { return c && c.lead && !c.asm && !asmOf() && G.dev && G.dev.ready >= DEV_ASM && G.day - (c.leadDay || 0) >= ASM_LEAD_DAYS; }
function devPromoteAsm() {
  const c = devC(); if (!canAsm(c)) return;
  c.asm = true; c.asmDay = G.day; c.wage = +(c.wage + ASM_RAISE).toFixed(2);
  bump(c, 20, 'promoted'); teamBump(3, 'fair', c);
  const r = RT.crew[c.id]; if (r && r.inBuilding) confetti(r.x, r.y, 80);
  addXP(120);
  toast(`🏅 ${c.name} is your Assistant Manager (+$${ASM_RAISE.toFixed(2)}/hr). You grew them from the floor.`, 'gold');
  mail(c.name, 'Assistant Manager', `I remember my first truck here. Thank you for every talk and every task you trusted me with. I'll run this place like you would when you're not here.\n— ${c.name}`);
  G.dev = null;
}
// An ASM on shift lifts the whole crew a little (js/morale.js moraleSpeed).
const asmSpeed = c => (!c.asm && asmOnShift() ? 1.03 : 1);

// ---- the district wants your ASM for their own store ----
function successorHour(h) {
  if (h !== 9) return;
  const a = asmOf();
  if (!a || a.ownStoreAsk || G.day - (a.asmDay || G.day) < ASM_OWN_STORE + (a.notYet || 0)) return;
  a.ownStoreAsk = G.day;
  mail('District Manager', `A store for ${a.name}?`, `${a.name} has been your Assistant Manager for ${G.day - a.asmDay} days and the district has an opening. Are they ready to run a store of their own?\nAnswer in Crew & Schedule (🌱 Successor). Saying yes means losing them, and it's the best thing a store manager can have on their record.`);
  toast(`📨 The district asked if ${a.name} is ready for a store of their own.`, 'gold');
}
function asmRecommend() {
  const a = asmOf(); if (!a || !a.ownStoreAsk) return;
  if (RT.crew[a.id]) { despawnCrew(a); delete RT.crew[a.id]; }
  G.crew = G.crew.filter(x => x !== a);
  G.exits = (G.exits || []).concat([{ name: a.name, day: G.day, why: 'promoted', days: a.days || 0, morale: Math.round(a.morale), gripes: [], like: null, rank: crewRank(a).key }]).slice(-20);
  G.grown = (G.grown || []).concat([{ name: a.name, day: G.day }]);
  G.crew.forEach(o => bump(o, 6));
  addXP(300);
  toast(`🎓 ${a.name} is getting their own store. The whole crew saw that people here move up.`, 'gold');
  mail('District Manager', 'Congratulations', `${a.name} starts at their new store next week. Growing a manager is the hardest thing we ask of you, and you did it. Start building the next one.`);
}
function asmNotYet() {
  const a = asmOf(); if (!a || !a.ownStoreAsk) return;
  a.ownStoreAsk = null; a.notYet = (a.notYet || 0) + 14; bump(a, -10, 'passedOver');
  toast(`${a.name} stays for now. They heard about the opening, and they're disappointed.`, 'warn');
}

// ---- Crew & Schedule card ----
function successorHTML() {
  const c = devC(), a = asmOf(), d = G.dev;
  let h = `<h3>🌱 Successor</h3><p class="mute">Your real job is to build the bench. Pick one associate to develop, give them a stretch task on a day they work, and talk with them (walk up, <kbd>E</kbd>, once a day). Readiness ${DEV_LEAD} → Lead; ${DEV_ASM} and ${ASM_LEAD_DAYS} days as a Lead → Assistant Manager. An ASM on shift makes the whole crew a little faster and settles fights while you're gone.</p>`;
  if (a) {
    h += `<div class="card" style="margin-bottom:10px"><b>🏅 Assistant Manager: ${esc(a.name)}</b> <span class="mute">since Day ${a.asmDay}</span>`;
    if (a.ownStoreAsk) h += `<p>The district has a store for ${esc(a.name)}. Recommend them?</p><div class="row"><button class="primary" onclick="UI.asmGo(true)">Recommend them (they leave)</button><button onclick="UI.asmGo(false)">Not yet</button></div>`;
    h += '</div>';
  }
  if ((G.grown || []).length) h += `<p class="good">Managers you've grown: ${G.grown.map(g => esc(g.name)).join(', ')}</p>`;
  if (!c) {
    const pool = G.crew.filter(canDevelop);
    h += pool.length ? `<p>Pick a protégé: ${pool.map(o => `<button onclick="UI.devPick(${o.id})">${esc(o.name)}${o.lead ? ' ◆' : ''}</button>`).join(' ')}</p>` : '<p class="mute">Nobody is ready to develop yet: you need a Pro or Superstar with 5+ days here, or a Lead.</p>';
    return h;
  }
  const need = c.lead ? DEV_ASM : DEV_LEAD, pct = Math.round(Math.min(1, d.ready / need) * 100);
  h += `<div class="card"><b>${esc(c.name)}</b> · ${c.lead ? '◆ Lead, growing toward Assistant Manager' : 'growing toward Lead'} · readiness <b>${Math.round(d.ready)}/${need}</b>
    <div style="background:#222;height:8px;border-radius:4px;margin:6px 0"><div style="background:#57f287;height:8px;border-radius:4px;width:${pct}%"></div></div>`;
  if (d.debrief) h += `<p class="warn">Yesterday's task went badly. A debrief talk today (E) turns it into a lesson.</p>`;
  if (d.task && d.task.day === G.day) h += `<p>Today: <b>${DEV_TASKS[d.task.k].name}</b> ${d.task.prepped ? '<span class="good">(set up with a talk)</span>' : '<span class="mute">(no talk yet)</span>'}</p>`;
  else {
    const list = Object.entries(DEV_TASKS).filter(([, t]) => t.stage === devStage(c));
    h += `<p>Stretch task for today:</p>` + list.map(([k, t]) => { const ok = t.can(c); return `<button ${ok ? '' : 'disabled'} title="${esc(t.desc)}" onclick="UI.devTask('${k}')" style="margin:2px">${t.name}</button>`; }).join('') + `<div class="mute" style="font-size:12px">Grayed out: they don't work the right hours today.</div>`;
  }
  if (!c.lead && d.ready >= DEV_LEAD) h += `<p><button class="primary" onclick="UI.devLead()">Promote ${esc(c.name)} to Lead</button></p>`;
  if (c.lead && d.ready >= DEV_ASM) h += canAsm(c) ? `<p><button class="primary" onclick="UI.devAsm()">Promote ${esc(c.name)} to Assistant Manager</button></p>` : `<p class="mute">${asmOf() ? 'You already have an Assistant Manager.' : `Ready, after ${ASM_LEAD_DAYS} days as a Lead (Day ${(c.leadDay || 0) + ASM_LEAD_DAYS}).`}</p>`;
  const hist = (d.history || []).slice(-5);
  if (hist.length) h += `<p class="mute" style="font-size:12px">Recent: ${hist.map(x => `${x.ok ? '✔' : '✗'} ${DEV_TASKS[x.k].name} (Day ${x.day})`).join(' · ')}</p>`;
  h += `<button onclick="UI.devStop()">Stop developing ${esc(c.name)}</button></div>`;
  return h;
}

// ---- weekly review ----
function successorReviewNotes(days, note, praise) {
  const c = devC(), a = asmOf();
  if ((G.grown || []).some(g => g.day > G.day - 7)) praise.push('You grew an Assistant Manager into a store manager of their own. That is the job.');
  else if (a) praise.push(`${a.name} is a strong Assistant Manager. The store runs when you're not in it.`);
  else if (c && G.dev && (G.dev.history || []).some(x => x.day > G.day - 7)) praise.push(`You're developing ${c.name} with real stretch tasks.`);
  else if (G.day >= 21 && !c) note('Bench strength', 'Nobody is being developed to take your place.',
    'If you are the only one who can run the store, you can never take a day off, and you can never be promoted yourself.',
    'Pick a protégé in Crew & Schedule (🌱 Successor), give them stretch tasks a few times a week, and talk with them.');
}
