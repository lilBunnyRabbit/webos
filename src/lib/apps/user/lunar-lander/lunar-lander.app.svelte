<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$lib/core/games";
  import { BoardOverlay, Button, IconButton, Segmented, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    CaretDown as CaretDownIcon,
    FastForward as FastForwardIcon,
    Pause as PauseIcon,
    Planet as PlanetIcon,
    Play as PlayIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { draw_scene, read_palette, type Palette } from "./draw";
  import {
    altitude,
    best_scores_schema,
    create_game,
    DEFAULT_ENVIRONMENT,
    fixed_steps,
    GRAVITY,
    GRAVITY_OPTIONS,
    gravity_schema,
    mode_key,
    SAFE,
    score,
    set_status,
    Status,
    step,
    to_world,
    wind_speed,
    type BestScores,
    type Environment,
    type GameState,
    type Gravity,
  } from "./game";
  import { emit_crash, emit_dust, emit_exhaust, update_particles, type Particle } from "./particles";
  import { Control, NO_CONTROLS, SHIP_OPTIONS, ship_id_schema, ShipId, type Controls } from "./ships";

  const STEP_MS = 1000 / 120;
  const DT = STEP_MS / 1000;

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
  const best_scores = storage.persisted<BestScores>("best", {}, best_scores_schema);
  const uid = $props.id();

  // Per window, so two open games don't change each other's setup; storage only remembers the last pick.
  let ship_id = $state<ShipId>(storage.get("ship", ship_id_schema) ?? ShipId.PODS);
  let env = $state<Environment>({
    gravity: storage.get("gravity", gravity_schema) ?? DEFAULT_ENVIRONMENT.gravity,
    air: storage.get("air", z.boolean()) ?? DEFAULT_ENVIRONMENT.air,
    wind: storage.get("wind", z.boolean()) ?? DEFAULT_ENVIRONMENT.wind,
    infinite_fuel: storage.get("infinite_fuel", z.boolean()) ?? DEFAULT_ENVIRONMENT.infinite_fuel,
  });
  let game = $state.raw(create_game(untrack(() => ship_id), untrack(() => ({ ...env }))));
  let settling = $state(false);
  let new_best = $state(false);
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  // Read every physics step, not rendered, so holding a key never re-runs effects.
  const keys = new Set<string>();
  const touches = new Map<number, Control>();
  let particles: Particle[] = [];

  const key = $derived(mode_key(ship_id, env));
  const best = $derived(best_scores.value[key] ?? 0);
  const result = $derived(score(game));
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const animating = $derived(!blocked && (game.status === Status.FLYING || settling));
  const can_pause = $derived(game.status === Status.FLYING || game.status === Status.PAUSED);
  const over = $derived(game.status === Status.LANDED || game.status === Status.CRASHED);
  const height = $derived(altitude(game));
  const wind = $derived(wind_speed(game));
  const too_fast = $derived(game.ship.vy > SAFE.vy);
  const drifting = $derived(Math.abs(game.ship.vx) > SAFE.vx);
  const tilted = $derived(Math.abs(game.ship.angle) > SAFE.angle);
  const has_boost = $derived(game.design.thrusters.some((thruster) => thruster.controls.length === 1 && thruster.controls[0] === Control.BOOST));

  $effect(() => {
    if (!blocked) return;
    release_all();
    untrack(() => {
      if (game.status === Status.FLYING) game = set_status(game, Status.PAUSED);
    });
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!animating) return;
    let accumulator = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const result = fixed_steps(accumulator, now - last, STEP_MS);
      last = now;
      accumulator = result.remainder;
      if (result.steps > 0) advance(result.steps);
      if (settling && particles.length === 0) settling = false;
      render();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  // The device-pixel box also fires when only the DPR changes, like moving the window to another screen.
  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      const pixels = entry.devicePixelContentBoxSize?.[0];
      const dpr = pixels && box.inlineSize ? pixels.inlineSize / box.inlineSize : window.devicePixelRatio;
      size = { width: box.inlineSize, height: box.blockSize, dpr };
    });
    observer.observe(canvas, { box: "device-pixel-content-box" });
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
    void [game, palette, size];
    untrack(render);
  });

  function render() {
    if (!canvas || !palette || !size.width) return;
    const width = Math.round(size.width * size.dpr);
    const height = Math.round(size.height * size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) draw_scene(ctx, game, particles, size, palette, performance.now() / 1000);
  }

  function advance(steps: number) {
    let next = game;
    const input = controls();
    const gravity = GRAVITY[next.env.gravity].g;
    for (let i = 0; i < steps; i++) {
      const before = next;
      next = step(next, input, DT);
      if (next.status === Status.FLYING) emit_exhaust(particles, next, DT, Math.random);
      else if (before.status === Status.FLYING) touched_down(next);
      particles = update_particles(particles, next, gravity, DT, Math.random);
    }
    if (next !== game) game = next;
  }

  function touched_down(next: GameState) {
    settling = true;
    if (next.status === Status.CRASHED) {
      emit_crash(particles, next, Math.random);
      return;
    }
    for (const foot of next.design.feet) {
      const at = to_world(next.ship, foot);
      emit_dust(particles, at.x, at.y, 10, 30, Math.random);
    }
    const total = score(next)?.total ?? 0;
    new_best = total > best;
    if (new_best) best_scores.value[key] = total;
  }

  function controls(): Controls {
    const held: Controls = { ...NO_CONTROLS };
    for (const code of keys) held[KEY_CONTROLS[code]] = true;
    for (const control of touches.values()) held[control] = true;
    return held;
  }

  function release_all() {
    keys.clear();
    touches.clear();
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
    release_all();
    particles = [];
    settling = false;
    new_best = false;
    game = create_game(ship_id, { ...env });
    board?.focus({ preventScroll: true });
  }

  function set_ship(next: ShipId) {
    ship_id = next;
    storage.set("ship", next);
    new_game();
  }

  function set_env<K extends keyof Environment>(name: K, value: Environment[K]) {
    env[name] = value;
    storage.set(name, value);
    new_game();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey) return;
    // macOS sends no keyup for keys let go while Cmd is down, so Cmd+Tab would leave an engine burning.
    if (event.metaKey) return release_all();

    // Only on the board, so arrows in the toolbar and the environment popover keep their own meaning.
    if (event.code in KEY_CONTROLS && event.target === board) {
      event.preventDefault();
      if (over) return;
      keys.add(event.code);
      // A key still held through Restart repeats; that mustn't launch the new game behind the player's back.
      if (game.status === Status.READY && !event.repeat) play();
      return;
    }
    const target = event.target;
    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLButtonElement) return;
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

  function on_board_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" || !board) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const rect = board.getBoundingClientRect();
    const third = (event.clientX - rect.left) / rect.width;
    hold(event, third < 1 / 3 ? Control.LEFT : third > 2 / 3 ? Control.RIGHT : Control.UP);
  }

  function hold(event: PointerEvent, control: Control) {
    if (over) return;
    touches.set(event.pointerId, control);
    if (game.status === Status.READY) play();
  }

  function release(event: PointerEvent) {
    touches.delete(event.pointerId);
  }

  const format = (value: number) => (Math.abs(value) < 0.05 ? "0.0" : value.toFixed(1));
</script>

<!-- On the window, so a key let go after focus left the board (title bar, another window) still lets go. -->
<svelte:window onkeyup={on_keyup} onblur={release_all} />

{#snippet hold_button(control: Control, label: string, Icon: typeof ArrowUpIcon)}
  <Button
    size="lg"
    variant="secondary"
    class="touch-none select-none"
    aria-label={label}
    onpointerdown={(event: PointerEvent) => hold(event, control)}
    onpointerup={release}
    onpointercancel={release}
    onlostpointercapture={release}
    oncontextmenu={(event: Event) => event.preventDefault()}
  >
    <Icon weight="bold" />
  </Button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Select class="w-32" size="sm" aria-label="Ship" options={SHIP_OPTIONS} bind:value={() => ship_id, set_ship} />
    <Button size="sm" variant="quiet" class="min-w-0 gap-1.5 pr-1.5" popovertarget="env-{uid}" style="anchor-name: --env-{uid}">
      <PlanetIcon class="shrink-0" weight="bold" />
      <span class="truncate">{GRAVITY[env.gravity].label}{env.air ? (env.wind ? " · Wind" : " · Air") : ""}{env.infinite_fuel ? " · ∞" : ""}</span>
      <CaretDownIcon class="size-3 shrink-0 opacity-65" weight="bold" />
    </Button>
    <div class="flex-1"></div>
    <IconButton size="sm" label={game.status === Status.FLYING ? "Pause (P)" : "Resume (P)"} disabled={!can_pause} onclick={toggle_pause}>
      {#if game.status === Status.FLYING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>Restart</Button>
  </Toolbar>

  <div
    id="env-{uid}"
    popover="auto"
    class="ll-popover m-0 w-64 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
    style="position-anchor: --env-{uid}"
  >
    <div class="flex flex-col gap-3">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Gravity</p>
      <Segmented size="sm" label="Gravity" options={GRAVITY_OPTIONS} bind:value={() => env.gravity, (value: Gravity) => set_env("gravity", value)} />
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Environment</p>
      <label class="flex items-center justify-between gap-2 text-ui">
        <span>Air <span class="text-foreground/65">· drag</span></span>
        <Switch bind:checked={() => env.air, (value: boolean) => set_env("air", value)} />
      </label>
      <label class="flex items-center justify-between gap-2 text-ui {env.air ? '' : 'opacity-38'}">
        <span>Wind <span class="text-foreground/65">· needs air</span></span>
        <Switch disabled={!env.air} bind:checked={() => env.air && env.wind, (value: boolean) => set_env("wind", value)} />
      </label>
      <label class="flex items-center justify-between gap-2 text-ui">
        Infinite fuel
        <Switch bind:checked={() => env.infinite_fuel, (value: boolean) => set_env("infinite_fuel", value)} />
      </label>
    </div>
  </div>

  <div class="flex min-h-0 flex-col items-center gap-3 p-3">
    <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label="Lunar Lander. {game.design.help}. P pauses, R restarts."
        tabindex="0"
        class="relative aspect-[8/5] w-[min(100cqw,160cqh)] touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
        onpointerdown={on_board_pointerdown}
        onpointerup={release}
        onpointercancel={release}
        onlostpointercapture={release}
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
        {:else if over && !settling}
          <BoardOverlay
            title={game.status === Status.LANDED ? "Landed" : "Crashed"}
            detail={result ? `Score ${result.total}${new_best ? " · New best" : ` · Best ${best}`}` : (game.reason ?? "")}
          >
            {#if result}
              <p class="basis-full font-mono text-2xs text-foreground/65 tabular-nums">
                Soft {result.soft} · Level {result.level} · Centre {result.centre}{env.infinite_fuel ? "" : ` · Fuel ${result.fuel}`}
              </p>
            {/if}
            <Button size="sm" variant="primary" onclick={new_game}>Fly again</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <div class="hidden gap-2 pointer-coarse:flex" role="group" aria-label="Engines">
      {@render hold_button(Control.LEFT, "Left engine", ArrowLeftIcon)}
      {@render hold_button(Control.UP, "Both engines", ArrowUpIcon)}
      {@render hold_button(Control.RIGHT, "Right engine", ArrowRightIcon)}
      {#if has_boost}{@render hold_button(Control.BOOST, "Rear engines", FastForwardIcon)}{/if}
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
    <span class="hidden tabular-nums @md:inline">Best {best}</span>
    <span class="hidden @2xl:inline">{game.design.help}</span>
  </StatusBar>
</div>

<style>
  .ll-popover {
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>
