# Drive Hub games

How to add a game to Drive Hub (`tight-spot`): the contract, what the driving core gives, what a game owns, how to prove and check it, and every gotcha the forklift Warehouse ran into. The Warehouse (`games/forklift/`) is the reference: copy its shape. The app itself is on [Drive Hub](tight-spot.md); the decisions are [ADR-087](../adrs/087-driving-hub.md) (hub, contract, storage), [ADR-088](../adrs/088-vehicle-models.md) (vehicles) and [the hub brainstorm](../brainstorm/2026-10-28_driving-hub.md).

## Steps

1. A brainstorm and the owner's grill for the game (round, scoring, controls, shell), as the forklift had.
2. Any core change it needs lands first, in its own commit, with its own tests (the forklift's rear steer did).
3. `games/{id}/`: `index.ts` (`define_game`), `game.svelte` (lazy), the world, the round model, `draw.ts`, tests and proofs.
4. Register it in `games/index.ts` (`GAMES`, in yard order) and add its id to `GAME_CHOICES` if the `game` prop doesn't list it yet. Give it a `Building` kind and a roof in `hub/draw.ts`. The yard has two plots; a third game needs a bigger yard (a decision).
5. Guide section, a section on [Drive Hub](tight-spot.md), changelog, ROADMAP line, ADR-087 revision.
6. Visual check (below), then review.

## The contract

`games/{id}/index.ts`:

```ts
export default define_game({
  id: "forklift",                       // the `game` prop's value and the storage prefix
  name: "Warehouse",                    // the roof sign, the switcher, the doorway card
  icon: WarehouseIcon,                  // a Phosphor icon
  building: Building.WAREHOUSE,         // how its building looks in the yard
  achievements: [{ id: "forklift-first", … }], // merged into the app's list: ids unique across games
  load: () => import("./game.svelte"),  // the only thing the shell loads
});
```

The component takes `GameProps`: `settings` (the shared `DriveSettings`, owned per window by the shell), `daily` (the day the app was opened with; parking's), `menu` (the Games switcher snippet: render it first in the toolbar), `play` (the window's Game Hub tracker) and `onexit` (back to the yard). It keeps all its own state; nothing is shared through a context. It stores under `app.tight-spot.{id}.*` (`storage.persisted("forklift.best", …)`), never at the top level, which holds the shared settings.

The shell lazy-loads the component the first time it's entered, shows the game's toolbar over "Opening …" meanwhile, and returns to the yard with an error toast if the chunk fails.

## What the core gives

| Need | Core |
|------|------|
| A vehicle | `VEHICLES`, `VehicleSpec` (`drive`, `forks?`, `reverse_beeper?`, `trailer?`), `create_car`, `step`, `shift`, `bodies`, `fork_corners`, `axles`, `body_ends`, `rig_ends`, `body_centre`, `without_creep` (`core/vehicle.ts`) |
| Collision | `obstacles(scene)` (bounds cached per scene object), `collide(car, near, spec)`, `collide_shape(shape, near)` for one body under a game's own rules, `overlaps`, `inside_convex`, `contact_point` |
| Scene | `Solid` kinds (wall, pillar, post, kerb, shelf, water, car, rack, pallet), `Bay`, `Mark`, `Surface` (`core/scene.ts`) |
| The frame | `drive-frame.svelte`: toolbar, board with canvas and its DPR resize, palette per theme, wheel and pinch zoom, touch wheel or buttons and pedals, keys from the whole window. Snippets `toolbar`, `overlay`, `status`, `pedal_top` (a game control over the pedals on touch); binds `board`, `canvas`, `size`, `palette`, `zoom`, `stage_rect`, `steer_box`, `pedal_box`; callbacks `engage`, `onpress`, `onsteer`, `onkeydown`, `onrelease` |
| Input | `DriveInput` (`step_wheel`, `read`, `follow`, `set_wheel`, `press`/`lift`, `release`, `reset`), `GEAR_KEYS`, `DRIVE_KEYS`, `key_direction`, `STANDING`, `zoom_step`, `is_field` (`core/keys.ts`) |
| The loop | `frame_loop(run, render, going)`: each frame split into steps of at most 1/120 s |
| Camera | `frame(bounds, focus, w, h, zoom, insets, span)`, `fit_span` (frame a whole area clear of insets), `view_span`, `ease`, `OVERLAY_ASPECT`, `OVERLAY_GAP` |
| HUD and cards | `GearStrip` (`space_parks={false}` if the game takes Space), `SpeedChip`, `RoundCard` (bottom, or left on a wide board), `KeyHint`, `SettingsPanel` |
| Drawing | `read_palette` (theme tokens only: ground, marks, walls, paint, `ink`/`glow`, target/free/parked, `steel`, `beam`, `upright`, `wood`, `load`, `stock`, `beacon`), `begin_frame`, `ground`, `solids`, `outlined`, `union`, `fill`, `path`, `player(…, time)`, `pallet`, `guides`, `beams`, `sensor_arcs`, `bay_outline`, `bay_arrow`, `bay_pointer` (off-screen arrow inside the insets), `contact_rings` |
| Sound | `Sounds`: `sensor`, `crash`, `parked(record)`, `shift`, `reverse_beeper(on)` (call every frame), `fork(up)`, `quiet`, `close` |
| Proofs and par | `plan(from, to, near, options)` hybrid A* with `arrive`, `blocked`, `steering`, `switch_cost`, `directions`, `max_expansions`; `drive(pose, move, spec)`; `inflate` |
| Scoring | `fit(points, headings, bay)` precision (`core/precision.ts`), `MAX_ANGLE`, `PERFECT` |
| Seeds | `hash(seed, …values)` (`core/seed.ts`), `create_rng`, `daily_seed(day, key)` |

## What a game owns

- **The world**: a pure builder from a seed and a difficulty (`build_warehouse`, `build_floor`), sized so the planner can prove it; solids for what never moves, its own list for what does.
- **The round**: `GameState` and a status machine (ready, driving, paused, an end); `advance(state, input, dt, spec)` that steps the vehicle and applies its contact rules; its own actions (`use_fork`) and the hint for why one is off.
- **Judging and scoring**: stars, par, precision, bests, levels, random rounds, the daily.
- **Cards, HUD text, keys** beyond the shared ones, and its touch control over the pedals.
- **Achievements** with ids prefixed by the game (`forklift-…`), progress through `achievements.progress`.
- **Storage keys** under `app.tight-spot.{id}.*`, each with a zod schema.
- **Docs**: a section on the Drive Hub page and in the guide.

## The component

Start from `games/forklift/game.svelte`. The pieces every game repeats:

- State: `game = $state.raw(create_game(…))`; camera, readings and timers in plain `let`s, not state.
- Effects: pause and release the keys when the window is hidden or unfocused (`blocked`); `sounds.close()` on unmount; `win.on_back` (settings, then pause, then `onexit`); the frame loop only while driving and not blocked; one render effect for everything else, listing what it depends on.
- `run(steps, dt)`: step the wheel and `advance` per step, `input.follow`, sounds once per frame, then set `game` once.
- Keys: Escape, Enter, zoom, R after a round, then the game's own keys (before the gear map), then the drive keys with `choose_direction` on a fresh press, then C and the gear keys.
- Camera: the whole floor before the start (`fit_span` clear of the card), then follow at a fixed span; `control_insets()` for the HUD band, the end card and the sideways touch controls, the same insets for `bay_pointer`.
- Cards: start (title, a one-line brief, the task list, par and best, keys on a fine pointer, one line for touch), paused overlay, done (stars revealed, badges, numbers), crashed (what was touched).

## Testing and proofs

- Pure logic in `.ts` with Node tests next to it: the builder (determinism, every slot fits and touches nothing, the start is clear), the rules (each action's conditions at their edges, contacts), scoring, levels.
- **Prove it can be done from the real start.** Plan the whole round from the vehicle as `create_game` places it, with the bodies grown 5 cm, then replay every move in 15 cm pieces with the real bodies and no margin and judge the ends as a round would (`prove()`). Parking's cheaper "out of the bay" search is only sound with no trailer and only for one goal.
- **Search for a region, finish analytically.** A goal window of centimetres (forks in a pallet's pockets) is hard for a coarse search; `arrive` on "lined up with it" and a straight run in at the end found every leg.
- **Test time:** each test at most a quarter of its timeout on the owner's machine (CI is two to three times slower); split long proofs over files so they run side by side. The forklift: 16 levels in two files at 0.4–5.3 s each, eight jobs and a daily in a third, 60 s timeouts.
- Every level is proven; random rounds are sampled over fixed seeds.

## Visual check

Restart the dev server first (gotcha 1). Then, with Playwright's Chromium and screenshots read back:

- Desktop wide (a 1400 × 900 viewport) and narrow (about 640 px), keyboard only: the start card and the whole floor, driving, pause, the end cards, the Games menu and back to the yard (the building's roof and doorway).
- `?platform=mobile` at 390 × 844 and 844 × 390 with touch: toolbar on one row, the HUD readable, the game's control over the pedals, nothing cut off, the card clear of the controls.
- Brand Light and Brand Dark: token hues differ a lot (gotcha 8).
- Zoomed in on the vehicle and the props: detail reads, nothing drawn in the wrong order.
- Play a round end to end with real keys or touch (gotcha 16).

## Gotchas

1. **The dev server in an agent worktree doesn't see edits.** `vite.config.ts` ignores `**/.claude/**` for watching, so a worktree's dev server serves the code it started with. Restart it after every change before a screenshot.
2. **Space is Park.** `GEAR_KEYS` maps Space to P; a game that takes Space handles it before the gear map and passes `space_parks={false}` to the gear strip.
3. **Steered wheel angles need `atan2`.** At a forklift's lock the turn centre lies inside the track and the inner wheel turns past 90°; `atan` folded it back.
4. **The pose is the unsteered axle.** For rear steer that's the front axle, so "length − rear overhang is the nose" is wrong: use `body_ends()` and `rig_ends()` (fork tips included).
5. **`bodies()` includes the forks.** A rule that treats one body differently (forks in pockets) checks the bodies itself with `collide_shape`.
6. **Screen-space text.** Names drawn with `setTransform` must be wrapped in `save`/`restore`, floor names before the vehicle and markers after it.
7. **Draw order follows height.** A pallet's deck is over the tines that slide under it, so pallets are drawn after the forklift; nothing else of it can overlap one.
8. **Theme hues swing.** The warning token is amber in Brand Dark and olive in Brand Light; `primary` is a pale green on one and brown on the other. Detail on a body uses `ink` and `glow`, beams only show on dark ground (`palette.beams`).
9. **Labels collide far out.** "Dock A … Dock E" ran together at the start card's scale: shorten by scale, hide rack names below 14 px a metre.
10. **The planner at runtime takes seconds.** A four-pallet par took up to six: it runs in a one-shot worker per round (`par.worker.ts`, like Nonogram's analysis); the round can finish before it does, so stars and bests are recorded once both are in.
11. **Planner paths are a computer's.** Its changes of direction aren't a fair par for moves (it shuffles); finer steering shares and a higher switch cost halved them, and par moves are a formula. Its distance is fine for a par time.
12. **The daily.** The app's `daily` prop and its single `daily_rank` belong to parking. The forklift reports under the mode key `tight-spot/forklift` (ADR-050) with stars lost as the score; a Game Hub row for it needs a per-mode `daily_rank`, which would move parking's results to `tight-spot/parking`: the owner's call.
13. **Phones: the HUD's top row is the gear strip.** At 44 px touch targets it fills a 390 px board; text chips go on their own row under it.
14. **Phones: the toolbar.** Games, two selects, settings and New is all one 390 px row holds; Restart moves into the pause overlay and the card below `@md`.
15. **Keep the start card short.** On a narrow board it covers the floor: one line of brief, the rules in the guide and in the contextual hint.
16. **Real key driving, deterministically.** A closed-loop driver over `DriveInput` and `advance` in Node turns the planner's moves into key presses (stop, set the wheel standing, drive each arc with small corrections: planner paths jump in curvature, and the keyboard wheel takes a second from centre to lock). Replay them under `page.clock` one 16 ms `runFor` per frame, after starting the round, so every frame is two 8 ms steps as in Node. Open-loop timing in a live browser drifts into a rack within seconds.
17. **Tracking needs margin.** The planner's paths keep 5 cm; a driver following one by keys wanders more than that around tight turns, so a replay that has to finish uses the gentlest level.
18. **Caches are per object.** `obstacles(scene)` caches bounds in a WeakMap keyed by the scene: build the scene once per round, not per frame.
