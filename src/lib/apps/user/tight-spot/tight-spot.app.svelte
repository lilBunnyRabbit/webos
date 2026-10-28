<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time, track_play } from "$kit/games";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { BoardOverlay, Button, IconButton, Segmented, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SlidersHorizontal as SlidersIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { ease, frame, ZOOM_MAX, ZOOM_MIN, type Camera } from "./camera";
  import { draw_scene, read_palette, type Palette } from "./draw";
  import {
    advance,
    ANY,
    better,
    bests_schema,
    change_gear,
    create_game,
    fixed_steps,
    HIT_NAMES,
    LEVEL_COUNT,
    level_round,
    levels_schema,
    Mode,
    mode_schema,
    obstacles,
    open_round,
    pick_schema,
    round_brief,
    round_key,
    round_title,
    SCENARIO_INFO,
    scenario_round,
    set_status,
    stars,
    Status,
    unlocked,
    verdict,
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
  import { body_centre, Gear, HATCHBACK, max_steer, type Input } from "./vehicle";
  import { SCENARIOS, Scenario } from "./world";

  const STEP_MS = 1000 / 120;
  const DT = STEP_MS / 1000;
  const LOCK = max_steer(HATCHBACK);
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
  const GEAR_KEYS: Record<string, Gear> = {
    KeyE: Gear.DRIVE,
    KeyR: Gear.REVERSE,
    KeyQ: Gear.REVERSE,
    KeyN: Gear.NEUTRAL,
    KeyP: Gear.PARK,
    Space: Gear.PARK,
  };
  const DRIVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"]);
  const GEARS: Gear[] = [Gear.PARK, Gear.REVERSE, Gear.NEUTRAL, Gear.DRIVE];
  // A card instead of a full cover, so the bay, the car and where it touched stay in sight.
  const CARD = "inset-x-2 top-auto bottom-2 rounded-xl bg-background/85 py-3 @3xl:right-auto @3xl:w-72";

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
  let wheel_mode = $state<WheelMode>(storage.get("wheel", wheel_schema) ?? WheelMode.CENTRES);

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

  // Read every physics step, never rendered, so holding a key doesn't re-run effects.
  const keys = new Set<string>();
  const pedals = { gas: new Set<number>(), brake: new Set<number>() };
  const pinch = new Map<number, { x: number; y: number }>();
  let pinch_start: { distance: number; zoom: number } | null = null;
  let hands = false;
  let steering_by_keys = false;
  let camera: Camera | null = null;
  let readings: Record<End, number | null> = { front: null, rear: null };
  const sounds = new Sounds();

  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.PARKED || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.DRIVING || game.status === Status.PAUSED);
  const best = $derived(bests.value[round_key(game.round)]);
  const max_level = $derived(unlocked(level_stars.value));
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const round = level_round(i + 1);
      const got = level_stars.value[i + 1] ?? 0;
      return { value: String(i + 1), label: `${i + 1} · ${SCENARIO_INFO[round.scenario!].name}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  const speed = $derived(Math.round(Math.abs(game.car.speed) * 3.6));
  const wheel_degrees = $derived(Math.round((game.car.steer / LOCK) * 450));
  const time = $derived(format_time(game.ms, { tenths: true }));
  const judged = $derived(game.status === Status.DRIVING && game.car.gear === Gear.PARK ? verdict(game) : null);
  const facing_reading = $derived.by(() => {
    if (game.status !== Status.DRIVING) return null;
    if (game.car.gear === Gear.DRIVE) return readings.front;
    if (game.car.gear === Gear.REVERSE) return readings.rear;
    return null;
  });

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

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!driving || blocked) return;
    let accumulator = 0;
    let last = performance.now();
    let frame_id = requestAnimationFrame(function tick(now) {
      const elapsed = now - last;
      const result = fixed_steps(accumulator, elapsed, STEP_MS);
      last = now;
      accumulator = result.remainder;
      if (result.steps > 0) run(result.steps);
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
    void [game, palette, size, zoom, guides_on];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function target_camera(): Camera {
    const bounds = game.world.bounds;
    const car = body_centre(game.car);
    if (game.status === Status.READY && game.world.bays.length === 1) {
      // Before the start, frame the car and its bay together so the player sees the task.
      const bay = centroid(game.world.bays[0].shape);
      // Below the side-card width the start card covers the bottom of the board, so the framing keeps above it.
      const covered = size.width < 768 ? Math.min(160, size.height * 0.4) : 0;
      const height = size.height - covered;
      const across = Math.abs(bay.x - car.x) + 12;
      const along = Math.abs(bay.y - car.y) + 12;
      const short = Math.min(size.width, height);
      const fit = Math.min(1, (26 * size.width) / short / across, (26 * height) / short / along);
      const view = frame(bounds, { x: (bay.x + car.x) / 2, y: (bay.y + car.y) / 2 }, size.width, height, Math.max(0.25, fit) * zoom);
      return { ...view, y: view.y + covered / 2 / view.scale };
    }
    const ahead = game.car.speed * 0.9;
    const focus = { x: car.x + Math.cos(game.car.heading) * ahead, y: car.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, size.width, size.height, zoom);
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
    const turn = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
    if (turn !== 0) {
      hands = true;
      steering_by_keys = true;
      const rate = dt / HATCHBACK.steer_time;
      wheel = Math.max(-1, Math.min(1, wheel + Math.sign(turn - wheel) * Math.min(rate, Math.abs(turn - wheel))));
    } else if (steering_by_keys && wheel_mode === WheelMode.CENTRES) {
      hands = false;
      steering_by_keys = false;
    }
  }

  function input(): Input {
    const gas = keys.has("ArrowUp") || keys.has("KeyW") || pedals.gas.size > 0;
    const brake = keys.has("ArrowDown") || keys.has("KeyS") || pedals.brake.size > 0;
    return { steer: hands ? wheel : null, throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }

  function run(steps: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      step_wheel(DT);
      next = advance(next, input(), DT);
    }
    if (!hands) wheel = next.car.steer / LOCK;
    const near = obstacles(next.world);
    readings = { front: sensor(next.car, near, End.FRONT), rear: sensor(next.car, near, End.REAR) };
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
    if (sound_on) sounds.parked();
    const result = { moves: state.moves, ms: Math.round(state.ms) };
    const key = round_key(state.round);
    new_best = better(bests.value[key], result);
    if (new_best) bests.value[key] = result;
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
    pedals.gas.clear();
    pedals.brake.clear();
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
    if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    else start();
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

  function set_setting(name: "sound" | "guides", value: boolean) {
    if (name === "sound") sound_on = value;
    else guides_on = value;
    storage.set(name, value);
    if (!value && name === "sound") sounds.quiet();
  }

  function set_wheel_mode(value: WheelMode) {
    wheel_mode = value;
    storage.set("wheel", value);
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear);
    if (next === game) return;
    game = next;
    if (next.status === Status.PARKED) parked(next);
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

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey) return release_all();
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement) return;
    const code = event.code;
    const on_board = target === board;

    if (code === "Escape") {
      if (game.status !== Status.DRIVING) return;
      event.preventDefault();
      toggle_pause();
      return;
    }
    if (code === "Enter") {
      if (target instanceof HTMLButtonElement) return;
      event.preventDefault();
      if (game.status === Status.READY || game.status === Status.PAUSED) start();
      else if (game.status === Status.PARKED) next_round();
      else if (game.status === Status.CRASHED) retry();
      return;
    }
    if (code === "Equal" || code === "NumpadAdd" || code === "Minus" || code === "NumpadSubtract") {
      event.preventDefault();
      set_zoom(code === "Equal" || code === "NumpadAdd" ? zoom * 1.2 : zoom / 1.2);
      return;
    }
    if (!on_board || over || game.status === Status.PAUSED) return;

    if (DRIVE_KEYS.has(code)) {
      event.preventDefault();
      keys.add(code);
      if (game.status === Status.READY && !event.repeat) start();
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

  function hold_pedal(which: "gas" | "brake") {
    return {
      onpointerdown: (event: PointerEvent) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        if (game.status === Status.READY) start();
        if (game.status !== Status.DRIVING) return;
        pedals[which].add(event.pointerId);
      },
      onlostpointercapture: (event: PointerEvent) => pedals[which].delete(event.pointerId),
      oncontextmenu: (event: Event) => event.preventDefault(),
    };
  }
</script>

<svelte:window onkeyup={on_keyup} onblur={release_all} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select class="w-[5.75rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    {#if mode === Mode.SCENARIO && !daily}
      <Select class="w-[7.5rem] min-w-0 @md:w-32" size="sm" aria-label="Kind of spot" options={PICK_OPTIONS} bind:value={() => pick, set_pick} />
    {:else if mode === Mode.LEVELS}
      <Select class="w-[7.5rem] min-w-0 @md:w-36" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
    {/if}
    {#if daily}<span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>{/if}
    <div class="flex-1"></div>
    <IconButton size="sm" label="Settings" popovertarget="ts-settings-{uid}" style="anchor-name: --ts-settings-{uid}">
      <SlidersIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" class="hidden @md:inline-flex" label={game.status === Status.DRIVING ? "Pause (Esc)" : "Resume"} disabled={!can_pause} onclick={toggle_pause}>
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
    id="ts-settings-{uid}"
    popover="auto"
    class="ts-popover m-0 w-64 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
    style="position-anchor: --ts-settings-{uid}"
  >
    <div class="flex flex-col gap-3">
      <label class="flex items-center justify-between gap-2 text-ui">
        Sound
        <Switch bind:checked={() => sound_on, (value: boolean) => set_setting("sound", value)} />
      </label>
      <label class="flex items-center justify-between gap-2 text-ui">
        <span>Guide lines <span class="text-foreground/65">· where the corners go</span></span>
        <Switch bind:checked={() => guides_on, (value: boolean) => set_setting("guides", value)} />
      </label>
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Keyboard wheel when let go</p>
      <Segmented size="sm" class="flex w-full [&>label]:flex-1 [&>label]:justify-center" label="Keyboard wheel" options={WHEEL_OPTIONS} bind:value={() => wheel_mode, set_wheel_mode} />
    </div>
  </div>

  <div class="flex min-h-0 flex-col gap-2 p-2 @md:gap-3 @md:p-3">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={board}
      role="application"
      aria-label="Tight Spot. Arrows steer and drive, E drive, R reverse, P park, Escape pauses."
      tabindex="0"
      class="relative min-h-0 flex-1 touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
      onwheel={on_wheel}
      onpointerdown={on_board_pointerdown}
      onpointermove={on_board_pointermove}
      onpointerup={on_board_pointerend}
      onpointercancel={on_board_pointerend}
    >
      <canvas bind:this={canvas} class="block size-full"></canvas>

      <div class="pointer-events-none absolute top-2 left-2 flex items-center gap-2" aria-hidden="true">
        <div class="flex items-center gap-0.5 rounded-md bg-background/80 px-1 py-0.5 font-mono text-ui backdrop-blur-[2px]">
          {#each GEARS as gear (gear)}
            <span class={cn("grid w-5 place-items-center rounded-sm", game.car.gear === gear ? "bg-primary font-semibold text-background" : "text-foreground/50")}>{gear}</span>
          {/each}
        </div>
        <div class="rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]">{speed} km/h</div>
      </div>
      {#if facing_reading !== null}
        <div
          class={cn(
            "pointer-events-none absolute top-2 right-2 rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]",
            facing_reading < 0.5 ? "text-error" : "text-warning"
          )}
          aria-hidden="true"
        >
          {game.car.gear === Gear.REVERSE ? "Rear" : "Front"} {facing_reading.toFixed(2)} m
        </div>
      {/if}

      {#if game.status === Status.READY}
        <BoardOverlay class={CARD} title={round_title(game.round)} detail={round_brief(game.round)}>
          <p class="hidden basis-full text-ui text-foreground/65 pointer-fine:block">Arrows steer and drive · E drive, R reverse, P park</p>
          <Button size="sm" variant="primary" onclick={start}>Start</Button>
        </BoardOverlay>
      {:else if game.status === Status.PAUSED}
        <BoardOverlay title="Paused" detail="{time} · Moves {game.moves}">
          <Button size="sm" variant="primary" onclick={start}>Resume</Button>
        </BoardOverlay>
      {:else if game.status === Status.PARKED}
        <BoardOverlay
          class={CARD}
          title="Parked {'★'.repeat(earned)}{'☆'.repeat(3 - earned)}"
          detail="{time} · Moves {game.moves}{new_best ? ' · New best' : best ? ` · Best ${best.moves} moves, ${format_time(best.ms, { tenths: true })}` : ''}"
        >
          <Button size="sm" variant="quiet" onclick={retry}>Again</Button>
          {#if game.round.level !== undefined}
            {#if has_next_level}<Button size="sm" variant="primary" onclick={next_round}>Next level</Button>{/if}
          {:else}
            <Button size="sm" variant="primary" onclick={new_spot}>New spot</Button>
          {/if}
        </BoardOverlay>
      {:else if game.status === Status.CRASHED}
        <BoardOverlay
          class={CARD}
          title="Touched {game.hit ? HIT_NAMES[game.hit.kind] : 'something'}"
          detail="{time} · Moves {game.moves}"
        >
          <Button size="sm" variant="primary" onclick={retry}>Try again</Button>
          {#if game.round.level === undefined && !game.round.daily}<Button size="sm" variant="quiet" onclick={new_spot}>New spot</Button>{/if}
        </BoardOverlay>
      {/if}
    </div>

    <div class="hidden shrink-0 items-end justify-between gap-3 pointer-coarse:flex" role="group" aria-label="Car controls">
      <SteeringWheel class="w-[min(9.5rem,34cqw)]" value={wheel} onchange={set_wheel} oncentre={centre_wheel} />
      <div class="flex flex-col gap-2">
        <Button
          size="lg"
          variant={game.car.gear === Gear.REVERSE ? "primary" : "secondary"}
          class="w-16 font-mono text-base"
          aria-label={game.car.gear === Gear.REVERSE ? "In reverse, switch to drive" : "Switch to reverse"}
          onclick={toggle_direction}
        >
          {game.car.gear === Gear.REVERSE ? "R" : game.car.gear === Gear.DRIVE ? "D" : "D/R"}
        </Button>
        <Button size="lg" variant={game.car.gear === Gear.PARK ? "primary" : "secondary"} class="w-16 font-mono text-base" aria-label="Park" onclick={() => shift(Gear.PARK)}>P</Button>
      </div>
      <div class="flex items-end gap-2">
        <button type="button" class="ts-pedal h-20 w-14 rounded-lg bg-foreground/10 text-ui font-medium active:bg-foreground/20" aria-label="Brake" {...hold_pedal("brake")}>Brake</button>
        <button type="button" class="ts-pedal h-28 w-14 rounded-lg bg-foreground/10 text-ui font-medium active:bg-primary/25" aria-label="Gas" {...hold_pedal("gas")}>Gas</button>
      </div>
    </div>
  </div>

  <StatusBar>
    <span class="tabular-nums">{time}</span>
    <span class="tabular-nums">Moves {game.moves}</span>
    <span class="tabular-nums">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
    {#if judged === "crooked"}<span class="text-warning">Not straight</span>{:else if judged === "outside"}<span class="text-warning">Not in a bay</span>{/if}
    {#if best}<span class="hidden tabular-nums @md:inline">Best {best.moves} · {format_time(best.ms, { tenths: true })}</span>{/if}
    <span class="hidden @5xl:inline">Arrows steer and drive · E drive · R reverse · P park · C centres</span>
  </StatusBar>
</div>

<style>
  .ts-popover {
    position-area: bottom span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }

  .ts-pedal {
    touch-action: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
</style>
