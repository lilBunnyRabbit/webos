# Harbour

ADR: [096](../adrs/096-harbour.md) · Decided: [brainstorm](../brainstorm/2026-11-06_harbour.md) · Code: `src/lib/apps/user/harbour/`

A top-down boat docking sim. A hub harbour you sail around with the real physics, gates that open levels, a boat shed that swaps the RIB and the yacht. Built on the play2d kit (`$kit/games/play2d`, `$kit/components/play2d`) that came out of Drive Hub; the boat model, contacts, judging and proof are the app's own.

## Where things are

| Area | Files |
|------|-------|
| Model | `core/boat.ts` (3-DOF body, `step_boat`, `coefficients`, the `measure_*` feel probes, hull outline), `core/boats.ts` (the two `BoatSpec`s, coefficients cached per boat) |
| World | `core/world.ts` (`Scene`, `Solid`, `Berth`, `SceneBuilder`, `alongside`, `box`), `core/levels.ts` (two layout builders, the 8 levels, `random_scene`), `core/hub.ts` (hub harbour, gates, shed, `crossed`) |
| Round | `core/contact.ts` (fender contacts, `grade`), `core/round.ts` (`advance`, docked rule, `lie`, `result`), `core/progress.ts` (files and bests) |
| Proof | `core/planner.ts` (hybrid A* over forward arcs), `core/autopilot.ts` (`prove`, `sail`, `par_of`), `core/rounds.ts` (`RoundRef`, `chart`, the daily), `core/chart.worker.ts` + `core/chart-job.ts` |
| Screen | `harbour.app.svelte` (hub and round state, loop, camera, cards), `frame.svelte` (toolbar, board, touch controls), `lever.svelte`, `settings-panel.svelte`, `core/draw.ts`, `core/helm.svelte.ts` (lever notch, wheel, keys), `core/sound.ts` |

## The boat model

State: world pose `x, y, heading` (the kit's `Pose`, heading clockwise on a y-down screen), world velocity `vx, vy`, yaw rate `r`, plus the drive train (`gear` −1/0/1, `power` 0–1, `shifting` seconds) and the actual `rudder` (−1…1 of lock).

Each step (`step_boat`, semi-implicit Euler at the frame loop's ≤ 1/120 s steps):

1. Drive train. The gear follows the lever's sign; ahead to astern drops to neutral and waits `gear_time` before the new gear goes in. Power approaches the lever's magnitude with time constant `engine_lag`. The rudder slews at `2 / rudder_time` per second.
2. Velocity into the body frame: surge `u`, sway `v` (to starboard). Calm water, so this is also the water-relative velocity; current and wind will enter here.
3. Forces in the body frame:
   - surge drag `−(Xu·u + Xuu·u|u|)`;
   - a two-point keel at ±0.3 L: each point's sway `v + r·x` gives `−½(Yv·vᵢ + Yvv·vᵢ|vᵢ|)`, summed into sway force and yaw moment, so yaw damping and the pivot point come out of the same two terms; plus a small extra `−Nr·r`;
   - thrust `gear · power · (ahead or astern thrust)`. A shaft boat pushes along the keel; an outboard turns the thrust by the rudder angle at `x = −0.45 L`, so it steers ahead, astern and from rest;
   - the rudder (or the outboard leg) at `−0.45 L`: side force `−C_r · sin δ · q` with `q = u|u|` (halved astern, so it's weak and reversed) plus the prop wash `wash · thrust share` going ahead; a quarter of that as drag by `sin² δ`, against the flow over the rudder (so it brakes astern too);
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
| `kick` | `wash` (shaft) or the outboard's lock | yaw rate after 1 s of full ahead from rest, full rudder (`measure_kick`); for the outboard the lock and `C_r` are solved in turn three times, since the leg is both |
| `walk` | prop walk share | stern's sideways drift in 3 s of full astern from rest (`measure_walk`), solved before `wash` because prop walk ahead adds a little yaw |

`boat.test.ts` re-measures every feel number on both derived boats within 4 %, plus the gearbox pause, the yacht's dead rudder at rest, the walk direction and the dead stop.

| | RIB | Yacht |
|---|---|---|
| L × B, mass | 4.5 × 2.0 m, 700 kg | 10 × 3.3 m, 5,500 kg |
| Drive | outboard (vectored, solved lock ≈ 18°) | shaft, spade rudder 35° |
| Top / astern | 3.0 / 1.8 m/s, 1.2 kN | 2.5 / 1.6 m/s, 2.0 kN |
| Carry, grip | 6 m, 4 | 18 m, 20 |
| Turn, kick, walk | 14 °/s, 32 °/s, 0 | 12 °/s, 7 °/s, 0.25 m |
| Lags | engine 0.3 s, gear 0.4 s, rudder 1.2 s | 0.5 s, 0.6 s, 2 s |

Deriving the RIB takes about 110 ms in Node, the yacht about 25 ms; each is derived once per window and once per chart worker.

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

Two builders scale with the boat: `alongside_level` (a long pontoon along the top of a basin, optional moored neighbours a gap apart) and `box_level` (fingers off a main pontoon, neighbours in the slots, optional boats across the fairway). Lengths are in boat lengths, floored for the short RIB (`max(L, 6)` for gaps, `max(L, 6.5)` for fairways), since the RIB turns wider for its length than the yacht. Moored boats are ~5 % bigger or smaller than yours. The 8 levels: Visitors' pontoon, Box berth, Come about, Between neighbours, Off the fairway, Short gap, Narrow fairway, Last space. `random_scene(spec, seed, attempt)` picks the kind and its numbers from `hash(seed, attempt)`.

The hub (`build_hub`) is a 150 × 100 m basin with quays, two decorative pontoons, piles, gates 1–8 in two rows and Random and Daily on the right, and the shed top left. Crossing a gate's line arms it; dropping under 0.3 m/s within 40 m opens its card and charts the round in the worker. Sailing into the shed swaps the boat and puts the new one at the shed's mouth; leaving the shed re-arms it. Coming back from a round puts you 9 m past that gate, heading away.

## Proof

`prove(scene, c)`, used by the tests on every fixed level for both boats and by `chart()` at run time for random and daily seeds:

1. **Room**: the hull's box grown by 0.15 m of fenders fits where it would lie docked.
2. **Path**: hybrid A* (`planner.ts`) over forward arcs (five steer shares) no tighter than 1.4 × the boat's steady radius at slow ahead with full wheel (RIB ≈ 5.6 m, yacht ≈ 7.2 m), the hull's box grown by a margin, to an approach pose: 2 L straight out of a box berth; for alongside, both directions at 35°, 45° and 25°, keeping only approaches whose straight leg clears everything but the berth's own pontoon.
3. **Autopilot** (`sail`): the real `advance`, pure pursuit on the path plus the last leg (look-ahead 0.5–1.4 L), the lever only on its seven detents, re-chosen every 0.25 s from a stopping-distance speed profile (≤ 0.4 × top speed, ≤ 0.25 + 0.03 × grip m/s inside 2.5 L of the berth). Stopped near the end at an angle, it kicks slow ahead against full rudder to swing the stern in. 240 s limit; a hard touch fails.

The first option that docks proves the level; its time is the par: `ceil(1.4 t + 8)` seconds. A seed tries up to 16 layouts. Measured in Node: fixed levels prove in 25–350 ms each, autopilot times about 50–85 s (RIB) and 58–121 s (yacht).

Like the forklift's par, charting runs in a worker (`chart-job.ts`) while the start card shows; Start waits for it.

## Controls

- Lever (default): W/↑ and S/↓ a notch, Space neutral; the notch stays. Hold (setting): W or S held gives half ahead or astern. Touch: the vertical `Lever` (pointer capture, `lostpointercapture` ends the drag; in Hold it springs back to neutral).
- Wheel: A/D or ←/→ at 1.25 a second, it stays; C centres. Touch: the kit's `SteeringWheel`.
- In a round, the first helm input casts off. Esc pauses, Enter starts or goes on, R retries.

## Drawing

All on theme tokens through `read_palette`: water `water` with drifting ripples (`glow`), quays `pavement`, pontoons `wood` with planks and an `ink` edge, moored boats in `cars` paints, yours in `player`, fenders `glow` squashed by the contact depth, a V wake from a ring buffer of stern points, prop wash behind the stern going ahead and along the hull going astern, the rudder or the outboard drawn at its angle, the berth dashed in `target` (`parked` once the lines are on), lines in `paint`, red and green gate buoys (`error`, `success`) with a dashed `guide` line and a board with the stars. Camera: the kit's `frame` with `view_span(length)`, looking 1.5 s ahead along the velocity; the start card fits the start and the berth.

## Persistence

`/var/lib/apps/harbour/settings.json` (boat, throttle mode, sound, hub hint seen) and `progress.json` (`{ version: 1, bests: { "level-3-yacht" | "random-rib" | "daily-2026-11-06": { stars, ms, perfect } } }`), both through `storage.file` with zod schemas that fall back field by field.

## Limits

- No wind, current, gusts, bow thruster, twin cruiser, stern-to, buoys or lines as tethers yet (ADR-096 P2, P3).
- The autopilot is slower than a good helm, so par is lenient; it can also fail where a person would succeed, which is why the level builders floor their numbers for the RIB.
- The browser's frame loop splits frames into equal steps, so a run isn't bit-identical to the Node proof.
- No gamepad.
