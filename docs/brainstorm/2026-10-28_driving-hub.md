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

### Pace after the forklift (decided)
Owner: "lets test with forklift first - then we know all the gotchas then we can be quick". The forklift is the only new game until it ships and its gotchas with the game contract are written down. After that, two or three games run in parallel, one agent each in `games/{id}/`: each game's core changes land first, one at a time, and each game gets its own grill before its agent starts.

### Driving test (decided: later, with focus)
Owner: "for not just the fun aspect i think the driving test will be the best one", then: "keep the plan, then the easier ones. we will need to put a lot of focus on this one." Order: the forklift, then the easier games in parallel, then the driving test as its own focused piece of work (roads and junctions, traffic rules, signals, examiner prompts, fault scoring, a fixed town first). It gets its own brainstorm and ADR.

### Game contract (decided)
Each game is `games/{id}/index.ts` with `define_game({ id, name, icon, building, achievements, load })` and a lazy `games/{id}/game.svelte`; `games/index.ts` lists them. The app shell shows the yard or the active game's component, and games build from shared core components (board canvas, HUD chips, controls, cards). Rejected: one component with a branch per game (it grows with every game, parallel agents collide in it).
### Storage (decided)
Every game uses `app.tight-spot.{game}.*`, parking included (`app.tight-spot.parking.*`); shared settings (sound, steering, wheel) stay at the top level. No migration of old keys: owner: "Dont worry about legacy support its basically just me who used the app". Old parking data is left behind.
### Landing (decided)
Opening the app shows the yard with the car at the gate; the menu marks the last game. A `game` prop or the daily goes straight in.
### Shell (decided)
A `game` prop only: `app launch tight-spot game=forklift`, links `#/app/tight-spot?game=forklift`; values `yard`, `parking`, `forklift`. No commands.
### Forklift details (decided)
- **Model:** rear-wheel steering in the core: `VehicleSpec.steer_axle: "front" | "rear"`, the kinematic step mirrored about the front axle. About 2.5 m long plus 1.2 m forks, 1.2 m wide, 1.5 m wheelbase, rear lock up to about 80°, slow (about 3 m/s top). A carried pallet is a rigid box on the forks. Rejected: a front-steer car with a huge lock (no tail swing).
- **Round:** a job of 1–4 pallets in a seeded warehouse (racks in narrow aisles, a dock): move each from its marked slot to its marked target. Pick: forks fully in, square within 5°, then Fork. Drop: pallet inside the target and straight, then Fork. Any contact ends the round, the carried pallet included.
- **Scoring:** three stars: the job done, moves at or under par, time at or under a par time (from the planner's path at a set speed, with slack). Precision per drop is shown (average) and 95% gives Perfect. A best is fewer stars lost, then time. Levels, random jobs and a daily job. Rejected: time attack, parking's rules unchanged.
- **Controls:** one Fork button (Lift when the forks are in a pallet, Lower when carrying over a target, disabled otherwise); key F and Space; on touch above the pedals.
### Build order (decided)
After 3.82.1 and 3.83.0 push: (1) refactor into `core/` and `games/parking/` with no behaviour change, (2) the yard, playground, menu and `game` prop, renamed Drive Hub, (3) the forklift. The new rigs run in parallel with the forklift (owner: "do rigs in parallel with forklift"): they're parking content, not a second game. The forklift's rear-steer change to the core vehicle model lands first; the rigs agent rebases on it and only adds specs and drawings to the core.

### Dailies in Game Hub (decided)
One Game Hub row per game: Drive Hub reports a daily per game (`daily_rank` as a per-game record, e.g. `{ parking: SCORE_ASC, forklift: SCORE_ASC }`) and the daily launch names the game, like Sudoku's modes. Parking's daily results move to `tight-spot/parking`; older days stay under `tight-spot` (legacy doesn't matter). Rejected: the forklift daily in-game only, one rotating Drive Hub daily.

## Key takeaways
- One app holds every driving game; the shared core needs no kit while the hub is its only user.
- Keeping the id keeps every player's data.

## Action items
- [x] ADR-087 (accepted)
- [x] Shell question before the hub build: a `game` prop for deep links (`app launch tight-spot game=forklift`), no commands.
- [x] Steps 1 and 2: the split into `core/` and `games/parking/`, then the yard, playground, menu, `game` prop and the Drive Hub name (2026-10-28, ADR-087 revision).
- [x] Display name: **Drive Hub** (owner). The app's display name changes when the hub ships (step 4); the id stays `tight-spot`, and the parking game inside keeps the name Tight Spot.
- [x] Review fixes and yard polish (2026-10-28): owner confirmed entering by card plus Enter or tap, and shut "Soon" buildings for games not registered yet, as built; play tracking moved to the shell; loading state and chunk-failure fallback; whole-yard landing view; roof signs, lit doorways, real cones and bollards; welcome card on the first visit only; "Games" label on the switcher (ADR-087 revision).
- [x] Forklift details at its build: model change for rear steer, pallet and rack shapes, job generator, proof, scoring, achievements (2026-10-29, ADR-087 revision; patterns in `docs/apps/drive-hub-games.md`).

## Next session topics
- The yard's look, which buildings show before their game exists.
- Next games after the forklift: pushback, ferry loader, valet rush, driving test, coverage.
