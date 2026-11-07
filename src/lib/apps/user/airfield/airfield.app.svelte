<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Badge, BoardOverlay, Button, IconButton } from "$lib/core/components/ui";
  import { KeyHint, RoundCard, SpeedChip } from "$kit/components/play2d";
  import { track_play } from "$kit/games";
  import { clamp_zoom, ease, frame, OVERLAY_ASPECT, OVERLAY_GAP, type Camera, type Insets } from "$kit/games/play2d/camera";
  import { frame_loop } from "$kit/games/play2d/loop";
  import type { Palette } from "$kit/games/play2d/palette";
  import { AirplaneTilt as AirplaneIcon, ArrowCounterClockwise as ArrowCounterClockwiseIcon, Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    BRAKE_KEYS,
    Controls,
    DOWN_KEYS,
    FLAP_NAMES,
    LEFT_KEYS,
    PitchMode,
    RIGHT_KEYS,
    THROTTLE_DOWN_KEYS,
    THROTTLE_NAMES,
    THROTTLE_UP_KEYS,
    UP_KEYS,
  } from "./core/controls.svelte";
  import { draw_frame, PUFF_LIFE, type Puff, type Scenery } from "./core/draw";
  import { build_field, in_hangar, surface_roll } from "./core/field";
  import { advance, CrashKind, create_flight, Grade, Status, stall_warning, wheel_height, type Flight, type Touchdown } from "./core/flight";
  import { air_of, CALM, create_plane, facing, turn_left, type Env } from "./core/plane";
  import { PLANE_IDS, plane_coefficients, PlaneId, SPECS } from "./core/planes";
  import { DEFAULT_SETTINGS, SETTINGS_FILE, settings_schema } from "./core/settings";
  import { Sounds } from "./core/sound";
  import AirfieldFrame from "./frame.svelte";
  import SettingsPanel from "./settings-panel.svelte";

  const { app_id, window: win, storage } = get_app_context();
  track_play(app_id, () => win.is_visible);
  const settings_file = storage.file(SETTINGS_FILE, DEFAULT_SETTINGS, settings_schema);
  const KNOT = 1.943844;
  const LOOK_AHEAD = 1.2;
  const BOUNDS = { x0: -1e6, x1: 1e6, y0: -1e6, y1: 6 };
  const PROFILE_WIDTH = 190;
  const MIN_CIRCUIT_PX = 55;
  const MAX_PLANE_PX = 80;
  const MIN_PLANE_PX = 35;
  // Held sideways the flaps, turn, trim and brake buttons float in one row along the board's bottom edge.
  const MIDDLE_ROW = 64;
  const BLURBS: Record<PlaneId, string> = {
    [PlaneId.TRAINER]: "Taildragger trainer. Stalls near 35 kn, floats, forgiving.",
  };
  const CRASH_TITLES: Record<CrashKind, string> = {
    [CrashKind.HARD]: "Landed too hard",
    [CrashKind.NOSE_OVER]: "Nosed over",
    [CrashKind.WINGTIP]: "Caught a wingtip",
    [CrashKind.GROUND]: "Hit the ground",
  };
  const GRADE_NAMES: Record<Grade, string> = { [Grade.KISS]: "Kiss", [Grade.FIRM]: "Firm", [Grade.HEAVY]: "Heavy", [Grade.HARD]: "Hard" };

  const settings = $derived(settings_file.value);
  const controls = new Controls(() => settings_file.value.pitch);
  const sounds = new Sounds(() => settings_file.value.sound);
  const field = build_field();

  let plane_id = $state<PlaneId>(PlaneId.TRAINER);
  const c = $derived(plane_coefficients(plane_id));
  const spec = $derived(SPECS[plane_id]);
  let flight = $state.raw<Flight>(untrack(() => create_flight(create_plane(plane_coefficients(PlaneId.TRAINER), field.start))));
  let ready = $state(false);
  let in_hangar_now = $state(false);
  let shown_touchdown = $state.raw<Touchdown | null>(null);

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

  let camera: Camera | null = null;
  let puffs: Puff[] = [];
  let touchdown_timer = 0;

  const plane = $derived(flight.plane);
  const blocked = $derived(!win.is_visible || !win.is_focused);
  const flying = $derived(flight.status === Status.FLYING);
  const crashed = $derived(flight.status === Status.CRASHED);
  const side_card = $derived(board_size.height > 0 && board_size.width > board_size.height * 1.2);
  const air = $derived(air_of(plane, c));
  const altitude = $derived(wheel_height(plane, c));
  const stall = $derived(stall_warning(plane, c));
  const turning = $derived(turn_left(plane, controls.facing) !== 0);
  const profile_width = $derived(Math.min(PROFILE_WIDTH, board_size.width * 0.42));
  const profile_shown = $derived(board_size.width >= 300);
  // A tall board has sky to spare: the plane comes in closer, the ground sits lower than the middle but off the bottom edge, and the hint goes under the profile.
  const tall = $derived(board_size.height > board_size.width * 1.3);
  const to_runway = $derived(runway_distance(plane.x, facing(plane)));

  /** Metres to the near end of the runway the way the nose points; null over it or with it behind. */
  function runway_distance(x: number, face: number): number | null {
    const end = face > 0 ? field.runway.x0 : field.runway.x1;
    const distance = (end - x) * face;
    return distance > 0 ? distance : null;
  }

  $effect(() => {
    if (!settings_file.ready || ready) return;
    untrack(() => {
      plane_id = settings_file.value.plane;
      to_apron();
      ready = true;
    });
  });

  $effect(() => () => {
    sounds.close();
    clearTimeout(touchdown_timer);
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
      if (flight.status === Status.PAUSED) {
        resume();
        return true;
      }
      return false;
    })
  );

  $effect(() => {
    if (!ready || !flying || blocked) return;
    const stop = frame_loop(run, render, () => flight.status === Status.FLYING);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  $effect(() => {
    void [flight, palette, scenery, board_size, zoom, card_size.width, card_size.height, side_card, left_box.width, right_box.width, hud_height, in_hangar_now];
    if (flying && !blocked) return;
    untrack(() => render(0));
  });

  function sideways(): boolean {
    return !!left_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function carded(): boolean {
    return crashed || in_hangar_now;
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
    const agl = wheel_height(plane, c);
    const side = Math.max(1, Math.min(board_size.width, board_size.height));
    const span = Math.min(420, (tall ? 26 : 34) + 1.2 * Math.min(agl, 80) + 0.35 * Math.max(0, agl - 80), (side * spec.length) / plane_pixels(side, agl));
    const scale = side / (span / zoom);
    const high = (board_size.height - insets.top - insets.bottom) / scale;
    const reach = span / 3;
    const ahead = Math.max(-reach, Math.min(reach, plane.vx * LOOK_AHEAD));
    const focus = { x: plane.x + ahead, y: -Math.max(plane.h, (tall ? 0.14 : 0.32) * high) };
    return frame(BOUNDS, focus, board_size.width, board_size.height, zoom, insets, span);
  }

  function render(dt: number) {
    if (!canvas || !palette || !scenery || !board_size.width) return;
    const width = Math.round(board_size.width * board_size.dpr);
    const height = Math.round(board_size.height * board_size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_frame(ctx, {
      plane,
      c,
      field,
      view: { ...camera, width: board_size.width, height: board_size.height, dpr: board_size.dpr },
      palette,
      scenery,
      time: performance.now() / 1000,
      font: getComputedStyle(canvas).fontFamily,
      insets: control_insets(),
      puffs,
      hangar_label: "Hangar",
      profile: profile_shown,
    });
  }

  function env_at(x: number): Env {
    return { ...CALM, roll: surface_roll(field, x) };
  }

  function run(steps: number, dt: number) {
    let next = flight;
    for (let i = 0; i < steps && next.status === Status.FLYING; i++) {
      controls.step(dt);
      next = advance(next, controls.read(), c, dt, env_at(next.plane.x));
    }
    const span = steps * dt;
    for (const puff of puffs) puff.age += span;
    puffs = puffs.filter((puff) => puff.age < PUFF_LIFE);
    sounds.drone(next.plane.spool, air_of(next.plane, c).speed, stall_warning(next.plane, c));
    if (next === flight) return;
    const before = flight;
    flight = next;
    if (next.touchdown && next.touchdown !== before.touchdown) touched(next.touchdown);
    if (next.status === Status.CRASHED) {
      controls.release();
      sounds.quiet();
      sounds.crash();
    }
    in_hangar_now = in_hangar(field, next.plane);
    if (next.flown && !settings_file.value.seen_hint) settings_file.value.seen_hint = true;
  }

  function touched(touchdown: Touchdown) {
    sounds.chirp(touchdown.sink);
    puffs.push({ x: touchdown.x, age: 0, size: Math.min(2, 0.5 + touchdown.sink) });
    shown_touchdown = touchdown;
    clearTimeout(touchdown_timer);
    touchdown_timer = window.setTimeout(() => (shown_touchdown = null), 5000);
  }

  function to_apron() {
    controls.reset(1);
    sounds.quiet();
    puffs = [];
    camera = null;
    shown_touchdown = null;
    flight = create_flight(create_plane(c, field.start, 1));
    in_hangar_now = false;
    focus_board();
  }

  function pick_plane(id: PlaneId) {
    sounds.pick();
    if (id === plane_id) return;
    plane_id = id;
    settings_file.value.plane = id;
    const x = flight.plane.x;
    controls.reset(1);
    flight = create_flight(create_plane(c, x, 1));
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

  function engage(): boolean {
    return flight.status === Status.FLYING;
  }

  function trim() {
    controls.trim_now(flight.plane, c);
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
      if (flight.status !== Status.CRASHED) {
        event.preventDefault();
        toggle_pause();
      }
      return;
    }
    if (code === "Enter") {
      if (on_button) return;
      event.preventDefault();
      if (crashed) to_apron();
      else resume();
      return;
    }
    if (code === "Equal" || code === "NumpadAdd" || code === "Minus" || code === "NumpadSubtract") {
      event.preventDefault();
      zoom = clamp_zoom(zoom * (code === "Equal" || code === "NumpadAdd" ? 1.2 : 1 / 1.2));
      return;
    }
    if (code === "KeyR" && !event.repeat) {
      event.preventDefault();
      to_apron();
      return;
    }
    if (in_hangar_now && /^Digit[1-9]$/.test(code) && !event.repeat) {
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
      controls.facing = LEFT_KEYS.has(code) ? -1 : 1;
    } else if ((code === "KeyF" || code === "KeyV") && !event.repeat) {
      event.preventDefault();
      controls.step_flaps(code === "KeyF" ? 1 : -1);
    } else if (code === "KeyT" && !event.repeat) {
      event.preventDefault();
      trim();
    }
  }
</script>

{#snippet toolbar()}
  <span class="flex min-w-0 items-center gap-1.5 px-1.5 text-ui font-medium">
    <AirplaneIcon weight="bold" class="size-4 shrink-0 text-primary" />
    <span class="truncate">Airfield</span>
  </span>
  <Badge class="hidden @sm:inline-flex">{spec.name}</Badge>
  <div class="flex-1"></div>
  <Button size="sm" variant="quiet" onclick={to_apron}>Apron</Button>
  <SettingsPanel sound={settings.sound} pitch={settings.pitch} onsound={set_sound} onpitch={set_pitch} onfocus={focus_board} bind:panel={settings_panel} />
  <IconButton size="sm" class="hidden @md:inline-flex" label={flying ? "Pause (Esc)" : "Resume (Esc)"} disabled={crashed} onclick={toggle_pause}>
    {#if flying}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
  </IconButton>
{/snippet}

{#snippet chip(text: string, tone: string = "text-foreground/80")}
  <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", tone)} aria-hidden="true">{text}</div>
{/snippet}

{#snippet overlay()}
  <div bind:clientHeight={hud_height} class="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1.5" style:right="{profile_shown ? profile_width + 16 : 8}px">
    <div class="flex max-w-full flex-wrap items-center gap-1.5">
      <IconButton
        size="sm"
        class="pointer-events-auto bg-background/85 backdrop-blur-[2px] @md:hidden pointer-coarse:size-11"
        label={flying ? "Pause" : "Resume"}
        disabled={crashed}
        onclick={toggle_pause}
      >
        {#if flying}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
      </IconButton>
      <div class={cn("rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]", controls.notch > 0 ? "text-primary" : "text-foreground/80")} aria-hidden="true">
        {THROTTLE_NAMES[controls.notch]}
      </div>
      <SpeedChip speed={air.speed} unit="kn" />
      {@render chip(`${Math.round(altitude)} m`)}
      {@render chip(`${plane.vy >= 0 ? "▲" : "▼"} ${Math.abs(plane.vy).toFixed(1)} m/s`, plane.vy < -3 && altitude < 30 ? "text-warning" : "text-foreground/80")}
    </div>
    <div class="flex max-w-full flex-wrap items-center gap-1.5" aria-hidden="true">
      <div class={cn("flex items-center gap-1.5 rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", controls.flap_notch > 0 ? "text-primary" : "text-foreground/80")}>
        <span>Flaps {FLAP_NAMES[controls.flap_notch]}</span>
        <span class="relative h-3 w-2.5 overflow-hidden rounded-xs bg-foreground/15">
          <span class="absolute inset-x-0 top-0 bg-primary" style:height="{plane.flaps * 100}%"></span>
          <span class="absolute inset-x-0 top-1/2 h-px bg-background/70"></span>
        </span>
      </div>
      {@render chip(`Trim ${controls.trim >= 0 ? "+" : "−"}${Math.round(Math.abs(controls.trim) * 100)}`)}
      {#if controls.brake > 0}{@render chip(`Brakes ${Math.round(controls.brake * 100)}%`, "text-warning")}{/if}
      {#if turning}{@render chip(`Turning ${controls.facing > 0 ? "▶" : "◀"}`, "text-primary")}{/if}
      {#if to_runway !== null && altitude > 3}{@render chip(`Runway ${to_runway >= 1000 ? `${(to_runway / 1000).toFixed(1)} km` : `${Math.round(to_runway / 10) * 10} m`}`)}{/if}
    </div>
    {#if stall}
      <div class="af-stall rounded-md bg-warning px-2 py-0.5 text-ui font-semibold text-background" role="alert">Stall</div>
    {/if}
    {#if shown_touchdown}
      <div
        class={cn(
          "rounded-md bg-background/85 px-1.5 py-0.5 text-ui font-medium backdrop-blur-[2px]",
          shown_touchdown.grade === Grade.KISS ? "text-success" : shown_touchdown.grade === Grade.FIRM ? "text-primary" : "text-warning"
        )}
        role="status"
      >
        {GRADE_NAMES[shown_touchdown.grade]}{shown_touchdown.tail_first ? ", tail first" : ""} · {shown_touchdown.sink.toFixed(1)} m/s
      </div>
    {/if}
  </div>

  {#if !settings.seen_hint && flying && !in_hangar_now}
    <p
      class="pointer-events-none absolute left-2 mx-auto max-w-84 rounded-md bg-background/85 px-2 py-1 text-center text-ui text-foreground/80 backdrop-blur-[2px]"
      style:top="{hud_height + 16 + (profile_shown && tall ? profile_width * 0.36 + 8 : 0)}px"
      style:right="{profile_shown && !tall ? profile_width + 16 : 8}px"
    >
      <span class="pointer-fine:hidden">
        Push the throttle up and roll down the runway. It lifts off by itself near 45 kn; drag the pad on the right {settings.pitch === PitchMode.PILOT ? "down" : "up"} to raise the nose.
      </span>
      <span class="hidden pointer-fine:inline">
        Shift opens the throttle a notch. Roll down the runway: it lifts off by itself near 45 kn. {settings.pitch === PitchMode.PILOT ? "S" : "W"} raises the nose, A and D turn round.
      </span>
    </p>
  {/if}

  {#if crashed && flight.crash}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 flex-1 basis-52">
        <p class="text-base font-semibold">{CRASH_TITLES[flight.crash.kind]}</p>
        <p class="font-mono text-2xs text-foreground/80 tabular-nums">
          {flight.crash.sink.toFixed(1)} m/s down · {(air.speed * KNOT).toFixed(0)} kn
        </p>
        <p class="text-2xs text-foreground/65">
          {#if flight.crash.kind === CrashKind.HARD}Under 0.6 m/s is a kiss, under 1.5 firm; 3 m/s breaks the gear. Flare: raise the nose just above the runway and let it settle.{:else if flight.crash.kind === CrashKind.NOSE_OVER}Hard brakes or a stick held forward tip a taildragger onto its nose. Keep the stick back while braking.{:else if flight.crash.kind === CrashKind.WINGTIP}A turn banks the wings: start it high enough that the low wing clears the ground.{:else}The plane met the ground off its wheels.{/if}
        </p>
      </div>
      <div class="ml-auto flex shrink-0 gap-2">
        <Button variant="primary" onclick={to_apron}>Back to the apron</Button>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="back to the apron" />
      </p>
    </RoundCard>
  {:else if flight.status === Status.PAUSED}
    <BoardOverlay title="Paused" detail="{Math.round(altitude)} m · {(air.speed * KNOT).toFixed(0)} kn">
      <Button size="sm" variant="quiet" onclick={to_apron}>Apron</Button>
      <Button size="sm" variant="primary" onclick={resume}>Resume</Button>
    </BoardOverlay>
  {:else if in_hangar_now}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 basis-full">
        <p class="text-base font-semibold">Hangar</p>
        <p class="text-ui text-foreground/80">Pick a plane. It waits here, ready to taxi out.</p>
      </div>
      <div class="grid basis-full gap-1.5 @md:grid-cols-3" role="group" aria-label="Plane">
        {#each PLANE_IDS as each, i (each)}
          <Button class="h-auto flex-col items-start gap-0 py-1.5 text-left" variant={each === plane_id ? "primary" : "quiet"} aria-pressed={each === plane_id} onclick={() => pick_plane(each)}>
            <span class="flex items-center gap-1.5 font-semibold"><span class="hidden font-mono text-2xs opacity-70 pointer-fine:inline">{i + 1}</span>{SPECS[each].name}</span>
            <span class="text-2xs font-normal opacity-80">{BLURBS[each]}</span>
          </Button>
        {/each}
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="1" text="pick" /><KeyHint key_name="D" text="turn round" /><KeyHint key_name="Shift" text="throttle" />
      </p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>Airfield · {spec.name}</span>
  <span class="tabular-nums">{(air.speed * KNOT).toFixed(0)} kn</span>
  <span class="tabular-nums">{Math.round(altitude)} m</span>
  <span class="tabular-nums pointer-coarse:hidden">Pitch {Math.round((plane.pitch * 180) / Math.PI)}°</span>
  <span class="hidden @5xl:inline">W S pitch · T trim · Shift Ctrl throttle · F V flaps · B brakes · A D turn · R apron</span>
{/snippet}

{#if !ready}
  <div class="h-full"></div>
{:else}
  <AirfieldFrame
    label="Airfield. W and S pitch, Shift and Control the throttle, F and V the flaps, B brakes, A and D turn round, Escape pauses."
    {controls}
    pitch={settings.pitch}
    controls_idle={crashed || flight.status === Status.PAUSED}
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
  .af-stall {
    animation: af-flash 0.5s steps(2, jump-none) infinite;
  }

  @keyframes af-flash {
    50% {
      opacity: 0.55;
    }
  }
</style>
