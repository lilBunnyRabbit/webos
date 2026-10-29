# ADR-090: Drive Hub portals (multi-floor garages)
**Date:** 2026-10-29
**Status:** Implemented

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

## Revision 2026-10-29 (built)
Owner's intent, given during the build: "the point of the garage is to have really tight corners and all. especially going in the new floor you often have the ramp and the sharp turn in the end needed to not bump into cars in front. really looking for that claustrophobic feeling", and "with walls everywhere". What the build decided within scope ([Drive Hub](../apps/tight-spot.md#portals), [Multi-storey garage](../apps/tight-spot.md#multi-storey-garage)):
- **Mouth semantics.** A mouth is a strip just past the crossed line, deeper than a step; the portal fires when the reference point is inside it while moving within 90° of its heading (by the sign of `speed`, or the move's distance in the planner). A ramp is two portals, one each way, a strip apart. `pass_portals` returns the same car object when nothing was passed, which is how the games count passes for the camera cut.
- **Planner.** Each node carries the goal through the portals its path passed, so the heuristic sees the floors as joined; `to` is given as seen from the start's floor. Proofs plan a floor at a time (`route()` over chunks and portals, a leg to just short of each mouth, the heading weight off) because one search is led into the wall between floors. A portal may name `lead` poses (optional, a search aims at each in turn): the helix's bottom and side, without which the leg to the helix's top took 150 000 expansions.
- **Layout.** Floor −1 is the lot chunk; −2 and −3 are `ChunkKind.FLOOR` chunks beside it (Tight Spot: east, the open lot: outward from the crossroads, so a west corner's floor −2 is to its left). −1 has its aisle north, −2 and −3 south. The straight ramp runs along the west wall between −1 and −2 with its mouth halfway between the two aisles; three-floor garages add a helix round a stair core in the middle of −2 and −3, one portal per turn at its top. Lane ends that open onto an aisle are cut at 45° (1.2 m): square ends left no car able to turn into a 3.5 m lane.
- **Headroom.** `Layout.headroom` / `World.headroom` are the bars at a garage's way in: drawn over the cars, solid only to a vehicle the game says is too tall (Valet's bus). `under_headroom(spec)` decides who gets floors: no trailer, no forks, Ackermann steering, no bigger or wider-turning than the van. The open lot's trailer and F1 car keep the single-floor garage.
- **Tightness.** Owner: "with parking im really looking for difficulty". Difficulty 1 is the tightest the proofs still solve: Multi-storey aisles 6.1 → 4.4 m, lanes 3.8 → 3.1 m, bays 2.7 → 2.5 m with a 0.4 → 0.5 m pillar on both lines, for the hatchback, city car and SUV (no van: tighter with fewer vehicles); the Underground spot 6.2 → 4.8 m aisles and 2.8 → 2.55 m bays with a walled lane in from the gate (its five vehicles still pass at 1, sized by their turning circles). The open lot's garage stays at its usual difficulty 0.3: it's Valet's timed lot with every free bay a target, and before floor −2 lost the row at the ramp's foot (now wall) and every row's end bay (always taken), some of its bays took the van 50 s to prove and one none; difficulty 0 alone didn't fix it. Proven at difficulty 1 explicitly in the tests.
- **Valet.** The walk back follows the ramps (`walk_length`: straight lines from the car up each mouth to the stand).
- **Owner confirmed (2026-10-29):** `Portal.lead` stays on the core type (optional, no runtime cost; rejected: proof-only hint map, or dropping it and ~20 s per helix proof). The open lot's garage stays as built, every free bay reachable for Valet, easier than the Multi-storey spot (rejected: restoring the ramp-foot row with sampled proofs, or wider geometry).
- **Floor labels** sit at the top-left of what shows of each floor, clear of the HUD, so the floor you're on is always labelled; the off-screen bay pointer leads to the next ramp's mouth (`toward()`).

## Revision 2026-10-29 (town building decided)
The hub's multi-storey building is both: a ramp in the town leads through portals to garage floors drawn beside the town, free roam with nothing scored, and a doorway on −1 starts Tight Spot's Multi-storey kind. Cars and vans only, as elsewhere; other vehicles meet the height bar.
