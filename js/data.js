'use strict';
// =====================================================================
//  STORE DATA — edit this file to match your real store.
//  Departments, items, vendors, roles and shifts all live here.
//  upc = units per case, price = average retail per unit,
//  demand = average cases sold per day, cap = shelf capacity in cases.
// =====================================================================

const DEPTS = [
  { id: 'A1', aisle: 'Aisle 1', name: 'Canned & Dry', color: '#d0893a', upc: 12, price: 1.79, demand: 33, cap: 42, cold: false,
    items: [['Cut Green Beans 14.5oz', 14], ['Chicken Noodle Soup 10.5oz', 16], ['Spaghetti 1lb', 12], ['Pasta Sauce 24oz', 11],
            ['Long Grain Rice 2lb', 8], ['Black Beans 15oz', 10], ['Chunk Light Tuna 5oz', 13], ['Mac & Cheese 7.25oz', 16]] },
  { id: 'A2', aisle: 'Aisle 2', name: 'Snacks & Beverage', color: '#d9534f', upc: 12, price: 2.89, demand: 36, cap: 44, cold: false,
    items: [['Potato Chips 8oz', 16], ['Tortilla Chips 13oz', 12], ['Cola 2L', 15], ['Sparkling Water 8pk', 9],
            ['Pretzel Twists 16oz', 8], ['Sandwich Cookies 14oz', 12], ['Snack Crackers 12oz', 10], ['Spring Water 24pk', 18]] },
  { id: 'A3', aisle: 'Aisle 3', name: 'Baking & Breakfast', color: '#c9a227', upc: 12, price: 3.19, demand: 24, cap: 31, cold: false,
    items: [['Toasted Oat Cereal', 15], ['Old Fashioned Oats 42oz', 8], ['All Purpose Flour 5lb', 7], ['Granulated Sugar 4lb', 8],
            ['Pancake Mix 32oz', 6], ['Ground Coffee 12oz', 16], ['Creamy Peanut Butter 16oz', 12], ['Grape Jelly 30oz', 8]] },
  { id: 'A4', aisle: 'Aisle 4', name: 'Paper & Chemical', color: '#5b8def', upc: 6, price: 6.49, demand: 18, cap: 26, cold: false,
    items: [['Paper Towels 6 Roll', 16], ['Bath Tissue 12 Roll', 18], ['Laundry Detergent 92oz', 12], ['Dish Soap 19oz', 10],
            ['Trash Bags 13gal', 11], ['Bleach 121oz', 7], ['Napkins 250ct', 8], ['Aluminum Foil 75sqft', 8]] },
  { id: 'HBC', aisle: 'Aisle 5', name: 'Health & Beauty', color: '#9b59b6', upc: 12, price: 4.99, demand: 15, cap: 23, cold: false,
    items: [['Shampoo 12oz', 10], ['Toothpaste 4oz', 14], ['Body Wash 18oz', 10], ['Deodorant 2.6oz', 12],
            ['Pain Reliever 100ct', 10], ['Adhesive Bandages 30ct', 7], ['Daily Multivitamin', 8], ['Hand Lotion 16oz', 7]] },
  { id: 'DAI', aisle: 'Dairy Cooler', name: 'Dairy', color: '#3fa7d6', upc: 12, price: 3.29, demand: 33, cap: 39, cold: true,
    items: [['Whole Milk Gallon', 18], ['Large Eggs Dozen', 16], ['Salted Butter 1lb', 9], ['Shredded Cheddar 8oz', 12],
            ['Greek Yogurt 5.3oz', 13], ['Sour Cream 16oz', 7], ['Coffee Creamer 32oz', 10], ['Cream Cheese 8oz', 8]] },
  { id: 'FRZ', aisle: 'Aisle 6', name: 'Frozen', color: '#2bb5a8', upc: 12, price: 4.29, demand: 24, cap: 31, cold: true,
    items: [['Pepperoni Pizza 12in', 16], ['Vanilla Ice Cream 48oz', 13], ['Mixed Vegetables 12oz', 10], ['Homestyle Waffles 10ct', 9],
            ['Frozen Entree 10oz', 14], ['Crinkle Fries 32oz', 10], ['Bean & Cheese Burritos', 8], ['Bagged Ice 10lb', 12]] },
];
const DEPT = {};
DEPTS.forEach(d => { DEPT[d.id] = d; d.capU = d.cap * d.upc; });

// Direct Store Delivery vendors: they show up at the back door and need to be checked in.
const VENDORS = [
  { name: 'Valley Fresh Milk', time: 6 * 60 + 30, dept: 'DAI', cases: 6 },
  { name: 'Golden Crust Bakery', time: 8 * 60, dept: 'A3', cases: 6 },
  { name: 'Bubbly Beverage Co.', time: 10 * 60 + 30, dept: 'A2', cases: 8 },
  { name: 'Crunchtime Snacks', time: 13 * 60, dept: 'A2', cases: 6 },
  { name: 'Polar Ice Co.', time: 15 * 60 + 30, dept: 'FRZ', cases: 4 },
];
const VENDOR_PATIENCE = 45; // game minutes a vendor waits before leaving

const ROLES = {
  breakdown: { name: 'Truck Breakdown', color: '#e8962e', desc: 'Breaks down mixed pallets and sorts cases onto department floats. Works cold pallets first.' },
  freight: { name: 'Freight Pusher', color: '#d4572a', desc: 'Pushes built floats to the aisle and works them to the shelf. Overflow goes to backstock.' },
  replen: { name: 'Replenishment', color: '#34a26a', desc: 'Watches shelf levels and pulls backstock to fill holes before they become outs.' },
  dsd: { name: 'DSD Receiver', color: '#23824f', desc: 'Checks in Direct Store Delivery vendors at the back door. Fills holes between deliveries.' },
  price: { name: 'Scan / Price Clerk', color: '#c0392b', desc: 'Hangs price change tags and fixes scan errors before customers get overcharged.' },
  hbc: { name: 'HBC Clerk', color: '#9b59b6', dept: 'HBC', desc: 'Owns Health & Beauty: breaks down and works HBC freight, fills holes, faces the aisle.' },
  dairy: { name: 'Dairy Clerk', color: '#3fa7d6', dept: 'DAI', desc: 'Owns the dairy cooler: works dairy freight fast to protect the cold chain.' },
  frozen: { name: 'Frozen Clerk', color: '#2bb5a8', dept: 'FRZ', desc: 'Owns frozen: works frozen freight fast and keeps the doors full.' },
  unloader: { name: 'Night Unloader', color: '#7f8c8d', desc: 'Night shift. Unloads the trailer into receiving, then breaks down pallets.' },
};

const SHIFTS = {
  open: { name: 'Open 5a–2p', start: 300, end: 840 },
  truck6: { name: 'Truck 6a–3p', start: 360, end: 900 },
  truck7: { name: 'Truck 7a–4p', start: 420, end: 960 },
  truck8: { name: 'Truck 8a–5p', start: 480, end: 1020 },
  mid: { name: 'Mid 10a–7p', start: 600, end: 1140 },
  close: { name: 'Close 2p–11p', start: 840, end: 1380 },
  night: { name: 'Night 11p–5a', start: 1380, end: 1740 },
};

// ---- Calendar: store weeks run Saturday through Friday. Day 1 is a Saturday. ----
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const WEEKDAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// How busy each day is compared with an average day (should average 1.0).
const DOW_FACTOR = { Sat: 1.25, Sun: 1.1, Mon: 0.85, Tue: 0.85, Wed: 0.9, Thu: 0.95, Fri: 1.1 };
// Warehouse trucks by night (you work them the next morning). Matches Store 1588's board.
const TRUCK_TYPES = {
  HV: { name: 'HV (high volume)', depts: ['A1', 'A2', 'A3', 'A4', 'HBC'] },
  LV: { name: 'LV (low volume)', depts: ['A1', 'A2', 'A3', 'A4', 'HBC'] },
  KeHe: { name: 'KeHe (natural & specialty)', depts: ['A2', 'A3', 'HBC'] },
  Frozen: { name: 'Frozen', depts: ['FRZ'] },
  Dairy: { name: 'Dairy', depts: ['DAI'] },
};
const TRUCK_SCHEDULE = {
  Sat: ['LV', 'Frozen', 'Dairy'], Sun: ['HV'], Mon: ['HV', 'Frozen', 'Dairy'], Tue: ['KeHe', 'LV', 'HV'],
  Wed: ['Dairy'], Thu: ['KeHe', 'LV', 'HV', 'Frozen', 'Dairy'], Fri: ['KeHe', 'HV'],
};
// Backstock "bird" runs by day: work that aisle's backstock to the shelf.
const BACKSTOCK_RUNS = { Sat: ['A2', 'HBC'], Sun: [], Mon: ['A3', 'A4'], Tue: ['A2', 'HBC'], Wed: ['A1'], Thu: ['A3', 'A4'], Fri: ['A1', 'A2'] };
const BLITZ_TIMES = [420, 540, 660, 780, 900, 1020, 1140]; // Fri–Sun blitz: 7a 9a 11a 1p 3p 5p 7p
const CLOSERS_REQUIRED = 3; // store rule: 3 grocery closers a night
// Unknown shrink: chance per unit sold that one more walks out unscanned (theft).
// The system never sees it, so it shows up as phantom on-hand until somebody counts.
const THEFT_RATE = { A1: 0.01, A2: 0.03, A3: 0.01, A4: 0.02, HBC: 0.06, DAI: 0.015, FRZ: 0.015 };
const OOS_GOAL = 40;        // nightly out-of-stock count goal (empty facings)
const BREAK_MIN = 60;       // unpaid break for shifts longer than 6 hours
// On a truck day the order must be in by this time, or the system's suggested order is sent.
const ORDER_CUTOFF = 14 * 60; // 2:00 PM

// Customer traffic weight by hour (store open 7am–10pm)
const TRAFFIC = { 7: 0.5, 8: 0.7, 9: 0.8, 10: 0.9, 11: 1.1, 12: 1.3, 13: 1.1, 14: 1.0, 15: 1.0, 16: 1.3, 17: 1.6, 18: 1.5, 19: 1.1, 20: 0.8, 21: 0.5, 22: 0.3 };

const TITLES = ['Night Stocker', 'Receiving Lead', 'Department Manager', 'Assistant Store Manager', 'Co-Manager', 'Store Manager', 'District Legend'];

const BADGES = {
  truck10: { name: 'Truck by 10', desc: 'Truck fully worked by 10:00 AM' },
  zeroOuts: { name: 'Fully Stocked', desc: 'No customer hit an empty shelf all day' },
  laborHawk: { name: 'Labor Hawk', desc: 'Labor under 10% of sales' },
  vendorPal: { name: 'Vendor Pal', desc: 'Every DSD vendor checked in' },
  tagTeam: { name: 'Tag Team', desc: 'Every price tag and scan error fixed' },
  coldChain: { name: 'Cold Chain', desc: 'Zero cold-freight spoilage' },
  adStar: { name: 'Ad Star', desc: 'Met the district\'s ad endcap request' },
  straightA: { name: 'Straight A', desc: 'Earned an A for the day' },
  coach: { name: 'Coach', desc: 'Coached your crew 4+ times in one day' },
  recallReady: { name: 'Recall Ready', desc: 'A recall off the shelf in time, everything pulled and certified' },
  shortStop: { name: 'Short Stop', desc: 'Every warehouse short claimed before the invoice closed' },
  claimsClerk: { name: 'Claims Clerk', desc: 'Every truck damage claimed the same day' },
  countKeeper: { name: 'Count Keeper', desc: 'Every cycle count on the list done' },
  facedUp: { name: 'Faced Up', desc: 'Every aisle 90%+ faced at close with no go-backs left' },
};

const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Devon', 'Reese', 'Skyler',
  'Rowan', 'Kai', 'Drew', 'Emerson', 'Hayden', 'Parker', 'Sage', 'Logan', 'Maria', 'Luis', 'Priya', 'Chen', 'Omar', 'Tasha', 'Andre', 'Mei', 'Nikhil'];
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTVW';
