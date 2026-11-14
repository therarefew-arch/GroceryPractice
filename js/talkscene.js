'use strict';
// =====================================================================
//  Talk scene: one-on-one conversations on the sales floor.
//  Coaching a mistake, a development talk, talking standards and walking
//  an aisle with its owner all pause the game and open a scene like the
//  interview: the associate in their store vest (same face as their sprite),
//  a dialogue box, their mood and body language, and how YOU handle it as
//  buttons. How you say it changes what they learn and how they feel.
// =====================================================================
const TS = { c: null, kind: '', mood: 'neutral', text: '', shown: 0, asked: '', body: '', note: '', talkUntil: 0, raf: 0, t0: 0, lastTs: 0, choices: [], vest: '#ffd34d', dept: null };
const tsPick = a => a[Math.floor(Math.random() * a.length)];

// How they show up to the conversation, before you say a word.
function crewMood(c) {
  const m = ensureMorale(c).morale;
  if (m < 25) return 'upset';
  if (m < 45) return 'negative';
  if (m >= 75) return c.trait === 'social' ? 'excited' : 'positive';
  return c.trait === 'quiet' ? 'nervous' : 'neutral';
}
const tsLow = c => ensureMorale(c).morale < 40;

// ---- the conversations: each returns a node {line, mood, asked?, note?, choices:[{label, fn}]} ----
const tsDone = () => [{ label: 'Back to work', primary: true, fn: () => null }];
const TALKS = {
  coach(c) {
    const n = c.needsCoach; if (!n) return null;
    const A = TRAIN_AREAS[n.area];
    return {
      line: tsLow(c) ? 'What now? I\'m doing my best out here.' : tsPick(['Hey... did I mess something up?', 'Uh oh. Is this about earlier?', 'Yeah? What\'s up?']),
      mood: tsLow(c) ? 'negative' : crewRank(c).key === 'rookie' ? 'nervous' : crewMood(c),
      note: `They made a mistake: ${A.mistake.toLowerCase()}.`,
      choices: [
        { label: 'Ask what happened first, then show them', fn: () => { coachCrew(c); bump(c, 3); return { asked: 'What happened back there?', line: `Honestly, I wasn't sure, so I guessed. ...Oh. ${A.tip} Okay, that makes sense. Thanks for showing me.`, mood: 'positive', note: 'Asking first finds out WHY it happened. They learn it, and they feel respected.', choices: tsDone() }; } },
        { label: 'Show them the right way, step by step', fn: () => { coachCrew(c); return { asked: 'Let me show you how we do this.', line: `Got it. ${A.tip}`, mood: tsLow(c) ? 'neutral' : 'positive', note: 'Showing beats telling. Next time, ask what happened first: you may find a bigger problem.', choices: tsDone() }; } },
        { label: 'Tell them they messed up', fn: () => {
          c.train[n.area] = Math.min(100, c.train[n.area] + 6); c.needsCoach = null; bump(c, -6);
          return { asked: 'That was wrong. Don\'t let it happen again.', line: tsPick(['...Fine. I\'ll fix it.', 'Okay. Sorry.', 'Yeah, I heard you.']), mood: c.trait === 'hothead' ? 'negative' : 'upset', note: 'Blame without showing them how doesn\'t fix the mistake. They learned a little, and they like this job a little less.', choices: tsDone() };
        } },
      ],
    };
  },
  dev(c) {
    const d = G.dev; if (!d || d.id !== c.id || d.talkDay === G.day) return null;
    const tk = d.task && d.task.day === G.day ? DEV_TASKS[d.task.k] : null;
    if (d.debrief) return {
      line: 'About yesterday... I know it didn\'t go great.', mood: tsLow(c) ? 'upset' : 'nervous', note: 'Their stretch task went badly yesterday. This is the debrief.',
      choices: [
        { label: 'What would you do differently?', fn: () => { devTalk(c); d.ready = Math.min(DEV_ASM, d.ready + 2); return { asked: 'What would you do differently next time?', line: 'I tried to do it all myself. Next time I\'d plan it first and put people where the work is. ...Yeah. I get it now.', mood: 'positive', note: 'Letting them find the lesson themselves makes it stick. That\'s a real debrief.', choices: tsDone() }; } },
        { label: 'It\'s fine, don\'t worry about it', fn: () => { d.talkDay = G.day; d.debrief = false; bump(c, 3); return { asked: 'Don\'t worry about it. It happens.', line: 'Oh. Okay, thanks. That\'s a relief.', mood: 'positive', note: 'Reassurance feels nice, but they didn\'t learn anything from the miss. No readiness gained.', choices: tsDone() }; } },
        { label: 'That can\'t happen again', fn: () => { devTalk(c); bump(c, -8); return { asked: 'That can\'t happen again.', line: 'I know. I won\'t let you down.', mood: 'negative', note: 'Pressure after a stretch task makes people stop asking for stretch tasks.', choices: tsDone() }; } },
      ],
    };
    if (tk && !d.task.prepped) return {
      line: `I'm on "${tk.name}" today. Any advice?`, mood: c.trait === 'quiet' ? 'nervous' : 'excited', note: tk.desc,
      choices: [
        { label: 'Walk through the plan together', fn: () => { devTalk(c); return { asked: 'Let\'s walk through it.', line: 'Okay, that helps a lot. I know where to start now.', mood: 'positive', note: 'Setting them up makes success more likely. Doing it on their own teaches more if it works.', choices: tsDone() }; } },
        { label: 'You\'ve got this. Go for it', fn: () => { d.talkDay = G.day; bump(c, 3); return { asked: 'You\'ve got this.', line: 'Really? Okay. I won\'t let you down!', mood: 'excited', note: 'No setup: harder, but they learn more if they pull it off.', choices: tsDone() }; } },
      ],
    };
    return {
      line: tsPick(['Got a minute? I wanted to ask how I\'m doing.', 'Hey! What did you want to talk about?']), mood: crewMood(c), note: `Your protégé. Readiness ${Math.round(d.ready)}/${c.lead ? DEV_ASM : DEV_LEAD}.`,
      choices: [
        { label: 'Ask where they want to grow', fn: () => { devTalk(c); return { asked: 'Where do you want to be in a year?', line: c.lead ? 'Running a shift on my own. Maybe a store someday.' : 'I want to lead a crew. I think I could.', mood: 'excited', note: 'Knowing what they want tells you which stretch tasks to give them.', choices: tsDone() }; } },
        { label: 'Tell them what you see in them', fn: () => { devTalk(c); bump(c, 3); return { asked: 'I see a lot of potential in you.', line: 'Wow. Thanks. Nobody\'s ever said that to me at work.', mood: 'excited', note: 'Saying it out loud is part of growing someone.', choices: tsDone() }; } },
      ],
    };
  },
  std(c) {
    const st = G.standards || []; if (!st.length) return null;
    return {
      line: tsLow(c) ? 'Is this another new rule?' : tsPick(['What\'s up?', 'Yeah? Need something?']), mood: tsLow(c) ? 'negative' : crewMood(c), note: 'Pick a store standard to talk through (once a day each).',
      choices: st.map(s => {
        const talked = c.stdTalkDay && c.stdTalkDay[s.id] === G.day;
        return { label: `${STD_KINDS[s.kind].icon} ${stdName(s)} (${Math.round(stdOf(c, s.id))}%)`, disabled: talked, fn: () => stdApproach(c, s) };
      }).concat([{ label: 'Never mind', fn: () => null }]),
    };
  },
  aisle(c, d) {
    if (!d) return null;
    const D = DEPT[d];
    return {
      line: `You wanted to look at ${D.aisle}?`, mood: tsLow(c) ? 'negative' : 'nervous', note: `${c.name} owns ${D.aisle} (${D.name}). It's at ${aisleScore(d)}%.`,
      choices: [
        { label: 'Walk it together and agree what "right" looks like', fn: () => { ownerWalk(c, d); return { asked: 'Let\'s walk it together.', line: 'Yeah... the middle got away from me. I\'ll keep it like this.', mood: 'positive', note: 'Agreeing on the standard together makes it theirs.', choices: tsDone() }; } },
        { label: 'Ask what\'s getting in the way', fn: () => {
          ownerWalk(c, d); bump(c, 2);
          const why = ['breakdown', 'freight', 'unloader'].includes(c.role) ? 'I\'m on the truck until it\'s done. By then the aisle is a mess.' : !curShift(c) ? 'I\'m barely on the schedule this week.' : G.stock[d].back <= 0 ? 'There\'s nothing in backstock to fill it with.' : 'Honestly? I didn\'t know it counted that much.';
          return { asked: 'What\'s getting in the way?', line: why, mood: 'positive', note: 'Asking finds the real problem. Sometimes it\'s the schedule, the order or the job, not the person.', choices: tsDone() };
        } },
        { label: 'Point out everything that\'s wrong', fn: () => { ownerWalk(c, d); bump(c, -5); return { asked: 'Look at this. And this. And this.', line: 'Okay. I get it.', mood: 'negative', note: 'It got fixed, but it felt like blame. Ownership grows from pride, not fear.', choices: tsDone() }; } },
      ],
    };
  },
};
function stdApproach(c, s) {
  const K = STD_KINDS[s.kind];
  return {
    asked: `About "${K.name}"...`, line: 'Okay. What about it?', mood: crewMood(c), note: K.desc,
    choices: [
      { label: 'Explain why it matters', fn: () => { stdTalk(c, s.id); return stdReply(c, s, `${K.why}`); } },
      { label: 'It\'s the rule. Just do it', fn: () => {
        c.stdTalkDay = c.stdTalkDay || {}; c.stdTalkDay[s.id] = G.day;
        stdGain(c, s.id, STD_TALK / 2);
        if (c.trait === 'hothead' || c.trait === 'perfectionist') bump(c, -3);
        const n = stdReply(c, s, 'It\'s the rule.'); n.note = 'A rule without a reason sticks half as well, and some people push back on it.'; if (c.trait === 'hothead') n.mood = 'negative';
        return n;
      } },
    ],
  };
}
function stdReply(c, s, said) {
  const v = stdOf(c, s.id);
  const line = tsLow(c) ? 'Sure. Whatever you say.' : v >= 80 ? 'Already on it. That\'s just how I work.' : v >= 40 ? 'Yeah, that makes sense. I\'ll do it.' : 'Okay. I\'ll try to remember.';
  return { asked: said, line, mood: tsLow(c) ? 'negative' : v >= 80 ? 'excited' : v >= 40 ? 'positive' : 'neutral', note: `${c.name} is ${Math.round(v)}% bought in now. Remind them, and thank them the day you see them do it.`, choices: tsDone() };
}

// ---- open / close ----
function talkOpen(c, kind, arg) {
  if (!c || !TALKS[kind]) return;
  const node = TALKS[kind](c, arg); if (!node) return;
  if (!$('modal').classList.contains('hidden')) UI.hideModal();
  const r = RT.crew[c.id]; if (r) { r.hold = 3; }
  TS.c = c; TS.kind = kind; TS.prevModal = false; RT.modal = true; RT.keys = {};
  TS.vest = ROLES[c.role].color; TS.dept = ROLES[c.role].dept || (ownsOf ? ownsOf(c)[0] : null) || (kind === 'aisle' ? arg : null) || 'A1';
  let el = $('tscene');
  if (!el) { el = document.createElement('div'); el.id = 'tscene'; document.body.appendChild(el); }
  el.classList.remove('hidden');
  tsSet(node);
  cancelAnimationFrame(TS.raf); TS.t0 = performance.now(); TS.raf = requestAnimationFrame(tsTick);
}
function talkClose() {
  cancelAnimationFrame(TS.raf); TS.raf = 0;
  const el = $('tscene'); if (el) el.classList.add('hidden');
  RT.modal = false; TS.c = null;
  save();
}
function tsSet(node) {
  TS.text = node.line; TS.mood = node.mood || 'neutral'; TS.asked = node.asked || ''; TS.note = node.note || '';
  TS.body = pick(IVS_MOODS[TS.mood].body.map(b => b.replace(/in the chair|on the desk|at the door/g, m => ({ 'in the chair': 'on their feet', 'on the desk': 'on the shelf edge', 'at the door': 'down the aisle' })[m])));
  TS.shown = 0; TS.talkUntil = performance.now() + TS.text.length * 28;
  TS.choices = node.choices || tsDone();
  tsBuild(); tsDraw(performance.now());
}
function tsChoose(i) {
  const ch = TS.choices[i]; if (!ch || ch.disabled) return;
  const next = ch.fn();
  if (next) tsSet(next); else talkClose();
}
const TS_TITLE = { coach: '🎓 Coaching', dev: '🌱 Development talk', std: '📏 Standards', aisle: '🏷 Aisle walk' };
function tsBuild() {
  const c = TS.c; if (!c) return;
  const M = IVS_MOODS[TS.mood];
  $('tscene').innerHTML = `<div class="ivs-card">
    <div class="ivs-top"><span>${TS_TITLE[TS.kind]} · ${esc(ROLES[c.role].name)}${c.lead ? ' · ◆ Lead' : ''}</span><span>Morale ${moodOf(c).icon} ${Math.round(c.morale)}</span><button class="ivs-x" onclick="talkClose()" title="End the conversation">✕</button></div>
    <div class="ivs-stage"><canvas id="ts-cv"></canvas></div>
    <div class="ivs-box" onclick="TS.shown = TS.text.length">
      <div class="ivs-name">${esc(c.name)}</div><div class="ivs-mood" style="color:${M.color};border-color:${M.color}">${esc(M.name)}</div>
      ${TS.asked ? `<div class="ivs-asked">You: ${esc(TS.asked)}</div>` : ''}
      <div class="ivs-text" id="ts-text"></div>
      <div class="ivs-body" style="color:${M.color}">» ${esc(TS.body)}</div>
    </div>
    <div class="ivs-choices">${TS.choices.map((ch, i) => `<button class="${ch.primary ? 'primary' : ''}" ${ch.disabled ? 'disabled' : ''} onclick="tsChoose(${i})">${esc(ch.label)}</button>`).join('')}</div>
    ${TS.note ? `<div class="ivs-hint">${esc(TS.note)}</div>` : ''}
  </div>`;
  tsText();
}
function tsText() { const el = $('ts-text'); if (el) el.textContent = TS.text.slice(0, Math.floor(TS.shown)); }

// ---- drawing: the aisle behind them, the shelf edge in front ----
function tsTick(now) {
  TS.raf = requestAnimationFrame(tsTick);
  const dt = TS.lastTs ? Math.min(0.05, (now - TS.lastTs) / 1000) : 0.016; TS.lastTs = now;
  if (TS.shown < TS.text.length) { TS.shown = Math.min(TS.text.length, TS.shown + dt * 36); tsText(); }
  tsDraw(now);
}
setInterval(() => { if (TS.c && TS.shown < TS.text.length && !TS.raf) { TS.shown = TS.text.length; tsText(); } }, 4000);
function tsDraw(now) {
  const cv = $('ts-cv'); if (!cv || !TS.c) return;
  if (!TS.buf) { TS.buf = document.createElement('canvas'); TS.buf.width = IVS_W; TS.buf.height = IVS_H; }
  const g = TS.buf.getContext('2d'), t = (now - TS.t0) / 1000;
  g.imageSmoothingEnabled = false;
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
  const D = DEPT[TS.dept] || DEPTS[0], col = D.color;
  // back wall and the cyan light strip
  R(0, 0, IVS_W, IVS_H, '#1b2028');
  R(0, 4, IVS_W, 2, PAL.cyan); g.save(); g.shadowColor = PAL.cyan; g.shadowBlur = 8; R(0, 4, IVS_W, 2, PAL.cyan); g.restore();
  // gondola shelves full of their aisle's product, both sides of the frame
  for (const [x0, x1] of [[0, 66], [126, IVS_W]]) {
    R(x0, 10, x1 - x0, 78, '#2a3039');
    for (let sy = 14; sy < 86; sy += 18) {
      R(x0, sy + 13, x1 - x0, 3, '#9aa3ad'); R(x0, sy + 16, x1 - x0, 1, '#ffd34d');
      for (let x = x0 + 2; x < x1 - 6; x += 7) { const gap = noise(x, sy) > 0.85; if (!gap) { R(x, sy + 3, 6, 10, col); R(x, sy + 3, 6, 1, 'rgba(255,255,255,0.3)'); R(x + 1, sy + 7, 4, 2, 'rgba(0,0,0,0.25)'); } } }
  }
  // the aisle sign hanging above
  R(70, 9, 52, 9, '#0d1626'); R(70, 17, 52, 2, col); g.fillStyle = '#9fc8e6'; g.font = '6px monospace'; g.textAlign = 'center'; g.fillText(D.aisle.toUpperCase(), 96, 16);
  drawApplicant(g, R, TS.c, now, t, { mood: TS.mood, talkUntil: TS.talkUntil, vest: TS.vest });
  // a shelf edge in front (where their hands rest)
  R(0, 86, IVS_W, 22, '#2a3039'); R(0, 86, IVS_W, 2, '#9aa3ad'); R(0, 88, IVS_W, 2, '#ffd34d');
  for (let x = 6; x < IVS_W; x += 24) { R(x, 91, 12, 6, '#f4f4f4'); R(x + 1, 93, 8, 1, 'rgba(0,0,0,0.4)'); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < IVS_H; y += 3) g.fillRect(0, y, IVS_W, 1);
  const crop = cv.parentElement.clientWidth < 600 ? [40, 12, 112, 84] : [0, 0, IVS_W, IVS_H];
  if (cv.width !== crop[2] || cv.height !== crop[3]) { cv.width = crop[2]; cv.height = crop[3]; cv.style.aspectRatio = crop[2] + ' / ' + crop[3]; }
  const cg = cv.getContext('2d'); cg.imageSmoothingEnabled = false;
  cg.drawImage(TS.buf, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2], crop[3]);
}
