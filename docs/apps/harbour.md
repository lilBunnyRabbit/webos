# Harbour

ADR: [096](../adrs/096-harbour.md) · Decided: [brainstorm](../brainstorm/2026-11-06_harbour.md) · Code: `src/lib/apps/user/harbour/`

A top-down boat docking sim. A hub harbour you sail around with the real physics, gates that open levels, a boat shed where you pick the RIB, the yacht or the cargo coaster. Built on the play2d kit (`$kit/games/play2d`, `$kit/components/play2d`) that came out of Drive Hub; the boat model, contacts, judging and proof are the app's own. Released as experimental (`experimental: true` in `meta.ts`, [ADR-097](../adrs/097-experimental-apps.md)) while the handling is tuned; graduating deletes that line.

## Where things are

| Area | Files |
|------|-------|
| Model | `core/boat.ts` (3-DOF body, `step_boat`, `coefficients`, the `measure_*` feel probes, hull outline), `core/boats.ts` (the two `BoatSpec`s, coefficients cached per boat) |
| World | `core/world.ts` (`Scene`, `Solid`, `Berth`, `SceneBuilder`, `alongside`, `box`), `core/levels.ts` (two layout builders, the 8 levels, `random_scene`), `core/hub.ts` (hub harbour, gates, shed, `crossed`) |
| Round | `core/contact.ts` (fender contacts, `grade`), `core/round.ts` (`advance`, docked rule, `lie`, `result`), `core/progress.ts` (files; bests keep a Perfect on top of the kit's `better`) |
| Proof | `core/planner.ts` (hybrid A* over forward arcs), `core/autopilot.ts` (`prove`, `sail`), `core/rounds.ts` (the boat's `RoundRef`, `chart`, the daily, on `$kit/games/play2d/rounds`), `core/chart.worker.ts` (the kit's `serve_chart`; `work_out_chart` from `$kit/games/play2d/chart-job`) |
| Screen | `harbour.app.svelte` (hub and round state, loop, camera, cards), `frame.svelte` (toolbar, board, touch controls; the kit's `Lever` with the boat's detents from `core/lever.ts`), `settings-panel.svelte`, `core/draw.ts`, `core/helm.svelte.ts` (lever notch, wheel, keys), `core/sound.ts` (on the kit's `GameSounds`) |

## The boat model

State: world pose `x, y, heading` (the kit's `Pose`, heading clockwise on a y-down screen), world velocity `vx, vy`, yaw rate `r`, plus the drive train (`gear` −1/0/1, `power` 0–1, `shifting` seconds) and the actual `rudder` (−1…1 of lock).

Each step (`step_boat`, semi-implicit Euler at the frame loop's ≤ 1/120 s steps):

1. Drive train. The gear follows the lever's sign; ahead to astern drops to neutral and waits `gear_time` before the new gear goes in. Power approaches the lever's magnitude with time constant `engine_lag`. The rudder slews at `2 / rudder_time` per second.
2. Velocity into the body frame: surge `u`, sway `v` (to starboard). Calm water, so this is also the water-relative velocity; current and wind will enter here.
3. Forces in the body frame:
   - surge drag `−(Xu·u + Xuu·u|u|)`;
   - a two-point keel at ±0.3 L: each point's sway `v + r·x` gives `−wᵢ(Yv·vᵢ + Yvv·vᵢ|vᵢ|)`, summed into sway force and yaw moment, so yaw damping and the pivot point come out of the same two terms; plus a small extra `−Nr·r`. The weights are ½ ± 0.15·tanh(u / 0.3), the leading point heavier: the pivot point moves forward going ahead and aft going astern, the turn builds over a second or two and carries on once the wheel comes back;
   - the steering angle `δ = lock · x(0.35 + 0.65|x|)` for a rudder share `x` (`steer_angle`): progressive, since quadratic cross-flow damping alone made a tenth of the wheel turn a sixth as tight as full lock;
   - thrust `gear · power · (ahead or astern thrust)`. A shaft boat pushes along the keel; an outboard turns the thrust by `δ` at `x = −0.45 L`, so it steers ahead, astern and from rest;
   - thrusters (the coaster): each spools toward its input with the spec's `lag` and pushes `thruster · fade(u)` sideways at ±0.45 L; `fade` is 1 up to 1 m/s and 0 from 2.6 m/s. The boat doesn't settle to a stop while one runs;
   - the rudder (or the outboard leg) at `−0.45 L`: side force `−C_r · sin δ · q` with `q = u|u|` plus `wash · thrust share`: the prop's wash going ahead, and astern its suction drawing water aft-to-fore across the rudder at the same share (negative), which is what lets a shaft boat steer backing out. Going ahead on astern thrust the suction works against the flow, so braking with the wheel over weakens the rudder or turns it the other way. A tenth of that as drag by `sin² δ`, against the flow over the rudder (so it brakes astern too);
   - prop walk: astern `−walk · |T|` sideways at the prop (ahead 3 % of that the other way), fading out by 1.2 m/s: the stern walks to port;
   - an outside push (contacts) rotated into the body frame.
4. Accelerations over the effective masses `m(1 + added.surge)`, `m(1 + added.sway)`, `I = m(0.25 L)²(1 + added.yaw)`, rotated back to the world, velocity first, then pose.
5. Settling: with no power and below 0.15 m/s velocity and yaw decay at 0.35 /s, and below 0.02 m/s and 0.5 °/s with no contact the boat stops dead. Linear drag alone leaves a boat creeping for a minute, and "stopped" never comes.

### Specs by feel

`BoatSpec` is written in what a helm feels; `coefficients(spec)` solves the constants so the boat meets them. Every probe runs the real `step_boat`.

| Feel field | Solves | How |
|------------|--------|-----|
| `top_speed`, `thrust` | `Xu`, `Xuu` | `Xu·U + Xuu·U² = thrust`, the split bisected so the coast from 1 to 0.1 m/s (`measure_carry`) equals `carry` |
| `astern_speed` | astern thrust | drag at that speed |
| `grip` | `Yv`, `Yvv` | `grip × Xu`, `grip × Xuu` |
| `turn_rate` | `C_r` | steady yaw at 1 m/s held, full rudder, no thrust (`measure_turn`) |
| `kick` | `wash` (shaft) or the outboard's `Nr` | yaw rate after 1 s of full ahead from rest, full rudder (`measure_kick`); the outboard swings to its full lock, so its `Nr` and `C_r` are solved in turn three times |
| `thrusters.turn` | thruster force | steady yaw at rest, bow full to starboard and stern full to port (`measure_thrusters`) |
| `walk` | prop walk share | stern's sideways drift in 3 s of full astern from rest (`measure_walk`), solved before `wash` because prop walk ahead adds a little yaw |

`boat.test.ts` re-measures every feel number on the three derived boats within 4 %, checks that a tenth of the wheel at slow ahead turns wider than 5 L, plus the gearbox pause, the yacht's dead rudder at rest, the walk direction and the dead stop.

| | RIB | Yacht | Coaster |
|---|---|---|---|
| L × B, mass | 4.5 × 2.0 m, 700 kg | 10 × 3.3 m, 5,500 kg | 45 × 8.5 m, 800 t |
| Drive | outboard, vectored, 35° | shaft, spade rudder 35° | shaft, rudder 35°, bow and stern thrusters |
| Top / astern | 3.0 / 1.8 m/s, 850 N | 2.5 / 1.6 m/s, 1.5 kN | 4.0 / 2.4 m/s, 45 kN |
| Carry, grip | 10 m, 9 | 35 m, 30 | 200 m, 110 |
| Turn, kick, walk | 7 °/s, 22 °/s, 0 | 1.8 °/s, 8 °/s, 0.25 m | 0.35 °/s, 0.8 °/s, 0.15 m |
| Lags | engine 0.3 s, gear 0.4 s, rudder 2.4 s | 0.5 s, 0.6 s, 3 s | 2.5 s, 3 s, 12 s |
| Thrusters | | | 3 °/s at rest, spool 1.5 s |

The glide retune (2026-11-07) lowered thrust, lengthened the carry and loosened the grip; top and astern speeds, turn rate, kick, walk and the lags stayed. What that gives (steady radius in lengths, slow / full ahead): full lock 1.2 / 1.0 (RIB), 1.0 / 0.9 (yacht), 1.1 / 0.7 (coaster); a tenth of the wheel 10 / 7, 8 / 7, 17 / 10. Full astern from full ahead stops the RIB in 1.2 L (5 s), the yacht in 1.5 L (15 s) and the coaster in 4.0 L (111 s).

Deriving a boat takes 25–150 ms in Node; each is derived once per window and once per chart worker.

## Contacts

`contacts()` runs before each step: a bounds check, then `penetration` (the kit's SAT minimum translation vector) of the hull against every solid. Per touching solid:

- a spring-damper along the normal at the contact point: `k = mx·ω²` (ω 4 rad/s on fenders, 8 on hard sides), damping ratio 0.6 on fenders, 0.25 on hard sides, so a big boat isn't bouncier than a small one; the force never pulls;
- sliding friction 0.3 of the normal force, smoothed over 0.05 m/s;
- force and torque `(p − c) × F` into the step's push, so a touch at the bow swings the stern.

A touch is graded once, when it begins (the solid wasn't touching last step), by the normal approach speed of the contact point: under 0.15 m/s a **kiss**, under 0.5 a **bump**, else **hard**. Quay walls, piles and moored boats (`fendered: false`) halve both limits. A hard touch ends a round; in the hub nothing ends.

## Docked rule and scoring

Every step the round checks `docked_now`: speed under 0.1 m/s, yaw under 1 °/s, within 8° of the berth's heading (either way alongside), and in the berth:

- **box**: every hull point inside the berth polygon (5 cm slack); precision is the kit's `fit()` with the 8° angle;
- **alongside**: 21 rays along the pontoon face, each from 0.6 m inside the pontoon outward; the share whose first hit on the hull is within 0.3 m of the face must reach 70 %. Precision is `100 × Π(1 − e²)` over the mean gap (of 0.3 m), the offset along the berth (of a quarter of its length) and the angle (of 8°). The berth is 0.75 L long, so the straight run of the hull can cover 70 % with some slack.

Held for 1 s (`DOCK_HOLD`), the lines go on for 1.2 s and the round is done. Stars: docked, gentle (every touch a kiss), on time (at or under par). Precision ≥ 95 % is Perfect. Bests are more stars, then a faster time; a Perfect is kept once earned. The daily goes to Game Hub ranked `SCORE_ASC` on stars lost, ties by time.

## Levels and the hub

Two builders scale with the boat: `alongside_level` (a long pontoon along the top of a basin, optional moored neighbours a gap apart) and `box_level` (fingers off a main pontoon, neighbours in the slots, optional boats across the fairway). Gaps and fairways are given in units of `max(L, 1.2 × R)`, R the boat's steady turn at slow ahead with full wheel (`turn_radius`, thrusters helping for the coaster): the RIB and the yacht turn wider than a length, so their units grow. Start distances and the basin's depth use a unit of `min(L, 20 m)`, so a coaster isn't sent half a kilometre; along an alongside pontoon the start stays in lengths, so the coaster runs straight in. A box slot's clearance grows with a beam over 3.3 m. Moored boats are ~5 % bigger or smaller than yours. The 8 levels: Visitors' pontoon, Box berth, Come about, Between neighbours, Off the fairway, Short gap, Narrow fairway, Last space. `random_scene(spec, seed, attempt)` picks the kind and its numbers from `hash(seed, attempt)`.

The hub (`build_hub(scale)`, `hub_scale(L) = max(1, L / 10)`) is a 150 × 100 m basin for the RIB and the yacht, everything grown 4.5× for the coaster (quays, pontoons, moored boats, buoys, gates, the shed, the 40 m card radius and the 9 m return) with quays, two decorative pontoons, piles, gates 1–8 in two rows and Random and Daily on the right, and the shed top left. Crossing a gate's line arms it; dropping under 0.3 m/s within 40 m opens its card and charts the round in the worker. Inside the shed a Boat shed card lists the three boats (buttons, or 1–3 on keys); picking one puts it at the shed's mouth, still inside, so the card stays until you sail out. Coming back from a round puts you 9 m past that gate, heading away.

## Proof

`prove(scene, c)`, used by the tests on every fixed level for both boats and by `chart()` at run time for random and daily seeds:

1. **Room**: the hull's box grown by 0.15 m of fenders fits where it would lie docked.
2. **Path**: hybrid A* (`planner.ts`) over forward arcs (five steer shares) no tighter than 1.15 × the steady radius (RIB ≈ 6.1 m, yacht ≈ 11 m, coaster ≈ 5 m with thrusters), the hull's box grown by `max(0.3, 0.15 B, 0.05 L)`, arriving within `max(1.2, 0.175 R')` m (half a planner step, R' the planned radius) and 12° of an approach pose, with 40,000 × max(1, L / 10) expansions: 1.5 L straight out of a box berth; for alongside, both directions at 35°, 45° and 25°, keeping only approaches whose straight leg clears everything but the berth's own pontoon. A boat with thrusters approaches alongside parallel instead, a beam and 8 m off, 1.4 L before abeam of its berth.
3. **Autopilot** (`sail`): the real `advance`, pure pursuit on the path plus the last leg (look-ahead 0.5–1.4 L), the lever only on its seven detents, re-chosen every 0.25 s from a stopping-distance speed profile (≤ 0.4 × top speed, at most 1.1 m/s; braking at `min(0.03, ½ astern thrust / mass)`; inside 2.5 L of the berth ≤ `min(0.85, 0.2 + 0.065 L)` m/s, 0.5 with thrusters). Stopped near the end at an angle, a boat without thrusters kicks slow ahead against full rudder to swing the stern in. A boat with thrusters turns with them (bow with the wheel, stern against it), holds the berth's axis on them for the last 2 L, and alongside stops abeam and crabs in: both thrusters push it sideways at up to 0.4 m/s, easing to a kiss, while differential thrust holds the heading and the lever holds its place along the berth. 240 s × max(1, L / 10) limit; a hard touch fails.

Options run shortest path first; the first that docks proves the level, and its time is the par: `ceil(1.4 t + 8)` seconds. When none docks, the paths are planned again at 1.3 and then 1.5 × the steady radius: a gliding boat coasting in neutral turns wider than it does under slow ahead (the RIB's outboard barely steers without thrust), so pure pursuit can run wide of a tight plan. A seed tries up to 16 layouts. Measured in Node: autopilot times about 43–94 s (RIB), 56–124 s (yacht) and 233–399 s (coaster); the daily stays RIB or yacht, picked by the seed.

| Par, s | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| RIB | 80 | 68 | 104 | 140 | 88 | 126 | 89 | 85 |
| Yacht | 117 | 87 | 181 | 115 | 143 | 180 | 145 | 144 |
| Coaster | 567 | 334 | 565 | 565 | 411 | 531 | 404 | 404 |

Like the forklift's par, charting runs in a worker (the kit's `work_out_chart`) while the start card shows; Start waits for it.

## Controls

- Lever (default): W/↑ and S/↓ a notch, Space neutral; the notch stays. Hold (setting): W or S held gives half ahead or astern. Touch: the vertical `Lever` (pointer capture, `lostpointercapture` ends the drag; in Hold it springs back to neutral).
- Wheel: A/D or ←/→ at 0.7 a second, it stays; C centres. Touch: the kit's `SteeringWheel`. The rudder follows at its own rate (`rudder_time`); a HUD chip shows its actual angle.
- Thrusters (boats that have them): Q/E push the bow to port or starboard, Z/X the stern, while held. Touch: a pad of four hold buttons between the wheel and the lever (pointer capture, `lostpointercapture` lets go); a HUD chip shows which are pushing.
- In a round, the first helm input casts off. Esc pauses, Enter starts or goes on, R retries.

## Drawing

All on theme tokens through `read_palette`: water `water` with drifting ripples (`glow`), quays `pavement`, pontoons `wood` with planks and an `ink` edge, moored boats in `cars` paints, yours in `player`, fenders `glow` squashed by the contact depth, a V wake from a ring buffer of stern points, prop wash behind the stern going ahead and along the hull going astern, the rudder drawn at its angle and the outboard on the transom with its wash turning with the leg, a bow wave that opens with speed, a slight heel into the turn (shadow out, deck in; drawn only), the coaster with hatches, bridge, funnel and thruster jets on the side away from the push, the berth dashed in `target` (`parked` once the lines are on), lines in `paint`, red and green gate buoys (`error`, `success`) with a dashed `guide` line and a board with the stars. Camera: the kit's `frame` with `max(view_span(length), 2.4 L)`, looking 1.5 s ahead along the velocity; the start card fits the start and the berth.

## Persistence

`/var/lib/apps/harbour/settings.json` (boat, throttle mode, sound, hub hint seen) and `progress.json` (`{ version: 1, bests: { "level-3-yacht" | "random-rib" | "daily-2026-11-06": { stars, ms, perfect } } }`), both through `storage.file` with zod schemas that fall back field by field.

## Limits

- No wind, current, gusts, twin cruiser, stern-to, buoys or lines as tethers yet (ADR-096 P2, P3). The coaster is not in the daily.
- The autopilot is slower than a good helm, so par is lenient; it can also fail where a person would succeed, which is why the levels size their gaps and fairways from the turning circle. The coaster's pars run 5–11 minutes: it is slow to start, slow to stop and crabs the last stretch.
- The browser's frame loop splits frames into equal steps, so a run isn't bit-identical to the Node proof.
- No gamepad.
