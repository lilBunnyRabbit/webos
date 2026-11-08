<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton, Spinner } from "$lib/core/components/ui";
  import { KeyHint, RoundCard, SpeedChip } from "$kit/components/play2d";
  import { daily_seed, format_time, track_play } from "$kit/games";
  import { report_error } from "$kit/utils/report-error";
  import { clamp_zoom, ease, frame, OVERLAY_ASPECT, OVERLAY_GAP, type Camera, type Insets } from "$kit/games/play2d/camera";
  import { frame_loop } from "$kit/games/play2d/loop";
  import type { Palette } from "$kit/games/play2d/palette";
  import { AirplaneTilt as AirplaneIcon, ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon, Star as StarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { random_seed } from "$lib/core/utils/random";
  import { ART } from "./core/art";
  import { COCKPITS } from "./core/cockpit";
  import { BRAKE_KEYS, Controls, DOWN_KEYS, LEFT_KEYS, PitchMode, RIGHT_KEYS, THROTTLE_DOWN_KEYS, THROTTLE_UP_KEYS, UP_KEYS } from "./core/controls.svelte";
  import { draw_frame, PUFF_LIFE, type Puff, type Scenery } from "./core/draw";
  import { work_out_chart, type ChartJob } from "$kit/games/play2d/chart-job";
  import ChartWorker from "./core/chart.worker?worker";
  import { ground_at, strip_ahead } from "./core/course";
  import { at_gate, build_field, in_hangar, runway_ahead, surface_roll, WRAP, type Gate, type GateId } from "./core/field";
  import { advance, buffet, CrashKind, create_flight, Grade, Status, stall_warning, wheel_height, type Flight, type Touchdown } from "./core/flight";
  import { track } from "./core/levels";
  import { air_of, create_plane, Engine, facing, G, GearLayout, GROUND_TURN_SPEED, ground_speed, turn_left, type Env, type Plane } from "./core/plane";
  import { PLANE_IDS, plane_coefficients, PlaneId, SPECS } from "./core/planes";
  import { better, DEFAULT_PROGRESS, levels_done, PROGRESS_FILE, progress_schema } from "./core/progress";
  import { Failure, powered, result, round_env, start_plane, step_round, type Result, type Scene } from "./core/round";
  import { daily_ref, round_brief, round_key, round_title, RoundKind, scene_of, type Chart, type RoundRef } from "./core/rounds";
  import { air_at, gentle_weather } from "./core/weather";
  import { winch_pull } from "./core/winch";
  import { DEFAULT_SETTINGS, SETTINGS_FILE, settings_schema } from "./core/settings";
  import { Sounds } from "./core/sound";
  import AirfieldFrame from "./frame.svelte";
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
  }

  interface Round {
    ref: RoundRef;
    chart: Chart;
    scene: Scene;
  }
  const KNOT = 1.943844;
  const LOOK_AHEAD = 1.2;
  /** The camera follows height slower than distance, so the plane is seen to sink, float and balloon in the frame. */
  const EASE_X = 6;
  const EASE_Y = 2.9;
  /** A jolt's shake in CSS pixels per g over 1 g, and how fast it dies away. */
  const JOLT_PX = 3;
  const JOLT_DECAY = 0.08;
  const BOUNDS = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 6 };
  const PROFILE_WIDTH = 190;
  const MIN_CIRCUIT_PX = 55;
  const MAX_PLANE_PX = 80;
  const MIN_PLANE_PX = 35;
  // Held sideways the flaps, turn, trim and brake buttons float in one row along the board's bottom edge.
  const MIDDLE_ROW = 64;
  const BLURBS: Record<PlaneId, string> = {
    [PlaneId.TRAINER]: "Taildragger trainer. Stalls near 35 kn, floats, forgiving.",
    [PlaneId.STOL]: "Bush plane, big flaps and tyres. Flies at 25 kn, stops in 40 m.",
    [PlaneId.AIRLINER]: "70 t twin jet. Slow to spool and to pitch; spoilers, reverse.",
    [PlaneId.GLIDER]: "No engine, 35 to 1. Winch launch, find the thermals.",
  };
  const SWAP_NOTES: Record<PlaneId, string> = {
    [PlaneId.TRAINER]: "",
    [PlaneId.STOL]: "Four flap notches: Full flaps and it hangs in the air near 25 kn.",
    [PlaneId.AIRLINER]: "Below Idle the lever opens the spoilers, then reverse on the ground. The engines take seconds to answer.",
    [PlaneId.GLIDER]: "No engine: the lever works the airbrakes. Hold A or D (or ◀ ▶) and the crew walk it; launch on the winch from the runway.",
  };
  const HINTS: Record<PlaneId, { touch: string; keys: string }> = {
    [PlaneId.TRAINER]: {
      touch: "Push the throttle up and roll down the runway. It lifts off by itself near 45 kn.",
      keys: "Shift opens the throttle a notch. Roll down the runway: it lifts off by itself near 45 kn.",
    },
    [PlaneId.STOL]: {
      touch: "Flaps down twice, throttle full: it leaps off near 38 kn.",
      keys: "F twice for flaps 2, Shift to full: it leaps off near 38 kn.",
    },
    [PlaneId.AIRLINER]: {
      touch: "Flaps 2, lever to TOGA and wait for the engines. Near 145 kn pull gently: it won't rotate by itself.",
      keys: "F twice for flaps 2, Shift up to TOGA and wait for the engines. Near 145 kn pull gently: it won't rotate by itself.",
    },
    [PlaneId.GLIDER]: {
      touch: "No engine: Winch launch tows it up off the runway, the lever works the airbrakes.",
      keys: "No engine: L starts the winch launch from the runway, Shift and Ctrl work the airbrakes.",
    },
  };
  const CRASH_TITLES: Record<CrashKind, string> = {
    [CrashKind.HARD]: "Landed too hard",
    [CrashKind.NOSE_OVER]: "Nosed over",
    [CrashKind.POD]: "Engine pod struck",
    [CrashKind.GROUND]: "Hit the ground",
    [CrashKind.OBSTACLE]: "Hit an obstacle",
    [CrashKind.WATER]: "In the water",
    [CrashKind.STALL]: "Stalled too low",
  };
  const FAILURE_TITLES: Record<Exclude<Failure, typeof Failure.CRASH>, string> = {
    [Failure.OFF_STRIP]: "Stopped off the strip",
    [Failure.TAIL_STRIKE]: "Tail strike",
    [Failure.STALLED]: "Stalled on the climb",
  };
  /** The winch drum stands beside the runway, a cable length from its threshold. */
  const DRUM = 1350;
  const CREW_PACE = 1.6;
  const GRADE_NAMES: Record<Grade, string> = { [Grade.KISS]: "Kiss", [Grade.FIRM]: "Firm", [Grade.HEAVY]: "Heavy", [Grade.HARD]: "Hard" };

  const settings = $derived(settings_file.value);
  const controls = new Controls(() => settings_file.value.pitch, COCKPITS[PlaneId.TRAINER]);
  const sounds = new Sounds(() => settings_file.value.sound);
  const field = build_field();
  const weather = gentle_weather(random_seed(), WRAP, field.runway);

  let plane_id = $state<PlaneId>(PlaneId.TRAINER);
  let round = $state.raw<Round | null>(null);
  let card = $state.raw<Pending | null>(null);
  let failure = $state<Failure | null>(null);
  let outcome = $state.raw<{ result: Result; improved: boolean; first: boolean } | null>(null);
  let opening_daily = $state<string | null>(untrack(() => daily_prop ?? null));
  /** Seconds stopped so far in a landing round. */
  let held = 0;
  /** A gate whose card was closed: it opens again once the plane has left it. */
  let dismissed_gate: GateId | null = null;
  let job: ChartJob | null = null;
  const fly_id = $derived(round ? round.ref.plane : plane_id);
  const c = $derived(round ? powered(plane_coefficients(round.ref.plane), round.scene) : plane_coefficients(plane_id));
  const spec = $derived(SPECS[fly_id]);
  const cockpit = $derived(COCKPITS[fly_id]);
  const in_hub = $derived(round === null);
  let flight = $state.raw<Flight>(untrack(() => create_flight(create_plane(plane_coefficients(PlaneId.TRAINER), field.start))));
  let ready = $state(false);
  let in_hangar_now = $state(false);
  /** The hangar card was put away with Taxi out: it comes back once the plane has left the hangar. */
  let hangar_away = $state(false);
  let shown_touchdown = $state.raw<Touchdown | null>(null);
  /** Where the winch drum is while it pulls, metres along the world; null with the cable off. */
  let winch_drum = $state<number | null>(null);
  let swapped = $state<PlaneId | null>(null);

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
  let swap_timer = 0;

  const plane = $derived(flight.plane);
  const blocked = $derived(!win.is_visible || !win.is_focused);
  const flying = $derived(flight.status === Status.FLYING);
  const crashed = $derived(flight.status === Status.CRASHED);
  const done = $derived(flight.status === Status.DONE);
  const waiting = $derived(flight.status === Status.READY);
  const par = $derived(round?.chart.par ?? null);
  const best = $derived(round ? progress.value.bests[round_key(round.ref)] : undefined);
  const clock = $derived(format_time(flight.time * 1000, { tenths: true }));
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const env = $derived(env_for(plane, flight.time));
  const air = $derived(air_of(plane, c, env));
  const altitude = $derived(wheel_height(plane, c, env));
  const stall = $derived(stall_warning(plane, c, env));
  const wind_along = $derived(env.wind * facing(plane));
  const drum_near = $derived(DRUM + WRAP * Math.round((plane.x - DRUM) / WRAP));
  const can_winch = $derived(in_hub && spec.engine === Engine.NONE && on_ground_of(plane) && Math.abs(ground_speed(plane)) < 1 && facing(plane) > 0 && drum_near - plane.x > 400);
  const turning = $derived(turn_left(plane, controls.facing) !== 0);
  const profile_width = $derived(Math.min(PROFILE_WIDTH, board_size.width * 0.42));
  const profile_shown = $derived(board_size.width >= 300);
  // A tall board has sky to spare: the plane comes in closer, the ground sits lower than the middle but off the bottom edge, and the hint goes under the profile.
  const tall = $derived(board_size.height > board_size.width * 1.3);
  const to_runway = $derived(round ? (round.scene.clear ? null : strip_ahead(round.scene.course, round.scene.strip, plane.x, facing(plane))) : runway_ahead(field, plane.x, facing(plane)));
  const on_ground = $derived(on_ground_of(plane));
  /** The facing only takes below taxi speed, where the ground pivot works; faster, a pending turn would fire at the next landing. */
  const can_turn = $derived(on_ground && Math.abs(ground_speed(plane)) < GROUND_TURN_SPEED);
  const hangar_card = $derived(in_hub && in_hangar_now && !hangar_away && !crashed && flight.status !== Status.PAUSED);

  $effect(() => {
    if (!settings_file.ready || ready) return;
    untrack(() => {
      plane_id = settings_file.value.plane;
      controls.fit(COCKPITS[plane_id], 1);
      to_apron();
      ready = true;
      if (opening_daily) open_daily(opening_daily);
    });
  });

  $effect(() => () => {
    sounds.close();
    clearTimeout(touchdown_timer);
    clearTimeout(swap_timer);
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
    const stop = frame_loop(run, render, () => flight.status === Status.FLYING);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  $effect(() => {
    void [flight, palette, scenery, board_size, zoom, card_size.width, card_size.height, side_card, left_box.width, right_box.width, hud_height, in_hangar_now, plane_id, card, round, outcome];
    if (flying && !blocked && !card) return;
    untrack(() => render(0));
  });

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
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: right_box.width + OVERLAY_GAP, bottom: Math.max(card_bottom, MIDDLE_ROW), left: Math.max(card_left, left_box.width + OVERLAY_GAP) };
  }

  /** The fewest pixels the plane may shrink to, so it stays readable in the circuit: 14 % of the board's shorter side (55 to 80), easing to 35 between 150 and 400 m. */
  function plane_pixels(side: number, agl: number): number {
    const circuit = Math.min(MAX_PLANE_PX, Math.max(MIN_CIRCUIT_PX, side * 0.14));
    return Math.max(MIN_PLANE_PX, circuit - ((circuit - MIN_PLANE_PX) * Math.max(0, agl - 150)) / 250);
  }

  function target_camera(): Camera {
    const insets = control_insets();
    const agl = wheel_height(plane, c, env);
    const side = Math.max(1, Math.min(board_size.width, board_size.height));
    // A bigger plane gets a wider view at every height, so the airliner sits in frame like the trainer does.
    const k = Math.max(1, spec.length / 12);
    const span = Math.min(420 * k, (tall ? 26 : 34) * k + 1.2 * Math.min(agl, 80 * k) + 0.35 * Math.max(0, agl - 80 * k), (side * spec.length) / plane_pixels(side, agl));
    const scale = side / (span / zoom);
    const high = (board_size.height - insets.top - insets.bottom) / scale;
    const reach = span / 3;
    const ahead = Math.max(-reach, Math.min(reach, plane.vx * LOOK_AHEAD));
    const ground = ground_under(plane.x);
    const focus = { x: plane.x + ahead, y: -Math.max(plane.h, ground + (tall ? 0.14 : 0.32) * high) };
    return frame(BOUNDS, focus, board_size.width, board_size.height, zoom, insets, span);
  }

  function render(dt: number) {
    if (!canvas || !palette || !scenery || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    // A still frame while paused keeps the eased view: snapping to the target would jump, and jump back on resume.
    const held_view = camera && (flight.status === Status.PAUSED || flight.status === Status.FLYING) ? { ...camera, scale: target.scale } : target;
    camera = dt > 0 ? ease(camera, target, dt, EASE_X, EASE_Y) : held_view;
    jolt *= Math.exp(-dt / JOLT_DECAY);
    const time = performance.now() / 1000;
    const shake_px = jolt + (flight.status === Status.FLYING ? buffet(plane, c, env) * 1.6 : 0);
    const shake = {
      x: (shake_px * Math.sin(time * 71) * 0.6) / camera.scale,
      y: (shake_px * (Math.sin(time * 53) + 0.5 * Math.sin(time * 97))) / camera.scale,
    };
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_frame(ctx, {
      plane,
      c,
      field,
      view: { ...camera, x: camera.x + shake.x, y: camera.y + shake.y, width: board_size.width, height: board_size.height, dpr: board_size.dpr },
      palette,
      scenery,
      time: performance.now() / 1000,
      font: getComputedStyle(canvas).fontFamily,
      insets: control_insets(),
      puffs,
      hangar_label: "Hangar",
      profile: profile_shown,
      art: ART[fly_id],
      env,
      weather: round ? round.scene.course.weather : weather,
      wrap: round ? round.scene.course.wrap : WRAP,
      sock_wind: round ? round_env(round.scene, { ...plane, x: round.scene.strip.x0, h: ground_under(round.scene.strip.x0) + 6 }, flight.time).wind : air_at(weather, field.windsock, 6, flight.time, WRAP).wind,
      winch: in_hub && spec.engine === Engine.NONE ? { drum: winch_drum ?? drum_near, on: winch_drum !== null } : null,
      profile_size: { reach: 2700, top: 300 * Math.max(1, spec.cruise / 60) },
      ground_at: ground_under,
      world: round
        ? {
            course: round.scene.course,
            target: round.scene.strip,
            start_x: round.scene.start.x,
            slope: round.scene.slope,
            clear: round.scene.clear,
            top: ground_under(round.scene.start.x) + round.scene.start.agl + 60,
          }
        : null,
      gates: field.gates.map((gate) => ({ x: gate.x, label: gate_label(gate.id), stars: stars_for(gate.id), daily: gate.id === RoundKind.DAILY })),
    });
  }

  function ground_under(x: number): number {
    return round ? ground_at(round.scene.course, x) : 0;
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
    if (id === RoundKind.RANDOM) return { kind: RoundKind.RANDOM, plane: plane_id, seed: Math.floor(Math.random() * 2 ** 31) };
    return { kind: RoundKind.LEVEL, plane: plane_id, level: id };
  }

  function stars_for(id: GateId): number {
    const bests = progress.value.bests;
    if (id === RoundKind.DAILY) return bests[`daily-${today()}`]?.stars ?? 0;
    if (id === RoundKind.RANDOM) return bests[`random-${plane_id}`]?.stars ?? 0;
    return bests[`level-${plane_id}-${id}`]?.stars ?? 0;
  }

  function on_ground_of(p: Plane): boolean {
    return p.main_on || p.aux_on;
  }

  function env_for(p: Plane, time: number): Env {
    if (round) return round_env(round.scene, p, time);
    const at = air_at(weather, p.x, Math.max(0, p.h), time, WRAP);
    return { wind: at.wind, updraft: at.updraft, roll: surface_roll(field, p.x) };
  }

  function toggle_winch() {
    if (winch_drum !== null) winch_drum = null;
    else if (can_winch) {
      winch_drum = drum_near;
      controls.set_notch(controls.cockpit.idle);
    }
  }

  function run(steps: number, dt: number) {
    let next = flight;
    for (let i = 0; i < steps && next.status === Status.FLYING; i++) {
      controls.step(dt);
      const before = next.plane.vy;
      if (round) {
        const stepped = step_round({ scene: round.scene, flight: next, held, failure }, controls.read(), c, dt);
        next = stepped.flight;
        held = stepped.held;
        failure = stepped.failure;
      } else {
        let at = env_for(next.plane, next.time);
        if (winch_drum !== null) {
          const pull = winch_pull(next.plane, c, winch_drum, 0, at);
          if (pull) at = { ...at, pull };
          else winch_drum = null;
        } else if (spec.engine === Engine.NONE && on_ground_of(next.plane) && controls.walk === facing(next.plane)) {
          // No engine to taxi on: the ground crew walk the glider along at a walking pace.
          const walk = controls.walk;
          at = { ...at, pull: { x: walk * c.mass * 1.2 * Math.max(0, Math.min(1, (CREW_PACE - next.plane.vx * walk) / CREW_PACE)), y: 0 } };
        }
        next = advance(next, controls.read(), c, dt, at);
      }
      if (!on_ground_of(next.plane) && controls.facing !== facing(next.plane)) controls.facing = facing(next.plane);
      if (on_ground_of(next.plane)) jolt = Math.max(jolt, Math.min(12, JOLT_PX * Math.max(0, (next.plane.vy - before) / dt / G - 0.3)));
    }
    const span = steps * dt;
    for (const puff of puffs) puff.age += span;
    puffs = puffs.filter((puff) => puff.age < PUFF_LIFE);
    const env_now = env_for(next.plane, next.time);
    const air_now = air_of(next.plane, c, env_now);
    sounds.drone(round?.scene.power === 0 ? Engine.NONE : spec.engine, next.plane.spool, air_now.speed / spec.cruise, stall_warning(next.plane, c, env_now), buffet(next.plane, c, env_now), air_now.speed);
    if (next === flight) return;
    const before = flight;
    flight = next;
    if (next.touchdown && next.touchdown !== before.touchdown) touched(next.touchdown);
    if (next.status === Status.CRASHED) {
      winch_drum = null;
      controls.release();
      sounds.quiet();
      sounds.crash();
    }
    if (next.status === Status.DONE && before.status !== Status.DONE) finish();
    if (round) return;
    in_hangar_now = in_hangar(field, next.plane);
    if (!in_hangar_now) hangar_away = false;
    if (next.flown && !settings_file.value.seen_hint) settings_file.value.seen_hint = true;
    const gate = at_gate(field, next.plane);
    if (!gate) dismissed_gate = null;
    else if (gate.id !== dismissed_gate && !card) open_card(gate);
  }

  function open_card(gate: Gate | null, ref: RoundRef = ref_for(gate!.id)) {
    controls.reset(controls.facing);
    sounds.quiet();
    flight = { ...flight, plane: { ...flight.plane, vx: 0, vz: 0 } };
    card = { gate, ref, chart: null, failed: false };
    opening_daily = null;
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
    const current = work_out_chart(new ChartWorker(), ref, "The round couldn't be flown");
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
        report_error(app_id, "Couldn't fly the round", reason);
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
    const cockpit_now = COCKPITS[ref.plane];
    controls.fit(cockpit_now, 1);
    const base = powered(plane_coefficients(ref.plane), scene);
    const start = start_plane(scene, base, cockpit_now.flaps[scene.start.flap_notch], cockpit_now.detents[scene.start.lever_notch].throttle);
    controls.set_notch(scene.start.lever_notch);
    controls.flap_notch = scene.start.flap_notch;
    controls.trim = Math.max(-1, Math.min(1, start.trim));
    sounds.quiet();
    puffs = [];
    camera = null;
    outcome = null;
    shown_touchdown = null;
    winch_drum = null;
    held = 0;
    failure = null;
    round = { ref, chart, scene };
    flight = create_flight(start.plane, Status.READY);
    card = null;
    in_hangar_now = false;
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

  function to_hub() {
    const from = round?.ref;
    job?.cancel();
    round = null;
    outcome = null;
    failure = null;
    card = null;
    controls.fit(COCKPITS[plane_id], 1);
    sounds.quiet();
    puffs = [];
    camera = null;
    shown_touchdown = null;
    const id: GateId | undefined = from ? (from.kind === RoundKind.LEVEL ? from.level! : from.kind) : undefined;
    const gate = field.gates.find((each) => each.id === id);
    flight = create_flight(create_plane(plane_coefficients(plane_id), gate ? gate.x : apron_x(), 1));
    dismissed_gate = gate?.id ?? null;
    in_hangar_now = in_hangar(field, flight.plane);
    focus_board();
  }

  function retry() {
    if (round) begin(round.ref, round.chart);
  }

  function next_level() {
    if (!round || round.ref.kind !== RoundKind.LEVEL) return;
    const levels = track(round.ref.plane);
    const next = levels.find((level) => level.n === round!.ref.level! + 1);
    if (!next) return to_hub();
    const ref: RoundRef = { kind: RoundKind.LEVEL, plane: round.ref.plane, level: next.n };
    card = { gate: null, ref, chart: null, failed: false };
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
    const run_result = result({ scene: round.scene, flight, held, failure }, round.chart.par);
    const key = round_key(round.ref);
    const before = progress.value.bests[key];
    const kept = better(before, { stars: run_result.stars, ms: run_result.ms });
    progress.value.bests = { ...progress.value.bests, [key]: kept.best };
    outcome = { result: run_result, improved: kept.improved, first: !before };
    sounds.pick();
    achievements.achieve("airfield-first");
    if (run_result.stars === 3 && round.ref.kind === RoundKind.LEVEL) achievements.achieve("airfield-three");
    if (run_result.gentle && round.scene.goal === "land") achievements.achieve("airfield-kiss");
    if (round.scene.power === 0 && round.ref.plane !== PlaneId.GLIDER) achievements.achieve("airfield-deadstick");
    achievements.progress("airfield-levels", levels_done(progress.value.bests));
    if (round.ref.kind === RoundKind.DAILY && round.ref.day) {
      play.daily(round.ref.day, run_result.ms, 3 - run_result.stars);
      achievements.achieve("airfield-daily");
    }
  }

  function touched(touchdown: Touchdown) {
    sounds.chirp(touchdown.sink);
    sounds.thump(touchdown.sink);
    puffs.push({ x: touchdown.x, age: 0, size: Math.min(2, 0.5 + touchdown.sink) });
    shown_touchdown = touchdown;
    clearTimeout(touchdown_timer);
    touchdown_timer = window.setTimeout(() => (shown_touchdown = null), 5000);
  }

  /** A glider can't taxi: it goes back into the hangar, where the picker is, and the winch pulls it out from there. */
  function apron_x(): number {
    return spec.engine === Engine.NONE ? (field.hangar.x0 + field.hangar.x1) / 2 : field.start;
  }

  function to_apron() {
    controls.reset(1);
    sounds.quiet();
    puffs = [];
    camera = null;
    shown_touchdown = null;
    winch_drum = null;
    flight = create_flight(create_plane(c, apron_x(), 1));
    in_hangar_now = in_hangar(field, flight.plane);
    focus_board();
  }

  function pick_plane(id: PlaneId) {
    sounds.pick();
    if (id === plane_id) return;
    plane_id = id;
    settings_file.value.plane = id;
    const x = flight.plane.x;
    controls.fit(COCKPITS[id], 1);
    winch_drum = null;
    camera = null;
    flight = create_flight(create_plane(c, x, 1));
    swapped = id;
    clearTimeout(swap_timer);
    swap_timer = window.setTimeout(() => (swapped = null), 6000);
    achievements.achieve("airfield-swap");
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

  function taxi_out() {
    hangar_away = true;
    focus_board();
  }

  function primary_action() {
    if (card) return start_card();
    if (hangar_card) return taxi_out();
    if (flight.status === Status.READY) return go();
    if (flight.status === Status.PAUSED) return resume();
    if (round && done && round.ref.kind === RoundKind.LEVEL) return next_level();
    if (round && (done || crashed)) return retry();
    if (crashed) to_apron();
  }

  function trim() {
    controls.trim_now(flight.plane, c, env);
  }

  function set_sound(on: boolean) {
    settings_file.value.sound = on;
    if (!on) sounds.quiet();
  }

  function set_pitch(mode: PitchMode) {
    settings_file.value.pitch = mode;
    controls.release();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    if (settings_panel?.matches(":popover-open")) return;
    const code = event.code;
    const on_button = target instanceof HTMLButtonElement;
    if (THROTTLE_DOWN_KEYS.has(code) || THROTTLE_UP_KEYS.has(code)) {
      event.preventDefault();
      if (!event.repeat && engage()) controls.step_notch(THROTTLE_UP_KEYS.has(code) ? 1 : -1);
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
      else to_apron();
      return;
    }
    if (in_hub && in_hangar_now && !card && /^Digit[1-9]$/.test(code) && !event.repeat) {
      const pick = PLANE_IDS[Number(code.slice(5)) - 1];
      if (pick) {
        event.preventDefault();
        pick_plane(pick);
      }
      return;
    }
    if (!engage() || (on_button && code === "Space")) return;
    if (UP_KEYS.has(code) || DOWN_KEYS.has(code) || BRAKE_KEYS.has(code)) {
      event.preventDefault();
      controls.keys.add(code);
    } else if (LEFT_KEYS.has(code) || RIGHT_KEYS.has(code)) {
      event.preventDefault();
      if (can_turn) controls.facing = LEFT_KEYS.has(code) ? -1 : 1;
      controls.keys.add(code);
    } else if ((code === "KeyF" || code === "KeyV") && !event.repeat) {
      event.preventDefault();
      controls.step_flaps(code === "KeyF" ? 1 : -1);
    } else if (code === "KeyT" && !event.repeat) {
      event.preventDefault();
      trim();
    } else if (code === "KeyL" && !event.repeat && spec.engine === Engine.NONE) {
      event.preventDefault();
      toggle_winch();
    }
  }
</script>

{#snippet toolbar()}
  <span class="flex min-w-0 items-center gap-1.5 px-1.5 text-ui font-medium">
    <AirplaneIcon weight="bold" class="size-4 shrink-0 text-primary" />
    <span class="truncate">{round ? round_title(round.ref) : "Airfield"}</span>
  </span>
  <Badge class="hidden @sm:inline-flex">{spec.name}</Badge>
  <div class="flex-1"></div>
  {#if round}<Button size="sm" variant="quiet" onclick={to_hub}>Airfield</Button>{:else}<Button size="sm" variant="quiet" onclick={to_apron}>Apron</Button>{/if}
  <SettingsPanel sound={settings.sound} pitch={settings.pitch} onsound={set_sound} onpitch={set_pitch} onfocus={focus_board} bind:panel={settings_panel} />
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
  <div bind:clientHeight={overlay_height} class="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1.5" style:right={profile_shown ? `${profile_width + 16}px` : "calc(8px + var(--immersive-inset-right, 0px))"}>
    <!-- Only the instruments, each held at its widest, set the camera's top inset: a chip coming and going below them moved the view. -->
    <div bind:clientHeight={hud_height} class="flex min-h-(--immersive-inset-top,0px) max-w-full flex-col items-start gap-1.5">
      <div class="flex max-w-full flex-wrap items-center gap-1.5">
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
            controls.notch > cockpit.idle ? "text-primary" : controls.notch < cockpit.idle ? "text-warning" : "text-foreground/80"
          )}
          aria-hidden="true"
        >
          {#each cockpit.detents as detent, i (detent.name)}
            <span class={cn("[grid-area:1/1]", i !== controls.notch && "invisible")}>{detent.name}</span>
          {/each}
        </div>
        <SpeedChip speed={air.speed} unit="kn" class="min-w-[calc(8ch+0.75rem)] text-right" />
        {@render chip(`${Math.round(altitude)} m`, undefined, 6)}
        {@render chip(`${plane.vy >= 0 ? "▲" : "▼"} ${Math.abs(plane.vy).toFixed(1)} m/s`, plane.vy < -3 && altitude < 30 ? "text-warning" : "text-foreground/80", 10)}
        {#if round}
          <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", waiting && "invisible")} aria-hidden="true">
            {clock}{#if par}&nbsp;<span class="text-foreground/65">/ {format_time(par)}</span>{/if}
          </div>
        {/if}
      </div>
      <div class="flex max-w-full flex-wrap items-center gap-1.5" aria-hidden="true">
        {#if cockpit.flaps.length > 1}
          <div class={cn("flex items-center gap-1.5 rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", controls.flap_notch > 0 ? "text-primary" : "text-foreground/80")}>
            <span>Flaps <span class="inline-block min-w-[4ch]">{controls.flap_name}</span></span>
            <span class="relative h-3 w-2.5 overflow-hidden rounded-xs bg-foreground/15">
              <span class="absolute inset-x-0 top-0 bg-primary" style:height="{plane.flaps * 100}%"></span>
              <span class="absolute inset-x-0 top-1/2 h-px bg-background/70"></span>
            </span>
          </div>
        {/if}
        {@render chip(`Trim ${controls.trim >= 0 ? "+" : "−"}${Math.round(Math.abs(controls.trim) * 100)}`, undefined, 9)}
      </div>
    </div>
    <div class="flex max-w-full flex-wrap items-center gap-1.5" aria-hidden="true">
      {#if plane.spoilers > 0.03}{@render chip(`${spec.engine === Engine.NONE ? "Airbrakes" : "Spoilers"} ${Math.round(plane.spoilers * 100)}%`, "text-warning")}{/if}
      {#if plane.reverser > 0.03}{@render chip(`Reverse ${Math.round(plane.reverser * 100)}%`, "text-warning")}{/if}
      {#if flight.autobrake}{@render chip("Autobrake", "text-warning")}{/if}
      {#if Math.abs(env.wind) >= 0.5}{@render chip(`${wind_along < 0 ? "Head" : "Tail"} ${Math.round(Math.abs(env.wind) * KNOT)} kn ${env.wind > 0 ? "▶" : "◀"}`, wind_along > 2 && altitude < 60 ? "text-warning" : "text-foreground/80")}{/if}
      {#if Math.abs(env.updraft) >= 0.4 && !on_ground}{@render chip(`${env.updraft > 0 ? "Lift" : "Sink"} ${Math.abs(env.updraft).toFixed(1)} m/s`, env.updraft > 0 ? "text-success" : "text-warning")}{/if}
      {#if controls.brake > 0}{@render chip(`Brakes ${Math.round(controls.brake * 100)}%`, "text-warning")}{/if}
      {#if turning}{@render chip(`Turning ${controls.facing > 0 ? "▶" : "◀"}`, "text-primary")}{/if}
      {#if to_runway !== null && altitude > 3}{@render chip(`Runway ${to_runway >= 1000 ? `${(to_runway / 1000).toFixed(1)} km` : `${Math.round(to_runway / 10) * 10} m`}`)}{/if}
    </div>
    {#if stall}
      <div class="af-stall rounded-md bg-warning px-2 py-0.5 text-ui font-semibold text-background" role="alert">Stall</div>
    {/if}
    {#if in_hub && spec.engine === Engine.NONE && (can_winch || winch_drum !== null)}
      <Button size="sm" class="pointer-events-auto pointer-coarse:h-11" variant={winch_drum !== null ? "secondary" : "primary"} onclick={toggle_winch}>
        {winch_drum !== null ? "Release" : "Winch launch"}<span class="hidden font-mono text-2xs opacity-70 pointer-fine:inline">L</span>
      </Button>
    {/if}
    {#if swapped && SWAP_NOTES[swapped]}
      <p class="max-w-84 rounded-md bg-background/85 px-2 py-1 text-ui font-medium backdrop-blur-[2px]" role="status">Now flying the {SPECS[swapped].name}. {SWAP_NOTES[swapped]}</p>
    {/if}
    {#if shown_touchdown}
      <div
        class={cn(
          "rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]",
          shown_touchdown.grade === Grade.KISS ? "text-success" : shown_touchdown.grade === Grade.FIRM ? "text-primary" : "text-warning"
        )}
        role="status"
      >
        {GRADE_NAMES[shown_touchdown.grade]}{shown_touchdown.aux_first ? (spec.gear.layout === GearLayout.NOSE ? ", nose first" : ", tail first") : ""} · {shown_touchdown.sink.toFixed(1)} m/s
      </div>
    {/if}
  </div>

  {#if in_hub && !settings.seen_hint && flying && !in_hangar_now && !card}
    <p
      class="pointer-events-none absolute left-2 mx-auto max-w-84 rounded-md bg-background/85 px-2 py-1 text-center text-ui text-foreground/80 backdrop-blur-[2px]"
      style:top="{overlay_height + 16 + (profile_shown && tall ? profile_width * 0.36 + 8 : 0)}px"
      style:right="{profile_shown && !tall ? profile_width + 16 : 8}px"
    >
      <span class="pointer-fine:hidden">{HINTS[fly_id].touch} Drag the pad on the right {settings.pitch === PitchMode.PILOT ? "down" : "up"} to raise the nose.</span>
      <span class="hidden pointer-fine:inline">{HINTS[fly_id].keys} {settings.pitch === PitchMode.PILOT ? "S" : "W"} raises the nose; A and D turn round on the ground.</span>
    </p>
  {/if}

  {#if card}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      {@const card_best = progress.value.bests[round_key(card.ref)]}
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round_title(card.ref)}
          <Badge tone="primary">{SPECS[card.ref.plane].name}</Badge>
        </p>
        <p class="text-ui text-foreground/80">
          {#if card.ref.kind === RoundKind.LEVEL || card.chart}{round_brief(card.ref, card.chart?.attempt ?? 0)}{:else}A new landing from today's seed.{/if}
        </p>
        <p class="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-2xs text-foreground/65 tabular-nums">
          {#if card_best}{@render stars_row(card_best.stars)} Best {format_time(card_best.ms)}{:else}Not flown yet{/if}
          {#if card.chart?.par}<span>· Par {format_time(card.chart.par)}</span>{/if}
        </p>
        {#if card.ref.kind === RoundKind.DAILY && card.ref.plane !== plane_id}<p class="text-2xs text-foreground/65">Today's daily is flown in the {SPECS[card.ref.plane].name}.</p>{/if}
        {#if card.failed}<p class="text-2xs text-error">Couldn't fly this one. Try again.</p>{/if}
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="quiet" onclick={close_card}>Not now</Button>
        <Button variant="primary" disabled={!card.chart} onclick={start_card}>
          {#if !card.chart && !card.failed}<Spinner label="Charting" />{/if}Start
        </Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="start" /><KeyHint key_name="Esc" text="taxi on" />
      </p>
    </RoundCard>
  {:else if opening_daily}
    <BoardOverlay title="Charting today's landing">
      <Spinner label="Charting" />
    </BoardOverlay>
  {:else if round && waiting}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{round_title(round.ref)}</p>
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
        {round.scene.goal === "takeoff" ? "Climb past the flag without a stall or a tail strike." : "Stop on the strip."} Stars: done, gentle ({round.scene.goal === "takeoff" ? "no stall horn" : "a kiss, no bounce"}), under par.
      </p>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="fly" /><KeyHint key_name="W S" text="pitch" /><KeyHint key_name="Shift Ctrl" text="lever" /><KeyHint key_name="F V" text="flaps" /><KeyHint key_name="B" text="brakes" />
      </p>
    </RoundCard>
  {:else if round && done && outcome}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold">
          {round.scene.goal === "takeoff" ? "Clear" : "Down and stopped"}
          {@render stars_row(outcome.result.stars, [true, outcome.result.gentle, outcome.result.on_time])}
          {#if outcome.improved}<Badge class="af-pop" tone={outcome.first ? "neutral" : "primary"}>{outcome.first ? "First time" : "New best"}</Badge>{/if}
        </p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {format_time(outcome.result.ms, { tenths: true })}{par ? ` · par ${format_time(par)}` : ""}{#if flight.touchdown && round.scene.goal !== "takeoff"}&nbsp;· {GRADE_NAMES[flight.touchdown.grade]} {flight.touchdown.sink.toFixed(1)} m/s{flight.landings > 1 ? `, ${flight.landings - 1} bounce${flight.landings > 2 ? "s" : ""}` : ""}{/if}
        </p>
        <p class="text-2xs text-foreground/65">
          {outcome.result.gentle ? "" : round.scene.goal === "takeoff" ? "The stall horn cost the gentle star." : "Under 0.6 m/s and no bounce for the gentle star."}
          {outcome.result.on_time ? "" : par ? " Over par." : ""}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="quiet" onclick={to_hub}>Airfield</Button>
        <Button variant={round.ref.kind === RoundKind.LEVEL ? "quiet" : "primary"} onclick={retry}>Again</Button>
        {#if round.ref.kind === RoundKind.LEVEL}<Button variant="primary" onclick={next_level}>{round.ref.level === track(round.ref.plane).length ? "Done" : "Next level"}</Button>{/if}
      </div>
    </RoundCard>
  {:else if crashed && (flight.crash || failure)}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{flight.crash ? CRASH_TITLES[flight.crash.kind] : FAILURE_TITLES[failure as Exclude<Failure, typeof Failure.CRASH>]}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {(flight.crash?.sink ?? 0).toFixed(1)} m/s down · {(air.speed * KNOT).toFixed(0)} kn{round ? ` · ${clock}` : ""}
        </p>
        <p class="text-2xs text-foreground/65">
          {#if !flight.crash}{failure === Failure.OFF_STRIP ? "A landing counts once the plane stops with its wheels on the strip." : failure === Failure.TAIL_STRIKE ? "Rotate gently: the tail is close to the runway at liftoff." : "The wing let go on the climb. Hold the climb speed."}{:else if flight.crash.kind === CrashKind.HARD}Under 0.6 m/s is a kiss, under 1.5 firm; 3 m/s breaks the gear. Flare: raise the nose just above the runway and let it settle.{:else if flight.crash.kind === CrashKind.NOSE_OVER}Hard brakes or a stick held forward tip a taildragger onto its nose. Keep the stick back while braking.{:else if flight.crash.kind === CrashKind.POD}The engines hang low under the wings: land on the mains, not nose down.{:else if flight.crash.kind === CrashKind.STALL}The wing let go too close to the ground to recover. Keep the speed up until the flare.{:else if flight.crash.kind === CrashKind.OBSTACLE}Trees, hills and buildings are solid. Climb earlier or come in higher.{:else if flight.crash.kind === CrashKind.WATER}Touch down on dry land.{:else}The plane met the ground off its wheels.{/if}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        {#if round}
          <Button variant="quiet" onclick={to_hub}>Airfield</Button>
          <Button variant="primary" onclick={retry}>Try again</Button>
        {:else}
          <Button variant="primary" onclick={to_apron}>Back to the apron</Button>
        {/if}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text={round ? "tries again" : "back to the apron"} />
      </p>
    </RoundCard>
  {:else if flight.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{Math.round(altitude)} m · {(air.speed * KNOT).toFixed(0)} kn{round ? ` · ${clock}` : ''}">
      {#if round}
        <Button size="sm" variant="quiet" onclick={to_hub}>Airfield</Button>
        <Button size="sm" variant="quiet" onclick={retry}>Restart</Button>
      {:else}
        <Button size="sm" variant="quiet" onclick={to_apron}>Apron</Button>
      {/if}
      <Button size="sm" variant="primary" onclick={resume}>Resume</Button>
    </BoardOverlay>
  {:else if hangar_card}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 basis-full">
        <p class="text-base font-semibold">Hangar</p>
        <p class="text-ui text-foreground/80">Pick a plane. It waits here, ready to taxi out.</p>
      </div>
      <div class="grid basis-full grid-cols-2 gap-1.5" role="group" aria-label="Plane">
        {#each PLANE_IDS as each, i (each)}
          <Button class="h-auto min-h-11 flex-col items-start gap-0 py-1.5 text-left whitespace-normal pointer-coarse:h-auto" variant={each === plane_id ? "primary" : "quiet"} aria-pressed={each === plane_id} onclick={() => pick_plane(each)}>
            <span class="flex items-center gap-1.5 font-semibold"><span class="hidden font-mono text-2xs opacity-70 pointer-fine:inline">{i + 1}</span>{SPECS[each].name}</span>
            <span class="af-blurb text-2xs font-normal opacity-80">{BLURBS[each]}</span>
          </Button>
        {/each}
      </div>
      <div class="ml-auto flex shrink-0">
        <Button variant="primary" onclick={taxi_out}>Taxi out</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="1–{PLANE_IDS.length}" text="pick" /><KeyHint key_name="Enter" text="taxi out" /><KeyHint key_name="D" text="turn round" /><KeyHint key_name="Shift" text="throttle" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>{round ? round_title(round.ref) : "Airfield"} · {spec.name}</span>
  <span class="tabular-nums">{(air.speed * KNOT).toFixed(0)} kn</span>
  <span class="tabular-nums">{Math.round(altitude)} m</span>
  <span class="tabular-nums pointer-coarse:hidden">Pitch {Math.round((plane.pitch * 180) / Math.PI)}°</span>
  <span class="hidden @5xl:inline">W S pitch · T trim · Shift Ctrl throttle · F V flaps · B brakes · A D turn on the ground · R apron</span>
{/snippet}

{#if !ready}
  <div class="h-full"></div>
{:else}
  <AirfieldFrame
    label="Airfield. W and S pitch, Shift and Control the throttle, F and V the flaps, B brakes, A and D turn round on the ground, Escape pauses."
    {controls}
    on_ground={can_turn}
    pitch={settings.pitch}
    controls_idle={crashed || done || waiting || !!card || hangar_card || flight.status === Status.PAUSED}
    {engage}
    ontrim={trim}
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
  :global(.af-pop) {
    animation: var(--animate-pop-in) 520ms both;
  }

  @container af-app (height < 30rem) {
    .af-blurb {
      display: none;
    }
  }

  .af-stall {
    animation: af-flash 0.5s steps(2, jump-none) infinite;
  }

  @keyframes af-flash {
    50% {
      opacity: 0.55;
    }
  }
</style>
