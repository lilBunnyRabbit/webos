<script module lang="ts">
  import { GAMES, UPCOMING } from "../games";
  import { build_yard } from "./yard";

  const YARD = build_yard(GAMES.length, UPCOMING.length);
  const NAMES = YARD.plots.map((_, index) => GAMES[index]?.name ?? UPCOMING[index - GAMES.length] ?? null);
  const BUILDINGS = YARD.plots.map((_, index) => GAMES[index]?.building ?? null);
</script>

<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Button, Segmented } from "$lib/core/components/ui";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, view_stretch, type Camera, type Insets } from "../core/camera";
  import type { Palette } from "../core/draw";
  import DriveFrame from "../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../core/drive-input.svelte";
  import GearStrip from "../core/gear-strip.svelte";
  import type { Vec } from "../core/geometry";
  import KeyHint from "../core/key-hint.svelte";
  import CrabToggle from "../core/crab-toggle.svelte";
  import { CRAB_KEY, drive_note, DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, steer_hints, zoom_step } from "../core/keys";
  import { frame_loop } from "../core/loop";
  import { obstacles } from "../core/obstacles";
  import RoundCard from "../core/round-card.svelte";
  import { End, sensor } from "../core/sensors";
  import SettingsPanel from "../core/settings-panel.svelte";
  import type { DriveSettings } from "../core/settings.svelte";
  import { Sounds } from "../core/sound";
  import SpeedChip from "../core/speed-chip.svelte";
  import {
    body_centre,
    can_crab,
    Gear,
    gear_direction,
    max_steer,
    rig_length,
    set_crab,
    shift as shift_car,
    Vehicle,
    VEHICLE_NAMES,
    VEHICLES,
    without_creep,
    type Car,
  } from "../core/vehicle";
  import { draw_yard } from "./draw";
  import { icon_image } from "./icons";
  import { door_at, door_car, drive, GARAGE, gate_car, on_pad, pad_car, shelf_of } from "./yard";

  interface Props {
    settings: DriveSettings;
    vehicle: Vehicle;
    /** The game just left: the vehicle comes out of its doorway instead of starting at the gate. */
    from: string | null;
    last: string | null;
    menu: Snippet;
    onenter: (id: string) => void;
  }

  let { settings, vehicle = $bindable(), from, last, menu, onenter }: Props = $props();

  const CONTACT_FADE = 0.8;
  const YARD_SPAN = 34;
  const OVERVIEW_MARGIN = 1;
  const SHELF_OPTIONS = GARAGE.map((each) => ({ value: each.id, label: each.name }));
  let shelf = $state(untrack(() => shelf_of(vehicle).id));
  const shelf_vehicles = $derived(GARAGE.find((each) => each.id === shelf)?.vehicles ?? []);

  const { window: win, storage } = get_app_context();
  const intro_seen = storage.persisted("yard_intro", false, z.boolean());
  const input = new DriveInput();
  const sounds = new Sounds();

  const start_door = untrack(() => (from ? GAMES.findIndex((game) => game.id === from) : -1));
  let car = $state.raw<Car>(untrack(() => (start_door >= 0 ? door_car(YARD, start_door, VEHICLES[vehicle]) : gate_car(YARD, VEHICLES[vehicle]))));
  let moved = $state(start_door >= 0);
  let awake = $state(false);
  let contact = $state.raw<{ at: Vec; since: number } | null>(null);
  let size = $state({ width: 0, height: 0, dpr: 1 });
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
  let icons = $state.raw<(HTMLImageElement | null)[]>([]);
  let icons_ready = $state(0);

  let camera: Camera | null = null;
  let readings = $state.raw<Record<End, number | null>>({ front: null, rear: null });
  let touching = false;

  const spec = $derived(VEHICLES[vehicle]);
  const lock = $derived(max_steer(spec));
  const note = $derived(drive_note(spec));
  // Wider than a round's view: the yard is for looking around, and its buildings should show from the gate.
  const span = $derived(Math.max(YARD_SPAN * Math.min(1, view_stretch(rig_length(spec))), view_span(rig_length(spec))));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const door = $derived(door_at(YARD, car, spec));
  const door_game = $derived(door === null ? null : GAMES[door]);
  const at_pad = $derived(on_pad(YARD, car, spec));
  const last_plot = $derived(last ? GAMES.findIndex((game) => game.id === last) : -1);
  const card = $derived(door_game ? "door" : at_pad ? "pad" : moved || intro_seen.value ? null : "welcome");
  // Held sideways the touch controls take both sides, so a card stays at the bottom between them.
  const side_card = $derived(size.height > 0 && size.width > size.height * 1.2 && !sideways());
  const wheel_degrees = $derived(Math.round((car.steer / lock) * 450));
  const font = $derived(palette && canvas ? getComputedStyle(canvas).fontFamily : "sans-serif");
  const facing_reading = $derived(car.gear === Gear.DRIVE ? readings.front : car.gear === Gear.REVERSE ? readings.rear : null);

  $effect(() => {
    if (blocked) release_all();
  });

  $effect(() => () => sounds.close());

  $effect(() => {
    if (!palette) return;
    const colour = palette.target;
    icons = YARD.plots.map((_, index) => {
      const game = GAMES[index];
      return game ? icon_image(game.icon, colour, () => icons_ready++) : null;
    });
  });

  $effect(() =>
    win.on_back(() => {
      if (!settings_panel?.matches(":popover-open")) return false;
      settings_panel.hidePopover();
      return true;
    })
  );

  $effect(() => {
    if (!awake || blocked) return;
    const stop = frame_loop(run, render, going);
    return () => {
      stop();
      sounds.quiet();
    };
  });

  // The loop draws while something moves; this covers the rest (a gear, a menu, a resize, a new theme).
  $effect(() => {
    void [car, palette, size, zoom, settings.guides, card_size.width, card_size.height, side_card, steer_box.width, pedal_box.width, hud_height, card, icons, icons_ready];
    if (awake && !blocked) return;
    untrack(() => render(0));
  });

  function fade(): number {
    return contact ? Math.max(0, 1 - (performance.now() - contact.since) / 1000 / CONTACT_FADE) : 0;
  }

  // The front wheels turn at a capped rate, so a flicked wheel keeps the loop up until they catch up with it.
  function steering(): boolean {
    const wanted = input.read(car.gear).steer;
    return wanted !== null && Math.abs(wanted * lock - car.steer) > 1e-4;
  }

  // The yard has no round to pause, so the loop sleeps once nothing moves and wakes on the next input.
  function going(): boolean {
    const on = car.speed !== 0 || input.busy() || steering() || fade() > 0 || (settings.creep && gear_direction(car.gear) !== 0);
    if (!on) awake = false;
    return on;
  }

  function wake() {
    awake = true;
    moved = true;
    intro_seen.value = true;
  }

  function sideways(): boolean {
    return !!steer_box.width && !!stage_rect && stage_rect.width > stage_rect.height * OVERLAY_ASPECT;
  }

  function control_insets(): Insets {
    const card_bottom = card && !side_card ? Math.min(card_size.height + 16, size.height * 0.5) : 0;
    const card_left = card && side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  // Until the first input the gate and the nearest buildings show; the street runs on east past them.
  function target_camera(): Camera {
    const insets = control_insets();
    if (!moved) {
      const { landing } = YARD;
      const middle = { x: (landing.x0 + landing.x1) / 2, y: (landing.y0 + landing.y1) / 2 };
      return frame(YARD.bounds, middle, size.width, size.height, zoom, insets, fit_span(landing, size.width, size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(car, spec);
    const ahead = car.speed * 0.9;
    const focus = { x: centre.x + Math.cos(car.heading) * ahead, y: centre.y + Math.sin(car.heading) * ahead };
    return frame(YARD.bounds, focus, size.width, size.height, zoom, insets, span);
  }

  function render(dt: number) {
    if (!canvas || !palette || !size.width) return;
    const width = Math.round(size.width * size.dpr);
    const height = Math.round(size.height * size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const target = target_camera();
    camera = dt > 0 ? ease(camera, target, dt) : target;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw_yard(
      ctx,
      {
        yard: YARD,
        car,
        vehicle,
        spec,
        names: NAMES,
        icons,
        buildings: BUILDINGS,
        last: last_plot >= 0 ? last_plot : null,
        at_door: door,
        on_pad: at_pad,
        contact: contact ? { at: contact.at, fade: fade() } : null,
      },
      { ...camera, width: size.width, height: size.height, dpr: size.dpr },
      palette,
      {
        guides: settings.guides,
        sensors: {
          front: car.gear === Gear.DRIVE ? readings.front : null,
          rear: car.gear === Gear.REVERSE ? readings.rear : null,
        },
        time: performance.now() / 1000,
        font,
      }
    );
  }

  function run(steps: number, dt: number) {
    let next = car;
    let hit: Vec | null = null;
    for (let i = 0; i < steps; i++) {
      input.step_wheel(dt, spec, settings.wheel);
      const bumped = drive(YARD, next, input.read(next.gear), dt, settings.creep ? spec : without_creep(spec));
      next = bumped.car;
      hit = bumped.hit ?? hit;
    }
    input.follow(next.steer / lock);
    const near = obstacles(YARD);
    readings = { front: sensor(next, near, End.FRONT, spec), rear: sensor(next, near, End.REAR, spec) };
    if (settings.sound) sounds.sensor(next.gear === Gear.DRIVE ? readings.front : next.gear === Gear.REVERSE ? readings.rear : null);
    if (settings.sound) sounds.reverse_beeper(!!spec.reverse_beeper && next.speed < -0.02);
    // A touch is a bump, not the end: one thunk as it starts, and the ring fades while the vehicle stays put.
    if (hit && !touching) {
      contact = { at: hit, since: performance.now() };
      if (settings.sound) sounds.crash();
    }
    touching = hit !== null;
    car = next;
  }

  function release_all() {
    input.release();
    sounds.quiet();
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function shift(gear: Gear) {
    const next = shift_car(car, gear, spec);
    if (next === car) return;
    car = next;
    wake();
    if (settings.sound) sounds.shift();
  }

  function choose_direction(want: Gear | null) {
    if (want && Math.abs(car.speed) < STANDING) shift(want);
  }

  function crab() {
    const next = set_crab(car, !car.crab, spec);
    if (next === car) return;
    car = next;
    wake();
  }

  function set_wheel(value: number) {
    wake();
    input.set_wheel(value);
  }

  function engage(): boolean {
    wake();
    return true;
  }

  function on_press(which: Hold) {
    if (which === "gas") choose_direction(Gear.DRIVE);
    else if (which === "brake") choose_direction(Gear.REVERSE);
  }

  function swap(next: Vehicle) {
    if (next === vehicle) return;
    vehicle = next;
    input.reset();
    sounds.quiet();
    camera = null;
    contact = null;
    car = pad_car(YARD, VEHICLES[next]);
    focus_board();
  }

  function enter() {
    if (door_game) onenter(door_game.id);
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    if (event.metaKey) return release_all();
    const target = event.target;
    if (is_field(target)) return;
    if (settings_panel?.matches(":popover-open")) return;
    const code = event.code;
    const on_button = target instanceof HTMLButtonElement;

    if (code === "Enter") {
      if (on_button || !door_game) return;
      event.preventDefault();
      enter();
      return;
    }
    const zooming = zoom_step(code);
    if (zooming) {
      event.preventDefault();
      zoom = clamp_zoom(zoom * zooming);
      return;
    }
    if (on_button && code === "Space") return;
    if (DRIVE_KEYS.has(code)) {
      event.preventDefault();
      input.keys.add(code);
      wake();
      if (!event.repeat) choose_direction(key_direction(code));
      return;
    }
    if (code === "KeyC") {
      event.preventDefault();
      set_wheel(0);
      return;
    }
    if (code === CRAB_KEY && can_crab(spec)) {
      event.preventDefault();
      if (!event.repeat) crab();
      return;
    }
    const gear = GEAR_KEYS[code];
    if (gear && !event.repeat) {
      event.preventDefault();
      shift(gear);
    }
  }
</script>

{#snippet toolbar()}
  {@render menu()}
  <span class="truncate px-1 text-ui font-medium">Yard</span>
  <span class="hidden truncate text-ui text-foreground/65 @sm:inline">{VEHICLE_NAMES[vehicle]}</span>
  <div class="flex-1"></div>
  <SettingsPanel {settings} {input} bind:panel={settings_panel} onmute={() => sounds.quiet()} onfocus={focus_board} />
{/snippet}

{#snippet overlay()}
  <div bind:clientHeight={hud_height} class="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-1.5">
    <div class="flex items-center gap-1.5">
      <GearStrip gear={car.gear} onshift={shift} />
      {#if can_crab(spec)}<CrabToggle on={!!car.crab} onclick={crab} />{/if}
      <SpeedChip class="pointer-coarse:hidden" speed={car.speed} />
    </div>
    <div class="flex flex-col items-end gap-1.5">
      <SpeedChip class="hidden pointer-coarse:block" speed={car.speed} />
      {#if facing_reading !== null}
        <div
          class={cn("rounded-md bg-background/85 px-1.5 py-0.5 font-mono text-ui tabular-nums backdrop-blur-[2px]", facing_reading < 0.5 ? "text-error" : "text-warning")}
          aria-hidden="true"
        >
          {car.gear === Gear.REVERSE ? "Rear" : "Front"}
          {facing_reading.toFixed(2)} m
        </div>
      {/if}
    </div>
  </div>

  {#if card === "door" && door_game}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="flex min-w-0 flex-1 basis-40 items-center gap-2.5">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-background"><door_game.icon weight="bold" class="size-5" /></span>
        <div class="min-w-0">
          <p class="text-base font-semibold">{door_game.name}</p>
          <p class="text-ui text-foreground/80">Go in to play.</p>
        </div>
      </div>
      <Button class="ml-auto" variant="primary" onclick={enter}>Enter</Button>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="Enter" text="go in" />
      </p>
    </RoundCard>
  {:else if card === "pad"}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 basis-full">
        <p class="text-base font-semibold">Garage</p>
        <p class="text-ui text-foreground/80">Try any vehicle. It waits here, ready to drive off.</p>
      </div>
      <Segmented size="sm" class="grid basis-full grid-cols-4 [&>label]:justify-center" label="Kind of vehicle" options={SHELF_OPTIONS} bind:value={shelf} />
      <div class="flex basis-full flex-wrap gap-1.5" role="group" aria-label="Vehicle">
        {#each shelf_vehicles as each (each)}
          <Button size="sm" variant={each === vehicle ? "primary" : "quiet"} aria-pressed={each === vehicle} onclick={() => swap(each)}>{VEHICLE_NAMES[each]}</Button>
        {/each}
      </div>
      {#if note}<p class="basis-full text-2xs text-foreground/65">{note}</p>{/if}
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" />{#each steer_hints(spec) as hint (hint.key_name)}<KeyHint {...hint} />{/each}
      </p>
    </RoundCard>
  {:else if card === "welcome"}
    <RoundCard side={side_card} bind:width={card_size.width} bind:height={card_size.height}>
      <div class="min-w-0 basis-full">
        <p class="text-base font-semibold">Drive Hub</p>
        <p class="text-ui text-foreground/80">
          Drive into a lit doorway to play; each game has a building along the street. The garage pad by the gate swaps your vehicle, and the cones and bays are for practice.
        </p>
      </div>
      <p class="hidden basis-full flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-foreground/65 pointer-fine:flex">
        <KeyHint key_name="↑" text="forward" /><KeyHint key_name="↓" text="back" /><KeyHint key_name="← →" text="steer" />
      </p>
      <p class="basis-full text-2xs text-foreground/65 pointer-fine:hidden">Hold Gas to go forward and Brake to back up, and steer with the wheel.</p>
    </RoundCard>
  {/if}
{/snippet}

{#snippet status()}
  <span>Yard</span>
  <span>{VEHICLE_NAMES[vehicle]}</span>
  <span class="tabular-nums pointer-coarse:hidden">Wheel {Math.abs(wheel_degrees)}°{wheel_degrees > 2 ? " R" : wheel_degrees < -2 ? " L" : ""}</span>
  <span class="hidden @3xl:inline">Drive into a doorway to play · the garage swaps the vehicle · + − zoom</span>
{/snippet}

<DriveFrame
  label="Drive Hub yard. Arrows steer and drive, E drive, R reverse, P park, Enter goes in at a doorway."
  {input}
  {settings}
  wheel_idle={false}
  pedals_idle={false}
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
  bind:size
  bind:palette
  bind:zoom
  bind:stage_rect
  bind:steer_box
  bind:pedal_box
/>
