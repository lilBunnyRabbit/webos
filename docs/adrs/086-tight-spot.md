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

## Revision 2026-10-28 (vehicles: review)
- **Trailer proof from the real start.** The forward-only search above wasn't a proof: it stopped anywhere within 1.5 m and 30° of the start with the trailer up to 0.1 rad bent, and reversing from the round's real start (trailer straight) amplifies any difference, so the replay only showed that a car starting at the path's end could park. The planner now drives both ways with a trailer and keeps the hitch angle (in 11° steps) in its closed set, and the test searches from the car exactly as the round places it until the game's own judging (`parked_in`) calls it parked, then drives the moves again from that start and asserts no contact, no jackknife and the verdict "inside". Every fixed level goes the same way, whatever its vehicle. The seed sweeps of the car kinds keep the cheaper search out of the bay to near the start, sound only without a trailer; going from the start there too took the planner test from about 70 s to 180 s. The search's weight on its heuristic went from 2.5 to 4 to keep the whole test about that long. The `replay` helper and the 0.1 rad goal are gone.
- **Bus stop brief** says stop box, not lay-by.

## Revision 2026-10-28 (polish)
- **Steering ramp.** Held keys (and the touch ◀ ▶ buttons) turn the wheel at the steady rate for a tap or short hold, then ease up to 1.6×. The model's own cap is `STEER_BOOST` × the spec's steady rate, so the faster hold isn't clipped; hands-off caster centring stays at the steady rate.
- **Seed variety.** The dead end, end bay, depot, driveway and slipway take more from the seed (gaps, parked cars, start offsets, mirroring); their levels keep kind, difficulty and seed but changed layout. The car kinds' builders are untouched, so car levels keep theirs.
- **End bay** starts inside the lot, and its walls are thin lines on pavement instead of solid blocks. **Depot** starts the bus mid-yard.
- **Phone held sideways** folds the status bar into the HUD and tightens the toolbar (CSS container query on the app root).

## Revision 2026-10-28 (precision and vehicle picker)
Decided in the vehicles brainstorm's "Precision, vehicle choice and more rigs". Implemented the same day.
- **Precision formula.** Gaps are the shortest rays from any body corner to the bay outline along and across the bay's axis (the reverse axis for an `either` bay entered the other way). Side offset is half the difference of the side gaps, out of half their sum; depth the same along the axis; the angle is out of the 5° parking limit. Score `100 × Π(1 − e²)`, each share clamped to 0–1. Perfect is 95 % or more, rounded. Stars stay moves only.
- **Trailer rigs** are judged as one footprint: every corner of the car and the trailer counts for the gaps, and the angle is the worse of the two. Chosen over judging the trailer alone because both bodies have to be in the bay to park, and a car left crooked in front of a straight trailer isn't a precise park.
- **Bests** are keyed `kind:vehicle` and `open:vehicle`. Order stays moves, then time; the record gains an optional `precision`, the best seen on that key whichever run set it, so old records still validate.
- **Picker.** With Any spot the picker offers Any only: no vehicle is common to every kind. A kind with one vehicle shows it, fixed. Below the `@2xl` container size the toolbar can't hold three pickers and its buttons in a row, so the picker moves onto the start card there. The open lot's picker lists its four (hatchback, the default, then van, pickup, car and trailer) with no Any, so a player who never picks keeps the hatchback. The four fit the open lot's existing layouts through `Fit`; a planner test covers every free bay of two open lots in each car, and a fixed sample in the trailer (every lot kind, both rows), so the file stays near 30 s for the deploy gate. For the trailer, a reverse-only search out of the bay (a new `directions` option on the test-only planner) gives a forward path in, replayed from a straight trailer; two bays of 68 need the full search from the gate. Searching each bay from the round's real start took 15 minutes and missed one bay to the coarse grid, so the trailer's proof starts at the lot's gate with the trailer straight.
- **Achievement:** Perfect park (`perfect-park`), on a park of 95 % or more.

## Consequences
- The first vehicle sim and polygon collision in the repo; they stay in the app until a second app needs them.
- Grid roads look like city blocks with 90° junctions.
- Chunk size and difficulty per level are tuned constants, not decisions.
