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

