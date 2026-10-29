# Drive Hub: every vehicle
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner asked what vehicles to add; after the list: "tbh i would want all of them". Today `core/vehicle.ts` is a kinematic front-steer model with an optional single trailer; the forklift (in progress) needs rear-wheel steering. Earlier decisions: [vehicles](2026-10-28_tight-spot-vehicles.md), [Drive Hub](2026-10-28_driving-hub.md).

## The list
- **Spec only:** city car, SUV, limo, camper van, garbage truck, fire engine; taxi, police car and ambulance as looks.
- **One hinge (today's trailer model):** car + horse box, tractor + farm trailer, quad + small trailer; airport tug + plane (with the pushback game); plus the decided rigs (boat trailer, caravan, articulated bus, coach, double-decker).
- **New steering models:** rear steer (forklift, telehandler, combine harvester); a chain of hinges (airport baggage train, road train, truck + drawbar trailer, tractor + two trailers, the semi from the trucks topic); skid steer (bobcat, zero-turn mower, tank); frame steer (wheel loader, articulated dump truck); all-wheel and crab steer (fire-truck ladder with a rear driver, some buses).
- **For fun:** tuk-tuk, golf cart, ice resurfacer, shopping trolley, and an F1 car (owner: "we MUST include f1 car"): a huge turning circle, fierce acceleration and brakes, open wheels.

## Decisions
- **Model shape:** one `VehicleSpec` with a tagged `drive` union and a hitch chain; `step()` dispatches on the drive kind; collision, sensors, drawing and the planner work on `bodies()` whatever the drive. Rejected: a model module per drive behind an interface (more indirection for one function each).
  ```ts
  drive:
    | { kind: "ackermann", steer_axle: "front" | "rear" | "all" | "crab" }
    | { kind: "skid", track: number }
    | { kind: "frame", pivot: number }
  hitches: TrailerSpec[] // [] car, [box] today, [cart, cart, cart] baggage train
  ```
- **Where they appear:** every vehicle is in the yard's garage the day it lands; a parking spot lists a vehicle only once the planner proves it; games bring their own vehicles. Rejected: adding exotic vehicles to every parking kind they fit (planner and test-time cost).
- **Order:** W1 spec-only vehicles + one-hinge rigs + the decided rigs (one agent, alongside the forklift); W2 the drive union and the hitch chain (baggage train, road train, drawbar, tractor + two, semi); W3 skid, frame, all-wheel and crab steer; W4 the fun ones. The tug and plane come with the pushback game.
- **Forklift:** its rear steering goes in as `drive: { kind: "ackermann", steer_axle: "rear" }` from the start, so W2 doesn't reshape it.

## Wave 2 (decided 2026-10-29)
- **Jackknife:** a limit per hinge in each `TrailerSpec` (car ball about 70°, semi kingpin about 80°, drawbar about 60°, baggage cart about 75°); going past it at any hinge ends the round, the ring at that hinge. Rejected: only the first hinge counts (odd folding, crashes hard to read).
- **Spots:** wave 2 adds the loading dock (semi, truck + drawbar trailer, road train where proven). The baggage train waits for the airport game and the tractor + two trailers for the coverage game; every chain vehicle is in the garage straight away. Rejected: a spot for every chain vehicle now, garage only.
- **Reversing:** the one-hinge semi reverses square to a dock door, proven like today's trailers; rigs with two or more hinges get pull-through dock lanes, proven by a forward-only search from the real start. Reversing them is allowed, never required. Rejected: every chain must reverse in.
- **Trucks now:** the parked trucks topic joins wave 2: a cab-over tractor with a 13.6 m semi-trailer, a box truck, and a truck with a drawbar trailer, all with the loading dock.

## Feel over size (2026-10-29)
Owner: "start working on the other ones when you can - the ones that actually have different feel". Most wave 1 vehicles differ only in size; the next work favours vehicles that drive differently: wave 2 (hitch chains, the trucks) and wave 3 (skid, frame, all-wheel and crab steer), before more size variants. Ideas kept for later: spots or jobs that need a given vehicle (ambulance bay, taxi rank, hydrant, bin points), weight and acceleration per vehicle, sight lines.

## Action items
- [x] ADR-088 (accepted)
- [x] W1 agent alongside the forklift after Drive Hub ships (2026-10-29: see the ADR-088 revisions; the tractor is garage-only for now)

## Next session topics
- Which parking kinds each new car-like vehicle joins; planner proofs for chains of hinges; skid-steer and frame-steer proofs.
