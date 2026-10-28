# ADR-087: Drive Hub
**Date:** 2026-10-28
**Status:** Implemented (steps 1 and 2: the split and the hub; the forklift is next)

## Context
Tight Spot ([ADR-086](086-tight-spot.md)) built a driving core (kinematic vehicles with trailers, polygon collision, a camera with insets, controls, vehicle drawing, sensors, a solvability planner) that more games than parking could use: a forklift warehouse, airport pushback, a ferry loader and others. Decided in [the driving hub brainstorm](../brainstorm/2026-10-28_driving-hub.md).

## Decision
- Tight Spot becomes **Drive Hub**, a hub for driving games, and keeps its id `tight-spot`; the parking game inside keeps the name Tight Spot. The display name changes when the hub ships; the id keeps achievements, the daily and links.
- The app splits into `core/` (shared driving code), `games/{id}/` (one folder per game, parking first) and `hub/` (the yard).
- A game is picked by driving into its building in a small hub yard, or from a menu that jumps straight to it.
- The yard is also a playground: free driving with a garage pad that swaps to any vehicle the app has.
- The shared core stays inside the app. It moves to `$kit` only when another app needs it.
- First new game: a forklift warehouse with rear-wheel steering, picking and dropping pallets, judged like parking per pallet.
- The restructure is a refactor with no behaviour change, after the current Tight Spot work lands.

- **Game contract:** `define_game({ id, name, icon, building, achievements, load })` per `games/{id}/index.ts`, a lazy `game.svelte`, listed in `games/index.ts`; games build from shared core components.
- **Storage:** every game under `app.tight-spot.{game}.*`, parking included; shared settings at the top level; no migration of older keys (the app has no other players yet).
- **Landing and links:** the yard first; a `game` prop (`yard`, `parking`, `forklift`) and the daily go straight in. No shell commands.
- **Forklift:** `VehicleSpec.steer_axle` (`front` or `rear`) in the core model; jobs of 1–4 pallets; stars for the job, moves and a par time; precision per drop; one Fork control.

## Alternatives Considered
- Separate apps on a `$kit/drive` module: each game visible in the store, but an up-front extraction and a kit API shaped by two games.
- Modes inside Tight Spot's toolbar: no structure, a crowded app.
- A new hub app that Tight Spot moves into: data migration, broken links, an app removed from installs.
- Rack heights for the forklift: more UI for little top-down gain.

## Revision 2026-10-28 (steps 1 and 2: implementation)
- **Split.** `core/` holds the model, collision with a broad phase (`obstacles.ts`), the scene shapes (`scene.ts`), camera, drawing primitives, sensors, sound, planner, frame loop, keys, the input (`DriveInput`), the shared settings (`DriveSettings`) and the components every game uses: `drive-frame.svelte` (toolbar, board, canvas, zoom, touch wheel and pedals, keys, status bar, as snippets and bindings), the gear strip, the speed chip, round cards, key hints and the settings panel. `games/parking/` holds the rest of the old app, its `draw_scene` built on the core primitives. Same pixels, checked before and after on desktop and a 390 px and 844 px phone.
- **No context.** Shared state goes down as props: the shell owns `DriveSettings` (and the yard's vehicle) per window and hands them to the active view; the settings stay at the top of storage as they were.
- **Contract details the ADR left open.** `icon` is a Phosphor icon (the switcher's system menu takes one); `building` is a `Building` value (`car-park` so far) the yard draws; `GameProps` is `{ settings, daily?, menu?, onexit? }`, `menu` the switcher snippet a game renders first in its toolbar.
- **Picking a game.** In the yard the vehicle's nose in a doorway (or its 4 m apron) shows a card with Enter; nothing enters on its own. The menu is a signpost button opening the system menu (`dialogs.menu`, a sheet on phones), the last game labelled "· last" and its doorway glowing.
- **Closed buildings.** The yard has two plots; one with no registered game is shut (a shutter, labelled Soon), so the forklift needs no yard change to appear.
- **Playground contact.** A step that would touch something, or jackknife, doesn't happen: the vehicle stops where it was, one thunk, a fading ring. The garage pad offers every vehicle and puts the new one on the pad.
- **Landing.** The yard starts at the gate in the hatchback; the yard's vehicle and position aren't stored (no persistence beyond `app.tight-spot.last`). Back from a game puts the vehicle outside that game's doorway.

## Revision 2026-10-28 (review fixes and yard polish)
- **Owner-confirmed as built.** Entering a game takes the card plus Enter or a tap, never driving in alone; a building whose game isn't registered stands shut and says Soon.
- **Play tracking in the shell.** `track_play` moved from the parking game to `tight-spot.app.svelte`: one Game Hub session per window, time in the yard and every game counts. `GameProps` gained `play` (the tracker) so a game still reports its daily.
- **Loading and failure.** While a game's chunk loads, the shell shows its toolbar (switcher and name) over "Opening …"; a failed load reports an error and returns to the yard.
- **Landing.** The yard is framed whole, clear of the HUD, cards and touch controls, until the first input; then the 34 m follow takes over. The welcome card shows on the first visit only (`app.tight-spot.yard_intro`); the guide keeps the help.
- **Yard look.** Roof signs with the game's name and icon (the shut one named after what's coming, Warehouse), lit doorways, real cones and round bollards drawn at a readable size. The switcher reads "Games" where it fits.
- **Loop.** The yard's frame loop stays up while the front wheels catch up with the steering wheel.

## Consequences
- One large app; folders keep games apart.
- The id `tight-spot` stays even for games that aren't parking.
- Each game still owns its levels, judging, cards and achievements; shared progress (achievements, the daily) needs per-game ids inside the app.
