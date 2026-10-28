<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time, track_play } from "$kit/games";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Kbd, Segmented, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    SlidersHorizontal as SlidersIcon,
    Star as StarIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { ease, frame, NO_INSETS, view_span, ZOOM_MAX, ZOOM_MIN, type Camera, type Insets } from "./camera";
  import { draw_scene, read_palette, type Palette } from "./draw";
  import {
    advance,
    ANY,
    better,
    bests_schema,
    change_gear,
    crash_title,
    create_game,
    LEVEL_COUNT,
    level_round,
    levels_schema,
    Mode,
    mode_schema,
    obstacles,
    open_round,
    par,
    pick_schema,
    round_brief,
    round_key,
    round_title,
    SCENARIO_INFO,
    scenario_round,
    set_status,
    spec_of,
    stars,
    Status,
    steering_schema,
    SteeringMode,
    unlocked,
    verdict,
    VEHICLE_NAMES,
    wheel_schema,
    WheelMode,
    type Bests,
    type GameState,
    type LevelStars,
    type Round,
    type ScenarioPick,
  } from "./game";
  import { centroid } from "./geometry";
  import { End, sensor } from "./sensors";
  import { Sounds } from "./sound";
  import SteeringWheel from "./steering-wheel.svelte";
  import { body_centre, Gear, max_steer, rig_length, Vehicle, without_creep, type Input } from "./vehicle";
  import { SCENARIOS, Scenario } from "./world";

  const STEP_MS = 1000 / 120;
  const MAX_FRAME_MS = 100;
  const MODE_LABELS: Record<Mode, string> = { scenario: "Spots", levels: "Levels", open: "Open lot" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  const PICK_OPTIONS: { value: ScenarioPick; label: string }[] = [
    { value: ANY, label: "Any spot" },
    ...SCENARIOS.map((value) => ({ value, label: SCENARIO_INFO[value].name })),
  ];
  const WHEEL_OPTIONS = [
    { value: WheelMode.CENTRES, label: "Centres" },
    { value: WheelMode.STAYS, label: "Stays" },
  ];
  const STEERING_OPTIONS = [
    { value: SteeringMode.WHEEL, label: "Wheel" },
    { value: SteeringMode.BUTTONS, label: "Buttons" },
  ];
  // Must equal the `aspect-ratio > 1.25` container query below: past it the touch controls cover the board's sides.
  const OVERLAY_ASPECT = 1.25;
  const OVERLAY_GAP = 20;
  type Hold = "gas" | "brake" | "left" | "right";
  const GEAR_KEYS: Record<string, Gear> = {
    KeyE: Gear.DRIVE,
    KeyR: Gear.REVERSE,
    KeyQ: Gear.REVERSE,
    KeyN: Gear.NEUTRAL,
    KeyP: Gear.PARK,
    Space: Gear.PARK,
  };
  const FORWARD_KEYS = ["ArrowUp", "KeyW"];
  const BACK_KEYS = ["ArrowDown", "KeyS"];
  // Below this the car counts as standing, so a fresh arrow press picks the direction instead of braking.
  const STANDING = 0.05;
  const DRIVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"]);
  const GEARS: Gear[] = [Gear.PARK, Gear.REVERSE, Gear.NEUTRAL, Gear.DRIVE];
  const GEAR_NAMES: Record<Gear, string> = { P: "Park", R: "Reverse", N: "Neutral", D: "Drive" };
  const VERDICTS = { crooked: "Not straight in the bay", backwards: "Facing the wrong way", outside: "Not inside a bay" } as const;

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const bests = storage.persisted<Bests>("best", {}, bests_schema);
  const level_stars = storage.persisted<LevelStars>("levels", {}, levels_schema);
  const kinds = storage.persisted<string[]>("kinds", [], z.array(z.string()));
  const uid = $props.id();

  // Per window, so two open games don't change each other's mode; storage only remembers the last pick.
  let daily = $state(daily_day ?? null);
  let mode = $state<Mode>(daily_day ? Mode.SCENARIO : (storage.get("mode", mode_schema) ?? Mode.SCENARIO));
  let pick = $state<ScenarioPick>(storage.get("pick", pick_schema) ?? ANY);
  let level = $state(Math.min(untrack(() => unlocked(level_stars.value)), storage.get("level", z.number().int().min(1)) ?? 1));
  let sound_on = $state(storage.get("sound", z.boolean()) ?? true);
  let guides_on = $state(storage.get("guides", z.boolean()) ?? true);
  let creep_on = $state(storage.get("creep", z.boolean()) ?? false);
  let wheel_mode = $state<WheelMode>(storage.get("wheel", wheel_schema) ?? WheelMode.CENTRES);
  let steering_mode = $state<SteeringMode>(storage.get("steering", steering_schema) ?? SteeringMode.WHEEL);

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let new_best = $state(false);
  let earned = $state(0);
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let zoom = $state(1);
  let wheel = $state(0);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();
  let card_size = $state({ width: 0, height: 0 });
  let first_park = $state(false);
  let settings_panel: HTMLDivElement | undefined = $state();
  let held = $state({ gas: false, brake: false, left: false, right: false });
  let steer_box = $state({ width: 0, height: 0 });
  let pedal_box = $state({ width: 0, height: 0 });
  let stage_rect = $state<DOMRectReadOnly>();
  let hud_height = $state(0);

  // Read every physics step, never rendered, so holding a key doesn't re-run effects.
  const keys = new Set<string>();
  const holds: Record<Hold, Set<number>> = { gas: new Set(), brake: new Set(), left: new Set(), right: new Set() };
  const pinch = new Map<number, { x: number; y: number }>();
  let pinch_start: { distance: number; zoom: number } | null = null;
  let hands = false;
  let steering_by_keys = false;
  let camera: Camera | null = null;
  let readings: Record<End, number | null> = { front: null, rear: null };
  const sounds = new Sounds();

  const spec = $derived(spec_of(game.round));
  const lock = $derived(max_steer(spec));
  const span = $derived(view_span(rig_length(spec)));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.PARKED || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(bests.value[round_key(game.round)]);
  const round_par = $derived(par(game.round));
  const level_best = $derived(game.round.level !== undefined ? (level_stars.value[game.round.level] ?? 0) : 0);
  const max_level = $derived(unlocked(level_stars.value));
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const round = level_round(i + 1);
      const got = level_stars.value[i + 1] ?? 0;
      return { value: String(i + 1), label: `${i + 1} · ${SCENARIO_INFO[round.scenario!].name}${round.vehicle === Vehicle.HATCH ? "" : ` · ${VEHICLE_NAMES[round.vehicle]}`}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  // A wide board (a desktop window, a phone held sideways) takes cards on its left, centred: a strip at the bottom read as detached there.
  const side_card = $derived(size.height > 0 && size.width > size.height * 1.2);
  const speed = $derived(Math.round(Math.abs(game.car.speed) * 3.6));
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const time = $derived(format_time(game.ms, { tenths: true }));
  // Only once the car has been in gear: the round starts in P, and a verdict before driving reads as a scolding.
  const judged = $derived(game.status === Status.DRIVING && game.car.gear === Gear.PARK && game.last_drive !== null ? verdict(game) : null);
  const facing_reading = $derived.by(() => {
    if (game.status !== Status.DRIVING) return null;
    if (game.car.gear === Gear.DRIVE) return readings.front;
    if (game.car.gear === Gear.REVERSE) return readings.rear;
    return null;
  });

  function moves_text(count: number): string {
    return `${count} ${count === 1 ? "move" : "moves"}`;
  }

  function make_round(): Round {
    if (daily) return scenario_round(ANY, daily_seed(daily, app_id), daily);
    if (mode === Mode.LEVELS) return level_round(level);
    if (mode === Mode.OPEN) return open_round(random_seed());
    return scenario_round(pick, random_seed());
  }

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => () => sounds.close());

  // The phone's Back closes the settings first, then pauses a running round before it may leave the app.
  $effect(() =>
    win.on_back(() => {
      if (settings_panel?.matches(":popover-open")) return (settings_panel.hidePopover(), true);
      if (game.status !== Status.DRIVING) return false;
      toggle_pause();
      return true;
    })
  );

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!driving || blocked) return;
    let last = performance.now();
    let frame_id = requestAnimationFrame(function tick(now) {
      // Steps split each frame's own time: fixed steps against a 120 Hz screen land 0, 1 or 2 to a frame, and the car shakes.
      // A frame's timestamp is when it started, so the first one can come before the effect's `performance.now()`.
      const elapsed = Math.max(0, Math.min(now - last, MAX_FRAME_MS));
      last = Math.max(last, now);
      if (elapsed > 0) {
        const steps = Math.ceil(elapsed / STEP_MS);
        run(steps, elapsed / steps / 1000);
      }
      render(elapsed / 1000);
      if (game.status === Status.DRIVING) frame_id = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame_id);
      sounds.quiet();
    };
  });

  // The device-pixel box also fires when only the DPR changes, like moving the window to another screen.
  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      const pixels = entry.devicePixelContentBoxSize?.[0];
      const dpr = pixels && box.inlineSize ? pixels.inlineSize / box.inlineSize : window.devicePixelRatio;
      size = { width: box.inlineSize, height: box.blockSize, dpr };
    });
    observer.observe(canvas, { box: "device-pixel-content-box" });
    return () => observer.disconnect();
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame_id = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame_id);
  });

  // While driving the frame loop draws; this covers everything else (menus, a resize, a new theme).
  $effect(() => {
    void [game, palette, size, zoom, guides_on, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function target_camera(): Camera {
    const bounds = game.world.bounds;
    const car = body_centre(game.car, spec);
    if (game.status === Status.READY && game.world.bays.length === 1) {
      // Before the start, frame the car and its bay together so the player sees the task.
      const bay = centroid(game.world.bays[0].shape);
      // The start card covers the bottom of the board, or its left on a wide one; the framing keeps clear of it.
      const covered_x = side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
      const covered_y = side_card ? 0 : Math.min(card_size.height + 8, size.height * 0.5);
      const width = size.width - covered_x;
      const height = size.height - covered_y;
      const across = Math.abs(bay.x - car.x) + 12;
      const along = Math.abs(bay.y - car.y) + 12;
      const short = Math.min(width, height);
      const fit = Math.min(1, (span * width) / short / across, (span * height) / short / along);
      const view = frame(bounds, { x: (bay.x + car.x) / 2, y: (bay.y + car.y) / 2 }, width, height, Math.max(0.25, fit) * zoom, NO_INSETS, span);
      return { ...view, x: view.x - covered_x / 2 / view.scale, y: view.y + covered_y / 2 / view.scale };
    }
    const ahead = game.car.speed * 0.9;
    const focus = { x: car.x + Math.cos(game.car.heading) * ahead, y: car.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, size.width, size.height, zoom, control_insets(), span);
  }

  // Everything drawn over the board: the HUD always, the end card once a round is over, the touch controls sideways.
  // The camera centres the car in what's left and lets the world's edge slide under them.
  function control_insets(): Insets {
    const ended = game.status === Status.PARKED || game.status === Status.CRASHED;
    const card_bottom = ended && !side_card ? Math.min(card_size.height + 16, size.height * 0.5) : 0;
    const card_left = ended && side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!steer_box.width || !stage_rect || stage_rect.width <= stage_rect.height * OVERLAY_ASPECT) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  function render(dt: number) {
    if (!canvas || !palette || !size.width) return;
    const width = Math.round(size.width * size.dpr);
    const height = Math.round(size.height * size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_scene(ctx, game, { ...camera, width: size.width, height: size.height, dpr: size.dpr }, palette, {
      guides: guides_on,
      sensors: {
        front: game.car.gear === Gear.DRIVE ? readings.front : null,
        rear: game.car.gear === Gear.REVERSE ? readings.rear : null,
      },
      time: performance.now() / 1000,
    });
  }

  function step_wheel(dt: number) {
    const right = keys.has("ArrowRight") || keys.has("KeyD") || holds.right.size > 0;
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || holds.left.size > 0;
    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    if (turn !== 0) {
      hands = true;
      steering_by_keys = true;
      const rate = dt / spec.steer_time;
      wheel = Math.max(-1, Math.min(1, wheel + Math.sign(turn - wheel) * Math.min(rate, Math.abs(turn - wheel))));
    } else if (steering_by_keys && wheel_mode === WheelMode.CENTRES) {
      hands = false;
      steering_by_keys = false;
    }
  }

  function input(): Input {
    // The arrows and the pedals mean a direction (Gas forward, Brake back): toward the gear's way is gas, against it the brake.
    const forward = FORWARD_KEYS.some((code) => keys.has(code)) || holds.gas.size > 0;
    const back = BACK_KEYS.some((code) => keys.has(code)) || holds.brake.size > 0;
    const reversing = game.car.gear === Gear.REVERSE;
    const gas = reversing ? back : forward;
    const brake = reversing ? forward : back;
    return { steer: hands ? wheel : null, throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }

  function run(steps: number, dt: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      step_wheel(dt);
      next = advance(next, input(), dt, creep_on ? spec : without_creep(spec));
    }
    if (!hands) wheel = next.car.steer / lock;
    const near = obstacles(next.world);
    readings = { front: sensor(next.car, near, End.FRONT, spec), rear: sensor(next.car, near, End.REAR, spec) };
    if (sound_on && next.status === Status.DRIVING) {
      const reading = next.car.gear === Gear.DRIVE ? readings.front : next.car.gear === Gear.REVERSE ? readings.rear : null;
      sounds.sensor(reading);
    }
    if (next === game) return;
    const before = game.status;
    game = next;
    if (before === Status.DRIVING && next.status === Status.CRASHED) crashed();
  }

  function crashed() {
    release_all();
    if (sound_on) sounds.crash();
  }

  function parked(state: GameState) {
    release_all();
    const result = { moves: state.moves, ms: Math.round(state.ms) };
    const key = round_key(state.round);
    const had_best = bests.value[key] !== undefined;
    new_best = better(bests.value[key], result);
    if (new_best) bests.value[key] = result;
    first_park = !had_best;
    if (sound_on) sounds.parked(new_best && had_best);
    earned = stars(state.round, state.moves);
    achievements.achieve("first-park");
    const scenario = state.round.scenario;
    if (scenario === null) achievements.achieve("open-lot");
    else {
      if (!kinds.value.includes(scenario)) kinds.value = [...kinds.value, scenario];
      achievements.progress("every-spot", kinds.value.length);
      if (scenario === Scenario.PARALLEL) {
        achievements.achieve("kerbside");
        if (state.moves <= 1) achievements.achieve("one-sweep");
      }
    }
    if (state.round.level !== undefined) {
      const at = state.round.level;
      level_stars.value[at] = Math.max(level_stars.value[at] ?? 0, earned);
      achievements.progress("licensed", Object.keys(level_stars.value).length);
    }
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, result.moves);
      achievements.achieve("daily");
    }
  }

  function release_all() {
    keys.clear();
    for (const pointers of Object.values(holds)) pointers.clear();
    held = { gas: false, brake: false, left: false, right: false };
    sounds.quiet();
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function start() {
    if (game.status !== Status.READY && game.status !== Status.PAUSED) return;
    game = set_status(game, Status.DRIVING);
    focus_board();
  }

  function toggle_pause() {
    if (game.status === Status.DRIVING) {
      game = set_status(game, Status.PAUSED);
      release_all();
    } else start();
  }

  function primary_action() {
    if (game.status === Status.READY || game.status === Status.PAUSED) start();
    else if (game.status === Status.CRASHED) retry();
    else if (game.status === Status.PARKED) {
      if (game.round.level === undefined) new_spot();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(round: Round) {
    release_all();
    hands = false;
    steering_by_keys = false;
    wheel = 0;
    new_best = false;
    camera = null;
    readings = { front: null, rear: null };
    game = create_game(round);
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function next_round() {
    if (game.round.level !== undefined && has_next_level && game.status === Status.PARKED) {
      level = game.round.level + 1;
      storage.set("level", level);
    }
    load(make_round());
  }

  function new_spot() {
    daily = null;
    load(make_round());
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("mode", next);
    load(make_round());
  }

  function set_pick(next: ScenarioPick) {
    daily = null;
    pick = next;
    storage.set("pick", next);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(max_level, Number(next)));
    storage.set("level", level);
    load(make_round());
  }

  function set_setting(name: "sound" | "guides" | "creep", value: boolean) {
    if (name === "sound") sound_on = value;
    else if (name === "guides") guides_on = value;
    else creep_on = value;
    storage.set(name, value);
    if (!value && name === "sound") sounds.quiet();
  }

  function set_wheel_mode(value: WheelMode) {
    wheel_mode = value;
    storage.set("wheel", value);
  }

  function set_steering_mode(value: SteeringMode) {
    steering_mode = value;
    storage.set("steering", value);
    // The held buttons unmount with the switch, so their lostpointercapture never arrives.
    holds.left.clear();
    holds.right.clear();
    held = { ...held, left: false, right: false };
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear);
    if (next === game) return;
    game = next;
    if (sound_on && next.status === Status.DRIVING) sounds.shift();
    if (next.status === Status.PARKED) parked(next);
  }

  // Holding an arrow or a pedal against the gear only brakes; pressing it again once the car stands shifts that way.
  function choose_direction(want: Gear | null) {
    if (want && Math.abs(game.car.speed) < STANDING) shift(want);
  }

  function key_direction(code: string): Gear | null {
    return FORWARD_KEYS.includes(code) ? Gear.DRIVE : BACK_KEYS.includes(code) ? Gear.REVERSE : null;
  }

  function toggle_direction() {
    shift(game.car.gear === Gear.DRIVE ? Gear.REVERSE : Gear.DRIVE);
  }

  function set_wheel(value: number) {
    if (game.status === Status.READY) start();
    hands = true;
    steering_by_keys = false;
    wheel = value;
  }

  function centre_wheel() {
    set_wheel(0);
  }

  function set_zoom(next: number) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
  }

  // Keys drive from anywhere in the window but a field or the settings, so clicking a button never strands the arrows.
  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey) return release_all();
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (settings_panel?.matches(":popover-open")) return;
    const code = event.code;
    const on_button = target instanceof HTMLButtonElement;

    if (code === "Escape") {
      if (game.status !== Status.DRIVING && game.status !== Status.PAUSED) return;
      event.preventDefault();
      toggle_pause();
      return;
    }
    if (code === "Enter") {
      if (on_button) return;
      event.preventDefault();
      primary_action();
      return;
    }
    if (code === "Equal" || code === "NumpadAdd" || code === "Minus" || code === "NumpadSubtract") {
      event.preventDefault();
      set_zoom(code === "Equal" || code === "NumpadAdd" ? zoom * 1.2 : zoom / 1.2);
      return;
    }
    if (over) {
      if (code === "KeyR" && !event.repeat) {
        event.preventDefault();
        retry();
      }
      return;
    }
    if (game.status === Status.PAUSED || (on_button && code === "Space")) return;

    if (DRIVE_KEYS.has(code)) {
      event.preventDefault();
      keys.add(code);
      if (game.status === Status.READY && !event.repeat) start();
      if (!event.repeat) choose_direction(key_direction(code));
      return;
    }
    if (code === "KeyC") {
      event.preventDefault();
      centre_wheel();
      return;
    }
    const gear = GEAR_KEYS[code];
    if (gear && !event.repeat) {
      event.preventDefault();
      shift(gear);
    }
  }

  // Closing the guide or a shell menu drops the focus to the page; the front window still owns the keys.
  function on_window_keydown(event: KeyboardEvent) {
    if (!win.is_focused || (document.activeElement && document.activeElement !== document.body)) return;
    focus_board();
    on_keydown(event);
  }

  function on_keyup(event: KeyboardEvent) {
    keys.delete(event.code);
  }

  function on_wheel(event: WheelEvent) {
    event.preventDefault();
    set_zoom(zoom * Math.exp(-event.deltaY * 0.0015));
  }

  function on_board_pointerdown(event: PointerEvent) {
    if (event.pointerType !== "touch") return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinch_start = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  }

  function on_board_pointermove(event: PointerEvent) {
    if (!pinch.has(event.pointerId)) return;
    pinch.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.size !== 2 || !pinch_start) return;
    const [a, b] = [...pinch.values()];
    set_zoom((pinch_start.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch_start.distance));
  }

  function on_board_pointerend(event: PointerEvent) {
    pinch.delete(event.pointerId);
    if (pinch.size < 2) pinch_start = null;
  }

  function hold(which: Hold) {
    return {
      onpointerdown: (event: PointerEvent) => {
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        if (game.status === Status.READY) start();
        if (game.status !== Status.DRIVING) return;
        const fresh = holds[which].size === 0;
        holds[which].add(event.pointerId);
        held[which] = true;
        if (fresh && which === "gas") choose_direction(Gear.DRIVE);
        else if (fresh && which === "brake") choose_direction(Gear.REVERSE);
      },
      onlostpointercapture: (event: PointerEvent) => {
        holds[which].delete(event.pointerId);
        held[which] = holds[which].size > 0;
      },
      oncontextmenu: (event: Event) => event.preventDefault(),
    };
  }

  // A closed settings panel hands the keys back to the board, unless the click that closed it went to another control.
  function on_settings_toggle(event: ToggleEvent) {
    if (event.newState !== "closed") return;
    const active = document.activeElement;
    if (!active || active === document.body || settings_panel?.contains(active) || active.getAttribute("popovertarget") === settings_panel?.id) focus_board();
  }
</script>

<svelte:window onkeydown={on_window_keydown} onkeyup={on_keyup} onblur={release_all} />

{#snippet star_row(count: number, reveal: boolean)}
  <span class="inline-flex items-center gap-0.5" role="img" aria-label="{count} of 3 stars">
    {#each [1, 2, 3] as n (n)}
      <span class={cn("inline-grid", n <= count ? "text-primary" : "text-foreground/20", reveal && n <= count && "ts-star")} style:animation-delay={reveal ? `${n * 140}ms` : undefined}>
        <StarIcon weight="fill" class="size-4" />
      </span>
    {/each}
  </span>
{/snippet}

{#snippet speed_chip(class_name: string)}
  <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", class_name)} aria-hidden="true">
    {speed} <span class="text-foreground/65">km/h</span>
  </div>
{/snippet}

{#snippet hint(text: string, key: string)}
  <span class="inline-flex items-center gap-1"><Kbd>{key}</Kbd>{text}</span>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select class="w-[5.75rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    {#if mode === Mode.SCENARIO && !daily}
      <Select class="w-[7.5rem] min-w-0 @md:w-32" size="sm" aria-label="Kind of spot" options={PICK_OPTIONS} bind:value={() => pick, set_pick} />
    {:else if mode === Mode.LEVELS}
      <Select class="w-36 min-w-0 @md:w-40" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
    {/if}
    {#if daily}<span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>{/if}
    <div class="flex-1"></div>
    <IconButton size="sm" label="Settings" popovertarget="ts-settings-{uid}" style="anchor-name: --ts-settings-{uid}">
      <SlidersIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
      {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <IconButton size="sm" label="Retry this spot" onclick={retry}>
      <ArrowCounterClockwiseIcon weight="bold" />
    </IconButton>
    {#if mode !== Mode.LEVELS}
      <Button size="sm" variant="primary" onclick={new_spot}>New</Button>
    {/if}
  </Toolbar>

  <div
    bind:this={settings_panel}
    id="ts-settings-{uid}"
    popover="auto"
    class="ts-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
    style="position-anchor: --ts-settings-{uid}"
    ontoggle={on_settings_toggle}
  >
    <div class="flex flex-col gap-3">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Feedback</p>
      <label class="flex items-center justify-between gap-3 text-ui">
        <span class="flex flex-col">Sound <span class="text-2xs text-foreground/65">Sensor beeps, gear clicks and results</span></span>
        <Switch bind:checked={() => sound_on, (value: boolean) => set_setting("sound", value)} />
      </label>
      <label class="flex items-center justify-between gap-3 text-ui">
        <span class="flex flex-col">Guide lines <span class="text-2xs text-foreground/65">Where the front corners will go</span></span>
        <Switch bind:checked={() => guides_on, (value: boolean) => set_setting("guides", value)} />
      </label>
      <p class="mt-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Driving</p>
      <label class="flex items-center justify-between gap-3 text-ui">
        <span class="flex flex-col">Creep <span class="text-2xs text-foreground/65">D and R roll without gas, like an automatic</span></span>
        <Switch bind:checked={() => creep_on, (value: boolean) => set_setting("creep", value)} />
      </label>
      <div class="hidden flex-col gap-1.5 pointer-coarse:flex">
        <span class="flex flex-col text-ui">Steering <span class="text-2xs text-foreground/65">Drag a wheel, or hold ◀ ▶ buttons</span></span>
        <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Steering" options={STEERING_OPTIONS} bind:value={() => steering_mode, set_steering_mode} />
      </div>
      <div class={cn("flex flex-col gap-1.5", steering_mode !== SteeringMode.BUTTONS && "pointer-coarse:hidden")}>
        <span class="flex flex-col text-ui pointer-coarse:hidden">Keyboard wheel <span class="text-2xs text-foreground/65">When you let go of ← →</span></span>
        <span class="hidden flex-col text-ui pointer-coarse:flex">Steering buttons <span class="text-2xs text-foreground/65">When you let go of ◀ ▶</span></span>
        <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Wheel when let go" options={WHEEL_OPTIONS} bind:value={() => wheel_mode, set_wheel_mode} />
      </div>
    </div>
  </div>

  <div bind:contentRect={stage_rect} class="ts-stage min-h-0 p-2 [container:ts-stage/size] @md:p-3">
    <div class="ts-layout h-full">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label="Tight Spot. Arrows steer and drive, E drive, R reverse, P park, Escape pauses, Enter starts."
        tabindex="0"
        class="ts-board relative min-h-0 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none [grid-area:board] focus-visible:ring-2 focus-visible:ring-cottontail"
        onwheel={on_wheel}
        onpointerdown={on_board_pointerdown}
        onpointermove={on_board_pointermove}
        onpointerup={on_board_pointerend}
        onpointercancel={on_board_pointerend}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>

        {#if game.status !== Status.READY}
          <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
            <div class="flex items-center gap-1.5">
            <!-- The toolbar's Pause is hidden when narrow, so phones pause from here. -->
            <IconButton
              size="sm"
              class="pointer-events-auto bg-background/85 backdrop-blur-[2px] @md:hidden pointer-coarse:size-11"
              label={game.status === Status.DRIVING ? "Pause" : "Resume"}
              disabled={!can_pause}
              onclick={toggle_pause}
            >
              {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
            </IconButton>
            <div class="pointer-events-auto flex items-center gap-0.5 rounded-md bg-background/85 p-0.5 font-mono text-ui backdrop-blur-[2px]" role="group" aria-label="Gear">
              {#each GEARS as gear (gear)}
                <!-- Pressing keeps the focus on the board, so the arrow keys still drive after a click. -->
                <button
                  type="button"
                  class={cn(
                    "grid h-6 w-6 place-items-center rounded-sm transition-colors pointer-coarse:size-11 pointer-coarse:text-base",
                    game.car.gear === gear ? "bg-primary font-semibold text-background" : "text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
                  )}
                  aria-label={GEAR_NAMES[gear]}
                  title="{GEAR_NAMES[gear]} ({gear === Gear.DRIVE ? 'E' : gear === Gear.PARK ? 'P or Space' : gear})"
                  aria-pressed={game.car.gear === gear}
                  onmousedown={(event) => event.preventDefault()}
                  onclick={() => shift(gear)}
                >
                  {gear}
                </button>
              {/each}
            </div>
            {@render speed_chip("pointer-coarse:hidden")}
            </div>
            <!-- On touch the bigger gear strip leaves no room beside it, so the speed stacks over the sensor readout. -->
            <div class="flex flex-col items-end gap-1.5">
              {@render speed_chip("hidden pointer-coarse:block")}
              {#if facing_reading !== null}
                <div
                  class={cn(
                    "rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]",
                    facing_reading < 0.5 ? "text-error" : "text-warning"
                  )}
                  aria-hidden="true"
                >
                  {game.car.gear === Gear.REVERSE ? "Rear" : "Front"}
                  {facing_reading.toFixed(2)} m
                </div>
              {/if}
            </div>
          </div>
        {/if}
        {#if judged && judged !== "inside"}
          <p class="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit animate-pop-in rounded-md bg-background/85 px-2 py-1 text-ui text-warning backdrop-blur-[2px]" aria-live="polite">
            {VERDICTS[judged]}
          </p>
        {/if}

        <!-- Cards sit at the bottom or on the left instead of covering the board, so the bay, the car and where it touched stay in sight. -->
        {#if game.status === Status.READY}
          <div bind:clientWidth={card_size.width} bind:clientHeight={card_size.height} class={cn("ts-card", side_card && "ts-card-side")} aria-live="polite">
            <div class="min-w-0 flex-1 basis-52">
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                {round_title(game.round)}
                <Badge tone={game.round.vehicle === Vehicle.HATCH ? "neutral" : "primary"}>{VEHICLE_NAMES[game.round.vehicle]}</Badge>
                {#if level_best}{@render star_row(level_best, false)}{/if}
              </p>
              <p class="text-ui text-foreground/80">{round_brief(game.round)}</p>
              <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
                Par {moves_text(round_par)}{best ? ` · Best ${moves_text(best.moves)}, ${format_time(best.ms, { tenths: true })}` : ""}
              </p>
            </div>
            <Button class="ml-auto" variant="primary" onclick={start}>Start</Button>
            <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
              {@render hint("forward", "↑")}{@render hint("back", "↓")}{@render hint("steer", "← →")}{@render hint("drive", "E")}{@render hint("reverse", "R")}{@render hint("park", "P")}
            </p>
            <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Hold Gas to go forward and Brake to back up, steer, tap P at the top once you're in the bay.</p>
          </div>
        {:else if game.status === Status.PAUSED}
          <BoardOverlay title="Paused" detail="{time} · Moves {game.moves}">
            <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
            <Button size="sm" variant="primary" onclick={start}>Resume</Button>
          </BoardOverlay>
        {:else if game.status === Status.PARKED}
          <div bind:clientWidth={card_size.width} bind:clientHeight={card_size.height} class={cn("ts-card", side_card && "ts-card-side")} aria-live="polite">
            <div class="min-w-0 flex-1 basis-52">
              <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
                Parked
                {@render star_row(earned, true)}
                {#if new_best}<Badge class="ts-pop" tone={first_park ? "neutral" : "primary"}>{first_park ? "First park" : "New best"}</Badge>{/if}
              </p>
              <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {moves_text(game.moves)} · par {round_par}</p>
              {#if !new_best && best}<p class="font-mono text-2xs text-foreground/65 tabular-nums">Best {moves_text(best.moves)}, {format_time(best.ms, { tenths: true })}</p>{/if}
            </div>
            <div class="ml-auto flex shrink-0 gap-2">
              <Button variant="quiet" onclick={retry}>Again</Button>
              {#if game.round.level === undefined}
                <Button variant="primary" onclick={new_spot}>New spot</Button>
              {:else if has_next_level}
                <Button variant="primary" onclick={next_round}>Next level</Button>
              {/if}
            </div>
            <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
              {#if game.round.level === undefined || has_next_level}{@render hint(game.round.level === undefined ? "new spot" : "next level", "Enter")}{/if}
              {@render hint("again", "R")}
            </p>
          </div>
        {:else if game.status === Status.CRASHED}
          <div bind:clientWidth={card_size.width} bind:clientHeight={card_size.height} class={cn("ts-card", side_card && "ts-card-side")} aria-live="polite">
            <div class="min-w-0 flex-1 basis-52">
              <p class="text-base font-semibold">{crash_title(game.hit)}</p>
              <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {moves_text(game.moves)}</p>
            </div>
            <div class="ml-auto flex shrink-0 gap-2">
              {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_spot}>New spot</Button>{/if}
              <Button variant="primary" onclick={retry}>Try again</Button>
            </div>
            <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
              {@render hint("or", "Enter")}{@render hint("tries again", "R")}
            </p>
          </div>
        {/if}
      </div>

      <div
        bind:clientWidth={steer_box.width}
        bind:clientHeight={steer_box.height}
        class={cn("ts-wheel hidden touch-none place-items-center select-none pointer-coarse:grid", !driving && "ts-idle")}
      >
        {#if steering_mode === SteeringMode.BUTTONS}
          <div class="flex gap-2" role="group" aria-label="Steering">
            {#each [{ side: "left", label: "Steer left" }, { side: "right", label: "Steer right" }] as const as button (button.side)}
              <button
                type="button"
                class={cn("ts-control ts-pad ts-steer grid place-items-center rounded-lg transition-colors", held[button.side] ? "ts-pad-held" : "text-foreground/80")}
                aria-label={button.label}
                {...hold(button.side)}
              >
                {#if button.side === "left"}<CaretLeftIcon weight="bold" class="size-7" />{:else}<CaretRightIcon weight="bold" class="size-7" />{/if}
              </button>
            {/each}
          </div>
        {:else}
          <SteeringWheel class="ts-wheel-size ts-wheel-face" value={wheel} onchange={set_wheel} oncentre={centre_wheel} />
        {/if}
      </div>
      <div
        bind:clientWidth={pedal_box.width}
        bind:clientHeight={pedal_box.height}
        class={cn("ts-pedals hidden touch-none items-end justify-end gap-2 select-none pointer-coarse:flex", game.status === Status.PAUSED && "ts-idle")}
        role="group"
        aria-label="Pedals"
      >
        <button
          type="button"
          class={cn("ts-control ts-pad ts-pedal ts-brake rounded-lg text-ui font-medium transition-colors", held.brake ? "ts-pad-held" : "text-foreground/80")}
          aria-label="Brake"
          {...hold("brake")}
        >
          Brake
        </button>
        <button
          type="button"
          class={cn("ts-control ts-pad ts-pedal ts-gas rounded-lg text-ui font-medium transition-colors", held.gas ? "ts-pad-held ts-pad-gas" : "text-foreground/80")}
          aria-label="Gas"
          {...hold("gas")}
        >
          Gas
        </button>
      </div>
    </div>
  </div>

  <StatusBar>
    <span>{round_title(game.round)}</span>
    <span class="tabular-nums">{time}</span>
    <span class="tabular-nums">Moves {game.moves}</span>
    <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
    {#if best}<span class="hidden tabular-nums @lg:inline">Best {best.moves} · {format_time(best.ms, { tenths: true })}</span>{/if}
    <span class="hidden @5xl:inline">Esc pauses · Enter starts · C centres the wheel · + − zoom</span>
  </StatusBar>
</div>

<style>
  .ts-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }

  .ts-layout {
    display: grid;
    gap: 0.5rem;
    grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
  }

  /* Phones held upright: the board on top, the wheel under the left thumb, the pedals under the right. */
  .ts-wheel {
    grid-area: wheel;
  }

  .ts-pedals {
    grid-area: pedals;
  }

  .ts-wheel :global(.ts-wheel-size) {
    width: min(10.5rem, 40cqw);
  }

  .ts-pad {
    background-color: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .ts-pad-held {
    color: var(--foreground);
    background-color: color-mix(in oklch, var(--foreground) 25%, transparent);
  }

  .ts-pad-gas {
    background-color: color-mix(in oklch, var(--primary) 35%, transparent);
  }

  .ts-steer {
    width: 4.5rem;
    height: 5rem;
  }

  .ts-pedal {
    width: 4rem;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0 0.6rem,
      color-mix(in oklch, var(--foreground) 7%, transparent) 0.6rem 0.75rem
    );
    background-clip: padding-box;
  }

  .ts-brake {
    height: 5.5rem;
  }

  .ts-gas {
    height: 8rem;
  }

  @media (pointer: coarse) {
    .ts-stage {
      padding: 0;
    }

    .ts-layout {
      padding: 0.5rem;
      grid-template:
        "board board board" minmax(0, 1fr)
        "wheel . pedals" auto / auto minmax(0, 1fr) auto;
    }

    /* Held sideways the board takes the whole stage and the controls float over its sides at thumb height. */
    @container ts-stage (aspect-ratio > 1.25) {
      .ts-layout {
        position: relative;
        padding: 0;
        grid-template: "board" minmax(0, 1fr) / minmax(0, 1fr);
      }

      .ts-board {
        border-radius: 0;
        box-shadow: none;
      }

      .ts-wheel,
      .ts-pedals {
        grid-area: auto;
        position: absolute;
        z-index: 1;
        bottom: 0.75rem;
      }

      .ts-wheel {
        left: 0.75rem;
      }

      .ts-pedals {
        right: 0.75rem;
      }

      .ts-idle {
        visibility: hidden;
      }

      .ts-wheel :global(.ts-wheel-size) {
        width: min(11rem, 62cqh);
      }

      .ts-wheel :global(.ts-wheel-face) {
        background: color-mix(in oklch, var(--background) 45%, transparent);
        backdrop-filter: blur(2px);
      }

      .ts-pad {
        background-color: color-mix(in oklch, var(--background) 65%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 18%, transparent);
        backdrop-filter: blur(2px);
      }

      .ts-pad.ts-pad-held {
        background-color: color-mix(in oklch, var(--foreground) 30%, var(--background));
      }

      .ts-pad.ts-pad-gas {
        background-color: color-mix(in oklch, var(--primary) 45%, var(--background));
      }

      .ts-steer {
        height: min(5rem, 34cqh);
      }

      .ts-brake {
        height: min(6rem, 34cqh);
      }

      .ts-gas {
        height: min(8.5rem, 46cqh);
      }
    }
  }

  :global(.ts-control) {
    touch-action: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .ts-card {
    position: absolute;
    inset-inline: 0.5rem;
    bottom: 0.5rem;
    margin-inline: auto;
    max-width: 30rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 1rem;
    row-gap: 0.5rem;
    padding: 0.75rem;
    border-radius: var(--radius-xl);
    background: color-mix(in oklch, var(--background) 92%, transparent);
    box-shadow: var(--shadow-popover);
    backdrop-filter: blur(2px);
    animation: var(--animate-pop-in);
  }

  .ts-card-side {
    inset-inline: 0.75rem auto;
    inset-block: 0.75rem;
    width: min(19rem, 45%);
    height: fit-content;
    max-height: calc(100% - 1.5rem);
    margin: auto 0;
    overflow-y: auto;
  }

  .ts-star {
    animation: ts-star 380ms var(--ease-out) both;
  }

  :global(.ts-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }

  @keyframes ts-star {
    from {
      opacity: 0;
      scale: 0.3;
    }
    60% {
      opacity: 1;
      scale: 1.25;
    }
    to {
      scale: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ts-star,
    :global(.ts-pop) {
      animation-delay: 0ms !important;
    }
  }

  :global(html[data-motion="off"]) .ts-star,
  :global(html[data-motion="off"] .ts-pop) {
    animation-delay: 0ms !important;
  }
</style>
