# Tight Spot as a driving hub
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner: "since we have a great car foundation we can turn this into more than just parking app. using the same color models, phyics and everything we define we can reuse and utilize it in other such games." Ideas on the table: airport pushback, forklift warehouse, ferry loader, valet rush, driving test, plough or mower coverage.
Tight Spot's general part: `vehicle.ts` (kinematic model, trailers, steering ramp, roll), `collision.ts`, `camera.ts`, `draw-math.ts` and the palette and vehicle drawing in `draw.ts`, the steering wheel, pedals, keys and buttons, the frame-split loop, `sensors.ts`, `sound.ts`, `planner.ts` (with a per-game goal). Parking-only: `lots.ts`, `kinds.ts`, levels, the parked verdict, the round cards. Follows the open [shared 2D layer](2026-10-28_shared-2d-layer.md) question, narrowed to driving games.

## Topics discussed
### Home (decided)
A driving hub inside one app; the owner's picture: "Drive the car" to the mode you want. Rejected: separate apps on a `$kit` module (a refactor and a kit API shaped by two games), modes bolted onto Tight Spot's toolbar.
### Kit (decided)
No kit module. The shared core lives inside the hub app; it moves to `$kit` only if another app ever needs it (owner: "not sure if we need a kit since it will be scoped to hub").
### Which app is the hub (decided)
Tight Spot becomes the hub, same id `tight-spot`, so storage, bests, stars, achievements, the daily and links survive. Rejected: a new app id (migration, broken links, an app removed from installs).
Layout: `core/` (vehicle, collision, camera, draw, controls, loop, sensors, sound, planner), `games/parking/` (lots, kinds, levels, cards), `games/forklift/`, `hub/` (the yard).
### Picking a game (decided)
Drive in plus a quick menu: a small hub yard where each game is a building or zone you drive into, and a menu that jumps straight to a game (phones, deep links, the daily). Rejected: drive-in only (slow every time), menu only.
### Playground (decided)
Owner: "in the hub we can then also have playground for users to test ALL cars we offer". The yard doubles as the playground: free driving with no goal, and a garage pad in the yard that swaps to any vehicle the app has (every car, bus, trailer rig, later the forklift), with cones and ramps to try them on. Being the playground, the yard is also where a new vehicle gets shown first.

### First new game (decided)
Forklift warehouse, pick and drop: rear-wheel steering (steer at the rear axle), forks out front; drive the forks into a pallet's slots square on (fully in, within 5°), Lift picks it, the carried pallet joins the body for collision, Lower drops it; a pallet counts when it's inside its target and straight. A job is a set of pallets. Rack heights are out (top-down). Rejected: rack levels with a height gauge (more UI).
### Order (decided)
1. Precision and the vehicle picker land and push with the polish.
2. The new rigs (boat trailer, caravan and camping pitch, articulated bus, coach, double-decker).
3. Refactor Tight Spot into `core/` and `games/parking/`, no behaviour change.
4. The hub yard (with the playground and its vehicle garage) and the menu.
5. The forklift game.

## Key takeaways
- One app holds every driving game; the shared core needs no kit while the hub is its only user.
- Keeping the id keeps every player's data.

## Action items
- [x] ADR-087 (accepted)
- [ ] Shell question before the hub build: a `game` prop for deep links (`app launch tight-spot game=forklift`), commands.
- [x] Display name: **Drive Hub** (owner). The app's display name changes when the hub ships (step 4); the id stays `tight-spot`, and the parking game inside keeps the name Tight Spot.
- [ ] Forklift details at its build: model change for rear steer, pallet and rack shapes, job generator, proof, scoring, achievements.

## Next session topics
- The yard's look, which buildings show before their game exists.
- Next games after the forklift: pushback, ferry loader, valet rush, driving test, coverage.
