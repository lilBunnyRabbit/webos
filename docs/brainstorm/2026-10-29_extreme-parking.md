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
