<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Segmented, Select } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fade, fit_span, frame, NO_INSETS, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "../../core/camera";
  import { veil, type Palette } from "../../core/draw";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import { bounds_of, centroid } from "../../core/geometry";
  import KeyHint from "../../core/key-hint.svelte";
  import CrabToggle from "../../core/crab-toggle.svelte";
  import { CRAB_KEY, drive_note, DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, steer_hints, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import { obstacles } from "../../core/obstacles";
  import RoundCard from "../../core/round-card.svelte";
  import { End, sensor } from "../../core/sensors";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { bodies, body_centre, can_crab, Gear, max_steer, rig_length, Vehicle, VEHICLE_NAMES, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    ANY,
    best_of,
    change_gear,
    crash_title,
    create_game,
    data_schema,
    EMPTY_DATA,
    LAP_LEVELS,
    LEVEL_COUNT,
    level_round,
    Mode,
    mode_schema,
    open_round,
    par,
    PERFECT,
    pick_schema,
    precision,
    record_best,
    round_brief,
    round_title,
    SCENARIO_INFO,
    scenario_round,
    set_status,
    spec_of,
    stars,
    Status,
    toggle_crab,
    unlocked,
    verdict,
    vehicle_pick_schema,
    vehicles_for,
    type GameState,
    type Round,
    type ScenarioPick,
    type VehiclePick,
  } from "./game";
  import { adopt_legacy } from "./legacy";
  import { SCENARIOS, Scenario } from "./world";

  const MODE_LABELS: Record<Mode, string> = { scenario: "Spots", levels: "Levels", open: "Open lot" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  const PICK_OPTIONS: { value: ScenarioPick; label: string }[] = [
    { value: ANY, label: "Any spot" },
    ...SCENARIOS.map((value) => ({ value, label: SCENARIO_INFO[value].name })),
  ];
  const VERDICTS = { crooked: "Not straight in the bay", backwards: "Facing the wrong way", outside: "Not inside a bay" } as const;

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const data = storage.file("parking.json", EMPTY_DATA, data_schema);
  const input = new DriveInput();

  // Per window, so two open games don't change each other's mode; storage only remembers the last pick.
  let daily = $state(daily_day ?? null);
  let mode = $state<Mode>(daily_day ? Mode.SCENARIO : (storage.get("parking.mode", mode_schema) ?? Mode.SCENARIO));
  let pick = $state<ScenarioPick>(storage.get("parking.pick", pick_schema) ?? ANY);
  let vehicle_pick = $state<VehiclePick>(storage.get("parking.vehicle", vehicle_pick_schema) ?? ANY);
  let level = $state(Math.min(LEVEL_COUNT, storage.get("parking.level", z.number().int().min(1)) ?? 1));

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let new_best = $state(false);
  let earned = $state(0);
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let zoom = $state(1);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let card_size = $state({ width: 0, height: 0 });
  let first_park = $state(false);
  let settings_panel: HTMLDivElement | undefined = $state();
  let steer_box = $state({ width: 0, height: 0 });
  let pedal_box = $state({ width: 0, height: 0 });
  let stage_rect = $state<DOMRectReadOnly>();
  let hud_height = $state(0);

  let camera: Camera | null = null;
  let cut_at = -Infinity;
  let readings: Record<End, number | null> = { front: null, rear: null };
  const sounds = new Sounds(() => settings);

  const spec = $derived(spec_of(game.round));
  const lock = $derived(max_steer(spec));
  const note = $derived(drive_note(spec));
  const span = $derived(view_span(rig_length(spec)));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.PARKED || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(best_of(data.value.bests, game.round));
  // A kind with one vehicle shows it, fixed; Any spot shows Any, fixed. The open lot has no Any: it was always the hatchback.
  const vehicle_options = $derived.by(() => {
    const allowed = allowed_vehicles().map((value) => ({ value: value as VehiclePick, label: VEHICLE_NAMES[value] }));
    return allowed.length === 1 || mode === Mode.OPEN ? allowed : [{ value: ANY as VehiclePick, label: "Any vehicle" }, ...allowed];
  });
  const choosing_vehicle = $derived((mode === Mode.SCENARIO && !daily) || mode === Mode.OPEN);
  const fit = $derived(game.status === Status.PARKED && game.bay ? precision(game.car, game.bay, spec) : null);
  const fit_percent = $derived(fit ? Math.round(fit.score) : 0);
  const round_par = $derived(par(game.round));
  const level_best = $derived(game.round.level !== undefined ? (data.value.levels[game.round.level] ?? 0) : 0);
  const max_level = $derived(unlocked(data.value.levels));
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const round = level_round(i + 1);
      const got = data.value.levels[i + 1] ?? 0;
      return { value: String(i + 1), label: `${i + 1} · ${SCENARIO_INFO[round.scenario!].name}${round.vehicle === Vehicle.HATCH ? "" : ` · ${VEHICLE_NAMES[round.vehicle]}`}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  // A wide board (a desktop window, a phone held sideways) takes cards on its left, centred: a strip at the bottom read as detached there.
  const side_card = $derived(size.height > 0 && size.width > size.height * 1.2);
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

  // With Any spot the kind isn't known yet and no vehicle fits every kind, so only Any is offered.
  function allowed_vehicles(): readonly Vehicle[] {
    if (mode === Mode.OPEN) return vehicles_for(null);
    return pick === ANY ? [] : vehicles_for(pick);
  }

  function chosen_vehicle(): VehiclePick {
    if (vehicle_pick !== ANY && allowed_vehicles().includes(vehicle_pick)) return vehicle_pick;
    return mode === Mode.OPEN ? Vehicle.HATCH : ANY;
  }

  function make_round(): Round {
    if (daily) return scenario_round(ANY, daily_seed(daily, app_id), daily);
    if (mode === Mode.LEVELS) return level_round(level);
    if (mode === Mode.OPEN) return open_round(random_seed(), chosen_vehicle());
    return scenario_round(pick, random_seed(), undefined, chosen_vehicle());
  }

  $effect(() => {
    if (data.ready) untrack(() => adopt_legacy(storage, data));
  });

  // The saved level can be past what's open (a reset data file): it's clamped once the file is read.
  $effect(() => {
    if (!data.ready || level <= max_level) return;
    untrack(() => {
      level = max_level;
      storage.set("parking.level", level);
      if (game.status === Status.READY && game.round.level !== undefined && !daily) load(make_round());
    });
  });

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => () => sounds.close());

  // The phone's Back closes the settings first, then pauses a running round, then leaves the game.
  $effect(() =>
    win.on_back(() => {
      if (settings_panel?.matches(":popover-open")) return (settings_panel.hidePopover(), true);
      if (game.status === Status.DRIVING) {
        toggle_pause();
        return true;
      }
      if (!onexit) return false;
      onexit();
      return true;
    })
  );

  $effect(() => {
    if (!driving || blocked) return;
    const stop = frame_loop(run, render, () => game.status === Status.DRIVING);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  // While driving the frame loop draws; this covers everything else (menus, a resize, a new theme).
  $effect(() => {
    void [game, palette, size, zoom, settings.guides, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function target_camera(): Camera {
    const bounds = game.world.bounds;
    const car = body_centre(game.car, spec);
    if (game.status === Status.READY && game.world.bays.length === 1) {
      // Before the start, frame the car and its bay together so the player sees the task.
      const bay = centroid(game.world.bays[0].shape);
      // A long rig or a long bay can reach past the usual margin round the two: frame all of both then.
      const all = bounds_of([...game.world.bays[0].shape, ...bodies(game.car, spec).flat()]);
      // The start card covers the bottom of the board, or its left on a wide one; the framing keeps clear of it, and
      // of the pedals floating on the right of a phone held sideways.
      const covered_x = side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
      const covered_y = side_card ? 0 : Math.min(card_size.height + 8, size.height * 0.5);
      const covered_right = sideways() ? pedal_box.width + OVERLAY_GAP : 0;
      const width = size.width - covered_x - covered_right;
      const height = size.height - covered_y;
      if (game.world.portals.length > 0) {
        // A garage with floors shows all of them side by side, the street, the ramps and the bay.
        const whole = frame(bounds, { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 }, width, height, zoom, NO_INSETS, fit_span(bounds, width, height, NO_INSETS, 1));
        return { ...whole, x: whole.x - (covered_x - covered_right) / 2 / whole.scale, y: whole.y + covered_y / 2 / whole.scale };
      }
      const across = Math.max(Math.abs(bay.x - car.x) + 12, all.x1 - all.x0 + 4);
      const along = Math.max(Math.abs(bay.y - car.y) + 12, all.y1 - all.y0 + 4);
      const long = across > Math.abs(bay.x - car.x) + 12 || along > Math.abs(bay.y - car.y) + 12;
      const middle = long ? { x: (all.x0 + all.x1) / 2, y: (all.y0 + all.y1) / 2 } : { x: (bay.x + car.x) / 2, y: (bay.y + car.y) / 2 };
      const short = Math.min(width, height);
      const fit = Math.min(1, (span * width) / short / across, (span * height) / short / along);
      const view = frame(bounds, middle, width, height, Math.max(0.25, fit) * zoom, NO_INSETS, span);
      return { ...view, x: view.x - (covered_x - covered_right) / 2 / view.scale, y: view.y + covered_y / 2 / view.scale };
    }
    const ahead = game.car.speed * 0.9;
    const focus = { x: car.x + Math.cos(game.car.heading) * ahead, y: car.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, size.width, size.height, zoom, control_insets(), span);
  }

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  // Everything drawn over the board: the HUD always, the end card once a round is over, the touch controls sideways.
  // The camera centres the car in what's left and lets the world's edge slide under them.
  function control_insets(): Insets {
    const ended = game.status === Status.PARKED || game.status === Status.CRASHED;
    const card_bottom = ended && !side_card ? Math.min(card_size.height + 16, size.height * 0.5) : 0;
    const card_left = ended && side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
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
    const view = { ...camera, width: size.width, height: size.height, dpr: size.dpr };
    const now = performance.now();
    draw_scene(ctx, game, view, palette, {
      guides: settings.guides,
      sensors: {
        front: game.car.gear === Gear.DRIVE ? readings.front : null,
        rear: game.car.gear === Gear.REVERSE ? readings.rear : null,
      },
      time: now / 1000,
      insets: control_insets(),
      font: getComputedStyle(canvas).fontFamily,
    });
    veil(ctx, view, fade((now - cut_at) / 1000), palette);
  }

  function run(steps: number, dt: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, spec, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, settings.creep ? spec : without_creep(spec));
    }
    input.follow(next.car.steer / lock);
    const near = obstacles(next.world);
    readings = { front: sensor(next.car, near, End.FRONT, spec), rear: sensor(next.car, near, End.REAR, spec) };
    if (next.status === Status.DRIVING) {
      const reading = next.car.gear === Gear.DRIVE ? readings.front : next.car.gear === Gear.REVERSE ? readings.rear : null;
      sounds.sensor(reading);
    }
    if (next === game) return;
    if (next.passes !== game.passes) {
      camera = null;
      cut_at = performance.now();
    }
    const before = game.status;
    game = next;
    if (before === Status.DRIVING && next.status === Status.CRASHED) crashed();
  }

  function crashed() {
    release_all();
    sounds.crash();
  }

  function parked(state: GameState) {
    release_all();
    const percent = state.bay ? Math.round(precision(state.car, state.bay, spec_of(state.round)).score) : undefined;
    const result = { moves: state.moves, ms: Math.round(state.ms), precision: percent };
    const recorded = record_best(data.value.bests, state.round, result);
    data.value.bests = recorded.bests;
    new_best = recorded.improved;
    first_park = recorded.first;
    sounds.parked(new_best && !first_park);
    earned = stars(state.round, state.moves);
    achievements.achieve("first-park");
    if (percent !== undefined && percent >= PERFECT) achievements.achieve("perfect-park");
    const scenario = state.round.scenario;
    if (scenario === null) achievements.achieve("open-lot");
    else {
      if (!data.value.kinds.includes(scenario)) data.value.kinds = [...data.value.kinds, scenario];
      achievements.progress("every-spot", data.value.kinds.length);
      if (scenario === Scenario.PARALLEL) {
        achievements.achieve("kerbside");
        if (state.moves <= 1) achievements.achieve("one-sweep");
      }
    }
    if (state.round.level !== undefined) {
      const at = state.round.level;
      data.value.levels[at] = Math.max(data.value.levels[at] ?? 0, earned);
      const done = Object.keys(data.value.levels).map(Number);
      achievements.progress("licensed", done.filter((level) => level <= LAP_LEVELS).length);
      achievements.progress("hardest-lap", done.filter((level) => level > LAP_LEVELS).length);
    }
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, result.moves, "parking");
      achievements.achieve("daily");
    }
  }

  function release_all() {
    input.release();
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
    else if (game.status === Status.DRIVING && change_gear(game, Gear.PARK).status === Status.PARKED) shift(Gear.PARK);
    else if (game.status === Status.PARKED) {
      if (game.round.level === undefined) new_spot();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(round: Round) {
    input.reset();
    sounds.quiet();
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
      storage.set("parking.level", level);
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
    storage.set("parking.mode", next);
    load(make_round());
  }

  function set_pick(next: ScenarioPick) {
    daily = null;
    pick = next;
    storage.set("parking.pick", next);
    load(make_round());
  }

  function set_vehicle(next: VehiclePick) {
    daily = null;
    vehicle_pick = next;
    storage.set("parking.vehicle", next);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(max_level, Number(next)));
    storage.set("parking.level", level);
    load(make_round());
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear);
    if (next === game) return;
    game = next;
    if (next.status === Status.DRIVING) sounds.shift();
    if (next.status === Status.PARKED) parked(next);
  }

  // Holding an arrow or a pedal against the gear only brakes; pressing it again once the car stands shifts that way.
  function choose_direction(want: Gear | null) {
    if (want && Math.abs(game.car.speed) < STANDING) shift(want);
  }

  function crab() {
    if (game.status === Status.READY) start();
    game = toggle_crab(game);
  }

  function set_wheel(value: number) {
    if (game.status === Status.READY) start();
    input.set_wheel(value);
  }

  function engage(): boolean {
    if (game.status === Status.READY) start();
    return game.status === Status.DRIVING;
  }

  function on_press(which: Hold) {
    if (which === "gas") choose_direction(Gear.DRIVE);
    else if (which === "brake") choose_direction(Gear.REVERSE);
  }

  // Keys drive from anywhere in the window but a field or the settings, so clicking a button never strands the arrows.
  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey) return release_all();
    const target = event.target;
    if (is_field(target)) return;
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
    const zooming = zoom_step(code);
    if (zooming) {
      event.preventDefault();
      zoom = clamp_zoom(zoom * zooming);
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
      input.keys.add(code);
      if (game.status === Status.READY && !event.repeat) start();
      if (!event.repeat) choose_direction(key_direction(code));
      return;
    }
    if (code === "KeyC") {
      event.preventDefault();
      set_wheel(0);
      return;
    }
    if (code === CRAB_KEY && can_crab(spec)) {
      event.preventDefault();
      if (!event.repeat) crab();
      return;
    }
    const gear = GEAR_KEYS[code];
    if (gear && !event.repeat) {
      event.preventDefault();
      shift(gear);
    }
  }
</script>

{#snippet star_row(count: number, reveal: boolean)}
  <span class="inline-flex items-center gap-0.5" role="img" aria-label="{count} of 3 stars">
    {#each [1, 2, 3] as n (n)}
      <span class={cn("inline-grid", n <= count ? "text-primary" : "text-foreground/20", reveal && n <= count && "ts-star")} style:animation-delay={reveal ? `${n * 140}ms` : undefined}>
        <StarIcon weight="fill" class="size-4" />
      </span>
    {/each}
  </span>
{/snippet}

<!-- Three pickers and the buttons don't fit one row of a narrow board, so there the picker sits on the start card. -->
{#snippet vehicle_picker(class_name: string)}
  <Select
    class={class_name}
    size="sm"
    aria-label="Vehicle"
    disabled={vehicle_options.length === 1}
    options={vehicle_options}
    bind:value={() => (vehicle_options.length === 1 ? vehicle_options[0].value : chosen_vehicle()), set_vehicle}
  />
{/snippet}

{#snippet kind_picker(class_name: string)}
  <Select class={class_name} size="sm" aria-label="Kind of spot" options={PICK_OPTIONS} bind:value={() => pick, set_pick} />
{/snippet}

{#snippet toolbar()}
  {@render menu?.()}
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
  <Select class="w-[5.75rem] @xl:hidden pointer-coarse:w-[6.5rem]" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
  {#if mode === Mode.SCENARIO && !daily}
    {@render kind_picker("hidden w-32 min-w-0 @md/ts-app:inline-flex")}
  {:else if mode === Mode.LEVELS}
    <Select class="w-[7.5rem] min-w-0 @md:w-40" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
  {/if}
  {#if choosing_vehicle}{@render vehicle_picker("hidden w-36 min-w-0 @2xl/ts-app:inline-flex")}{/if}
  {#if daily}<span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>{/if}
  <div class="flex-1"></div>
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Retry this spot" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode !== Mode.LEVELS}
    <Button size="sm" variant="primary" onclick={new_spot}>New</Button>
  {/if}
{/snippet}

{#snippet overlay()}
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
        <GearStrip gear={game.car.gear} onshift={shift} />
        {#if can_crab(spec)}<CrabToggle on={!!game.car.crab} onclick={crab} />{/if}
        <SpeedChip class="pointer-coarse:hidden" speed={game.car.speed} />
        <!-- A phone held sideways folds the status bar away for board height; its time and moves come up here. -->
        <div class="ts-fold hidden rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-hidden="true">
          {time} <span class="text-foreground/65">· {moves_text(game.moves)}</span>
        </div>
      </div>
      <!-- On touch the bigger gear strip leaves no room beside it, so the speed stacks over the sensor readout. -->
      <div class="flex flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
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

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)}
          <Badge tone={game.round.vehicle === Vehicle.HATCH ? "neutral" : "primary"}>{VEHICLE_NAMES[game.round.vehicle]}</Badge>
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">{round_brief(game.round)}</p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          Par {moves_text(round_par)}{best ? ` · Best ${moves_text(best.moves)}, ${format_time(best.ms, { tenths: true })}` : ""}{best?.precision !== undefined ? ` · precision ${best.precision}%` : ""}
        </p>
        {#if mode === Mode.SCENARIO && !daily}
          <!-- A phone's toolbar has no room for it next to the switcher, the mode, settings and New. -->
          <div class="mt-1.5 flex items-center gap-2 text-2xs text-foreground/65 @md/ts-app:hidden">
            Spot {@render kind_picker("w-40 min-w-0")}
          </div>
        {/if}
        {#if choosing_vehicle && vehicle_options.length > 1}
          <div class="mt-1.5 flex items-center gap-2 text-2xs text-foreground/65 @2xl/ts-app:hidden">
            Vehicle {@render vehicle_picker("w-40 min-w-0")}
          </div>
        {/if}
      </div>
      <Button class="ml-auto" variant="primary" onclick={start}>Start</Button>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" />{#each steer_hints(spec) as hint (hint.key_name)}<KeyHint {...hint} />{/each}<KeyHint key_name="E" text="drive" /><KeyHint key_name="R" text="reverse" /><KeyHint key_name="P" text="park" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Hold Gas to go forward and Brake to back up, steer, tap P at the top once you're in the bay.</p>
      {#if note}<p class="basis-full text-2xs text-foreground/65">{note}</p>{/if}
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · Moves {game.moves}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.PARKED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Parked
          {@render star_row(earned, true)}
          {#if fit_percent >= PERFECT}<Badge class="ts-pop" tone="success">Perfect</Badge>{/if}
          {#if new_best}<Badge class="ts-pop" tone={first_park ? "neutral" : "primary"}>{first_park ? "First park" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {moves_text(game.moves)} · par {round_par}</p>
        {#if fit}
          <p class="flex flex-wrap gap-x-1.5 font-mono text-2xs text-foreground/80 tabular-nums" title="Off centre across the bay, along it, and off straight">
            <span>Precision {fit_percent}%</span>
            <span class="text-foreground/65">· ↔ {Math.round(fit.side * 100)} cm</span>
            <span class="text-foreground/65">· ↕ {Math.round(fit.depth * 100)} cm</span>
            <span class="text-foreground/65">· ∠ {((fit.angle * 180) / Math.PI).toFixed(1)}°</span>
          </p>
        {/if}
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
        {#if game.round.level === undefined || has_next_level}<KeyHint key_name="Enter" text={game.round.level === undefined ? "new spot" : "next level"} />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.hit)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {moves_text(game.moves)}</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_spot}>New spot</Button>{/if}
        <Button variant="primary" onclick={retry}>Try again</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="tries again" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{round_title(game.round)}</span>
  <span class="tabular-nums">{time}</span>
  <span class="tabular-nums">Moves {game.moves}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  {#if best}<span class="hidden tabular-nums @lg:inline">Best {best.moves} · {format_time(best.ms, { tenths: true })}</span>{/if}
  <span class="hidden @5xl:inline">Esc pauses · Enter starts · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Tight Spot. Arrows steer and drive, E drive, R reverse, P park, Escape pauses, Enter starts."
  {input}
  {settings}
  wheel_idle={!driving}
  pedals_idle={game.status === Status.PAUSED}
  {engage}
  onpress={on_press}
  onsteer={set_wheel}
  onkeydown={on_keydown}
  onrelease={release_all}
  {toolbar}
  {overlay}
  {status}
  bind:board
  bind:canvas
  bind:size
  bind:palette
  bind:zoom
  bind:stage_rect
  bind:steer_box
  bind:pedal_box
/>

<style>
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
