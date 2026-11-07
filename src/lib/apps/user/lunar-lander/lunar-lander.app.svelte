<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Segmented, Spinner } from "$lib/core/components/ui";
  import { KeyHint, RoundCard } from "$kit/components/play2d";
  import { daily_seed, format_time, track_play } from "$kit/games";
  import { report_error } from "$kit/utils/report-error";
  import { clamp_zoom, ease, frame, OVERLAY_ASPECT, OVERLAY_GAP, type Camera, type Insets } from "$kit/games/play2d/camera";
  import { work_out_chart, type ChartJob } from "$kit/games/play2d/chart-job";
  import { frame_loop } from "$kit/games/play2d/loop";
  import { wrap_angle } from "$kit/games/play2d/geometry";
  import type { Palette } from "$kit/games/play2d/palette";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, RocketLaunch as RocketIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { ART } from "./core/art";
  import { at_gate, base_body, base_env, BASE_START, build_base, on_hangar_pad, type Gate, type GateId } from "./core/base";
  import { BODIES, BODY_IDS, BodyId } from "./core/bodies";
  import ChartWorker from "./core/chart.worker?worker";
  import { BURN_KEYS, Controls, LEFT_KEYS, LEVER_DOWN_KEYS, LEVER_UP_KEYS, RIGHT_KEYS } from "./core/controls.svelte";
  import { draw_frame, feet_ground, PUFF_LIFE, type Puff, type Scenery } from "./core/draw";
  import { advance, create_flight, CrashKind, Grade, Status, type Flight, type Touchdown } from "./core/flight";
  import { DEG, hover_throttle, parked_ship, Steering, type Env, type Ship } from "./core/lander";
  import { HOVER_NOTCH } from "./core/lever";
  import { env_of, LOAD_HOLD, result, settled_on, start_ship, step_mission, type Result, type Scene } from "./core/mission";
  import { MISSIONS } from "./core/missions";
  import { better, DEFAULT_PROGRESS, DEFAULT_SETTINGS, is_open, missions_done, PROGRESS_FILE, progress_schema, SETTINGS_FILE, settings_schema, unlocked_ships } from "./core/progress";
  import { daily_ref, mission_ref, round_brief, round_key, round_title, RoundKind, scene_of, type Chart, type RoundRef } from "./core/rounds";
  import { SHIP_IDS, ship_coefficients, ShipId, SPECS } from "./core/ships";
  import { Sounds } from "./core/sound";
  import { ground_at } from "./core/world";
  import LanderFrame from "./frame.svelte";
  import SettingsPanel from "./settings-panel.svelte";

  const { daily: daily_prop }: { daily?: string } = $props();

  const { app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const settings_file = storage.file(SETTINGS_FILE, DEFAULT_SETTINGS, settings_schema);
  const progress = storage.file(PROGRESS_FILE, DEFAULT_PROGRESS, progress_schema);

  interface Pending {
    gate: Gate | null;
    ref: RoundRef;
    chart: Chart | null;
    failed: boolean;
    locked: boolean;
  }

  interface Round {
    ref: RoundRef;
    chart: Chart;
    scene: Scene;
  }

  const LOOK_AHEAD = 1.1;
  const EASE_X = 5;
  const EASE_Y = 3;
  const JOLT_PX = 3;
  const JOLT_DECAY = 0.08;
  const BOUNDS = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 1e6 };
  const PROFILE_WIDTH = 190;
  const MIDDLE_ROW = 64;
  const BLURBS: Record<ShipId, string> = {
    [ShipId.LANDER]: "Main engine and RCS thrusters. Turns at 30°/s, forgiving legs.",
    [ShipId.PODS]: "Two engines, no thrusters: it turns by pushing one pod harder, only under power.",
    [ShipId.SHUTTLE]: "12 t lifter. Slow to spool, slow to turn, long legs, a deep tank.",
  };
  const CRASH_TITLES: Record<CrashKind, string> = {
    [CrashKind.HARD]: "Came down too hard",
    [CrashKind.SLID]: "Slid and tipped",
    [CrashKind.TILTED]: "Landed on a lean",
    [CrashKind.HULL]: "Hit the ground",
    [CrashKind.ROCK]: "Hit the rock",
    [CrashKind.LOST]: "Flew out of range",
  };
  const GRADE_NAMES: Record<Grade, string> = { [Grade.KISS]: "Kiss", [Grade.FIRM]: "Firm", [Grade.HEAVY]: "Heavy", [Grade.HARD]: "Hard" };
  const SHIP_PITCH: Record<ShipId, number> = { [ShipId.LANDER]: 1, [ShipId.PODS]: 1.25, [ShipId.SHUTTLE]: 0.7 };

  const settings = $derived(settings_file.value);
  const controls = new Controls();
  const sounds = new Sounds(() => settings_file.value.sound);
  const base = build_base();

  let ship_id = $state<ShipId>(ShipId.LANDER);
  let round = $state.raw<Round | null>(null);
  let card = $state.raw<Pending | null>(null);
  let outcome = $state.raw<{ result: Result; improved: boolean; first: boolean; unlocked: ShipId | null } | null>(null);
  let opening_daily = $state<string | null>(untrack(() => daily_prop ?? null));
  let stop = $state(0);
  let held = $state(0);
  let dismissed_gate: GateId | null = null;
  let counted_landing = 0;
  let job: ChartJob | null = null;
  const fly_id = $derived(round ? round.ref.ship : ship_id);
  const c = $derived(ship_coefficients(fly_id));
  const spec = $derived(SPECS[fly_id]);
  const in_base = $derived(round === null);
  const body = $derived(round ? BODIES[round.scene.body] : base_body(settings.body, settings.air));
  const terrain = $derived(round ? round.scene.terrain : base.terrain);
  let flight = $state.raw<Flight>(untrack(() => create_flight(parked_ship(ship_coefficients(ShipId.LANDER), BASE_START, 0, BODIES[BodyId.MOON]))));
  let ready = $state(false);
  let on_hangar = $state(false);
  let hangar_away = $state(false);
  let shown_touchdown = $state.raw<Touchdown | null>(null);
  let note = $state<string | null>(null);

  let board_size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let scenery = $state.raw<Scenery | null>(null);
  let zoom = $state(1);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let card_size = $state({ width: 0, height: 0 });
  let settings_panel: HTMLDivElement | undefined = $state();
  let left_box = $state({ width: 0, height: 0 });
  let right_box = $state({ width: 0, height: 0 });
  let stage_rect = $state<DOMRectReadOnly>();
  let hud_height = $state(0);
  let overlay_height = $state(0);

  let camera: Camera | null = null;
  let jolt = 0;
  let puffs: Puff[] = [];
  let touchdown_timer = 0;
  let note_timer = 0;

  const ship = $derived(flight.ship);
  const blocked = $derived(!win.is_visible || !win.is_focused);
  const flying = $derived(flight.status === Status.FLYING);
  const crashed = $derived(flight.status === Status.CRASHED);
  const done = $derived(flight.status === Status.DONE);
  const waiting = $derived(flight.status === Status.READY);
  const par = $derived(round?.chart.par ?? null);
  const best = $derived(round ? progress.value.bests[round_key(round.ref)] : undefined);
  const clock = $derived(format_time(flight.time * 1000, { tenths: true }));
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const env = $derived(env_for(ship, flight.time));
  const height = $derived(Math.max(0, feet_ground(ship, c, terrain)));
  const fuel_share = $derived(ship.fuel / spec.tank);
  const infinite = $derived(in_base && settings.infinite_fuel);
  const lean = $derived(wrap_angle(ship.angle));
  const tilt = $derived(Math.abs(lean) / DEG);
  const profile_width = $derived(Math.min(PROFILE_WIDTH, board_size.width * 0.42));
  const profile_shown = $derived(board_size.width >= 300);
  const tall = $derived(board_size.height > board_size.width * 1.3);
  const hangar_card = $derived(in_base && on_hangar && !hangar_away && !crashed && flight.status !== Status.PAUSED);
  const unlocked = $derived(unlocked_ships(progress.value.bests));
  const current_stop = $derived(round ? round.scene.stops[Math.min(stop, round.scene.stops.length - 1)] : null);
  const hover_now = $derived(hover_throttle(ship, c, body));
  const settled_pad = $derived(settled_on(ship, c, terrain));
  const off_pad = $derived(!!round && flying && ship.on.every(Boolean) && Math.hypot(ship.vx, ship.vy) < 0.15 && settled_pad !== current_stop?.pad);

  $effect(() => {
    controls.hover = hover_now;
  });

  $effect(() => {
    if (!settings_file.ready || ready) return;
    untrack(() => {
      ship_id = unlocked_ships(progress.value.bests).includes(settings_file.value.ship) ? settings_file.value.ship : ShipId.LANDER;
      to_base();
      ready = true;
      if (opening_daily) open_daily(opening_daily);
    });
  });

  $effect(() => () => {
    sounds.close();
    clearTimeout(touchdown_timer);
    clearTimeout(note_timer);
    job?.cancel();
  });

  $effect(() => {
    if (!blocked) return;
    controls.release();
    untrack(() => {
      if (flight.status === Status.FLYING) flight = { ...flight, status: Status.PAUSED };
    });
  });

  $effect(() =>
    win.on_back(() => {
      if (settings_panel?.matches(":popover-open")) return (settings_panel.hidePopover(), true);
      if (card) {
        close_card();
        return true;
      }
      if (flight.status === Status.PAUSED) {
        resume();
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
    if (!ready || !flying || blocked || card) return;
    const stop_loop = frame_loop(run, render, () => flight.status === Status.FLYING);
    return () => {
      stop_loop();
      sounds.quiet();
    };
  });

  $effect(() => {
    void [flight, palette, scenery, board_size, zoom, card_size.width, card_size.height, side_card, left_box.width, right_box.width, hud_height, on_hangar, ship_id, card, round, outcome, stop, settings.body];
    if (flying && !blocked && !card) return;
    untrack(() => render(0));
  });

  function env_for(s: Ship, time: number): Env {
    if (round) return env_of(round.scene, s, time);
    return base_env(base, body, settings.wind, s, time, settings.infinite_fuel);
  }

  function sideways(): boolean {
    return !!left_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function carded(): boolean {
    return crashed || done || waiting || !!card || hangar_card;
  }

  function control_insets(): Insets {
    const up = carded();
    const card_bottom = up && !side_card ? Math.min(card_size.height + 16, board_size.height * 0.6) : 0;
    const card_left = up && side_card ? Math.min(card_size.width + 16, board_size.width * 0.6) : 0;
    const insets = { top: Math.max(hud_height, profile_shown ? profile_width * 0.36 : 0) + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: right_box.width + OVERLAY_GAP, bottom: Math.max(card_bottom, MIDDLE_ROW), left: Math.max(card_left, left_box.width + OVERLAY_GAP) };
  }

  function target_camera(): Camera {
    const insets = control_insets();
    const side = Math.max(1, Math.min(board_size.width, board_size.height));
    const clear = Math.max(1, board_size.height - insets.top - insets.bottom);
    const width = Math.max(...spec.hull.map((p) => Math.abs(p.x))) * 2;
    // A bigger ship gets a wider view at every height, so the shuttle sits in frame like the lander does.
    const k = Math.max(1, width / 9);
    const grown = (tall ? 24 : 30) * k + 0.9 * Math.min(height, 80) + 0.4 * Math.max(0, height - 80);
    // The ground under the ship stays in sight up to a good height: a lander's pilot reads the gap to it.
    const fit = ((height + 14 * k) * side) / (0.7 * clear);
    const span = Math.min(520 * k, Math.max(grown, fit));
    const scale = side / (span / zoom);
    const high = clear / scale;
    const reach = span / 3;
    const ahead = Math.max(-reach, Math.min(reach, ship.vx * LOOK_AHEAD));
    const under = ground_at(terrain, ship.x);
    const centre = Math.max(under + 0.36 * high, ship.y - 0.36 * high);
    return frame(BOUNDS, { x: ship.x + ahead, y: -centre }, board_size.width, board_size.height, zoom, insets, span);
  }

  function waiting_cargo() {
    if (!round) return [];
    return round.scene.stops.flatMap((s, i) => (s.cargo && s.load > 0 && i >= stop ? [{ pad: s.pad, cargo: s.cargo }] : []));
  }

  function carrying() {
    if (!round) return null;
    let kind = null;
    for (let i = 0; i < stop && i < round.scene.stops.length; i++) {
      const s = round.scene.stops[i];
      if (s.load > 0) kind = s.cargo;
      if (s.load < 0) kind = null;
    }
    return kind;
  }

  function render(dt: number) {
    if (!canvas || !palette || !scenery || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const h = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== h) canvas.height = h;
    const target = target_camera();
    // A still frame while paused keeps the eased view: snapping to the target would jump, and jump back on resume.
    const held_view = camera && (flight.status === Status.PAUSED || flight.status === Status.FLYING) ? { ...camera, scale: target.scale } : target;
    camera = dt > 0 ? ease(camera, target, dt, EASE_X, EASE_Y) : held_view;
    jolt *= Math.exp(-dt / JOLT_DECAY);
    const time = performance.now() / 1000;
    const shake = { x: (jolt * Math.sin(time * 71) * 0.6) / camera.scale, y: (jolt * (Math.sin(time * 53) + 0.5 * Math.sin(time * 97))) / camera.scale };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_frame(ctx, {
      ship,
      c,
      art: ART[fly_id],
      terrain,
      body: body.id,
      view: { ...camera, x: camera.x + shake.x, y: camera.y + shake.y, width: board_size.width, height: board_size.height, dpr: board_size.dpr },
      palette,
      scenery,
      time,
      font: getComputedStyle(canvas).fontFamily,
      insets: control_insets(),
      puffs,
      profile: profile_shown,
      gates: in_base ? base.gates.map((gate) => ({ pad: gate.pad, label: gate_label(gate.id), stars: stars_for(gate.id), locked: typeof gate.id === "number" && !is_open(progress.value.bests, gate.id), daily: gate.id === RoundKind.DAILY })) : [],
      hangar: in_base ? { ...base.hangar, label: "HANGAR" } : null,
      waiting: waiting_cargo(),
      carrying: carrying(),
      target: current_stop && !done ? current_stop.pad : null,
      route: current_stop && !done ? current_stop.route : [],
    });
  }

  function today(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function gate_label(id: GateId): string {
    return id === RoundKind.RANDOM ? "Random" : id === RoundKind.DAILY ? "Daily" : String(id);
  }

  function ref_for(id: GateId): RoundRef {
    if (id === RoundKind.DAILY) {
      const day = today();
      return daily_ref(day, daily_seed(day, app_id));
    }
    if (id === RoundKind.RANDOM) return { kind: RoundKind.RANDOM, ship: ship_id, body: settings.body, seed: Math.floor(Math.random() * 2 ** 31) };
    return mission_ref(id);
  }

  function stars_for(id: GateId): number {
    const bests = progress.value.bests;
    if (id === RoundKind.DAILY) return bests[`daily-${today()}`]?.stars ?? 0;
    if (id === RoundKind.RANDOM) return bests[`random-${ship_id}`]?.stars ?? 0;
    return bests[`level-${id}`]?.stars ?? 0;
  }

  function show_note(text: string) {
    note = text;
    clearTimeout(note_timer);
    note_timer = window.setTimeout(() => (note = null), 5000);
  }

  function run(steps: number, dt: number) {
    let next = flight;
    let next_stop = stop;
    let next_held = held;
    for (let i = 0; i < steps && next.status === Status.FLYING; i++) {
      const before = next.ship.vy;
      if (round) {
        const stepped = step_mission({ scene: round.scene, flight: next, stop: next_stop, held: next_held }, controls.read(), c, dt);
        next = stepped.flight;
        next_stop = stepped.stop;
        next_held = stepped.held;
      } else next = advance(next, controls.read(), c, dt, env_for(next.ship, next.time), base.terrain);
      if (next.ship.on.some(Boolean)) jolt = Math.max(jolt, Math.min(12, JOLT_PX * Math.max(0, (next.ship.vy - before) / dt / body.g - 1.3)));
    }
    const span = steps * dt;
    for (const puff of puffs) puff.age += span;
    puffs = puffs.filter((puff) => puff.age < PUFF_LIFE);
    const low = feet_ground(next.ship, c, terrain);
    if (next.ship.spool > 0.15 && low < 18 && Math.random() < next.ship.spool * span * 14) {
      const x = next.ship.x + (Math.random() - 0.5) * 6;
      puffs.push({ x, y: ground_at(terrain, x), age: 0, size: 0.6 + next.ship.spool * (1 - low / 18), drift: Math.sign(x - next.ship.x) || 1 });
    }
    sounds.drone(next.ship.spool, next.ship.turning, SHIP_PITCH[fly_id], spec.steering === Steering.RCS);
    if (next === flight) return;
    const before = flight;
    flight = next;
    if (next_held !== held) held = next_held;
    if (next_stop !== stop) {
      const picked = round!.scene.stops[stop];
      stop = next_stop;
      if (picked.load !== 0 && next.status === Status.FLYING) {
        sounds.chime([520, 780]);
        show_note(picked.load > 0 ? `Loaded ${picked.cargo === "crew" ? "the crew" : "the crate"}: ${(picked.load / 1000).toFixed(1)} t more to lift.` : "Delivered.");
      }
    }
    if (next.touchdown && next.touchdown !== before.touchdown) touched(next.touchdown);
    if (next.landings > counted_landing && settled_on(next.ship, c, terrain) >= 0) {
      counted_landing = next.landings;
      landed(next.touchdown!);
    }
    if (next.status === Status.CRASHED) {
      controls.release();
      sounds.quiet();
      sounds.crash();
    }
    if (next.status === Status.DONE && before.status !== Status.DONE) finish();
    if (round) return;
    on_hangar = on_hangar_pad(base, next.ship, c);
    if (!on_hangar) hangar_away = false;
    if (next.flown && !settings_file.value.seen_hint) settings_file.value.seen_hint = true;
    const gate = at_gate(base, next.ship, c);
    if (!gate) dismissed_gate = null;
    else if (gate.id !== dismissed_gate && !card) open_card(gate);
  }

  function landed(touchdown: Touchdown) {
    const p = progress.value;
    const ships = p.ships_landed.includes(fly_id) ? p.ships_landed : [...p.ships_landed, fly_id];
    progress.value = { ...p, landings: p.landings + 1, ships_landed: ships };
    achievements.achieve("first-landing");
    achievements.progress("landings-25", p.landings + 1);
    achievements.progress("every-ship", ships.length);
    if (body.id === BodyId.EARTH) achievements.achieve("earth");
    if (body.rho > 0 && Math.abs(env.wind) >= 3) achievements.achieve("crosswind");
    if (touchdown.sink < 0.25 && touchdown.tilt < 1 && touchdown.off_centre < 1) achievements.achieve("soft-touch");
  }

  function open_card(gate: Gate | null, ref: RoundRef = ref_for(gate!.id)) {
    controls.release();
    sounds.quiet();
    const locked = ref.kind === RoundKind.LEVEL && !is_open(progress.value.bests, ref.level!);
    card = { gate, ref, chart: null, failed: false, locked };
    opening_daily = null;
    if (locked) return;
    chart_for(
      ref,
      (chart) => {
        if (card?.ref === ref) card = { ...card, chart };
      },
      () => {
        if (card?.ref === ref) card = { ...card, failed: true };
      }
    );
  }

  function chart_for(ref: RoundRef, ok: (chart: Chart) => void, failed: () => void) {
    job?.cancel();
    const current = work_out_chart(new ChartWorker(), ref, "The mission couldn't be flown");
    job = current;
    current.result.then(
      (chart) => {
        if (job !== current) return;
        job = null;
        if (chart.par === null && ref.kind !== RoundKind.LEVEL) return failed();
        ok(chart);
      },
      (reason: unknown) => {
        if (job !== current) return;
        job = null;
        report_error(app_id, "Couldn't fly the mission", reason);
        failed();
      }
    );
  }

  function close_card() {
    job?.cancel();
    job = null;
    if (card?.gate) dismissed_gate = card.gate.id;
    card = null;
    focus_board();
  }

  function begin(ref: RoundRef, chart: Chart) {
    const scene = scene_of(ref, chart.attempt);
    const ship_c = ship_coefficients(ref.ship);
    controls.reset(HOVER_NOTCH);
    sounds.quiet();
    puffs = [];
    camera = null;
    outcome = null;
    shown_touchdown = null;
    note = null;
    stop = 0;
    held = 0;
    counted_landing = 0;
    round = { ref, chart, scene };
    flight = create_flight(start_ship(scene, ship_c), Status.READY);
    card = null;
    on_hangar = false;
    focus_board();
  }

  function start_card() {
    if (card?.chart) begin(card.ref, card.chart);
  }

  function open_daily(day: string) {
    const ref = daily_ref(day, daily_seed(day, app_id));
    chart_for(
      ref,
      (chart) => {
        opening_daily = null;
        begin(ref, chart);
      },
      () => (opening_daily = null)
    );
  }

  function park(x: number) {
    const base_c = ship_coefficients(ship_id);
    const pad = base.terrain.pads.find((p) => x >= p.x0 && x <= p.x1);
    flight = create_flight(parked_ship(base_c, x, pad ? pad.y : ground_at(base.terrain, x), body));
    counted_landing = 0;
  }

  function to_hub() {
    const from = round?.ref;
    job?.cancel();
    round = null;
    outcome = null;
    card = null;
    note = null;
    controls.reset(0);
    sounds.quiet();
    puffs = [];
    camera = null;
    shown_touchdown = null;
    const id: GateId | undefined = from ? (from.kind === RoundKind.LEVEL ? from.level! : from.kind) : undefined;
    const gate = base.gates.find((each) => each.id === id);
    park(gate ? gate.x : BASE_START);
    dismissed_gate = gate?.id ?? null;
    on_hangar = !gate;
    hangar_away = false;
    focus_board();
  }

  function retry() {
    if (round) begin(round.ref, round.chart);
  }

  function next_mission() {
    if (!round || round.ref.kind !== RoundKind.LEVEL) return;
    const next = MISSIONS.find((mission) => mission.n === round!.ref.level! + 1);
    if (!next) return to_hub();
    const ref = mission_ref(next.n);
    card = { gate: null, ref, chart: null, failed: false, locked: false };
    chart_for(
      ref,
      (chart) => {
        if (card?.ref === ref) begin(ref, chart);
      },
      () => {
        if (card?.ref === ref) card = { ...card, failed: true };
      }
    );
  }

  function finish() {
    controls.release();
    if (!round) return;
    const before_ships = unlocked_ships(progress.value.bests);
    const run_result = result({ scene: round.scene, flight, stop, held }, round.chart.par);
    const key = round_key(round.ref);
    const before = progress.value.bests[key];
    const kept = better(before, { stars: run_result.stars, ms: run_result.ms });
    progress.value = { ...progress.value, bests: { ...progress.value.bests, [key]: kept.best } };
    const fresh = unlocked_ships(progress.value.bests).find((each) => !before_ships.includes(each)) ?? null;
    outcome = { result: run_result, improved: kept.improved, first: !before, unlocked: fresh };
    sounds.chime(run_result.stars === 3 ? [523, 659, 784] : [440, 660]);
    if (round.ref.kind === RoundKind.DAILY && round.ref.day) play.daily(round.ref.day, run_result.ms);
    if (missions_done(progress.value.bests) === MISSIONS.length) show_note("Every mission flown.");
  }

  function touched(touchdown: Touchdown) {
    sounds.touchdown(touchdown.sink);
    for (let i = 0; i < 4; i++) puffs.push({ x: touchdown.x + (i - 1.5) * 1.6, y: ground_at(terrain, touchdown.x), age: 0, size: Math.min(2, 0.6 + touchdown.sink), drift: i < 2 ? -1 : 1 });
    shown_touchdown = touchdown;
    clearTimeout(touchdown_timer);
    touchdown_timer = window.setTimeout(() => (shown_touchdown = null), 5000);
  }

  function to_base() {
    controls.reset(0);
    sounds.quiet();
    puffs = [];
    camera = null;
    shown_touchdown = null;
    park(BASE_START);
    on_hangar = true;
    hangar_away = false;
    focus_board();
  }

  function pick_ship(id: ShipId) {
    if (!unlocked.includes(id)) return;
    sounds.chime();
    if (id === ship_id) return;
    ship_id = id;
    settings_file.value.ship = id;
    camera = null;
    park(BASE_START);
  }

  function pick_body(id: BodyId) {
    settings_file.value.body = id;
    if (!in_base) return;
    sounds.chime([330, 495]);
    park(flight.ship.x);
  }

  function resume() {
    if (flight.status !== Status.PAUSED) return;
    flight = { ...flight, status: Status.FLYING };
    focus_board();
  }

  function toggle_pause() {
    if (flight.status === Status.FLYING) {
      flight = { ...flight, status: Status.PAUSED };
      controls.release();
      sounds.quiet();
    } else resume();
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function go() {
    if (flight.status !== Status.READY) return;
    flight = { ...flight, status: Status.FLYING };
    focus_board();
  }

  function engage(): boolean {
    if (card) return false;
    if (flight.status === Status.READY) go();
    return flight.status === Status.FLYING;
  }

  function lift_off() {
    hangar_away = true;
    focus_board();
  }

  function primary_action() {
    if (card) return start_card();
    if (hangar_card) return lift_off();
    if (flight.status === Status.READY) return go();
    if (flight.status === Status.PAUSED) return resume();
    if (round && done && round.ref.kind === RoundKind.LEVEL) return next_mission();
    if (round && (done || crashed)) return retry();
    if (crashed) to_base();
  }

  function set_sound(on: boolean) {
    settings_file.value.sound = on;
    if (!on) sounds.quiet();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (settings_panel?.matches(":popover-open")) return;
    const code = event.code;
    const on_button = target instanceof HTMLButtonElement;
    if (LEVER_UP_KEYS.has(code) || LEVER_DOWN_KEYS.has(code)) {
      event.preventDefault();
      if (!event.repeat && engage()) controls.step_notch(LEVER_UP_KEYS.has(code) ? 1 : -1);
      return;
    }
    if (event.ctrlKey) return;
    if (code === "Escape") {
      if (card) {
        event.preventDefault();
        close_card();
      } else if (flight.status === Status.FLYING || flight.status === Status.PAUSED) {
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
    if (code === "KeyR" && !event.repeat) {
      event.preventDefault();
      if (round) retry();
      else to_base();
      return;
    }
    if (hangar_card && /^Digit[1-9]$/.test(code) && !event.repeat) {
      const pick = SHIP_IDS[Number(code.slice(5)) - 1];
      if (pick) {
        event.preventDefault();
        pick_ship(pick);
      }
      return;
    }
    if (on_button && code === "Space") return;
    if (LEFT_KEYS.has(code) || RIGHT_KEYS.has(code) || BURN_KEYS.has(code)) {
      event.preventDefault();
      if (!engage()) return;
      controls.keys.add(code);
    }
  }
</script>

{#snippet toolbar()}
  <span class="flex min-w-0 items-center gap-1.5 px-1.5 text-ui font-medium">
    <RocketIcon weight="bold" class="size-4 shrink-0 text-primary" />
    <span class="truncate">{round ? round_title(round.ref) : "Lunar Lander"}</span>
  </span>
  <Badge class="hidden @sm:inline-flex">{spec.name} · {body.name}</Badge>
  <div class="flex-1"></div>
  {#if round}<Button size="sm" variant="quiet" onclick={to_hub}>Base</Button>{:else}<Button size="sm" variant="quiet" onclick={to_base}>Hangar</Button>{/if}
  <SettingsPanel
    sound={settings.sound}
    air={settings.air}
    wind={settings.wind}
    infinite_fuel={settings.infinite_fuel}
    onsound={set_sound}
    onair={(on) => (settings_file.value.air = on)}
    onwind={(on) => (settings_file.value.wind = on)}
    oninfinite={(on) => (settings_file.value.infinite_fuel = on)}
    onfocus={focus_board}
    bind:panel={settings_panel}
  />
  <IconButton size="sm" class="hidden @md:inline-flex" label={flying ? "Pause (Esc)" : "Resume (Esc)"} disabled={!flying && flight.status !== Status.PAUSED} onclick={toggle_pause}>
    {#if flying}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
  {#if round}
    <IconButton size="sm" class="hidden @md:inline-flex" label="Restart (R)" onclick={retry}>
      <ArrowCounterClockwiseIcon weight="bold" />
    </IconButton>
  {/if}
{/snippet}

{#snippet stars_row(count: number, earned: boolean[] | null = null)}
  <span class="inline-flex items-center gap-0.5" aria-label="{count} of 3 stars">
    {#each [0, 1, 2] as i (i)}
      <StarIcon weight={(earned ? earned[i] : i < count) ? "fill" : "regular"} class={cn("size-4", (earned ? earned[i] : i < count) ? "text-warning" : "text-foreground/40")} />
    {/each}
  </span>
{/snippet}

{#snippet chip(text: string, tone: string = "text-foreground/80", chars: number = 0)}
  <div
    class={cn("rounded-md bg-background/85 px-1.5 py-0.5 text-right font-mono text-ui tabular-nums backdrop-blur-[2px]", tone)}
    style:min-width={chars ? `calc(${chars}ch + 0.75rem)` : undefined}
    aria-hidden="true"
  >
    {text}
  </div>
{/snippet}

{#snippet overlay()}
  <div bind:clientHeight={overlay_height} class="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1.5" style:right="{profile_shown ? profile_width + 16 : 8}px">
    <!-- Only the instruments, each held at its widest, set the camera's top inset: a chip coming and going below them moved the view. -->
    <div bind:clientHeight={hud_height} class="flex max-w-full flex-wrap items-center gap-1.5">
      <IconButton
        size="sm"
        class="pointer-events-auto bg-background/85 backdrop-blur-[2px] @md:hidden pointer-coarse:size-11"
        label={flying ? "Pause" : "Resume"}
        disabled={!flying && flight.status !== Status.PAUSED}
        onclick={toggle_pause}
      >
        {#if flying}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
      </IconButton>
      <div
        class={cn(
          "grid rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]",
          controls.burning || controls.notch > HOVER_NOTCH ? "text-primary" : controls.notch < HOVER_NOTCH ? "text-warning" : "text-foreground/80"
        )}
        aria-hidden="true"
      >
        {#each [...controls.detents.map((detent) => detent.name), "Burn"] as name, i (name)}
          <span class={cn("[grid-area:1/1]", (controls.burning ? name !== "Burn" : i !== controls.notch) && "invisible")}>{name}</span>
        {/each}
      </div>
      {@render chip(infinite ? "Fuel ∞" : `Fuel ${Math.round(fuel_share * 100)}%`, !infinite && fuel_share < 0.15 ? "text-warning" : "text-foreground/80", 9)}
      {@render chip(`${height < 10 ? height.toFixed(1) : Math.round(height)} m`, undefined, 6)}
      {@render chip(`${ship.vy >= 0 ? "▲" : "▼"} ${Math.abs(ship.vy).toFixed(1)} m/s`, -ship.vy >= spec.safe.sink * 0.8 && height < 30 ? "text-warning" : "text-foreground/80", 10)}
      {@render chip(`${ship.vx >= 0 ? "▶" : "◀"} ${Math.abs(ship.vx).toFixed(1)} m/s`, Math.abs(ship.vx) >= spec.safe.slide && height < 10 ? "text-warning" : "text-foreground/80", 10)}
      {@render chip(`Tilt ${Math.round(tilt) === 0 ? "" : lean > 0 ? "◀ " : "▶ "}${Math.round(tilt)}°`, tilt >= spec.safe.tilt && height < 10 ? "text-warning" : "text-foreground/80", 10)}
      {#if round}
        <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", waiting && "invisible")} aria-hidden="true">
          {clock}{#if par}&nbsp;<span class="text-foreground/65">/ {format_time(par)}</span>{/if}
        </div>
      {/if}
    </div>
    <div class="flex max-w-full flex-wrap items-center gap-1.5" aria-hidden="true">
      {#if round && round.scene.stops.length > 1 && current_stop && !done}
        {@render chip(`Pad ${Math.min(stop + 1, round.scene.stops.length)} of ${round.scene.stops.length}${current_stop.load > 0 ? ` · pick up ${current_stop.cargo === "crew" ? "crew" : "crate"}` : current_stop.load < 0 ? " · deliver" : ""}`, "text-primary")}
      {/if}
      {#if held > 0 && current_stop && current_stop.load !== 0}{@render chip(`${current_stop.load > 0 ? "Loading" : "Unloading"} ${Math.round((held / LOAD_HOLD) * 100)}%`, "text-primary")}{/if}
      {#if off_pad}{@render chip("Not on the pad", "text-warning")}{/if}
      {#if ship.cargo > 0}{@render chip(`Cargo ${(ship.cargo / 1000).toFixed(1)} t`)}{/if}
      {#if body.rho > 0 && Math.abs(env.wind) >= 0.5}{@render chip(`Wind ${Math.abs(env.wind).toFixed(0)} m/s ${env.wind > 0 ? "▶" : "◀"}`)}{/if}
      {#if !infinite && ship.fuel <= 0}{@render chip("Out of fuel", "text-error")}{/if}
    </div>
    {#if note}
      <p class="max-w-84 rounded-md bg-background/85 px-2 py-1 text-ui font-medium backdrop-blur-[2px]" role="status">{note}</p>
    {/if}
    {#if shown_touchdown}
      <div
        class={cn(
          "rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]",
          shown_touchdown.grade === Grade.KISS ? "text-success" : shown_touchdown.grade === Grade.FIRM ? "text-primary" : "text-warning"
        )}
        role="status"
      >
        {GRADE_NAMES[shown_touchdown.grade]} · {shown_touchdown.sink.toFixed(1)} m/s{shown_touchdown.pad < 0 ? " · off the pads" : ""}
      </div>
    {/if}
  </div>

  {#if in_base && !settings.seen_hint && flying && !on_hangar && !card}
    <p
      class="pointer-events-none absolute left-2 mx-auto max-w-84 rounded-md bg-background/85 px-2 py-1 text-center text-ui text-foreground/80 backdrop-blur-[2px]"
      style:top="{overlay_height + 16 + (profile_shown && tall ? profile_width * 0.36 + 8 : 0)}px"
      style:right="{profile_shown && !tall ? profile_width + 16 : 8}px"
    >
      <span class="pointer-fine:hidden">Push the lever to Rise to lift off, Hover holds you still. The arrows on the right turn the ship; land on a pad to open its mission.</span>
      <span class="hidden pointer-fine:inline">W raises the lever a notch, S lowers it: Rise lifts off, Hover holds you still. A and D turn, Space burns full. Land on a pad to open its mission.</span>
    </p>
  {/if}

  {#if card}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      {@const card_best = progress.value.bests[round_key(card.ref)]}
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(card.ref)}
          <Badge tone="primary">{SPECS[card.ref.ship].name}</Badge>
          <Badge>{BODIES[card.ref.body].name}</Badge>
        </p>
        <p class="text-ui text-foreground/80">
          {#if card.locked}Finish mission {card.ref.level! - 1} first.{:else if card.ref.kind === RoundKind.LEVEL || card.chart}{round_brief(card.ref, card.chart?.attempt ?? 0)}{:else}A new mission from the seed.{/if}
        </p>
        {#if !card.locked}
          <p class="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-foreground/65 tabular-nums">
            {#if card_best}{@render stars_row(card_best.stars)} Best {format_time(card_best.ms)}{:else}Not flown yet{/if}
            {#if card.chart?.par}<span>· Par {format_time(card.chart.par)}</span>{/if}
          </p>
        {/if}
        {#if card.failed}<p class="text-2xs text-error">Couldn't fly this one. Try again.</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={close_card}>Not now</Button>
        {#if !card.locked}
          <Button variant="primary" disabled={!card.chart} onclick={start_card}>
            {#if !card.chart && !card.failed}<Spinner label="Charting" />{/if}Start
          </Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        {#if !card.locked}<KeyHint key_name="Enter" text="start" />{/if}<KeyHint key_name="Esc" text="not now" />
      </p>
    </RoundCard>
  {:else if opening_daily}
    <BoardOverlay title="Charting today's mission">
      <Spinner label="Charting" />
    </BoardOverlay>
  {:else if round && waiting}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">{round_title(round.ref)} <Badge tone="primary">{spec.name}</Badge> <Badge>{body.name}</Badge></p>
        <p class="text-ui text-foreground/80">{round_brief(round.ref, round.chart.attempt)}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-foreground/65 tabular-nums">
          {#if best}{@render stars_row(best.stars)} Best {format_time(best.ms)}{:else}Not flown yet{/if}
          {#if par}<span>· Par {format_time(par)}</span>{/if}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="primary" onclick={go}>Fly</Button>
      </div>
      <p class="basis-full text-2xs text-foreground/65">
        {round.scene.stops.length > 1 ? "Settle on each pad in turn." : "Settle on the pad."} Stars: done, gentle (one kiss on each pad, under 0.5 m/s), under par.
      </p>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="fly" /><KeyHint key_name="W S" text="lever" /><KeyHint key_name="A D" text="turn" /><KeyHint key_name="Space" text="full burn" />
      </p>
    </RoundCard>
  {:else if round && done && outcome}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          Down and settled
          {@render stars_row(outcome.result.stars, [true, outcome.result.gentle, outcome.result.on_time])}
          {#if outcome.improved}<Badge class="ll-pop" tone={outcome.first ? "neutral" : "primary"}>{outcome.first ? "First time" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {format_time(outcome.result.ms, { tenths: true })}{par ? ` · par ${format_time(par)}` : ""}{#if flight.touchdown}&nbsp;· {GRADE_NAMES[flight.touchdown.grade]} {flight.touchdown.sink.toFixed(1)} m/s{/if}
        </p>
        <p class="text-2xs text-foreground/65">
          {outcome.result.gentle ? "" : "One kiss on each pad, under 0.5 m/s and no bounce, for the gentle star."}
          {outcome.result.on_time ? "" : par ? " Over par." : ""}
        </p>
        {#if outcome.unlocked}<p class="text-2xs font-medium text-primary">{SPECS[outcome.unlocked].name} unlocked: fly it at the base.</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="quiet" onclick={to_hub}>Base</Button>
        <Button variant={round.ref.kind === RoundKind.LEVEL ? "quiet" : "primary"} onclick={retry}>Again</Button>
        {#if round.ref.kind === RoundKind.LEVEL}<Button variant="primary" onclick={next_mission}>{round.ref.level === MISSIONS.length ? "Done" : "Next mission"}</Button>{/if}
      </div>
    </RoundCard>
  {:else if crashed && flight.crash}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{CRASH_TITLES[flight.crash.kind]}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {flight.crash.sink.toFixed(1)} m/s down{flight.touchdown ? ` · ${flight.touchdown.slide.toFixed(1)} m/s sideways · tilt ${Math.round(flight.touchdown.tilt)}°` : ""}{round ? ` · ${clock}` : ""}
        </p>
        <p class="text-2xs text-foreground/65">
          {#if flight.crash.kind === CrashKind.HARD}The {spec.name.toLowerCase()}'s legs take {spec.safe.sink} m/s. Sink on the lever's Sink notch and come back to Hover near the ground.{:else if flight.crash.kind === CrashKind.SLID}Stop sliding before the feet touch: {spec.safe.slide} m/s sideways tips it over.{:else if flight.crash.kind === CrashKind.TILTED}Level off before touchdown: {spec.safe.tilt}° is the most the legs take.{:else if flight.crash.kind === CrashKind.ROCK}Rock is solid. Come in lower and slower under the roof.{:else if flight.crash.kind === CrashKind.LOST}The mission is behind you: turn back toward the pads.{:else}The ship met the ground off its legs.{/if}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if round}
          <Button variant="quiet" onclick={to_hub}>Base</Button>
          <Button variant="primary" onclick={retry}>Try again</Button>
        {:else}
          <Button variant="primary" onclick={to_base}>Back to the hangar</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text={round ? "tries again" : "back to the hangar"} />
      </p>
    </RoundCard>
  {:else if flight.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{height.toFixed(0)} m · fuel {infinite ? '∞' : `${Math.round(fuel_share * 100)}%`}{round ? ` · ${clock}` : ''}">
      {#if round}
        <Button size="sm" variant="quiet" onclick={to_hub}>Base</Button>
        <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      {:else}
        <Button size="sm" variant="quiet" onclick={to_base}>Hangar</Button>
      {/if}
      <Button size="sm" variant="primary" onclick={resume}>Resume</Button>
    </BoardOverlay>
  {:else if hangar_card}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 basis-full">
        <p class="text-base font-semibold">Hangar</p>
        <p class="text-ui text-foreground/80">Pick a ship and a body for free flight. Missions {missions_done(progress.value.bests)} of {MISSIONS.length} flown.</p>
      </div>
      <div class={cn("grid basis-full gap-1.5", side_card && board_size.height >= 480 ? "grid-cols-1" : "grid-cols-3")} role="group" aria-label="Ship">
        {#each SHIP_IDS as each, i (each)}
          {@const open = unlocked.includes(each)}
          {@const from = MISSIONS.find((mission) => mission.ship === each)}
          <Button
            class="h-auto min-h-11 flex-col items-start gap-0 py-1.5 text-left whitespace-normal pointer-coarse:h-auto"
            variant={each === ship_id ? "primary" : "quiet"}
            aria-pressed={each === ship_id}
            disabled={!open}
            onclick={() => pick_ship(each)}
          >
            <span class="flex items-center gap-1.5 font-semibold"><span class="hidden font-mono text-2xs opacity-70 pointer-fine:inline">{i + 1}</span>{SPECS[each].name}</span>
            <span class={cn("ll-blurb text-2xs font-normal opacity-80", side_card && board_size.height < 480 && "hidden")}>{open ? BLURBS[each] : `Unlocks with mission ${from?.n}.`}</span>
          </Button>
        {/each}
      </div>
      <Segmented size="sm" class="flex basis-full [&>label]:flex-1 [&>label]:justify-center" label="Body" options={BODY_IDS.map((id) => ({ value: id, label: BODIES[id].name }))} bind:value={() => settings.body, pick_body} />
      <div class="ml-auto flex shrink-0">
        <Button variant="primary" onclick={lift_off}>Lift off</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="1–{SHIP_IDS.length}" text="pick" /><KeyHint key_name="Enter" text="lift off" /><KeyHint key_name="W" text="lever up" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{round ? round_title(round.ref) : "Base"} · {spec.name} · {body.name}</span>
  <span class="tabular-nums">{Math.round(height)} m</span>
  <span class="tabular-nums">{Math.hypot(ship.vx, ship.vy).toFixed(1)} m/s</span>
  <span class="tabular-nums pointer-coarse:hidden">Hover at {Math.round(hover_now * 100)}%</span>
  <span class="hidden @5xl:inline">W S lever · Space full burn · A D turn · R {round ? "restart" : "hangar"} · Esc pause</span>
{/snippet}

{#if !ready}
  <div class="h-full"></div>
{:else}
  <LanderFrame
    label="Lunar Lander. W and S move the throttle lever, Space burns full, A and D turn, Escape pauses."
    {controls}
    split={spec.steering === Steering.SPLIT}
    controls_idle={crashed || done || waiting || !!card || hangar_card || flight.status === Status.PAUSED}
    {engage}
    onkeydown={on_keydown}
    onrelease={() => controls.release()}
    {toolbar}
    {overlay}
    {status}
    bind:board
    bind:canvas
    bind:size={board_size}
    bind:palette
    bind:scenery
    bind:zoom
    bind:stage_rect
    bind:left_box
    bind:right_box
  />
{/if}

<style>
  :global(.ll-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }

  @container ll-app (height < 30rem) {
    .ll-blurb {
      display: none;
    }
  }
</style>
