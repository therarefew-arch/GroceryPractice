# Grocery Practice

**Version 0.0.17**

A 2D grocery store manager simulator for practicing the real job: receiving the night truck, building floats, working freight, keeping the shelves full, running the crew, and ordering for tomorrow. All without blowing the labor budget.

## Play

It's plain HTML/JavaScript, so there's no build step.

- **Locally:** serve the folder with any static server, e.g. `npx http-server -p 8123`, then open http://localhost:8123
- **Online:** play it at https://therarefew-arch.github.io/GroceryPractice/ (GitHub Pages, updates with every push to main).

**Controls:** `WASD`/arrows move · `Shift` run · `E`/`Space` interact (hold to repeat) · `Q` second action · mouse wheel, `+`/`-` or `Z` zoom · `M` sound · `P` pause · `1` `2` `3` speed · `Esc` leave the computer

**Gamepad:** left stick/d-pad move (the stick is analog) · `A` interact (hold to repeat) · `X` second action · `B` or `RT` run · `LB`/`RB` zoom · `Start` pause

**Extras:** hover over a crew member to see what they are working on · chain sorts and stocks within 6 seconds for a combo XP bonus · a minimap appears while zoomed in · synth sound effects (mute with `M`) · confetti on level-ups and finishing the truck · rush-hour warning at 4 PM

## The daily loop

| Time | What happens |
|---|---|
| 5:00 AM | Last night's truck is in **Receiving**. Break mixed pallets down onto department **floats**. |
| Morning | Push floats to their aisle and work them onto the shelf. Overflow goes on that aisle's **bird** in Backstock. |
| 7:00 AM | Doors open. Every empty shelf is a lost sale and an unhappy customer. |
| All day | Check in **DSD vendors** at the back door, hang **price tags**, fix **scan errors**, fill holes. Every shopper leaves the aisles messier and some leave **go-backs**. |
| 5:00 PM | **Recovery** before the dinner rush: face every aisle and clear the go-backs. |
| Office | The computer has **Reports, Email, Crew & Schedule, Hiring, Display Planner, Forecast & Order**. |
| 9 PM–close | **Close recovery**: face every aisle again and clear the go-back cart. |
| 11:00 PM | Closing report with a letter grade, XP, a manager bonus, badges and coaching notes. |
| Night | On truck nights the truck you ordered arrives. Pull pallets off the trailer, or pay overtime to have it done. |

**Weeks and trucks:** store weeks run Saturday to Friday (Day 1 is a Saturday). Weekends are busier, and forecasts use a day-of-week factor. Trucks come every night with different loads (`TRUCK_SCHEDULE`: Sat LV/Frozen/Dairy, Sun HV, Mon HV/Frozen/Dairy, Tue KeHe/LV/HV, Wed Dairy, Thu KeHe/LV/HV/Frozen/Dairy, Fri KeHe/HV). You can only order departments that are on tonight's trucks, and each order has to cover the days until that department's next truck. The order window closes at `ORDER_CUTOFF` (2:00 PM); miss it and the system order goes.

**Daily checklist (📋):** the real floor-board routine, checked automatically: water and paper runs before open, backstock bird runs by day, today's cycle counts, closing last night's invoices, Monday ad planning, the Tuesday ad flip and Wednesday verify, Fri–Sun blitzes, the 5 PM recovery (every aisle 85%+ faced by 6 PM), the 6 PM dairy hole check, the 10–11 PM close run, close recovery and go-backs worked at 10:50 PM, a clean backroom, the out-of-stock count, and one stretch goal. Find it on the office computer → Today.

**Your shift:** you're on the schedule too (the **You** row in 🗓 Schedule; by default you open 5a–2p, off Tuesday and Wednesday). You clock in when your shift starts. When it ends you're asked whether to go home; stay as long as you like, then use the 🏠 button or the staff door. While you're off the clock the crew runs the store on their own and time moves fast (an hour a second): watch, **Skip ahead**, **Come in now**, or **Log in from home** to use the computer (the order, forecast and schedule still have deadlines). The crew covers what can't wait for you: someone in the back checks in DSD vendors if there's no DSD Receiver, anyone cleans up a spill, someone pulls product from a failed cooler, and when their own work runs out they hang price tags, put away birds, fill holes, sweep and face. A ◆ Lead on shift settles arguments while you're gone; without one, nobody does. Store managers are salaried, so your shifts count in full on the GR-Mgr line of the Labor Demand report.

**Shifts:** Open 5a–2p, Truck 6a/7a/8a, Mid 10a–7p, Close 2p–11p, Night 11p–5a. The store closes at 11 PM. Shifts over 6 hours take a 1-hour unpaid lunch break.

**Hard mode by default:** cases show only the item name, so you need to know which aisle it belongs in. Turn on easy mode in Help & Settings to show the aisle.

**Grading:** sales vs goal (30), in-stock % (25), labor % of sales ≤ 12% (20), truck worked by noon (15), price integrity (5), DSD check-ins (5).

**Crew roles:** Truck Breakdown, Freight Pusher, Replenishment, DSD Receiver, Scan/Price Clerk, HBC Clerk, Dairy Clerk, Frozen Clerk, Night Unloader. Each has a shift, a skill level and a wage.

**Training & coaching:** new hires make realistic mistakes (wrong float, cardboard left in an aisle, tag on the wrong item, signing for a short DSD delivery, miscounting a cycle count, phone breaks). A red **!** appears over them. Walk up and press `E` to coach within 2 hours, or the mistake becomes a habit. Crew rank up Rookie → Trained → Pro → ★ Superstar (85% trained, coached 8+ times, 3+ days on the job). Superstars work 15% faster, make no mistakes and mentor rookies on their shift. Hover any worker to see their training bars.

**Morale & conflicts:** every worker has a morale level and a personality (Easygoing, Hothead, Perfectionist, Social, Quiet). Morale changes their work speed and how often they call out. Thank people for good work (walk up and press `E`, once a day each) and keep schedules steady. Arguments break out (orange **!!**): walk over and press `E` to talk it out, split them up, write up, send home or let go. The right call depends on how serious it is and the person's write-up history, and you always get the why. Below 20% morale, people give 3 days' notice; talk to them to change their mind. When someone quits, HR sends you their exit interview: why they left and what to fix.

**Promotions:** Pros and Superstars with 5+ days can be promoted to ◆ Lead (+$1.50/hr, max 2). Leads work faster, lift morale on their shift and calm arguments. Strong workers will ask to move up; answer within 3 days or they feel passed over.

**Special Item Requests:** customers ask for items you don't carry (email + 🛒 Special Items tab). Each department has room for 8 items, so carrying one means deactivating one: check the 7-day sales and drop the slowest. Answer within 3 days or the customer is upset.

**Dated dairy:** dairy ages on the shelf, and over-ordering makes it age faster. Do the code check every morning (E at the dairy shelf; it's on the daily list by 10 AM): pull expired product, mark down short-dated (sells first at 50% off) and rotate the oldest to the front. Customers who find expired product complain. A Dairy Clerk on shift does the check at 9 AM and 3 PM.

**Store events:** spills (clean within 30 minutes or a customer slips), cooler breakdowns (pull the product to the backroom cooler and call maintenance, or it spoils every hour), announced DM store walks and unannounced health inspections. Every finding comes with the why.

**Seasons:** every other week brings a seasonal event (Summer Cookout, Back to School, Big Game Weekend, Thanksgiving, Holiday Season) that lifts certain departments. The DM warns you the Monday before, and the suggested order does NOT include it, so adjust your orders yourself.

**Labor (Monday forecast, schedule, Labor Demand Exception):** every Monday, forecast next week's sales by day before 5 PM (Office computer → 📑 Labor). The system forecast doesn't know about seasons or the ad, so adjust it. Your forecast earns next week's labor demand: truck cases, sales, DSD vendors, price tags and the ad flip, by role. Write next week's schedule day by day in 🗓 Schedule and post it by Thursday 5 PM; changes after posting cost morale. Everyone works 5 days by default; over 40 paid hours is overtime (1.5x). The Labor Demand Exception report shows demand vs scheduled hours by role and day (GR-Dairy, GR-DSD Receiving, GR-Frozen, GR-HV-LV-DSD, GR-HV-LV-DSD-RPLN, GR-Liquor, GR-Scan Price, then weekly-only roles), with exceptions in bold. The DM grades your forecast accuracy and your schedule against demand.

**Backroom upkeep:** every broken-down pallet leaves an empty on its receiving spot: jack it (E) and stack it in RELOAD STAGING (bottom-left, 8 slots, 15 empties a stack). Every case leaves cardboard in the baler; when it's full, make a bale (E at the baler) or cardboard ends up on the floor. Trucks take reloads at night only if they have room: last stop on the route takes everything, a middle stop takes a little, the first stop takes nothing (the morning email tells you tonight's stops). Load reloads at the dock after the trailer is empty; a Night Unloader does it for you. Sweep the backroom mid-day and after 9 PM. Straighten crooked floats (they slow the breakdown). Each aisle's bird holds 14 cases of backstock; past that it overflows onto the sales floor, blocks the aisle and costs satisfaction every hour.

**Backstock birds (they have wheels):** each aisle's backstock lives on its bird, a 2-tier cart parked in BACKSTOCK (top middle). `E` at a bird pushes it; `Q` carries 3 cases instead. Push it to its own aisle and press `E` at the shelf to work backstock straight on, then park it back on its spot. A bird left on the sales floor counts as a blocked aisle until somebody puts it away (the crew does after 20 minutes). Replenishment, and Freight Pushers once the truck is out, run each aisle's bird on its backstock day; department clerks run their own. You can also order anyone to **Run the bird**. Breakdown and Night Unloader crew stack empties, bale and sweep when they have nothing better to do.

**Facing and go-backs:** every aisle has a faced level, shown as a bar under its sign (green 85%+, amber, red under 70%). Every customer who shops an aisle leaves it a little messier, and working freight fronts it a little. Below 70% faced, product pushed to the back looks like a hole: some customers walk past it (a "visual out": a lost sale even though the shelf has product), and a messy aisle costs satisfaction every hour. Press `E` at any shelf to face it (it keeps going until the aisle is 100% or you move). Run recovery at 5 PM and again before close. Crew on shift do it on their own from 5 to 6 PM and from 9 PM to close, and face the messiest aisle when their own work runs out, so schedule closers or it doesn't happen. **Go-backs** are things customers changed their minds about: most land on the go-back cart at the front end (between the registers), some get dumped on the wrong shelf (blinking boxes on the floor). Grab up to 12 from the cart or pick up strays, then `E` at each one's own shelf to put them back. Cold go-backs (dairy, frozen) are thrown away after 30 minutes out of the cooler, so work them first. The DM walk, inspections, closing report and weekly review all look at facing and go-backs, and there's a **Faced Up** badge for every aisle 90%+ at close with no go-backs left.

**On-hand accuracy and cycle counts:** the system keeps its own on-hand for every department: what came in on the invoices, minus what scanned at the register. The building doesn't always agree. Product walks out unscanned (theft is highest in Health & Beauty and Snacks & Beverage), the warehouse now and then ships a case of the wrong department, and a crew member who signs for a short DSD delivery gives the system cases you never got. The system never hears about any of it, so its on-hand drifts, and you inherit a store that hasn't been counted in a while. The suggested order (and the system order if you miss the cutoff) uses the **system** on-hand: phantom inventory (the system thinks you have it, you don't) means it orders too little and you run out, and the other way it over-orders. Every morning the system puts 2 departments on the count list (🔢 Counts on the office computer, and the daily checklist): first any department where customers found the shelf *and* its bird empty while the system still showed stock, then whatever was counted longest ago. To count one, press `E` at its shelf and `E` at its bird in Backstock (either order; a clipboard marks what's left). The system takes your count and tells you the variance; missing product is booked as unknown shrink. A Scan/Price Clerk works the list on their own, department clerks count their own department, and you can order anyone to count. Rookies sometimes miscount (a new **Counting** training area: coach them). The order screen marks departments not counted in a week and likely phantoms.

**Backroom layout:** the store can't change shape, but you can rearrange the backroom (Office computer → 🧱 Backroom Layout). Move each department's float spot, reload staging (an 8×1 row or a 4×2 block) and the baler. Nothing can go on receiving, the dock, doorways or the backstock rack aisle, and there must be a path around everything. The tab shows walk distances (receiving → float → shelf, baler, reload staging, dock) against the original layout: shorter trips mean a faster truck.

**On your phone:** open https://therarefew-arch.github.io/GroceryPractice/ and turn the phone sideways. On touch screens you get a floating analog joystick: put your thumb down anywhere on the left side (anywhere under the game with the phone upright) and the stick starts right there; push further to go faster, and it follows your thumb if you drag past the edge. A quick tap there still taps the game. You also get a big **E** button (hold it to repeat), a blue **Q** button when there's a second action, **RUN** (tap to toggle), zoom, pause and full screen. You can also tap the yellow action text at the bottom, and tap a crew member to see their card. To install it like an app: iPhone, Safari → Share → Add to Home Screen; Android, Chrome → ⋮ → Add to Home screen / Install app. It works offline after the first load. Your phone keeps its own save. Add `?touch=1` to the URL to force the touch controls on (or `?touch=0` to turn them off).

**Crew orders (micromanage):** click (or tap) an associate on the map, or use 📌 Orders in the Crew tab, and tell them exactly what to do: work the truck, break down pallets, unload the trailer, get one department's freight out, fill holes in a department, run an aisle's bird, face an aisle, cycle count a department, work the go-backs, watch the back door for DSD, hang price tags, pick up cardboard or do backroom upkeep. They drop what they're doing, work the order until it's done or about 2 hours pass, then go back to their job. Orders outside their job (dashed buttons) work 15% slower unless they're a Lead or Superstar. More than 4 orders to one person in a day starts to cost morale: they want to finish something.

**Weekly DM review:** after Friday's close (weeks run Saturday to Friday) your District Manager grades the week. He is harsh but fair: for every problem he tells you what he saw, why it matters and what to do next week. Reviews also land in your email and on the Records tab.

**Records board:** Office computer → 🏆 Records tracks your personal bests (best score, top sales, fastest truck, lowest labor %, best in-stock, lowest OOS count, longest B-or-better streak, most coaching in a day).

**Smoother handling:** you move and work at the game speed you pick (2× and 4× speed you up too). One `E` grabs up to 3 cases of the same department off a pallet; hold `E` to keep picking, sorting and stocking. Whatever `E` will act on gets yellow corner brackets, and the thing you're facing wins when two are close. You slide around wall corners instead of catching on them, and floats and birds trail smoothly in front of you.

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
| `js/facing.js` | Aisle facing levels, visual outs, 5 PM and close recovery, go-backs (cart, strays, cold spoilage) |
| `js/counts.js` | System on-hand vs. what's really there: theft, mis-ships, short DSD, the daily count list, counting (you and crew), phantom-inventory flags |
| `js/birds.js` | Backstock birds on wheels: push them to the aisle, work them, crew bird runs, putting them away |
| `js/layout.js` | Backroom layout: movable float spots, reload staging and baler, validation, walk distances |
| `js/touch.js` | Phone/tablet floating joystick and buttons, home-screen app (with `sw.js`, `manifest.webmanifest`, `icons/`) |
| `js/orders.js` | Crew orders: click/tap an associate to assign any task, even outside their job |
| `js/shift.js` | Your own shift: clocking in and out, off-the-clock fast-forward, crew covering vendors, spills, coolers and idle work |
| `js/review.js` | Weekly DM review, records board, gamepad |
| `js/ui.js` | HUD, office computer, modals |

Progress auto-saves in the browser (localStorage).
