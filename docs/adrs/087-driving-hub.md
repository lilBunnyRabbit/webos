# ADR-087: Drive Hub
**Date:** 2026-10-28
**Status:** Implemented

## Context
Tight Spot ([ADR-086](086-tight-spot.md)) built a driving core (kinematic vehicles with trailers, polygon collision, a camera with insets, controls, vehicle drawing, sensors, a solvability planner) that more games than parking could use: a forklift warehouse, airport pushback, a ferry loader and others. Decided in [the driving hub brainstorm](../brainstorm/2026-10-28_driving-hub.md).

## Decision
- Tight Spot becomes **Drive Hub**, a hub for driving games, and keeps its id `tight-spot`; the parking game inside keeps the name Tight Spot. The display name changes when the hub ships; the id keeps achievements, the daily and links.
- The app splits into `core/` (shared driving code), `games/{id}/` (one folder per game, parking first) and `hub/` (the yard).
- A game is picked by driving into its building in a small hub yard, or from a menu that jumps straight to it.
- The yard is also a playground: free driving with a garage pad that swaps to any vehicle the app has.
- The shared core stays inside the app. It moves to `$kit` only when another app needs it.
- First new game: a forklift warehouse with rear-wheel steering, picking and dropping pallets, judged like parking per pallet.
- The restructure is a refactor with no behaviour change, after the current Tight Spot work lands.

- **Game contract:** `define_game({ id, name, icon, building, achievements, load })` per `games/{id}/index.ts`, a lazy `game.svelte`, listed in `games/index.ts`; games build from shared core components.
- **Storage:** every game under `app.tight-spot.{game}.*`, parking included; shared settings at the top level; no migration of older keys (the app has no other players yet).
- **Landing and links:** the yard first; a `game` prop (`yard`, `parking`, `forklift`) and the daily go straight in. No shell commands.
- **Forklift:** `VehicleSpec.steer_axle` (`front` or `rear`) in the core model; jobs of 1–4 pallets; stars for the job, moves and a par time; precision per drop; one Fork control.

## Alternatives Considered
- Separate apps on a `$kit/drive` module: each game visible in the store, but an up-front extraction and a kit API shaped by two games.
- Modes inside Tight Spot's toolbar: no structure, a crowded app.
- A new hub app that Tight Spot moves into: data migration, broken links, an app removed from installs.
- Rack heights for the forklift: more UI for little top-down gain.

## Revision 2026-10-28 (steps 1 and 2: implementation)
- **Split.** `core/` holds the model, collision with a broad phase (`obstacles.ts`), the scene shapes (`scene.ts`), camera, drawing primitives, sensors, sound, planner, frame loop, keys, the input (`DriveInput`), the shared settings (`DriveSettings`) and the components every game uses: `drive-frame.svelte` (toolbar, board, canvas, zoom, touch wheel and pedals, keys, status bar, as snippets and bindings), the gear strip, the speed chip, round cards, key hints and the settings panel. `games/parking/` holds the rest of the old app, its `draw_scene` built on the core primitives. Same pixels, checked before and after on desktop and a 390 px and 844 px phone.
- **No context.** Shared state goes down as props: the shell owns `DriveSettings` (and the yard's vehicle) per window and hands them to the active view; the settings stay at the top of storage as they were.
- **Contract details the ADR left open.** `icon` is a Phosphor icon (the switcher's system menu takes one); `building` is a `Building` value (`car-park` so far) the yard draws; `GameProps` is `{ settings, daily?, menu?, onexit? }`, `menu` the switcher snippet a game renders first in its toolbar.
- **Picking a game.** In the yard the vehicle's nose in a doorway (or its 4 m apron) shows a card with Enter; nothing enters on its own. The menu is a signpost button opening the system menu (`dialogs.menu`, a sheet on phones), the last game labelled "· last" and its doorway glowing.
- **Closed buildings.** The yard has two plots; one with no registered game is shut (a shutter, labelled Soon), so the forklift needs no yard change to appear.
- **Playground contact.** A step that would touch something, or jackknife, doesn't happen: the vehicle stops where it was, one thunk, a fading ring. The garage pad offers every vehicle and puts the new one on the pad.
- **Landing.** The yard starts at the gate in the hatchback; the yard's vehicle and position aren't stored (no persistence beyond `app.tight-spot.last`). Back from a game puts the vehicle outside that game's doorway.

## Revision 2026-10-28 (review fixes and yard polish)
- **Owner-confirmed as built.** Entering a game takes the card plus Enter or a tap, never driving in alone; a building whose game isn't registered stands shut and says Soon.
- **Play tracking in the shell.** `track_play` moved from the parking game to `tight-spot.app.svelte`: one Game Hub session per window, time in the yard and every game counts. `GameProps` gained `play` (the tracker) so a game still reports its daily.
- **Loading and failure.** While a game's chunk loads, the shell shows its toolbar (switcher and name) over "Opening …"; a failed load reports an error and returns to the yard.
- **Landing.** The yard is framed whole, clear of the HUD, cards and touch controls, until the first input; then the 34 m follow takes over. The welcome card shows on the first visit only (`app.tight-spot.yard_intro`); the guide keeps the help.
- **Yard look.** Roof signs with the game's name and icon (the shut one named after what's coming, Warehouse), lit doorways, real cones and round bollards drawn at a readable size. The switcher reads "Games" where it fits.
- **Loop.** The yard's frame loop stays up while the front wheels catch up with the steering wheel.

## Revision 2026-10-29 (step 3: the forklift Warehouse)
- **Model.** Rear steer is `drive: { kind: "ackermann", steer_axle: "rear" }` (ADR-088's union, not the `steer_axle` field this ADR named); the pose is the front axle. The forklift's tines are `VehicleSpec.forks` (`{ length, width }`), a body after the vehicle's own in `bodies()`, so the yard and the planner see them; `reverse_beeper` marks vehicles that beep backing up. Both were the build's call within "a forklift with forks"; flagged to the owner.
- **Round.** As decided: one to four pallets in order, lift with the forks fully in (mast within 15 cm) and square within 5°, lower with the pallet inside its target and straight, any contact ends it, the carried pallet included. The build added the pocket rule: forks overlapping a pallet are in its pockets within 8° and 12 cm of its axis, and jam (a contact) outside them.
- **Par time.** The planner's whole job from the real start at 1.4 m/s, plus 2.5 s per change of direction and 2 s per fork action, ×1.25, rounded up to 5 s; worked out per round in a worker (one to six seconds for four pallets). **Par moves** are a formula, 5 per pallet less 2, since the planner shuffles more than a driver.
- **Levels and daily.** 16 levels, four per job size. The daily is opened in the game and reported under the ADR-050 mode key `tight-spot/forklift` (stars lost as the score, then time); a Game Hub row for it needs a per-mode `daily_rank`, an open decision (decided and built in the next revision).
- **Core.** `core/precision.ts` (`fit`) moved out of parking; `core/seed.ts` (`hash`); `collide_shape`; `PlanOptions.blocked`, `steering` and `switch_cost`; `drive-frame`'s `pedal_top` snippet for the Fork button on touch; `GearStrip.space_parks`; the forklift and pallet drawings and the beeper and fork sounds.
- **Patterns.** How to add the next game, and the gotchas: [Drive Hub games](../apps/drive-hub-games.md).

## Revision 2026-10-29 (Warehouse review fixes and dailies in Game Hub)
- **Dailies (owner).** One Game Hub row per game: `daily_rank` is the per-mode record `{ parking: SCORE_ASC, forklift: SCORE_ASC }` (ADR-050), so Game Hub lists "Drive Hub · Parking" and "Drive Hub · Forklift" (its own naming: the app's name and the mode id in sentence case). The app gains a `mode` prop, as Sudoku has, naming the daily's game; Game Hub launches with `{ daily, mode }`. Parking's results now go under `tight-spot/parking`, the Warehouse's under `tight-spot/forklift`; days stored under `tight-spot` are left (no row reads them). Parking's daily seed is unchanged. Without `mode`, a `daily` opens the daily game named in `game`, else parking's.
- **Pocket rule (owner).** Tightened from 8° and 12 cm to both tines under the pallet: within 5° and with its centre at most (pallet width − fork spread) / 2 = 7 cm off the forks' centre line. The planner's pick leg now counts as lined up only with the tips short of the pallet and 1° and 2 cm inside those limits, so its straight run in has room; every level and sampled job still proves. Off the pockets and short of the pallet, the hint says how to line up ("Line up: 6.5° off", "Line up: pallet 9 cm to the left").
- **Recording.** A finished job is recorded at once (bests, level stars, achievements, the daily), with the time star when the par is in; when it isn't, the job is recorded again with the star once its round's par arrives. The par worker starts once per round (the effect is keyed on a derived round), not every frame. Next level never stores a level past the unlocked one.
- **Contact point.** `collide_shape` falls back to the touching shape's centroid when the polygons only touch (no crossing point), where `collide` used the car's pose; it only moves the contact ring in that degenerate case, and for rear steer the pose is the front axle, so the centroid is nearer the touch. Kept.

## Revision 2026-10-29 (accepted: the yard street, a plot per game)
Decided in `docs/brainstorm/2026-10-29_drive-hub-wave-3.md`, not built yet. The fixed 56 × 44 m yard with two plots becomes a street: one road west to east, the gate at the west end, plots on both sides, `ceil(n / 2)` pairs for `n` games, so every registered game gets a plot and a new game extends the street east. The landing frames the gate and the nearest plots, not the whole yard. One plot per game; a game's modes stay inside its building. Each game decides what a hit means (the detection, `collide()`, stays shared). New games keep their saved data in the app's data folder (ADR-035), not localStorage.

## Revision 2026-10-29 (implemented: the yard street)
Built as accepted above. The build's calls within scope:
- **Plot order.** Plot `i` is in pair `⌊i / 2⌋`, the north side for an even `i` and the south side for an odd one, so `GAMES` fill the street west to east alternating sides (Tight Spot north, the Warehouse across the road from it). An odd count finishes its pair with a shut building marked Soon.
- **Cross-section.** Buildings stay 18 × 11.6 m with their 6 m doorways; 34 m of road between the rows of fronts (the old yard had 32 m to its south wall), so a 24 m road train just out of a doorway stops short of the apron across the street and isn't offered that game.
- **Forecourt.** The gate moved to the west wall; the bays (north wall), the cone slalom and the garage pad (now lying east to west, the vehicle placed facing east) sit in a 30 m forecourt before the first pair; the bollards stand across the road at the east end. The street ends 10 m past the last pair.
- **Landing.** The camera frames the gate, the forecourt and the first pair (`Yard.landing`), not the whole street; a wide window shows more of it.
- **Looks.** `Building` gains `valet-stand`, `apron`, `ferry`, `garden`, `arena` and `track`, each with a roof in `hub/draw.ts`, so a new game only registers. The south side is drawn through a mirror of the north.
- **The open lot** (`open_world`, its chunks and the rows and angled layouts it uses) moved to `core/lot.ts` and `core/lot-layout.ts`; a lot cell now carries its own `build(rng)`, so parking's spots build their kind through it and the core never imports a game.

## Revision 2026-10-29 (Hot Lap, the race track)
Built from the wave 3 brainstorm ("F1 grip", "First cuts › Hot Lap"); game `f1`, `Building.TRACK`. What the build decided within that scope:
- **Grip.** `A_LAT` = 6 m/s²: the wheel is capped before `step()` so curvature stays at most 6 / v². `F1_CAR` and the core are unchanged. Grass is a game-owned spec variant (top speed 5 m/s, 4 m/s² drag) used for the step after the body centre leaves the asphalt and kerb.
- **Session.** Three laps from a grid 9 m behind the line; a lap must pass both sector lines in order. A wall hit puts the car back where it was at speed 0 and voids the lap; the session goes on.
- **Tracks.** Three hand-laid circuits as straights and bends (Meadow, Harbour, Ridge, 450–657 m). Walls sit up to 7 m out, closing in where another part of the track is near.
- **Par.** The minimum-curvature line (projected over-relaxation, coarse to fine) and a forward/backward speed pass with the car's own acceleration, brakes and `A_LAT`. Stars: a clean lap, within 20 % of par, within 8 %.
- **Ghost and bests.** One file per track in the app's data folder (`f1/ghost-{track}.json`), the best clean lap's time, splits and poses at 10 Hz in centimetres and milliradians; it is the track's best, so there is no separate bests file.
- **Camera.** Game-owned within the core's `frame`: a 0.9 s look-ahead and a span from 34 m standing to 72 m at top speed.
- **Daily.** The track of the day from `daily_seed(day, "tight-spot/f1")`, every clean lap reported, `daily_rank.f1` = `TIME`.

## Revision 2026-10-29 (Ferry Loader)
Built from the wave 3 brainstorm's first cut: game id `ferry`, `Building.FERRY` (lanes painted on its roof in the yard). Contact ends the sailing; parked vehicles become the game's own solids and the next vehicle swaps in with `create_car`, as decided, with no core change. Decided while building, inside the game: stowing is shifting into P where the vehicle may stay (as parking's park); undo restores a snapshot pushed per stow and keeps the clock running; the balance is the load's moment as a share of the most it could be, with a 12 % limit; random rounds are "Sailings" of 3–6 vehicles with no size picker; 12 levels; the par runs in a worker like the Warehouse's. Bests and level stars live in `/var/lib/apps/tight-spot/ferry.json` (the decided data folder), last choices in `app.tight-spot.ferry.*`. Details on [Drive Hub](../apps/tight-spot.md#ferry-loader-ferry).

## Revision 2026-10-29 (Mow Day)
- **Built as decided** in the wave 3 brainstorm: the garage's zero-turn mower; the deck game-owned (`games/mower/deck.ts`, `DECKS` per vehicle), `VehicleSpec` untouched; a solid ends the round, a flower bed under the body costs lawn (each cell three of lawn); a 15 cm grid in typed arrays, the deck's swept hull rasterised each step, stripes by pass direction, a cached layer repainting only changed cells; coverable = the planner's lattice flooded from the start (straight steps and pivots, beds blocking); stars for 90 % of it, overlap ≤ 25 %, par time from up-and-down passes; 12 levels, random lawns, a daily (`mower` in `DAILY_GAMES` and `daily_rank`).
- **Build's calls within scope.** The round ends with a Finish control (F, Space, a button) lit from 90 %, or by itself at every coverable cell with no flowers flattened. Overlap = cells cut again more than 1.2 m of deck travel after their first cut. The flood runs in a one-shot worker per round (60–300 ms), like the Warehouse's par. Saved data is `mower.json` in the app data folder (`storage.file`), last choices in `app.tight-spot.mower.*`. `Building.GARDEN` with a striped green roof; until the yard street lands the game has no plot and opens from the switcher or `game=mower`.
- **Review round (owner).** Once 90 % can no longer be reached (every coverable cell mown, less three per flattened flower cell), the round ends: "Too many flowers flattened". Build's call: if the measuring worker fails, the whole lawn counts as coverable, so the round can still be finished.

## Revision 2026-10-29 (Pushback)
Game `pushback`, `Building.APRON`, on `TrailerSpec.rest` (ADR-088 revision): the tug pushing an airliner as a link at rest π, `PUSHBACK` in `core/vehicle.ts` and kept out of the garage. Built within the brainstorm's first cut; what the build decided: the proof and the par come from a game-owned pushback driver (a track for the main gear, a fold the track asks for, the tug's wheel closing on it), not the core's `plan()`, which found no push in 120 000 expansions (the owner accepted this driver in the review round, replacing the brainstorm's "core planner"); the core's `player` now draws only as many loads as the spec has links, so the tug draws alone; its saved data is a JSON file in the app's data folder. Details on the [Drive Hub page](../apps/tight-spot.md#airport).

## Revision 2026-10-29 (Rodeo)
Game `rodeo`, `Building.ARENA`, built from the wave 3 brainstorm's first cut (any garage vehicle, a seeded course scaled to it, bests per vehicle and course, a daily fixing course and vehicle). What the build decided within that scope:
- **Course shape.** A walled arena with two lanes: three offset gates down the north lane, a U-turn, a slalom of four or five cones back along the south lane, a stop box, then a reverse gate backed through. Every distance scales from the rig's length, width, trailer length and turning circle (and a frame steer's bend ramp), with a seeded spread.
- **Proof pairs.** `prove()` plans and replays each course step by step with the real bodies and no margin; the tests prove a sample of pairs rather than every vehicle on every course: the hatchback on courses 1 and 2, the bus, the ladder truck, the telehandler and the skid-steer loader on course 1, the car and trailer on course 2.
- **Daily pool.** The daily's vehicle comes from its seed among the garage's vehicles with at most one link.
- **Experimental group** (owner, review round). Rigs of two or more links have no proven course: the picker lists them on an Experimental shelf with a "course not proven, may be impossible" note, their runs keep bests but count toward no achievement, and the daily never deals one. A daily's best records its vehicle, so it counts toward the every-shelf achievement.
- Saved data: `rodeo.json` in the app data folder. Details on the [Drive Hub page](../apps/tight-spot.md#rodeo).

## Revision 2026-10-29 (Valet Rush)
Game `valet`, `Building.VALET_STAND`, on the open lot from `core/lot.ts` as decided; customer cars swap in with `create_car`, parked ones are the game's solids, a contact is a dent (the car stops short, the score drops, that car's tip is lost, the shift goes on), no core change. What the build decided within scope: the lot is sized for the van, the biggest customer car; the stand, its queue lane and a return box are on the south road; the bus can't turn at the crossroads, so it gets coach bays up the north road (only in a lane with no lot gate beside it, bus only) and backs out to the stand; the walk is a jump of the clock at 2.5 m/s over the straight-line distance; an owner returns 70–150 s after the car is taken (the bus 50–80 s); the tip is 10, up to 10 for a quick return over 60 s, up to 5 for precision, doubled for the bus; a dent costs 5 and counts once until the car has moved 0.3 m; the daily ranks by score, higher first (`DailyRank.SCORE_DESC`); saved data is `valet.json` in the app's data folder. Details on the [Drive Hub page](../apps/tight-spot.md#valet-rush-valet).

## Consequences
- One large app; folders keep games apart.
- The id `tight-spot` stays even for games that aren't parking.
- Each game still owns its levels, judging, cards and achievements; shared progress (achievements, the daily) needs per-game ids inside the app.
