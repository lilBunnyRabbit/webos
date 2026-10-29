<script lang="ts">
  import kernel, { type SpeechService } from "$lib/core/api";
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
  import { bounds_of } from "../../core/geometry";
  import GearStrip from "../../core/gear-strip.svelte";
  import KeyHint from "../../core/key-hint.svelte";
  import { DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import RoundCard from "../../core/round-card.svelte";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { Gear, max_steer, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { aircraft_parts, pose_from_nose_gear, SPAN } from "./aircraft";
  import { instruction } from "./apron";
  import { draw_scene } from "./draw";
  import {
    advance,
    aircraft_pose,
    change_gear,
    crash_title,
    create_game,
    daily_round,
    EMPTY_SAVE,
    LEVEL_COUNT,
    level_round,
    Mode,
    mode_schema,
    nose_steer,
    push_round,
    record,
    round_key,
    round_title,
    save_schema,
    set_status,
    SPEC,
    stars,
    Status,
    STEERING_LIMIT,
    stop_hint,
    to_mark,
    unlocked,
    type GameState,
    type Par,
    type Round,
  } from "./game";
  import { work_out_par, type ParJob } from "./par";

  const MODE_LABELS: Record<Mode, string> = { pushes: "Pushes", levels: "Levels" };
  const MODE_OPTIONS = (Object.keys(MODE_LABELS) as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }));
  // Wide enough for both wingtips with room to see what they pass, whichever way the aircraft points.
  const VIEW_SPAN = SPAN + 18;
  const OVERVIEW_MARGIN = 6;
  const DAILY_MODE = "airport";
  const LIMIT_DEGREES = (STEERING_LIMIT * 180) / Math.PI;

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const speech = $derived(kernel.service<SpeechService>("speech"));
  const save = storage.file("airport.json", EMPTY_SAVE, save_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let mode = $state<Mode>(storage.get("airport.mode", mode_schema) ?? Mode.PUSHES);
  let level = $state(storage.get("airport.level", z.number().int().min(1).max(LEVEL_COUNT)) ?? 1);

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let par = $state.raw<Par | null>(null);
  let par_failed = $state(false);
  let new_best = $state(false);
  let first_push = $state(false);
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
  const sounds = new Sounds(() => settings);

  const round = $derived(game.round);
  const lock = $derived(max_steer(SPEC));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const clearance = $derived(instruction(game.apron));
  const best = $derived(save.value.best[round_key(game.round)]);
  const levels = $derived(save.value.levels);
  const hint = $derived(stop_hint(game));
  const earned = $derived(stars(game, par?.ms ?? null));
  const max_level = $derived(unlocked(levels));
  const level_best = $derived(game.round.level !== undefined ? (levels[game.round.level] ?? 0) : 0);
  const level_options = $derived(
    Array.from({ length: Math.max(max_level, level) }, (_, i) => {
      const got = levels[i + 1] ?? 0;
      return { value: String(i + 1), label: `Level ${i + 1}${got ? ` ${"★".repeat(got)}` : ""}` };
    })
  );
  const has_next_level = $derived(game.round.level !== undefined && game.round.level < LEVEL_COUNT);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));
  const nose = $derived(Math.round(nose_steer(game.car)));
  const nose_warning = $derived(Math.abs(nose) > LIMIT_DEGREES - 15);
  const mark = $derived(to_mark(game));
  const time = $derived(format_time(game.ms, { tenths: true }));
  const par_time = $derived(par ? format_time(par.ms) : null);
  const face = $derived(game.apron.face === "west" ? "Face west" : "Face east");

  function moves_text(count: number): string {
    return `${count} ${count === 1 ? "change" : "changes"} of direction`;
  }

  function make_round(): Round {
    if (daily) return daily_round(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`));
    if (mode === Mode.LEVELS) return level_round(level);
    return push_round(random_seed());
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // The par takes the driver about a tenth of a second, off the main thread so a new round never stutters.
  $effect(() => {
    const current = round;
    untrack(() => {
      par_job?.cancel();
      par = null;
      par_failed = false;
      const job = work_out_par(current);
      par_job = job;
      job.result.then(
        (found) => {
          if (par_job !== job) return;
          par = found;
          par_failed = found === null;
        },
        (reason: unknown) => {
          if (par_job !== job) return;
          par_failed = true;
          report_error(app_id, "Couldn't work out the par", reason);
        }
      );
    });
  });

  $effect(() => () => par_job?.cancel());

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => () => {
    sounds.close();
    speech.stop(win.id);
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

  // Before the start: the stand and the aircraft's place on the taxiway, the neighbours it must clear between them.
  function target_camera(): Camera {
    const insets = control_insets();
    const { apron } = game;
    if (game.status === Status.READY) {
      const goal = pose_from_nose_gear(apron.stop, apron.heading);
      const area = bounds_of([...aircraft_parts(apron.aircraft), ...aircraft_parts(goal)].flat());
      const middle = { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 };
      return frame(apron.bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(area, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const plane = aircraft_pose(game.car);
    const focus = { x: (plane.x * 3 + game.car.x) / 4, y: (plane.y * 3 + game.car.y) / 4 };
    return frame(apron.bounds, focus, board_size.width, board_size.height, zoom, insets, VIEW_SPAN);
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
    const score = stars(state, par?.ms ?? null);
    if (score === 0) return;
    const result = { stars: score, ms: Math.round(state.ms) };
    const done = record(save.value, state.round, result);
    save.value = done.save;
    new_best = done.improved;
    first_push = done.first;
    sounds.parked(new_best && !first_push);
    achievements.achieve("airport-first");
    if (state.moves === 0) achievements.achieve("airport-one-go");
    if (score === 3) achievements.achieve("airport-by-the-book");
    if (state.round.level !== undefined) achievements.progress("airport-levels", Object.keys(done.save.levels).length);
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, 3 - score, DAILY_MODE);
      achievements.achieve("airport-daily");
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
    if (game.status === Status.READY && settings.sound) speech.speak(win.id, clearance);
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
    else if (game.status === Status.DRIVING) {
      if (change_gear(game, Gear.PARK).status === Status.DONE) shift(Gear.PARK);
    } else if (game.status === Status.CRASHED) retry();
    else if (game.status === Status.DONE) {
      if (game.round.daily) retry();
      else if (game.round.level === undefined) new_push();
      else if (has_next_level) next_round();
      else retry();
    }
  }

  function load(round: Round) {
    input.reset();
    sounds.quiet();
    speech.stop(win.id);
    new_best = false;
    first_push = false;
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
      storage.set("airport.level", level);
    }
    load(make_round());
  }

  function new_push() {
    daily = null;
    load(make_round());
  }

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("airport.mode", next);
    load(make_round());
  }

  function set_level(next: string) {
    level = Math.max(1, Math.min(LEVEL_COUNT, Number(next)));
    storage.set("airport.level", level);
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
    if (next.status === Status.DONE) finish(next);
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

  function mute() {
    sounds.quiet();
    speech.stop(win.id);
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
  <Segmented size="sm" class="hidden @xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.PUSHES : mode), set_mode} />
  <Select class="w-[6.75rem] @xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => (daily ? Mode.PUSHES : mode), set_mode} />
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
  {:else if mode === Mode.LEVELS}
    <Select class="w-[7.5rem] min-w-0 @md:w-36" size="sm" aria-label="Level" options={level_options} bind:value={() => String(level), set_level} />
  {/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={mute} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this push" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode === Mode.PUSHES && !daily}
    <Button size="sm" variant="primary" onclick={new_push}>New</Button>
  {/if}
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
        </div>
        {#if game.status !== Status.DONE}
          <div class="max-w-full truncate rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]" aria-live="polite">
            <span class="text-primary">●</span>
            {face} · stop mark {Math.round(mark)} m
          </div>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
        <div
          class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", nose_warning ? "text-warning" : "text-foreground/80")}
          title="The nose gear's angle: past {Math.round(LIMIT_DEGREES)}° it breaks the towbar"
        >
          Nose {Math.abs(nose)}°{nose > 1 ? " R" : nose < -1 ? " L" : ""}
        </div>
      </div>
    </div>
  {/if}
  {#if hint && game.status === Status.DRIVING}
    <p class="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit animate-pop-in rounded-md bg-background/85 px-2 py-1 text-ui text-warning backdrop-blur-[2px]" aria-live="polite">
      {hint}
    </p>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(game.round)}
          {#if level_best}{@render star_row(level_best, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">“{clearance}”</p>
        <p class="text-2xs text-foreground/65">Push the aircraft onto the taxiway, nose gear on the stop mark. Any touch ends the push.</p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          Par {par_time ?? (par_failed ? "none" : "…")}{best ? ` · Best ${"★".repeat(best.stars)} ${format_time(best.ms, { tenths: true })}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily && mode === Mode.PUSHES}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="push" /><KeyHint key_name="↓" text="pull" /><KeyHint key_name="← →" text="steer the tug" /><KeyHint key_name="Space" text="park on the mark" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Gas pushes, Brake pulls. Steer the tug the opposite way to where you want the tail to go, then follow it round.</p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · {face}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Push complete
          {@render star_row(earned, true)}
          {#if new_best}<Badge class="ts-pop" tone={first_push ? "neutral" : "primary"}>{first_push ? "First push" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {time}{par_time ? ` (par ${par_time})` : ""} · {moves_text(game.moves)}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={retry}>Again</Button>
        {#if game.round.daily}
          <!-- The daily is one push a day: Again replays it. -->
        {:else if game.round.level === undefined}
          <Button variant="primary" onclick={new_push}>New push</Button>
        {:else if has_next_level}
          <Button variant="primary" onclick={next_round}>Next level</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.round.daily && (game.round.level === undefined || has_next_level)}<KeyHint key_name="Enter" text={game.round.level === undefined ? "new push" : "next level"} />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{crash_title(game.hit)}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">{time} · stop mark {Math.round(mark)} m away</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if game.round.level === undefined && !game.round.daily}<Button variant="quiet" onclick={new_push}>New push</Button>{/if}
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
  <span class="tabular-nums">Nose {Math.abs(nose)}°</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  {#if par_time}<span class="hidden tabular-nums @lg:inline">Par {par_time}</span>{/if}
  <span class="hidden @5xl:inline">Space parks on the mark · Esc pauses · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Pushback. Up pushes the aircraft back, down pulls it forward, left and right steer the tug, Space parks, Escape pauses, Enter starts."
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
