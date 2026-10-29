# ADR-089: Drive Hub Driving Test
**Date:** 2026-10-29
**Status:** Accepted

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
