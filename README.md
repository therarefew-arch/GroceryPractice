# Grocery Practice

**Version 0.0.1**

A 2D grocery store manager simulator for practicing the real job: receiving the night truck, building floats, working freight, keeping the shelves full, running the crew, and ordering for tomorrow. All without blowing the labor budget.

## Play

It's plain HTML/JavaScript, so there's no build step.

- **Locally:** serve the folder with any static server, e.g. `npx http-server -p 8123`, then open http://localhost:8123
- **Online:** enable GitHub Pages for this repo (Settings → Pages → deploy from branch) and it plays in any browser.

**Controls:** `WASD`/arrows move · `Shift` run · `E`/`Space` interact · `P` pause · `1` `2` `3` speed · `Esc` leave the computer

## The daily loop

| Time | What happens |
|---|---|
| 5:00 AM | Last night's truck is in **Receiving**. Break mixed pallets down onto department **floats**. |
| Morning | Push floats to their aisle and work them onto the shelf. Overflow goes to **Backstock**. |
| 7:00 AM | Doors open. Every empty shelf is a lost sale and an unhappy customer. |
| All day | Check in **DSD vendors** at the back door, hang **price tags**, fix **scan errors**, fill holes. |
| Office | The computer has **Reports, Email, Crew & Schedule, Hiring, Display Planner, Forecast & Order**. |
| 10:00 PM | Closing report with a letter grade, XP, a manager bonus, badges and coaching notes. |
| Night | The truck you ordered arrives. Pull pallets off the trailer, or pay overtime to have it done. |

**Grading:** sales vs goal (30), in-stock % (25), labor % of sales ≤ 12% (20), truck worked by noon (15), price integrity (5), DSD check-ins (5).

**Crew roles:** Truck Breakdown, Freight Pusher, Replenishment, DSD Receiver, Scan/Price Clerk, HBC Clerk, Dairy Clerk, Frozen Clerk, Night Unloader. Each has a shift, a skill level and a wage.

**Realism hooks:** cold pallets spoil if they sit in the back · forecasts use sales *plus* lost sales · endcaps lift demand and feed the forecast · vendors give up after 45 minutes · open price tags cause overcharges and complaints.

## Make it your store

Everything store-specific lives in [`js/data.js`](js/data.js): departments/aisles, items and their sales mix, case packs, prices, shelf capacity, DSD vendors and times, crew roles and shift times. The floor plan is built in code in [`js/map.js`](js/map.js).

## Code map

| File | What it does |
|---|---|
| `js/data.js` | Store data you can edit |
| `js/map.js` | Floor plan and pathfinding |
| `js/game.js` | Simulation: day/night cycle, crew AI, customers, vendors, player, saving |
| `js/render.js` | Canvas drawing |
| `js/ui.js` | HUD, office computer, modals |

Progress auto-saves in the browser (localStorage).
