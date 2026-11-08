# Airfield

Id `airfield` · Source: `src/lib/apps/user/airfield/` · [ADR-098](../adrs/098-airfield.md), [brainstorm](../brainstorm/2026-11-07_plane-sim.md)

## What it does

A side-view takeoff and landing sim at real scale. Four planes, each solved from what a pilot feels: the trainer taildragger, a bush STOL plane, a 70 t twin-jet airliner and a glider. The home airfield is a free-flight hub with a hangar (the plane picker), a 2.4 km runway, gentle random weather with thermals, a winch for the glider and seven stands along the apron: the five levels of the current plane's track, a random landing and the Game Hub daily. Rounds score three stars (done, gentle, under par); every level is proven by an autopilot that also sets its par. Marked `experimental: true` (ADR-097).

## Where things are

| Area | Files |
|------|-------|
| Model | `core/plane.ts` (state, forces, `step_plane`, the `measure_*` feel probes, `coefficients`), `core/planes.ts` (the four `PlaneSpec`s, coefficients cached per plane) |
| Flight | `core/flight.ts` (`advance`: touchdown grading, crashes, autobrake, tail strike, stall warning, hazards), `core/field.ts` (the home field: runway, apron, hangar, gates, trees, surface friction), `core/weather.ts` (wind, gusts, shear, thermals; the hub's random weather), `core/winch.ts` |
| Rounds | `core/course.ts` (a level's world: ground line, surfaces, strips, obstacles, weather, `course_env`), `core/levels.ts` (the 20 levels and `random_scene`), `core/round.ts` (`Scene`, `step_round`, goals, `result`), `core/rounds.ts` (the plane's `RoundRef`, `chart`, the daily, on `$kit/games/play2d/rounds`), `core/progress.ts` (the kit's schema and `better`) |
| Proof | `core/autopilot.ts` (`autopilot`, `fly`), `core/chart.worker.ts` (the kit's `serve_chart`; `work_out_chart` from `$kit/games/play2d/chart-job`) |
| Cockpit | `core/cockpit.ts` (each plane's lever detents and flap notches), `core/controls.svelte.ts` (lever notch, trim, flaps, facing, brake ramp, stick from keys, pad or mouse, the crew walk), `pitch-pad.svelte`, the kit's `Lever` |
| Screen | `airfield.app.svelte` (loop, camera, HUD, cards, rounds), `frame.svelte` (toolbar ending in the kit's ⤢ `FullScreenButton` and dropped while the window is immersive, ADR-101; board, on-screen controls, mouse drag, pinch). Full screen: the HUD keeps clear of the exit button (`min-h` and `right` from the window's `--immersive-inset-*`), so the camera's top inset and the profile under the HUD move down with it, `core/draw.ts`, `core/art.ts` (each plane's drawing), `core/sound.ts` (on the kit's `GameSounds`), `settings-panel.svelte` |

## How it works

### The plane model

`step_plane` is a pure semi-implicit Euler step at the frame loop's ≤ 1/120 s. State: `x` along the view, `h` (centre of gravity above the datum; the home field's ground is 0), ground velocity `vx`, `vz` (into the view, only while pivoting on the ground), `vy`, heading `yaw`, `pitch` and pitch rate `q`, engine `spool`, the elevator's actual deflection, the flaps', spoilers' and reverser's travel, and which wheels touch (`main_on`, `aux_on`).

1. **Actuators.** Spool approaches `idle + (1 − idle) × throttle` with `engine_lag`; the elevator follows `trim + stick` (clamped to ±1) with `elevator_lag`; flaps travel at `1 / flap_time`, spoilers in 1 s; the reverser deploys in 1.5 s, only with the mains on the ground above 8 m/s, and reverse power waits until it is out (an interlock), so the Reverse notch never backs the plane up or pushes it forward.
2. **Air.** Air velocity is ground velocity minus `Env.wind` (along +x) and `Env.updraft`. `u` is its component along the heading, `w` the vertical; `γ = atan2(w, u)` and the wing's angle of attack `α = pitch + incidence − γ`.
3. **Lift.** `CL = a(α − α0)` with `a = 2π·AR/(AR + 2)`, rounded over 2° before the peak (`ROUND`), then broken: past the peak it falls to 60 % of `cl_max` within a few degrees (`STALL_BREAK`), blending into a flat plate (`1.1 sin 2α`) beyond about 35°. Mirrored below `CL_MIN`. Flaps add `flap_cl × flaps`, halved once the flow has separated. Ground effect adds up to 8 % lift. Spoilers take `spoiler_lift × spoilers` of it away.
4. **Drag.** `CD = CD0 + gear + flap_drag × flaps + spoiler_drag × spoilers + k·φ·CL² + cd_stall sin²α × separation`, `k = 1/(π e AR)` and `φ = (16h/b)² / (1 + (16h/b)²)` the induced drag left at wing height `h` (McCormick), so inside a span the wing floats.
5. **Thrust** along the fuselage: `T = thrust × spool × (1 − V/zero_thrust) × (1 − reverser × (1 + reverse))`, falling with airspeed (a fixed-pitch prop, or a jet with a high `zero_thrust`). An engineless plane has none. A level with a failed engine scales `thrust` by its `power` share (`powered`).
6. **Forces** in the heading's vertical plane: thrust along the pitch, drag against the air, lift square to it, plus `Env.pull` (the winch cable, the ground crew). There is no bank: the air model is 2D, pitch, power and energy.
7. **Pitch moment.** `q̄Sc (Cm0 + Cmα sin α + flap_pitch × flaps + cm_stall × separation)` plus the elevator `(q̄ + prop_wash × T / prop disc) S c cm_elevator × elevator` plus damping `¼ρVSc² cm_q q`. `elevator_for` and the T key trim with the same wash (`wash_ratio`, `wash_now`); a jet or glider has no wash.
8. **Gear** (`gear: { main, aux, layout }`). The second wheel is a tail wheel (`GearLayout.TAIL`) or a nose wheel (`NOSE`); the step code treats both alike. The mains are a spring on the mass with ω `√(g / gear_sag)` and damping `gear_damping` acting only while the leg compresses, ramped in over its first 6 cm (a bungee at 0.3, the airliner's oleo at 0.7). The aux wheel is ω 22 rad/s on the inertia over its arm, damping 0.7 both ways. `rest_pose` sinks each wheel by its share of the weight over its spring, so a stiff nose wheel doesn't start compressed as deep as the mains. Each contact reads the ground under its own point (`clearance`: `Env.ground(x)` and its slope); a slope pushes back along it, so an uphill strip stops a plane sooner. Rolling friction (`Env.roll`) and brakes on the mains (`brake × Env.grip`, a wet runway 0.45), smoothed over 0.3 m/s. Their forces act at the wheels, so hard brakes with the tail light tip a taildragger over.
9. **Heading.** On the ground the wheels kill sideways slip, and below 6 m/s the plane pivots toward `Input.facing` at 34 °/s; a pivot under way finishes. In the air the plane flies the way it faces.

### Specs by feel

`PlaneSpec` is written in what a pilot feels; `coefficients(spec)` solves the rest so the plane meets it. Every probe uses the model's own force functions.

| Feel field | Solves | How |
|------------|--------|-----|
| `stall_speed`, `flap_stall` | `cl_max`, `flap_cl` | 1 g at the curve's peak, analytic; `measure_stall` scans the curve |
| `glide` | `CD0` | best `L/D` over airspeed at idle, flaps up (`measure_glide`) |
| `climb`, `cruise` | `thrust`, `zero_thrust` | best steady climb at full throttle and level speed at the Cruise detent, 0.75; nested bisection, three rounds with the glide. Skipped without an engine |
| `trim_speed` | `Cm0` | zero elevator holds level flight (a glider: its steady glide) at that speed |
| (stall reach) | `cm_elevator` | full back stick holds 1° past the peak |
| `pitch_rate` | pitch inertia | peak pitch rate in 2 s of full back stick from trimmed flight (`measure_pitch_rate`); `cm_q` from a 0.8 damping ratio |
| `tail_up_speed` | `prop_wash` | ground speed where full throttle and half forward stick lift the tail (`measure_tail_up`); null without a prop, wash 0 |
| `stall_bob`, `stall_sink` | `cm_stall`, `cd_stall` | full back stick at idle for 25 s from 1.15 × stall (`measure_stall_hold`); the bob isn't monotonic in `cm_stall`, so `solve_scan` takes the first crossing up from −1.1 |
| `gear_sag` | main gear ω | `√(g / sag)` |
| `rollout` | brake friction | ground roll from 1.05 × flap stall in the landing set-up: idle, full reverse when it has one, full flaps, spoilers out when it has them, stick back on a tail wheel or neutral on a nose wheel, half brakes or the autobrake (`measure_rollout`) |

`plane.test.ts` re-measures every plane's feel numbers within 3 % (the bob within 10 %); the trainer also keeps its gear (3.5 g or less at 2.2 m/s), phugoid (16 s ± 15 %, damping 0.05–0.15) and handling tests, the bush plane lifts off in under 80 m with flaps 2, the airliner rotates and climbs away without a tail strike, the glider goes up past 300 m on the winch.

### The planes

| Feel | Trainer | Bush plane | Airliner | Glider |
|---|---|---|---|---|
| Mass, span, length | 600 kg, 10.7 m, 6.8 m | 700 kg, 11.6 m, 7.2 m | 70 t, 34.1 m, 37.6 m | 420 kg, 15 m, 6.7 m |
| Engine, gear | prop, tail wheel | prop, tail wheel, tundra tyres | twin jet, nose wheel | none, monowheel and tail wheel |
| Stall flaps up / full (m/s) | 18 / 16 → 18.0 / 16.0 | 17 / 13 → 17.0 / 13.0 | 72 / 60 → 72.0 / 60.0 | 20 / no flaps → 20.0 |
| Glide | 8 → 8.0 | 7 → 7.0 | 17 → 17.0 | 35 → 35.0 |
| Best climb (m/s) | 3 → 3.0 at 25.8 | 5 → 5.0 at 25.9 | 12 → 12.0 at 85.5 | – |
| Cruise, 0.75 (m/s) | 34 → 34.0 (full 39.6) | 36 → 35.9 (full 41.5) | 135 → 135.0 (full 142.7) | 30, not solved |
| Hands-off speed | 25 → 24.8 | 28 → 27.9 | 95 → 94.7 | 25 → 25.0 |
| Peak pitch rate (°/s) | 30 → 30.0 | 32 → 32.0 | 5 → 5.0 | 28 → 28.0 |
| Roll-out (m) | 120 → 120 | 40 → 40.0 | 1500 → 1500 | 100 → 100 |
| Stall held: bob, sink | 9°, 4.5 → 8.7°, 4.50 | 11°, 4.2 → 11.0°, 4.14 | 15°, 9 → 15.2°, 9.01 | 15°, 3 → 15.0°, 3.00 |
| Tail-up speed | 11 → 11.1 | 9 → 9.0 | – | – |
| Gear sag, damping | 0.12 m, 0.3 | 0.15 m, 0.3 | 0.3 m, 0.7 | 0.08 m, 0.4 |
| Not specs | takeoff 144 m to 22.6 m/s, float 50 m | takeoff 68 m (half flaps) | hands-off liftoff 2.1 km; rotated at 70 m/s ≈ 1.2 km | winch launch to about 450 m |

Solved coefficients (trainer unchanged from wave 1: `cl_max` 1.79, `CD0` 0.068, static thrust 1.81 kN, inertia 2,450 kg·m², `cm_stall` −1.0, `prop_wash` 0.26, brake 0.2). Bush plane: `cl_max` 1.76, `flap_cl` 1.25, `CD0` 0.074, 2.9 kN, `prop_wash` 0.16, brake 0.58. Airliner: `CD0` 0.014, 287 kN static, zero-thrust 173 m/s, inertia 1.0 × 10⁷ kg·m², brake 0.16 with spoilers (`spoiler_drag` 0.08, `spoiler_lift` 0.5), reverse 0.2 of forward thrust at the Reverse detent's 0.8 throttle, autobrake 0.2, tail strike at about 10° on the mains (`tail_skid`). Glider: `CD0` 0.010, airbrakes `spoiler_drag` 0.12, `spoiler_lift` 0.15. Deriving all four takes about 2 s in Node; a plane is derived when first picked.

The stall bob of the bush plane, airliner and glider is set where the solver lands (11–15°), not tuned by feel: an open owner call, like the trainer's porpoise from a full-aft yank at cruise (left as it is).

### Cockpit per plane

`core/cockpit.ts`: the lever's detents bottom to top and the resting notch (`idle`), and the flap notches. Trainer and bush plane: Idle, ¼, ½, ¾ (Cruise), Full. Airliner: Reverse (throttle 0.8, spoilers, reverser), Spoilers, Idle, ¼, ½, ¾, TOGA; the reverser only deploys on the ground. Glider: Airbrakes out, half, in (the resting notch at the top). Flaps: trainer Up, Half, Full; bush plane Up, 1, 2, Full; airliner Up, 1, 2, 3, Full; glider none (the buttons are disabled). The kit `Lever` takes each plane's labels and resting notch, so it needed no change.

### Flight and grading

`advance` steps the plane and judges it. A landing is a wheel meeting the ground after at least 0.6 s with all wheels off it; `landings` counts them, so a bounce is a second one. Its sink is the closing speed of the wheel that touched first: Kiss < 0.6, Firm < 1.5, Heavy < 3 m/s; 3 m/s or more is a crash. The autobrake arms at a touchdown in a plane that has one and lets go when the throttle comes above idle or the plane is under 2 m/s. Crashes: a hard landing, the prop below the ground (nose-over) or a jet's pod (`POD`), a hull point below the ground, a point inside a solid obstacle (`OBSTACLE`), wheels on water (`WATER`), and in a round a stall (flow separated past half) between 2 and 20 m (`STALL`, ADR-098 Scoring; a full-stall touchdown from a metre or two isn't one). The stall warning is the angle of attack within 3° of the peak off the ground.

### Weather

`core/weather.ts`. `Weather`: a wind along +x at 100 m eased toward the ground by a log profile (a third at 1 m, two thirds at 10 m), gusts (two sines in time and one in x from the seed, plus a small vertical part) only between `gust_from` and `gust_to` when given (on final), windshear (below `shear.below` the wind turns to `shear.wind` over 40 m) and thermals (`Thermal`: a Gaussian column up from 60 m to its top, with a ring of sink a quarter as strong round it; a negative strength is sinking air). In a round `course_env` adds ridge lift: 0.9 × the wind × the ground's slope over 80 m, fading out by 250 m up, so wind onto a slope rises and the lee side sinks. The hub has `gentle_weather`: up to 4 m/s either way, 0.8 m/s gusts and a thermal every 0.7–1.4 km past the runway, new each session.

Cues: the windsock hangs in a calm and streams out flat downwind by 7 m/s, flapping harder in a gust; the cloud layers drift with the wind aloft; a cumulus heap sits over each thermal's top and a faint shimmer rises from the ground under it; HUD chips for the wind (Head or Tail, knots, the way it blows) and for lift or sink over 0.4 m/s.

### The hub

`build_field()`: a 2.4 km runway from x = 0 (the airliner needs it), the apron from −470 m, the hangar from −160 to −118 m, seven gates from −215 m leftwards every 36 m (1 to 5, Random, Daily), trees past both ends, a windsock. Rolling slowly inside the hangar opens the picker (keys 1–4); Taxi out (Enter) puts it away until the plane has left the hangar, and while it is up the touch controls floating over a sideways phone hide, as for any card (the blurbs hide on boards under 30rem tall). Stopping at a gate (under 1.5 m/s within 7 m) opens its card, like Harbour's gates: title, brief, best stars, and the par once the worker has flown it; Start, or Not now (that gate stays shut until the plane leaves it). Each gate's board shows its stars for the current plane.

The glider has no engine: the crew walk it while A or D (or the ◀ ▶ buttons) are held, at 1.6 m/s; Apron and R put it in the hangar; **Winch launch** (L) on the ground facing the drum (beside the runway at 1,350 m, at least 400 m ahead) reels in to hold 1.5 × its stall, at most 1.2 × its weight, until the cable pulls more than 70° up or the drum is 40 m off; L again releases.

The world wraps (ADR-098 revision): `WRAP` is 8 km in the hub; the plane's `x` grows without bound and everything tied to the field reads `home_x`.

### Rounds, levels and proof

A round is a `Scene` (`core/round.ts`): a `Course`, a start (on the ground at rest, or in the air at a height, speed, flap and lever notch), a goal, the strip, a takeoff's clear point, the autopilot's glidepath and the engines' `power` share. The `Course` (`core/course.ts`) is one line that repeats every `wrap` metres: the ground as a polyline (hills, mesas, ramps from `levels.ts`, the highest at each point), surfaces (asphalt, wet, grass, dirt, sand, water), strips and obstacles (trees, hedges, houses, masts: solid boxes). Rounds start Ready (the card, plane frozen) and fly on Fly, Enter or any control.

- **Landing done:** stopped (under 0.5 m/s for 1 s, after a landing) with both wheels on the strip, and at least the scene's `min_air` flown off the ground (`Flight.air_distance`; 4 km for the Circuit, which starts on its own runway, so a hop doesn't finish it); stopped elsewhere fails (`OFF_STRIP`).
- **Takeoff done:** past the clear point at least its height up, airborne; a tail strike or a stall fails it.
- **Stars:** done, gentle (a landing: one touchdown, a kiss; a takeoff: the stall horn never sounded), under par.

| Plane | Level | Goal | Autopilot | Par |
|---|---|---|---|---|
| Trainer | 1 First solo: 700 m runway, 85 m up 1.1 km out | land | 82.5 s | 2:04 |
| | 2 Circuit: take off, round the 5 km wrap, land back | land | 258.3 s | 6:10 |
| | 3 Gusty: 7 m/s headwind gusting 2.5 on final | land | 105.9 s | 2:37 |
| | 4 Short field: 250 m grass, trees both ends, 5.5° | land | 68.1 s | 1:44 |
| | 5 Deadstick: no engine, 450 m up, 2.6 km out | land | 148.2 s | 3:36 |
| Bush plane | 1 Over the trees: 150 m grass, 15 m trees | takeoff | 21.0 s | 0:38 |
| | 2 Uphill strip: 170 m dirt on a 7 % slope | land | 70.9 s | 1:48 |
| | 3 Sandbar: 120 m of sand in a river | land | 62.3 s | 1:36 |
| | 4 Ridge: strip on a ridge, sink on the lee side | land | 127.5 s | 3:07 |
| | 5 Tailwind: 220 m grass, 5 m/s behind, trees past it | land | 61.5 s | 1:35 |
| Airliner | 1 Stabilised approach: 3° from 8 km | land | 169.0 s | 4:05 |
| | 2 Wet runway: 2.4 km, brakes at 0.45 | land | 148.9 s | 3:37 |
| | 3 Windshear: 14 m/s headwind dying below 150 m | land | 162.5 s | 3:56 |
| | 4 Engine out: half thrust, past a 30 m mast 40 m up | takeoff | 125.6 s | 3:04 |
| | 5 Short: 1.8 km runway | land | 126.1 s | 3:05 |
| Glider | 1 Straight in: 250 m, field 4 km out | land | 174.7 s | 4:13 |
| | 2 Thermal: field 11 km out, one thermal halfway | land | 434.9 s | 10:17 |
| | 3 Field landing: 330 m between hedges | land | 115.7 s | 2:50 |
| | 4 Ridge: ridge lift up a 150 m hill | land | 201.2 s | 4:50 |
| | 5 Cross-country: 14 km, three thermals | land | 555.7 s | 13:07 |

**The autopilot** (`autopilot.ts`) flies the round in the real physics through `step_round`, at 1/120 s, with continuous throttle, flaps and spoilers (a player has detents; par is lenient anyway). Phases: roll (full power, takeoff flaps, a taildragger's tail lifted first; rotation at 1.1 × the takeoff-flap stall toward 11° or the jet's 8° at 2.5 °/s), climb (pitch holds 1.35 × stall, the jet 1.2, never below +1.5 m/s under 40 m), cruise (160 m or the jet's 500 m, throttle on speed) until the glidepath is reached, approach (the scene's slope to an aim point 15 % into the strip, 12 % for the jet, 8 % for the glider; pitch tracks the path with throttle on 1.3 × the full-flap stall, 1.27 for the jet), flare (a vertical speed that shrinks with height, judged on the height it will be at a lead ahead: 2.5 s for the jet, 1 s for the glider, the deadstick and big-flap planes, 0.4 s else; capped at 6.5° on a nose wheel) and roll-out (wheel landing held until slow on a tail wheel, the nose lowered on a nose wheel, brakes from the distance left, spoilers and reverse). Without thrust (glider, deadstick) pitch holds the speed (minimum sink in lift, a little faster in sink) and drag holds the path: airbrakes, or the flaps on the deadstick. The inner loop is a PD on pitch around the elevator `elevator_for` gives, normalised by the elevator's authority. It climbs over an obstacle ahead and slopes the flare with the ground. Par is `ceil(1.4 t + 8)` s.

**Proof:** `levels.test.ts` flies all 20 levels, a random seed per plane and the daily. `levels.slow.test.ts` (`bun run test:slow`) flies each level again from 60 m back and on, 12 % higher and lower, and 1.5 m/s more head and tail wind: all 120 pass, the margin kept for retunes (Harbour's lesson).

**Random and daily:** `random_scene(plane, seed, attempt)` lays out a landing from the seed: a strip of the plane's kind and length, 1–2.4 km out (airliner 5.5–8.5 km, glider 2.5–5 km), on or near its glidepath (a glider released for 12–18 : 1), −7 to 2.5 m/s of wind with gusts half the time, shear for the airliner a third of the time, a thermal for the glider, hills beyond the strip and trees short of it under the path. `chart` tries up to 16 attempts in a worker (the kit's `work_out_chart`) while the card shows. The daily picks the plane from the day's seed; Game Hub ranks it `SCORE_ASC` on stars lost, ties by time (`play.daily`).

**Progress:** `/var/lib/apps/airfield/progress.json` (Harbour's shape): `bests` keyed `level-{plane}-{n}`, `random-{plane}`, `daily-{day}`; more stars win, then time. **Achievements:** Wheels down (first round), Greaser (a kiss, no bounce), Three stars (a level), Deadstick, Logbook (all 20 levels), Daily flight, Type rating (swap planes, secret).

### Camera and drawing

Real scale. The span across the board's shorter side grows with wheel height (`34 + 1.2 × min(h, 80) + 0.35 × max(0, h − 80)` m, at most 420), all scaled by `max(1, length / 12)` so the 37.6 m airliner sits in frame like the trainer; a floor in pixels (`plane_pixels`) keeps the plane readable in the circuit. The camera keeps the ground under the plane about a third of the clear height below the middle, eases at 6 a second along the view and 2.9 vertically, and looks 1.2 s ahead. The top inset it frames under is the HUD's instruments only (throttle, speed, height, climb, clock, flaps, trim), each chip held at its widest value so a new reading never rewraps them; the chips that come and go (wind, lift, spoilers, reverse, autobrake, brakes, turning, runway, stall, touchdown) sit below and overlay the view, so they never move it. A jolt on the wheels shakes the view; a separated wing buffets it only in the air (`buffet`: a taildragger at rest sits past the stall angle in still air, and the view shook on the apron).

Planes are drawn from `core/art.ts`: each part a side outline swept across a lateral range in the house style (player paint, one `edge` outline, `roof` trim, `glass` windows, `shadow` belly), drawn far half, fuselage, near half. Trainer: high wing, struts, spoked tyres, prop. Bush plane: the trainer stretched, a deeper wing with long flaps, tundra tyres. Airliner: low swept wing with flaps and spoiler plates that stand up as they open, two pods on pylons, a nose wheel, a row of windows and a fin band. Glider: slim pod and boom, bubble canopy, T-tail, shoulder wing with airbrake plates, monowheel.

In a round the ground is the course's polyline, filled grass and earth; strips are drawn along it (asphalt with dashes and threshold bars, wet with a sheen, grass, dirt, sand), water as a band with ripples; trees as groves, hedges, houses, lattice masts with a light; a windsock 25 m short of the strip; a dashed flag at a takeoff's clear point. The hub has the hangar, the runway and the gate boards. The profile inset, top right, shows the hub's field 2.7 km either side with 3° paths, or in a round the course from the start to past the strip with its ground, obstacles (red), the glidepath and the plane.

### Controls

| Action | Keys | On-screen (touch, or the mouse with Always) | Mouse |
|---|---|---|---|
| Lever | Shift / E up a notch, Ctrl / Q down (per plane: see Cockpit) | the kit's `Lever`, left | |
| Pitch | W/S or ↑/↓: the stick moves at 0.7 /s while held, springs back to the trim at 5 /s; every input goes through an expo (`0.6 s³ + 0.4 s`) | the pitch pad, right, back to centre on `lostpointercapture` | vertical drag on the board |
| Trim | T: trims for the current angle of attack | Trim button | |
| Flaps | F down a notch, V up | Flaps ▲ ▼ | |
| Brakes | B held: ramps to full over 0.8 s | Brake, held | |
| Turn round (ground, below taxi speed) | A/← face left, D/→ face right, taken only below 6 m/s (the facing resets to the heading off the ground); held, they walk the glider | ◀ ▶, held to walk the glider | |
| Winch (glider, hub) | L launches and releases | Winch launch / Release | |
| Rounds | Enter starts, flies, next level or tries again; R restarts; Esc pauses or closes a card | the card's buttons, Pause | |
| Other | Esc pause, R apron (hub), + − zoom | | wheel zoom |

Settings › Pitch: "Pilot" (default) or "Up is up". Settings › On-screen controls (`onscreen` in `settings.json`, the kit's `OnScreen` from `$kit/games/play2d/onscreen`): Auto (default; shown while the primary pointer is coarse, a `MediaQuery` in `frame.svelte`), Always (shown on desktop too, driven by the mouse through the same pointer events, sized smaller for a fine pointer: 36 px buttons and knob, a 9.5 rem lever and pad, 10 rem when floating) or Never (hidden even on a touch screen, so a touchscreen laptop flies on keys). Shown controls take the touch layout: a row under the board, or floating over its sides when the stage is wider than `OVERLAY_ASPECT`, and the camera's insets follow the measured boxes either way, so they never cover the plane or the HUD. A file from before the setting reads as Auto. With Never the first-flight hint gives the keys on any screen. The first-flight hint is per plane (lift-off speed, the airliner's pull to rotate, the glider's winch and airbrakes). The window pauses when it loses focus.

### Sound

`Sounds.drone(engine, …)`: a prop's sawtooth and square through a low-pass, pitch from spool and airspeed; a jet's whine from spool alone; a glider (and a deadstick round) only the wind. Wind noise with airspeed², the buffet's rumble, the stall horn, a tyre chirp and thump on each touchdown, a crash.

## Data

Through `storage.file` with zod schemas that fall back field by field: `/var/lib/apps/airfield/settings.json` (`plane`, `pitch`, `sound`, `seen_hint`) and `progress.json` (`version`, `bests`).

## Dependencies & licences

None beyond the repo's.

## Limits

- No roll axis (ADR-098 revision): no turning in the air, no crosswind.
- The autopilot is slower than a good pilot and never earns every gentle star (the trainer bounces once on most landings), so par is lenient; it flies continuous controls where a player has detents.
- Obstacles are boxes: a tree's crown collides as its full width and height.
- The hub's trees, hangar and windsock are scenery, not obstacles.
- Ctrl as lever-down: Ctrl+W closes the browser tab; E and Q are there for that.
- The browser's frame loop splits frames into equal steps, so a flight isn't bit-identical to the Node proof.

## Decisions

[ADR-098](../adrs/098-airfield.md) and its revision notes; [brainstorm](../brainstorm/2026-11-07_plane-sim.md).
