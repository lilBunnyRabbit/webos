# Tight Spot: more vehicles and a trailer
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner: "Maybe including different cars? bigger cars like busses? of multipart cars with trailrs. i would love a normal car with trailer."
Today one car, `HATCHBACK` in `vehicle.ts`; every model function already takes a `VehicleSpec` (default `HATCHBACK`). Kinds, bays and the planner tests assume the hatchback. Follows [ADR-086](../adrs/086-tight-spot.md) and the [first brainstorm](2026-10-28_tight-spot.md).

## Decisions
- **Scope:** the roster and the trailer ship together in one release.
- **Roster:** hatchback, hatchback + single-axle box trailer (2.5 m, ball 1.0 m behind the rear axle), van (5.9 m, 3.7 m wheelbase, 6.6 m turn), pickup (5.3 m), city bus (12 m, 2.55 m wide, 5.9 m wheelbase, 3.6 m rear overhang, ~11 m turn, slower steering).
- **Who picks the vehicle:** the spot. A kind declares its vehicles; the seed picks one of them and sizes the bay to it. Existing car kinds list hatch, van and pickup. Bests stay keyed per kind. Rejected: player picks (every kind × every vehicle through the planner, bests keyed per vehicle); a separate Towing mode (more UI).
- **New spots:** slipway and driveway (trailer, reversing), bus stop lay-by and depot (bus).
- **Where they show:** everywhere. Levels grow from 27 to about 39 with the new kinds woven in by difficulty; Any and the daily can roll them; the open lot stays hatchback-only.
- **Trailer state:** an optional field on `Car`: `trailer?: { heading; roll: [number, number] }`, the spec gains `trailer?: TrailerSpec`. Trailer kinematics: `φ' = v/Lt·sin(θ−φ) − h·v·tanδ/(L·Lt)·cos(θ−φ)`. Rejected: a `Rig` wrapper (more plumbing in game and draw), a generic chain (speculative).
- **Jackknife:** a hitch angle past ~70° ends the round like a contact, `hit.kind = "jackknife"`, the ring at the coupling. Rejected: hard stop, warning only.
- **End bay** (added during the build, from the owner's sketch): the last perpendicular bay in the corner of a narrow dead-end aisle, every other bay taken, the one opposite too; hatch, van or pickup; nose in or reverse in, reverse in likelier the tighter it gets.
- **Planner proof for trailer spots:** search a forward path from the parked pose out to the start (forward towing is stable), then assert the reversed path replays into the bay within 5 cm and 1°. Rejected: searching with the trailer angle in state (slow), hand-authored paths (no seeded variety).
- **Shell:** nothing. The spot decides the vehicle, so there's no prop or command; `app launch tight-spot` stays the way in.
- **Camera:** zoom by vehicle length so a bus covers about the share of the screen a hatchback does, capped so bays stay readable.

## Key takeaways
- Most of the roster is data; the trailer is the one new model, and reversing it is the new skill the game teaches.
- A best per kind now mixes vehicles of different difficulty (accepted with "spot decides").

## Action items
- [x] ADR-086 revision note (owner: a note, not a new ADR)
- [x] Build: specs, trailer model + tests, two-body collision and hitch check, drawing (trailer, bus), four new kinds, levels, planner replay test, camera zoom, docs/apps page, guide, changelog `new`, plus the end bay
- [ ] Feature review, then desktop and mobile visual pass before push

## Next session topics
- Trailer types (boat, caravan), rear-steer bus, a vehicle picker in the open lot
