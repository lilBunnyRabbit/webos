<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { report_error } from "$kit/utils/report-error";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Segmented, Select } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, type Camera, type Insets } from "../../core/camera";
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
  import { body_centre, Gear, max_steer, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    average_precision,
    bests_schema,
    change_gear,
    crash_title,
    create_game,
    daily_round,
    fork_action,
    fork_depth,
    fork_hint,
    ForkAction,
    job_round,
    LEVEL_COUNT,
    level_round,
    levels_schema,
    Mode,
    mode_schema,
    par_moves,
    PERFECT,
    record_best,
    round_key,
    round_title,
    set_status,
    size_schema,
    SIZES,
    SPEC,
    stars,
    Status,
    task_line,
    unlocked,
    use_fork,
    type Bests,
    type GameState,
    type LevelStars,
    type Par,
    type Recorded,
    type Round,
  } from "./game";
  import { work_out_par, type ParJob } from "./par";

  const MODE_LABELS: Record<Mode, string> = { jobs: "Jobs", levels: "Levels" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  const SIZE_OPTIONS = SIZES.map((size) => ({ value: String(size), label: `${size} ${size === 1 ? "pallet" : "pallets"}` }));
  // Close enough to see the forks line up with a pallet's pockets, far enough to see down an aisle.
  const SPAN = 17;
  const OVERVIEW_MARGIN = 0.6;
  const DAILY_MODE = "forklift";

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const bests = storage.persisted<Bests>("forklift.best", {}, bests_schema);
  const level_stars = storage.persisted<LevelStars>("forklift.levels", {}, levels_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let mode = $state<Mode>(storage.get("forklift.mode", mode_schema) ?? Mode.JOBS);
  let size = $state(storage.get("forklift.size", size_schema) ?? 2);
  let level = $state(Math.min(untrack(() => unlocked(level_stars.value)), storage.get("forklift.level", z.number().int().min(1)) ?? 1));

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let par = $state.raw<Par | null>(null);
  let par_failed = $state(false);
  let new_best = $state(false);
  let first_job = $state(false);
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
  // A finished job recorded before its par was known: the par, when it lands, may still earn it the time star.
  let awaiting: Finished | null = null;
  const sounds = new Sounds(() => settings);

  // `game` is replaced every frame; the round object only changes with a new round (Again keeps it, and its par).
  const round = $derived(game.round);
  const lock = $derived(max_steer(SPEC));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(bests.value[round_key(game.round)]);
  const action = $derived(fork_action(game));
  const hint = $derived(fork_hint(game));
  const depth = $derived(fork_depth(game));
  const line = $derived(task_line(game));
  const earned = $derived(stars(game, par?.ms ?? null));
  const precision = $derived(average_precision(game.drops));
  const precision_percent = $derived(precision === null ? null : Math.round(precision));
  const perfect = $derived(precision_percent !== null && precision_percent >= PERFECT);
  const max_level = $derived(unlocked(level_stars.value));
  const level_best = $derived(game.round.level !== undefined ? (level_stars.value[game.round.level] ?? 0) : 0);
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const round = level_round(i + 1);
      const got = level_stars.value[i + 1] ?? 0;
      return { value: String(i + 1), label: `${i + 1} · ${round.size} ${round.size === 1 ? "pallet" : "pallets"}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const time = $derived(format_time(game.ms, { tenths: true }));
  const par_time = $derived(par ? format_time(par.ms) : null);
  const fork_label = $derived(action === ForkAction.LOWER ? "Lower" : action === ForkAction.LIFT ? "Lift" : game.loads[game.current]?.carried ? "Lower" : "Lift");

  interface Finished {
    state: GameState;
    stars: number;
  }

  function moves_text(count: number): string {
    return `${count} ${count === 1 ? "move" : "moves"}`;
  }

  function make_round(): Round {
    if (daily) return daily_round(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`));
    if (mode === Mode.LEVELS) return level_round(level);
    return job_round(size, random_seed());
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

  // Before the start the whole floor shows, so the player sees every pallet and target; then the camera follows.
  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.floor;
    if (game.status === Status.READY) {
      const middle = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(bounds, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(game.car, SPEC);
    const ahead = game.car.speed * 0.8;
    const focus = { x: centre.x + Math.cos(game.car.heading) * ahead, y: centre.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, board_size.width, board_size.height, zoom, insets, SPAN);
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
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, SPEC, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, settings.creep ? SPEC : without_creep(SPEC));
    }
    input.follow(next.car.steer / lock);
    sounds.reverse_beeper(next.status === Status.DRIVING && next.car.speed < -0.02);
    if (next === game) return;
    const before = game.status;
    game = next;
    if (before === Status.DRIVING && next.status === Status.CRASHED) crashed();
  }

  function crashed() {
    release_all();
    sounds.crash();
  }

  function finish(state: GameState) {
    release_all();
    const result = record(state, stars(state, par?.ms ?? null));
    new_best = result.improved;
    first_job = result.first;
    sounds.parked(new_best && !first_job);
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
    const result = record(waiting.state, score);
    if (game.round === for_round && game.status === Status.DONE) new_best ||= result.improved;
  }

  function record(state: GameState, score: number): Recorded & { stars: number } {
    const precision = average_precision(state.drops);
    const result = { stars: score, ms: Math.round(state.ms), ...(precision === null ? {} : { precision: Math.round(precision) }) };
    const done = record_best(bests.value, state.round, result);
    bests.value = done.bests;
    const pallets = state.round.size;
    achievements.achieve("forklift-first");
    if (pallets >= 4) achievements.achieve("forklift-full-load");
    if (pallets >= 3 && score === 3) achievements.achieve("forklift-by-the-book");
    if (pallets >= 3 && state.drops.every((drop) => Math.round(drop.score) >= PERFECT)) achievements.achieve("forklift-spotless");
    if (state.round.level !== undefined) {
      const at = state.round.level;
      level_stars.value[at] = Math.max(level_stars.value[at] ?? 0, score);
      achievements.progress("forklift-levels", Object.keys(level_stars.value).length);
    }
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, 3 - score, DAILY_MODE);
      achievements.achieve("forklift-daily");
    }
    return { ...done, stars: score };
  }

  function fork() {
    if (!action) return;
    const next = use_fork(game);
    if (next === game) return;
    input.release();
    game = next;
    sounds.fork(action === ForkAction.LIFT);
    if (next.status === Status.DONE) finish(next);
    const drop = next.drops.length > 0 && action === ForkAction.LOWER ? next.drops[next.drops.length - 1] : null;
    if (drop && Math.round(drop.score) >= PERFECT) achievements.achieve("forklift-perfect");
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
    else if (game.status === Status.CRASHED) retry();
    else if (game.status === Status.DONE) {
      if (game.round.daily) retry();
      else if (game.round.level === undefined) new_job();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(round: Round) {
    input.reset();
    sounds.quiet();
    new_best = false;
    first_job = false;
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
      storage.set("forklift.level", level);
    }
    load(make_round());
  }

  function new_job() {
    daily = null;
    load(make_round());
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("forklift.mode", next);
    load(make_round());
  }

  function set_size(next: string) {
    daily = null;
    size = Math.max(1, Math.min(4, Number(next)));
    storage.set("forklift.size", size);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(max_level, Number(next)));
    storage.set("forklift.level", level);
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
    game = next;
    sounds.shift();
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
    if (code === "KeyF" || code === "Space") {
      event.preventDefault();
      if (!event.repeat) fork();
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

{#snippet par_line()}
  Par {moves_text(par_moves(game.round.size))}{par_time ? ` · ${par_time}` : par_failed ? "" : " · …"}
{/snippet}

{#snippet size_picker(class_name: string)}
  <Select class={class_name} size="sm" aria-label="Pallets per job" options={SIZE_OPTIONS} bind:value={() => String(size), set_size} />
{/snippet}

{#snippet toolbar()}
  {@render menu?.()}
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.JOBS : mode), set_mode} />
  <Select class="w-[6rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.JOBS : mode), set_mode} />
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
  {:else if mode === Mode.JOBS}
    {@render size_picker("hidden w-[6.75rem] min-w-0 @md/ts-app:inline-flex")}
  {:else}
    <Select class="w-[7.5rem] min-w-0 @md:w-36" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
  {/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this job" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode === Mode.JOBS && !daily}
    <Button size="sm" variant="primary" onclick={new_job}>New</Button>
  {/if}
{/snippet}

{#snippet fork_button(class_name: string)}
  <button
    type="button"
    class={cn("ts-control ts-fork rounded-lg font-semibold transition-colors", action ? "ts-fork-ready" : "ts-fork-off", class_name)}
    aria-label="{fork_label} the forks"
    aria-disabled={!action}
    onpointerdown={(event) => event.preventDefault()}
    onclick={fork}
  >
    {fork_label}
  </button>
{/snippet}

{#snippet pedal_top()}
  {#if game.status === Status.DRIVING}{@render fork_button("h-11 w-full text-ui")}{/if}
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
        <GearStrip gear={game.car.gear} onshift={shift} space_parks={false} />
        <SpeedChip class="pointer-coarse:hidden" speed={game.car.speed} />
        <div class="ts-fold hidden rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-hidden="true">
          {time} <span class="text-foreground/65">· {moves_text(game.moves)}</span>
        </div>
      </div>
        {#if line && game.status !== Status.DONE}
          <div class="max-w-full truncate rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]" aria-live="polite">
            <span class="text-primary">●</span>
            {line}
          </div>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
        {#if depth !== null}
          <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", action ? "text-success" : "text-foreground/80")} aria-hidden="true">
            Forks {Math.round(depth * 100)}%
          </div>
        {/if}
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
      {@render fork_button("h-9 px-4 text-ui")}
    </div>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)}
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">Take each pallet to its target, in order.</p>
        <ol class="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-foreground/80 tabular-nums">
          {#each game.floor.tasks as task, i (i)}
            <li><span class="text-primary">{i + 1}</span> {task.from.name} → {task.to.name}</li>
          {/each}
        </ol>
        {#if mode === Mode.JOBS && !daily}
          <!-- A phone's toolbar has no room for it next to the switcher, the mode, settings and New. -->
          <div class="mt-1.5 flex items-center gap-2 text-2xs text-foreground/65 @md/ts-app:hidden">
            Job size {@render size_picker("w-[6.75rem] min-w-0")}
          </div>
        {/if}
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {@render par_line()}{best ? ` · Best ${"★".repeat(best.stars)} ${format_time(best.ms, { tenths: true })}` : ""}{best?.precision !== undefined ? ` · precision ${best.precision}%` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily && mode === Mode.JOBS}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" /><KeyHint key_name="← →" text="steer" /><KeyHint key_name="F" text="lift and lower" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Gas and Brake drive, the button over them lifts and lowers. It steers at the back, so the tail swings out.</p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · Moves {game.moves}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Job done
          {@render star_row(earned, true)}
          {#if perfect}<Badge class="ts-pop" tone="success">Perfect</Badge>{/if}
          {#if new_best}<Badge class="ts-pop" tone={first_job ? "neutral" : "primary"}>{first_job ? "First job" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {time}{par_time ? ` (par ${par_time})` : ""} · {moves_text(game.moves)} (par {par_moves(game.round.size)})
        </p>
        {#if precision_percent !== null}
          <p class="font-mono text-2xs text-foreground/80 tabular-nums" title="How centred and straight each pallet was put down">
            Precision {precision_percent}%{#if game.drops.length > 1}<span class="text-foreground/65"> · {game.drops.map((drop) => Math.round(drop.score)).join(" · ")}</span>{/if}
          </p>
        {/if}
        {#if !par && !par_failed}<p class="text-2xs text-foreground/65">Working out the par…</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={retry}>Again</Button>
        {#if game.round.daily}
          <!-- The daily is one job a day: Again replays it. -->
        {:else if game.round.level === undefined}
          <Button variant="primary" onclick={new_job}>New job</Button>
        {:else if has_next_level}
          <Button variant="primary" onclick={next_round}>Next level</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.round.daily && (game.round.level === undefined || has_next_level)}<KeyHint key_name="Enter" text={game.round.level === undefined ? "new job" : "next level"} />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.hit)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · {moves_text(game.moves)} · {game.current} of {game.floor.tasks.length} put down</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_job}>New job</Button>{/if}
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
  {#if par_time}<span class="hidden tabular-nums @lg:inline">Par {par_time}</span>{/if}
  <span class="hidden @5xl:inline">F or Space lifts and lowers · Esc pauses · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Warehouse. Arrows steer and drive, F or Space lifts and lowers the forks, E drive, R reverse, Escape pauses, Enter starts."
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

  .ts-fork {
    touch-action: manipulation;
  }

  /* Ready is the primary action with a halo; off stays legible, outlined and dashed, so it reads as waiting, not broken. */
  .ts-fork-ready {
    color: var(--background);
    background-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 35%, transparent);
  }

  .ts-fork-off {
    color: color-mix(in oklch, var(--foreground) 78%, transparent);
    background-color: color-mix(in oklch, var(--background) 90%, var(--foreground));
    outline: 1.5px dashed color-mix(in oklch, var(--foreground) 40%, transparent);
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
