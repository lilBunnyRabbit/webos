# Drive Hub progression and Yard Shunter
**Date:** 2026-11-07
**Participants:** owner, Claude

## Context
Owner, 11-07: "continue with drive hub with the ideas we still had + fix other gamemodes except for tight spot and warehouse there is really no progress to them or anything it gets boring after idk 3 games".

What the audit found:
- **Benchmarks:**
  - Tight Spot: 66 levels, each bringing a new kind of spot or vehicle (`games/parking/game.ts:506`);
  - Forklift: 16 levels, tiers rising with difficulty (`games/forklift/game.ts:642`).
- **A track that only grows:** Ferry (12 levels), Mow Day (12) and Airport (36) already have levels, stars and unlocks. Their levels only grow the size or the count:
  - Ferry: vehicle count (`ferry/deck.ts:114`);
  - Mow Day: garden size (`mower/garden.ts:53`);
  - Airport: reseeds of the same job; its "every level" achievement counts pushback only (`airport/index.ts:16`).
- **No progression:**
  - Hot Lap: 3 tracks, nothing unlocks;
  - Rodeo: 12 open courses of one shape, `build_course` takes no difficulty (`rodeo/course.ts:60`);
  - Valet Rush: one endless shift;
  - Driving Test: 3 routes, pass or fail, no daily.
- **Shared code:** five games each carry a line-for-line copy of `unlocked()`, `better()`, `record()` and `levels_schema`. The town never shows progress (`games/define.ts:35`).
- **Old blockers gone:** the town grows along its districts (`hub/yard.ts:76`), and the contact rule is set per game.

## Topics discussed

### Shape (decided)
A shared `core/track.ts` holds:
- the level list and the stars;
- the "next opens when the one before is done" rule;
- the record and bests;
- a level picker with stars;
- the feed for the "every level" achievement.

It replaces the five copies. Each game then gets a real ladder whose levels introduce something new, and existing level proofs must stay green.
- Rejected: fixing each game in place (eight copies that would drift).

### Hub (decided)
- **Stars on doors:** each building's lit doorway sign shows stars earned out of the total. This adds an optional progress summary to `GameDefinition`.
- **Licence card:** a card in the yard's toolbar with a row per game, derived from stars and achievements, with no gating.
- Rejected: a daily set card.

### Game ladders (decided, all now)
- **Rodeo:** a difficulty input to the course (tighter gaps, a longer slalom, a three-point-turn box), a 12-level ladder, stars against a par time, unlock next.
- **Hot Lap:**
  - stars per track, the next track opening at 2 stars;
  - seeded tracks for the long tail.
- **Driving Test:**
  - stars by minors: 0 is 3 stars, 1–5 is 2 stars, 6–15 is 1 star;
  - routes open in order;
  - a seeded route and a daily.
- **Valet Rush:** shift levels, each with a target score and a set count of arrivals, bringing in the bus, the garage floors and a rush hour as they go.
- **Ferry:** levels add trucks, a second deck and a tide ramp.
- **Mow Day:** levels add stripe-pattern goals, slopes, and a tractor with a trailed mower.
- **Airport:**
  - levels add a widebody and a push round a corner;
  - all four jobs count toward the achievement (36, not 12).

### Yard Shunter (decided)
A new game: couple and deliver.
- A yard tractor (a terminal shunter) reverses onto the marked trailer's kingpin. It couples within a few cm and square.
- It tows the trailer to a dock door or a parking row and drops it.
- Jobs are one to four trailers. Levels bring tighter rows, a dolly and double trailers.
- Coupling becomes a core hitch-chain feature that any rig can use later.
- Rejected: tow-truck jobs, a car transporter (both kept as ideas).

### Other ideas (decided)
Not this round: ghosts everywhere, slip and drift physics, engine sounds.

### Shell (decided)
Nothing new. Yard Shunter is reachable through the `game` prop.

### Ship plan (decided)
Build everything and push in groups, asking before each push:
1. the refactors (track module, play2d kit) as a patch release;
2. the ladders and hub progress (minor);
3. Yard Shunter (minor);
4. the Lunar Lander rework (minor).

## Key takeaways
- The complaint is content: levels have to teach something new, not only grow.
- One shared track piece first, then a ladder per game.

## Action items
- [x] `refactor:` `core/track.ts`; Airport, Ferry, Forklift, Mow Day and Parking on it, proofs unchanged.
- [x] `GameDefinition` progress summary, door stars, licence card.
- [x] Rodeo and Hot Lap ladders.
- [x] Driving Test and Valet Rush ladders.
- [x] Ferry, Mow Day and Airport levels that introduce things.
- [x] Yard Shunter with core coupling.

Order:
- The track refactor goes first; the ladders follow on top of it, one builder per game group, in parallel.
- Yard Shunter in parallel with the ladders (it touches the core hitch code and its own game).

## Next session topics
- Ghosts, slip physics, engine sounds.
- Tow truck, car transporter.
- A second town for the test.
