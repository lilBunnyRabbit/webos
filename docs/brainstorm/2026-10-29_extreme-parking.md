# Tight Spot: extreme scenarios (ideas, to grill after the 3.88 push)
**Date:** 2026-10-29
**Participants:** owner, Claude

## Context
Owner: "with parking im really looking for difficulty", then "For the parking i even have some crazy ideas. Like cars driving on planks and other extreme scenarios". Agreed order: push 3.88 first, then a hard pass over every kind, then these.

## Ideas (not decided)
- **Planks:** two narrow planks over a pit or a ditch; every tyre must stay on a plank (a per-wheel surface check, new: today only the body collides). Variants: planks that meet at an angle, a gap between plank pairs, planks onto a trailer or a car transporter's ramps.
- **Narrow bridge / quay edge:** water or a drop either side, no kerb, a wheel off the edge ends it.
- **Car transporter:** drive up two-deck ramps onto a lorry, tyres on the ramps.
- **Turntable:** a rotating platform in a tiny garage; stop on it, it turns you.
- **Car lift / stacker:** park on a platform that lifts (a portal, ADR-090).
- **Mountain switchbacks:** hairpins with a drop outside, reverse-and-shuffle turns.
- **Moving obstacles:** a barrier arm, a door closing, a trolley rolling across.

## Questions for the grill
- The per-wheel surface check: core (`step()` reports each tyre's contact patch against a surface layer) or game-owned in parking?
- What happens when a wheel goes off: the round ends, a bump, or the car "drops" (animation)?
- Which first: planks alone, or planks plus the transporter?

## Decisions (grill, 2026-10-29)
- Tyre check in core: `support()` in `core/support.ts`, optional `ground` on the scene (rejected: parking-only, inside `step()`).
- Wheel off ends the round with a tip animation (rejected: bump and stop; a rule per kind).
- First cut: planks, narrow bridge or quay, car transporter, switchbacks. Moving parts (turntable, lift, barriers, doors) in a later round.
- Home: a new Extreme mode in Tight Spot, hand-made ladder (rejected: spot kinds; its own game).
- Transporter flat, height drawn (rejected: two decks through a portal).
- Vehicle fixed per course; time and moves, three stars, no daily; body touches as parking; no new shell.
- ADR-091.

## Also decided this round
- Town multi-storey building: both. Drivable garage floors in the town through portals (free roam, nothing scored), and a doorway on −1 that starts Tight Spot's Multi-storey kind. ADR-090 revision.
- Hot Lap: "Turn view with car" setting beside "Zoom with speed", off by default, Hot Lap only.
- Valet overview with two garages: design fix, no ask (fit the street and the floor in view, not every floor).

## Not yet built (backlog from earlier brainstorms)
Boat with a dynamic model; F1 slip and drift; tilted 3D view; infinite seeded world; weather; AI cars in the way; caravan and boat trailers; rear-steer bus.
