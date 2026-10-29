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
  import { DRIVE_KEYS, drive_note, GEAR_KEYS, is_field, key_direction, STANDING, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import RoundCard from "../../core/round-card.svelte";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { body_centre, Gear, max_steer, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { BED_COST } from "./coverage";
  import { deck_centre } from "./deck";
  import { draw_scene, LawnLayer, read_lawn, type Lawn } from "./draw";
  import {
    advance,
    apply_mask,
    can_finish,
    change_gear,
    coverage,
    crash_title,
    create_game,
    daily_round,
    DECK,
    EMPTY,
    finish,
    FINISH,
    lawn_round,
    LEVEL_COUNT,
    level_round,
    measure_fallback,
    Mode,
    mode_schema,
    nearest_uncut,
    overlap,
    OVERLAP_LIMIT,
    percent,
    record,
    round_key,
    round_title,
    saved_schema,
    set_status,
    SPEC,
    stars,
    Status,
    unlocked,
    type GameState,
    type Measured,
    type Round,
  } from "./game";
  import { work_out_lawn, type MeasureJob } from "./measure";

  const MODE_LABELS: Record<Mode, string> = { lawns: "Lawns", levels: "Levels" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  // Close enough to see the stripes line up with the last pass, far enough to see the next tree coming.
  const SPAN = 16;
  const OVERVIEW_MARGIN = 0.6;
  const DAILY_MODE = "mower";
  // Past this much mown an arrow on the edge of the view leads to the nearest long grass left.
  const POINT_FROM = 0.8;

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const saved = storage.file("mower.json", EMPTY, saved_schema);
  const input = new DriveInput();
  const layer = new LawnLayer();

  let daily = $state<string | null>(daily_day ?? null);
  let mode = $state<Mode>(storage.get("mower.mode", mode_schema) ?? Mode.LAWNS);
  let level = $state(storage.get("mower.level", z.number().int().min(1).max(LEVEL_COUNT)) ?? 1);

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let measured = $state.raw<Measured | null>(null);
  let measure_failed = $state(false);
  let new_best = $state(false);
  let first_lawn = $state(false);
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
  let on_flowers = $state(false);

  let camera: Camera | null = null;
  let job: MeasureJob | null = null;
  let lawn: Lawn | null = null;
  let uncut: { x: number; y: number } | null = null;
  let uncut_at = 0;
  let flowers_at = -Infinity;
  const sounds = new Sounds(() => settings);

  // `game` is replaced every frame; the round object only changes with a new round (Again keeps it, and its measure).
  const round = $derived(game.round);
  const lock = $derived(max_steer(SPEC));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED || game.status === Status.FLATTENED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(saved.value.best[round_key(game.round)]);
  const mown = $derived(coverage(game.tally));
  const lapped = $derived(overlap(game.tally));
  const mown_text = $derived(game.measured ? `${Math.floor(percent(mown))}%` : "…");
  const finishable = $derived(can_finish(game));
  const earned = $derived(stars(game, measured?.par_ms ?? null));
  const max_level = $derived(unlocked(saved.value.levels));
  const level_best = $derived(game.round.level !== undefined ? (saved.value.levels[game.round.level] ?? 0) : 0);
  const level_options = $derived(
    Array.from({ length: max_level }, (_, i) => {
      const got = saved.value.levels[i + 1] ?? 0;
      return { value: String(i + 1), label: `Level ${i + 1}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const time = $derived(format_time(game.ms, { tenths: true }));
  const par_time = $derived(measured ? format_time(measured.par_ms) : null);
  const area = $derived(Math.round(game.garden.lawn.reduce((sum, piece) => sum + (piece[2].x - piece[0].x) * (piece[2].y - piece[0].y), 0)));
  const hint = $derived(on_flowers && game.status === Status.DRIVING ? "Off the flowers: each one costs lawn" : null);

  function make_round(): Round {
    if (daily) return daily_round(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`));
    if (mode === Mode.LEVELS) return level_round(Math.min(level, LEVEL_COUNT));
    return lawn_round(random_seed());
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // The coverable lawn and the par come from the lattice in a worker; the round may start before they land.
  $effect(() => {
    const current = round;
    untrack(() => {
      job?.cancel();
      measured = null;
      measure_failed = false;
      const next = work_out_lawn(current);
      job = next;
      next.result.then(
        (found) => {
          if (job !== next) return;
          measured = found;
          if (game.round === current) take_mask(found.coverable);
        },
        (reason: unknown) => {
          if (job !== next) return;
          measure_failed = true;
          report_error(app_id, "Couldn't measure the lawn", reason);
          measured = measure_fallback(current);
          if (game.round === current) take_mask(measured.coverable);
        }
      );
    });
  });

  $effect(() => () => job?.cancel());

  function take_mask(coverable: Uint8Array) {
    const before = game.status;
    game = apply_mask(game, coverable);
    if (game.status === Status.FLATTENED && before !== Status.FLATTENED) release_all();
  }

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => () => sounds.close());

  $effect(() => {
    if (!palette || !canvas) return;
    lawn = read_lawn(canvas);
  });

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

  // Before the start the whole garden shows; on the end cards too, so the stripes can be admired. Then the camera follows.
  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.garden;
    if (game.status === Status.READY || game.status === Status.DONE) {
      const middle = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(bounds, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(game.car, SPEC);
    const ahead = game.car.speed * 0.8;
    const focus = { x: centre.x + Math.cos(game.car.heading) * ahead, y: centre.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, board_size.width, board_size.height, zoom, insets, SPAN);
  }

  function render(dt: number) {
    if (!canvas || !palette || !lawn || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const now = performance.now();
    if (game.status !== Status.DRIVING || !game.measured || mown < POINT_FROM) uncut = null;
    else if (now - uncut_at > 400) {
      uncut = nearest_uncut(game, deck_centre(game.car, DECK));
      uncut_at = now;
    }
    draw_scene(ctx, game, { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr }, palette, {
      guides: settings.guides,
      time: now / 1000,
      insets: control_insets(),
      layer,
      lawn,
      uncut,
      settled: Math.abs(camera.scale - target.scale) <= target.scale * 0.02,
    });
  }

  function run(steps: number, dt: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, SPEC, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, settings.creep ? SPEC : without_creep(SPEC));
    }
    input.follow(next.car.steer / lock);
    if (next === game) return;
    const before = game.status;
    const now = performance.now();
    if (next.tally.trampled > game.tally.trampled) flowers_at = now;
    const crushing = now - flowers_at < 1500;
    if (crushing !== on_flowers) on_flowers = crushing;
    game = next;
    if (before === Status.DRIVING && next.status === Status.CRASHED) crashed();
    if (before === Status.DRIVING && next.status === Status.DONE) done(next);
    if (before === Status.DRIVING && next.status === Status.FLATTENED) release_all();
  }

  function crashed() {
    release_all();
    sounds.crash();
  }

  function done(state: GameState) {
    release_all();
    const score = stars(state, measured?.par_ms ?? null);
    const result = {
      stars: Math.max(1, score),
      ms: Math.round(state.ms),
      coverage: percent(coverage(state.tally)),
      overlap: percent(overlap(state.tally)),
    };
    const outcome = record(saved.value, state.round, result);
    saved.value = outcome.saved;
    new_best = outcome.improved;
    first_lawn = outcome.first;
    sounds.parked(new_best && !first_lawn);
    achievements.achieve("mower-first");
    if (overlap(state.tally) < 0.1) achievements.achieve("mower-tidy");
    if (score === 3) achievements.achieve("mower-by-the-book");
    if (state.tally.mown >= state.tally.coverable && state.tally.trampled === 0) achievements.achieve("mower-every-blade");
    if (state.round.level !== undefined) achievements.progress("mower-levels", Object.keys(outcome.saved.levels).length);
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, 3 - result.stars, DAILY_MODE);
      achievements.achieve("mower-daily");
    }
  }

  function finish_round() {
    if (!finishable) return;
    const next = finish(game);
    if (next === game) return;
    input.release();
    game = next;
    done(next);
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
    else if (game.status === Status.CRASHED || game.status === Status.FLATTENED) retry();
    else if (game.status === Status.DONE) {
      if (game.round.daily) retry();
      else if (game.round.level === undefined) new_lawn();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(next: Round) {
    input.reset();
    sounds.quiet();
    new_best = false;
    first_lawn = false;
    camera = null;
    uncut = null;
    on_flowers = false;
    flowers_at = -Infinity;
    const fresh = create_game(next);
    game = measured && next === game.round ? apply_mask(fresh, measured.coverable) : fresh;
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function next_round() {
    if (game.round.level !== undefined && has_next_level && game.status === Status.DONE) {
      level = Math.min(max_level, game.round.level + 1);
      storage.set("mower.level", level);
    }
    load(make_round());
  }

  function new_lawn() {
    daily = null;
    load(make_round());
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("mower.mode", next);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(max_level, Number(next)));
    storage.set("mower.level", level);
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
      if (!event.repeat) finish_round();
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

{#snippet toolbar()}
  {@render menu?.()}
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.LAWNS : mode), set_mode} />
  <Select class="w-[6rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.LAWNS : mode), set_mode} />
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
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this lawn" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode === Mode.LAWNS && !daily}
    <Button size="sm" variant="primary" onclick={new_lawn}>New</Button>
  {/if}
{/snippet}

{#snippet finish_button(class_name: string)}
  <button
    type="button"
    class={cn("ts-control ts-finish rounded-lg font-semibold transition-colors", finishable ? "ts-finish-ready" : "ts-finish-off", class_name)}
    aria-label={finishable ? "Finish the lawn" : `Mow ${Math.round(FINISH * 100)}% to finish`}
    aria-disabled={!finishable}
    onpointerdown={(event) => event.preventDefault()}
    onclick={finish_round}
  >
    Finish
  </button>
{/snippet}

{#snippet pedal_top()}
  {#if game.status === Status.DRIVING}{@render finish_button("h-11 w-full text-ui")}{/if}
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
            {time}
          </div>
        </div>
        {#if game.status !== Status.DONE}
          <div class="flex items-center gap-2 rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-live="polite">
            <span class={cn(finishable ? "text-success" : "text-foreground")}>Mown {mown_text}</span>
            <span class="relative h-1.5 w-14 overflow-hidden rounded-full bg-foreground/15" aria-hidden="true">
              <span class="absolute inset-y-0 left-0 rounded-full bg-success" style:width="{Math.min(100, (mown / FINISH) * 100)}%"></span>
            </span>
            <span class={cn(lapped > OVERLAP_LIMIT ? "text-warning" : "text-foreground/65")}>overlap {Math.round(lapped * 100)}%</span>
          </div>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
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
      {@render finish_button("h-9 px-4 text-ui")}
    </div>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)} · {area} m²
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">
          Mow {Math.round(FINISH * 100)}% of the lawn. Keep off the flowers: they cost lawn, and too many end it. A tree, the shed, the pond or the hedge ends it too.
        </p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          Par {par_time ?? (measure_failed ? "–" : "…")} · overlap under {Math.round(OVERLAP_LIMIT * 100)}%{best ? ` · Best ${"★".repeat(best.stars)} ${format_time(best.ms, { tenths: true })}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily && mode === Mode.LAWNS}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" /><KeyHint key_name="← →" text="turn" /><KeyHint key_name="F" text="finish" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">{drive_note(SPEC)} Finish lights up at {Math.round(FINISH * 100)}%.</p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · Mown {mown_text}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Lawn mown
          {@render star_row(earned, true)}
          {#if new_best}<Badge class="ts-pop" tone={first_lawn ? "neutral" : "primary"}>{first_lawn ? "First lawn" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {time}{par_time ? ` (par ${par_time})` : ""} · mown {Math.floor(percent(mown))}% · overlap {Math.round(lapped * 100)}% (under {Math.round(OVERLAP_LIMIT * 100)})
        </p>
        {#if game.tally.trampled > 0}<p class="text-2xs text-warning">Flowers flattened: they took {Math.round(percent((game.tally.trampled * BED_COST) / Math.max(1, game.tally.coverable)))}% off.</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={retry}>Again</Button>
        {#if game.round.daily}
          <!-- The daily is one lawn a day: Again replays it. -->
        {:else if game.round.level === undefined}
          <Button variant="primary" onclick={new_lawn}>New lawn</Button>
        {:else if has_next_level}
          <Button variant="primary" onclick={next_round}>Next level</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.round.daily && (game.round.level === undefined || has_next_level)}<KeyHint key_name="Enter" text={game.round.level === undefined ? "new lawn" : "next level"} />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.FLATTENED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">Too many flowers flattened</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · mown {mown_text}</p>
        <p class="text-2xs text-warning">
          They took {Math.round(percent((game.tally.trampled * BED_COST) / Math.max(1, game.tally.coverable)))}% off, so {Math.round(FINISH * 100)}% can't be reached any more.
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_lawn}>New lawn</Button>{/if}
        <Button variant="primary" onclick={retry}>Try again</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="tries again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.hit)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · mown {mown_text}</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_lawn}>New lawn</Button>{/if}
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
  <span class="tabular-nums">Mown {mown_text}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  {#if par_time}<span class="hidden tabular-nums @lg:inline">Par {par_time}</span>{/if}
  <span class="hidden @5xl:inline">F or Space finishes · Esc pauses · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Mow Day. Arrows steer and drive, F or Space finishes the lawn, E drive, R reverse, Escape pauses, Enter starts."
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

  .ts-finish {
    touch-action: manipulation;
  }

  .ts-finish-ready {
    color: var(--background);
    background-color: var(--primary);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 35%, transparent);
  }

  .ts-finish-off {
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
