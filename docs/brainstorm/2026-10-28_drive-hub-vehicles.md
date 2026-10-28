# Drive Hub: every vehicle
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner asked what vehicles to add; after the list: "tbh i would want all of them". Today `core/vehicle.ts` is a kinematic front-steer model with an optional single trailer; the forklift (in progress) needs rear-wheel steering. Earlier decisions: [vehicles](2026-10-28_tight-spot-vehicles.md), [Drive Hub](2026-10-28_driving-hub.md).

## The list
- **Spec only:** city car, SUV, limo, camper van, garbage truck, fire engine; taxi, police car and ambulance as looks.
- **One hinge (today's trailer model):** car + horse box, tractor + farm trailer, quad + small trailer; airport tug + plane (with the pushback game); plus the decided rigs (boat trailer, caravan, articulated bus, coach, double-decker).
- **New steering models:** rear steer (forklift, telehandler, combine harvester); a chain of hinges (airport baggage train, road train, truck + drawbar trailer, tractor + two trailers, the semi from the trucks topic); skid steer (bobcat, zero-turn mower, tank); frame steer (wheel loader, articulated dump truck); all-wheel and crab steer (fire-truck ladder with a rear driver, some buses).
- **For fun:** tuk-tuk, golf cart, ice resurfacer, shopping trolley.

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

## Action items
- [x] ADR-088 (accepted)
- [ ] W1 agent alongside the forklift after Drive Hub ships

## Next session topics
- Which parking kinds each new car-like vehicle joins; planner proofs for chains of hinges; skid-steer and frame-steer proofs.
