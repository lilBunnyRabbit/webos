<script lang="ts">
  import kernel, { type SpeechService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Select } from "$lib/core/components/ui";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowFatLeft as ArrowFatLeftIcon,
    ArrowFatRight as ArrowFatRightIcon,
    ChatCircleText as ChatIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Star as StarIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { daily_seed } from "$kit/games";
  import { random_seed } from "$lib/core/utils/random";
  import TrackPicker from "../../core/track-picker.svelte";
  import { levels_done, unlocked } from "../../core/track";
  import { clamp_zoom, ease, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "$kit/games/play2d/camera";
  import type { Palette } from "$kit/games/play2d/palette";
  import DriveFrame from "../../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../../core/drive-input.svelte";
  import GearStrip from "../../core/gear-strip.svelte";
  import { KeyHint } from "$kit/components/play2d";
  import { DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, zoom_step } from "../../core/keys";
  import { frame_loop } from "$kit/games/play2d/loop";
  import { PERFECT } from "$kit/games/play2d/precision";
  import { RoundCard } from "$kit/components/play2d";
  import SettingsPanel from "../../core/settings-panel.svelte";
  import { Signal, SIGNAL_KEYS } from "../../core/signal";
  import { Sounds } from "../../core/sound";
  import { SpeedChip } from "$kit/components/play2d";
  import { body_centre, Gear, max_steer, top_speed, without_creep } from "../../core/vehicle";
  import type { GameProps } from "../define";
  import { draw_scene } from "./draw";
  import {
    advance,
    change_gear,
    clock_text,
    counts,
    create_game,
    current_limit,
    daily_score,
    data_schema,
    EMPTY_DATA,
    Outcome,
    record,
    result_of,
    set_status,
    SPEC,
    Status,
    type GameState,
    type Result,
    type Round,
  } from "./game";
  import { daily_def, level_def, level_name, random_def } from "./levels";
  import { ROUTE_IDS } from "./route";
  import { FAULT_INFO, MAX_MINORS, Severity, sheet } from "./rules";
  import { LEVEL_COUNT, level_key, level_stars, test_stars } from "./stars";
  import { town } from "./town";

  const Mode = { LEVELS: "levels", RANDOM: "random" } as const;
  type Mode = (typeof Mode)[keyof typeof Mode];
  const RANDOM = "random";
  const RANDOM_OPTION = [{ value: RANDOM, label: "Random" }];
  const DAILY = "daily";
  const DAILY_OPTION = { value: DAILY, label: "Daily" };
  const DAILY_MODE = "test";
  // Slow, a parking game's view; at town speeds it pulls back and looks ahead, so a junction shows a few seconds early.
  const SPAN_SLOW = view_span(SPEC.length);
  const SPAN_FAST = 62;
  const SPAN_IDLE = 48;
  const LOOK_AHEAD = 1.1;
  const BUBBLE_MS = 9000;
  const FLASH_MS = 2600;
  const SEVERITY_LABEL = { minor: "Minor", serious: "Serious", dangerous: "Dangerous" } as const;

  const { settings, prefs, daily: daily_prop, menu, play, onexit }: GameProps = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage, achievements } = get_app_context();
  const speech = $derived(kernel.service<SpeechService>("speech"));
  const data = storage.file("test.json", EMPTY_DATA, data_schema);
  const input = new DriveInput();
  const sounds = new Sounds(() => settings);
  const the_town = town();

  const stored = z
    .object({
      "test.level": z.number().int().min(1).max(LEVEL_COUNT).catch(1),
      "test.mode": z.enum([Mode.LEVELS, Mode.RANDOM]).catch(Mode.LEVELS),
      "test.landscape-hint": z.boolean().catch(false),
    })
    .parse(untrack(() => prefs.value));
  let daily = $state<string | null>(daily_day ?? null);
  let mode = $state<Mode>(stored["test.mode"]);
  let level = $state(stored["test.level"]);
  let hint_seen = $state(stored["test.landscape-hint"]);
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
  let now = $state(0);

  let camera: Camera | null = null;
  let font = "system-ui, sans-serif";

  const lock = $derived(max_steer(SPEC));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const driving = $derived(game.status === Status.DRIVING);
  const over = $derived(game.status === Status.DONE);
  const can_pause = $derived(game.status === Status.READY || game.status === Status.DRIVING || game.status === Status.PAUSED);
  const play_label = $derived(game.status === Status.DRIVING ? "Pause (Esc)" : game.status === Status.PAUSED ? "Resume (Esc)" : "Start (Enter)");
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const tally = $derived(counts(game));
  const limit = $derived(Math.round(current_limit(game) * 3.6));
  const round = $derived(game.round);
  const best = $derived<Result | undefined>(round.level !== undefined ? data.value.best[level_key(round.level)] : undefined);
  const levels = $derived(level_stars(data.value.best));
  const max_level = $derived(unlocked(levels, LEVEL_COUNT));
  const has_next_level = $derived(round.level !== undefined && round.level < LEVEL_COUNT);
  const earned = $derived(test_stars(result_of(game) ?? undefined));
  const go_on = $derived(round.daily ? "again" : round.level === undefined ? "new" : has_next_level && game.end?.outcome === Outcome.PASS ? "next" : "again");
  const title = $derived(round.daily ? `Daily · ${round.daily}` : round.level !== undefined ? `Level ${round.level} · ${round.def.name}` : round.def.name);
  const rows = $derived(sheet(game.faults));
  const bubble = $derived(game.spoken && game.ms - game.spoken.ms < BUBBLE_MS && game.status !== Status.READY ? game.spoken.text : null);
  const flash = $derived.by(() => {
    const last = game.faults.at(-1);
    return last && game.ms - last.ms < FLASH_MS && game.status !== Status.DONE ? last : null;
  });
  const lit = $derived(Math.floor(now / 400) % 2 === 0);
  const upright = $derived(board_size.height > board_size.width);
  const wheel_degrees = $derived(Math.round((game.car.steer / lock) * 450));

  function result_text(result: Result): string {
    const outcome = result.passed ? "Pass" : "Fail";
    const minors = `${result.minors} minor${result.minors === 1 ? "" : "s"}`;
    const heavy = result.serious + result.dangerous;
    return `${outcome} · ${minors}${heavy ? ` · ${heavy} serious` : ""}`;
  }

  function make_round(): Round {
    if (daily) return { def: daily_def(daily, daily_seed(daily, `${app_id}/${DAILY_MODE}`), SPEC), daily };
    if (mode === Mode.RANDOM) return { def: random_def(random_seed(), SPEC) };
    return { def: level_def(level, SPEC), level };
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function say(text: string) {
    if (settings.sound) speech.speak(win.id, text);
  }

  function mute() {
    sounds.quiet();
    speech.stop(win.id);
  }

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.DRIVING) game = set_status(game, Status.PAUSED);
    });
  });

  $effect(() => {
    if (canvas) font = getComputedStyle(canvas).fontFamily || font;
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
    void [game, palette, board_size, zoom, settings.guides, settings.hitboxes, settings.speed_zoom, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height, input.signal];
    if (game.status === Status.DRIVING && !blocked) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function control_insets(): Insets {
    const carded = game.status === Status.READY || game.status === Status.DONE;
    const card_bottom = carded && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.6) : 0;
    const card_left = carded && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const top = game.status === Status.READY ? 8 : hud_height + 8;
    const insets = { top, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  function target_camera(insets: Insets): Camera {
    const { bounds } = the_town;
    const centre = body_centre(game.car, SPEC);
    if (game.status !== Status.DRIVING && game.status !== Status.PAUSED) {
      return frame(bounds, centre, board_size.width, board_size.height, zoom, insets, SPAN_IDLE);
    }
    const pace = Math.min(1, Math.abs(game.car.speed) / top_speed(SPEC));
    const ahead = game.car.speed * LOOK_AHEAD;
    const focus = { x: centre.x + Math.cos(game.car.heading) * ahead, y: centre.y + Math.sin(game.car.heading) * ahead };
    return frame(bounds, focus, board_size.width, board_size.height, zoom, insets, settings.speed_zoom ? SPAN_SLOW + (SPAN_FAST - SPAN_SLOW) * pace : SPAN_SLOW);
  }

  function render(dt: number) {
    if (!canvas || !palette || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const insets = control_insets();
    const target = target_camera(insets);
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const time = performance.now() / 1000;
    now = time * 1000;
    draw_scene(ctx, game, the_town, { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr }, palette, {
      guides: settings.guides,
      hitboxes: settings.hitboxes,
      time,
      signal: game.status === Status.DONE ? Signal.NONE : input.signal,
      insets,
      font,
    });
  }

  function run(steps: number, dt: number) {
    let next = game;
    const spec = settings.creep ? SPEC : without_creep(SPEC);
    for (let i = 0; i < steps && next.status === Status.DRIVING; i++) {
      input.step_wheel(dt, SPEC, settings.wheel);
      next = advance(next, input.read(next.car.gear), dt, spec);
    }
    input.follow(next.car.steer / lock);
    sounds.indicator(next.status === Status.DRIVING && input.signal !== Signal.NONE);
    if (next === game) return;
    const before = game;
    game = next;
    react(before, next);
  }

  function react(before: GameState, next: GameState) {
    if (next.spoken && next.spoken !== before.spoken) say(next.spoken.text);
    if (next.contact && next.contact !== before.contact) sounds.crash();
    if (next.park && !before.park) {
      sounds.parked(next.park.score >= PERFECT);
      if (next.park.score >= PERFECT) achievements.achieve("test-bay");
    }
    if (next.status === Status.DONE && before.status !== Status.DONE) finished(next);
  }

  function finished(state: GameState) {
    release_all();
    const outcome = state.end?.outcome;
    say(
      outcome === Outcome.PASS
        ? "That's the end of the test. I'm pleased to tell you that you've passed."
        : outcome === Outcome.FAIL
          ? "That's the end of the test. I'm sorry, but you haven't passed this time."
          : (state.end?.reason ?? "")
    );
    const result = result_of(state);
    if (!result) return;
    if (state.round.daily) {
      play.daily(state.round.daily, result.ms, daily_score(result), DAILY_MODE);
      achievements.achieve("test-daily");
    }
    let best = data.value.best;
    if (state.round.level !== undefined) {
      const saved = record(data.value, level_key(state.round.level), result);
      if (saved.improved) data.value = saved.data;
      new_best = saved.improved && !saved.first;
      best = saved.data.best;
    }
    if (!result.passed) return;
    sounds.parked(true);
    achievements.achieve("test-pass");
    if (state.faults.length === 0) achievements.achieve("test-clean");
    if (state.round.level === undefined) return;
    achievements.progress("test-routes", ROUTE_IDS.filter((id) => best[id]?.passed).length);
    achievements.progress("test-levels", levels_done(level_stars(best)));
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
    if (game.status === Status.READY && !hint_seen && upright && matchMedia("(pointer: coarse)").matches) {
      hint_seen = true;
      prefs.value["test.landscape-hint"] = true;
    }
    const before = game;
    game = set_status(game, Status.DRIVING);
    react(before, game);
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
    else if (game.status === Status.DONE) {
      if (go_on === "next") next_round();
      else if (go_on === "new") new_route();
      else retry();
    }
  }

  function load(next: Round) {
    input.reset();
    sounds.quiet();
    speech.stop(win.id);
    new_best = false;
    camera = null;
    game = create_game(next);
    focus_board();
  }

  function retry() {
    load(game.round);
  }

  function next_round() {
    if (game.round.level !== undefined && has_next_level) {
      level = Math.min(max_level, game.round.level + 1);
      prefs.value["test.level"] = level;
    }
    load(make_round());
  }

  function new_route() {
    daily = null;
    load(make_round());
  }

  function set_round(next: string) {
    if (next === DAILY) return;
    daily = null;
    if (next === RANDOM) mode = Mode.RANDOM;
    else {
      mode = Mode.LEVELS;
      level = Math.max(1, Math.min(LEVEL_COUNT, Number(next)));
      prefs.value["test.level"] = level;
    }
    prefs.value["test.mode"] = mode;
    load(make_round());
  }

  function open_daily() {
    daily = today();
    load(make_round());
  }

  function shift(gear: Gear) {
    if (game.status === Status.READY) start();
    if (game.status !== Status.DRIVING) return;
    const before = game;
    const next = change_gear(game, gear);
    if (next === game) return;
    game = next;
    sounds.shift();
    react(before, next);
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
    const signal = SIGNAL_KEYS[code];
    if (signal) {
      event.preventDefault();
      if (!event.repeat) input.toggle_signal(signal);
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

{#snippet severity_badge(severity: Severity)}
  <Badge tone={severity === Severity.MINOR ? "warning" : "error"}>{SEVERITY_LABEL[severity]}</Badge>
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
  <TrackPicker
    class="w-[8.5rem] min-w-0 @md:w-44"
    label="Route"
    before={daily ? [DAILY_OPTION, ...RANDOM_OPTION] : RANDOM_OPTION}
    open={Math.max(max_level, mode === Mode.LEVELS ? level : 1)}
    stars={(at) => levels[at] ?? 0}
    name={(at) => `${at}. ${level_name(at)}`}
    value={daily ? DAILY : mode === Mode.LEVELS ? String(level) : RANDOM}
    onpick={set_round}
  />
  <div class="flex-1"></div>
  {#if !daily}<Button size="sm" variant="quiet" class="hidden @lg:inline-flex" onclick={open_daily}>Daily</Button>{/if}
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={mute} onfocus={focus_board} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={play_label} disabled={!can_pause} onclick={toggle_pause}>
    {#if game.status === Status.DRIVING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  <IconButton size="sm" class="hidden @md:inline-flex" label="Start the test again" onclick={retry}>
    <ArrowCounterClockwiseIcon weight="bold" />
  </IconButton>
  {#if mode === Mode.RANDOM && !daily}
    <Button size="sm" variant="primary" onclick={new_route}>New</Button>
  {/if}
{/snippet}

{#snippet overlay()}
  {#if game.status === Status.DRIVING || game.status === Status.PAUSED}
    <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex flex-col gap-1.5">
      <div class="flex items-start justify-between gap-1.5">
        <div class="flex min-w-0 flex-wrap items-center gap-1.5">
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
        <div class="flex shrink-0 items-center gap-1.5">
          <span class="ts-limit grid size-9 place-items-center rounded-full font-mono text-ui font-bold tabular-nums" role="img" aria-label="Speed limit {limit} km/h">{limit}</span>
          <div class="flex items-center gap-0.5 rounded-md bg-background/85 px-1 py-0.5 backdrop-blur-[2px] pointer-coarse:hidden" aria-label="Turn signal" role="img">
            <ArrowFatLeftIcon weight="fill" class={cn("size-4", input.signal === Signal.LEFT && lit ? "text-warning" : "text-foreground/20")} />
            <ArrowFatRightIcon weight="fill" class={cn("size-4", input.signal === Signal.RIGHT && lit ? "text-warning" : "text-foreground/20")} />
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <SpeedChip class="hidden pointer-coarse:block" speed={game.car.speed} />
        <div class="rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-live="off">
          <span class={cn(tally.minors > MAX_MINORS && "text-error")}>{tally.minors}<span class="text-foreground/65">&nbsp;minor{tally.minors === 1 ? "" : "s"}</span></span>
          {#if tally.serious + tally.dangerous > 0}<span class="text-error"> · {tally.serious + tally.dangerous} serious</span>{/if}
          <span class="text-foreground/65"> · {clock_text(game.ms)}</span>
        </div>
        {#if flash}
          <div class={cn("ts-pop rounded-md bg-background/85 px-1.5 py-0.5 text-ui backdrop-blur-[2px]", flash.severity === Severity.MINOR ? "text-warning" : "text-error")} role="status">
            {SEVERITY_LABEL[flash.severity]} · {flash.note}
          </div>
        {/if}
      </div>
      {#if bubble}
        <div class="ts-bubble flex max-w-[min(26rem,100%)] items-start gap-1.5 self-center rounded-lg bg-background/90 px-2.5 py-1.5 text-ui shadow-popover backdrop-blur-[2px]" role="status" aria-live="polite">
          <ChatIcon weight="fill" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span>{bubble}</span>
        </div>
      {/if}
    </div>
  {/if}

  {#if game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          <span>{title}</span>
          {#if round.level !== undefined}{@render star_row(levels[round.level] ?? 0, false)}{/if}
        </p>
        <p class="text-ui text-foreground/80">Follow the examiner, park in the marked bay, pull up when asked. Over {MAX_MINORS} minors or one serious fault fails; no minors earns three stars, up to 5 two.</p>
        <p class="mt-0.5 font-mono text-2xs text-foreground/65 tabular-nums">
          {(game.route.length / 1000).toFixed(1)} km{best ? ` · Best ${result_text(best)}` : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if !daily && mode === Mode.RANDOM}<Button variant="quiet" onclick={new_route}>New route</Button>{/if}
        {#if !daily}<Button variant="quiet" class="@lg:hidden" onclick={open_daily}>Daily</Button>{/if}
        <Button variant="primary" onclick={start}>Start</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑ ↓" text="drive" /><KeyHint key_name="← →" text="steer" /><KeyHint key_name="Z X" text="signal" /><KeyHint key_name="Space" text="park" /><KeyHint key_name="Esc" text="pause" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Signal with the arrows over the wheel; tap P to park and when you pull up.</p>
      {#if upright && !hint_seen}
        <p class="basis-full text-2xs text-primary pointer-fine:hidden">Tip: hold your phone sideways for a wider view of the road.</p>
      {/if}
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{title} · {clock_text(game.ms)}">
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={start}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE && game.end}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          <span class={cn(game.end.outcome === Outcome.PASS ? "text-success" : "text-error")}>
            {game.end.outcome === Outcome.PASS ? "Pass" : game.end.outcome === Outcome.FAIL ? "Fail" : "Test stopped"}
          </span>
          {#if game.end.outcome !== Outcome.STOPPED}{@render star_row(earned, true)}{/if}
          {#if new_best}<Badge class="ts-pop" tone="primary">New best</Badge>{/if}
        </p>
        <p class="text-ui text-foreground/80">{title}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {tally.minors}/{MAX_MINORS} minor · {tally.serious} serious · {tally.dangerous} dangerous · {clock_text(game.ms)}{game.park ? ` · Bay ${game.park.score}%` : ""}
        </p>
        {#if game.end.outcome === Outcome.STOPPED}<p class="text-ui text-foreground/80">{game.end.reason}</p>{/if}
        {#if rows.length > 0}
          <ul class="ts-sheet mt-1.5 flex flex-col gap-1.5 overflow-y-auto pr-1">
            {#each rows as row (`${row.kind}/${row.severity}`)}
              <li class="text-ui">
                <p class="flex flex-wrap items-center gap-1.5">
                  {@render severity_badge(row.severity)}
                  <span class="font-medium">{FAULT_INFO[row.kind].title}{row.count > 1 ? ` × ${row.count}` : ""}</span>
                  <span class="text-foreground/65">{row.notes.join("; ")}</span>
                </p>
                <p class="text-2xs text-foreground/65">{FAULT_INFO[row.kind].why}</p>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-ui text-foreground/80">Not a single fault on the sheet.</p>
        {/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if go_on === "next"}
          <Button variant="quiet" onclick={retry}>Again</Button>
          <Button variant="primary" onclick={next_round}>Next level</Button>
        {:else if go_on === "new"}
          <Button variant="quiet" onclick={retry}>Again</Button>
          <Button variant="primary" onclick={new_route}>New route</Button>
        {:else}
          <Button variant="primary" onclick={retry}>Again</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if go_on === "again"}
          <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="drives it again" />
        {:else}
          <KeyHint key_name="Enter" text={go_on === "next" ? "next level" : "new route"} /><KeyHint key_name="R" text="drives it again" />
        {/if}
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span class="truncate">{title}</span>
  <span class="tabular-nums">{clock_text(game.ms)}</span>
  <span class="tabular-nums">{tally.minors} minor{tally.minors === 1 ? "" : "s"}{tally.serious + tally.dangerous ? ` · ${tally.serious + tally.dangerous} serious` : ""}</span>
  <span class="tabular-nums">Limit {limit}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  <span class="hidden @5xl:inline">Z X signal · Space parks · Esc pauses · + − zoom</span>
{/snippet}

<DriveFrame
  label="Driving Test. Arrows steer, accelerate and brake, Z and X signal, Space parks, Escape pauses, Enter starts."
  {input}
  {settings}
  signals
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
  .ts-limit {
    background: var(--background-lightest);
    color: var(--foreground);
    box-shadow: inset 0 0 0 3px var(--error);
  }

  .ts-sheet {
    max-height: min(14rem, 32cqh);
  }

  .ts-bubble {
    animation: var(--animate-pop-in) 320ms both;
  }

  :global(.ts-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }

  .ts-star {
    animation: ts-star 380ms var(--ease-out) both;
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
    .ts-star {
      animation-delay: 0ms !important;
    }
  }

  :global(html[data-motion="off"]) .ts-star {
    animation-delay: 0ms !important;
  }
</style>
