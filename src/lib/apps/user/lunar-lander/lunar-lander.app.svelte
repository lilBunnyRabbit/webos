<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$lib/core/games";
  import { BoardOverlay, Button, IconButton, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { draw_scene, read_palette, type Palette } from "./draw";
  import {
    altitude,
    create_game,
    DEFAULT_ENVIRONMENT,
    fixed_steps,
    GRAVITY,
    GRAVITY_OPTIONS,
    gravity_schema,
    SAFE,
    set_status,
    Status,
    step,
    wind_speed,
    type Environment,
    type Gravity,
  } from "./game";
  import { Control, NO_CONTROLS, SHIP_OPTIONS, ship_id_schema, ShipId, type Controls } from "./ships";

  const STEP_MS = 1000 / 120;

  const KEY_CONTROLS: Record<string, Control> = {
    ArrowLeft: Control.LEFT,
    KeyA: Control.LEFT,
    ArrowRight: Control.RIGHT,
    KeyD: Control.RIGHT,
    ArrowUp: Control.UP,
    KeyW: Control.UP,
    Space: Control.BOOST,
  };

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { app_id, window: win, storage } = get_app_context();
  track_play(app_id, () => win.is_visible);

  // Per window, so two open games don't change each other's setup; storage only remembers the last pick.
  let ship_id = $state<ShipId>(storage.get("ship", ship_id_schema) ?? ShipId.PODS);
  let env = $state<Environment>({
    gravity: storage.get("gravity", gravity_schema) ?? DEFAULT_ENVIRONMENT.gravity,
    air: storage.get("air", z.boolean()) ?? DEFAULT_ENVIRONMENT.air,
    wind: storage.get("wind", z.boolean()) ?? DEFAULT_ENVIRONMENT.wind,
    infinite_fuel: storage.get("infinite_fuel", z.boolean()) ?? DEFAULT_ENVIRONMENT.infinite_fuel,
  });
  let game = $state.raw(create_game(untrack(() => ship_id), untrack(() => ({ ...env }))));
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  // Read every physics step, not rendered, so holding a key never re-runs effects.
  const keys = new Set<string>();
  const touches = new Map<number, Control>();

  const blocked = $derived(!win.is_focused || !win.is_visible);
  const running = $derived(game.status === Status.FLYING && !blocked);
  const can_pause = $derived(game.status === Status.FLYING || game.status === Status.PAUSED);
  const over = $derived(game.status === Status.LANDED || game.status === Status.CRASHED);
  const height = $derived(altitude(game));
  const wind = $derived(wind_speed(game));
  const too_fast = $derived(game.ship.vy > SAFE.vy);
  const drifting = $derived(Math.abs(game.ship.vx) > SAFE.vx);
  const tilted = $derived(Math.abs(game.ship.angle) > SAFE.angle);

  $effect(() => {
    if (!blocked) return;
    keys.clear();
    touches.clear();
    untrack(() => {
      if (game.status === Status.FLYING) game = set_status(game, Status.PAUSED);
    });
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!running) return;
    let accumulator = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const result = fixed_steps(accumulator, now - last, STEP_MS);
      last = now;
      accumulator = result.remainder;
      if (result.steps > 0) {
        let next = game;
        const input = controls();
        for (let i = 0; i < result.steps; i++) next = step(next, input, STEP_MS / 1000);
        game = next;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      size = { width: box.inlineSize, height: box.blockSize, dpr: window.devicePixelRatio };
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!canvas || !palette || !size.width) return;
    const width = Math.round(size.width * size.dpr);
    const height = Math.round(size.height * size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) draw_scene(ctx, game, size.width, size.height, size.dpr, palette);
  });

  function controls(): Controls {
    const held: Controls = { ...NO_CONTROLS };
    for (const code of keys) held[KEY_CONTROLS[code]] = true;
    for (const control of touches.values()) held[control] = true;
    return held;
  }

  function play() {
    if (game.status !== Status.READY && game.status !== Status.PAUSED) return;
    game = set_status(game, Status.FLYING);
    board?.focus({ preventScroll: true });
  }

  function toggle_pause() {
    if (game.status === Status.FLYING) game = set_status(game, Status.PAUSED);
    else play();
  }

  function new_game() {
    keys.clear();
    touches.clear();
    game = create_game(ship_id, { ...env });
    board?.focus({ preventScroll: true });
  }

  function set_ship(next: ShipId) {
    ship_id = next;
    storage.set("ship", next);
    new_game();
  }

  function set_env<K extends keyof Environment>(key: K, value: Environment[K]) {
    env[key] = value;
    storage.set(key, value);
    new_game();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement) return;
    if (target instanceof HTMLButtonElement && (event.code === "Space" || event.code === "Enter")) return;

    if (event.code in KEY_CONTROLS) {
      event.preventDefault();
      if (over) return;
      keys.add(event.code);
      if (game.status === Status.READY) play();
      return;
    }
    if (event.code === "KeyP" || event.code === "Escape") {
      if (event.code === "Escape" && game.status !== Status.FLYING) return;
      event.preventDefault();
      toggle_pause();
    } else if (event.code === "KeyR" || (event.code === "Enter" && over)) {
      event.preventDefault();
      new_game();
    }
  }

  function on_keyup(event: KeyboardEvent) {
    keys.delete(event.code);
  }

  function on_pointerdown(event: PointerEvent) {
    if (over || !board || event.pointerType === "mouse") return;
    const rect = board.getBoundingClientRect();
    const third = (event.clientX - rect.left) / rect.width;
    touches.set(event.pointerId, third < 1 / 3 ? Control.LEFT : third > 2 / 3 ? Control.RIGHT : Control.UP);
    if (game.status === Status.READY) play();
  }

  function end_touch(event: PointerEvent) {
    touches.delete(event.pointerId);
  }

  const format = (value: number) => (Math.abs(value) < 0.05 ? "0.0" : value.toFixed(1));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown} onkeyup={on_keyup}>
  <Toolbar>
    <Select class="w-32" size="sm" aria-label="Ship" options={SHIP_OPTIONS} bind:value={() => ship_id, set_ship} />
    <Select
      class="w-24"
      size="sm"
      aria-label="Gravity"
      options={GRAVITY_OPTIONS}
      bind:value={() => env.gravity, (value: Gravity) => set_env("gravity", value)}
    />
    <label class="flex items-center gap-2 px-1 text-ui">
      Air
      <Switch bind:checked={() => env.air, (value: boolean) => set_env("air", value)} />
    </label>
    <label class="flex items-center gap-2 px-1 text-ui {env.air ? '' : 'opacity-38'}">
      Wind
      <Switch disabled={!env.air} bind:checked={() => env.wind, (value: boolean) => set_env("wind", value)} />
    </label>
    <label class="flex items-center gap-2 px-1 text-ui">
      Infinite fuel
      <Switch bind:checked={() => env.infinite_fuel, (value: boolean) => set_env("infinite_fuel", value)} />
    </label>
    <div class="flex-1"></div>
    <IconButton size="sm" label={game.status === Status.FLYING ? "Pause (P)" : "Resume (P)"} disabled={!can_pause} onclick={toggle_pause}>
      {#if game.status === Status.FLYING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>Restart</Button>
  </Toolbar>

  <div class="grid min-h-0 place-items-center p-3 [container-type:size]">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      bind:this={board}
      role="application"
      aria-label="Lunar Lander. {game.design.help}. P pauses."
      tabindex="0"
      class="relative aspect-[8/5] w-[min(100cqw,160cqh)] touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
      onpointerdown={on_pointerdown}
      onpointerup={end_touch}
      onpointercancel={end_touch}
      onlostpointercapture={end_touch}
    >
      <canvas bind:this={canvas} class="block size-full"></canvas>

      {#if game.status === Status.READY}
        <div class="absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-[6cqmin] text-center" aria-live="polite">
          <p class="text-ui text-foreground/80">{game.design.help}. Land slow and level on the pad.</p>
          <Button size="sm" variant="primary" onclick={play}>Launch</Button>
        </div>
      {:else if game.status === Status.PAUSED}
        <BoardOverlay title="Paused">
          <Button size="sm" variant="primary" onclick={play}>Resume</Button>
        </BoardOverlay>
      {:else if over}
        <BoardOverlay
          title={game.status === Status.LANDED ? "Landed" : "Crashed"}
          detail={game.status === Status.LANDED ? `${env.infinite_fuel ? "Infinite fuel" : `${Math.round(game.ship.fuel)}% fuel left`} · ${game.time.toFixed(1)} s` : (game.reason ?? "")}
        >
          <Button size="sm" variant="primary" onclick={new_game}>Fly again</Button>
        </BoardOverlay>
      {/if}
    </div>
  </div>

  <StatusBar>
    <span class="flex items-center gap-1.5">
      Fuel
      <span class="h-1.5 w-12 overflow-hidden rounded-full bg-foreground/10" role="meter" aria-label="Fuel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.ship.fuel)}>
        <span class="block h-full rounded-full {game.ship.fuel < 20 ? 'bg-warning' : 'bg-primary'}" style:width="{game.ship.fuel}%"></span>
      </span>
      <span class="w-8 tabular-nums">{env.infinite_fuel ? "∞" : `${Math.round(game.ship.fuel)}%`}</span>
    </span>
    <span class="tabular-nums">Alt {height.toFixed(0)}</span>
    <span class="tabular-nums {too_fast ? 'text-warning' : ''}">V {format(game.ship.vy)}</span>
    <span class="tabular-nums {drifting ? 'text-warning' : ''}">H {format(game.ship.vx)}</span>
    <span class="tabular-nums {tilted ? 'text-warning' : ''}">Tilt {Math.round((game.ship.angle * 180) / Math.PI)}°</span>
    {#if env.air && env.wind}<span class="tabular-nums">Wind {wind > 0 ? "→" : "←"} {Math.abs(wind).toFixed(0)}</span>{/if}
    <span class="hidden @lg:inline">{GRAVITY[env.gravity].label} · {game.design.help}</span>
  </StatusBar>
</div>
