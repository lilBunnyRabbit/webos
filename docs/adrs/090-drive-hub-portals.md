# ADR-090: Drive Hub portals (multi-floor garages)
**Date:** 2026-10-29
**Status:** Accepted

## Context
Owner: "maybe even multiple floors - all in one canvas with 'teleportation'". Underground garages are being added to Tight Spot and the shared open lot (`docs/brainstorm/2026-10-29_drive-hub-wave-3.md`). A top-down world has no heights, so a garage with several floors needs floors laid out apart and a way for a car to pass between them. `core/scene.ts` has no such idea; the planner and the proofs know one connected plane.

## Decision
- `core/scene.ts` gains `Portal`: a mouth polygon and a rigid transform from the mouth's frame to the exit's frame. A world may carry `portals`.
- A shared `pass_portals(car, portals)` runs after `step()`: when the vehicle's reference point crosses a mouth, the whole rig (trailers included) is moved by the transform, keeping speed, gear, steering and hitch angles. Games opt in by calling it.
- The planner treats a portal as an edge: a pose that enters a mouth continues from its transformed pose, so proofs cross floors.
- Floors are drawn side by side on one canvas, labelled (−1, −2, …); the camera follows the car through a ramp with a short fade; the overview shows every floor.
- First users: Tight Spot's underground garage kind and the open lot's garage chunk, extended to several floors.

## Alternatives Considered
- Portals owned by Tight Spot only: the open lot and Valet couldn't have floors; the logic isn't reusable for lifts or ferries later.
- One floor shown at a time: the player can't plan across floors.
- A single floor first, decide later: delays the idea the owner asked for.

## Consequences
- Core and the planner change; every proof that uses a world with portals must cross them.
- Collision only ever looks at one floor's solids, since floors don't overlap on the canvas.
- A rig longer than a ramp is split across two floors while passing; collision checks both ends' floors (the build must handle it or keep mouths long enough that it can't happen).

## Revision 2026-10-29 (details decided)
- **Where:** a Tight Spot "Multi-storey" spot kind (enter at ground, drive to a bay one to three floors away; Spots, Any, the daily, not the level ladder); the open lot's garage chunk gains floors, so Valet can park customers below (longer walk back); the town's car park building becomes a real multi-storey to drive round in free play (after the town lands).
- **Links:** straight ramps, plus a spiral helix in bigger garages (a portal per turn of the helix).
- **Layout:** floors side by side in one row (−1, −2, −3 left to right, labelled), each ramp's exit at the same spot on the next floor.
- **Rigs:** cars and vans only (a height-limit sign at the entry); nothing straddles two floors, so collision stays per floor.
