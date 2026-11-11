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
  open: { name: 'Open 5:00a–1:30p', start: 300, end: 810 },
  mid: { name: 'Mid 10:00a–6:30p', start: 600, end: 1110 },
  close: { name: 'Close 1:30p–10:00p', start: 810, end: 1320 },
  night: { name: 'Night 10:00p–5:00a', start: 1320, end: 1740 },
};

// Customer traffic weight by hour (store open 7am–10pm)
const TRAFFIC = { 7: 0.5, 8: 0.7, 9: 0.8, 10: 0.9, 11: 1.1, 12: 1.3, 13: 1.1, 14: 1.0, 15: 1.0, 16: 1.3, 17: 1.6, 18: 1.5, 19: 1.1, 20: 0.8, 21: 0.5 };

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
};

const FIRST_NAMES = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Quinn', 'Avery', 'Devon', 'Reese', 'Skyler',
  'Rowan', 'Kai', 'Drew', 'Emerson', 'Hayden', 'Parker', 'Sage', 'Logan', 'Maria', 'Luis', 'Priya', 'Chen', 'Omar', 'Tasha', 'Andre', 'Mei', 'Nikhil'];
const LAST_INITIALS = 'ABCDEFGHJKLMNPRSTVW';
