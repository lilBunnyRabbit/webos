# Airfield

Id `airfield` · Source: `src/lib/apps/user/airfield/` · [ADR-098](../adrs/098-airfield.md), [brainstorm](../brainstorm/2026-11-07_plane-sim.md)

## What it does

A side-view takeoff and landing sim at real scale. Wave 1 of three (ADR-098 "Build order"): one plane (the trainer taildragger), the home airfield as a free-flight hub with a hangar picker, graded touchdowns and crashes. No levels, stars, weather or autopilot yet. Marked `experimental: true` (ADR-097); not in the changelog until wave 3.

## Where things are

| Area | Files |
|------|-------|
| Model | `core/plane.ts` (state, forces, `step_plane`, the `measure_*` feel probes, `coefficients`), `core/planes.ts` (the `PlaneSpec`s, coefficients cached per plane) |
| Flight | `core/flight.ts` (`advance`: touchdown grading, crashes, stall warning, wheel height), `core/field.ts` (the home field: runway, apron, hangar, trees, surface friction) |
| Cockpit | `core/controls.svelte.ts` (throttle notch, trim, flaps, facing, brake ramp, stick from keys, pad or mouse), `pitch-pad.svelte`, the kit's `Lever` |
| Screen | `airfield.app.svelte` (loop, camera, HUD, cards), `frame.svelte` (toolbar, board, touch controls, mouse drag, pinch), `core/draw.ts`, `core/sound.ts`, `settings-panel.svelte` |

## How it works

### The plane model

`step_plane` is a pure semi-implicit Euler step at the frame loop's ≤ 1/120 s. State: `x` along the view, `h` (centre of gravity above the ground), ground velocity `vx`, `vz` (into the view), `vy`, heading `yaw`, `pitch` and pitch rate `q`, `bank`, engine `spool`, the elevator's actual deflection and the flaps' travel, and which wheels touch.

1. **Actuators.** Spool approaches `idle + (1 − idle) × throttle` with `engine_lag`; the elevator follows `trim + stick` (clamped to ±1) with `elevator_lag`; flaps travel at `1 / flap_time`.
2. **Air.** Air velocity is ground velocity minus `Env.wind` (along +x) and `Env.updraft`. `u` is its component along the heading, `w` the vertical; `γ = atan2(w, u)` and the wing's angle of attack `α = pitch + incidence − γ`. Wave 1 flies `CALM`; the plumbing is there for wave 2's wind, gusts and thermals.
3. **Lift.** `CL = a(α − α0)` with `a = 2π·AR/(AR + 2)`, rounded over 2° before the peak (`ROUND`), then broken: past the peak it falls to 60 % of `cl_max` within a few degrees (`STALL_BREAK`), blending into a flat plate (`1.1 sin 2α`) beyond about 35°. Mirrored below `CL_MIN`. Flaps add `flap_cl × flaps`, halved once the flow has separated. Ground effect adds up to 8 % lift.
4. **Drag.** `CD = CD0 + gear + flap_drag × flaps + k·φ·CL² + 1.2 sin²α × separation`, `k = 1/(π e AR)` and `φ = (16h/b)² / (1 + (16h/b)²)` the induced drag left at wing height `h` (McCormick), so inside a span the wing floats.
5. **Thrust** along the fuselage: `T = thrust × spool × (1 − V/zero_thrust)`, falling with airspeed like a fixed-pitch prop.
6. **Forces** in the heading's vertical plane: thrust along the pitch, drag against the air, lift square to it times `cos(bank)`; `L sin(bank)` sideways, which curves the track.
7. **Pitch moment.** `q̄Sc (Cm0 + Cmα sin α + flap_pitch × flaps + cm_stall × separation)` plus the elevator `(q̄ + 0.35 T / prop disc) S c cm_elevator × elevator` (prop wash gives the tail authority at taxi speeds) plus damping `¼ρVSc² cm_q q`.
8. **Gear.** Main and tail wheels are spring-dampers on their body points (main ω 12 rad/s on the mass, tail ω 22 rad/s on the inertia over the tail arm, damping ratio 0.7), with rolling friction (`ROLL_ASPHALT` 0.025, grass 0.05, the tail wheel twice that) and brakes on the mains, smoothed over 0.3 m/s. Their forces act at the wheels, so a braking main wheel below and ahead of the centre of gravity pitches the nose down: hard brakes with the tail light tip it over. Standing still the plane holds when friction can.
9. **Heading.** On the ground the wheels kill sideways slip, and below 6 m/s the plane pivots toward the wanted facing at 34 °/s. In the air the heading follows the air's track (unless the track points backwards, as over the top of a loop), and a facing change banks to 30° (rolling at 46 °/s, rolling out over the last 30° of turn): a level 180° at 50 kn takes about 18 s and drifts some 110 m along the view.

### Specs by feel

`PlaneSpec` is written in what a pilot feels; `coefficients(spec)` solves the rest so the plane meets it. Every probe uses the model's own force functions, quasi-static where the spec asks for a steady state, `step_plane` where it asks for a response.

| Feel field | Solves | How |
|------------|--------|-----|
| `stall_speed`, `flap_stall` | `cl_max`, `flap_cl` | 1 g at the curve's peak, analytic; `measure_stall` scans the curve |
| `glide` | `CD0` | best `L/D` over airspeed at idle, flaps up (`measure_glide`) |
| `climb`, `cruise` | `thrust`, `zero_thrust` | best steady climb at full throttle (`measure_climb`) and level speed at the Cruise detent, 0.75 (`measure_level`); nested bisection, three rounds with the glide since idle thrust feeds it |
| `trim_speed` | `Cm0` | zero elevator holds level flight at that speed |
| (stall reach) | `cm_elevator` | full back stick holds 2.3° past the peak, so the wing can be stalled |
| `pitch_rate` | pitch inertia | peak pitch rate in 2 s of full back stick from trimmed level flight (`measure_pitch_rate`); `cm_q` follows from a 0.55 damping ratio at the trim speed |
| `rollout` | brake friction | ground roll from touchdown at 1.05 × flap stall, idle, full flaps, stick back, half brakes (`measure_rollout`) |

`plane.test.ts` re-measures every feel number within 3 % and checks the hands-off takeoff (tail up, then airborne by itself), the stall's nose drop, the nose-over on hard brakes with the stick forward, and a 180° turn in the air.

### The trainer

A light taildragger, 600 kg, 10.7 m span, 16.6 m², fixed gear, three-point attitude 9.2°.

| Feel | Spec | Measured (Node) |
|---|---|---|
| Stall, flaps up / full | 18 / 16 m/s (35 / 31 kn) | 18.0 / 16.0 |
| Glide, idle | 8 : 1 | 8.0 |
| Best climb | 3 m/s | 3.0 m/s at 25.8 m/s (50 kn) |
| Cruise (0.75 throttle) | 34 m/s (66 kn) | 34.0; full throttle 39.6 m/s |
| Hands-off speed | 25 m/s | 25.0 |
| Peak pitch rate | 30 °/s | 30.0 |
| Roll-out, half brakes | 120 m | 120; full brakes, stick back 83 m |
| Take-off roll, full throttle hands off | not a spec | 149 m to 22.9 m/s (half flaps), 168 m to 24.9 m/s (flaps up) |
| Float in ground effect | not a spec | 50 m from 1.3 to 1.05 × flap stall |

Solved: `cl_max` 1.79, `flap_cl` 0.48, `CD0` 0.068 (plus 0.01 gear), static thrust 1.81 kN, zero-thrust speed 164 m/s, pitch inertia 2,490 kg·m², brake friction 0.2. Deriving takes 0.3–0.45 s in Node.

Yanked full back at idle from 25 m/s (Node, `step_plane`): the nose rises to 40°, the wing breaks past 21° angle of attack and runs on to 40° as the plane sinks, the nose falls through the horizon to −19° and it bottoms out 38 m below the top before it flies again, then repeats while the stick stays back. Let go after 6 s and it dives to −23° and levels out 81 m below the top. A firm touchdown bounces: the mains sit ahead of the centre of gravity, so the impact pitches the nose up (2.1 m/s down gives about 1.4 m/s back up), as on a real taildragger.

### Flight and grading

`advance` steps the plane and judges it. A landing is a wheel meeting the ground after at least 0.6 s with all wheels off it, so a hop on the takeoff roll isn't one. Its sink is the closing speed of the wheel that touched first, before the step:

| Grade | Sink |
|---|---|
| Kiss | < 0.6 m/s |
| Firm | < 1.5 m/s |
| Heavy | < 3 m/s |
| Hard (a crash) | ≥ 3 m/s |

Crashes: a hard landing, the prop tip below the ground (nose-over), a hull point below it (hit the ground), or the low wingtip in a bank. A crash shows its card and Enter (or the button) puts the plane back on the apron. The stall warning is the angle of attack within 3° of the peak with the wheels off the ground: a flashing Stall chip and the horn. ADR-098's "a stall below 20 m is a crash" belongs to round scoring and comes with the levels.

### The hub

`build_field()`: a 650 m runway from x = 0, the apron from −175 m, the hangar from −160 to −118 m, trees past both ends, a windsock. Rolling slowly inside the hangar opens its card: the plane picker (one plane for now; keys 1–9). Asphalt from the apron to the runway's end, grass elsewhere.

### Camera and drawing

Real scale. The span across the board's shorter side is `34 + 1.2 × min(h, 80) + 0.35 × max(0, h − 80)` metres of wheel height, at most 420, so the flare fills the view and a circuit at 100 m still shows the plane; the camera looks 1.2 s ahead and keeps the ground at about a third of the clear height below the middle until the plane is higher than that. A tall board (height over 1.3 × width, a phone held upright) starts the span at 26 instead of 34 and keeps the ground 0.14 of the clear height below the middle, so on the apron the plane is bigger and sits above the bottom edge instead of on it. Pinch, the wheel and + − zoom on top. The first-flight hint sits under the HUD, beside the approach profile (under it on a tall board), clear of the plane, and names the pitch direction of the current Pitch setting.

The plane is drawn from its body points projected through pitch, heading and bank, in the house style of the cars and boats: rounded fills in the player paint (corner cutting on a few written points), one `palette.edge` outline of 1.25 px (at least 3.5 cm) round the outside, `roof` for cowling and cheat line, `glass` windows, a `shadow` belly. Each part is a side outline swept across a lateral range (fuselage ±its half width, narrowing to the tail; each wing half from the root to its tip; tailplane, tyres), and the swept pieces of one part are wound one way and filled with nonzero, so side on they collapse to the profile and through a turn the fuselage shows its width and the wing its planform, banked. Far wing, strut pair, gear leg and tyre draw before the fuselage and the near ones after. Elevator and flaps are drawn at their actual deflection, swept across their span; a lowered flap is dark (`ink`) and at least 7 px long so it reads when zoomed out, and the HUD flaps chip carries a gauge of the actual flap travel. The prop is a disc on the projected hub axes that blurs with spool (edge-on side on, round head on). Trees are a trunk and a crown of three circles (or a stacked conifer, one in three) drawn as one outlined shape with a shaded underside; the hangar is a corrugated shed with a door and an office annex; the windsock is an orange and light striped sock on a pole; clouds are domes filled as one path so overlaps don't darken. Hills are a screen-space backdrop (a real-scale hill would fill the view when zoomed in) drifting at 0.08 and 0.25 px per metre; clouds sit at 220–900 m in the world. The approach profile, top right, maps 3 km either side of the runway and 0–300 m into a small box with 3° glidepaths to both ends. The HUD chip "Runway" gives the distance to the near end of the runway ahead when airborne.

### Controls

| Action | Keys | Touch | Mouse |
|---|---|---|---|
| Throttle | Shift / E up a notch, Ctrl / Q down (Idle, Quarter, Half, Cruise, Full) | the kit's `Lever`, left | |
| Pitch | W/S or ↑/↓: the stick moves at 2.5 /s while held, springs back at 5 /s | the pitch pad, right: drag from where the finger lands, back to centre on `lostpointercapture` | vertical drag on the board, released on `lostpointercapture` |
| Trim | T: trims for the current angle of attack (`elevator_for`) | Trim button | |
| Flaps | F down a notch, V up (Up, Half, Full) | Flaps ▲ ▼ | |
| Brakes | B held: ramps to full over 0.8 s | Brake, held | |
| Turn round | A/← face left, D/→ face right | ◀ ▶ | |
| Other | Esc pause, Enter resume or back to the apron, R apron, + − zoom | | wheel zoom |

Settings › Pitch: "Pilot", the default (W and ↑ push the stick forward, S and ↓ pull it back, dragging down pulls), or "Up is up" (W, ↑ and dragging up raise the nose). The window pauses when it loses focus.

### Sound

`Sounds`: the engine (sawtooth and square through a low-pass, pitch and gain from spool), wind (looped noise through a band-pass, gain with airspeed²), the stall horn, a tyre chirp on each touchdown, a crash. Off in Settings.

## Data

`/var/lib/apps/airfield/settings.json` through `storage.file` with a zod schema that falls back field by field: `plane`, `pitch` (`pilot` default | `game`), `sound`, `seen_hint`. No progress file until wave 3.

## Dependencies & licences

None beyond the repo's.

## Limits

- One plane, calm air, one field. STOL, airliner, glider, wind, gusts, shear and thermals are wave 2; levels, autopilot proof, par, random and daily are wave 3.
- No collisions with the hangar, trees or windsock: they are scenery.
- The roll axis is a scripted coordinated turn, not a model: no adverse yaw, no spin, no wing drop at the stall.
- Ctrl as throttle-down: Ctrl+W closes the browser tab, which a page can't stop; E and Q are there for that.
- The browser's frame loop splits frames into equal steps, so a flight isn't bit-identical to the Node probes.

## Decisions

[ADR-098](../adrs/098-airfield.md) and its 2026-11-07 revision note; [brainstorm](../brainstorm/2026-11-07_plane-sim.md).
