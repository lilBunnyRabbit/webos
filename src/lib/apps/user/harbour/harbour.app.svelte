<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Spinner } from "$lib/core/components/ui";
  import { KeyHint, RoundCard, SpeedChip } from "$kit/components/play2d";
  import { daily_seed, format_time, track_play } from "$kit/games";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, type Camera, type Insets } from "$kit/games/play2d/camera";
  import { bounds_of } from "$kit/games/play2d/geometry";
  import { frame_loop } from "$kit/games/play2d/loop";
  import type { Palette } from "$kit/games/play2d/palette";
  import { report_error } from "$kit/utils/report-error";
  import { Anchor as AnchorIcon, ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { body_velocity, speed, to_world } from "./core/boat";
  import { boat_coefficients, BoatId, SPECS } from "./core/boats";
  import { work_out_chart, type ChartJob } from "./core/chart-job";
  import { Grade } from "./core/contact";
  import { draw_frame, WAKE_LIFE, type WakePoint } from "./core/draw";
  import { AHEAD_KEYS, ASTERN_KEYS, Helm, PORT_KEYS, STARBOARD_KEYS } from "./core/helm.svelte";
  import { build_hub, crossed, in_shed, past_gate, type Gate } from "./core/hub";
  import { DETENT_NAMES, NEUTRAL, ThrottleMode } from "./core/lever";
  import { LEVELS } from "./core/levels";
  import { better, DEFAULT_PROGRESS, DEFAULT_SETTINGS, levels_done, PROGRESS_FILE, progress_schema, SETTINGS_FILE, settings_schema } from "./core/progress";
  import { advance, bumps, create_game, DOCK_HOLD, LINES_TIME, PERFECT, result, Status, type GameState, type Result } from "./core/round";
  import { daily_ref, round_brief, round_key, round_title, RoundKind, scene_of, type Chart, type RoundRef } from "./core/rounds";
  import { Sounds } from "./core/sound";
  import { BerthKind, type Scene } from "./core/world";
  import HarbourFrame from "./frame.svelte";
  import SettingsPanel from "./settings-panel.svelte";

  const { daily: daily_prop }: { daily?: string } = $props();

  const { app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const settings_file = storage.file(SETTINGS_FILE, DEFAULT_SETTINGS, settings_schema);
  const progress = storage.file(PROGRESS_FILE, DEFAULT_PROGRESS, progress_schema);
  const hub = build_hub();
  const KNOT = 1.943844;
  const LOOK_AHEAD = 1.5;

  interface Pending {
    gate: Gate;
    ref: RoundRef;
    chart: Chart | null;
    failed: boolean;
  }

  interface Round {
    ref: RoundRef;
    chart: Chart;
  }

  const settings = $derived(settings_file.value);
  const throttle = $derived(settings.throttle);
  const helm = new Helm(() => settings_file.value.throttle);
  const sounds = new Sounds(() => settings_file.value.sound);

  let boat_id = $state<BoatId>(BoatId.RIB);
  let round = $state.raw<Round | null>(null);
  let game = $state.raw<GameState>(hub_game(hub.scene.start));
  let card = $state.raw<Pending | null>(null);
  let opening_daily = $state<string | null>(untrack(() => daily_prop ?? null));
  let outcome = $state.raw<{ result: Result; improved: boolean; first: boolean } | null>(null);
  let swapped = $state<string | null>(null);
  let ready = $state(false);

  let board_size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let zoom = $state(1);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let card_size = $state({ width: 0, height: 0 });
  let settings_panel: HTMLDivElement | undefined = $state();
  let wheel_box = $state({ width: 0, height: 0 });
  let lever_box = $state({ width: 0, height: 0 });
  let stage_rect = $state<DOMRectReadOnly>();
  let hud_height = $state(0);

  let camera: Camera | null = null;
  let wake: WakePoint[] = [];
  let wake_clock = 0;
  let touch_age = 0;
  let in_shed_now = false;
  let job: ChartJob | null = null;
  let swap_timer = 0;

  const boat_for_game = $derived(round ? round.ref.boat : boat_id);
  const c = $derived(boat_coefficients(boat_for_game));
  const spec = $derived(SPECS[boat_for_game]);
  const in_hub = $derived(round === null);
  const blocked = $derived(!win.is_visible || (!win.is_focused && !in_hub));
  const sailing = $derived(game.status === Status.SAILING || game.status === Status.LINES);
  const over = $derived(game.status === Status.DONE || game.status === Status.CRASHED);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const knots = $derived(speed(game.boat) * KNOT * Math.sign(body_velocity(game.boat).u || 1));
  const time = $derived(format_time(game.time * 1000, { tenths: true }));
  const par = $derived(round?.chart.par ?? null);
  const best = $derived(round ? progress.value.bests[round_key(round.ref)] : undefined);
  const lever_name = $derived(DETENT_NAMES[helm.shown]);
  const wheel_degrees = $derived(Math.round(helm.wheel * spec.lock));
  const hold_share = $derived(game.status === Status.SAILING ? Math.min(1, game.held / DOCK_HOLD) : 0);
  const touches_text = $derived(touch_summary(game));

  function hub_game(pose: { x: number; y: number; heading: number }): GameState {
    return { ...create_game({ ...hub.scene, start: pose }), status: Status.SAILING };
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function touch_summary(state: GameState): string {
    const count = bumps(state);
    const kisses = state.touches.length - count;
    if (state.touches.length === 0) return "No touches";
    if (count === 0) return `${kisses} ${kisses === 1 ? "kiss" : "kisses"}`;
    return `${count} ${count === 1 ? "bump" : "bumps"}`;
  }

  function ref_for(gate: Gate): RoundRef {
    if (gate.id === RoundKind.DAILY) {
      const day = today();
      return daily_ref(day, daily_seed(day, app_id));
    }
    if (gate.id === RoundKind.RANDOM) return { kind: RoundKind.RANDOM, boat: boat_id, seed: Math.floor(Math.random() * 2 ** 31) };
    return { kind: RoundKind.LEVEL, boat: boat_id, level: gate.id };
  }

  function stars_for(gate: Gate): number | null {
    const bests = progress.value.bests;
    if (gate.id === RoundKind.DAILY) return bests[`daily-${today()}`]?.stars ?? null;
    if (gate.id === RoundKind.RANDOM) return bests[`random-${boat_id}`]?.stars ?? null;
    return bests[`level-${gate.id}-${boat_id}`]?.stars ?? null;
  }

  $effect(() => {
    if (!settings_file.ready || ready) return;
    untrack(() => {
      boat_id = settings_file.value.boat;
      ready = true;
      if (opening_daily) open_daily(opening_daily);
    });
  });

  $effect(() => () => {
    sounds.close();
    job?.cancel();
    clearTimeout(swap_timer);
  });

  $effect(() => {
    if (!blocked) return;
    helm.release();
    untrack(() => {
      if (!in_hub && game.status === Status.SAILING) game = { ...game, status: Status.PAUSED };
    });
  });

  $effect(() =>
    win.on_back(() => {
      if (settings_panel?.matches(":popover-open")) return (settings_panel.hidePopover(), true);
      if (card) {
        close_card();
        return true;
      }
      if (round) {
        to_hub();
        return true;
      }
      return false;
    })
  );

  $effect(() => {
    if (!ready || !sailing || blocked || card) return;
    const stop = frame_loop(run, render, () => game.status === Status.SAILING || game.status === Status.LINES);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  $effect(() => {
    void [game, palette, board_size, zoom, card_size.width, card_size.height, side_card, wheel_box.width, lever_box.width, hud_height, card, round];
    if (sailing && !blocked && !card) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!wheel_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function carded(): boolean {
    return !!card || game.status === Status.READY || over;
  }

  function control_insets(): Insets {
    const up = carded();
    const card_bottom = up && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.6) : 0;
    const card_left = up && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: lever_box.width + OVERLAY_GAP, left: Math.max(card_left, wheel_box.width + OVERLAY_GAP) };
  }

  function target_camera(): Camera {
    const insets = control_insets();
    const { bounds } = game.scene;
    const span = view_span(spec.length);
    if (game.status === Status.READY && game.scene.berth) {
      const area = bounds_of([...game.scene.berth.bay.shape, game.scene.start]);
      const pad = spec.length * 1.2;
      const view = { x0: area.x0 - pad, y0: area.y0 - pad, x1: area.x1 + pad, y1: area.y1 + pad };
      const middle = { x: (view.x0 + view.x1) / 2, y: (view.y0 + view.y1) / 2 };
      return frame(bounds, middle, board_size.width, board_size.height, zoom, insets, Math.max(span, fit_span(view, board_size.width, board_size.height, insets)));
    }
    const reach = Math.min(span / 3, 1);
    const ahead = { x: game.boat.vx * LOOK_AHEAD, y: game.boat.vy * LOOK_AHEAD };
    const length = Math.hypot(ahead.x, ahead.y);
    const k = length > (span / 3) * reach ? ((span / 3) * reach) / length : 1;
    const focus = { x: game.boat.x + ahead.x * k, y: game.boat.y + ahead.y * k };
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
    const lines = game.status === Status.LINES ? game.lines / LINES_TIME : game.status === Status.DONE ? 1 : null;
    draw_frame(ctx, {
      scene: game.scene,
      boat: game.boat,
      c,
      view: { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr },
      palette,
      time: performance.now() / 1000,
      wake,
      insets: control_insets(),
      font: getComputedStyle(canvas).fontFamily,
      held: hold_share,
      lines,
      squash: game.squash,
      touch: game.last_touch ? { touch: game.last_touch, age: touch_age } : null,
      hub: in_hub ? { hub, stars: stars_for, shed_label: `Boat shed · swap to the ${boat_id === BoatId.RIB ? "yacht" : "RIB"}` } : undefined,
    });
  }

  function lay_wake(state: GameState, dt: number) {
    for (const point of wake) point.age += dt;
    while (wake.length && wake[0].age > WAKE_LIFE) wake.shift();
    wake_clock += dt;
    if (wake_clock < 0.08) return;
    wake_clock = 0;
    const v = speed(state.boat);
    if (v < 0.12) return;
    const stern = to_world(state.boat, { x: -spec.length / 2, y: 0 });
    wake.push({ x: stern.x, y: stern.y, age: 0, ax: -Math.sin(state.boat.heading), ay: Math.cos(state.boat.heading), speed: v });
    if (wake.length > 60) wake.shift();
  }

  function run(steps: number, dt: number) {
    let next = game;
    for (let i = 0; i < steps && (next.status === Status.SAILING || next.status === Status.LINES); i++) {
      helm.step(dt);
      next = advance(next, helm.read(), c, dt, { free: in_hub });
    }
    const span = steps * dt;
    touch_age += span;
    lay_wake(next, span);
    sounds.drone(next.boat.power, next.boat.gear);
    if (next === game) return;
    const before = game;
    game = next;
    if (next.boat.gear !== before.boat.gear && next.boat.gear !== 0) sounds.shift();
    if (next.touches.length > before.touches.length) {
      touch_age = 0;
      const worst = next.touches.slice(before.touches.length).reduce((a, b) => (b.speed > a.speed ? b : a));
      if (worst.grade === Grade.HARD && in_hub) sounds.crash();
      else if (worst.grade !== Grade.HARD) sounds.squeak(worst.speed);
    }
    if (in_hub) hub_step(before, next);
    else if (before.status !== Status.CRASHED && next.status === Status.CRASHED) {
      helm.release();
      sounds.quiet();
      sounds.crash();
    } else if (before.status === Status.SAILING && next.status === Status.LINES) helm.neutral();
    else if (before.status === Status.LINES && next.status === Status.DONE) finish(next);
  }

  function hub_step(before: GameState, next: GameState) {
    const gate = crossed(hub.gates, before.boat, next.boat);
    if (gate) pending_gate = gate;
    if (pending_gate && speed(next.boat) < 0.3) {
      open_card(pending_gate);
      pending_gate = null;
    } else if (pending_gate) {
      const middle = { x: (pending_gate.port.x + pending_gate.starboard.x) / 2, y: pending_gate.port.y };
      if (Math.hypot(next.boat.x - middle.x, next.boat.y - middle.y) > 40) pending_gate = null;
    }
    const inside = in_shed(hub, next.boat);
    if (inside && !in_shed_now) swap_boat();
    in_shed_now = inside;
  }

  let pending_gate: Gate | null = null;

  function swap_boat() {
    boat_id = boat_id === BoatId.RIB ? BoatId.YACHT : BoatId.RIB;
    settings_file.value.boat = boat_id;
    helm.reset();
    wake = [];
    game = hub_game(hub.shed.exit);
    in_shed_now = true;
    sounds.swap();
    achievements.achieve("harbour-swap");
    swapped = SPECS[boat_id].name;
    clearTimeout(swap_timer);
    swap_timer = window.setTimeout(() => (swapped = null), 2600);
  }

  function open_card(gate: Gate) {
    helm.reset();
    sounds.quiet();
    game = { ...game, boat: { ...game.boat, vx: 0, vy: 0, r: 0, power: 0, gear: 0 } };
    const ref = ref_for(gate);
    card = { gate, ref, chart: null, failed: false };
    opening_daily = null;
    if (!settings_file.value.seen_hint) settings_file.value.seen_hint = true;
    chart_for(ref, (chart) => {
      if (card?.ref === ref) card = { ...card, chart };
    }, () => {
      if (card?.ref === ref) card = { ...card, failed: true };
    });
  }

  function chart_for(ref: RoundRef, done: (chart: Chart) => void, failed: () => void) {
    job?.cancel();
    const current = work_out_chart(ref);
    job = current;
    current.result.then(
      (chart) => {
        if (job !== current) return;
        job = null;
        if (chart.par === null && ref.kind !== RoundKind.LEVEL) return failed();
        done(chart);
      },
      (reason: unknown) => {
        if (job !== current) return;
        job = null;
        report_error(app_id, "Couldn't chart the berth", reason);
        failed();
      }
    );
  }

  function close_card() {
    job?.cancel();
    job = null;
    card = null;
    focus_board();
  }

  function begin(ref: RoundRef, chart: Chart) {
    helm.reset();
    sounds.quiet();
    wake = [];
    camera = null;
    outcome = null;
    touch_age = 10;
    const scene: Scene = scene_of(ref, chart.attempt);
    round = { ref, chart };
    game = create_game(scene);
    card = null;
    focus_board();
  }

  function start_card() {
    if (!card?.chart) return;
    begin(card.ref, card.chart);
  }

  function open_daily(day: string) {
    const ref = daily_ref(day, daily_seed(day, app_id));
    chart_for(ref, (chart) => {
      opening_daily = null;
      begin(ref, chart);
    }, () => {
      opening_daily = null;
    });
  }

  function to_hub() {
    const from = round?.ref;
    job?.cancel();
    round = null;
    outcome = null;
    helm.reset();
    sounds.quiet();
    wake = [];
    camera = null;
    const gate_id = from?.kind === RoundKind.LEVEL ? from.level! : from?.kind;
    game = hub_game(gate_id ? past_gate(hub, gate_id) : hub.scene.start);
    pending_gate = null;
    focus_board();
  }

  function retry() {
    if (round) begin(round.ref, round.chart);
  }

  function next_level() {
    if (!round || round.ref.kind !== RoundKind.LEVEL) return;
    const index = LEVELS.findIndex((level) => level.id === round!.ref.level);
    const next = LEVELS[index + 1];
    if (!next) return to_hub();
    const ref: RoundRef = { kind: RoundKind.LEVEL, boat: round.ref.boat, level: next.id };
    card = { gate: hub.gates.find((gate) => gate.id === next.id)!, ref, chart: null, failed: false };
    chart_for(ref, (chart) => {
      if (card?.ref === ref) begin(ref, chart);
    }, () => {
      if (card?.ref === ref) card = { ...card, failed: true };
    });
  }

  function finish(state: GameState) {
    helm.release();
    if (!round) return;
    const run = result(state, round.chart.par);
    const key = round_key(round.ref);
    const before = progress.value.bests[key];
    const kept = better(before, { stars: run.stars, ms: run.ms, perfect: run.perfect });
    progress.value.bests = { ...progress.value.bests, [key]: kept.best };
    outcome = { result: run, improved: kept.improved, first: !before };
    sounds.docked(kept.improved && !!before);
    achievements.achieve("harbour-first");
    if (run.perfect) achievements.achieve("harbour-perfect");
    if (run.stars === 3 && round.ref.kind === RoundKind.LEVEL) achievements.achieve("harbour-three");
    if (round.ref.boat === BoatId.YACHT && state.scene.berth?.kind === BerthKind.BOX) achievements.achieve("harbour-box");
    achievements.progress("harbour-levels", levels_done(progress.value.bests));
    if (round.ref.kind === RoundKind.DAILY && round.ref.day) {
      play.daily(round.ref.day, run.ms, 3 - run.stars);
      achievements.achieve("harbour-daily");
    }
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function cast_off() {
    if (game.status === Status.READY || game.status === Status.PAUSED) {
      game = { ...game, status: Status.SAILING };
      focus_board();
    }
  }

  function toggle_pause() {
    if (in_hub) return;
    if (game.status === Status.SAILING) {
      game = { ...game, status: Status.PAUSED };
      helm.release();
      sounds.quiet();
    } else if (game.status === Status.PAUSED) cast_off();
  }

  function engage(): boolean {
    if (card) return false;
    if (game.status === Status.READY) cast_off();
    return game.status === Status.SAILING;
  }

  function primary_action() {
    if (card) return start_card();
    if (game.status === Status.READY || game.status === Status.PAUSED) return cast_off();
    if (game.status === Status.DONE && round?.ref.kind === RoundKind.LEVEL) return next_level();
    if (over) retry();
  }

  function set_sound(on: boolean) {
    settings_file.value.sound = on;
    if (!on) sounds.quiet();
  }

  function set_throttle(mode: ThrottleMode) {
    settings_file.value.throttle = mode;
    helm.reset();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (settings_panel?.matches(":popover-open")) return;
    const code = event.code;
    const on_button = target instanceof HTMLButtonElement;
    if (code === "Escape") {
      if (card) {
        event.preventDefault();
        close_card();
      } else if (game.status === Status.SAILING || game.status === Status.PAUSED) {
        event.preventDefault();
        toggle_pause();
      }
      return;
    }
    if (code === "Enter") {
      if (on_button) return;
      event.preventDefault();
      primary_action();
      return;
    }
    if (code === "Equal" || code === "NumpadAdd" || code === "Minus" || code === "NumpadSubtract") {
      event.preventDefault();
      zoom = clamp_zoom(zoom * (code === "Equal" || code === "NumpadAdd" ? 1.2 : 1 / 1.2));
      return;
    }
    if (over) {
      if (code === "KeyR" && !event.repeat) {
        event.preventDefault();
        retry();
      }
      return;
    }
    if (card || game.status === Status.PAUSED || (on_button && code === "Space")) return;
    const ahead = AHEAD_KEYS.has(code);
    const astern = ASTERN_KEYS.has(code);
    const turning = PORT_KEYS.has(code) || STARBOARD_KEYS.has(code);
    if (ahead || astern || turning || code === "Space" || code === "KeyC") {
      event.preventDefault();
      if (!engage()) return;
    }
    if (ahead || astern) {
      if (throttle === ThrottleMode.HOLD) helm.keys.add(code);
      else if (!event.repeat) helm.step_notch(ahead ? 1 : -1);
    } else if (turning) helm.keys.add(code);
    else if (code === "Space") helm.neutral();
    else if (code === "KeyC") helm.set_wheel(0);
  }
</script>

{#snippet stars_row(count: number, earned: boolean[] | null = null)}
  <span class="inline-flex items-center gap-0.5" aria-label="{count} of 3 stars">
    {#each [0, 1, 2] as i (i)}
      <StarIcon weight={(earned ? earned[i] : i < count) ? "fill" : "regular"} class={cn("size-4", (earned ? earned[i] : i < count) ? "text-warning" : "text-foreground/40")} />
    {/each}
  </span>
{/snippet}

{#snippet toolbar()}
  <span class="flex min-w-0 items-center gap-1.5 px-1.5 text-ui font-medium">
    <AnchorIcon weight="bold" class="size-4 shrink-0 text-primary" />
    <span class="truncate">{round ? round_title(round.ref) : "Harbour"}</span>
  </span>
  <Badge class="hidden @sm:inline-flex">{spec.name}</Badge>
  <div class="flex-1"></div>
  {#if round}<Button size="sm" variant="quiet" onclick={to_hub}>Harbour</Button>{/if}
  <SettingsPanel sound={settings.sound} {throttle} onsound={set_sound} onthrottle={set_throttle} onfocus={focus_board} bind:panel={settings_panel} />
  {#if round}
    <IconButton size="sm" class="hidden @md:inline-flex" label={game.status === Status.SAILING ? "Pause (Esc)" : "Resume (Esc)"} disabled={game.status !== Status.SAILING && game.status !== Status.PAUSED} onclick={toggle_pause}>
      {#if game.status === Status.SAILING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <IconButton size="sm" class="hidden @md:inline-flex" label="Restart" onclick={retry}>
      <ArrowCounterClockwiseIcon weight="bold" />
    </IconButton>
  {/if}
{/snippet}

{#snippet overlay()}
  <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
    <div class="flex min-w-0 flex-col items-start gap-1.5">
      <div class="flex items-center gap-1.5">
        {#if round}
          <IconButton
            size="sm"
            class="pointer-events-auto bg-background/85 backdrop-blur-[2px] @md:hidden pointer-coarse:size-11"
            label={game.status === Status.SAILING ? "Pause" : "Resume"}
            disabled={game.status !== Status.SAILING && game.status !== Status.PAUSED}
            onclick={toggle_pause}
          >
            {#if game.status === Status.SAILING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
          </IconButton>
        {/if}
        <div
          class={cn(
            "rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]",
            helm.shown > NEUTRAL ? "text-primary" : helm.shown < NEUTRAL ? "text-warning" : "text-foreground/80"
          )}
          aria-hidden="true"
        >
          {lever_name}{#if game.boat.gear === 0 && helm.shown !== NEUTRAL}<span class="text-foreground/65"> · shifting</span>{/if}
        </div>
        <SpeedChip speed={speed(game.boat)} unit="kn" />
      </div>
      {#if round && game.status !== Status.READY}
        <div class="flex max-w-full flex-wrap items-center gap-1.5">
          <div class="rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]" aria-hidden="true">
            {time}{#if par}&nbsp;<span class="text-foreground/65">/ {format_time(par)}</span>{/if}
          </div>
          <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 text-ui backdrop-blur-[2px]", bumps(game) > 0 ? "text-warning" : "text-foreground/80")} aria-hidden="true">{touches_text}</div>
        </div>
      {/if}
      {#if swapped}
        <p class="rounded-md bg-background/85 px-2 py-1 text-ui font-medium backdrop-blur-[2px]" role="status">Now sailing the {swapped}</p>
      {/if}
    </div>
    {#if hold_share > 0}
      <div class="flex shrink-0 items-center gap-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium text-success backdrop-blur-[2px]" role="status">
        <span class="hb-hold" style:--hold="{hold_share * 100}%" aria-hidden="true"></span>Holding
      </div>
    {:else if game.status === Status.LINES}
      <div class="shrink-0 rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium text-success backdrop-blur-[2px]" role="status">Lines going on</div>
    {/if}
  </div>

  {#if in_hub && !settings.seen_hint && !card}
    <p class="pointer-events-none absolute inset-x-2 bottom-2 mx-auto max-w-80 rounded-md bg-background/85 px-2 py-1 text-center text-ui text-foreground/80 backdrop-blur-[2px]">
      Sail through a numbered gate and stop to start a level. The boat shed, top left, swaps your boat.
    </p>
  {/if}

  {#if card}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      {@const level_scene = card.chart ? scene_of(card.ref, card.chart.attempt) : null}
      {@const card_best = progress.value.bests[round_key(card.ref)]}
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(card.ref)}
          <Badge tone="primary">{SPECS[card.ref.boat].name}</Badge>
        </p>
        <p class="text-ui text-foreground/80">
          {#if card.ref.kind === RoundKind.LEVEL || level_scene}{round_brief(card.ref, level_scene ?? scene_of(card.ref))}{:else}A new layout from today's seed.{/if}
        </p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-foreground/65 tabular-nums">
          {#if card_best}{@render stars_row(card_best.stars)} Best {format_time(card_best.ms)}{:else}Not docked yet{/if}
          {#if card.chart?.par}<span>· Par {format_time(card.chart.par)}</span>{/if}
        </p>
        {#if card.ref.kind === RoundKind.DAILY && card.ref.boat !== boat_id}<p class="text-2xs text-foreground/65">Today's daily is sailed in the {SPECS[card.ref.boat].name}.</p>{/if}
        {#if card.failed}<p class="text-2xs text-error">Couldn't chart this one. Try again.</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={close_card}>Not now</Button>
        <Button variant="primary" disabled={!card.chart} onclick={start_card}>
          {#if !card.chart && !card.failed}<Spinner label="Charting" />{/if}Start
        </Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="start" /><KeyHint key_name="Esc" text="sail on" />
      </p>
    </RoundCard>
  {:else if opening_daily}
    <BoardOverlay title="Charting today's berth">
      <Spinner label="Charting" />
    </BoardOverlay>
  {:else if round && game.status === Status.READY}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{round_title(round.ref)}</p>
        <p class="text-ui text-foreground/80">{round_brief(round.ref, game.scene)}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-foreground/65 tabular-nums">
          {#if best}{@render stars_row(best.stars)} Best {format_time(best.ms)}{:else}Not docked yet{/if}
          {#if par}<span>· Par {format_time(par)}</span>{/if}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="primary" onclick={cast_off}>Cast off</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="W" text="ahead" /><KeyHint key_name="S" text="astern" /><KeyHint key_name="A D" text="wheel" /><KeyHint key_name="Space" text="neutral" /><KeyHint key_name="Esc" text="pause" />
      </p>
      <p class="basis-full text-2xs text-foreground/65">
        {throttle === ThrottleMode.LEVER ? "The lever stays where you leave it: W and S move it a notch." : "Hold W or S for half ahead or astern."} Stop inside the berth, square to it, for a second and the crew put the lines on.
      </p>
    </RoundCard>
  {:else if game.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{time} · {touches_text}">
      <Button size="sm" variant="quiet" onclick={to_hub}>Harbour</Button>
      <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      <Button size="sm" variant="primary" onclick={cast_off}>Resume</Button>
    </BoardOverlay>
  {:else if game.status === Status.DONE && outcome}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Docked {@render stars_row(outcome.result.stars, [true, outcome.result.gentle, outcome.result.on_time])}
          {#if outcome.result.perfect}<Badge class="hb-pop" tone="success">Perfect</Badge>{/if}
          {#if outcome.improved}<Badge class="hb-pop" tone={outcome.first ? "neutral" : "primary"}>{outcome.first ? "First lines" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {format_time(outcome.result.ms, { tenths: true })}{par ? ` · par ${format_time(par)}` : ""} · {touches_text} · {Math.round(game.precision)}% precise
        </p>
        <p class="text-2xs text-foreground/65">
          {outcome.result.gentle ? "Every touch a kiss." : "A bump cost the gentle star."}
          {outcome.result.on_time ? "" : par ? " Over par." : ""}
          {game.precision >= PERFECT ? "" : " 95% precise is Perfect."}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="quiet" onclick={to_hub}>Harbour</Button>
        <Button variant={round?.ref.kind === RoundKind.LEVEL ? "quiet" : "primary"} onclick={retry}>Again</Button>
        {#if round?.ref.kind === RoundKind.LEVEL}<Button variant="primary" onclick={next_level}>{round.ref.level === LEVELS.length ? "Done" : "Next level"}</Button>{/if}
      </div>
    </RoundCard>
  {:else if game.status === Status.CRASHED}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{game.crash?.fendered ? "Hit the pontoon hard" : "Hit it hard"}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {game.crash ? `${(game.crash.speed * KNOT).toFixed(1)} kn into ${game.crash.fendered ? "a fender" : "a hard side"}` : ""} · {time}
        </p>
        <p class="text-2xs text-foreground/65">Under 0.3 kn is a kiss, under 1 kn a bump. A quay wall or someone's boat takes half that.</p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={to_hub}>Harbour</Button>
        <Button variant="primary" onclick={retry}>Try again</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="or" /><KeyHint key_name="R" text="tries again" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{round ? round_title(round.ref) : "Harbour"} · {spec.name}</span>
  <span class="tabular-nums">{Math.abs(knots).toFixed(1)} kn</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 1 ? " stbd" : wheel_degrees < -1 ? " port" : ""}</span>
  {#if round}<span class="tabular-nums">{time}</span>{/if}
  <span class="hidden @5xl:inline">W S lever · A D wheel · Space neutral · C centres · + − zoom</span>
{/snippet}

{#if !ready}
  <div class="h-full"></div>
{:else}
  <HarbourFrame
    label="Harbour. W and S work the lever, A and D the wheel, Space neutral, Escape pauses, Enter starts."
    {helm}
    {throttle}
    controls_idle={!!card || (!in_hub && game.status !== Status.SAILING && game.status !== Status.LINES)}
    {engage}
    onkeydown={on_keydown}
    onrelease={() => helm.release()}
    {toolbar}
    {overlay}
    {status}
    bind:board
    bind:canvas
    bind:size={board_size}
    bind:palette
    bind:zoom
    bind:stage_rect
    bind:wheel_box
    bind:lever_box
  />
{/if}

<style>
  :global(.hb-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }

  .hb-hold {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 999px;
    background: conic-gradient(var(--success) var(--hold), color-mix(in oklch, var(--success) 20%, transparent) 0);
  }
</style>
