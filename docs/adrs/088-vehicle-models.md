# ADR-088: Vehicle drive kinds and hitch chains
**Date:** 2026-10-28
**Status:** Accepted

## Context
Drive Hub ([ADR-087](087-driving-hub.md)) is to carry every kind of vehicle: cars, buses and trucks, rear-steer machines, trains of trailers, skid-steer and frame-steer machines. The core model (`core/vehicle.ts`, from [ADR-086](086-tight-spot.md)) is a kinematic front-steer car with one optional trailer. Decided in [the vehicles brainstorm](../brainstorm/2026-10-28_drive-hub-vehicles.md).

## Decision
- `VehicleSpec.drive` is a tagged union: `ackermann` (with `steer_axle`: `front`, `rear`, `all` or `crab`), `skid` (track width) and `frame` (pivot position). `step(car, input, dt, spec)` stays the one entry and dispatches on it.
- `VehicleSpec.hitches` is a list of trailer specs, empty for a solo vehicle; one entry is today's trailer, several make a train. `Car` holds one heading and one roll pair per hitch.
- Collision, sensors, drawing and the planner work on the vehicle's bodies, whatever its drive.
- Every vehicle is in the yard's garage; a parking spot lists one only once the planner proves it; games bring their own.
- Delivered in waves: spec-only and one-hinge vehicles; the union and the chain; skid, frame, all-wheel and crab steer; the fun ones.

## Alternatives Considered
- A model module per drive behind a shared interface: cleaner files, more indirection.
- Adding every vehicle to every parking kind it fits: planner and test-time cost for little play.

## Consequences
- `step()` grows a switch; each drive kind needs its own geometry tests and planner moves.
- The single `trailer` field becomes a one-entry `hitches` list (a refactor in W2).

## Revision 2026-10-28 (the forklift's rear steer)
- `VehicleSpec.drive` landed ahead of W2 with the forklift, as decided: a one-member union for now, `{ kind: "ackermann", steer_axle: "front" | "rear" }`; every existing vehicle is `front` and behaves as before (its tests unchanged). `all` and `crab` come with W3.
- The pose is the centre of the unsteered axle, so for rear steer it is the front axle's. `step()`, `arc()`, the curvature and the planner need no branch; only where the body, wheels and bumpers sit relative to the pose changes (`axles()`, `body_ends()`), and a positive wheel still turns right.
- Steered wheel angles are `atan2(x·κ, 1 − y·κ)`: at a forklift's lock the turn centre lies inside the track and the inner wheel turns past 90°, which `atan` folded back.
- `trailer` stays as is; the hitches list is still W2.

## Revision 2026-10-29 (W1: spec-only vehicles and one-hinge rigs)
- Seventeen vehicles on today's model, each a `VehicleSpec` with `drive: FRONT_STEER`: city car, SUV, limousine (a stretch, 8.2 m), camper van, garbage truck, fire engine, coach, double-decker; the tractor, quad, SUV, pickup and hatchback towing a farm trailer, a small trailer, a horse box, a boat and a caravan; the articulated bus as the one-trailer model (front section, turntable as the ball, the rear section as the trailer). Every one is in the yard's garage, in four shelves (Cars, Service, Buses, Towing).
- **Looks:** the taxi, police car and ambulance are their own `Vehicle` ids pointing at another vehicle's spec (`VEHICLES.taxi === HATCHBACK`, police on the SUV, ambulance on the van). No spec field: the drawing already keys its body style on the vehicle id, so a look is a row in the drawing's table, and the planner proofs carry over (a look on a spec already proven in a kind isn't proven again).
- **Coach tag axle:** geometry only. A rigid tag axle and the drive axle turn about the point between them, so the pose sits there and `wheelbase` runs to it; the kinematics don't change and the drawing puts the two rear tyres 0.7 m either side.
- **Where they park (planner-proven):** the car kinds take the city car, SUV, taxi, police car and ambulance; the limousine all but angled and garage door, the camper van all but angled and dead end (those failed the sweeps). The bus stop takes the double-decker; the depot the coach, the double-decker, the garbage truck and the fire engine; the driveway the horse box and the quad; the slipway the boat. The tractor is garage-only; the coach failed some bus-stop seeds and only takes the depot.
- **Levels keep their vehicles:** a kind's seed picks from all its vehicles in Spots and the daily, but a level picks from `ladder`, the vehicles the kind had when the ladder was laid out, so every level keeps its vehicle and layout; the five big kinds keep their level seeds (`100 + lap × 5 + k`) and the camping pitch has its own (`200 + lap`).
- **Camping pitch:** a new kind for the caravan, pitches between hedges with parked caravans, woven in as the last spot of each lap (levels 15, 30 and 45; the ladder is 45 long, so the levels after 15 moved up by one or two, which left their stored stars on other levels, as before). The rig starts set up, swung out 30° with its tail at the pitch's mouth: from straight on the track the search took 10–20 s a seed, set up it takes under a second at the tight end.

## Revision 2026-10-29 (the articulated bus parks)
Owner: "yes make the articulated bus parkable too". It failed every bus stop and depot seed in the first W1 build; now both list it, proven from the round's start and judged by the game:
- **Bus stop:** its stop box takes the whole street (no car ahead) and its lane starts inside the road's right lane (x 17.6, 3.9 → 3.7 m wide). With the city bus's lane beyond the road's kerb the rear section couldn't swing out and straighten again inside 32 m. The proof for a towed rig at the bus stop searches forward only until the front section is lined up within 3°, then pulls straight ahead until the game calls it parked (a towed section straightens behind a straight-driving one); the straight run is part of the replayed moves.
- **Depot:** drive-through. No 32 m yard lets an 18 m bus swing round and back in, so for it the gate is open and the bay faces in: it drives nose first from the road into a lane 2–3.5 m either side of the gate's line, the lanes in between left empty. The plain from-start search proves it. The depot's brief now says to face the way the bay's arrow points.
- **Start:** a rig whose tail would reach the barrier at the end of the road waits further up it (only the articulated bus).
- Levels are unchanged: the bus stop's and depot's ladder is still the city bus, whose layouts and draws from the seed are identical.

## Revision 2026-10-29 (wave 4, the fun ones)
- Tuk-tuk, golf cart, ice resurfacer, shopping trolley, and an F1 car the owner added: plain front-steer specs, no model change, on a Fun shelf in the garage. The tuk-tuk's one front wheel is drawn only; the model's front pair stands in for it (the bicycle model is the same). The trolley, whose real casters all swivel, is front steer on an 80° lock, not all-wheel steer: that waits for W3.
- One optional spec field, `unlit` (no headlight beams), for the trolley and the F1 car.
- Parking: the planner proves the F1 car in the open lot, and the tuk-tuk and the golf cart in every car kind and the open lot. They first failed because the lot builders shrank for vehicles smaller than the hatchback; `Fit` now never goes below the hatchback's layout (length, width and turning circle), and levels keep their vehicles through `ladder`. The resurfacer and the trolley are garage-only.
- Camera: `view_span` zooms by vehicle length both ways (0.6–1.6× the hatchback's view), so small vehicles are zoomed in, in rounds and in the yard.
