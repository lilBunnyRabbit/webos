# Drive Hub wave 3: the yard street and six games
**Date:** 2026-10-29
**Participants:** owner, Claude

## Context
Two plots in `hub/yard.ts` (`PLOT_X = [6, 32]`), both taken by Parking and Forklift. The overnight games plan proposed Valet Rush, Airport Pushback, Ferry Loader, Mower, Driving Test, F1, Rodeo and the boat. Owner: "I would do as many in paralel as you can."

## Topics discussed

### Yard (decided)
A plot for every game, and the yard grows with new plots. Shape: a high street, one road west to east with the gate at the west end and plots on both sides; `plots(n)` = ceil(n/2) pairs along x, so a new game adds the next plot and the street grows east. The landing frames the gate and the nearest plots, not the whole street. One plot per game, not per mode: Parking's levels, open lot and daily stay inside its building.
Rejected: a square that grows on all walls (buildings tiny on a phone at 8+), fixed rows of four (grows in jumps).

### Contact (decided)
Per game. The detection stays shared (`core/obstacles.ts` `collide()` returns a `Hit`); each game decides what a hit means. Already the code's shape, so no core change. Valet: a hit is a dent: the car's tip is lost, the score drops, a dent counter shows, and the shift goes on (it ends only on the queue).
Rejected for Valet: three dents end the shift; tip only.

### Wave 1 (decided)
All six in parallel: Valet Rush, Rodeo, Airport Pushback, Ferry Loader, Mower, F1. The boat and the Driving Test wait for their own decisions (the physics home; the road world).

### Pushback model (decided)
`TrailerSpec` gains a rest angle (`rest: Math.PI` for a towbar hung off the tug's front, 0 by default). The hitch is already signed. `trailer_poses`, `jackknife()` and the planner's hitch-angle bins measure from the rest angle; the tow kinematics stay exact. Its own core commit, landing before the Pushback agent starts.
Rejected: a virtual tug behind the plane (the model lies, the planner proves the wrong rig); a game-owned model (duplicates the tow maths, loses the proof).

### Mower deck (decided)
Game-owned: `games/mower/` turns the car pose into the deck's footprint per vehicle. `VehicleSpec` stays as it is; it moves to core when a second game needs an implement.
Rejected: generalising `forks` into `implements` now (a model change for one user).

### F1 grip (decided)
Owner: "we will rework this when we add slip and stuff". The F1 game caps the steer target by speed (curvature at most a_lat / v²) before `step()`; core untouched. Replaced by the slip model later.

### Shared open lot (decided)
A `refactor:` commit moves the open lot (`open_world` and its chunks) from `games/parking/world.ts` to `core/`, and Parking and Valet both import it. Games never import each other.
Rejected: Valet importing `games/parking` (first game-to-game dependency); Valet's own lot (loses the open-lot proofs).

### Mid-round vehicle swap and parked cars (no decision needed)
Valet and Ferry keep their own list of parked cars as solids and call `create_car` with the next spec, like the forklift's pallets. No core change.

### Contact per game (decided)
| Game | A hit |
|------|-------|
| Valet Rush | a dent: tip lost, score down, shift goes on |
| Pushback, Ferry Loader | ends the round, like Parking |
| Mow Day | a solid ends the round; driving over a flowerbed costs coverage |
| Rodeo | a knocked cone adds 5 s; a solid ends the run |
| Hot Lap | a wall voids the lap; grass slows the car |
Each start card states its game's rule.

### Names (decided)
| id | Name | Building |
|----|------|----------|
| `valet` | Valet Rush | valet stand |
| `pushback` | Pushback | airport apron |
| `ferry` | Ferry Loader | ferry deck |
| `mower` | Mow Day | garden |
| `rodeo` | Rodeo | arena |
| `f1` | Hot Lap | race track |

### First cuts (decided)
- **Valet Rush.** Drop-off and fetch back. Cars arrive at the stand on a seeded schedule; park each in any free bay; owners return on timers and you fetch their car to the stand; tips for a fast return and a precise park (`fit()`). The shift ends when four wait at the stand. Vehicles: hatch, van, pickup, city car, SUV, now and then the bus. Daily by score.
- **Pushback.** One A320-sized aircraft, the existing tug. A seeded apron: stands on one side, jet bridges and neighbour aircraft as solids, a taxiway with a centreline and a stop mark. ATC's instruction ("push back approved, face west") as text and spoken through the speech service. Stars: done (nose gear on the mark, on the centreline, heading in), no direction change, par time. Wings collide with everything (no heights). Levels and a daily. Later: the widebody, a push round a corner, the baggage train.
- **Ferry Loader.** Drive-through deck, ramp at the stern, 3 to 6 vehicles from the garage (cars, van, bus, box truck), any lane, gap to the one ahead 0.3 to 1 m, a balance gauge worth a star. Undo the last vehicle. A solution packing is built first and the queue derived from it. Levels and a daily. Later: reversing on, bow doors, a horn timer.
- **Mow Day.** The existing ride-on mower. Seeded lawns (a shape with beds, trees, a pond, the shed as the start), a coverage grid of about 15 cm, stripes by pass direction. Stars: at least 90 % of the coverable lawn, overlap under a limit, par time. Coverable = what the planner's lattice reaches from the start. Levels and a daily. Later: tractor and trailed mower, zero-turn, snowplough.
- **Rodeo.** Pick any garage vehicle; a seeded course scaled to its size and turning circle: gates in order, a slalom, a stop box, a reverse gate. Bests per vehicle and course. The daily fixes the course and the vehicle.
- **Hot Lap.** The F1 car on two or three hand-made spline tracks: kerbs, grass, walls, sectors, a ghost of your best lap, par from a racing-line solver (minimum-curvature line and a speed profile). Daily: the track of the day, by time.

### Saved data (decided)
Owner: "always some sort of opfs - rare cases where we would want local storage". The new games keep bests, levels and the Hot Lap ghost as files in the app's data folder (`/var/lib/apps/tight-spot/`, ADR-035), not in `app.tight-spot.*`. Small last-choice conveniences may stay in localStorage. Parking and Forklift still use localStorage; moving them is a later item.

### Tests (decided)
Owner: "don't overdo the tests. that goes in general." A few representative seeds per game's proof, no sweeps, no separate long-test tier.

### Shell
Unchanged hub-wide rule: no commands; the `game` prop takes the new ids.

### Review round (decided)
- **Pushback's proof:** the core planner found no push for the 40 m chain in 120,000 expansions, so the build proves and pars with a game-owned push driver (`games/pushback/plan.ts`) that re-derives the fold maths; its moves replay through core `drive()` with the real bodies. Accepted, replacing the "core planner" part of "Pushback model".
- **Mow Day:** when 90 % can no longer be reached (flattened flowers cost too much), the round ends: "Too many flowers flattened".
- **Rodeo chains:** rigs of two or more links appear in the picker under an Experimental group, noted "course not proven"; no daily, no achievement progress. The daily keeps to rigs of at most one link (now decided).
- **Parking and Forklift saved data move to the app data folder** like the new games: on first load copy the old localStorage bests and levels into the file, then remove those keys. Last choices stay in localStorage.

### Open lot: parallel spots and a garage (decided)
Owner: "for the valet im missing some paralel parking cases … or garage - maybe underground garage - that would be good". Both go into the shared open lot (`core/lot.ts`), so Valet Rush and Tight Spot's open lot get them: kerbside parallel bays along chunk roads, and an underground-garage chunk (walled, dim, a pillar grid, an entry ramp). Rejected: Valet-only kerb spots (Tight Spot's open lot would miss them).

### Multi-floor garages (decided)
Owner: "maybe even multiple floors - all in one canvas with 'teleportation'". Core portals in the scene, crossed after `step()` and by the planner; floors side by side, the camera follows through a ramp. ADR-090. Built after the single-floor garage lands.

### Forklift: bumps, never a fail (decided)
Owner: "for forklift lets make this easier. it doesnt mean fail … it just stops you and you need to reverse", then: "'touched a pallete' should also not be a fail. you know what nothing is a fail with forklift its just deduction. think of it how real forklifts work there is always bumps everywhere". Every contact in the Warehouse (forks jammed into a pallet, body or load against racks, walls, pillars, stock or pallets, the forks against a beam in the side view) is a bump: the step is undone, the forklift stops, rings flash, a hint says what was hit, and the player backs off and carries on. Pressing on against the same thing is one bump. Each bump adds 5 s to the time, so it eats into the time star; the done card lists the bumps. Nothing ends a round.

### Pushback becomes the Airport game (decided)
Owner, on the baggage train: "i would just do the pushback as the whole airport game with different modes like the parking + a combined mode where you do the whole thing everything combined". The game is renamed Airport, id `airport` (unreleased, so the id, data file, daily key and achievement prefix change freely; the building keeps its terminal roof). Modes, like Parking's:
- **Pushback:** as built.
- **Baggage run:** the tug with three carts (the garage's baggage train) from the baggage hall to an aircraft's hold door, weaving between parked aircraft and ground kit, stopping with the carts alongside the door. Forward-only routes, since a three-cart chain can't really reverse.
- **Tow to gate:** tow an aircraft nose-first from a remote stand to a gate, the tug ahead with an ordinary towbar (rest 0).
- **Turnaround:** one round doing it all: deliver the bags to the aircraft, swap to the pushback tug, push it back onto the taxiway; time and stars across the whole job.
Rejected: a separate baggage game; leaving the baggage train in the garage and Rodeo only.

### Mow Day: bumps too (decided)
Owner: "the mowing should not be that harsh with bumps". As in the Warehouse, hitting a tree, the shed, the pond or the hedge is a bump: the step is undone, the mower stops, rings flash, a hint names it, pressing on counts once, and each bump adds 5 s. Flowers keep their coverage cost and the "too many flowers flattened" end.

### The hub becomes a small town (decided, to review on screenshots)
Owner, on the street: "it doesnt look great … the container should be shaped based on the game it is. also zoomed in you have no clue what it is. and maybe they are all a bit too big", then "this is meh now just one straight line", and on districts around a loop: "maybe yea. like a small town feel so i dont have to drive for ages to get to it". The straight street gives way to a compact town: a ring road round a central plaza (the gate and the garage), districts off it by theme (Waterfront: Ferry, Airport; Industrial: Warehouse; Sport: Hot Lap, Rodeo; Town: Car Park, Valet, Mow Day, Driving Test). Every plot is short to reach from the plaza; a district grows outward when a game joins it. The game-to-district map lives in the hub's own data (`hub/`), not in `define_game`, so the game contract doesn't change. Each building gets its own shape and silhouette from above, a readable sign at its entrance at any zoom, and a smaller footprint. The owner judges it on screenshots.
Supersedes the straight street in "Yard (decided)".

### Airport: ground vehicles pass under wings (decided)
Owner, on a tug "hitting" a parked aircraft's wing: "is this really a hit? the cart can go below the wings". Airport collision gets two heights, game-owned like the Warehouse's tiers (no core scene change): aircraft wings and tailplanes are high; fuselages, engines, landing gear, jet bridges, the terminal and ground kit are low. Tugs, baggage carts and ground kit collide only with low things; an aircraft's wings and tailplane collide with high things (other aircraft's wings and tails, jet bridges, the terminal), its fuselage, engines and gear with low things. Replaces "wings collide with everything (no heights)" from the first cut.

### Parking difficulty pass (decided)
Owner: "with parking im really looking for difficulty"; on the garages: "the point of the garage is to have really tight corners … really looking for that claustrophobic feeling", "with walls everywhere". Agreed: every spot kind's difficulty 1 becomes the tightest the proofs still solve, dropping bigger vehicles from a kind rather than loosening it (as the Multi-storey spot did); a new hardest set of levels after the ladder, no renumbering; Spots' difficulty range may widen toward the top. Valet Rush and the open lot stay as they are. Multi-storey and Underground were already tightened with the portals build and stay.

**Build note (2026-10-29).** Each kind's top end swept down with every listed vehicle until a seed failed, then backed off a step ([page](../apps/tight-spot.md#lot-layouts) has every size and what set it). Old → new at difficulty 1:

| Kind | Tightened | At difficulty 1 |
|------|-----------|-----------------|
| Parallel | gap car + 1.3 → 1.1 m, lane 2.3 → 2.2 m | all its vehicles |
| Nose in | aisle 5.8 → 4.9 m, bay 2.35 → 2.1 m | all |
| Reverse in | aisle 5.4 → 3.9 m, bay 2.35 → 2.1 m | all |
| Angled | aisle 4.2 → 3 m, bay 2.4 → 2.1 m | all |
| Pillars | aisle 5.8 → 4.6 m, bay 2.35 → 2.3 m, pillar 0.45 → 0.2 m in from the aisle (0.75 m) | all |
| Garage | inside 2.55 → 2.4 m, slack 0.35 → 0.2 m | all |
| Narrow aisle | aisle 4.9 → 3.6 m, bay 2.35 → 2.1 m | all |
| Garage door | alley 4.6 → 4.45 m, door 2.3 → 2.2 m | all but the camper van (dropped) |
| Dead end | street 5.4 → 5.1 m + 0.25 m per metre longer than the hatchback | all |
| End bay | aisle 4.9 → 4.7 m, bay 2.4 → 2.2 m | all |
| Bus stop | lane 3.1 → 3.0 m, box bus + 6.2 → 1.5 m (articulated bus unchanged) | all |
| Depot | lane 3.25 → 3.0 m (articulated bus's drive-through unchanged) | all |
| Driveway | street 6.6 → 6 m, driveway 3.1 → 2.9 m, slack 0.9 → 0.8 m | all |
| Slipway | ramp 2.7 → 2.3 m, bay slack 0.7 → 0.3 m | all |
| Camping pitch | pitch 3.6 → 3 m, track 7.8 → 7 m, hedge stubs 0.4 → 0.1 m short of the track | caravan |
| Loading dock | door 3.6 → 3 m, drive-through lanes 3.7 → 3 m | all |

- The open lot keeps its old tight ends: `rows()` and `angled()` in `core/lot-layout.ts` take them when `open`, so Valet Rush is untouched.
- The dead end's street grows with the vehicle's length at the top: the van couldn't turn round at 5.25 m, and it's on the ladder, so dropping it would have changed existing levels.
- Hardest lap: levels 49–66, every kind at difficulty 1 including the underground garage and the multi-storey (bay three floors down) last; seeds `hash(0x7195, 900 + k)`, picked so all 18 prove from the start. Levels 1–48 keep their kind, seed, difficulty and vehicle (their tighter ends make the late ones tighter too).
- Spots and the daily: difficulty 0.15–1 from the seed (was 0.15–0.85).
- Tests: no new sweeps; the existing ones (kinds at 0, 0.5 and 1, every level) prove the new tops and the hardest lap. The planner files went from 307 s to 340 s.

## Key takeaways
- One plot per game on a street that grows east; nothing caps the number of games.
- Contact detection is shared, the rule is each game's.
- Only Pushback changes the vehicle model (the rest angle). Everything else is game-owned, plus one move of the open lot to `core/`.

## Action items
1. [x] `refactor:` move the open lot to `core/`; `feat:` the yard street (ADR-087 revision). One agent.
2. [x] `feat:` the trailer rest angle (ADR-088 revision). One agent, in parallel with 1 (no shared files).
3. In parallel at once: Ferry Loader, Mow Day, Rodeo, Hot Lap. Hot Lap and Mow Day built 2026-10-29.
4. [x] After 1 merges: Valet Rush. [x] After 2 merges: Pushback.
5. Each game: review, visual pass, then pushed in groups.
6. [x] Review round: Parking and Forklift saved data moved to `parking.json` and `forklift.json` in the app data folder, old keys folded in and removed.
7. [x] Forklift: every contact a bump (5 s, never a fail), forgiving pockets (10°, 15 cm), the face stop on the floor stock under an upper slot.
8. [x] Mow Day: a tree, the shed, the pond or the hedge is a bump (5 s, never a fail); flowers keep their cost and the flattened end.
9. [x] Pushback becomes Airport: the rename (`refactor:`), then the Baggage run, Tow to gate and Turnaround jobs; the daily is a turnaround.
10. [x] Airport: two collision heights, ground vehicles pass under wings and tailplanes.
11. [x] The hub becomes a small town: districts round a plaza, a shape and an entrance sign per building (ADR-087 revision).
12. [x] Multi-floor garages (ADR-090): core portals, the Multi-storey spot (straight ramps and a helix, one to three floors down), the open lot's garage with a floor below for Tight Spot and Valet Rush. The town's multi-storey building follows.
13. [x] Parking difficulty pass: every spot kind's difficulty 1 at the tightest the proofs solve, a hardest lap of 18 levels after the ladder, Spots up to difficulty 1.
14. [x] The town's car park: drivable floors through portals off a ramp in Tight Spot's building, a doorway on −1 into the Multi-storey spot (ADR-090 revision, 2026-10-29).

## Next session topics
- The boat: where a dynamic (non-kinematic) model lives, shared with F1's later slip model.
- Driving Test: its own brainstorm and ADR.
