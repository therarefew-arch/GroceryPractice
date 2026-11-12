# Grocery Practice

**Version 0.0.13**

A 2D grocery store manager simulator for practicing the real job: receiving the night truck, building floats, working freight, keeping the shelves full, running the crew, and ordering for tomorrow. All without blowing the labor budget.

## Play

It's plain HTML/JavaScript, so there's no build step.

- **Locally:** serve the folder with any static server, e.g. `npx http-server -p 8123`, then open http://localhost:8123
- **Online:** play it at https://therarefew-arch.github.io/GroceryPractice/ (GitHub Pages, updates with every push to main).

**Controls:** `WASD`/arrows move · `Shift` run · `E`/`Space` interact · mouse wheel, `+`/`-` or `Z` zoom · `M` sound · `P` pause · `1` `2` `3` speed · `Esc` leave the computer

**Gamepad:** left stick/d-pad move · `A` interact · `B` or `RT` run · `LB`/`RB` zoom · `Start` pause

**Extras:** hover over a crew member to see what they are working on · chain sorts and stocks within 6 seconds for a combo XP bonus · a minimap appears while zoomed in · synth sound effects (mute with `M`) · confetti on level-ups and finishing the truck · rush-hour warning at 4 PM

## The daily loop

| Time | What happens |
|---|---|
| 5:00 AM | Last night's truck is in **Receiving**. Break mixed pallets down onto department **floats**. |
| Morning | Push floats to their aisle and work them onto the shelf. Overflow goes to **Backstock**. |
| 7:00 AM | Doors open. Every empty shelf is a lost sale and an unhappy customer. |
| All day | Check in **DSD vendors** at the back door, hang **price tags**, fix **scan errors**, fill holes. |
| Office | The computer has **Reports, Email, Crew & Schedule, Hiring, Display Planner, Forecast & Order**. |
| 10:00 PM | Closing report with a letter grade, XP, a manager bonus, badges and coaching notes. |
| Night | On truck nights the truck you ordered arrives. Pull pallets off the trailer, or pay overtime to have it done. |

**Weeks and trucks:** store weeks run Saturday to Friday (Day 1 is a Saturday). Weekends are busier, and forecasts use a day-of-week factor. Trucks come every night with different loads (`TRUCK_SCHEDULE`: Sat LV/Frozen/Dairy, Sun HV, Mon HV/Frozen/Dairy, Tue KeHe/LV/HV, Wed Dairy, Thu KeHe/LV/HV/Frozen/Dairy, Fri KeHe/HV). You can only order departments that are on tonight's trucks, and each order has to cover the days until that department's next truck. The order window closes at `ORDER_CUTOFF` (2:00 PM); miss it and the system order goes.

**Daily checklist (📋):** the real floor-board routine, checked automatically: water and paper runs before open, backstock bird runs by day, closing last night's invoices, Monday ad planning, the Tuesday ad flip and Wednesday verify, Fri–Sun blitzes, the 6 PM dairy hole check, the 10–11 PM close run, a clean backroom, the out-of-stock count, and one stretch goal. Find it on the office computer → Today.

**Shifts:** Open 5a–2p, Truck 6a/7a/8a, Mid 10a–7p, Close 2p–11p, Night 11p–5a. The store closes at 11 PM. Shifts over 6 hours take a 1-hour unpaid lunch break.

**Hard mode by default:** cases show only the item name, so you need to know which aisle it belongs in. Turn on easy mode in Help & Settings to show the aisle.

**Grading:** sales vs goal (30), in-stock % (25), labor % of sales ≤ 12% (20), truck worked by noon (15), price integrity (5), DSD check-ins (5).

**Crew roles:** Truck Breakdown, Freight Pusher, Replenishment, DSD Receiver, Scan/Price Clerk, HBC Clerk, Dairy Clerk, Frozen Clerk, Night Unloader. Each has a shift, a skill level and a wage.

**Training & coaching:** new hires make realistic mistakes (wrong float, cardboard left in an aisle, tag on the wrong item, signing for a short DSD delivery, phone breaks). A red **!** appears over them. Walk up and press `E` to coach within 2 hours, or the mistake becomes a habit. Crew rank up Rookie → Trained → Pro → ★ Superstar (85% trained, coached 8+ times, 3+ days on the job). Superstars work 15% faster, make no mistakes and mentor rookies on their shift. Hover any worker to see their training bars.

**Morale & conflicts:** every worker has a morale level and a personality (Easygoing, Hothead, Perfectionist, Social, Quiet). Morale changes their work speed and how often they call out. Thank people for good work (walk up and press `E`, once a day each) and keep schedules steady. Arguments break out (orange **!!**): walk over and press `E` to talk it out, split them up, write up, send home or let go. The right call depends on how serious it is and the person's write-up history, and you always get the why. Below 20% morale, people give 3 days' notice; talk to them to change their mind. When someone quits, HR sends you their exit interview: why they left and what to fix.

**Promotions:** Pros and Superstars with 5+ days can be promoted to ◆ Lead (+$1.50/hr, max 2). Leads work faster, lift morale on their shift and calm arguments. Strong workers will ask to move up; answer within 3 days or they feel passed over.

**Special Item Requests:** customers ask for items you don't carry (email + 🛒 Special Items tab). Each department has room for 8 items, so carrying one means deactivating one: check the 7-day sales and drop the slowest. Answer within 3 days or the customer is upset.

**Dated dairy:** dairy ages on the shelf, and over-ordering makes it age faster. Do the code check every morning (E at the dairy shelf; it's on the daily list by 10 AM): pull expired product, mark down short-dated (sells first at 50% off) and rotate the oldest to the front. Customers who find expired product complain. A Dairy Clerk on shift does the check at 9 AM and 3 PM.

**Store events:** spills (clean within 30 minutes or a customer slips), cooler breakdowns (pull the product to the backroom cooler and call maintenance, or it spoils every hour), announced DM store walks and unannounced health inspections. Every finding comes with the why.

**Seasons:** every other week brings a seasonal event (Summer Cookout, Back to School, Big Game Weekend, Thanksgiving, Holiday Season) that lifts certain departments. The DM warns you the Monday before, and the suggested order does NOT include it, so adjust your orders yourself.

**Labor (Monday forecast, schedule, Labor Demand Exception):** every Monday, forecast next week's sales by day before 5 PM (Office computer → 📑 Labor). The system forecast doesn't know about seasons or the ad, so adjust it. Your forecast earns next week's labor demand: truck cases, sales, DSD vendors, price tags and the ad flip, by role. Write next week's schedule day by day in 🗓 Schedule and post it by Thursday 5 PM; changes after posting cost morale. Everyone works 5 days by default; over 40 paid hours is overtime (1.5x). The Labor Demand Exception report shows demand vs scheduled hours by role and day (GR-Dairy, GR-DSD Receiving, GR-Frozen, GR-HV-LV-DSD, GR-HV-LV-DSD-RPLN, GR-Liquor, GR-Scan Price, then weekly-only roles), with exceptions in bold. The DM grades your forecast accuracy and your schedule against demand.

**Backroom upkeep:** every broken-down pallet leaves an empty on its receiving spot: jack it (E) and stack it in RELOAD STAGING (bottom-left, 8 slots, 15 empties a stack). Every case leaves cardboard in the baler; when it's full, make a bale (E at the baler) or cardboard ends up on the floor. Trucks take reloads at night only if they have room: last stop on the route takes everything, a middle stop takes a little, the first stop takes nothing (the morning email tells you tonight's stops). Load reloads at the dock after the trailer is empty; a Night Unloader does it for you. Sweep the backroom mid-day and after 9 PM. Straighten crooked floats (they slow the breakdown). Each aisle's bird holds 14 cases of backstock; past that it overflows onto the sales floor, blocks the aisle and costs satisfaction every hour. Breakdown and Night Unloader crew stack empties, bale and sweep when they have nothing better to do.

**Backroom layout:** the store can't change shape, but you can rearrange the backroom (Office computer → 🧱 Backroom Layout). Move each department's float spot, reload staging (an 8×1 row or a 4×2 block) and the baler. Nothing can go on receiving, the dock, doorways or the backstock rack aisle, and there must be a path around everything. The tab shows walk distances (receiving → float → shelf, baler, reload staging, dock) against the original layout: shorter trips mean a faster truck.

**On your phone:** open https://therarefew-arch.github.io/GroceryPractice/ and turn the phone sideways. On touch screens you get a joystick (left), a big **E** button, **RUN** (tap to toggle), zoom, pause and full screen. You can also tap the yellow action text at the bottom, and tap a crew member to see their card. To install it like an app: iPhone, Safari → Share → Add to Home Screen; Android, Chrome → ⋮ → Add to Home screen / Install app. It works offline after the first load. Your phone keeps its own save. Add `?touch=1` to the URL to force the touch controls on (or `?touch=0` to turn them off).

**Weekly DM review:** after Friday's close (weeks run Saturday to Friday) your District Manager grades the week. He is harsh but fair: for every problem he tells you what he saw, why it matters and what to do next week. Reviews also land in your email and on the Records tab.

**Records board:** Office computer → 🏆 Records tracks your personal bests (best score, top sales, fastest truck, lowest labor %, best in-stock, lowest OOS count, longest B-or-better streak, most coaching in a day).

**Realism hooks:** cold pallets spoil if they sit in the back · forecasts use sales *plus* lost sales · endcaps lift demand and feed the forecast · vendors give up after 45 minutes · open price tags cause overcharges and complaints.

## Make it your store

Everything store-specific lives in [`js/data.js`](js/data.js): departments/aisles, items and their sales mix, case packs, prices, shelf capacity, DSD vendors and times, crew roles and shift times. The floor plan is built in code in [`js/map.js`](js/map.js).

## Code map

| File | What it does |
|---|---|
| `js/data.js` | Store data you can edit |
| `js/map.js` | Floor plan and pathfinding |
| `js/game.js` | Simulation: day/night cycle, crew AI, customers, vendors, player, saving |
| `js/render.js` | Canvas drawing and the zoom camera |
| `js/training.js` | Crew mistakes, coaching, ranks, mentoring, cardboard trash |
| `js/fx.js` | Sound effects, combos, confetti, minimap, worker hover info |
| `js/morale.js` | Morale, conflicts, promotions, notice and exit interviews |
| `js/events.js` | Special Item Requests, dated dairy, spills, coolers, DM walks, inspections, seasons |
| `js/labor.js` | Weekly schedules, overtime, Monday forecast, labor demand, Labor Demand Exception report |
| `js/backroom.js` | Empty pallets, baler & bales, reload staging, truck stop order, sweeping, crooked floats, bird overflow |
| `js/layout.js` | Backroom layout: movable float spots, reload staging and baler, validation, walk distances |
| `js/touch.js` | Phone/tablet joystick and buttons, home-screen app (with `sw.js`, `manifest.webmanifest`, `icons/`) |
| `js/review.js` | Weekly DM review, records board, gamepad |
| `js/ui.js` | HUD, office computer, modals |

Progress auto-saves in the browser (localStorage).
