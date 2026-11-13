'use strict';
// =====================================================================
//  Interviews.
//  An applicant's résumé only tells you so much: the skill it claims can
//  be off by a star, and it says nothing about attitude, attendance or
//  when they can really work. Interview them first (office computer →
//  Hiring): you get 3 questions, so pick the ones that tell you what you
//  need. Some questions are illegal to ask (age, kids, religion, where
//  someone's from): ask one and the applicant may file a complaint.
//  You can still hire on the spot from the résumé; you find out the rest
//  after they start.
// =====================================================================
const IV_QUESTIONS = 3;     // questions per interview
const IV_PER_DAY = 3;       // interviews you have time for in a day
const PAST_JOBS = ['stocker at a big-box store', 'cashier at a gas station', 'line cook', 'warehouse picker', 'stocker at another grocery store', 'fast-food crew', 'retail sales floor', 'delivery driver', 'no job yet (first job)'];

// Hidden truths, made when the applicant applies.
function makeApplicantTruth(k) {
  k.trait = pick(Object.keys(TRAITS));
  const r = Math.random();
  k.rel = r < 0.2 ? 'poor' : r < 0.75 ? 'ok' : 'good';
  k.claim = clamp(k.skill + (Math.random() < 0.5 ? 0 : pick([-1, 1, 1])), 1, 5); // résumés lean optimistic
  k.years = k.skill <= 1 ? 0 : randi(k.skill - 1, k.skill * 2);
  k.job = k.years ? pick(PAST_JOBS.slice(0, -1)) : PAST_JOBS[PAST_JOBS.length - 1];
  // 1 in 5 says "open" on the application but really can't work most of the shifts they asked for
  k.trueAvail = k.avail;
  if (Math.random() < 0.2) {
    let worst = null, fits = 8;
    for (const p of Object.values(AVAIL_PROFILES)) { const row = p.row(), f = row.filter(a => shiftFits(a, k.shift)).length; if (f < fits) { fits = f; worst = row; } }
    if (worst && fits < 5) { k.trueAvail = worst; k.avail = WEEKDAYS.map(() => 'any'); k.lied = true; }
  }
  k.wage = +(12.5 + k.claim * 1.25 + rand(0, 1)).toFixed(2); // they ask for what their résumé claims
  k.iv = null; // { qs: [{q, a}], done }
  return k;
}
const REL_CALLOUT = { good: -0.02, ok: 0, poor: 0.07 };

// ---- the questions ----
const IV_Q = {
  lastJob: { q: 'Walk me through what you did at your last job.', reveals: 'skill',
    a: k => k.years === 0 ? 'This would be my first job. I\'m a fast learner, though, I promise.'
      : k.skill >= 4 ? `I was a ${k.job} for ${k.years} years. I usually got my work done before anybody else, and they had me train the new people. I like knowing exactly how a thing is supposed to be done.`
      : k.skill === 3 ? `${k.years} years as a ${k.job}. Stocking, cleaning up, whatever they needed. I kept up fine.`
      : `I was a ${k.job} for a bit. Um, I did a little of everything, I guess. Mostly whatever my lead told me.` },
  leave: { q: 'Why are you leaving your current job?', reveals: 'rel',
    a: k => k.rel === 'poor' ? 'Honestly they said I was late too much and called out too much. But my car is old, it\'s not my fault.'
      : k.rel === 'good' ? 'I want more hours and a place where I can move up. I haven\'t missed a shift in two years.'
      : 'I\'m looking for more hours, and this is closer to home.' },
  avail: { q: 'What days and hours can you really work? Be honest, it\'s fine.', reveals: 'avail',
    a: k => k.lied ? `Oh, well... I put "open" on the application, but actually: ${availText(k.trueAvail).toLowerCase()}. Is that okay?`
      : `What I put down is right: ${availText(k.trueAvail).toLowerCase()}.` },
  conflict: { q: 'Tell me about a time you disagreed with a coworker. What happened?', reveals: 'trait',
    a: k => ({
      easygoing: 'I don\'t really let stuff get to me. If somebody does it differently, whatever, we figure it out.',
      hothead: 'There was this guy who never pulled his weight, and I finally told him off in front of everybody. He had it coming.',
      perfectionist: 'Someone kept stocking my aisle wrong, labels not lined up, old product in front. I fixed it and told the manager.',
      social: 'We talked it out over lunch. I get along with pretty much everybody, I\'m kind of the one who plans the potlucks.',
      quiet: 'I didn\'t really say anything. I just kept doing my work and tried to stay out of it.',
    })[k.trait] },
  customer: { q: 'You\'re working a pallet and a customer asks where the bread is. What do you do?', reveals: 'service',
    a: k => k.skill >= 3 && k.trait !== 'hothead' ? 'Stop what I\'m doing and walk them to it. The pallet can wait a minute.'
      : k.trait === 'hothead' ? 'Point them to the aisle. I\'ve got a pallet to finish, you know?'
      : 'Tell them I think it\'s aisle three? I\'d have to learn the store first.' },
  // illegal: protected characteristics
  age: { q: 'How old are you?', illegal: 'age', legal: '"Are you 18 or older?" only if the job legally requires it' },
  kids: { q: 'Do you have kids? Who watches them while you work?', illegal: 'family status', legal: '"Can you work the hours this job needs?"' },
  origin: { q: 'Where are you from originally? I hear an accent.', illegal: 'national origin', legal: '"Are you authorized to work in the US?" (and only that)' },
  church: { q: 'Do you go to church on Sundays?', illegal: 'religion', legal: '"Can you work weekends?"' },
};
const IV_ORDER = ['lastJob', 'leave', 'avail', 'conflict', 'customer', 'kids', 'age', 'church', 'origin'];

function startInterview(id) {
  const k = (G.candidates || []).find(x => x.id === id); if (!k || k.iv) return;
  const t = G.today;
  if ((t.interviews || 0) >= IV_PER_DAY) { toast(`You've done ${IV_PER_DAY} interviews today. The rest of the day is the store's.`, 'warn'); return; }
  t.interviews = (t.interviews || 0) + 1;
  k.iv = { qs: [], done: false };
}
function askQuestion(id, key) {
  const k = (G.candidates || []).find(x => x.id === id), Q = IV_Q[key];
  if (!k || !k.iv || k.iv.done || !Q || k.iv.qs.some(x => x.key === key)) return;
  if (Q.illegal) {
    k.iv.qs.push({ key, q: Q.q, a: '...Um. Are you allowed to ask me that?', bad: true });
    G.today.hrComplaint = (G.today.hrComplaint || 0) + 1;
    G.hrComplaints = (G.hrComplaints || 0) + 1;
    mail('Human Resources', 'Interview complaint', `An applicant (${k.name}) reported that they were asked "${Q.q}" in their interview.\nThat question is about ${Q.illegal}, a protected characteristic. Asking it, even to make small talk, can be used as evidence of discrimination if we don't hire them.\nAsk about the job instead: ${Q.legal}.\nThis is on file. Please review the interview guide before your next interview.`);
    toast(`⚠ ${k.name} looks uncomfortable. That question was about ${Q.illegal}: HR will hear about it.`, 'bad');
    if (Math.random() < 0.5) { k.iv.done = true; k.withdrew = true; k.iv.qs.push({ q: '', a: `${k.name} thanks you for your time and leaves. They withdraw their application.` }); return; }
  } else {
    k.iv.qs.push({ key, q: Q.q, a: Q.a(k) });
    k.seen = k.seen || {}; k.seen[Q.reveals] = true;
  }
  if (k.iv.qs.length >= IV_QUESTIONS) k.iv.done = true;
}
// What you know about an applicant (for the card).
function applicantNotes(k) {
  const s = k.seen || {}, out = [];
  out.push(s.skill ? `Skill: ${stars(k.skill)} <span class="mute">(interviewed)</span>` : `Résumé: ${k.years ? `${k.years} yr${k.years > 1 ? 's' : ''} as a ${k.job}` : 'first job'} · claims ${stars(k.claim)}`);
  out.push(`Available: ${availText(s.avail ? k.trueAvail : k.avail)}${s.avail ? ' <span class="mute">(confirmed)</span>' : ''}${s.avail && k.lied ? ' <span class="bad">not what the application said</span>' : ''}`);
  if (s.rel) out.push(`Attendance: <span class="${k.rel === 'poor' ? 'bad' : k.rel === 'good' ? 'good' : ''}">${{ poor: 'red flag', ok: 'fine', good: 'strong' }[k.rel]}</span>`);
  if (s.trait) out.push(`Personality: <b>${TRAITS[k.trait].name}</b> <span class="mute">(${TRAITS[k.trait].desc.toLowerCase()})</span>`);
  if (s.service) out.push(`With customers: ${k.skill >= 3 && k.trait !== 'hothead' ? '<span class="good">walks them to it</span>' : '<span class="warn">points</span>'}`);
  return out;
}
// Hiring: the applicant's truths become the associate's.
function applyHire(c, k) {
  c.trait = k.trait; c.rel = k.rel; c.avail = k.trueAvail || k.avail;
  const t = G.today;
  if (!k.iv) t.hiredBlind = (t.hiredBlind || 0) + 1;
  if (k.lied && !(k.seen && k.seen.avail)) mail(c.name, 'About my availability', `Hi! Excited to start. One thing: I put "open" on my application, but really ${availText(c.avail).toLowerCase()}. Sorry, I should have said. Can you schedule me around it?\n— ${c.name}`);
  G.hireLog = (G.hireLog || []).concat([{ day: G.day, id: c.id, name: c.name, iv: !!k.iv, rel: k.rel, trait: k.trait, lied: !!k.lied }]).slice(-40);
}

// ---- reports ----
function interviewTips() {
  const t = G.today, tips = [];
  if (t.hrComplaint) tips.push('An applicant complained to HR about an interview question. Never ask about age, kids or family, religion, or where someone is from. Ask about the job: "Can you work the hours this job needs?"');
  if (t.hiredBlind) tips.push(`You hired ${plural(t.hiredBlind, 'person')} without an interview. A résumé can be off by a star and says nothing about attendance or when they can really work.`);
  return tips;
}
function interviewDayExtras() {
  const t = G.today;
  return { interviews: t.interviews || 0, hrComplaint: t.hrComplaint || 0, hiredBlind: t.hiredBlind || 0 };
}
function interviewReviewNotes(days, note, praise) {
  const hr = sum(days.map(d => d.hrComplaint || 0)), blind = sum(days.map(d => d.hiredBlind || 0)), iv = sum(days.map(d => d.interviews || 0));
  if (hr) note('Interviews', `${plural(hr, 'applicant')} complained to HR about illegal interview questions this week.`,
    'Questions about age, family, religion or national origin are evidence of discrimination if you don\'t hire that person. It\'s the company\'s risk and yours.',
    'Stick to the job: past work, why they\'re leaving, availability, how they handle coworkers and customers.', true);
  else if (blind) note('Hiring', `You hired ${plural(blind, 'person')} straight off the résumé.`,
    'A bad hire costs more than an open slot: training, call-outs, and the drama they bring.',
    'Interview everyone. Three good questions tell you their real skill, attendance and availability.');
  else if (iv >= 2) praise.push('You interviewed before you hired, and kept the questions legal.');
}
