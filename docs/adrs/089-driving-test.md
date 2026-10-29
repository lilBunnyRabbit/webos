# ADR-089: Drive Hub Driving Test
**Date:** 2026-10-29
**Status:** Implemented

## Context
The owner's favourite planned game: a driving exam in a town. Drive Hub's core is kinematic and has no roads with lanes, no indicators and no speed limit on steering. Discussion: `docs/brainstorm/2026-10-29_driving-test.md`.

## Decision
- A new game `test` (Driving Test, building Test Centre) in `games/test/`, on a hand-made town stored as data: a lane graph with junctions, one roundabout, lights, signs, markings and parked cars.
- Generic EU signs, right-hand traffic, a minor/serious/dangerous fault scheme with a pass/fail sheet; faults are pure checks over the drive and the town.
- `core/grip.ts` (moved from Hot Lap): an opt-in cap on steering by speed, curvature at most a_lat / v², zero effect at parking speeds.
- `Input` gains a turn signal that self-cancels; keys Z and X (crab moves to V), pad D-pad, two touch buttons, a tick, blinkers on every vehicle.
- The examiner speaks through the speech service and shows a bubble.
- No moving traffic in the first cut; AI traffic is a later revision.

## Alternatives Considered
- A core road model or a generated town: one user today; generated towns are hard to make readable.
- Grip inside `step()` for every vehicle: changes every game and every parking proof.
- Indicators owned by the test: blinkers in one game only, redone when another wants them.
- A real country's test: the owner chose generic signs and the UK-style fault scheme.

## Consequences
- Core grows two small pieces (grip, signal) that other games may use.
- False faults kill the game, so a scripted clean drive of every route is the test that guards it.
- Mobile gets a fifth control (the indicator buttons); landscape is suggested, not required.

## Revision 2026-10-29: build calls

- **Signals in `Input`** are an optional `signal` field; `step` ignores it. `DriveInput` keeps the stalk and self-cancels it when the wheel, having turned more than 0.3 of lock toward the signalled side, comes back under 0.05 (`core/signal.ts`). The touch buttons are opt-in through a `signals` prop on `drive-frame.svelte`; held sideways they sit beside the wheel, clear of the HUD. The D-pad sends Z and X. Blinkers draw from `player(…, time, signal)`, so a game shows them only by passing its signal.
- **A signal counts if it showed for 0.7 s in the last 6 s** before the line, not only at the line: a stalk that cancelled itself on a roundabout's entry curve still counts at the exit.
- **The test car** is the hatchback with `max_forward` raised to 20 m/s; the stock hatchback tops out at 30 km/h, under every limit.
- **The car park is one lane** of the graph between two driveway junctions, a free zone for the lane checks; the proof parks forward and drives on through the empty bay behind. The player may park either way round.
- **Leaving the route stops the test** (no result saved) rather than re-routing; driving into the one-way street the wrong way adds a serious no-entry fault. Hitting a parked car or a building is a dangerous fault and ends it.
- **Give way** is judged by speed alone (under 4.5 m/s in the last 6 m) while there is no traffic; stop signs need a standstill.
- **Saved data**: `test.json` in the app data folder, the best result per route (a pass, then fewer serious, fewer minors, quicker).


## Revision 2026-10-29 (accepted: speed-limited steering for every vehicle)
Owner: "lets introduce the high speed slower wheel rotation everywhere? gt car in yard is chaos", then "the high speed part wont have any impact on the slow cars so thats fine". Superseding "games opt in" above: `step()` caps the steering by speed for every Ackermann and frame-steer vehicle, from an optional `VehicleSpec.a_lat` (a default of about 7 m/s² when absent); skid steer is exempt. Hot Lap's race spec and the test car carry their own `a_lat`; `core/grip.ts`'s opt-in helper folds into `step()`. Below the speed where full lock is allowed (about 20 km/h for a hatchback) nothing changes, so planner proofs are unaffected (the planner works on geometry).

## Revision 2026-10-29: fairness fixes

- **A limit starts at its sign.** A lower limit applies from where its sign stands; until then the old one holds. A higher limit applies as the car leaves the lower zone at the junction, so leaving the car park takes the road's limit at the gate. Each route carries its limit zones (`limits`, `limit_at`); the lanes' own limits only place them.
- **A prompt may come before a junction on the way**, at the usual lead, and a signal for the turn asked for is no fault going straight through that junction. Holding every prompt until the intervening junction is cleared would leave 23 m to signal and slow on Market (B before the car park). The exception: when that junction has a way in on the turn's side (Q1, the car park's exit gate, before the entry at Q2), the prompt waits until the car is through it. The exit gate has no-entry signs.
- **Lines are judged at the front bumper**: the stop line on red, the stop and give-way approach zones, signals at the line, and the distance to a line when stopped. A car waiting at red within 15 m of the line is queueing, not hesitating.
- **The proof driver knows only what a player could**: the limit on the last sign passed, the bends and lines ahead, and the turn the examiner has asked for, signalled as soon as it's spoken. It drives every route clean at 0.9, 1 and 1.08 of the limits.

## Revision 2026-10-29 (accepted: only fast cars are capped)
Owner, after the previous revision: "ah no i dont like slow turning for normal cars. lets just do it for gt and f1". `step()` caps steering by speed only for a vehicle whose spec sets `a_lat`: the GT car, the F1 car and Hot Lap's race spec. Every other vehicle, the Driving Test car included, turns as before at any speed.
Built (adbd4a6c): `VehicleSpec.a_lat` is optional with no default; `step()` caps only the steering target (the wheel winds down at its normal rate). Values: GT car 16 (first 8, too locked at speed for the owner), garage F1 12, Hot Lap's race spec 25. Frame steer caps the bend where the axle on the joint's shorter arm reaches the limit; skid steer and crab mode are exempt. `core/grip.ts` is gone; `top_speed` moved to `core/vehicle.ts`.
