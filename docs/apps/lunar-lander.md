# Lunar Lander

Id `lunar-lander` · Source: `src/lib/apps/user/lunar-lander/` · [ADR-099](../adrs/099-lunar-lander-rework.md), [brainstorm](../brainstorm/2026-11-07_lunar-lander-rework.md)

## What it does

A side-view lander sim at real scale, in the Harbour and Airfield pattern. Three ships solved from what a pilot feels: the lander (main engine and RCS thrusters), the twin pods (two engines, turned by splitting the thrust) and the 12 t shuttle. Three bodies at real gravity: the Moon, Mars (thin air, gusts) and Earth (thick air, wind). The base is a free-flight hub: a hangar pad (the ship and body picker) and seventeen pads along the ground, the fifteen missions of the campaign, a random mission and the Game Hub daily. Missions score three stars (done, gentle, under par); every one is proven by an autopilot that also sets its par. Marked `experimental: true` (ADR-097).

## Where things are

| Area | Files |
|------|-------|
| Model | `core/lander.ts` (state, `step_ship`, the `measure_*` feel probes, `coefficients`), `core/ships.ts` (the three `ShipSpec`s, coefficients cached per ship), `core/bodies.ts` |
| Flight | `core/flight.ts` (`advance`: touchdown grading, crashes), `core/world.ts` (terrain: ground polyline, pads, rock; features `hill`, `mesa`, `crater`, `canyon`; gusts) |
| Missions | `core/mission.ts` (`Scene`, stops and cargo, `step_mission`, `result`), `core/missions.ts` (the 15 missions and `random_scene`), `core/rounds.ts` (the ship-and-body `RoundRef` on `$kit/games/play2d/rounds`, `chart`, the daily), `core/progress.ts` (files, bests, open missions, unlocked ships) |
| Proof | `core/autopilot.ts` (`autopilot`, `fly`), `core/chart.worker.ts` (the kit's `serve_chart`) |
| Base | `core/base.ts` (`build_base`: the hangar pad, the gates, free-flight air and wind) |
| Controls | `core/lever.ts` (the detents round the hover throttle), `core/controls.svelte.ts` (lever notch, turn and burn from keys or touch), the kit's `Lever` |
| Screen | `lunar-lander.app.svelte` (loop, camera, HUD, cards, missions), `frame.svelte` (toolbar, board, on-screen controls, pinch), `core/draw.ts`, `core/art.ts` (each ship's drawing as data), `core/draw-ship.ts` (`paint_ship`, shared by the board and the hangar's `ship-thumb.svelte`), `core/sound.ts` (on the kit's `GameSounds`), `settings-panel.svelte` |

## How it works

### The ship model

`step_ship` is a pure semi-implicit Euler step of a 3-DOF rigid body at the frame loop's ≤ 1/120 s. State: `x`, `y` (the centre of mass, metres, y up), `vx`, `vy`, `angle` (anticlockwise from upright) and `spin`, the engine's `spool`, `fuel` in seconds of hover, `cargo` in kg, and per foot whether it touches and how far it is pressed in.

1. **Mass.** `m = mass + cargo`; the inertia grows with it in proportion.
2. **Engine.** The spool approaches the throttle with the spec's `spool` lag; thrust is `spool × thrust[body]` along the ship's up axis. With no fuel the throttle is 0 (unless Infinite fuel).
3. **Turning.** A or D command a spin rate (`turn × spin`); the wanted torque is `I × 8/s × (wanted − spin)`, clamped to the ship's authority: the RCS torque, or for the pods `split × T × arm` (one engine pushes `(1 + s)/2` of the thrust, the other `(1 − s)/2`), so the pods turn only under power. Hands off in the air this holds the rate at zero (rate-command, attitude hold). On its legs a hands-off ship lets the hold go: fighting the springs, it rocked.
4. **Air.** `½ ρ |v − wind| (v − wind) × drag_area`, at the centre of mass (no aerodynamic torque).
5. **Legs.** Each foot is a spring-damper along the ground's normal (`leg_k`, `leg_c`, damping ratio 0.5 on the ship's share of the mass), never pulling, plus sliding friction 0.7 smoothed over 0.05 m/s. The friction is capped at half of what stops the foot's slide in one step through the mass the foot feels (`1 / (1/m + lever²/I)`): heavy on Earth, the smoothed friction alone rang from step to step.
6. **Settling.** Standing on every foot with the engine below 90 % of the weight, no turn input and under 0.03 m/s and 0.01 rad/s, the ship stops dead: springs and tanh friction otherwise leave it creeping.
7. **Fuel.** Burns `T / (mass × g)` seconds a second (an empty ship at hover burns one), plus 0.06 of a second for each second of full RCS.

### Specs by feel

`ShipSpec` is written in what a pilot feels; `coefficients(spec)` solves the rest.

| Feel field | Solves | How |
|------------|--------|-----|
| `hover[body]` | `thrust[body]` | `mass × g / hover`, analytic: the engines are rated per body, so Hover sits mid-lever on each (`measure_hover` bisects the throttle that holds height) |
| `spin`, `spin_up` | RCS torque, or the pods' `split` | bisected so a held turn from rest reaches 90 % of `spin` in `spin_up` s; the pods at hover throttle on the Moon (`measure_spin`) |
| `safe.sink`, `travel` | `leg_k` (and `leg_c` from it) | a touchdown at the safe sink on Earth, engine off, uses exactly the legs' travel (`measure_drop`), the hull stays clear |
| `tank` | | the fuel's unit: seconds of hover, so `measure_tank` reads it back |
| `safe.slide`, `safe.tilt` | | touchdown limits, judged by `advance` |

`lander.test.ts` re-measures every number per ship and body (hover within 3 %, tank within 1 %, spin and spin-up within 3 to 4 %, the legs' stroke within 3 % with the hull clear), plus the pods turning only on thrust and a parked ship staying put.

| | Lander | Twin pods | Shuttle |
|---|---|---|---|
| Mass, gyration | 4,000 kg, 1.6 m | 2,200 kg, 2.4 m | 12,000 kg, 3.5 m |
| Hover Moon / Mars / Earth | 0.40 / 0.55 / 0.65 | 0.45 / 0.55 / 0.62 | 0.45 / 0.60 / 0.70 |
| Turning | RCS, 30 °/s in 1.2 s | split, 32 °/s in 1.4 s | RCS, 14 °/s in 2.6 s |
| Safe sink, slide, tilt | 2.5 m/s, 1.2 m/s, 12° | 2.0, 1.0, 10° | 3.0, 1.5, 15° |
| Tank, spool | 200 s, 0.35 s | 150 s, 0.2 s | 260 s, 0.8 s |
| Leg travel, drag area | 0.45 m, 14 m² | 0.40 m, 16 m² | 0.60 m, 40 m² |
| Solved | thrust 16.2 / 27.0 / 60.4 kN, RCS 4.0 kN·m, legs 63.7 kN/m | 7.9 / 14.8 / 34.8 kN, split 0.40 (arm 3.2 m), legs 36.7 kN/m | 43.2 / 74.2 / 168 kN, RCS 12.4 kN·m, legs 146 kN/m |

A split-thrust ship's turn scales with its thrust, so the pods turn faster on Mars and Earth than on the Moon, where the spin-up is specified.

### Touchdown and crashes

`advance` steps the ship and judges it. A landing is a foot meeting the ground after at least 0.4 s with every foot off it; its sink is the fastest closing speed of a foot that touched. Kiss < 0.5 m/s, Firm < 1.2, Heavy below the ship's safe sink, and at or over it the legs break (`HARD`). Sliding at the ship's safe slide or more (`SLID`) or leaning past its safe tilt off square to the ground under the feet (`TILTED`) is a crash too. A hull point under the ground (`HULL`), the hull's outline (the convex hull of its points, `hull_outline`) overlapping rock or a foot inside it (`ROCK`, the kit's SAT `overlaps`, so a rock corner can't slip between two hull points) and flying 60 m past a mission's ends (`LOST`) end the flight. The base's ends are soft (`Terrain.soft_edges`): the ship stops there, its outward speed gone.

### Missions

A `Scene` is a body, a ship, a `Terrain` (ground polyline sampled every 4 m from `hill`, `mesa`, `crater` (a raised rim and a cut bowl) and `canyon` features, high walls at both ends, flat pads let in with 3 m shoulders, convex rock for cave roofs and overhangs), a `Weather` (wind plus gusts: two sines in time and one along the ground), a start (x, height, drift, cargo) and the stops. Each stop is a pad, a load (kg added once the ship has settled there: positive picks up, negative drops off), what waits on it (crate or crew, drawn) and the autopilot's waypoints toward it (caves, canyons, ridges), which the screen also shows as a dashed guide. Settled is every foot down, under 0.15 m/s and 0.03 rad/s, both feet on the stop's pad, held 1 s (3 s while loading). Stopped off the pad is not a failure: lift off and try again.

Stars: done; gentle (no touchdown other than a kiss, and one landing per stop); under par. A mission opens once the one before it is done; finishing a mission flown in a ship unlocks that ship for the base.

| Mission | Ship, body | What | Autopilot | Par |
|---|---|---|---|---|
| 1 First touchdown | Lander, Moon | pad 50 m off, 70 m up | 29.8 s | 0:50 |
| 2 Over the hills | Lander, Moon | 820 m past three hills | 76.0 s | 1:55 |
| 3 Crater floor | Lander, Moon | pad on a crater floor 70 m down | 88.4 s | 2:12 |
| 4 Ridge top | Lander, Moon | pad on a 130 m ridge | 84.4 s | 2:07 |
| 5 Supply run | Lander, Moon | 1.2 t crate to a mesa | 138.1 s | 3:22 |
| 6 Twin pods | Pods, Moon | the pods' first pad | 59.8 s | 1:32 |
| 7 Canyon | Pods, Moon | down a 120 m canyon | 89.2 s | 2:13 |
| 8 Red dust | Lander, Mars | gusts to 11 m/s | 65.5 s | 1:40 |
| 9 Crew hop | Pods, Mars | crew over a 100 m ridge | 115.7 s | 2:51 |
| 10 Lava tube | Lander, Mars | pad under a rock roof | 77.7 s | 1:57 |
| 11 Heavy lift | Shuttle, Moon | 4 t container to a mesa | 198.4 s | 4:46 |
| 12 Valles | Shuttle, Mars | 160 m canyon, gusts | 98.0 s | 2:26 |
| 13 Home | Lander, Earth | Earth gravity, breeze | 54.6 s | 1:25 |
| 14 Sea cliff | Pods, Earth | cliff top into a 6 m/s headwind | 62.7 s | 1:36 |
| 15 Deep cave | Pods, Mars | cave dropping 60 m under two roofs | 91.2 s | 2:16 |

**The autopilot** (`autopilot.ts`) flies the mission through `step_mission` at 1/120 s. Its turn input is the player's: left, right or let go (−1, 0, 1), through the same rate command and attitude hold; its throttle is continuous where a player has the lever's detents and Space (Airfield's precedent), the one control it has that a player hasn't. Through each stop's waypoints, then to a hover 14 m over the pad (cruising at least 22 m above the highest ground between) and straight down at `0.3 + 0.28 × feet height` m/s. Laterally a speed toward the target that can still stop there, turned into a lean (at most 35°, narrowing to 2° over the last 14 m) with a lead on the push the current lean already gives and a gain scaled by how fast the ship turns; the lean is reached by holding the turn until the spin under way would coast onto it (`ω|ω| / 2α`), then letting go, within a band of 1° that shrinks with g (0.06 m/s² of push: 0.35° on Earth). Vertically a speed from the height error, with a floor of +2.5 m/s within 10 m of the ground ahead, and a slow-down below a rise ahead until the ship has climbed over it. The par is the kit's `ceil(1.4 t + 8)` s.

**Proof:** `missions.test.ts` flies all 15 missions and a random mission for every ship on every body. `missions.slow.test.ts` (`bun run test:slow`) flies each mission again 20 m back and on, 12 % higher and lower, drifting 3 m/s back, and with 1.5 m/s more wind either way: all 105 pass.

**Random and daily:** `random_scene(ship, body, seed, attempt)` lays out one pad 350 to 900 m away on the plain, in a crater or on a mesa, rolling ground with one to three hills between, a start 100 to 220 m up, and wind and gusts on Mars and Earth. The random gate uses the base's ship and body; the daily picks both from the day's seed (`daily_ref`). `chart` tries up to 16 attempts in a worker while the card shows. Game Hub ranks the daily by time (`DailyRank.TIME`, `play.daily(day, ms)`).

### The base

`build_base()`: the hangar (scenery) and its pad at x −60, then gates every 55 m from x 60: missions 1 to 15, Random, Daily; a mesa and a hill close the ends, and past them a soft edge stops the ship. You start parked on the hangar pad with the lever at Off. Standing on the hangar pad shows the picker: the three ships, one row each with a thumbnail drawn by `paint_ship` (`ship-thumb.svelte`), the name and one line (locked ones say which mission unlocks them; keys 1 to 3) and the body; **Lift off** (Enter) puts it away until you leave the pad. Settling on a gate opens its card (title, ship, body, brief, best, par once the worker has flown it; Start or Not now, and that gate stays shut until you leave it). A locked mission's card says which to finish first. Coming back from a mission parks you on its gate.

Free flight follows the settings: Air (the body's own air; off is a vacuum), Wind (5 m/s gusting 4, needs air) and Infinite fuel.

### Controls

| Action | Keys | On-screen (touch, or the mouse with Always) |
|---|---|---|
| Lever | W, ↑ or Shift up a notch; S, ↓ or Ctrl down | the kit's `Lever`, left |
| Full burn | Space, held | Burn, held |
| Turn | A / ← left, D / → right, held | the turn buttons, right, held (`lostpointercapture` lets go) |
| Missions | Enter starts, flies, next mission or tries again; R restarts; Esc pauses or closes a card | the card's buttons, Pause |
| Other | R hangar (base), + − or the wheel zoom (0.4 to 8 ×), 1–3 pick a ship in the hangar | pinch zoom |

The lever's detents (`lever.ts`), bottom to top: Off, Low (0.5 h), Sink (0.8 h), **Hover** (h), Rise (h + 0.35 (1 − h)), Full, where h is the throttle that hovers the ship as it is now (body and cargo), so the notches move when cargo comes on. The `Lever`'s neutral is Hover: above it the thumb is primary, below it warning. The window pauses when it loses focus.

Settings › On-screen controls (`onscreen` in `settings.json`, the kit's `OnScreen` from `$kit/games/play2d/onscreen`): Auto (default; shown while the primary pointer is coarse, a `MediaQuery` in `frame.svelte`), Always (shown on desktop too, driven by the mouse through the same pointer events and `lostpointercapture`, sized smaller for a fine pointer: a 44 px Burn, 56 × 72 px turn buttons, a 9.5 rem lever, 10 rem when floating) or Never (hidden even on a touch screen, for a phone or tablet flown from a keyboard). Shown controls take the touch layout, a row under the board or floating over its sides past `OVERLAY_ASPECT`, and the camera's insets follow their measured boxes. Releasing a pointer on a control hands the focus back to the board, so Space, Enter and the arrows keep flying (tabbing to a control still works it from the keyboard). A file from before the setting reads as Auto. With Never the first-flight hint gives the keys on any screen.

### Camera and drawing

Real scale. `view_span` (`core/view.ts`) sets the metres across the board's shorter side at zoom 1: it grows with the camera height (`camera_height`: the centre of mass over the ground less the legs' reach as built, not the feet's height now, which swung with every turn and made the view breathe) (`30 + 0.9 × min(h, 80) + 0.4 × max(0, h − 80)` m, widened by the ship's width over 9 m so the shuttle sits in frame like the lander; 24 on a tall board) and widens further so the height plus 14 m fits in 70 % of the clear part, keeping the ground in sight. It never goes so wide that the ship drops under its pixel floor (`ship_pixels`): 32 px near the ground, easing between 40 and 160 m up to Airfield's 14 % of the shorter side (55 to 80 px). High up the floor wins and the ground leaves the view; the profile strip shows it then. The middle of the clear part sits 36 % of its height above the ground under the ship, or 20 % below the ship when the ground is out of reach, the ship's height led by its climb or sink over the vertical easing rate (the eased view otherwise trails a fast ship out of a zoomed-in frame); the look-ahead along is a third of the visible width at the current zoom. The span the camera uses follows that target slowly (`ease_span`: it rests until the target is 6 % away, then eases at 1.2 a second until within 1 %), so a hover's bobbing or a wobbling climb rate leaves the view still. The sky gradient and the far ridges hang on the area's horizon (its median ground height), not the ground under the view, and the ridges fade as the horizon drops under the board instead of popping off it. Pinch, the wheel and + − zoom from 0.4 to 8 times that span (`clamp_view_zoom`; the kit's 2.4 stopped short of a readable ship high up). The camera eases at 5 a second along and 3 vertically and looks 1.1 s ahead. The top inset is the instruments row (lever, fuel, height, climb, drift, tilt, clock), each chip held at its widest, or the profile strip when that is taller; chips that come and go (pad of, loading, not on the pad, cargo, wind, out of fuel, notes, the touchdown) sit below and never move the view.

All on theme tokens: `read_palette` plus `read_scenery` (per body: sky, ground, deep ground, rock, far and near ridges, the Moon's and Mars's stars, mixed from `info`, `success`, `warning`, `error`, `foreground` and the background ladder). Ships are data in `core/art.ts`, drawn by `paint_ship` (`core/draw-ship.ts`) in the house style of Drive Hub, Harbour and Airfield: outlined parts in player paint, `roof`, `glass`, steel, ink and foil, each with optional trim, a shade on its lower part, a glint and panel seams, all clipped to the part. The lander is a rounded dome cabin with a ringed porthole on a foil base; the twin pods are two capsule tanks on a truss with a glass bubble cockpit; the shuttle is a tail block and a cab joined by truss beams around a foil container. Legs telescope: a sleeve from the hip keeps its length and the piston below it shows less of itself as the foot presses in (`Ship.stroke`), with a brace, an ankle joint and an outlined boot. Bells are curved nozzles with a collar, a shaded side and a dark rim. The flame is three plumes (scenery `flame_glow` and `flame`, a warning and error mix so Brand Light's olive warning doesn't turn it green, and a `glow` core) whose length follows the spool, the pods' split by their turn. RCS quads are blocks with a nozzle up and one down; the nozzles on the side that turns the ship puff. Crew ride as figures clipped to the windows; a crate hangs at the art's `sling` while one is carried. The art is drawing only: collision still uses the spec's `hull` and `feet`, which the art follows (the lander's base and RCS blocks stand up to 0.2 m past the hull's sides). Dust puffs rise under the engine near the ground and at touchdown. Pads are plates with a centre mark and lights that blink on the target pad; gates have a board with the number and stars; the hangar a building with a door. The strip top right shows the whole area, its rock, every pad (the target marked) and the ship.

### Sound

`Sounds` on the kit's `GameSounds`: the engine's roar (looped noise through a low-pass) and rumble with the spool, a lower note for the shuttle; an RCS puff (high-passed noise) at most every 0.11 s while the thrusters work; a thud and a leg creak on touchdown; a crash; chimes for loading and for a finished mission.

## Data

Through `storage.file` with zod schemas that fall back field by field: `/var/lib/apps/lunar-lander/settings.json` (`ship`, `body`, `air`, `wind`, `infinite_fuel`, `sound`, `seen_hint`) and `progress.json` (`version`, `bests` keyed `level-{n}`, `random-{ship}-{body}`, `daily-{day}`, `landings`, `ships_landed`). The arcade game's `storage.json` is read once, never written: when `progress.json` has no landings yet, its landing count and the ships its bests name carry over (`migrated`), so Frequent flyer and Fleet pilot go on; its points bests are dropped. The window waits for all three files before it picks the saved ship.

**Achievements** (the ids from before the rework): Touchdown (settle on a pad), Heavy landing (on Earth), Crosswind (with 3 m/s of wind or more), Fleet pilot (every ship, from `ships_landed`), Frequent flyer (25 settled landings, from `landings`), Feather (secret: a touchdown on a pad, under 0.25 m/s, under 1° and within 1 m of its centre; a touchdown off the pads has no centre). A landing counts once the ship has settled on a pad.

## Dependencies & licences

None beyond the repo's.

## Limits

- No deorbit or descent missions, no fourth ship (ADR-099).
- Mars air at its real density barely pushes a ship: the gusts there are a mild hazard. Earth's wind is the one you feel.
- The autopilot is slower than a good pilot, so par is lenient; its throttle is continuous where a player's has detents (its turn is a key, like a player's).
- Rock is convex shapes; a cave roof is one or two of them.
- The browser's frame loop splits frames into equal steps, so a flight isn't bit-identical to the Node proof.

## Decisions

[ADR-099](../adrs/099-lunar-lander-rework.md) and its revision note; [brainstorm](../brainstorm/2026-11-07_lunar-lander-rework.md).
