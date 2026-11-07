<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { report_error } from "$kit/utils/report-error";
  import { Badge, BoardOverlay, Button, IconButton, Segmented, Select } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "$kit/games/play2d/camera";
  import CrabToggle from "../../core/crab-toggle.svelte";
  import type { Palette } from "$kit/games/play2d/palette";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import { KeyHint } from "$kit/components/play2d";
  import { CRAB_KEY, drive_note, DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, steer_hints, zoom_step } from "../../core/keys";
  import { frame_loop } from "$kit/games/play2d/loop";
  import { RoundCard } from "$kit/components/play2d";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { End, sensor } from "../../core/sensors";
  import { Sounds } from "../../core/sound";
  import { SpeedChip } from "$kit/components/play2d";
  import { body_centre, can_crab, Gear, max_steer, rig_length, Vehicle, VEHICLE_NAMES, VEHICLES, without_creep } from "../../core/vehicle";
  import TrackPicker from "../../core/track-picker.svelte";
  import { levels_done, with_stars } from "../../core/track";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    change_gear,
    COURSE_COUNT,
    course_round,
    crash_title,
    create_game,
    daily_round,
    data_schema,
    EMPTY_DATA,
    experimental,
    knocked,
    LEVEL_COUNT,
    LEVELS,
    level_of,
    level_round,
    Mode,
    mode_schema,
    PENALTY_MS,
    record_best,
    rodeo_shelf,
    sensed,
    round_key,
    round_title,
    set_status,
    shelves_done,
    SHELVES,
    spec_of,
    stars,
    Status,
    step_line,
    toggle_crab,
    total_ms,
    unlocked,
    vehicle_schema,
    type GameState,
    type Recorded,
    type Par,
    type Round,
  } from "./game";
  import { work_out_par, type ParJob } from "./par";

  const COURSE_OPTIONS = Array.from({ length: COURSE_COUNT }, (_, i) => ({ value: String(i + 1), label: `Course ${i + 1}` }));
  const MODE_LABELS: Record<Mode, string> = { courses: "Courses", levels: "Levels" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  const SHELF_OPTIONS = SHELVES.map((shelf) => ({ value: shelf.id, label: shelf.name }));
  const OVERVIEW_MARGIN = 1;
  const DAILY_MODE = "rodeo";

  const { settings, prefs, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const data = storage.file("rodeo.json", EMPTY_DATA, data_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  const stored = z
    .object({
      "rodeo.mode": mode_schema.catch(Mode.LEVELS),
      "rodeo.vehicle": vehicle_schema.catch(Vehicle.HATCH),
      "rodeo.course": z.number().int().min(1).max(COURSE_COUNT).catch(1),
      "rodeo.level": z.number().int().min(1).catch(1),
    })
    .parse(untrack(() => prefs.value));
  let mode = $state<Mode>(stored["rodeo.mode"]);
  let vehicle = $state<Vehicle>(stored["rodeo.vehicle"]);
  let course = $state(stored["rodeo.course"]);
  let level = $state(Math.min(LEVEL_COUNT, stored["rodeo.level"]));

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let par = $state.raw<Par | null>(null);
  let par_failed = $state(false);
  let new_best = $state(false);
  let first_run = $state(false);
  let board_size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let zoom = $state(1);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let card_size = $state({ width: 0, height: 0 });
  let settings_panel: HTMLDivElement | undefined = $state();
  let steer_box = $state({ width: 0, height: 0 });
  let pedal_box = $state({ width: 0, height: 0 });
  let stage_rect = $state<DOMRectReadOnly>();
  let hud_height = $state(0);

  let camera: Camera | null = null;
  let readings: Record<End, number | null> = { front: null, rear: null };
  let par_job: ParJob | null = null;
  // A level finished before its par was known: the par, when it lands, may still earn it the time star.
  let awaiting: { state: GameState; stars: number } | null = null;
  const sounds = new Sounds(() => settings);

  // `game` is replaced every frame; the round object only changes with a new round (Again keeps it, and its par).
  const round = $derived(game.round);
  const spec = $derived(spec_of(game.round));
  const level_info = $derived(level_of(round));
  const max_level = $derived(unlocked(data.value.levels));
  const level_best = $derived(round.level !== undefined ? (data.value.levels[round.level] ?? 0) : 0);
  const has_next_level = $derived(round.level !== undefined && round.level < LEVEL_COUNT);
  const earned = $derived(stars(game, par?.ms ?? null));
  const par_time = $derived(par ? format_time(par.ms) : null);
  const lock = $derived(max_steer(spec));
  const span = $derived(view_span(rig_length(spec)));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const best = $derived(data.value.bests[round_key(game.round)]);
  const line = $derived(step_line(game));
  const cones_down = $derived(knocked(game));
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const time = $derived(format_time(total_ms(game), { tenths: true }));
  const note = $derived(drive_note(spec));
  const shelf = $derived(rodeo_shelf(vehicle));
  const trial = $derived(experimental(game.round.vehicle));
  const vehicle_options = $derived(shelf.vehicles.map((each) => ({ value: each, label: VEHICLE_NAMES[each] })));
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");

  const facing_reading = $derived.by(() => {
    if (game.status !== Status.DRIVING) return null;
    if (game.car.gear === Gear.DRIVE) return readings.front;
    if (game.car.gear === Gear.REVERSE) return readings.rear;
    return null;
  });

  function make_round(): Round {
    if (daily) return daily_round(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`));
    if (mode === Mode.LEVELS) return level_round(level);
    return course_round(vehicle, course);
  }

  // The saved level can be past what's open (a reset data file): it's clamped once the file is read.
  $effect(() => {
    if (!data.ready || level <= max_level) return;
    untrack(() => {
      level = max_level;
      prefs.value["rodeo.level"] = level;
      if (game.status === Status.READY && game.round.level !== undefined && !daily) load(make_round());
    });
  });

  // A level's par comes from the planner in a worker; the run can start, and finish, before it's known.
  $effect(() => {
    const current = round;
    untrack(() => {
      par_job?.cancel();
      par_job = null;
      par = null;
      par_failed = false;
      if (current.level === undefined) return;
      const job = work_out_par(current);
      par_job = job;
      job.result.then(
        (found) => {
          if (par_job !== job) return;
          par = found;
          par_failed = found === null;
          settle(current, found);
        },
        (reason: unknown) => {
          if (par_job !== job) return;
          par_failed = true;
          awaiting = null;
          report_error(app_id, "Couldn't work out the par", reason);
        }
      );
    });
  });

  $effect(() => () => par_job?.cancel());

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function penalty_text(count: number): string {
    return count === 0 ? "no cones down" : `${count} ${count === 1 ? "cone" : "cones"} down, +${(count * PENALTY_MS) / 1000} s`;
  }

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => () => sounds.close());

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

  $effect(() => {
    void [game, palette, board_size, zoom, settings.guides, settings.hitboxes, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function control_insets(): Insets {
    const carded = game.status !== Status.DRIVING && game.status !== Status.PAUSED;
    const card_bottom = carded && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.6) : 0;
    const card_left = carded && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const top = game.status === Status.READY ? 8 : hud_height + 8;
    const insets = { top, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.course;
    if (game.status === Status.READY) {
      const middle = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(bounds, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(game.car, spec);
    const ahead = game.car.speed * 0.8;
    const focus = { x: centre.x + Math.cos(game.car.heading) * ahead, y: centre.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, board_size.width, board_size.height, zoom, insets, span);
  }

  function render(dt: number) {
    if (!canvas || !palette || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_scene(ctx, game, { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr }, palette, {
      guides: settings.guides,
      hitboxes: settings.hitboxes,
      sensors: {
        front: game.car.gear === Gear.DRIVE ? readings.front : null,
        rear: game.car.gear === Gear.REVERSE ? readings.rear : null,
      },
      time: performance.now() / 1000,
      insets: control_insets(),
      font: getComputedStyle(canvas).fontFamily,
    });
  }

  function run(steps: number, dt: number) {
    let next = game;
    const driven = settings.creep ? spec : without_creep(spec);
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, spec, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, driven);
    }
    input.follow(next.car.steer / lock);
    const near = sensed(next);
    readings = { front: sensor(next.car, near, End.FRONT, spec), rear: sensor(next.car, near, End.REAR, spec) };
    if (next.status === Status.DRIVING) sounds.sensor(next.car.gear === Gear.DRIVE ? readings.front : next.car.gear === Gear.REVERSE ? readings.rear : null);
    sounds.reverse_beeper(!!spec.reverse_beeper && next.status === Status.DRIVING && next.car.speed < -0.02);
    if (next === game) return;
    const before = game;
    game = next;
    if (knocked(next) > knocked(before)) sounds.crash();
    if (next.current > before.current && next.status === Status.DRIVING) sounds.shift();
    if (before.status === Status.DRIVING && next.status === Status.CRASHED) {
      release_all();
      sounds.crash();
    }
    if (before.status === Status.DRIVING && next.status === Status.DONE) finish(next);
  }

  function record(state: GameState, score: number): Recorded {
    const cones = knocked(state);
    const ms = Math.round(total_ms(state));
    const at = state.round.level;
    const done = record_best(data.value.bests, state.round, { ms, cones, ...(at === undefined ? {} : { stars: score }) });
    data.value.bests = done.bests;
    if (at !== undefined) {
      data.value.levels = with_stars(data.value.levels, at, score);
      achievements.progress("rodeo-levels", levels_done(data.value.levels));
    }
    return done;
  }

  // The time star arrives with the par: the run is recorded again with it, as a better result.
  function settle(for_round: Round, found: Par | null) {
    const waiting = awaiting;
    if (!waiting || waiting.state.round !== for_round) return;
    awaiting = null;
    if (!found) return;
    const score = stars(waiting.state, found.ms);
    if (score <= waiting.stars) return;
    const done = record(waiting.state, score);
    if (game.round === for_round && game.status === Status.DONE) new_best ||= done.improved;
  }

  function finish(state: GameState) {
    release_all();
    const cones = knocked(state);
    const ms = Math.round(total_ms(state));
    const score = stars(state, par?.ms ?? null);
    const done = record(state, score);
    new_best = done.improved;
    first_run = done.first;
    awaiting = state.round.level !== undefined && !par && !par_failed && score < 3 ? { state, stars: score } : null;
    sounds.parked(new_best && !first_run);
    if (experimental(state.round.vehicle)) return;
    achievements.achieve("rodeo-first");
    if (cones === 0) achievements.achieve("rodeo-clean");
    if (spec_of(state.round).hitches.length > 0) achievements.achieve("rodeo-rig");
    achievements.progress("rodeo-shelves", shelves_done(data.value.bests));
    if (state.round.daily) {
      play.daily(state.round.daily, ms, cones, DAILY_MODE);
      achievements.achieve("rodeo-daily");
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

  function load(round: Round) {
    input.reset();
    sounds.quiet();
    new_best = false;
    first_run = false;
    camera = null;
    readings = { front: null, rear: null };
    game = create_game(round);
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function next_course() {
    daily = null;
    if (game.round.level !== undefined) {
      level = Math.min(max_level, game.round.level + 1);
      prefs.value["rodeo.level"] = level;
    } else {
      course = (course % COURSE_COUNT) + 1;
      prefs.value["rodeo.course"] = course;
    }
    load(make_round());
  }

  const can_go_on = $derived(!game.round.daily && (game.round.level === undefined || (has_next_level && max_level > game.round.level)));

  function primary_action() {
    if (game.status === Status.READY || game.status === Status.PAUSED) start();
    else if (game.status === Status.DONE && can_go_on) next_course();
    else if (over) retry();
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    prefs.value["rodeo.mode"] = next;
    load(make_round());
  }

  function level_name(at: number): string {
    return `${at} · ${LEVELS[at - 1].name}`;
  }

  function set_level(next: string) {
    daily = null;
    level = Math.max(1, Math.min(max_level, Number(next)));
    prefs.value["rodeo.level"] = level;
    load(make_round());
  }

  function set_course(next: string) {
    daily = null;
    course = Math.max(1, Math.min(COURSE_COUNT, Number(next)));
    prefs.value["rodeo.course"] = course;
    load(make_round());
  }

  function set_vehicle(next: Vehicle) {
    daily = null;
    vehicle = next;
    prefs.value["rodeo.vehicle"] = next;
    load(make_round());
  }

  function set_shelf(id: string) {
    const found = SHELVES.find((each) => each.id === id);
    if (found && found !== shelf) set_vehicle(found.vehicles[0]);
  }

  function open_daily() {
    daily = today();
    load(make_round());
  }

  function leave_daily() {
    daily = null;
    load(make_round());
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear, spec);
    if (next === game) return;
    game = next;
    sounds.shift();
  }

  function crab() {
    if (game.status === Status.READY) start();
    const next = toggle_crab(game, spec);
    if (next === game) return;
    game = next;
    sounds.shift();
    focus_board();
  }

  function choose_direction(want: Gear | null) {
    if (want && Math.abs(game.car.speed) < STANDING) shift(want);
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
    if (code === CRAB_KEY && can_crab(spec)) {
      event.preventDefault();
      if (!event.repeat) crab();
      return;
    }
    if (code === "KeyC") {
      event.preventDefault();
      set_wheel(0);
      return;
    }
    const gear = GEAR_KEYS[code];
    if (gear && !event.repeat) {
      event.preventDefault();
      shift(gear);
    }
  }
</script>

{#snippet vehicle_picker()}
  <div class="flex basis-full flex-wrap items-center gap-2">
    <Select class="w-36 min-w-0" size="sm" aria-label="Kind of vehicle" options={SHELF_OPTIONS} bind:value={() => shelf.id, set_shelf} />
    <Select class="w-40 min-w-0 flex-1" size="sm" aria-label="Vehicle" options={vehicle_options} bind:value={() => vehicle, set_vehicle} />
  </div>
{/snippet}

{#snippet star_row(count: number, reveal: boolean)}
  <span class="inline-flex items-center gap-0.5" role="img" aria-label="{count} of 3 stars">
    {#each [1, 2, 3] as n (n)}
      <span class={cn("inline-grid", n <= count ? "text-primary" : "text-foreground/20", reveal && n <= count && "ts-star")} style:animation-delay={reveal ? `${n * 140}ms` : undefined}>
        <StarIcon weight="fill" class="size-4" />
      </span>
    {/each}
  </span>
{/snippet}

{#snippet toolbar()}
  {@render menu?.()}
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
  <Select class="w-[6.5rem] min-w-0 @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
    <Button size="sm" variant="quiet" class="hidden @md:inline-flex" onclick={leave_daily}>{MODE_LABELS[mode]}</Button>
  {:else if mode === Mode.LEVELS}
    <TrackPicker
      class="w-[7.5rem] min-w-0 @md:w-40"
      open={max_level}
      stars={(at) => data.value.levels[at] ?? 0}
      name={level_name}
      value={String(level)}
      onpick={set_level}
    />
  {:else}
    <Select class="w-[7.5rem] min-w-0" size="sm" aria-label="Course" options={COURSE_OPTIONS} bind:value={() => String(course), set_course} />
    <Select class="hidden w-40 min-w-0 @2xl:inline-flex" size="sm" aria-label="Vehicle" options={vehicle_options} bind:value={() => vehicle, set_vehicle} />
  {/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this run" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
{/snippet}

{#snippet overlay()}
  {#if game.status !== Status.READY}
    <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
      <div class="flex min-w-0 flex-col items-start gap-1.5">
        <div class="flex items-center gap-1.5">
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
        </div>
        <div class="flex max-w-full flex-wrap items-center gap-1.5">
          <div class="rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-hidden="true">
            {time}{#if cones_down}<span class="text-warning"> · {cones_down} {cones_down === 1 ? "cone" : "cones"}</span>{/if}
          </div>
          {#if line && game.status !== Status.DONE}
            <div class="max-w-full truncate rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]" aria-live="polite">
              <span class="text-primary">●</span>
              {line}
            </div>
          {/if}
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
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

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)}
          {#if daily || level_info}<Badge tone="primary">{VEHICLE_NAMES[game.round.vehicle]}</Badge>{/if}
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        {#if level_info}<p class="text-ui font-medium">{level_info.brings}</p>{/if}
        <p class="text-ui text-foreground/80">
          Gates in order,{level_info?.shape.bay ? " turn round in the bay," : ""} the slalom, stop in the box, back out through the gate. A cone is +5 s, the fence ends the run.
        </p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {level_info ? `Par ${par_time ?? (par_failed ? "none" : "…")} · ` : ""}{best ? `Best ${format_time(best.ms, { tenths: true })}${best.cones ? ` (${best.cones} down)` : ""}` : "No run yet"}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if daily}
          <Button variant="quiet" class="@md:hidden" onclick={leave_daily}>{MODE_LABELS[mode]}</Button>
        {:else}
          <Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>
        {/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      {#if !daily && !level_info}{@render vehicle_picker()}{/if}
      {#if trial}<p class="basis-full text-2xs text-warning">Experimental: no course is proven for a chain of trailers, so this one may be impossible. Runs count for bests only.</p>{/if}
      {#if note}<p class="basis-full text-2xs text-foreground/65">{note}</p>{/if}
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" />{#each steer_hints(spec) as hint (hint.key_name)}<KeyHint {...hint} />{/each}<KeyHint key_name="Esc" text="pause" />
      </p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · {penalty_text(cones_down)}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {time}
          {#if level_info}{@render star_row(earned, true)}{/if}
          {#if cones_down === 0}<Badge class="ts-pop" tone="success">Clean</Badge>{/if}
          {#if new_best}<Badge class="ts-pop" tone={first_run ? "neutral" : "primary"}>{first_run ? "First run" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {format_time(game.ms, { tenths: true })} driving · {penalty_text(cones_down)}{par_time ? ` · par ${par_time}` : ""}{best && !new_best ? ` · best ${format_time(best.ms, { tenths: true })}` : ""}
        </p>
        {#if level_info && !par && !par_failed}<p class="text-2xs text-foreground/65">Working out the par…</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant={can_go_on ? "quiet" : "primary"} onclick={retry}>Again</Button>
        {#if can_go_on}<Button variant="primary" onclick={next_course}>{level_info ? "Next level" : "Next course"}</Button>{/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if can_go_on}<KeyHint key_name="Enter" text={level_info ? "next level" : "next course"} />{/if}<KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.crash)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {line ?? ""}</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="primary" onclick={retry}>Try again</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="tries again" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{round_title(game.round)} · {VEHICLE_NAMES[game.round.vehicle]}</span>
  <span class="tabular-nums">{time}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  {#if best}<span class="hidden tabular-nums @lg:inline">Best {format_time(best.ms, { tenths: true })}</span>{/if}
  <span class="hidden @5xl:inline">Esc pauses · Enter starts · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Rodeo. Arrows steer and drive, E drive, R reverse, P park, Escape pauses, Enter starts."
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
  bind:size={board_size}
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
