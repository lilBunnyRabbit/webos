# ADR-087: Drive Hub
**Date:** 2026-10-28
**Status:** Accepted

## Context
Tight Spot ([ADR-086](086-tight-spot.md)) built a driving core (kinematic vehicles with trailers, polygon collision, a camera with insets, controls, vehicle drawing, sensors, a solvability planner) that more games than parking could use: a forklift warehouse, airport pushback, a ferry loader and others. Decided in [the driving hub brainstorm](../brainstorm/2026-10-28_driving-hub.md).

## Decision
- Tight Spot becomes **Drive Hub**, a hub for driving games, and keeps its id `tight-spot`; the parking game inside keeps the name Tight Spot. The display name changes when the hub ships, so storage, bests, achievements, the daily and links carry over.
- The app splits into `core/` (shared driving code), `games/{id}/` (one folder per game, parking first) and `hub/` (the yard).
- A game is picked by driving into its building in a small hub yard, or from a menu that jumps straight to it.
- The yard is also a playground: free driving with a garage pad that swaps to any vehicle the app has.
- The shared core stays inside the app. It moves to `$kit` only when another app needs it.
- First new game: a forklift warehouse with rear-wheel steering, picking and dropping pallets, judged like parking per pallet.
- The restructure is a refactor with no behaviour change, after the current Tight Spot work lands.

## Alternatives Considered
- Separate apps on a `$kit/drive` module: each game visible in the store, but an up-front extraction and a kit API shaped by two games.
- Modes inside Tight Spot's toolbar: no structure, a crowded app.
- A new hub app that Tight Spot moves into: data migration, broken links, an app removed from installs.
- Rack heights for the forklift: more UI for little top-down gain.

## Consequences
- One large app; folders keep games apart.
- The id `tight-spot` stays even for games that aren't parking.
- Each game still owns its levels, judging, cards and achievements; shared progress (achievements, the daily) needs per-game ids inside the app.
