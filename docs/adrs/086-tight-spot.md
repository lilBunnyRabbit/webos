# ADR-086: Tight Spot
**Date:** 2026-10-28
**Status:** Implemented

## Context
The owner wants a top-down car parking simulator whose car behaves like a real one when the wheels turn, on generated maps that cover every parking situation ([brainstorm](../brainstorm/2026-10-28_tight-spot.md)). Later steps are a tilted 3D view, an infinite seeded world, drift physics, weather, AI traffic and other vehicles.

## Decision
- New user app `tight-spot`, drawn on a canvas.
- **Physics:** kinematic Ackermann model in SI units with a fixed 120 Hz step, pure and deterministic: rear-axle pivot, max steer angle, steering rate limit, gears P/R/N/D, throttle, brake and creep. One `step(car, input, dt)` entry so a dynamic model can replace it later.
- **Collision:** the car's rotated rectangle against convex polygons, separating-axis test, hand-written. Any contact ends the round.
- **World:** a chunk grid from a seed. `chunk(seed, cx, cy)` is pure and returns a road or lot chunk with bays, solids and exits that line up with neighbours. Scenario and level rounds use one lot chunk and its road; open lot uses 3 × 3 chunks.
- **Scenarios:** parallel, perpendicular (forward and reverse), angled, garage to the wall with a distance beeper, pillars, narrow two-sided aisle, tight garage door, dead-end turnaround.
- **Modes:** random scenario (pick a type or any) with a seeded daily, a levels ladder that unlocks, and an open lot.
- **Parked:** whole car inside the bay, within 5° of it, stopped, in P. Score is time and moves.
- **Controls:** keyboard on desktop; on touch a draggable steering wheel that holds its angle, gas and brake pedals and a gear toggle.
- **Storage:** bests, level unlocks and settings in app storage `app.tight-spot.*`; the daily through kit plays.
- **Shell:** nothing.
- Sim, world and drawing stay separate modules so the 3D view, infinite world and drift each replace one of them.

## Alternatives Considered
- Dynamic tyre model now, or blended with kinematic by speed: unstable near zero speed and costly to tune, no gain at parking speed.
- A road graph with lots: hard to stream for the infinite world.
- One generator per mode: the infinite world would rewrite them.
- Scrapes costing points instead of ending the round.
- `/var/lib/tight-spot/progress.json` for progress.

## Revision 2026-10-28 (implementation)
- **Daily.** Game Hub finds a daily game by a `daily` prop in its manifest, so Tight Spot has one (`daily: "YYYY-MM-DD"`, like every other daily game), ranked `SCORE_ASC` with moves as the score and time as the tie-break. No shell commands.
- **Dead end.** The car starts inside the street with bollards across its mouth behind it, so the turn has to happen in the dead end and not on the wider road. A lot layout can name its own start for this.
- **Solvability.** A hybrid A* planner (`planner.ts`, used only by tests) drives arcs at five steering angles up to full lock, forwards and back, from a parked pose in the bay out to the start with 5 cm of clearance; the reversed path gets in, since the model has no slip. Every scenario at three difficulties over 8 seeds, all 27 levels and every free bay of two open lots pass.
- **Parking sensors** work in every spot, not only the garage: the bumper the gear drives toward reads the strip the car would sweep.
- **Tuned within scope:** 32 m chunks, 8 m roads; angled bays are 6 m along their axis (the slanted ends cut a rectangle's corners); the hardest parallel gap is the car plus 1.3 m in a 2.3 m lane; the keyboard wheel self-centres as the car rolls by default, with a setting to make it stay.

## Revision 2026-10-28 (vehicles and a trailer)
Decided in [the vehicles brainstorm](../brainstorm/2026-10-28_tight-spot-vehicles.md). Implemented the same day.
- **Vehicles:** hatchback, hatchback + single-axle trailer, van, pickup, city bus, each a `VehicleSpec`. A kind declares the vehicles it allows and the round's seed picks one; bays size to it. Bests stay per kind. The open lot stays hatchback-only.
- **Trailer:** an optional `trailer` on `Car` (its heading and two wheels' roll) and an optional `TrailerSpec` on the spec, stepped with the standard one-trailer kinematics about a tow ball behind the rear axle. Collision tests both bodies; a hitch angle past ~70° is a jackknife and ends the round like a contact.
- **New kinds:** slipway and driveway (trailer), bus stop lay-by and depot (bus), and end bay: the last perpendicular bay in the corner of a narrow dead-end aisle, from the owner's sketch. Levels grow; Any and the daily include them.
- **Planner proof for trailer kinds:** a forward path from the parked pose out to the start, replayed in reverse into the bay within 5 cm and 1°.
- **Camera** zooms by vehicle length. **Shell:** still nothing.

## Revision 2026-10-28 (vehicles: implementation)
- **Levels: 42, not 39.** The end bay joined after the decision, so each of three laps is the nine car kinds, then bus stop, end bay, driveway, depot and slipway. A car level keeps the kind, difficulty and seed it had in the 27-level ladder, so levels 1–9 keep their numbers; old 10–18 are now 15–23 and old 19–27 are now 29–37. Stars are stored by level number, so a player's stars on old 10–27 now sit on other levels (`unlocked` stays valid: one past the highest parked). The seed now also picks the vehicle, so an old car level may come back as a van or a pickup.
- **Trailer start inside the lot.** A trailer spot names its own start (like the dead end), on the quay or the street just past the ramp or the gate, so a single reverse can get in; that's what makes a forward-only search from the bay a proof. The forward path must end with the trailer within 0.1 rad of straight, since a round starts with it straight.
- **Integration.** The trailer angle is integrated with RK4 in steps of at most 2.5 cm along the car's exact arc; the replay test holds to 5 cm and 1° with it.
- **Bus stop.** A 32 m lot has no room for a lay-by with tapers and cars at both ends, so it's a kerbside stop box with a parked car ahead and, harder, one across the street; the bus comes up from the road behind. Par 1 (the planner doesn't prove a forward-only entry).
- **Depot** starts the bus inside a yard with the gate shut, so it turns in the yard. **Pars:** bus stop 1, depot 1, driveway 2, slipway 2, end bay 2.
- **Camera:** 26 m across the short side × the rig's length over the hatchback's, capped at 1.6×.
- **Hits:** water and posts are new solid kinds ("the water", "a post"); a jackknife is `hit.kind = "jackknife"`, "Jackknifed the trailer".

## Consequences
- The first vehicle sim and polygon collision in the repo; they stay in the app until a second app needs them.
- Grid roads look like city blocks with 90° junctions.
- Chunk size and difficulty per level are tuned constants, not decisions.
