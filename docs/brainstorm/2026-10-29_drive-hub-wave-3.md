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

## Key takeaways
- One plot per game on a street that grows east; nothing caps the number of games.
- Contact detection is shared, the rule is each game's.
- Only Pushback changes the vehicle model (the rest angle). Everything else is game-owned, plus one move of the open lot to `core/`.

## Action items
1. `refactor:` move the open lot to `core/`; `feat:` the yard street (ADR-087 revision). One agent.
2. [x] `feat:` the trailer rest angle (ADR-088 revision). One agent, in parallel with 1 (no shared files).
3. In parallel at once: Ferry Loader, Mow Day, Rodeo, Hot Lap.
4. After 1 merges: Valet Rush. After 2 merges: Pushback.
5. Each game: review, visual pass, then pushed in groups.

## Next session topics
- The boat: where a dynamic (non-kinematic) model lives, shared with F1's later slip model.
- Driving Test: its own brainstorm and ADR.
