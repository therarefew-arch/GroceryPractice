'use strict';
// =====================================================================
//  The weekly P&L.
//  Friday night closes the store week (Saturday to Friday). Saturday
//  morning the P&L is on the office computer (📒 P&L): sales, cost of
//  goods, gross profit, shrink, labor, store expenses and the bottom line
//  (store contribution), each against budget.
//  Read it like a store manager: find the line that cost the most against
//  budget and pick it as next week's action plan. The P&L is just every
//  decision from the week, added up in dollars.
// =====================================================================
const COGS_PCT = 0.70;        // cost of goods: 30% gross margin
const SHRINK_BUDGET = 0.02;   // 2% of sales
const CARD_FEES = 0.018;      // card processing
const SUPPLIES_PCT = 0.006;   // bags, tape, cleaning supplies
const FIXED_WEEK = { rent: 2600, utilities: 950, mgr: 1150 }; // rent & CAM, utilities, your salary

// Daily pieces the P&L needs (stored with each day).
function pnlDayExtras() {
  const t = G.today;
  return { pShrink: Math.round(t.shrink || 0), pScan: Math.round(t.scanLoss || 0), pCount: Math.round(t.countShrink || 0), pDmg: Math.round(t.dmgLoss || 0), pMark: Math.round(t.resetMarkdown || 0) };
}
function buildPnl(w) {
  const days = G.pastDays.filter(d => d.week === w);
  if (!days.length) return null;
  const s = k => sum(days.map(d => d[k] || 0));
  const sales = s('sales'), budSales = s('goal');
  const L = (key, name, act, bud, sign, group) => ({ key, name, act: Math.round(act), bud: Math.round(bud), sign, group });
  const lines = [
    L('sales', 'Sales', sales, budSales, 1, 'sales'),
    L('cogs', 'Cost of goods', sales * COGS_PCT, budSales * COGS_PCT, -1, 'cogs'),
    L('spoil', 'Shrink: spoiled, expired, short', s('pShrink'), budSales * SHRINK_BUDGET * 0.45, -1, 'shrink'),
    L('damage', 'Shrink: damages', s('pDmg'), budSales * SHRINK_BUDGET * 0.2, -1, 'shrink'),
    L('scan', 'Shrink: price errors', s('pScan'), budSales * SHRINK_BUDGET * 0.1, -1, 'shrink'),
    L('count', 'Shrink: inventory adjustments', s('pCount'), budSales * SHRINK_BUDGET * 0.2, -1, 'shrink'),
    L('mark', 'Markdowns: clearance', s('pMark'), budSales * SHRINK_BUDGET * 0.05, -1, 'shrink'),
    L('labor', 'Hourly payroll', s('labor'), budSales * LABOR_TARGET / 100, -1, 'labor'),
    L('mgr', 'Management salary', FIXED_WEEK.mgr * days.length / 7, FIXED_WEEK.mgr * days.length / 7, -1, 'labor'),
    L('fees', 'Card fees', sales * CARD_FEES, budSales * CARD_FEES, -1, 'exp'),
    L('supplies', 'Supplies', sales * SUPPLIES_PCT, budSales * SUPPLIES_PCT, -1, 'exp'),
    L('fixed', 'Rent and utilities', (FIXED_WEEK.rent + FIXED_WEEK.utilities) * days.length / 7, (FIXED_WEEK.rent + FIXED_WEEK.utilities) * days.length / 7, -1, 'exp'),
  ];
  const net = k => sum(lines.map(l => l[k] * l.sign));
  const p = { week: w, day: G.day, days: days.length, lines, act: Math.round(net('act')), bud: Math.round(net('bud')), plan: null };
  p.gp = { act: Math.round(sales * (1 - COGS_PCT)), bud: Math.round(budSales * (1 - COGS_PCT)) };
  // the line that cost the most against budget (lost sales count at their margin)
  const cost = l => l.key === 'sales' ? (l.bud - l.act) * (1 - COGS_PCT) : l.key === 'cogs' ? -Infinity : (l.act - l.bud);
  p.worst = lines.filter(l => !['cogs', 'mgr', 'fixed'].includes(l.key)).sort((a, b) => cost(b) - cost(a))[0].key;
  p.worstCost = Math.round(cost(lines.find(l => l.key === p.worst)));
  G.pnl = (G.pnl || []).concat([p]).slice(-8);
  mail('Finance', `Week ${w} P&L is ready`, `Your week ${w} P&L is on the office computer (📒 P&L).\nStore contribution: ${money(p.act)} against a budget of ${money(p.bud)} (${p.act >= p.bud ? 'ahead' : 'behind'} by ${money(Math.abs(p.act - p.bud))}).\nReview it and pick your action plan for next week.`);
  return p;
}
const PLAN_FIX = {
  sales: 'Sales are short of plan. Sales come from in-stock, the ad, endcaps and service: fill the holes first, keep the ad product full, and order for the forecast (and the weather).',
  spoil: 'Spoilage and outdates: work cold pallets first, code-check dairy every morning, rotate, and don\'t over-order perishables.',
  damage: 'Damages: train careful handling, fix the backroom so product isn\'t crushed, and claim vendor credits in reclaim every day.',
  scan: 'Price errors: hang every tag the day it comes, fix scan errors first, and check the tag when a customer disputes a price.',
  count: 'Inventory adjustments: counts are finding missing product. Check in DSD carefully, claim shorts, keep go-backs moving, and count accurately.',
  mark: 'Clearance markdowns: sell discontinued items down before the reset instead of backstocking more.',
  labor: 'Payroll is over: schedule to labor demand, watch overtime, and don\'t let the night unload spill into overtime.',
  fees: 'Card fees just follow sales.', supplies: 'Supplies just follow sales.',
};
function pickPlan(w, key) {
  const p = (G.pnl || []).find(x => x.week === w); if (!p || p.plan) return null;
  p.plan = key; p.planRight = key === p.worst;
  if (p.planRight) addXP(15, G.player);
  return p;
}

// ---- the office tab ----
function pnlTabHTML() {
  const list = G.pnl || [];
  let h = '<h2>📒 Weekly P&L</h2>';
  if (!list.length) return h + '<p class="mute">The first P&L comes out after the store week closes Friday night (weeks run Saturday to Friday).</p>';
  const p = list[list.length - 1];
  const col = (l, v) => { const d = (l.act - l.bud) * l.sign; return Math.abs(d) < 1 ? '' : d > 0 ? 'good' : 'bad'; };
  h += `<p class="mute">Week ${p.week}${p.days < 7 ? ` (${p.days} days)` : ''}. Green beat the budget, red missed it. Costs are subtracted from gross profit; the bottom line is store contribution.</p>`;
  h += '<table><tr><th>Line</th><th class="n">Actual</th><th class="n">Budget</th><th class="n">Vs budget</th><th class="n">% of sales</th></tr>';
  const sales = p.lines[0].act || 1, row = (l, bold) => `<tr><td>${bold ? `<b>${l.name}</b>` : l.name}</td><td class="n">${money(l.act)}</td><td class="n">${money(l.bud)}</td><td class="n ${col(l)}">${money((l.act - l.bud) * l.sign)}</td><td class="n mute">${(l.act / sales * 100).toFixed(1)}%</td></tr>`;
  h += row(p.lines[0], true) + row(p.lines[1]);
  h += `<tr><td><b>Gross profit</b></td><td class="n"><b>${money(p.gp.act)}</b></td><td class="n">${money(p.gp.bud)}</td><td class="n ${p.gp.act >= p.gp.bud ? 'good' : 'bad'}">${money(p.gp.act - p.gp.bud)}</td><td class="n mute">${(p.gp.act / sales * 100).toFixed(1)}%</td></tr>`;
  for (const g of ['shrink', 'labor', 'exp']) {
    const ls = p.lines.filter(l => l.group === g);
    h += `<tr><td colspan="5" class="mute" style="padding-top:8px">${{ shrink: 'Shrink and markdowns', labor: 'Labor', exp: 'Store expenses' }[g]}</td></tr>` + ls.map(l => row(l)).join('');
  }
  h += `<tr style="border-top:2px solid #ffd34d"><td><b>Store contribution</b></td><td class="n"><b>${money(p.act)}</b></td><td class="n">${money(p.bud)}</td><td class="n ${p.act >= p.bud ? 'good' : 'bad'}"><b>${money(p.act - p.bud)}</b></td><td class="n mute">${(p.act / sales * 100).toFixed(1)}%</td></tr></table>`;
  const opts = p.lines.filter(l => !['cogs', 'mgr', 'fixed'].includes(l.key));
  if (!p.plan) {
    h += `<div class="card" style="margin-top:12px"><b>Action plan.</b> Which line do you go after first next week? <span class="mute">(Pick the one that cost the most against budget. Lost sales cost their margin, not the whole sale.)</span><div style="margin-top:6px">${opts.map(l => `<button style="margin:3px" onclick="UI.pnlPlan(${p.week},'${l.key}')">${esc(l.name)}</button>`).join('')}</div></div>`;
  } else {
    const w = p.lines.find(l => l.key === p.worst);
    h += `<div class="card" style="margin-top:12px">${p.planRight ? '✅' : '⚠'} <b>Your action plan: ${esc(p.lines.find(l => l.key === p.plan).name)}.</b> ${p.planRight ? 'That was the biggest miss against budget.' : `The biggest miss was <b>${esc(w.name)}</b> (about ${money(p.worstCost)} against budget).`}<div class="mute" style="margin-top:4px">${esc(PLAN_FIX[p.worst] || '')}</div></div>`;
  }
  if (list.length > 1) h += '<h3>Past weeks</h3><table><tr><th>Week</th><th class="n">Sales</th><th class="n">Payroll</th><th class="n">Shrink</th><th class="n">Contribution</th><th class="n">Vs budget</th><th>Plan</th></tr>' +
    list.slice().reverse().map(x => { const g = k => x.lines.find(l => l.key === k).act, sh = sum(x.lines.filter(l => l.group === 'shrink').map(l => l.act)); return `<tr><td>${x.week}</td><td class="n">${money(g('sales'))}</td><td class="n">${money(g('labor'))}</td><td class="n">${money(sh)}</td><td class="n">${money(x.act)}</td><td class="n ${x.act >= x.bud ? 'good' : 'bad'}">${money(x.act - x.bud)}</td><td>${x.plan ? (x.planRight ? '✅' : '⚠') : '—'}</td></tr>`; }).join('') + '</table>';
  return h;
}

// ---- reports ----
function pnlReviewNotes(days, note, praise) {
  const p = (G.pnl || []).find(x => x.week === weekOf(G.day) - 1);
  if (!p) return;
  if (!p.plan) note('P&L', `Week ${p.week}'s P&L never got an action plan.`,
    'The P&L is the week\'s decisions in dollars. If nobody reads it, the same leak shows up next week.',
    'Saturday: office computer → 📒 P&L. Find the biggest miss against budget and make it your plan.');
  else if (p.planRight) praise.push(`You read week ${p.week}'s P&L and went after the right line.`);
}
