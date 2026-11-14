'use strict';
// =====================================================================
//  Store standards: the way we do things here.
//  You set standards in 📏 Standards (office computer). Two kinds:
//  - HABITS: things each person does on their own ("face your area before
//    you clock out", "grab go-backs when you pass the front end"...).
//  - ROUTINES: store-wide rules at a set time ("we all face the store at
//    2 PM"). For 30 minutes everyone on the floor who has bought in drops
//    what they're doing and does it.
//  Nobody changes because a rule exists. Each person has their own
//  adoption of each standard (0–100%): the chance they actually do it.
//  - Talk one-on-one (E/Q near them, or the 📌 card): the big jump.
//  - Gather everyone on shift (📏 Standards): a smaller jump for everyone.
//  - The morning huddle reminds whoever is there.
//  - Thank someone (E) on a day they followed a standard: recognition makes
//    it stick.
//  - Unhappy people don't buy in (half the gain under 40 morale), and it
//    fades a little every day until it reaches 100%: then it's just how
//    they work. New hires start at zero: they have to learn it.
// =====================================================================
const STD_TALK = 30, STD_GROUP = 15, STD_HUDDLE = 8, STD_PRAISE = 15, STD_FADE = 4, STD_MAX = 6, ROUTINE_MIN = 30;
const STD_KINDS = {
  faceout: { habit: true, icon: '🧹', name: 'Face your area before you clock out',
    desc: 'In their last 20 minutes, they face their own aisle (or the messiest one) before they go home.',
    why: 'The next shift walks into a store that looks ready. Nobody leaves their mess for someone else.' },
  gobacks: { habit: true, icon: '🛒', name: 'Grab go-backs when you pass the front end',
    desc: 'When 3 or more go-backs are waiting on the cart, they take them back without being asked.',
    why: 'Go-backs aren\'t for sale until they\'re on their shelf, and cold ones spoil in 30 minutes.' },
  cardboard: { habit: true, icon: '📦', name: 'Never leave cardboard on the floor',
    desc: 'Fewer "left cardboard in the aisle" mistakes, and they pick up cardboard they see.',
    why: 'Cardboard in the aisle is a trip hazard and makes the whole store look sloppy.' },
  phones: { habit: true, icon: '📵', name: 'Phones stay in the break room',
    desc: 'Fewer phone breaks on the clock.',
    why: 'Five minutes on the phone, ten times a shift, is almost an hour of paid time.' },
  face: { routine: true, icon: '🧹', name: 'Everyone faces the store',
    desc: 'For 30 minutes everyone on the floor faces the messiest aisles.', why: 'A store faced on a schedule never gets bad enough to need a rescue.' },
  sweep: { routine: true, icon: '🛒', name: 'Go-back and cardboard sweep',
    desc: 'For 30 minutes everyone on the floor clears go-backs and cardboard, then faces.', why: 'Small messes cleared on a schedule never pile up.' },
  holes: { routine: true, icon: '📦', name: 'Fill every hole',
    desc: 'For 30 minutes everyone on the floor fills holes from backstock in the emptiest aisles.', why: 'Holes cost sales every minute they\'re there. Hunting them on a schedule catches them before the rush.' },
};
const ROUTINE_TIMES = []; for (let m = 360; m <= 1320; m += 30) ROUTINE_TIMES.push(m);

function ensureStandards() { G.standards = G.standards || []; G.stdNext = G.stdNext || 1; }
const stdById = id => (G.standards || []).find(s => s.id === id);
const stdName = s => STD_KINDS[s.kind].name + (s.time != null ? ` at ${fmtTime(s.time)}` : '');
const stdOf = (c, id) => (c.std && c.std[id]) || 0;
const stdHabit = (c, kind) => { const s = (G.standards || []).find(x => x.kind === kind); return s ? stdOf(c, s.id) : 0; };
function stdGain(c, id, n) {
  const s = stdById(id); if (!s) return 0;
  c.std = c.std || {};
  ensureMorale(c);
  const m = (c.morale < 40 ? 0.5 : 1) * (c.trait === 'perfectionist' ? 1.3 : c.trait === 'hothead' ? 0.8 : 1);
  const before = stdOf(c, id), after = Math.min(100, before + n * m);
  c.std[id] = after;
  if (before < 100 && after >= 100) toast(`📏 ${c.name}: "${STD_KINDS[s.kind].name}" is just how they work now.`, 'gold');
  return after - before;
}
const stdDidToday = (c, id) => c.stdDid && c.stdDid[id] === G.day;
function stdMark(c, id) { c.stdDid = c.stdDid || {}; c.stdDid[id] = G.day; }
// a roll per person, per standard, per day: do they actually do it today?
function stdFollows(c, id) {
  c.stdRoll = c.stdRoll || {};
  const k = id + ':' + G.day;
  if (c.stdRoll[k] == null) { c.stdRoll = Object.fromEntries(Object.entries(c.stdRoll).filter(([kk]) => kk.endsWith(':' + G.day))); c.stdRoll[k] = Math.random() * 100 < stdOf(c, id); }
  return c.stdRoll[k];
}

// ---- setting standards (📏 Standards tab) ----
function stdAdd(kind, time) {
  ensureStandards();
  const k = STD_KINDS[kind]; if (!k || G.standards.length >= STD_MAX) return;
  if (k.habit && G.standards.some(s => s.kind === kind)) return;
  if (k.routine && G.standards.some(s => s.routine && s.time === time)) { toast('There is already a routine at that time.', 'warn'); return; }
  const s = { id: G.stdNext++, kind, routine: !!k.routine, time: k.routine ? time : null, since: G.day };
  G.standards.push(s);
  toast(`📏 New standard: ${stdName(s)}. Now nobody does it yet: talk to your people.`, 'info');
}
function stdRemove(id) { G.standards = G.standards.filter(s => s.id !== id); G.crew.forEach(c => { if (c.std) delete c.std[id]; }); }

// ---- talking about it ----
function stdTalk(c, id) {
  c.stdTalkDay = c.stdTalkDay || {};
  if (c.stdTalkDay[id] === G.day) return;
  c.stdTalkDay[id] = G.day;
  const g = stdGain(c, id, STD_TALK), s = stdById(id);
  const r = RT.crew[c.id]; if (r) { r.hold = 1.5; floater(r.x, r.y - 1.3, `+${Math.round(g)}%`, '#57f287'); }
  addXP(3, G.player);
  toast(c.morale < 40 ? `📏 ${c.name} nodded, but they're not happy here right now. It didn't land like it should.` : `📏 You talked with ${c.name} about "${STD_KINDS[s.kind].name}" (${Math.round(stdOf(c, id))}% bought in).`, c.morale < 40 ? 'warn' : 'good');
}
function stdGather(id) {
  const s = stdById(id); if (!s) return;
  G.today.stdGather = G.today.stdGather || {};
  if (G.today.stdGather[id]) return;
  const here = G.crew.filter(c => { const r = RT.crew[c.id]; return onShift(c) && r && r.inBuilding && !r.onBreak; });
  if (!here.length) { toast('Nobody is on the floor to talk to.', 'warn'); return; }
  G.today.stdGather[id] = true;
  here.forEach(c => { stdGain(c, id, STD_GROUP); const r = RT.crew[c.id]; if (r) { finishPlan(c, r); r.intent = 'Standards talk'; r.plan = [{ go: () => tilesAround(HUDDLE_SPOT, 2) }, { wait: 5, label: 'Standards talk' }]; } });
  addXP(5, G.player);
  toast(`📣 You pulled ${(here.length === 1 ? '1 person' : here.length + ' people')} together about "${STD_KINDS[s.kind].name}". A group talk sets the bar; one-on-ones make it stick.`, 'good');
}
// morning huddle: a reminder for everyone there
function stdHuddle(crew) { (G.standards || []).forEach(s => crew.forEach(c => stdGain(c, s.id, STD_HUDDLE))); }
// thanking someone who followed a standard today
function stdPraise(c) {
  const did = (G.standards || []).filter(s => stdDidToday(c, s.id));
  did.forEach(s => stdGain(c, s.id, STD_PRAISE));
  if (did.length) toast(`📏 You noticed ${c.name} did "${STD_KINDS[did[0].kind].name}". Recognition makes a standard stick.`, 'good');
}
function standardsInteraction(p) {
  if (!(G.standards || []).length) return null;
  const c = crewNear(p, 1.6);
  if (!c || !onShift(c)) return null;
  return { label: `📏 Talk standards with ${c.name}`, fn: () => talkOpen(c, 'std') };
}

// ---- the crew actually doing it ----
function stdPlan(c, r) {
  if (G.phase !== 'day' || !(G.standards || []).length) return null;
  const shf = SHIFTS[curShift(c)];
  for (const s of G.standards) {
    if (s.routine) {
      if (G.time < s.time || G.time >= s.time + ROUTINE_MIN || c.role === 'unloader' || !stdFollows(c, s.id)) continue;
      if (c.role === 'dsd' && G.vendorsToday.some(v => v.state === 'waiting')) continue;
      const p = s.kind === 'face' ? planFaceMessiest(c, r, 97)
        : s.kind === 'sweep' ? (planGobacks(c, r) || ((G.trash || []).length ? planTrash(c, r) : null) || planFaceMessiest(c, r, 97))
        : stdHoles(c, r);
      if (p) { stdMark(c, s.id); r.intent = `${STD_KINDS[s.kind].icon} ${r.intent} (${fmtTime(s.time)} routine)`; return p; }
      continue;
    }
    if (s.kind === 'faceout' && shf && G.time >= shf.end - 20 && G.time < shf.end && !stdDidToday(c, s.id) && stdFollows(c, s.id)) {
      const own = ROLES[c.role].dept;
      const p = (own && faceOf(own) < 97 ? planFace(c, r, own) : null) || planFaceMessiest(c, r, 97);
      stdMark(c, s.id);
      if (p) { r.intent += ' before clocking out'; return p; }
    }
    if (s.kind === 'gobacks' && gobacksCart().length >= 3 && stdFollows(c, s.id) && !['unloader'].includes(c.role)) {
      const p = planGobacks(c, r);
      if (p) { stdMark(c, s.id); r.intent = 'Working go-backs (store standard)'; return p; }
    }
    if (s.kind === 'cardboard' && (G.trash || []).length && stdFollows(c, s.id)) {
      const p = planTrash(c, r);
      if (p) { stdMark(c, s.id); return p; }
    }
  }
  return null;
}
function stdHoles(c, r) {
  const d = DEPTS.map(x => x.id).filter(x => shelfPct(x) < 0.9 && G.stock[x].back > 0 && !(RT.replenClaim || {})[x]).sort((a, b) => shelfPct(a) - shelfPct(b))[0];
  return d ? planReplen(c, r, [d], 0.9) : null;
}
// habits that make mistakes rarer (js/training.js rollMistake)
function stdMistakeMult(c, area) {
  const kind = area === 'stock' ? 'cardboard' : area === 'focus' ? 'phones' : null;
  if (!kind) return 1;
  const s = (G.standards || []).find(x => x.kind === kind); if (!s) return 1;
  const a = stdOf(c, s.id) / 100;
  if (a > 0.2) stdMark(c, s.id);
  return 1 - 0.7 * a;
}

// ---- time ----
// routines start on the half hour too, so this runs every update (js/game.js)
function standardsTick() {
  if (G.phase !== 'day' || !(G.standards || []).length) return;
  RT.stdSeen = RT.stdSeen || {};
  for (const s of G.standards) {
    if (!s.routine) continue;
    const key = s.id + ':' + G.day;
    if (G.time >= s.time && G.time < s.time + 5 && !RT.stdSeen[key]) {
      RT.stdSeen[key] = true;
      const on = G.crew.filter(c => onShift(c) && c.role !== 'unloader');
      const yes = on.filter(c => stdFollows(c, s.id));
      G.today.stdRoutines = (G.today.stdRoutines || []).concat([{ id: s.id, on: on.length, yes: yes.length }]);
      if (on.length) toast(`📏 ${fmtTime(s.time)} routine: ${STD_KINDS[s.kind].name}. ${yes.length} of ${on.length} on the floor are doing it.`, yes.length === on.length ? 'good' : yes.length ? 'info' : 'warn');
    }
  }
}
function standardsDay() {
  const tips = [];
  // a little fades every day until it's a habit
  G.crew.forEach(c => { if (!c.std) return; for (const id of Object.keys(c.std)) { if (!stdById(+id)) { delete c.std[id]; continue; } if (c.std[id] < 100) c.std[id] = Math.max(0, c.std[id] - STD_FADE); } });
  const rs = G.today.stdRoutines || [];
  const weak = rs.filter(x => x.on && x.yes / x.on < 0.6);
  if (weak.length) { const x = weak[0], s = stdById(x.id); if (s) tips.push(`Only ${x.yes} of ${x.on} joined the ${fmtTime(s.time)} "${STD_KINDS[s.kind].name}". A new rule takes reminders: talk to people one on one, remind everyone at the huddle, and thank the ones who did it.`); }
  const newbie = G.crew.find(c => (c.days || 0) <= 3 && (G.standards || []).some(s => stdOf(c, s.id) < 20));
  if (newbie) tips.push(`${newbie.name} is new and doesn't know your store standards yet. Walk them through them (📏 Talk standards).`);
  return tips;
}
function standardsReviewNotes(days, note, praise) {
  const st = G.standards || []; if (!st.length || !G.crew.length) return;
  const avg = sum(G.crew.map(c => sum(st.map(s => stdOf(c, s.id))) / st.length)) / G.crew.length;
  if (avg >= 75) praise.push(`Your crew lives your store standards (${Math.round(avg)}% bought in on average).`);
  else if (avg < 35 && st.some(s => s.since <= G.day - 7)) note('Standards', `Your store standards are on paper, but the crew is only ${Math.round(avg)}% bought in.`,
    'A rule nobody follows teaches the crew that rules here don\'t matter.',
    'Fewer standards, followed up more: talk one on one, remind at the huddle, and thank people the day you see them do it.');
}

// ---- screens ----
UI.tab_standards = function () {
  ensureStandards();
  const st = G.standards;
  let h = `<h2>📏 Store standards</h2><p class="mute">How we do things here. A standard only matters if people actually do it, and every person has their own buy-in (the chance they really do it). Talk to them one on one (walk up, Q or the 📌 card) for the big jump; pull everyone on shift together for a smaller one; the morning huddle reminds whoever is there; and thanking someone on a day they followed a standard makes it stick. It fades a little every day until it hits 100%. New hires start at zero.</p>`;
  if (st.length) {
    const crew = G.crew;
    h += `<table><tr><th>Standard</th>${crew.map(c => `<th class="n">${esc(c.name.split(' ')[0])}</th>`).join('')}<th></th></tr>`;
    for (const s of st) {
      const k = STD_KINDS[s.kind], gathered = G.today.stdGather && G.today.stdGather[s.id];
      h += `<tr><td>${k.icon} <b>${esc(stdName(s))}</b><div class="mute" style="font-size:12px">${esc(k.desc)}</div></td>${crew.map(c => { const v = Math.round(stdOf(c, s.id)); return `<td class="n ${v >= 100 ? 'good' : v >= 60 ? '' : v >= 30 ? 'warn' : 'bad'}">${v}%${stdDidToday(c, s.id) ? ' ✔' : ''}</td>`; }).join('')}
        <td style="white-space:nowrap"><button ${gathered || G.player.away ? 'disabled' : ''} onclick="UI.stdGather(${s.id})" title="Everyone on shift, 5 minutes">📣 Talk to everyone on shift</button> <button class="danger" onclick="UI.stdRemove(${s.id})">Drop</button></td></tr>`;
    }
    h += '</table><p class="mute" style="font-size:12px">✔ = did it today.</p>';
  } else h += '<p class="mute">No store standards yet.</p>';
  if (st.length < STD_MAX) {
    const habits = Object.entries(STD_KINDS).filter(([k, v]) => v.habit && !st.some(s => s.kind === k));
    h += `<h3>Add a habit</h3><p class="mute">Something each person does on their own, every shift.</p>` + habits.map(([k, v]) => `<div class="card" style="margin:6px 0"><b>${v.icon} ${v.name}</b> <button onclick="UI.stdAdd('${k}')">Make it a standard</button><div class="mute" style="font-size:13px">${v.desc} Why: ${v.why}</div></div>`).join('');
    h += `<h3>Add a store routine</h3><p class="mute">Everyone on the floor, at the same time every day, for ${ROUTINE_MIN} minutes.</p><div class="row" style="gap:6px;flex-wrap:wrap"><select id="std-kind">${Object.entries(STD_KINDS).filter(([, v]) => v.routine).map(([k, v]) => `<option value="${k}">${v.icon} ${v.name}</option>`).join('')}</select><span>at</span><select id="std-time">${ROUTINE_TIMES.map(m => `<option value="${m}" ${m === 840 ? 'selected' : ''}>${fmtTime(m)}</option>`).join('')}</select><button class="primary" onclick="UI.stdAdd($('std-kind').value, +$('std-time').value)">Add routine</button></div>`;
  } else h += `<p class="mute">That's ${STD_MAX} standards. More than that and none of them stick.</p>`;
  return h;
};
UI.stdAdd = function (k, t) { stdAdd(k, t); this.render(); };
UI.stdRemove = function (id) { stdRemove(id); this.render(); };
UI.stdGather = function (id) { stdGather(id); this.render(); };
UI.stdCoach = function (id) {
  const c = G.crew.find(x => x.id === id); if (!c) return;
  if (onShift(c) && RT.crew[c.id] && RT.crew[c.id].inBuilding) return talkOpen(c, 'std'); // in person: the talk scene (js/talkscene.js)
  const st = G.standards || [];
  this.showModal(`<h2>📏 Standards: ${esc(c.name)}</h2><p class="mute">Pick one to talk through (once a day each). ${c.morale < 40 ? '<span class="warn">Their morale is low: it won\'t land as well.</span>' : ''}</p>` +
    (st.length ? st.map(s => { const v = Math.round(stdOf(c, s.id)), done = c.stdTalkDay && c.stdTalkDay[s.id] === G.day; return `<button style="display:block;width:100%;text-align:left;margin:6px 0;padding:8px" ${done ? 'disabled' : ''} onclick="UI.stdTalk(${c.id},${s.id})"><b>${STD_KINDS[s.kind].icon} ${esc(stdName(s))}</b> <span class="${v >= 60 ? 'good' : 'warn'}">${v}% bought in</span>${done ? ' · talked today' : ''}<div class="mute" style="font-size:12px">Why: ${esc(STD_KINDS[s.kind].why)}</div></button>`; }).join('') : '<p>No store standards yet. Set them on the office computer (📏 Standards).</p>') +
    `<div class="row" style="justify-content:flex-end"><button onclick="UI.hideModal()">Done</button></div>`);
};
UI.stdTalk = function (cid, id) {
  const c = G.crew.find(x => x.id === cid); if (!c) return;
  this.hideModal();
  startWork(2, 'Talking standards', () => stdTalk(c, id));
};
