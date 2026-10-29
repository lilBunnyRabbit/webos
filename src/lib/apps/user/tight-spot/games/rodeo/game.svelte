<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Select } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "../../core/camera";
  import CrabToggle from "../../core/crab-toggle.svelte";
  import type { Palette } from "../../core/draw";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import KeyHint from "../../core/key-hint.svelte";
  import { CRAB_KEY, drive_note, DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, steer_hints, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import RoundCard from "../../core/round-card.svelte";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { End, sensor } from "../../core/sensors";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { body_centre, can_crab, Gear, max_steer, rig_length, Vehicle, VEHICLE_NAMES, VEHICLES, without_creep } from "../../core/vehicle";
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
    experimental,
    knocked,
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
    Status,
    step_line,
    toggle_crab,
    total_ms,
    vehicle_schema,
    type Data,
    type GameState,
    type Round,
  } from "./game";

  const COURSE_OPTIONS = Array.from({ length: COURSE_COUNT }, (_, i) => ({ value: String(i + 1), label: `Course ${i + 1}` }));
  const SHELF_OPTIONS = SHELVES.map((shelf) => ({ value: shelf.id, label: shelf.name }));
  const OVERVIEW_MARGIN = 1;
  const DAILY_MODE = "rodeo";

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const data = storage.file<Data>("rodeo.json", { bests: {} }, data_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let vehicle = $state<Vehicle>(storage.get("rodeo.vehicle", vehicle_schema) ?? Vehicle.HATCH);
  let course = $state(storage.get("rodeo.course", z.number().int().min(1).max(COURSE_COUNT)) ?? 1);

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
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
  const sounds = new Sounds(() => settings);

  const spec = $derived(spec_of(game.round));
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
    return course_round(vehicle, course);
  }

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
    void [game, palette, board_size, zoom, settings.guides, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
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

  function finish(state: GameState) {
    release_all();
    const cones = knocked(state);
    const ms = Math.round(total_ms(state));
    const done = record_best(data.value.bests, state.round, { ms, cones });
    data.value.bests = done.bests;
    new_best = done.improved;
    first_run = done.first;
    sounds.parked(new_best && !first_run);
    if (experimental(state.round.vehicle)) return;
    achievements.achieve("rodeo-first");
    if (cones === 0) achievements.achieve("rodeo-clean");
    if (spec_of(state.round).hitches.length > 0) achievements.achieve("rodeo-rig");
    achievements.progress("rodeo-shelves", shelves_done(done.bests));
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
    course = (course % COURSE_COUNT) + 1;
    storage.set("rodeo.course", course);
    load(make_round());
  }

  function primary_action() {
    if (game.status === Status.READY || game.status === Status.PAUSED) start();
    else if (game.status === Status.DONE && !game.round.daily) next_course();
    else if (over) retry();
  }

  function set_course(next: string) {
    daily = null;
    course = Math.max(1, Math.min(COURSE_COUNT, Number(next)));
    storage.set("rodeo.course", course);
    load(make_round());
  }

  function set_vehicle(next: Vehicle) {
    daily = null;
    vehicle = next;
    storage.set("rodeo.vehicle", next);
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

{#snippet toolbar()}
  {@render menu?.()}
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
    <Button size="sm" variant="quiet" class="hidden @md:inline-flex" onclick={leave_daily}>Courses</Button>
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
          {#if daily}<Badge tone="primary">{VEHICLE_NAMES[game.round.vehicle]}</Badge>{/if}
        </p>
        <p class="text-ui text-foreground/80">Gates in order, the slalom, stop in the box, back out through the gate. A cone is +5 s, the fence ends the run.</p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {best ? `Best ${format_time(best.ms, { tenths: true })}${best.cones ? ` (${best.cones} down)` : ""}` : "No run yet"}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if daily}
          <Button variant="quiet" class="@md:hidden" onclick={leave_daily}>Courses</Button>
        {:else}
          <Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>
        {/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      {#if !daily}{@render vehicle_picker()}{/if}
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
          {#if cones_down === 0}<Badge class="ts-pop" tone="success">Clean</Badge>{/if}
          {#if new_best}<Badge class="ts-pop" tone={first_run ? "neutral" : "primary"}>{first_run ? "First run" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {format_time(game.ms, { tenths: true })} driving · {penalty_text(cones_down)}{best && !new_best ? ` · best ${format_time(best.ms, { tenths: true })}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant={game.round.daily ? "primary" : "quiet"} onclick={retry}>Again</Button>
        {#if !game.round.daily}<Button variant="primary" onclick={next_course}>Next course</Button>{/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.round.daily}<KeyHint key_name="Enter" text="next course" />{/if}<KeyHint key_name="R" text="again" />
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
  :global(.ts-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }
</style>
