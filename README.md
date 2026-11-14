# Grocery Practice

**Version 0.0.46**

A 2D grocery store manager simulator for practicing the real job: receiving the night truck, building floats, working freight, keeping the shelves full, running the crew, and ordering for tomorrow. All without blowing the labor budget.

## Play

It's plain HTML/JavaScript, so there's no build step.

- **Locally:** serve the folder with any static server, e.g. `npx http-server -p 8123`, then open http://localhost:8123
- **Online:** play it at https://therarefew-arch.github.io/GroceryPractice/ (GitHub Pages, updates with every push to main).

**Controls:** `WASD`/arrows move · `Shift` run · `E`/`Space` interact (hold to repeat) · `Q` second action · mouse wheel, `+`/`-` or `Z` zoom · `M` sound · `P` pause · `1` `2` `3` speed · `Esc` leave the computer

**Gamepad:** left stick/d-pad move (the stick is analog) · `A` interact (hold to repeat) · `X` second action · `B` or `RT` run · `LB`/`RB` zoom · `Start` pause

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

**New to the game?** Open **📖 How to play** on the title screen, in the game menu, or under Help & Settings on the office computer. It covers controls, freight, the day, the week, the crew and grading in short sections.

**On your phone:** open https://therarefew-arch.github.io/GroceryPractice/ and turn the phone sideways. Put your thumb down anywhere on the left side for the joystick, tap **E** to act, and hold **E** for more options. The ☰ button holds speed, sound, save and the game menu. To install it like an app: iPhone, Safari → Share → Add to Home Screen; Android, Chrome → ⋮ → Install app. It works offline after the first load, and your phone keeps its own saves. Options on the title screen switch between 🖥 Desktop and 📱 Phone controls.

## What's in the store

**Freight and the floor**
- **Truck to shelf:** pallets → department floats → the shelf; overflow goes on each aisle's **bird** (a backstock cart with wheels). A blinking **OVERFLOW** cart on the floor means an aisle has more backstock than its bird holds. Cold pallets spoil if they sit.
- **Hard mode by default:** cases show only the item name. Easy mode (Help & Settings) adds the aisle.
- **Facing and go-backs:** shoppers mess up the aisles. Face everything at 5 PM and before close, and put go-backs away.
- **Backroom upkeep:** empty pallets, the baler, reload staging, sweeping, crooked floats. You can rearrange the backroom layout, but the store itself never changes shape.
- **Endcaps and the weekly ad:** plan the new set Monday; on **Tuesday from 6 PM** take each old display down, put its product back on its bird, then pull the new product and build the display. The ad runs Wednesday to Tuesday: ad items sell about 30% faster, and an out on one hurts twice.
- **Planogram resets** every other Tuesday, **dated dairy**, **store events** (spills, broken coolers), **recalls**, **damages and reclaim**, **warehouse cuts**, **cycle counts** for on-hand accuracy, **price tags and scan errors**, **DSD vendors** at the back door.
- **Customers** stop you with questions, complaints and special requests. **Weather** and **seasons** change what sells.

**Running the business**
- **Daily checklist (📋):** the real floor-board routine, checked off as work gets done.
- **Forecast & Order:** order each night for the trucks coming next. The suggestion uses sales plus lost sales, endcaps, season, weather and the ad.
- **Labor:** forecast next week every Monday, build the schedule, stay at 12% of sales or less.
- **Weekly P&L** and the **district manager's review** every Friday. The DM also drops in for **store walks**. **Vendor reps** visit with deals.
- **Grading:** sales vs goal (30), in-stock % (25), labor % (20), truck worked by noon (15), price integrity (5), DSD check-ins (5). Closing reports explain why and what to try tomorrow. XP raises your level; each level lets you staff one more person (14 max).

**Your crew**
- **Hiring:** three applicants a day, and a sit-down **interview scene** where you read their body language.
- **Roles, shifts and availability:** every role has a real job. Time-off requests and availability matter.
- **Training and coaching:** new hires make realistic mistakes until you coach them.
- **Morale and conflicts:** thank people, keep schedules steady, settle fights well.
- **Morning huddle**, **performance reviews and raises**, **progressive discipline** (verbal → written → final), **promotions to Lead**.
- **Growing a successor (🌱):** pick a protégé, give them stretch tasks, coach them, and grow them into your Assistant Manager. Eventually the district will want them for a store of their own.
- **Aisle owners (🏷):** give every aisle an owner (up to 2 each; their initials hang by the aisle sign). On shift they keep their own aisle full and faced between other work, and face it faster. Each aisle gets an hourly score (half how full, half how faced) shown today and over 7 days. Walk a slipping aisle with its owner to raise their bar for two days; thank the owner of a great one. The weekly review names the aisle of the week.
- **Store standards (📏):** set habits (face your area before you clock out, grab go-backs, no cardboard on the floor, phones in the break room) and store-wide routines at a time you pick (we all face the store at 2 PM, a go-back sweep, fill every hole). Each person has their own buy-in: talk one on one, gather everyone on shift, remind them at the huddle, and thank them when they do it. It fades until it hits 100%; new hires start at zero.
- **Talk scenes (💬):** coaching, development talks, standards talks and aisle walks pause the game and open a one-on-one scene on the sales floor, like the interview: the associate in their store vest, their mood and body language, and how you handle it as choices. Asking first, explaining why, and agreeing together work better than blame.
- **Crew orders:** click (or tap) an associate to tell them exactly what to do.

**The game itself**
- Title screen with **3 save slots**, Continue, Load and Options (controls, music and sound volume, pop-ups).
- **Tap or hold:** a quick press does the action shown; hold for more options (Keep going, crew orders, save, clock out).
- Futuristic ambient **store music**, synth sound effects, a **records board**, badges and confetti.

## Make it your store

Everything store-specific lives in [`js/data.js`](js/data.js): departments/aisles, items and their sales mix, case packs, prices, shelf capacity, DSD vendors and times, crew roles and shift times. The floor plan is built in code in [`js/map.js`](js/map.js).

## Code map

| File | What it does |
|---|---|
| `js/data.js` | Store data you can edit |
| `js/map.js` | Floor plan and pathfinding |
| `js/game.js` | Simulation: day/night cycle, results, customers, vendors, levels |
| `js/crew.js` | Crew AI: movement and the plans each associate runs |
| `js/player.js` | The player: moving, what E does where you stand, your own work |
| `js/save.js` | Save slots, save / load, the game loop and boot |
| `js/render.js` | Canvas drawing and the zoom camera |
| `js/training.js` | Crew mistakes, coaching, ranks, mentoring, cardboard trash |
| `js/fx.js` | Sound effects, combos, confetti, minimap, worker hover info |
| `js/morale.js` | Morale, conflicts, promotions, notice and exit interviews |
| `js/events.js` | Special Item Requests, dated dairy, spills, coolers, DM walks, inspections, seasons |
| `js/labor.js` | Weekly schedules, overtime, Monday forecast, labor demand, Labor Demand Exception report |
| `js/backroom.js` | Empty pallets, baler & bales, reload staging, truck stop order, sweeping, crooked floats, bird overflow |
| `js/facing.js` | Aisle facing levels, visual outs, 5 PM and close recovery, go-backs (cart, strays, cold spoilage) |
| `js/counts.js` | System on-hand vs. what's really there: theft, mis-ships, short DSD, the daily count list, counting (you and crew), phantom-inventory flags |
| `js/discipline.js` | Progressive discipline: tardies, no-call no-shows, repeat mistakes, the steps, the write-up and HR |
| `js/dmwalk.js` | District manager store walk: scheduling, the 8 graded areas, follow-ups and the check-back |
| `js/reps.js` | Vendor reps: scheduled visits, the pitches and what each answer does |
| `js/pnl.js` | Weekly P&L: the statement against budget, the action-plan pick, and the history |
| `js/weather.js` | Weather: daily weather and the 3-day forecast, storm stock-up days, slow storm days, the entrance mat, weather call-outs |
| `js/customers.js` | Customer interactions: questions, stock checks, price disputes and upset customers, what you say and how it lands |
| `js/perf.js` | Performance reviews and raises: due dates, the facts on file, ratings, the merit matrix and budget |
| `js/successor.js` | Growing a successor: the protégé, stretch tasks, development talks, promotion to Lead and Assistant Manager, the own-store offer |
| `js/standards.js` | Store standards: habits and timed routines, each associate's buy-in, one-on-one and group talks, the 📏 Standards tab |
| `js/owners.js` | Aisle owners: who owns which aisle, owners looking after their aisle, aisle scores, the accountability walk, initials tags |
| `js/talkscene.js` | Talk scenes: one-on-one conversations (coaching, development, standards, aisle walks) with choices, moods and the associate's portrait |
| `js/huddle.js` | The morning huddle: yesterday and today on one sheet, the day's priority (mistake focus), shout-outs |
| `js/guide.js` | How to play: the in-game player guide (title screen, game menu, Help tab, Day 1 welcome) |
| `js/menu.js` | Title screen, save slots, options, the volume sliders and the tap / hold More options menu |
| `js/music.js` | Store music: the generative ambient tracks, pads, pluck, bass, chimes and hats |
| `js/ivscene.js` | The interview scene: the pixel portrait with moods, the dialogue box and the question buttons |
| `js/interview.js` | Applicants and interviews: résumés, hidden skill, attendance, personality and real availability, the questions (and the illegal ones) |
| `js/timeoff.js` | Availability and time-off requests: who can work when, requests and answers, no-shows from the schedule |
| `js/endcaps.js` | Endcap displays: product on each endcap, the Tuesday flip (take down, backstock, pull, build), filling from backstock, empty displays |
| `js/resets.js` | Planogram resets every other Tuesday: the packet, discontinued and new items, the reset work, new labels, the catalog swap |
| `js/recalls.js` | Recall notices, the register block, pulling the shelf, backstock and freight, certification and recall credit |
| `js/cuts.js` | Warehouse outs and allocations, cuts at the warehouse, the cut report, "temporarily out" tags, invoice shorts and shortage claims |
| `js/damages.js` | Crushed truck cases, shelf and spill damages, the reclaim bin, damage claims, reclaim and DSD vendor credit |
| `js/birds.js` | Backstock birds on wheels: push them to the aisle, work them, crew bird runs, putting them away |
| `js/layout.js` | Backroom layout: movable float spots, reload staging and baler, validation, walk distances |
| `js/touch.js` | Phone/tablet floating joystick and buttons, home-screen app (with `sw.js`, `manifest.webmanifest`, `icons/`) |
| `js/orders.js` | Crew orders: click/tap an associate to assign any task, even outside their job |
| `js/shift.js` | Your own shift: clocking in and out, off-the-clock fast-forward, crew covering vendors, spills, coolers and idle work |
| `js/review.js` | Weekly DM review, records board, gamepad |
| `js/ui.js` | HUD, office computer, modals |

Progress auto-saves in the browser (localStorage).
