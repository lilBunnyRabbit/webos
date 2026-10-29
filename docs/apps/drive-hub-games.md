# Drive Hub games

How to add a game to Drive Hub (`tight-spot`): the contract, what the driving core gives, what a game owns, how to prove and check it, and every gotcha the forklift Warehouse ran into. The Warehouse (`games/forklift/`) is the reference: copy its shape. The app itself is on [Drive Hub](tight-spot.md); the decisions are [ADR-087](../adrs/087-driving-hub.md) (hub, contract, storage), [ADR-088](../adrs/088-vehicle-models.md) (vehicles) and [the hub brainstorm](../brainstorm/2026-10-28_driving-hub.md).

## Steps

1. A brainstorm and the owner's grill for the game (round, scoring, controls, shell), as the forklift had.
2. Any core change it needs lands first, in its own commit, with its own tests (the forklift's rear steer did).
3. `games/{id}/`: `index.ts` (`define_game`), `game.svelte` (lazy), the world, the round model, `draw.ts`, tests and proofs.
4. Register it in `games/index.ts` (`GAMES`, in yard order) and add its id to `GAME_CHOICES` if the `game` prop doesn't list it yet. Pick its `Building` kind (`games/define.ts`); a new kind gets its plan in `hub/blueprints.ts` and its look in `hub/buildings.ts`. Give its id a district in `DISTRICTS` (`hub/yard.ts`): Town, Sport, Waterfront or Industrial; without one it gets a lot by the gate. The town needs nothing else: its district's row grows by a slot.
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

The component takes `GameProps`: `settings` (the shared `DriveSettings`, owned per window by the shell), `daily` (the day of the daily the app was opened with, given only to the game it names), `menu` (the Games switcher snippet: render it first in the toolbar), `play` (the window's Game Hub tracker) and `onexit` (back to the yard). It keeps all its own state; nothing is shared through a context. Bests, levels and ghosts go in a file in the app data folder (`storage.file("{id}.json", …)`, ADR-035); only last choices go under `app.tight-spot.{id}.*` localStorage, never at the top level, which holds the shared settings.

The shell lazy-loads the component the first time it's entered, shows the game's toolbar over "Opening …" meanwhile, and returns to the yard with an error toast if the chunk fails.

## What the core gives

| Need | Core |
|------|------|
| A vehicle | `VEHICLES`, `VehicleSpec` (`drive`, `hitches`, `forks?`, `reverse_beeper?`), `create_car`, `step`, `travel`, `shift`, `set_crab`/`can_crab`, `bodies`, `headings`, `nose`, `front_frame`, `frame_ends`, `fork_corners`, `axles`, `body_ends`, `rig_ends`, `body_centre`, `without_creep` (`core/vehicle.ts`) |
| A hitch chain | `Car.trailers` (one per link), `trailer_poses`, `trailer_pose`, `trailer_corners`, `trailer_wheels`, `hitch_point` (each by link index), `hitch_angles` (raw hinge angles: a link at rest π reads ±π at rest), `folds` (each hinge's angle from its link's `rest`: what limits and judging should read), `jackknife` (the first hinge whose fold is past its `max_angle`, or −1; limits measure from rest), `jackknifed`, `rest_trailers` (the chain at rest behind a heading), `chain_rests` (the rests summed down the chain), `hangs_ahead` (the last link points forward: sensors, guides and tail lamps go to the front), `trailer_sweep`, `tow` |
| Collision | `obstacles(scene)` (bounds cached per scene object), `collide(car, near, spec)`, `collide_shape(shape, near)` for one body under a game's own rules, `overlaps`, `inside_convex`, `contact_point` |
| Scene | `Solid` kinds (wall, pillar, post, kerb, shelf, water, car, rack, pallet), `Bay`, `Mark`, `Surface` (`core/scene.ts`) |
| The frame | `drive-frame.svelte`: toolbar, board with canvas and its DPR resize, palette per theme, wheel and pinch zoom, touch wheel or buttons and pedals, keys from the whole window. Snippets `toolbar`, `overlay`, `status`, `pedal_top` (a game control over the pedals on touch); binds `board`, `canvas`, `size`, `palette`, `zoom`, `stage_rect`, `steer_box`, `pedal_box`; callbacks `engage`, `onpress`, `onsteer`, `onkeydown`, `onrelease` |
| Input | `DriveInput` (`step_wheel`, `read`, `follow`, `set_wheel`, `press`/`lift`, `release`, `reset`, `toggle_signal`, `signal`), `GEAR_KEYS`, `DRIVE_KEYS`, `CRAB_KEY` (V), `key_direction`, `STANDING`, `zoom_step`, `is_field`, `steer_hints(spec)` and `drive_note(spec)` for the cards (`core/keys.ts`) |
| Grip | Built into `step()` for a spec that sets `a_lat` (the GT and F1 cars, the motorcycle, Hot Lap's race spec): the steering target is held to `grip_lock(speed, spec)`, curvature at most `a_lat / v²`; skid steer and crab mode exempt; no `a_lat`, no cap. `top_speed(spec)` (`core/vehicle.ts`) |
| Signals | `Signal`, `SIGNAL_KEYS` (Z, X; the D-pad sends them), `toggle_signal`/`signal_after` (self-cancel when the wheel unwinds), `blink_lit`, `BLINK_PERIOD` (`core/signal.ts`); `Input.signal`; DriveFrame's `signals` prop for the touch buttons; `Sounds.indicator(on)` every frame; `player(…, time, signal)` draws the blinkers. Opt-in: a game that ignores signals does nothing |
| The loop | `frame_loop(run, render, going)`: each frame split into steps of at most 1/120 s |
| Camera | `frame(bounds, focus, w, h, zoom, insets, span)`, `fit_span` (frame a whole area clear of insets), `view_span`, `ease`, `OVERLAY_ASPECT`, `OVERLAY_GAP` |
| HUD and cards | `GearStrip` (`space_parks={false}` if the game takes Space), `CrabToggle` (beside the strip, for a vehicle `can_crab`), `SpeedChip`, `RoundCard` (bottom, or left on a wide board), `KeyHint`, `SettingsPanel` |
| Drawing | `read_palette` (theme tokens only: ground, marks, walls, paint, `ink`/`glow`, target/free/parked, `steel`, `beam`, `upright`, `wood`, `load`, `load_edge`, `stock`, `beacon`), `begin_frame`, `ground`, `solids`, `outlined`, `union`, `fill`, `path`, `player(…, time)`, `pallet(…, PalletLoad.BOXES | WRAPPED, …)`, `guides`, `beams`, `sensor_arcs`, `bay_outline`, `bay_arrow`, `bay_pointer` (off-screen arrow inside the insets), `contact_rings` |
| Sound | `new Sounds(() => settings)`: call it unguarded, it checks Sound and Rumble itself; `sensor`, `crash`, `parked(record)`, `shift`, `reverse_beeper(on)` and `indicator(on)` (call every frame), `fork(up)`, `quiet`, `close` |
| Proofs and par | `plan(from, to, near, options)` hybrid A* with `arrive`, `blocked`, `steering`, `crabbing`, `switch_cost`, `directions`, `max_expansions`; `drive(pose, move, spec)` with `Move` `{ steer, distance, crab? }`; `inflate` |
| Scoring | `fit(points, headings, bay)` precision (`core/precision.ts`), `MAX_ANGLE`, `PERFECT` |
| Seeds | `hash(seed, …values)` (`core/seed.ts`), `create_rng`, `daily_seed(day, key)` |

## Drive kinds

`VehicleSpec.drive` is how a vehicle steers. A game that takes any vehicle must not assume a car: read the body, the ends and the headings from the core, never from the pose and the spec's lengths.

| Drive | Vehicles | Pose | `car.steer` | What changes for a game |
|-------|----------|------|-------------|-------------------------|
| `ackermann`, `front` | cars, buses, trucks, rigs | rear axle | wheel angle | nothing |
| `ackermann`, `rear` | forklift | front axle | wheel angle | the tail swings out |
| `ackermann`, `all` | ladder truck | middle of the wheelbase | front wheel angle; the rear counter-steers | half the turning circle, the tail swings the other way |
| `ackermann`, `crab` | telehandler | middle | front wheel angle | `car.crab` (`set_crab`, V, the Crab chip) slides it along the wheels without turning |
| `skid` (`track`) | skid-steer loader, mower, tank | middle of the contact (the mower's drive axle) | the wheel's share, −1 to 1 | full lock pivots on the spot with gas; `speed` is the outer side's |
| `frame` (`pivot`) | wheel loader, dump truck | rear axle | the joint's bend | two bodies; the bend moves the vehicle at a standstill; the front frame must line up too |

- Collide through `bodies()` and judge parked through `headings()` (it has the front frame's heading): a frame steer's front frame turns away from `car.heading`.
- The front is `nose()` and the front frame's pose `front_frame()`; the rear sensor reads the rear frame (`sensor_frame` does both).
- Stop a blocked step without taking the new bend (the yard's `drive` keeps `was.steer` for a frame steer), or the stopped vehicle bends into what it touched.
- The planner handles every drive; give `plan` the spec. A frame steer's bend ramps as it rolls (`FRAME_RAMP`), so a found path starts from the placement's `steer`.
- The touch wheel, Wheel° and `input.follow` divide by `max_steer(spec)`, which is 1 on a skid steer: keep using it rather than a constant.

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
- **Prove it can be done from the real start.** Plan the whole round from the vehicle as `create_game` places it, with the bodies grown 5 cm, then replay every move in 15 cm pieces with the real bodies and no margin and judge the ends as a round would (`prove()`). Parking's cheaper "out of the bay" search is only sound with no trailer and only for one goal, and a frame steer's way out must end with the joint straight (the round starts straight, and a bend at a standstill moves both frames).
- **Search for a region, finish analytically.** A goal window of centimetres (forks in a pallet's pockets) is hard for a coarse search; `arrive` on "lined up with it" and a straight run in at the end found every leg.
- **Test time:** each test at most a quarter of its timeout on the owner's machine (CI is two to three times slower); split long proofs over files so they run side by side. The forklift: 16 levels in two files at 0.5–13 s each, eight jobs and a daily in a third, 60 s timeouts.
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
9. **Labels collide far out.** "Dock A … Dock E" ran together at the start card's scale: shorten by scale, hide rack names below 14 px a metre, and let them grow with the zoom up to 17 px, not past what a 1.4 m bay holds.
10. **The planner at runtime takes seconds.** A four-pallet par took up to six: it runs in a one-shot worker per round (`par.worker.ts`, like Nonogram's analysis). Key its effect on `$derived(game.round)`, never on `game.round` read inside the effect: `game` is `$state.raw` and replaced every frame, so that re-ran the effect ~60 times a second and the par never arrived. The round can finish before the par does: record it at once (Again or New must never drop a finished job) and record again with the time star when the par lands.
11. **Planner paths are a computer's.** Its changes of direction aren't a fair par for moves (it shuffles); finer steering shares and a higher switch cost halved them, and par moves are a formula. Its distance is fine for a par time.
12. **The daily.** One daily per game: the app's `daily_rank` is a per-mode record keyed by game id (ADR-050), and a game with a daily adds its id to `DAILY_GAMES` (`games/index.ts`), reports through `play.daily(day, ms, score, "{id}")` and takes the day from the `daily` prop. Game Hub launches it with `{ daily, mode: "{id}" }` and names the row "Drive Hub · {Id}".
13. **Phones: the HUD's top row is the gear strip.** At 44 px touch targets it fills a 390 px board; text chips go on their own row under it.
14. **Phones: the toolbar fits one row.** Every game's toolbar must fit one row at 390 px and at 360 px on touch (`?platform=mobile`); a second row costs board height. The switcher keeps its "Games" label from `@sm`; with it, Games, the Mode select and one more select (at most 7.5rem), settings and New is all one 390 px row holds. Below `@md` Retry/Restart hides (the pause overlay and the end cards have it) and any further picker moves onto the start card: the Warehouse's job size, parking's kind of spot, and parking's vehicle below `@2xl`. Measure it: the toolbar keeps its one-row height, nothing truncated in a select at the touch font size.
15. **Keep the start card short.** On a narrow board it covers the floor: one line of brief, the rules in the guide and in the contextual hint.
16. **Real key driving, deterministically.** A closed-loop driver over `DriveInput` and `advance` in Node turns the planner's moves into key presses (stop, set the wheel standing, drive each arc with small corrections: planner paths jump in curvature, and the keyboard wheel takes a second from centre to lock). Replay them under `page.clock` one 16 ms `runFor` per frame, after starting the round, so every frame is two 8 ms steps as in Node. Open-loop timing in a live browser drifts into a rack within seconds.
17. **Tracking needs margin.** The planner's paths keep 5 cm; a driver following one by keys wanders more than that around tight turns, so a replay that has to finish uses the gentlest level.
18. **Caches are per object.** `obstacles(scene)` caches bounds in a WeakMap keyed by the scene: build the scene once per round, not per frame.
19. **A rig is a chain.** `spec.hitches` can hold several links, so `trailers[0]` is not the tail: the rear sensor, the reversing lamps' glow and the guide lines read the last link, the parked check and precision every link. `jackknifed(car, spec)` and `jackknife(car, spec)` need the spec, since each hinge has its own `max_angle`; ring a jackknife at `hitch_point(car, spec, hinge)`. A search over a chain bins every hinge, so the state space grows with each link: a forward-only search (towed links straighten behind) is the cheap proof for two or more.
20. **The drive isn't always a car's.** Since wave 3 a vehicle can pivot, slide sideways or bend (Drive kinds, above). `car.heading` is the rear frame's on a frame steer and stays put while crabbing; frame a camera on `body_centre`, not on what the heading predicts, and test a new rule with the bobcat, the telehandler in crab mode and the dump truck as well as the hatchback.
21. **A long pushed chain beats the planner.** `plan()` found no pushback (an airliner on a link at rest π) in 120 000 expansions: its grid can't cover a 40 m unstable chain. Airport's pushback proves its rounds with a driver instead (`games/airport/plan.ts`): a track for the trailer's axle, the fold that track asks for from the towing kinematics, the tug's wheel closing on it, replayed with the real bodies. Reach for that before tuning the search.
22. **Road speeds need two things.** The hatchback tops out at 8.4 m/s (30 km/h): a game on roads raises `max_forward` in its own spec (the Driving Test's is 20 m/s). A normal car still turns at 50 km/h as tight as when parking (owner's call); a racing spec sets `a_lat` to have `step()` hold the turn, as Hot Lap does.
23. **A proof driver must hold the brake at a stop.** Braking in proportion to the speed error leaves a car in D creeping against a feather of brake, so it never stands still and a hesitation or stop-line check reads it as rolling. At a target of zero, brake fully; step with `without_creep(spec)`, like the default setting.
24. **A towed link can't be steered by its own curvature.** Towing an airliner forward on a towbar (hinge behind the tug's axle), steering the tug for the curvature the aircraft should have folds the towbar away: the aircraft first turns the wrong way, so the inverse is unstable. Airport's tow driver builds the tug's way from the main gear's track instead (the nose gear a wheelbase ahead on its tangent, the tug's heading from the towbar's equation solved backwards from the goal) and pure-pursues that.
