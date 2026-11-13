'use strict';
// =====================================================================
//  Customer interactions.
//  A few times a day a shopper stops and needs someone: a yellow "?" over
//  their head. Walk up and press E. Each one has a better and a worse way
//  to handle it, and you see why afterward:
//  - "Where is...?"  Walk them to it. Pointing works only if you know the
//    aisle; "not my department" is never the answer.
//  - "Any more in the back?"  Go look. If it's back there, that's a sale
//    you almost lost.
//  - Price dispute.  Check the shelf before you decide. If the tag is
//    wrong, honor it and fix the tag.
//  - Upset customer.  Listen, apologize, solve it, thank them.
//  Nobody comes in a few minutes and they leave unhappy. A crew member
//  working nearby helps if you don't, as well as their skill allows.
// =====================================================================
const CR_PATIENCE = 7;     // game minutes they wait
const CR_CREW_AFTER = 2.5; // a nearby associate steps in after this long
const CR_MAX = 2;

const crActive = () => RT.customers.filter(cu => cu.req && cu.state === 'help');
const crWhere = cu => { const s = Object.entries(MAPD.shelfTiles || {}).find(([d, ts]) => ts.some(t => Math.abs(t.x + 0.5 - cu.x) < 2 && Math.abs(t.y + 0.5 - cu.y) < 2)); return s ? DEPT[s[0]].aisle : 'the store'; };

function custHour(h) {
  if (G.phase !== 'day' || h * 60 < OPEN + 60 || h * 60 >= CLOSE - 60) return;
  if (crActive().length >= CR_MAX || Math.random() > 0.3) return;
  const cu = pick(RT.customers.filter(c => (c.state === 'shop' || c.state === 'walk') && !c.req));
  if (!cu) return;
  const low = DEPTS.filter(d => shelfPct(d.id) < 0.2);
  const kinds = [['where', 40], ['back', low.length ? 25 : 0], ['price', 20], ['upset', G.sat < 60 ? 25 : 12]];
  const kind = wpick(kinds.filter(k => k[1] > 0), k => k[1])[0];
  const d = kind === 'back' ? pick(low) : wpick(DEPTS, x => x.demand);
  const item = wpick(d.items, i => i[1])[0];
  const req = { kind, dept: d.id, item, at: G.time, waited: 0 };
  if (kind === 'price') req.right = G.tags.some(t => t.dept === d.id && t.kind === 'error') ? Math.random() < 0.8 : Math.random() < 0.15;
  if (kind === 'upset') req.about = pick([`couldn't find ${item} and nobody was around to ask`, 'waited forever in line at the register', `bought ${item} last week and it was already expired`, 'got charged twice for the same thing']);
  cu.req = req; cu.path = null; cu.state = 'help'; cu.t = 0;
  toast(`🙋 A customer near ${crWhere(cu)} needs help (${{ where: 'looking for something', back: 'asking about stock', price: 'price question', upset: 'upset' }[kind]}).`, kind === 'upset' ? 'warn' : 'info');
}

// Each tick a customer waits. Returns true while they're waiting.
function custReqTick(cu, dt) {
  if (cu.state !== 'help' || !cu.req) return false;
  if (RT.custHelping === cu) { if (RT.modal) return true; RT.custHelping = null; } // closed the window without answering
  cu.req.waited += dt;
  cu.emote = cu.req.kind === 'upset' ? '!' : '?'; cu.emoteT = 1;
  if (cu.req.waited >= CR_CREW_AFTER) {
    const c = G.crew.find(x => { const r = RT.crew[x.id]; return r && r.inBuilding && onShift(x) && !r.onBreak && dist(r, cu) < 3; });
    if (c) return crewHelps(cu, c), false;
  }
  if (cu.req.waited >= CR_PATIENCE) {
    G.sat = Math.max(0, G.sat - (cu.req.kind === 'upset' ? 3 : 1.5));
    G.today.custIgnored = (G.today.custIgnored || 0) + 1;
    floater(cu.x, cu.y - 1, 'ignored', '#ff5a4e');
    custDone(cu, 'leave');
    return false;
  }
  return true;
}
function custDone(cu, how) {
  cu.req = null; cu.emote = how === 'leave' ? '…' : '♥'; cu.emoteT = 2;
  if (how === 'leave') { cu.state = 'leave'; routeCustomer(cu); }
  else { cu.state = cu.i < cu.stops.length ? 'walk' : 'toReg'; routeCustomer(cu); }
}
function crewHelps(cu, c) {
  const q = cu.req, good = c.skill >= 3 && c.trait !== 'hothead';
  if (q.kind === 'back' && good && G.stock[q.dept].back > 0) custSell(q.dept, randi(1, 3), 'back');
  G.sat = clamp(G.sat + (good ? 1 : -0.5), 0, 100);
  G.today.custCrew = (G.today.custCrew || 0) + 1;
  const r = RT.crew[c.id]; if (r) floater(r.x, r.y - 1.2, good ? 'helped' : 'meh', good ? '#57f287' : '#f0c94a');
  custDone(cu, good ? 'ok' : 'leave');
}
function custSell(dept, q, from) {
  const s = G.stock[dept], d = DEPT[dept], t = G.today;
  const got = from === 'back' ? Math.min(q, s.back) : Math.min(q, s.shelf);
  if (from === 'back') s.back -= got; else s.shelf -= got;
  t.sales += got * d.price; t.units[dept] = (t.units[dept] || 0) + got;
  return got;
}

// ---- you ----
function custInteraction(p) {
  const cu = nearest(crActive(), p, 1.6);
  if (!cu) return null;
  return { label: `🙋 Help the customer (${{ where: 'looking for something', back: 'asking about stock', price: 'price question', upset: 'upset' }[cu.req.kind]})`, at: cu, fn: () => { RT.custHelping = cu; UI.custReq(cu); } };
}
// The choices: [key, text, quality 'best'|'ok'|'bad']
function custChoices(cu) {
  const q = cu.req, d = DEPT[q.dept];
  if (q.kind === 'where') {
    const wrong = shuffle(DEPTS.filter(x => x.aisle !== d.aisle)).slice(0, 2);
    return [['walk', `"Let me show you." Walk them to the ${q.item}.`], ...shuffle([d, ...wrong]).map(x => [`aisle:${x.id}`, `"It's in ${x.aisle}."`]), ['notmine', '"Sorry, that\'s not my department."']];
  }
  if (q.kind === 'back') return [['check', '"Let me go check the back for you."'], ['nope', '"If it\'s not on the shelf, we don\'t have it."'], ['sub', `"We're low on that. Can I show you something similar?"`]];
  if (q.kind === 'price') return [['honor', '"No problem, I\'ll honor the shelf price."'], ['look', '"Let\'s walk over and look at the tag together."'], ['register', '"The register price is always the right one."']];
  return [['last', '"I\'m sorry that happened. Tell me what went on." (listen, apologize, fix it, thank them)'], ['short', '"We\'re really short-staffed today."'], ['desk', '"You\'ll have to take that to the service desk."'], ['notme', '"That wasn\'t me, I just got here."']];
}
function custPrompt(cu) {
  const q = cu.req;
  return { where: `"Excuse me, where can I find ${q.item}?"`, back: `"The shelf's almost empty. Do you have any more ${q.item} in the back?"`, price: `"The tag on the ${q.item} said one price, but it rang up higher. What's going on?"`, upset: `"I need to talk to somebody. I ${q.about}."` }[q.kind];
}
// Resolve your answer. Returns {good, title, why}.
function custAnswer(cu, key) {
  const q = cu.req, d = DEPT[q.dept], t = G.today; RT.custHelping = null;
  if (!q) return null;
  let good = 'ok', title = '', why = '', sat = 0, leave = false, work = 0;
  const done = () => { t.custHelped = (t.custHelped || 0) + 1; if (good === 'best') t.custBest = (t.custBest || 0) + 1; if (good === 'bad') t.custBad = (t.custBad || 0) + 1; };
  if (q.kind === 'where') {
    if (key === 'walk') { good = 'best'; sat = 2; work = 1.5; const g = G.stock[q.dept].shelf > 0 ? custSell(q.dept, randi(1, 2), 'shelf') : 0; title = 'You walked them to it'; why = `Walking a customer to the product is the standard: they find it, ${g ? 'they buy it, ' : ''}and they remember someone cared.`; }
    else if (key.startsWith('aisle:')) { const right = key.slice(6) === q.dept; good = right ? 'ok' : 'bad'; sat = right ? 0.5 : -1.5; leave = !right; title = right ? `Right aisle (${d.aisle})` : `Wrong aisle: it's in ${d.aisle}`; why = right ? 'Pointing works when you know the store, but walking them there is better. They might not find it on the shelf.' : 'They walked to the wrong aisle, couldn\'t find it, and left without it. Know where everything is, or walk them there.'; }
    else { good = 'bad'; sat = -2; leave = true; title = '"Not my department"'; why = 'There\'s no such thing as "not my department" to a customer. Every associate helps every customer.'; }
  } else if (q.kind === 'back') {
    const back = G.stock[q.dept].back;
    if (key === 'check') { work = 2.5; if (back > 0) { good = 'best'; sat = 2; const g = custSell(q.dept, randi(2, 4), 'back'); title = `There were ${back} in the back`; why = `You found ${g} for them. An empty shelf with backstock in the back is a sale we almost lost: always check, and get that backstock out.`; } else { good = 'ok'; sat = 0.5; title = 'Nothing in the back'; why = 'You checked, so they know it\'s really out. Offer something similar or tell them when the next truck comes.'; } }
    else if (key === 'nope') { good = back > 0 ? 'bad' : 'ok'; sat = back > 0 ? -2 : -0.5; leave = true; title = back > 0 ? `There were ${back} in the back` : 'It really was out'; why = back > 0 ? 'You sent them away from product we had. Never say "we don\'t have it" without looking.' : 'True this time, but you didn\'t know that. Check before you answer.'; }
    else { good = back > 0 ? 'ok' : 'best'; sat = 1; const alt = pick(DEPTS.filter(x => x.id !== q.dept)); title = 'You offered a substitute'; why = back > 0 ? `Nice save, but there were ${back} in the back. Check first, then offer a substitute.` : 'With nothing in the back, a substitute is the best answer: they leave with something.'; custSell(alt.id, 1, 'shelf'); }
  } else if (q.kind === 'price') {
    if (key === 'look') { work = 1.5; if (q.right) { good = 'best'; sat = 3; t.scanLoss += 1.5; const tag = G.tags.find(x => x.dept === q.dept && x.kind === 'error'); if (tag) fixTag(tag, true); title = 'The tag was wrong'; why = 'You checked, honored the shelf price, and fixed the tag so it doesn\'t happen to the next customer. That\'s the whole job.'; } else { good = 'best'; sat = 1; title = 'The tag was right'; why = 'They read the tag for the item next to it. Looking together settles it without anyone feeling cheated.'; } }
    else if (key === 'honor') { good = 'ok'; sat = q.right ? 2 : 1; t.scanLoss += 1.5; title = q.right ? 'Honored (the tag was wrong)' : 'Honored (the tag was actually right)'; why = q.right ? 'Honoring was right, but the wrong tag is still on the shelf for the next customer. Fix it.' : 'It cost a little to keep them happy. Checking first would have told you who was right.'; }
    else { good = 'bad'; sat = q.right ? -3 : -1; leave = q.right; title = q.right ? 'The tag really was wrong' : 'They were wrong, but…'; why = q.right ? 'The customer was right and left angry. When the shelf and the register disagree, the shelf price wins.' : 'Even when the register is right, "the register is always right" starts a fight. Walk over and look together.'; if (q.right) mail('Customer Service Desk', 'Price complaint', `A customer says the shelf tag for ${q.item} was lower than the register and the manager told them the register is always right. They want to talk to the district office.`); }
  } else {
    if (key === 'last') { good = 'best'; sat = 3; work = 2; title = 'You listened and fixed it'; why = 'Listen, apologize, solve it, thank them. Most upset customers just want someone to take them seriously.'; }
    else if (key === 'short') { good = 'bad'; sat = -1; title = 'An excuse'; why = 'Short-staffed is our problem, not theirs. It sounds like an excuse, and they still don\'t have what they needed.'; }
    else if (key === 'desk') { good = 'ok'; sat = -0.5; title = 'Passed off'; why = 'Sending them somewhere else makes them tell the story twice. The manager in front of them is the right person.'; }
    else { good = 'bad'; sat = -3; leave = true; title = '"Not my fault"'; why = 'They didn\'t ask whose fault it was. You just lost a customer and they\'ll tell their friends.'; }
  }
  G.sat = clamp(G.sat + sat, 0, 100);
  done();
  if (good !== 'bad') addXP(good === 'best' ? 6 : 2, G.player);
  if (work) startWork(work, 'Helping a customer', () => {});
  floater(cu.x, cu.y - 1, good === 'best' ? '+happy' : good === 'bad' ? 'unhappy' : 'ok', good === 'best' ? '#57f287' : good === 'bad' ? '#ff5a4e' : '#f0c94a');
  custDone(cu, leave ? 'leave' : 'ok');
  return { good, title, why };
}

// ---- reports ----
function custTips() {
  const t = G.today, tips = [];
  if (t.custIgnored) tips.push(`${plural(t.custIgnored, 'customer')} waited for help and nobody came. Watch for the yellow "?" and get there fast, or keep crew working on the floor.`);
  if (t.custBad) tips.push(`${plural(t.custBad, 'customer')} left worse off after talking to you. Walk them to it, check the back, check the tag, and listen first.`);
  return tips;
}
function custDayExtras() {
  const t = G.today;
  return { custHelped: t.custHelped || 0, custBest: t.custBest || 0, custBad: t.custBad || 0, custIgnored: t.custIgnored || 0, custCrew: t.custCrew || 0 };
}
function custReviewNotes(days, note, praise) {
  const s = k => sum(days.map(d => d[k] || 0));
  const helped = s('custHelped'), best = s('custBest'), bad = s('custBad'), ign = s('custIgnored');
  if (ign >= 4) note('Customer service', `${ign} customers waited for help and gave up this week.`,
    'A customer who asks for help and gets nobody doesn\'t come back.',
    'Customers with a question show a yellow "?". Get to them in a few minutes, or keep an associate on the floor.');
  else if (bad >= 2) note('Customer service', `${bad} of your ${helped} customer conversations went badly.`,
    'You set the example. If the manager points and says "not my department," so does the crew.',
    'Walk them to it, check the back before you say no, check the tag before you decide, and listen before you talk.');
  else if (best >= 3) praise.push(`You handled ${best} customers the right way this week. The crew sees that.`);
}

// A yellow "?" (or red "!") bubble with a shrinking patience bar.
function drawCustReqMark(cu, top) {
  const x = Math.round(cu.x * T), y = Math.round(top - 18), up = cu.req.kind === 'upset';
  const blink = Math.floor(performance.now() / 350) % 2;
  ctx.fillStyle = up ? '#ff5a4e' : '#ffd34d'; ctx.fillRect(x - 8, y, 16, 13); ctx.fillRect(x - 2, y + 13, 4, 3);
  label(ctx, up ? '!' : '?', x, y + 7, { font: 'bold 11px system-ui', color: blink ? '#111' : '#3a2a00' });
  const left = 1 - cu.req.waited / CR_PATIENCE;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 9, y - 4, 18, 3);
  ctx.fillStyle = left > 0.5 ? '#57f287' : left > 0.25 ? '#f0b429' : '#e5534b'; ctx.fillRect(x - 9, y - 4, Math.round(18 * left), 3);
}
