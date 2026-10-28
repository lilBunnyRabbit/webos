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

- **Old stars after the renumbering (decided after the build):** accept the shift. Tight Spot shipped the same day, so few players have stars; unlocks stay valid. Rejected: a one-time star migration, appending the new kinds as levels 28–42.

## Key takeaways
- Most of the roster is data; the trailer is the one new model, and reversing it is the new skill the game teaches.
- A best per kind now mixes vehicles of different difficulty (accepted with "spot decides").

## Action items
- [x] ADR-086 revision note (owner: a note, not a new ADR)
- [x] Build: specs, trailer model + tests, two-body collision and hitch check, drawing (trailer, bus), four new kinds, levels, planner replay test, camera zoom, docs/apps page, guide, changelog `new`, plus the end bay
- [ ] Feature review, then desktop and mobile visual pass before push
- [x] Precision score (formula, card, Perfect badge, Perfect park achievement) and vehicle picker (Spots and open lot, bests per kind and vehicle), ADR-086 revision note

## Trucks (later the same day)
Owner: "Oh no truck car option?", then: "the classic European truck you see with trailers. Lets work on that later". Parked for a later session; draft picks to revisit then:
- **Semi:** tractor (about 6 m, 3.8 m wheelbase) with a 13.6 m semi-trailer on a fifth wheel just ahead of the tractor's rear axle. The same one-trailer model (`TrailerSpec`, hitch offset slightly negative); jackknife limit wider than the car's (about 80°, a cab clears more).
- **Box truck:** a rigid 7.5 t truck, about 8 m with a long rear overhang, a plain `VehicleSpec`.
- **Loading dock:** new kind, reverse square to a dock door between parked trucks; semi and box truck. The depot also allows the box truck.
- Rejected for now: a drawbar trailer (second hinge, model change), a truck stop.

## Precision, vehicle choice and more rigs (later the same day)
Owner: "do precision score", "love more trailers, good bus options, yes definetly pick vehicle for open lot. if possible i would have for all types of parkings the choice of car type?"
- **Precision (decided):** its own 0–100% score from centring (side gaps and depth balanced in the bay) and straightness, with the side, depth and angle errors shown on the parked card; 95% or more earns a "Perfect" badge. Stars stay moves-only. Bests keep their order (moves, then time) and also remember the best precision. Rejected: precision gating the third star (old results can't be re-judged), precision as the tie-break (changes what a best means).
- **Vehicle choice (decided):** a vehicle picker next to the spot picker: Any (the seed picks, as now) or one of the kind's allowed vehicles. Levels and the daily keep their seeded vehicle. The open lot gets the picker with hatchback, van, pickup and hatchback + trailer (review: no Any there, hatchback by default, as now). Rejected: every vehicle in every kind (14 kinds × 6+ vehicles through the planner, combos needing new layouts), keeping it as is.
- **Bests (decided):** per kind and vehicle, keys `kind:vehicle`; an old `kind` key reads as the hatchback's (every best before 3.82 was a hatchback). Review: no legacy reading at all, old keys are ignored (owner: "Dont worry about legacy support its basically just me who used the app").
- **More rigs (decided):** boat trailer (long and narrow, the boat overhanging past its axle; slipway), caravan (wider than the car, axle far back; a new camping pitch spot between caravans and hedges), articulated bus (18 m, the trailer hinge model; bus stop and depot), coach (13–15 m with a tag axle) and double-decker (specs and drawing).
- **Order:** polish pass, then precision + vehicle picker, then the new rigs (they share files).

## Next session topics
- Trailer types (boat, caravan), rear-steer bus, a vehicle picker in the open lot
