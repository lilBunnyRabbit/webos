# A shared layer for 2D canvas games
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner: "by idea we have a shared engine or whatever that all such 2d apps can use if possible?", after asking how hard a boat docking sim and a fuller rocket sim would be in Tight Spot's style.
Today each canvas game hand-rolls its pieces. Tight Spot has vectors and geometry, a SAT collision test (`collision.ts`), a camera with insets and pinch zoom (`camera.ts`), a frame-split loop and a theme palette reader. Lunar Lander steps at a fixed 120 Hz with an accumulator (`lunar-lander/game.ts`, `lunar-lander.app.svelte:129`), the pattern that made Tight Spot's car judder on a 120 Hz screen. Blocks and Snake copy `read_palette`. `$kit` has nothing for 2D games. Tight Spot's car is kinematic (no mass, no slip), so a boat needs a real rigid-body model, which no app has yet.

## Topics discussed
### Shape of the shared layer (open)
Options laid out, lightest first:
- Kit toolkit of pieces (`$kit/utils/play2d`): vec/geometry, collide, camera, frame loop, palette. Each app keeps its own sim. Recommended.
- The toolkit plus rigid-body physics (mass, inertia, forces, impulse contacts) for the boat and a better Lunar Lander.
- A full engine runtime (scene, entities, systems) that owns the loop and rendering.
- A library (planck.js, matter.js): a new dependency.
Owner: "Dont know yet". No decision on shape, first cut or home.

## Key takeaways
- The repo rule (a second user moves code to the kit) points to extracting the pieces two apps already duplicate, and physics once the boat exists.
- Lunar Lander's judder is a bug fix on its own, whatever the shape.

## Action items
- [ ] Owner: decide the shape when the boat or the Lunar Lander upgrade is picked up.

## Next session topics
- Boat docking sim: dynamics (inertia, keel drag, rudder flow, prop walk, wind, current), spots (box berth, alongside, lock), how to prove solvable.
- Lunar Lander upgrade or an orbit/docking sim.
- European articulated lorry for Tight Spot ([vehicles brainstorm](2026-10-28_tight-spot-vehicles.md)).
