# ADR-091: Drive Hub tyre support and Tight Spot Extreme
**Date:** 2026-10-29
**Status:** Accepted

## Context
Owner: "For the parking i even have some crazy ideas. Like cars driving on planks and other extreme scenarios". Today only the body collides (`core/obstacles.ts` `collide()`); surfaces in a chunk are drawn, never felt, and nothing knows where a tyre is. Planks, a quay edge, a car transporter's ramps and switchbacks with a drop all need "is every tyre on something". Ideas and grill: `docs/brainstorm/2026-10-29_extreme-parking.md`.

## Decision
- **Core `support()`.** A pure module `core/support.ts`: `tyres(car, spec)` gives each tyre's contact point from the `VehicleSpec` (trailer tyres included), `support(car, spec, ground)` returns which tyres are off. The scene gains an optional `ground: Polygon[]`; absent means everywhere is ground, so no existing game changes. Any game may call it; `step()` does not.
- **Wheel off = the round ends.** The car tips over the edge (short animation), verdict "Off the plank" (or the edge's name), Retry. Body touches keep parking's existing rule.
- **Tight Spot Extreme mode.** A fourth mode beside Spots, Levels and Open lot: a hand-made ladder of courses, each naming its vehicle (plank spacing fits that track). Scored like Levels: parked in the end bay, time and moves, three stars, the next course unlocks. No daily. Saved with the other parking progress (OPFS).
- **First cut:** planks (straight, then angled and gapped), a narrow bridge or quay edge, a car transporter (flat: ramps and deck are narrow ground drawn raised, no portal, one deck), mountain switchbacks with a drop outside.
- **Later round:** anything that moves (turntable, car lift, barrier arms, doors, trolleys). The scene has no time today; that gets its own grill.
- **Planner.** Proofs for Extreme courses must respect `support()`; a course ships only when proven.
- **Shell:** nothing new; Extreme is a mode inside `?game=parking`.

## Alternatives Considered
- Parking-only tyre check: lighter, but Ferry ramps, Rodeo and the transporter would copy it.
- Inside `step()`: every game pays it and `step()` gains world knowledge it has none of.
- A bump instead of a fail, or a rule per kind: planks lose their threat; more rules to explain.
- Extreme as seeded spot kinds in Spots/Any/daily: dailies ending on a tyre slip, seeded switchbacks hard to make good.
- A two-deck transporter through a portal: real second deck, more geometry; later if wanted.

## Consequences
- The scene shape gains an optional field; every existing scene is unchanged.
- The planner's validity check gains an optional ground test (cost only where ground is set).
- Hand-made courses mean proofs per course in tests, few and fixed.
