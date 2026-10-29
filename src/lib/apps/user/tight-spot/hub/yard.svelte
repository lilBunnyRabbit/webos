<script module lang="ts">
  import { GAMES, UPCOMING } from "../games";
  import { build_yard } from "./yard";

  const YARD = build_yard(GAMES, UPCOMING.length);
  const PARKING = YARD.car_park ? GAMES[YARD.car_park.plot] : null;
  const NAMES = YARD.plots.map((_, index) => GAMES[index]?.name ?? UPCOMING[index - GAMES.length] ?? null);
</script>

<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Button, Segmented, Select } from "$lib/core/components/ui";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { clamp_zoom, ease, fade, fit_span, frame, OVERLAY_ASPECT, OVERLAY_GAP, view_span, view_stretch, type Camera, type Insets } from "../core/camera";
  import { veil, type Palette } from "../core/draw";
  import DriveFrame from "../core/drive-frame.svelte";
  import { DriveInput, type Hold } from "../core/drive-input.svelte";
  import GearStrip from "../core/gear-strip.svelte";
  import { clamp, type Vec } from "../core/geometry";
  import KeyHint from "../core/key-hint.svelte";
  import CrabToggle from "../core/crab-toggle.svelte";
  import { CRAB_KEY, drive_note, DRIVE_KEYS, GEAR_KEYS, is_field, key_direction, STANDING, steer_hints, zoom_step } from "../core/keys";
  import { frame_loop } from "../core/loop";
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
  import { draw_yard, StaticLayer } from "./draw";
  import { icon_image } from "./icons";
  import { Scenario } from "../games/parking/kinds";
  import { area_of, at_below_door, below_car, door_at, door_car, drive, floor_of, GARAGE, gate_car, near, on_pad, pad_car, shelf_of, swap_car } from "./yard";

  interface Props {
    settings: DriveSettings;
    vehicle: Vehicle;
    /** The game just left: the vehicle comes out of its doorway instead of starting at the gate. */
    from: string | null;
    /** The game was entered from the car park's doorway on −1, so the vehicle comes back out there. */
    from_below: boolean;
    last: string | null;
    menu: Snippet;
    onenter: (id: string, below?: boolean) => void;
  }

  let { settings, vehicle = $bindable(), from, from_below, last, menu, onenter }: Props = $props();

  const CONTACT_FADE = 0.8;
  const YARD_SPAN = 34;
  const OVERVIEW_MARGIN = 1;
  const SHELF_OPTIONS = GARAGE.map((each) => ({ value: each.id, label: each.name }));
  let shelf = $state(untrack(() => shelf_of(vehicle).id));
  const shelf_vehicles = $derived(GARAGE.find((each) => each.id === shelf)?.vehicles ?? []);
  const MOVED_NOTE = 2.5;
  const vehicle_shelf = $derived(shelf_of(vehicle));
  const vehicle_options = $derived(vehicle_shelf.vehicles.map((each) => ({ value: each, label: VEHICLE_NAMES[each] })));
  let moved_note = $state<string | null>(null);
  let moved_timer: ReturnType<typeof setTimeout> | undefined;

  const { window: win, storage } = get_app_context();
  const intro_seen = storage.persisted("yard_intro", false, z.boolean());
  const input = new DriveInput();
  const sounds = new Sounds(() => settings);

  const start_door = untrack(() => (from ? GAMES.findIndex((game) => game.id === from) : -1));
  const start_below = untrack(() => (from_below && from === PARKING?.id ? below_car(YARD, VEHICLES[vehicle]) : null));
  let car = $state.raw<Car>(
    untrack(() => start_below ?? (start_door >= 0 ? door_car(YARD, start_door, VEHICLES[vehicle]) : gate_car(YARD, VEHICLES[vehicle])))
  );
  let moved = $state(start_door >= 0 || start_below !== null);
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
  let cut_at = -Infinity;
  const layer = new StaticLayer();
  let readings = $state.raw<Record<End, number | null>>({ front: null, rear: null });
  let touching = false;

  const spec = $derived(VEHICLES[vehicle]);
  const lock = $derived(max_steer(spec));
  const note = $derived(drive_note(spec));
  const floor = $derived(floor_of(YARD, body_centre(car, spec)));
  // Wider than a round's view: the yard is for looking around, and its buildings should show from the gate. Below
  // ground it closes in to a round's view, as tight as the floors.
  const span = $derived(
    floor !== null ? view_span(rig_length(spec)) : Math.max(YARD_SPAN * Math.min(1, view_stretch(rig_length(spec))), view_span(rig_length(spec)))
  );
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const door = $derived(door_at(YARD, car, spec));
  const below = $derived(at_below_door(YARD, car, spec));
  const door_game = $derived(below ? PARKING : door === null ? null : GAMES[door]);
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

  function cut(): number {
    return fade((performance.now() - cut_at) / 1000);
  }

  function ring_fade(): number {
    return contact ? Math.max(0, 1 - (performance.now() - contact.since) / 1000 / CONTACT_FADE) : 0;
  }

  // The front wheels turn at a capped rate, so a flicked wheel keeps the loop up until they catch up with it.
  function steering(): boolean {
    const wanted = input.read(car.gear).steer;
    return wanted !== null && Math.abs(wanted * lock - car.steer) > 1e-4;
  }

  // The yard has no round to pause, so the loop sleeps once nothing moves and wakes on the next input.
  function going(): boolean {
    const on = car.speed !== 0 || input.busy() || steering() || ring_fade() > 0 || cut() > 0 || (settings.creep && gear_direction(car.gear) !== 0);
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
    // The doorway prompt is a small chip over the board, so it doesn't move the camera.
    const boxed = card !== null && card !== "door";
    const card_bottom = boxed && !side_card ? Math.min(card_size.height + 16, size.height * 0.5) : 0;
    const card_left = boxed && side_card ? Math.min(card_size.width + 16, size.width * 0.6) : 0;
    const insets = { top: hud_height + 8, right: 0, bottom: card_bottom, left: card_left };
    if (!sideways()) return insets;
    return { ...insets, right: pedal_box.width + OVERLAY_GAP, left: Math.max(card_left, steer_box.width + OVERLAY_GAP) };
  }

  // Until the first input the gate, the square and the buildings nearest it show, not the whole town.
  function target_camera(): Camera {
    const insets = control_insets();
    if (!moved) {
      const { landing } = YARD;
      const middle = { x: (landing.x0 + landing.x1) / 2, y: (landing.y0 + landing.y1) / 2 };
      return frame(YARD.bounds, middle, size.width, size.height, zoom, insets, fit_span(landing, size.width, size.height, insets, OVERVIEW_MARGIN));
    }
    const centre = body_centre(car, spec);
    // Capped so a fast car (the GT tops 36 m/s) stays in view on a phone's narrow side.
    const ahead = clamp(car.speed * 0.9, -span * 0.4, span * 0.4);
    const focus = { x: centre.x + Math.cos(car.heading) * ahead, y: centre.y + Math.sin(car.heading) * ahead };
    return frame(area_of(YARD, centre), focus, size.width, size.height, zoom, insets, span);
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
    const view = { ...camera, width: size.width, height: size.height, dpr: size.dpr };
    draw_yard(
      ctx,
      {
        yard: YARD,
        car,
        vehicle,
        spec,
        names: NAMES,
        icons,
        layer,
        last: last_plot >= 0 ? last_plot : null,
        at_door: door,
        at_below: below,
        on_pad: at_pad,
        contact: contact ? { at: contact.at, fade: ring_fade() } : null,
      },
      view,
      palette,
      {
        guides: settings.guides,
        sensors: {
          front: car.gear === Gear.DRIVE ? readings.front : null,
          rear: car.gear === Gear.REVERSE ? readings.rear : null,
        },
        time: performance.now() / 1000,
        font,
        insets: control_insets(),
      }
    );
    veil(ctx, view, cut(), palette);
  }

  function run(steps: number, dt: number) {
    let next = car;
    let hit: Vec | null = null;
    let passed = false;
    for (let i = 0; i < steps; i++) {
      input.step_wheel(dt, spec, settings.wheel);
      const bumped = drive(YARD, next, input.read(next.gear), dt, settings.creep ? spec : without_creep(spec));
      next = bumped.car;
      hit = bumped.hit ?? hit;
      passed ||= bumped.passed;
    }
    input.follow(next.steer / lock);
    // Through a ramp the camera cuts to the vehicle and the board fades in, as a round does.
    if (passed) {
      camera = null;
      cut_at = performance.now();
    }
    const solid = near(YARD, spec);
    readings = { front: sensor(next, solid, End.FRONT, spec), rear: sensor(next, solid, End.REAR, spec) };
    sounds.sensor(next.gear === Gear.DRIVE ? readings.front : next.gear === Gear.REVERSE ? readings.rear : null);
    sounds.reverse_beeper(!!spec.reverse_beeper && next.speed < -0.02);
    // A touch is a bump, not the end: one thunk as it starts, and the ring fades while the vehicle stays put.
    if (hit && !touching) {
      contact = { at: hit, since: performance.now() };
      sounds.crash();
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
    sounds.shift();
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

  // From the toolbar the new vehicle takes the old one's place wherever it is; the pad stays the in-world way.
  function swap_here(next: Vehicle) {
    if (next === vehicle) return;
    const swapped = swap_car(YARD, car, spec, VEHICLES[next]);
    vehicle = next;
    shelf = shelf_of(next).id;
    input.reset();
    sounds.quiet();
    contact = null;
    car = swapped.car;
    if (swapped.raised) {
      camera = null;
      cut_at = performance.now();
    }
    wake();
    moved_note = swapped.raised ? "Too tall for the car park: up on the pad" : swapped.moved ? "Moved to the nearest clear spot" : null;
    clearTimeout(moved_timer);
    if (moved_note) moved_timer = setTimeout(() => (moved_note = null), MOVED_NOTE * 1000);
    focus_board();
  }

  function swap_shelf(id: string) {
    const found = GARAGE.find((each) => each.id === id);
    if (found && found !== vehicle_shelf) swap_here(found.vehicles[0]);
  }

  $effect(() => () => clearTimeout(moved_timer));

  // Parking opens on the spot kind it last had, so the doorway below leaves the Multi-storey one picked.
  function enter() {
    if (!door_game) return;
    if (!below) return onenter(door_game.id);
    storage.set("parking.mode", "scenario");
    storage.set("parking.pick", Scenario.MULTI_STOREY);
    onenter(door_game.id, true);
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
  <span class="hidden truncate px-1 text-ui font-medium @md:inline">Yard</span>
  <Select class="w-[6.5rem] min-w-0 @md:w-28" size="sm" aria-label="Kind of vehicle" options={SHELF_OPTIONS} bind:value={() => vehicle_shelf.id, swap_shelf} />
  <Select class="w-[7.5rem] min-w-0 @md:w-48" size="sm" aria-label="Vehicle" options={vehicle_options} bind:value={() => vehicle, swap_here} />
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
      {#if card === "door" && door_game}
        <Button
          class="pointer-events-auto gap-1.5 pointer-coarse:h-11"
          size="sm"
          variant="primary"
          aria-label={below ? `${door_game.name}: Multi-storey` : undefined}
          onclick={enter}
        >
          <door_game.icon weight="bold" class="size-4" />
          {#if below}<span class="hidden @md:inline">{door_game.name}:</span> Multi-storey{:else}{door_game.name}{/if}
          <span class="hidden text-2xs opacity-75 pointer-fine:inline">Enter ↵</span>
        </Button>
      {/if}
      {#if moved_note}
        <div class="rounded-md bg-background/85 px-1.5 py-0.5 text-ui backdrop-blur-[2px]" role="status">{moved_note}</div>
      {/if}
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

  {#if card === "pad"}
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
          Drive into a lit doorway to play; each game has a building round the square. The garage pad in the middle, or the lists at the top, swap your vehicle, and the practice lot on the quay has cones and bays.
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
  <span>{floor === null ? "Yard" : `Car park ${floor < 0 ? "−" : ""}${Math.abs(floor)}`}</span>
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
