<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { report_error } from "$kit/utils/report-error";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Segmented, Select } from "$lib/core/components/ui";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowUUpLeft as UndoIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Star as StarIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "../../core/camera";
  import type { Palette } from "../../core/draw";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import KeyHint from "../../core/key-hint.svelte";
  import { DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import RoundCard from "../../core/round-card.svelte";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { body_centre, Gear, max_steer, rig_length, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    balance,
    balance_text,
    balance_with,
    balanced,
    BALANCE_LIMIT,
    change_gear,
    crash_title,
    create_game,
    daily_round,
    data_schema,
    EMPTY_DATA,
    fault_text,
    is_bus,
    LEVEL_COUNT,
    level_round,
    Mode,
    mode_schema,
    queue_line,
    record,
    round_key,
    round_title,
    sailing_round,
    set_status,
    spec_of,
    stars,
    Status,
    undo,
    unlocked,
    vehicle_name,
    verdict_of,
    type GameState,
    type Par,
    type Recorded,
    type Round,
  } from "./game";
  import { work_out_par, type ParJob } from "./par";

  const MODE_LABELS: Record<Mode, string> = { sailings: "Sailings", levels: "Levels" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  const OVERVIEW_MARGIN = 0.6;
  const DAILY_MODE = "ferry";
  // The gauge's ends: a load past this reads as hard over, and the limit band stays wide enough to see.
  const GAUGE_RANGE = 0.4;

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const data = storage.file("ferry.json", EMPTY_DATA, data_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let mode = $state<Mode>(storage.get("ferry.mode", mode_schema) ?? Mode.SAILINGS);
  let level = $state(Math.min(LEVEL_COUNT, storage.get("ferry.level", z.number().int().min(1)) ?? 1));

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
  let par_job: ParJob | null = null;
  let par_round: Round | null = null;
  let orphan: ParJob | null = null;
  // A sailing recorded before its par was known: the par, when it lands, may still earn it the time star.
  let awaiting: Finished | null = null;
  const sounds = new Sounds();

  // `game` is replaced every frame; the round object only changes with a new round (Again keeps it, and its par).
  const round = $derived(game.round);
  const spec = $derived(spec_of(game));
  const lock = $derived(max_steer(spec));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const can_undo = $derived(driving && game.history.length > 0);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(data.value.bests[round_key(game.round)]);
  const line = $derived(queue_line(game));
  const earned = $derived(stars(game, par?.ms ?? null));
  const trim = $derived(game.status === Status.DONE ? balance(game.deck, game.stowed) : balance_with(game));
  const level_load = $derived(balanced(trim));
  // Only once the vehicle has been in gear: it comes onto the quay in P, and a verdict before driving reads as a scolding.
  const hint = $derived(game.status === Status.DRIVING && game.car.gear === Gear.PARK && game.last_drive !== null ? fault_text(verdict_of(game)) : null);
  const max_level = $derived(unlocked(data.value.levels));
  const level_best = $derived(game.round.level !== undefined ? (data.value.levels[game.round.level] ?? 0) : 0);
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const got = data.value.levels[i + 1] ?? 0;
      return { value: String(i + 1), label: `Level ${i + 1}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const time = $derived(format_time(game.ms, { tenths: true }));
  const par_time = $derived(par ? format_time(par.ms) : null);
  const needle = $derived(Math.max(-1, Math.min(1, trim / GAUGE_RANGE)));

  interface Finished {
    state: GameState;
    stars: number;
  }

  function make_round(): Round {
    if (daily) return daily_round(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`));
    if (mode === Mode.LEVELS) return level_round(level);
    return sailing_round(random_seed());
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // The par comes from the planner in a worker; the round can start, and finish, before it's known.
  $effect(() => {
    const current = round;
    untrack(() => {
      if (par_job && awaiting?.state.round === par_round) {
        orphan?.cancel();
        orphan = par_job;
      } else par_job?.cancel();
      par = null;
      par_failed = false;
      const job = work_out_par(current);
      par_job = job;
      par_round = current;
      job.result.then(
        (found) => {
          settle(current, found);
          if (par_job !== job) return;
          par = found;
          par_failed = found === null;
        },
        (reason: unknown) => {
          if (awaiting?.state.round === current) awaiting = null;
          if (par_job !== job) return;
          par_failed = true;
          report_error(app_id, "Couldn't work out the par", reason);
        }
      );
    });
  });

  $effect(() => () => {
    par_job?.cancel();
    orphan?.cancel();
  });

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
    const card_bottom = carded && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.55) : 0;
    const card_left = carded && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const top = game.status === Status.READY ? 8 : hud_height + 8;
    const insets = { top, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  // Before the start, and once loaded, the whole ferry and quay show; while driving the camera follows the vehicle.
  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.deck;
    if (game.status === Status.READY || game.status === Status.DONE) {
      const middle = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(bounds, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(game.car, spec);
    const ahead = game.car.speed * 0.8;
    const focus = { x: centre.x + Math.cos(game.car.heading) * ahead, y: centre.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, board_size.width, board_size.height, zoom, insets, view_span(rig_length(spec)));
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
      time: performance.now() / 1000,
      insets: control_insets(),
      font: getComputedStyle(canvas).fontFamily,
    });
  }

  function run(steps: number, dt: number) {
    let next = game;
    const current = spec;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, current, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, settings.creep ? current : without_creep(current));
    }
    input.follow(next.car.steer / lock);
    if (settings.sound) sounds.reverse_beeper(next.status === Status.DRIVING && next.car.speed < -0.02 && !!current.reverse_beeper);
    if (next === game) return;
    const before = game.status;
    game = next;
    if (before === Status.DRIVING && next.status === Status.CRASHED) crashed();
  }

  function crashed() {
    release_all();
    if (settings.sound) sounds.crash();
  }

  function finish(state: GameState) {
    release_all();
    const result = save(state, stars(state, par?.ms ?? null));
    new_best = result.improved;
    first_run = result.first;
    if (settings.sound) sounds.parked(new_best && !first_run);
    awaiting = !par && !par_failed && result.stars < 3 ? { state, stars: result.stars } : null;
  }

  // The time star arrives with the par: the run is recorded again with it, as a better result.
  function settle(for_round: Round, found: Par | null) {
    const waiting = awaiting;
    if (!waiting || waiting.state.round !== for_round) return;
    awaiting = null;
    if (!found) return;
    const score = stars(waiting.state, found.ms);
    if (score <= waiting.stars) return;
    const result = save(waiting.state, score);
    if (game.round === for_round && game.status === Status.DONE) new_best ||= result.improved;
  }

  function save(state: GameState, score: number): Recorded & { stars: number } {
    const result = { stars: score, ms: Math.round(state.ms) };
    const done = record(data.value, state.round, result);
    data.value = done.data;
    const count = state.deck.queue.length;
    achievements.achieve("ferry-first");
    if (count >= 4 && Math.abs(balance(state.deck, state.stowed)) <= 0.02) achievements.achieve("ferry-even-keel");
    if (count >= 6 && score === 3) achievements.achieve("ferry-full-deck");
    if (count >= 5 && score === 3 && state.undos === 0) achievements.achieve("ferry-no-undo");
    if (state.round.level !== undefined) achievements.progress("ferry-levels", Object.keys(done.data.levels).length);
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, 3 - score, DAILY_MODE);
      achievements.achieve("ferry-daily");
    }
    return { ...done, stars: score };
  }

  function stowed(next: GameState) {
    input.reset();
    camera = null;
    const last = next.stowed[next.stowed.length - 1];
    if (last && is_bus(last.vehicle)) achievements.achieve("ferry-bus");
    if (next.status === Status.DONE) finish(next);
    else if (settings.sound) sounds.parked(false);
  }

  function take_back() {
    if (!can_undo) return;
    game = undo(game);
    input.reset();
    camera = null;
    if (settings.sound) sounds.shift();
    focus_board();
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
    else if (game.status === Status.DRIVING && game.car.gear !== Gear.PARK && Math.abs(game.car.speed) < STANDING && !verdict_of(game).fault) shift(Gear.PARK);
    else if (game.status === Status.CRASHED) retry();
    else if (game.status === Status.DONE) {
      if (game.round.daily) retry();
      else if (game.round.level === undefined) new_sailing();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(round: Round) {
    input.reset();
    sounds.quiet();
    new_best = false;
    first_run = false;
    camera = null;
    game = create_game(round);
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function next_round() {
    if (game.round.level !== undefined && has_next_level && game.status === Status.DONE) {
      level = Math.min(max_level, game.round.level + 1);
      storage.set("ferry.level", level);
    }
    load(make_round());
  }

  function new_sailing() {
    daily = null;
    load(make_round());
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("ferry.mode", next);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(max_level, Number(next)));
    storage.set("ferry.level", level);
    load(make_round());
  }

  function open_daily() {
    daily = today();
    load(make_round());
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear);
    if (next === game) return;
    const stows = next.stowed.length > game.stowed.length;
    game = next;
    if (stows) stowed(next);
    else if (settings.sound) sounds.shift();
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
    if (code === "KeyU" || code === "Backspace") {
      event.preventDefault();
      if (!event.repeat) take_back();
      return;
    }
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

{#snippet gauge(class_name: string)}
  <div
    class={cn("flex items-center gap-1.5 rounded-md bg-background/85 px-1.5 py-1 font-mono text-2xs tabular-nums backdrop-blur-[2px]", class_name)}
    role="meter"
    aria-label="Balance"
    aria-valuemin={-100}
    aria-valuemax={100}
    aria-valuenow={Math.round(trim * 100)}
    aria-valuetext={balance_text(trim)}
  >
    <span class="text-foreground/65">P</span>
    <span class="relative h-2 w-20 rounded-full bg-foreground/15">
      <span class="absolute inset-y-0 rounded-full bg-success/35" style:left="{50 - (BALANCE_LIMIT / GAUGE_RANGE) * 50}%" style:right="{50 - (BALANCE_LIMIT / GAUGE_RANGE) * 50}%"></span>
      <span class="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/40"></span>
      <span
        class={cn("ts-needle absolute inset-y-[-3px] w-1 -translate-x-1/2 rounded-full", level_load ? "bg-success" : "bg-warning")}
        style:left="{50 + needle * 50}%"
      ></span>
    </span>
    <span class="text-foreground/65">S</span>
    <span class={cn("min-w-[4.5rem]", level_load ? "text-foreground/80" : "text-warning")}>{balance_text(trim)}</span>
  </div>
{/snippet}

{#snippet par_line()}
  Par {par_time ?? (par_failed ? "none" : "…")}
{/snippet}

{#snippet toolbar()}
  {@render menu?.()}
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.SAILINGS : mode), set_mode} />
  <Select class="w-[6.5rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.SAILINGS : mode), set_mode} />
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
  {:else if mode === Mode.LEVELS}
    <Select class="w-[7.5rem] min-w-0 @md:w-36" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
  {/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this sailing" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode === Mode.SAILINGS && !daily}
    <Button size="sm" variant="primary" onclick={new_sailing}>New</Button>
  {/if}
{/snippet}

{#snippet undo_button(class_name: string)}
  <button
    type="button"
    class={cn("ts-control ts-undo inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors", can_undo ? "ts-undo-ready" : "ts-undo-off", class_name)}
    aria-label="Undo the last vehicle"
    aria-disabled={!can_undo}
    onpointerdown={(event) => event.preventDefault()}
    onclick={take_back}
  >
    <UndoIcon weight="bold" class="size-4" />Undo
  </button>
{/snippet}

{#snippet pedal_top()}
  {#if game.status === Status.DRIVING}{@render undo_button("h-11 w-full text-ui")}{/if}
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
          <SpeedChip class="pointer-coarse:hidden" speed={game.car.speed} />
          <div class="ts-fold hidden rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-hidden="true">
            {time}
          </div>
        </div>
        {#if line && game.status !== Status.DONE}
          <div class="max-w-full truncate rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]" aria-live="polite">
            <span class="text-primary">●</span>
            {line}
          </div>
        {/if}
        <!-- A phone's top row is the gear strip: the gauge goes under it. -->
        {@render gauge("@md/ts-app:hidden")}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
        {@render gauge("hidden @md/ts-app:flex")}
      </div>
    </div>
  {/if}
  {#if hint && game.status === Status.DRIVING}
    <p class="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit animate-pop-in rounded-md bg-background/85 px-2 py-1 text-ui text-warning backdrop-blur-[2px]" aria-live="polite">
      {hint}
    </p>
  {/if}
  {#if game.status === Status.DRIVING}
    <div class="absolute right-2 bottom-2 hidden pointer-fine:block">
      {@render undo_button("h-9 px-3 text-ui")}
    </div>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)}
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">Drive each one aboard and park it in any lane, 0.3–1 m behind the one ahead. Keep her level.</p>
        <ol class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-foreground/80 tabular-nums">
          {#each game.deck.queue as vehicle, i (i)}
            <li><span class="text-primary">{i + 1}</span> {vehicle_name(vehicle)}</li>
          {/each}
        </ol>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {@render par_line()}{best ? ` · Best ${"★".repeat(best.stars)} ${format_time(best.ms, { tenths: true })}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily && mode === Mode.SAILINGS}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" /><KeyHint key_name="← →" text="steer" /><KeyHint key_name="P" text="stow" /><KeyHint key_name="U" text="undo" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Gas and Brake drive, P stows it. Undo over the pedals takes the last one back. Touching anything ends the sailing.</p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · {game.stowed.length} of {game.deck.queue.length} aboard">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          All aboard
          {@render star_row(earned, true)}
          {#if new_best}<Badge class="ts-pop" tone={first_run ? "neutral" : "primary"}>{first_run ? "First sailing" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {time}{par_time ? ` (par ${par_time})` : ""}{game.undos ? ` · ${game.undos} ${game.undos === 1 ? "undo" : "undos"}` : ""}
        </p>
        <p class={cn("font-mono text-2xs tabular-nums", level_load ? "text-foreground/80" : "text-warning")}>
          Balance {balance_text(trim)}{level_load ? "" : ` · over the ${Math.round(BALANCE_LIMIT * 100)}% limit`}
        </p>
        {#if !par && !par_failed}<p class="text-2xs text-foreground/65">Working out the par…</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={retry}>Again</Button>
        {#if game.round.daily}
          <!-- The daily is one sailing a day: Again replays it. -->
        {:else if game.round.level === undefined}
          <Button variant="primary" onclick={new_sailing}>New sailing</Button>
        {:else if has_next_level}
          <Button variant="primary" onclick={next_round}>Next level</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.round.daily && (game.round.level === undefined || has_next_level)}<KeyHint key_name="Enter" text={game.round.level === undefined ? "new sailing" : "next level"} />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.hit)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {game.stowed.length} of {game.deck.queue.length} aboard</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_sailing}>New sailing</Button>{/if}
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
  <span class="tabular-nums">Aboard {game.stowed.length}/{game.deck.queue.length}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  {#if par_time}<span class="hidden tabular-nums @lg:inline">Par {par_time}</span>{/if}
  <span class="hidden @5xl:inline">P or Space stows · U undoes the last · Esc pauses · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Ferry Loader. Arrows steer and drive, P or Space stows the vehicle, U takes the last one back, E drive, R reverse, Escape pauses, Enter starts."
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
  {pedal_top}
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

  .ts-needle {
    transition: left 200ms var(--ease-out);
  }

  .ts-undo {
    touch-action: manipulation;
  }

  .ts-undo-ready {
    color: var(--foreground);
    background-color: color-mix(in oklch, var(--background) 85%, var(--foreground));
    outline: 1.5px solid color-mix(in oklch, var(--foreground) 35%, transparent);
    outline-offset: -1.5px;
  }

  .ts-undo-off {
    color: color-mix(in oklch, var(--foreground) 55%, transparent);
    background-color: color-mix(in oklch, var(--background) 90%, var(--foreground));
    outline: 1.5px dashed color-mix(in oklch, var(--foreground) 30%, transparent);
    outline-offset: -1.5px;
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
