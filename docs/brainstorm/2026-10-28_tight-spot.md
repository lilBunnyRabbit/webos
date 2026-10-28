# Tight Spot: a car parking simulator
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner's own idea: "2D car parking simulator ... top down view, very accurate physics so that the car behaves as it would IRL when wheels turn, random map generation but really focus on all possible parking scenarios (parallel parking, up to the wall parking in a garage, pillars, narrow two sided parkings, etc everything)". Later expansions named: tilted 3D view, infinite seeded world, slip and drift physics, weather, AI cars that get in the way, different vehicles (buses and others).

Today: Lunar Lander (`src/lib/apps/user/lunar-lander/`) is the closest app, with pure physics in `game.ts`, canvas drawing in `draw.ts`, sizing by `device-pixel-content-box` and held touch buttons. `$kit/games` has daily, plays and stopwatch; `core/utils/random.ts` has seeded random. No vehicle, collision or map generation code exists.

## Topics discussed

### Physics (decided)
Kinematic Ackermann model (no tyre slip). At parking speed tyres don't slip, so this is the real behaviour: the car pivots around the rear axle line, the front swings wide, and the turning circle comes from wheelbase and max steer angle. The steering wheel turns at a limited rate, gears are D/N/R/P, throttle and brake accelerate, and the car creeps in gear like an automatic. SI units, a hatchback around 4.3 m long with a 2.6 m wheelbase. Fixed 120 Hz step, separate from drawing, so the sim is deterministic and a different renderer (tilted 3D) can sit on top later. Collision is the car's rotated rectangle against polygons with a hand-written separating-axis test, no dependency.
Rejected: a dynamic tyre model now (jitters near zero speed, weeks of tuning, no gain at parking speed); blending both by speed (two models to build now). Drift later swaps the model behind the same `step()`.

### Structure (decided)
All three: random scenarios with a daily, a levels ladder, and an open lot. Later, roads join lots into an infinite world.

### World model (decided)
A chunk grid from a seed: `chunk(seed, cx, cy)` is pure and returns a road piece or a lot holding bays, solids and exits that line up with neighbours. Scenario and level mode use one lot chunk plus the road in; open lot uses a 3 × 3 area; infinite later streams chunks around the car with the same function.
Rejected: a road graph with lots hanging off it (hard to stream, needs the graph before any scenario); separate generators per mode (infinite world rewrites them). Known cost: grid roads feel like city blocks with 90° junctions.

### Scenario types (v1)
Parallel between two cars at a kerb; perpendicular bays, forward in and reverse in; angled bays; garage up to the wall with a distance beeper; bays between pillars; a narrow aisle with cars on both sides; a tight garage door entry; a dead end where the car has to turn around.

### Mobile controls (decided)
A steering wheel you drag, which stays where you leave it like a real one, with a centre button; gas and brake pedals; a gear toggle. Desktop uses the keyboard.
Rejected: a slider (less like a car), tilt (motion permission on iOS, hard to hold still).

### Judging (decided)
Touching a car, wall or pillar ends the round, like a driving test. A park counts when the whole car is inside the bay lines, within 5° of the bay, stopped and in P. Score is time and moves (gear changes between D and R).
Rejected: scrapes costing points; a strict/relaxed setting.

### Storage (decided)
App storage `app.tight-spot.*` for bests per scenario type, level unlocks and settings; the daily through kit plays (`plays.json`, Game Hub).
Rejected: `/var/lib/tight-spot/progress.json` (async load before the menu, more code than other games).

### Shell (decided)
Nothing. App launch only.

### Name (decided)
Tight Spot, id `tight-spot`.

## Key takeaways
- Sim, world generation and drawing are three separate pure layers: the expansions (3D view, infinite world, drift) each replace one layer.
- Everything from a seed, so the daily, levels and a later infinite world share one generator.

## Action items
- [x] ADR-086 Tight Spot
- [x] Build v1: physics, collision, chunk generator with all scenario types, scenario + daily, levels, open lot, keyboard and touch controls, guide, docs page

## Next session topics
- Tilted 3D view
- Infinite seeded world (streamed chunks, roads joining lots)
- Slip and drift physics (dynamic tyre model behind `step()`)
- Weather
- AI cars that get in the way
- Other vehicles (vans, buses, trailers)
