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
