<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time } from "$kit/games";
  import { random_seed } from "$lib/core/utils/random";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { clamp_zoom, ease, fade, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "../../core/camera";
  import { veil, type Palette } from "../../core/draw";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import KeyHint from "../../core/key-hint.svelte";
  import { DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, zoom_step } from "../../core/keys";
  import { frame_loop } from "../../core/loop";
  import { obstacles } from "../../core/obstacles";
  import { PERFECT } from "../../core/precision";
  import RoundCard from "../../core/round-card.svelte";
  import { End, sensor } from "../../core/sensors";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Sounds } from "../../core/sound";
  import SpeedChip from "../../core/speed-chip.svelte";
  import { body_centre, Gear, max_steer, rig_length, Vehicle, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    can_fetch,
    can_take,
    change_gear,
    countdown,
    create_game,
    data_schema,
    DENT_COST,
    EMPTY_DATA,
    fetch,
    final_score,
    hint,
    can_leave,
    leave,
    JobKind,
    pause,
    QUEUE_LIMIT,
    queued,
    record,
    result_of,
    shift_key,
    spec_of,
    start,
    Status,
    take,
    short_name,
    vehicle_noun,
    waiting,
    type GameState,
    type Shift,
  } from "./game";

  const OVERVIEW_MARGIN = 2;
  const DAILY_MODE = "valet";
  const SHOWN_TICKETS = 4;
  const NOTE_MS = 3500;

  const { settings, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const data = storage.file("valet.json", EMPTY_DATA, data_schema);
  const input = new DriveInput();

  let daily = $state<string | null>(daily_day ?? null);
  let game = $state.raw<GameState>(create_game(untrack(() => make_shift())));
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
  let cut_at = -Infinity;
  let readings: Record<End, number | null> = { front: null, rear: null };
  const sounds = new Sounds(() => settings);

  const spec = $derived(spec_of(game));
  const lock = $derived(max_steer(spec));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const live = $derived(game.status === Status.DRIVING || game.status === Status.STAND);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.OVER);
  const can_pause = $derived(game.status === Status.READY || live || game.status === Status.PAUSED);
  const play_label = $derived(live ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const best = $derived(data.value.best[shift_key(game.shift)]);
  const line = $derived(hint(game));
  const queue = $derived(queued(game));
  const owners = $derived(waiting(game));
  const tickets = $derived(
    game.tickets
      .filter((ticket) => ticket.parked && ticket !== game.job?.ticket)
      .sort((a, b) => a.back - b.back)
      .slice(0, SHOWN_TICKETS)
  );
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const time = $derived(format_time(game.ms));
  const leavable = $derived(can_leave(game));
  const job_line = $derived.by(() => {
    const job = game.job;
    if (!job) return null;
    const name = vehicle_noun(job.ticket.vehicle);
    if (leavable) return `Leave the ${name} here, or bring it to the box`;
    if (job.kind === JobKind.RETURN) return `Bring the ${name} to the box by the stand`;
    return job.ticket.vehicle === Vehicle.BUS ? "Park the bus in a coach bay up the north road" : `Park the ${name} in any free bay`;
  });
  const note = $derived.by(() => {
    if (game.tip && game.ms - game.tip.at < NOTE_MS && !game.job) return game.tip.amount > 0 ? `Tip +${game.tip.amount}` : "No tip: dented";
    if (game.walk && game.ms - game.walk.at < NOTE_MS) return `Walked ${Math.round(game.walk.ms / 1000)} s`;
    return null;
  });

  const stand_line = $derived(
    [note, queue.length ? `${queue.length} waiting` : "No one waiting", owners.length ? `${owners.length} ${owners.length === 1 ? "owner" : "owners"} back` : null]
      .filter(Boolean)
      .join(" · ")
  );

  function make_shift(): Shift {
    if (daily) return { seed: daily_seed(daily, `${app_id}/${DAILY_MODE}`), daily };
    return { seed: random_seed() };
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (live) game = pause(game);
    });
  });

  $effect(() => () => sounds.close());

  $effect(() =>
    win.on_back(() => {
      if (settings_panel?.matches(":popover-open")) return (settings_panel.hidePopover(), true);
      if (live) {
        toggle_pause();
        return true;
      }
      if (!onexit) return false;
      onexit();
      return true;
    })
  );

  $effect(() => {
    if (!live || blocked) return;
    const stop = frame_loop(run, render, () => game.status === Status.DRIVING || game.status === Status.STAND);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  $effect(() => {
    void [game, palette, board_size, zoom, settings.guides, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height];
    if (live && !blocked) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function carded(): boolean {
    return game.status === Status.READY || game.status === Status.STAND || game.status === Status.OVER;
  }

  function control_insets(): Insets {
    const card_bottom = carded() && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.55) : 0;
    const card_left = carded() && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const top = game.status === Status.READY ? 8 : hud_height + 8;
    const insets = { top, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  // Between cars the whole street shows, so the waiting owners' cars are in sight; with a car in hand it follows.
  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.street.world;
    const following = game.job && (game.status === Status.DRIVING || (game.status === Status.PAUSED && game.resume === Status.DRIVING));
    if (!following) {
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
    const view = { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr };
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
    const current = spec;
    for (let i = 0; i < steps && (next.status === Status.DRIVING || next.status === Status.STAND); i++) {
      if (next.status === Status.DRIVING) input.step_wheel(dt, current, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, settings.creep ? current : without_creep(current));
    }
    if (next.status === Status.DRIVING) {
      input.follow(next.car.steer / lock);
      const near = obstacles(next.scene);
      readings = { front: sensor(next.car, near, End.FRONT, current), rear: sensor(next.car, near, End.REAR, current) };
      sounds.sensor(next.car.gear === Gear.DRIVE ? readings.front : next.car.gear === Gear.REVERSE ? readings.rear : null);
    } else readings = { front: null, rear: null };
    sounds.reverse_beeper(next.status === Status.DRIVING && next.car.speed < -0.02 && !!current.reverse_beeper);
    if (next === game) return;
    if (next.passes !== game.passes) {
      camera = null;
      cut_at = performance.now();
    }
    const before = game;
    game = next;
    if (next.dents > before.dents) sounds.crash();
    if (next.status === Status.OVER && before.status !== Status.OVER) finish(next);
  }

  function finish(state: GameState) {
    release_all();
    const result = result_of(state);
    const done = record(data.value, state.shift, result);
    data.value = done.data;
    new_best = done.improved;
    first_run = done.first;
    sounds.parked(new_best && !first_run);
    if (result.score >= 100) achievements.achieve("valet-hundred");
    if (state.ms >= 600_000) achievements.achieve("valet-ten-minutes");
    if (state.shift.daily) {
      play.daily(state.shift.daily, result.ms, result.score, DAILY_MODE);
      achievements.achieve("valet-daily");
    }
  }

  function settled(before: GameState, next: GameState) {
    input.reset();
    camera = null;
    if (next.status === Status.OVER) return finish(next);
    if (next.handed > before.handed) {
      sounds.parked(false);
      const tip = next.tip!;
      achievements.achieve("valet-first");
      achievements.progress("valet-clean", next.clean);
      if (tip.vehicle === Vehicle.BUS && tip.amount > 0) achievements.achieve("valet-bus");
      return;
    }
    const parked = next.tickets.find((ticket) => ticket.id === before.job?.ticket.id);
    sounds.parked(false);
    if ((parked?.precision ?? 0) >= PERFECT) achievements.achieve("valet-precise");
  }

  function release_all() {
    input.release();
    sounds.quiet();
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function begin() {
    if (game.status !== Status.READY && game.status !== Status.PAUSED) return;
    game = start(game);
    focus_board();
  }

  function toggle_pause() {
    if (live) {
      game = pause(game);
      release_all();
    } else begin();
  }

  function take_next() {
    if (game.status === Status.READY) game = start(game);
    if (!can_take(game)) return;
    game = take(game);
    input.reset();
    camera = null;
    sounds.shift();
    focus_board();
  }

  function fetch_next() {
    if (!can_fetch(game)) return;
    game = fetch(game);
    input.reset();
    camera = null;
    if (game.status === Status.OVER) finish(game);
    else sounds.shift();
    focus_board();
  }

  function leave_car() {
    if (!can_leave(game)) return;
    game = leave(game);
    input.reset();
    camera = null;
    if (game.status === Status.OVER) finish(game);
    else sounds.shift();
    focus_board();
  }

  function stand_action() {
    if (can_fetch(game)) fetch_next();
    else take_next();
  }

  function primary_action() {
    if (game.status === Status.READY) take_next();
    else if (game.status === Status.PAUSED) begin();
    else if (game.status === Status.STAND) stand_action();
    else if (leavable) leave_car();
    else if (driving && game.car.gear !== Gear.PARK && Math.abs(game.car.speed) < STANDING) shift(Gear.PARK);
    else if (over) {
      if (game.shift.daily) retry();
      else new_shift();
    }
  }

  function load(shift: Shift) {
    input.reset();
    sounds.quiet();
    new_best = false;
    first_run = false;
    camera = null;
    readings = { front: null, rear: null };
    game = create_game(shift);
    focus_board();
  }

  function retry() {
    load(game.shift);
  }

  function new_shift() {
    daily = null;
    load(make_shift());
  }

  function open_daily() {
    daily = today();
    load(make_shift());
  }

  function shift(gear: Gear) {
    if (game.status !== Status.DRIVING) return;
    const next = change_gear(game, gear);
    if (next === game) return;
    const before = game;
    game = next;
    if (next.status !== Status.DRIVING) settled(before, next);
    else sounds.shift();
  }

  function choose_direction(want: Gear | null) {
    if (want && Math.abs(game.car.speed) < STANDING) shift(want);
  }

  function set_wheel(value: number) {
    if (game.status === Status.PAUSED) begin();
    input.set_wheel(value);
  }

  function engage(): boolean {
    if (game.status === Status.PAUSED) begin();
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
      if (!live && game.status !== Status.PAUSED) return;
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
    if (game.status === Status.READY || game.status === Status.STAND) {
      if (event.repeat) return;
      if (code === "KeyT") {
        event.preventDefault();
        take_next();
      } else if (code === "KeyF" && game.status === Status.STAND) {
        event.preventDefault();
        fetch_next();
      }
      return;
    }
    if (DRIVE_KEYS.has(code)) {
      event.preventDefault();
      input.keys.add(code);
      if (!event.repeat) choose_direction(key_direction(code));
      return;
    }
    if (code === "KeyL" && !event.repeat) {
      event.preventDefault();
      leave_car();
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

  function clock(ms: number): string {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
</script>

{#snippet toolbar()}
  {@render menu?.()}
  {#if daily}
    <span class="truncate px-1.5 text-ui font-medium">Daily · {daily}</span>
  {/if}
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if live}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Restart this shift" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if !daily}<Button size="sm" variant="primary" onclick={new_shift}>New</Button>{/if}
{/snippet}

{#snippet queue_strip(class_name: string)}
  <div class={cn("flex items-center gap-1 rounded-md bg-background/85 px-1.5 py-1 text-2xs backdrop-blur-[2px]", class_name)} role="meter" aria-label="Cars waiting at the stand" aria-valuemin={0} aria-valuemax={QUEUE_LIMIT} aria-valuenow={queue.length}>
    <span class="font-medium text-foreground/70">Queue</span>
    {#each Array.from({ length: QUEUE_LIMIT }, (_, i) => i) as i (i)}
      <span
        class={cn(
          "inline-flex h-5 min-w-8 items-center justify-center rounded px-1 font-medium",
          i < queue.length ? (queue.length >= QUEUE_LIMIT - 1 ? "bg-warning/25 text-warning" : "bg-primary/20 text-foreground") : "outline-1 outline-dashed outline-foreground/25 -outline-offset-1 text-foreground/40",
          i === QUEUE_LIMIT - 1 && i >= queue.length && "outline-error/50"
        )}
      >
        {i < queue.length ? short_name(queue[i]) : ""}
      </span>
    {/each}
  </div>
{/snippet}

{#snippet timers(class_name: string)}
  {#if tickets.length}
    <ul class={cn("flex flex-wrap gap-1", class_name)} aria-label="Owners returning">
      {#each tickets as ticket (ticket.id)}
        {@const left = countdown(ticket, game.ms)}
        <li class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-2xs tabular-nums backdrop-blur-[2px]", left <= 0 ? "text-warning" : "text-foreground/80")}>
          {short_name(ticket.vehicle)}
          {left > 0 ? clock(left) : `waiting ${clock(-left)}`}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet score_chip(class_name: string)}
  <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", class_name)}>
    <span>{game.score}</span>
    <span class="text-foreground/60"> pts</span>
    <span class={cn(game.dents ? "text-error" : "text-foreground/60")}> · {game.dents} {game.dents === 1 ? "dent" : "dents"}</span>
  </div>
{/snippet}

{#snippet overlay()}
  {#if game.status !== Status.READY}
    <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
      <div class="flex min-w-0 flex-col items-start gap-1.5">
        <div class="flex items-center gap-1.5">
          <IconButton
            size="sm"
            class="pointer-events-auto bg-background/85 backdrop-blur-[2px] @md:hidden pointer-coarse:size-11"
            label={live ? "Pause" : "Resume"}
            disabled={!can_pause}
            onclick={toggle_pause}
          >
            {#if live}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
          </IconButton>
          {#if game.job}
            <GearStrip gear={game.car.gear} onshift={shift} />
            <SpeedChip class="pointer-coarse:hidden" speed={game.car.speed} />
          {/if}
          <div class="rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]">{time}</div>
        </div>
        {#if job_line && game.status !== Status.OVER}
          <div class="max-w-full truncate rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]" aria-live="polite">
            <span class="text-primary">●</span>
            {job_line}
          </div>
        {/if}
        <!-- A phone's top row is the gear strip: the queue and the timers go under it. -->
        <div class="flex flex-col items-start gap-1.5 @md/ts-app:hidden">
          <div class="flex flex-wrap items-center gap-1.5">
            {@render queue_strip("")}
            {@render score_chip("")}
          </div>
          {@render timers("")}
        </div>
      </div>
      <div class="hidden shrink-0 flex-col items-end gap-1.5 @md/ts-app:flex">
        {@render score_chip("")}
        {@render queue_strip("")}
        {@render timers("max-w-72 justify-end")}
      </div>
    </div>
  {/if}
  {#if leavable && game.status === Status.DRIVING}
    <div class="pointer-events-auto absolute inset-x-0 bottom-2 mx-auto flex w-fit animate-pop-in items-center gap-2 rounded-md bg-background/85 p-1 pl-2 text-ui backdrop-blur-[2px]">
      <span class="hidden items-center gap-2 text-2xs text-foreground/65 pointer-fine:flex"><KeyHint key_name="L" text="leave" /></span>
      <Button size="sm" variant="primary" class="pointer-coarse:h-11" onclick={leave_car}>Leave it here</Button>
    </div>
  {:else if (line || note) && live}
    <p
      class={cn(
        "pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit animate-pop-in rounded-md bg-background/85 px-2 py-1 text-ui backdrop-blur-[2px]",
        line ? "text-warning" : "text-foreground",
        game.status === Status.STAND && "hidden"
      )}
      aria-live="polite"
    >
      {line ?? note}
    </p>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{game.shift.daily ? "Daily shift" : "Valet Rush"}</p>
        <p class="text-ui text-foreground/80">Park each car in any free bay and fetch it when its owner is back. Four waiting at the stand ends the shift.</p>
        <p class="mt-0.5 text-2xs text-foreground/65">A touch is a dent: −{DENT_COST} and that car's tip is gone, but the shift goes on.</p>
        {#if best}<p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">Best {best.score} · {best.handed} handed back</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={take_next}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="T" text="take a car" /><KeyHint key_name="F" text="fetch one" /><KeyHint key_name="↑ ↓ ← →" text="drive" /><KeyHint key_name="P" text="park" /><KeyHint key_name="L" text="leave a fetched car" />
      </p>
    </RoundCard>
  {:else if game.status === Status.STAND}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-40">
        <p class="text-base font-semibold">At the stand</p>
        <p class="text-ui text-foreground/80">
          {stand_line}
        </p>
      </div>
      <div class="ml-auto flex min-w-0 flex-wrap justify-end gap-2">
        {#if owners.length}
          <Button variant={queue.length >= QUEUE_LIMIT - 1 ? "quiet" : "primary"} onclick={fetch_next}>Fetch the {vehicle_noun(owners[0].vehicle)}</Button>
        {/if}
        <Button variant={owners.length && queue.length < QUEUE_LIMIT - 1 ? "quiet" : "primary"} disabled={!queue.length} onclick={take_next}>
          {queue.length ? `Take the ${vehicle_noun(queue[0])}` : "Waiting…"}
        </Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="T" text="take" />{#if owners.length}<KeyHint key_name="F" text="fetch" />{/if}<KeyHint key_name="Enter" text={owners.length ? "fetch" : "take"} />
      </p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · {game.score} pts · {queue.length} waiting">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={begin}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.OVER}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Shift over: {final_score(game)} pts
          {#if new_best}<Badge class="ts-pop" tone={first_run ? "neutral" : "primary"}>{first_run ? "First shift" : "New best"}</Badge>{/if}
        </p>
        <p class="text-ui text-foreground/80">{QUEUE_LIMIT} cars waiting at the stand.</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {time} · {game.served} parked · {game.handed} handed back · tips {game.tips} · {game.dents} {game.dents === 1 ? "dent" : "dents"}
        </p>
        {#if best && !new_best}<p class="font-mono text-2xs text-foreground/65 tabular-nums">Best {best.score}</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={retry}>Again</Button>
        {#if !game.shift.daily}<Button variant="primary" onclick={new_shift}>New shift</Button>{/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !game.shift.daily}<KeyHint key_name="Enter" text="new shift" />{/if}
        <KeyHint key_name="R" text="again" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{game.shift.daily ? `Daily · ${game.shift.daily}` : "Valet Rush"}</span>
  <span class="tabular-nums">{time}</span>
  <span class="tabular-nums">{game.score} pts</span>
  <span class="tabular-nums">Handed back {game.handed}</span>
  <span class="hidden @5xl:inline">T takes a car · F fetches one · P or Space parks · L leaves a fetched car in its bay · Esc pauses · + − zoom</span>
{/snippet}

<DriveFrame
  label="Valet Rush. At the stand T takes the next car and F fetches an owner's. L leaves a fetched car stopped in a bay. Arrows steer and drive, P or Space parks, E drive, R reverse, Escape pauses, Enter starts."
  {input}
  {settings}
  wheel_idle={!driving}
  pedals_idle={!driving}
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

  @media (prefers-reduced-motion: reduce) {
    :global(.ts-pop) {
      animation-delay: 0ms !important;
    }
  }
</style>
