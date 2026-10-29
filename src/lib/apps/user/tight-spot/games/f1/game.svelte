<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Select } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
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
  import { body_centre, Gear, max_steer } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    beats,
    best_lap,
    change_gear,
    create_game,
    daily_track,
    lap_stars,
    lap_text,
    lap_time,
    LAPS,
    par_ms,
    set_status,
    split_delta,
    Status,
    to_ghost,
    type GameState,
    type LapResult,
    type Round,
  } from "./game";
  import { ghost_pose, ghost_schema, type Ghost } from "./ghost";
  import { top_speed } from "../../core/grip";
  import { SPEC } from "./spec";
  import { track_id_schema, TRACK_IDS, track_name, TrackId } from "./tracks";

  const TRACK_OPTIONS = TRACK_IDS.map((value) => ({ value, label: track_name(value) }));
  // Slow, the view is a parking game's; flat out it pulls back only as far as keeps the car readable (about 30 px long
  // on a 600 px board, 20 px on a phone) and spends the look-ahead along the direction of travel, so the longer side
  // carries most of it. Speed is eased (PACE_RATE per second) so braking or lifting doesn't pump the zoom.
  const SPAN_SLOW = view_span(SPEC.length);
  const SPAN_FAST = 110;
  const PACE_RATE = 1.2;
  const LOOK_AHEAD = 2;
  const LEAD = 0.7;
  const UNBOUNDED = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
  const OVERVIEW_MARGIN = 3;
  const DAILY_MODE = "f1";

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const ghosts: Record<TrackId, { value: Ghost | null }> = {
    meadow: storage.file<Ghost | null>("f1/ghost-v2-meadow.json", null, ghost_schema.nullable()),
    harbour: storage.file<Ghost | null>("f1/ghost-v2-harbour.json", null, ghost_schema.nullable()),
    ridge: storage.file<Ghost | null>("f1/ghost-v2-ridge.json", null, ghost_schema.nullable()),
  };
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let track = $state<TrackId>(storage.get("f1.track", track_id_schema) ?? TrackId.MEADOW);

  let game = $state.raw<GameState>(create_game(untrack(() => make_round())));
  let new_best = $state(false);
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
  let pace = 0;
  // The ghost a session races is the one saved when it started: beating it mid-session doesn't swap the car ahead.
  let racing: Ghost | null = untrack(() => ghosts[game.round.track].value);
  const sounds = new Sounds(() => settings);

  const round = $derived(game.round);
  const lock = $derived(max_steer(SPEC));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const par = $derived(par_ms(game.track));
  const saved = $derived(ghosts[round.track].value);
  const session_best = $derived(best_lap(game.laps));
  const best_stars = $derived(session_best ? lap_stars(session_best, par) : 0);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const live = $derived(lap_time(game));
  const last = $derived(game.laps.at(-1) ?? null);
  const lap_number = $derived(Math.min(LAPS, game.laps.length + (game.lap ? 1 : 0)));
  const deltas = $derived(game.lap && racing ? game.lap.splits.map((split, i) => split_delta(split, racing!.splits[i])) : []);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));

  function make_round(): Round {
    if (daily) return { track: daily_track(daily_seed(daily, `${app_id}/${DAILY_MODE}`)), daily };
    return { track };
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // The file may still be loading when the session is set up; until the first lap starts, take what arrives.
  $effect(() => {
    const ghost = saved;
    untrack(() => {
      if (game.status === Status.READY || !game.lap) racing = ghost;
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
    void [game, palette, board_size, zoom, settings.guides, settings.speed_zoom, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function control_insets(): Insets {
    const carded = game.status === Status.READY || game.status === Status.DONE;
    const card_bottom = carded && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.55) : 0;
    const card_left = carded && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const top = game.status === Status.READY ? 8 : hud_height + 8;
    const insets = { top, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.track;
    if (game.status === Status.READY || game.status === Status.DONE) {
      const middle = { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, fit_span(bounds, board_size.width, board_size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(game.car, SPEC);
    const span = settings.speed_zoom ? SPAN_SLOW + (SPAN_FAST - SPAN_SLOW) * pace : SPAN_SLOW;
    const scale = Math.max(1, Math.min(board_size.width, board_size.height)) / (span / zoom);
    const direction = game.car.speed < 0 ? -1 : 1;
    const along = { x: Math.cos(game.car.heading) * direction, y: Math.sin(game.car.heading) * direction };
    const ahead = Math.min(pace * top_speed(SPEC) * LOOK_AHEAD, reach(along, insets, scale) * LEAD);
    const focus = { x: centre.x + along.x * ahead, y: centre.y + along.y * ahead };
    // Not kept inside the track's bounds: clamping pushed the car off the board's centre line next to an outer straight.
    return frame(UNBOUNDED, focus, board_size.width, board_size.height, zoom, insets, span);
  }

  /** Metres from the middle of the clear part of the board to its edge along `along`. */
  function reach(along: { x: number; y: number }, insets: Insets, scale: number): number {
    const half_width = Math.max(1, board_size.width - insets.left - insets.right) / 2 / scale;
    const half_height = Math.max(1, board_size.height - insets.top - insets.bottom) / 2 / scale;
    return Math.min(half_width / Math.max(1e-6, Math.abs(along.x)), half_height / Math.max(1e-6, Math.abs(along.y)));
  }

  /** The camera eases toward its target relative to the car, so following at speed doesn't trail it. */
  function follow(target: Camera, dt: number): Camera {
    if (!camera || dt <= 0) return target;
    const centre = body_centre(game.car, SPEC);
    const offset = ease({ x: camera.x - centre.x, y: camera.y - centre.y, scale: camera.scale }, { x: target.x - centre.x, y: target.y - centre.y, scale: target.scale }, dt);
    return { x: centre.x + offset.x, y: centre.y + offset.y, scale: offset.scale };
  }

  function render(dt: number) {
    if (!canvas || !palette || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (dt > 0) pace += (Math.min(1, Math.abs(game.car.speed) / top_speed(SPEC)) - pace) * (1 - Math.exp(-dt * PACE_RATE));
    camera = follow(target_camera(), dt);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const lap_ms = lap_time(game);
    draw_scene(ctx, game, { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr }, palette, {
      guides: settings.guides,
      time: performance.now() / 1000,
      ghost: racing && lap_ms !== null ? ghost_pose(racing.frames, lap_ms) : null,
    });
  }

  function run(steps: number, dt: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, SPEC, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt);
    }
    input.follow(next.car.steer / lock);
    if (next === game) return;
    const before = game;
    game = next;
    if (next.contact && next.contact !== before.contact && (!before.contact || before.ms - before.contact.ms > 250)) touched();
    if (next.laps.length > before.laps.length) finished(next.laps.at(-1)!, next);
  }

  function touched() {
    sounds.crash();
  }

  function finished(lap: LapResult, state: GameState) {
    const id = state.round.track;
    if (lap.clean) {
      achievements.achieve("f1-first");
      if (lap_stars(lap, par_ms(state.track)) === 3) achievements.achieve("f1-on-pace");
      if (state.round.daily) {
        play.daily(state.round.daily, Math.round(lap.ms), undefined, DAILY_MODE);
        achievements.achieve("f1-daily");
      }
    }
    const old = ghosts[id].value;
    const improved = beats(old, lap);
    if (improved) {
      ghosts[id].value = to_ghost(lap);
      if (old) achievements.achieve("f1-ghost");
      achievements.progress("f1-tracks", TRACK_IDS.filter((each) => ghosts[each].value).length);
      new_best = true;
    }
    if (lap.clean) sounds.parked(improved);
    if (state.status === Status.DONE) {
      release_all();
      if (state.laps.every((each) => each.clean)) achievements.achieve("f1-clean-session");
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
    else if (game.status === Status.DONE) retry();
  }

  function load(next: Round) {
    input.reset();
    sounds.quiet();
    new_best = false;
    camera = null;
    pace = 0;
    game = create_game(next);
    racing = ghosts[next.track].value;
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function set_track(next: string) {
    daily = null;
    track = track_id_schema.catch(TrackId.MEADOW).parse(next);
    storage.set("f1.track", track);
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

{#snippet delta_chip(delta: number)}
  <span class={cn("font-mono tabular-nums", delta <= 0 ? "text-success" : "text-warning")}>{delta <= 0 ? "−" : "+"}{(Math.abs(delta) / 1000).toFixed(2)}</span>
{/snippet}

{#snippet toolbar()}
  {@render menu?.()}
  <!-- In the daily it shows the day's track; picking one leaves the daily. -->
  <Select class="w-[7.5rem] min-w-0" size="sm" aria-label="Track" options={TRACK_OPTIONS} bind:value={() => round.track, set_track} />
  {#if daily}<span class="truncate px-1 text-ui font-medium">Daily</span>{/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart the session" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
{/snippet}

{#snippet overlay()}
  {#if game.status === Status.DRIVING || game.status === Status.PAUSED}
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
        <div class="flex max-w-full items-center gap-1.5 truncate rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-live="off">
          {#if game.lap}
            <span><span class="text-foreground/65">Lap</span> {lap_number}/{LAPS}</span>
            <span>{lap_text(live ?? 0)}</span>
            {#each deltas as delta, i (i)}<span class="text-foreground/65">S{i + 1}</span>{@render delta_chip(delta)}{/each}
            {#if !game.lap.clean}<span class="font-sans text-warning">Void</span>{/if}
          {:else}
            <span class="font-sans text-foreground/80">Cross the line to start the lap</span>
          {/if}
        </div>
        {#if game.grass}
          <div class="rounded-md bg-background/85 px-1.5 py-0.5 text-ui text-warning backdrop-blur-[2px]">On the grass</div>
        {/if}
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
        <div class="flex flex-col items-end gap-0.5 rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-2xs tabular-nums backdrop-blur-[2px]" aria-hidden="true">
          {#if last}<span><span class="text-foreground/65">Last</span> {last.clean ? lap_text(last.ms) : "void"}</span>{/if}
          {#if saved}<span><span class="text-foreground/65">Best</span> {lap_text(saved.ms)}</span>{/if}
          <span><span class="text-foreground/65">Par</span> {lap_text(par)}</span>
        </div>
      </div>
    </div>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{round.daily ? `Daily · ${track_name(round.track)}` : track_name(round.track)} · {LAPS} laps</p>
        <p class="text-ui text-foreground/80">Your best clean lap counts. A wall voids the lap; the grass slows you.</p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {Math.round(game.track.length)} m · Par {lap_text(par)}{saved ? ` · Best ${lap_text(saved.ms)}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="gas" /><KeyHint key_name="↓" text="brake" /><KeyHint key_name="← →" text="steer" /><KeyHint key_name="Esc" text="pause" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Gas and Brake on the right, the wheel on the left. The faster you go, the less it turns.</p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail={live === null ? "Before the line" : `Lap ${lap_number} · ${lap_text(live)}`}>
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {session_best ? lap_text(session_best.ms) : "No clean lap"}
          {#if session_best}{@render star_row(best_stars, true)}{/if}
          {#if new_best}<Badge class="ts-pop" tone="primary">New best</Badge>{/if}
        </p>
        <ol class="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-foreground/80 tabular-nums">
          {#each game.laps as lap, i (i)}
            <li class={cn(lap === session_best && "text-primary")}><span class="text-foreground/65">{i + 1}</span> {lap.clean ? lap_text(lap.ms) : "void"}</li>
          {/each}
        </ol>
        <p class="font-mono text-2xs text-foreground/65 tabular-nums">Par {lap_text(par)}{saved ? ` · Best ${lap_text(saved.ms)}` : ""}</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="primary" onclick={retry}>Again</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="drives again" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{track_name(round.track)}{round.daily ? " · daily" : ""}</span>
  <span class="tabular-nums">Lap {lap_number}/{LAPS}</span>
  <span class="tabular-nums">{live === null ? "–" : lap_text(live)}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  <span class="hidden tabular-nums @lg:inline">Par {lap_text(par)}</span>
  <span class="hidden @5xl:inline">Esc pauses · C centres the wheel · + − zoom</span>
{/snippet}

<DriveFrame
  label="Hot Lap. Arrows steer, accelerate and brake, Escape pauses, Enter starts."
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
