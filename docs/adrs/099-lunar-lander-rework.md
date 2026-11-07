# ADR-099: Lunar Lander rework and the play2d rounds kit
**Date:** 2026-11-07
**Status:** Accepted

## Context
Lunar Lander is an arcade toy (400×250 units, on/off thrusters, one pad, a points score). Harbour (ADR-096) and Airfield (ADR-098) set the house pattern for sims: a feel spec solved into coefficients, graded contacts, a hub with a picker, an autopilot proof setting par, random rounds and a Game Hub daily. The owner wants the lander brought to that pattern ([brainstorm](../brainstorm/2026-11-07_lunar-lander-rework.md)). Harbour and Airfield each carry near-copies of the round pieces; the lander would be their third user.

## Decision

### In place
The id `lunar-lander` stays.
- Progress moves from `storage.json` to `progress.json` in `/var/lib/apps/lunar-lander/`. Old points bests are dropped.
- The six achievement ids are kept, with their conditions re-mapped to the new game.
- The app is `experimental: true` (ADR-097) until it has been tuned by feel.

### Model
`core/lander.ts` is a pure step of a 3-DOF rigid body (x, y, angle) in metres under real gravity:
- **Bodies:** Moon 1.62, Mars 3.71 with thin air and gusts, Earth 9.81 with air and wind.
- **Engines:** the main engine is variable on a throttle with a short spool. RCS is real torque.
- **Contacts:** the legs are spring-damper contacts; the hull or rock is a crash.
- **Solver:** each ship is a feel spec: hover throttle per body, peak spin rate, safe touchdown limits, and the tank in seconds of hover. `coefficients()` solves it, and `measure_*` tests check it.
- **Ships:** the lander (main + RCS), the twin pods (differential, split by A/D) and the shuttle.

### Campaign
- One linear campaign of missions across bodies and ships: pad landings, cargo and hops (mass changes mid-mission), and caves and hazards.
- **Stars:** done, gentle (one kiss touchdown) and under par time. Par is `ceil(1.4 × autopilot + 8)`.
- The next mission opens after the one before.
- Missions unlock ships for free flight.
- A seeded random mission and a daily ranked by time.

### Base
A side-view base you fly around:
- pads as mission gates, and a hangar as the picker;
- free flight with any unlocked ship and any body;
- the old air, wind and infinite-fuel switches as free-flight settings.

### Controls
- **Desktop:** W/S or Shift/Ctrl move the kit `Lever`, which has detents including Hover. A/D rotate. Space is a full burn while held.
- **Touch:** the lever on the left, rotate controls on the right.

### Kit: play2d rounds
Before the rework, a `refactor:` moves the round pieces Harbour and Airfield both carry into the play2d kit (`$kit/games/play2d/`), with both apps rewired and their tests unchanged:
- the round ref, chart and daily ref;
- the chart worker and chart job;
- the progress `better` and bests helpers;
- the sound base (`audio()`, `noise()`).

Anything app-specific stays in the apps.

## Alternatives Considered
- **A new app id.** Rejected: two store entries, and existing unlocks would be lost.
- **Keeping arcade units and on/off thrust.** Rejected: it breaks the real-numbers style of the other sims, and hovering becomes tapping.
- **Per-body or per-ship tracks.** Rejected: the owner wants a mixed campaign.
- **Fuel as par.** Rejected: the kit daily ranks by time.
- **A third copy of the round files.** Rejected: copies drift, and the repo rule says a second user moves code to the kit.

## Consequences
- The kit refactor touches two shipped apps; their proofs and tests must stay green bit for bit.
- Proof is fragile to retunes, so margins start wide (the Harbour and Airfield lesson).
- New page `docs/apps/lunar-lander.md` and its CLAUDE.md row. The `persistence.md` row for the lander is updated.
- Deorbit and descent missions wait for a later session.
