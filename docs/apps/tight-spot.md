# Tight Spot

Id `tight-spot` · Source: `src/lib/apps/user/tight-spot/` · [ADR-086](../adrs/086-tight-spot.md), [brainstorm](../brainstorm/2026-10-28_tight-spot.md)

## What it does

A top-down parking game. The car steers like a real one at parking speed: it turns about its rear axle, the front swings wide, the turning circle comes from the wheelbase and the steering lock. Spots are generated from a seed: parallel at a kerb, nose in, reverse in, angled, a garage up to the wall, bays between pillars, a narrow aisle, a tight garage door and a dead-end turnaround. Modes: a random spot of a picked kind (or any) with a seeded daily, a 27-level ladder, and a 3 × 3 open lot where any free bay counts.

Three layers, each replaceable on its own (the brainstorm's later steps):

| Layer | Files | Replaced by |
|-------|-------|-------------|
| Sim | `vehicle.ts` (model), `collision.ts`, `game.ts` (rounds, judging) | a dynamic tyre model behind the same `step()` |
| World | `world.ts` (chunks, plans), `lots.ts` (layouts), `kinds.ts` (shapes) | streamed chunks for the infinite world |
| Drawing | `draw.ts`, `camera.ts` | a tilted 3D renderer |

`tight-spot.app.svelte` runs the fixed-step loop and the input; `sensors.ts` and `sound.ts` are the parking sensors; `planner.ts` is test-only.

## How it works

### The car

`vehicle.ts`. SI units, metres and seconds. The pose is the rear axle's centre, `heading` 0 is east and grows clockwise on screen (y points down), so a positive steer angle turns right.

The hatchback (`HATCHBACK`): 4.3 m long, 1.8 m wide, 2.6 m wheelbase, 0.8 m rear overhang (0.9 m front), 1.55 m track. Its `turning_radius` is 5.3 m kerb to kerb, the circle the outer front wheel draws at full lock. `max_steer` derives the bicycle-model lock from it: the outer front wheel sits at `sqrt(R² − L²)` from the turn centre sideways, half a track out from the rear axle's centre, so `δ = atan(L / (sqrt(R² − L²) − track/2))` = 34.1°, and the rear axle's centre turns on a 3.84 m circle.

`step(car, input, dt)` is the kinematic (no-slip) bicycle model at a fixed 120 Hz:

1. The wheel moves toward the wanted angle at `max_steer / steer_time` (1.1 s centre to lock), at a standstill too. With `steer: null` (hands off) the target is straight ahead and the rate scales with speed up to 2 m/s, so the wheel self-centres only while rolling, like caster.
2. Pedals ramp (3/s down, 8/s up) so a key press isn't an on/off jump.
3. In D or R the car creeps: acceleration `creep_accel · (1 − v/creep_speed)`, or the throttle's `accel · throttle · (1 − v/top)`, whichever is larger; rolling resistance and the brake take speed off without crossing zero. P holds the car still; N coasts. `shift` refuses P above 0.3 m/s.
4. The pose moves along the exact arc for the step's distance (`arc()`), curvature `tan(δ) / L`, so the rear axle never slides sideways and a full-lock circle closes on itself.

The front wheels are drawn at their Ackermann angles (`wheels()`): the inner one at `atan(L / (1/κ − track/2))`, the outer at `atan(L / (1/κ + track/2))`. The dashed guide lines are `sweep()`: the two leading corners' paths for 5 m at the current wheel angle.

Tests (`vehicle.test.ts`) pin the geometry: the outer front wheel's circle is 5.3 m, the rear axle stays on its 3.84 m circle for 2000 steps, it only ever moves along the heading, the outer front corner swings outside the rear wheels' path, reversing on lock retraces the same circle, plus the steering rate, creep, brake hold, P refusal and determinism.

### Collision

`collision.ts`, hand-written. `overlaps` is the separating-axis test for two convex polygons: they're apart if some edge normal of either one splits their projections. Touching counts as apart, so a car whose side lies on a wall's face isn't a crash. Every solid is convex (a rectangle or a rotated rectangle), so nothing is decomposed. `game.ts` keeps each world's solids with their bounding boxes (`obstacles`, cached per world) and runs SAT only on boxes that meet the car's.

`contact_point` is where the red ring goes: the average of the corners of each shape inside the other and the edge crossings.

### World: chunks and plans

`world.ts`. The world is a grid of 32 m chunks. `chunk(seed, cx, cy, plan)` is pure: the same seed, cell and plan give the same chunk. A `Plan` says what each cell is in a mode (a road, a lot of some kind facing some side, or outside the world); the chunk reads its neighbours through it to open exits:

- road to road is always open; road to lot only through the lot's `entry`; lot to lot never;
- a side facing the outside of the world gets a wall.

Road chunks are an 8 m carriageway: a centre square plus an arm per open exit (a piece with one exit runs straight on to the far edge), kerbs elsewhere. Lots are laid out in their own frame (`lots.ts`), entry through the south edge between x 12 and 20, then turned in quarter turns to face their entry. `chunk_rng` seeds each chunk from `hash(seed, cx, cy)` with `core/utils/random.ts`.

Plans today:

| Mode | Plan |
|------|------|
| Spot, level, daily | `scenario_world`: the lot at (0, 0) facing south, a straight road at (0, 1); the car waits on the road facing north in the right lane, unless the lot names its own `start` |
| Open lot | `open_plan`: roads on the middle row and column of a 3 × 3, a lot in each corner opening onto one of its two roads (picked by hash), kinds from nose-in rows, angled rows and pillars, each bay taken with a chance of 0.45 (about 55 % free) and every free bay a target |

The infinite world is another plan over the same `chunk()`.

### Lot layouts

`lots.ts`, one builder per kind; `difficulty` 0 is roomy and 1 is as tight as the ladder goes (all `lerp`s between the two):

| Kind | Layout | Tightens |
|------|--------|----------|
| Parallel | The street runs on north to a dead end with a parking lane on the right; cars of random length fill it with one gap | gap car + 2.4 → 1.3 m, lane 2.5 → 2.3 m |
| Nose in / Reverse in | A row of bays against the north wall, an aisle, short rows either side of the way in | aisle 7 → 5.8 m (5.4 m reversing), bay 2.7 → 2.35 m, more neighbours parked and askew |
| Pillars | The same indoors, a pillar on every third bay line near the aisle; the target always has one at a front corner; either way round | pillar 0.45 → 0.75 m and closer to the aisle |
| Angled | 60° bays 6 m along their axis (slanted ends cut a rectangle's corners) for one-way traffic heading east; nose first | aisle 5.2 → 4.2 m, bay 2.7 → 2.4 m |
| Garage | A yard and a single garage; the bay ends at the back wall, so the car must stop near it | inside 3.3 → 2.55 m wide, slack 0.8 → 0.35 m, a shelf inside past 0.35, a car in the yard past 0.5 |
| Narrow aisle | A north-south aisle with bays on both sides; either way round | aisle 6 → 4.9 m, bay 2.6 → 2.35 m |
| Garage door | A walled alley with a garage off one side (mirrored at random) | alley 6 → 4.6 m, door 2.9 → 2.3 m |
| Dead end | A street closed at the far end; the car starts in it with bollards behind, so it has to turn round there; the box near the mouth faces out | street 7 → 5.4 m; a turning notch below 0.5; a parked car past 0.4 |

Parked cars never overlap each other, a wall or the target, and keep clear of pillars (their centre is clamped between the bay's lines less the pillar).

### Every spot can be reached

`planner.ts` is a hybrid A*: nodes keep exact poses, the closed set is a grid of 0.25 m, 5° and direction. Moves are 0.6 m arcs at five steering angles up to full lock, forwards and backwards; a move that runs into something stops short at the last clear 0.15 m, the way a driver creeps up to a bumper. Cost is distance (reverse × 1.3) plus 2.5 per change of direction, heuristic the straight distance plus 3 m per radian of heading error, weighted 2.5.

`planner.test.ts` plans from a parked pose in the bay (`parked_poses`: offsets inside the bay that count as parked and keep 5 cm clear) out to the start, with the car inflated by 5 cm. The model has no slip, so the same path driven backwards gets in. It covers every kind at difficulty 0, 0.5 and 1 over 8 seeds, all 27 levels, and every free bay of two open lots through their lot's gate (plus the start to each gate). About 11 s in Node on the owner's machine. The search found the parallel spot at 2.15 m of lane boxed in (the rear swings toward the kerb while pulling out), which set the 2.3 m lane.

### Judging

`game.ts`. Any contact ends the round (`advance` returns `crashed` with the contact point and what was hit). Shifting into P checks `bay_for`: parked when every body corner is inside the bay polygon and the heading is within 5° of the bay's (or of its reverse when `either`). P anywhere else just stops the car, and the status line says "Not in a bay", "Not straight" or "Facing the wrong way" (within 5° of the reverse of a bay that isn't `either`) (`verdict`), but only once the car has been in gear, since a round starts in P.

Moves are changes between D and R, the first gear and N or P not counted. Stars: at or under the kind's par is three, two more is two, else one (pars: parallel 2, nose in 0, reverse 1, angled 0, garage 0, pillars 1, narrow 2, door 2, dead end 2; open lot 1). Time is the sim's own clock (`ms`), so pauses and a hidden window don't count.

### Sensors

`sensors.ts`: for the bumper the gear drives toward, each solid's edges are taken into the car's frame, clipped to the strip the car would sweep driving straight (half a width plus 5 cm each side) and to 1.6 m ahead; the nearest point is the reading. `sound.ts` beeps a 1750 Hz tone, quicker the closer (`beep_period`), steady under 30 cm, from an `AudioContext` made on first use. The readout in the corner and the arcs at the bumper go from warning to error under 50 cm.

### Controls

Keyboard: arrows or WASD turn the wheel at its own rate and work the pedals; E, R or Q, N, P or Space pick gears; C centres the wheel; + and − zoom. The setting "Keyboard wheel when let go" picks between self-centring as the car rolls (default) and staying put. Touch (`pointer: coarse`): a wheel you drag round (`steering-wheel.svelte`, about 1.25 turns each way, held where you leave it, the hub centres it), held Brake and Gas pedals (pointer capture, released on `lostpointercapture`), a D/R toggle and P; pinch to zoom. The camera follows the car with a little look-ahead; before the start it frames the car and its bay together; an arrow on the edge points to an off-screen bay. Escape or the toolbar's Pause pauses; below `@md` that button moves onto the board's top-left corner, next to the gear and speed readout, which only shows once a round has started.

## Data

- `app.tight-spot.best`: best `{ moves, ms }` per kind and `open`, fewer moves first, then time.
- `app.tight-spot.levels`: stars per parked level; the next level after the highest parked one is open.
- `app.tight-spot.kinds`: kinds parked, for the achievement.
- `app.tight-spot.mode`, `.pick`, `.level`, `.sound`, `.guides`, `.wheel`: last choices and settings.
- Props: `daily` (`YYYY-MM-DD`), which Game Hub passes; the day's seed picks the kind and difficulty, and the result goes to `plays.json` with moves as the score (`SCORE_ASC`).

## Dependencies & licences

None.

## Limits

- Kinematic only: no slip, so speed changes nothing about the path. Fine at parking speed; drift is the planned dynamic model.
- Playtested from Playwright on the owner's dev server, desktop and a 390 × 844 touch emulation; not on a real phone or with a real wheel feel review.
- The planner proves a path with 5 cm of clearance, not that a person finds it easy; difficulty ranges are tuned by eye.
- The open lot is fixed at 3 × 3 and only uses three kinds of lot.

## Decisions

[ADR-086](../adrs/086-tight-spot.md) and its [brainstorm](../brainstorm/2026-10-28_tight-spot.md).
