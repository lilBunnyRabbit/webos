<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, IconButton, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as RestartIcon,
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    FastForward as FastForwardIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    CARVERS,
    carve_steps,
    create_maze,
    create_rng,
    Direction,
    random_seed,
    run,
    step,
    type Carver,
    type CarveStep,
  } from "./maze";
  import { draw_maze, read_palette, type Palette, type Scene } from "./maze-render";
  import {
    best_ms_schema,
    CARVER_LABELS,
    DEFAULT_PREFS,
    format_time,
    Mode,
    MODE_LABELS,
    prefs_schema,
    size_label,
    SIZES,
    Speed,
    SPEED_LABELS,
    SPEED_RATES,
    SOLVER_LABELS,
    type Size,
  } from "./options";
  import { SOLVERS, solve_steps } from "./solve";

  const MODE_OPTIONS = Object.values(Mode).map((value) => ({ value, label: MODE_LABELS[value] }));
  const CARVER_OPTIONS = CARVERS.map((value) => ({ value, label: CARVER_LABELS[value] }));
  const SOLVER_OPTIONS = SOLVERS.map((value) => ({ value, label: SOLVER_LABELS[value] }));
  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: size_label(value) }));
  const SPEED_OPTIONS = Object.values(Speed).map((value) => ({ value, label: SPEED_LABELS[value] }));
  const SWIPE_DISTANCE = 24;
  const KEY_DIRECTIONS: Record<string, Direction> = {
    ArrowUp: Direction.N,
    ArrowRight: Direction.E,
    ArrowDown: Direction.S,
    ArrowLeft: Direction.W,
    w: Direction.N,
    d: Direction.E,
    s: Direction.S,
    a: Direction.W,
  };
  const PAD = [
    { direction: Direction.N, label: "Up", icon: ArrowUpIcon, area: "col-start-2 row-start-1" },
    { direction: Direction.W, label: "Left", icon: ArrowLeftIcon, area: "col-start-1 row-start-2" },
    { direction: Direction.S, label: "Down", icon: ArrowDownIcon, area: "col-start-2 row-start-2" },
    { direction: Direction.E, label: "Right", icon: ArrowRightIcon, area: "col-start-3 row-start-2" },
  ];

  const Phase = { CARVING: "carving", READY: "ready", SOLVING: "solving", SOLVED: "solved" } as const;
  type Phase = (typeof Phase)[keyof typeof Phase];

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { window: win, storage } = get_app_context();
  const best = storage.persisted("best_ms", {}, best_ms_schema);

  // Per window, so two open mazes don't change each other; storage only remembers the last picks.
  const saved = storage.get("prefs", prefs_schema) ?? DEFAULT_PREFS;
  let mode = $state<Mode>(Mode.BUILD);
  let carver = $state(saved.carver);
  let size = $state(saved.size);
  let speed = $state(saved.speed);
  let solver = $state(saved.solver);

  let phase = $state<Phase>(Phase.CARVING);
  let seed = $state(0);
  let built = $state({ carver: saved.carver, size: saved.size });
  let expanded = $state(0);
  let path_length = $state<number | null>(null);

  let started = $state(false);
  let finished = $state(false);
  let record = $state(false);
  let timer_total = $state(0);
  let timer_since = $state<number | null>(null);
  let now = $state(0);

  let canvas = $state<HTMLCanvasElement>();
  let board = $state<HTMLDivElement>();
  let view = $state({ w: 0, h: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);

  // The animation mutates these thousands of times a second; drawing reads them directly instead of through runes.
  const scene: Scene = {
    maze: create_maze(1, 1),
    start: 0,
    goal: 0,
    carving: true,
    head: null,
    marks: null,
    visited: null,
    path: null,
    trail: null,
    player: null,
  };
  let carving: Generator<CarveStep, void, undefined> | null = null;
  let solving: Generator<number, number[], undefined> | null = null;
  let swipe: { id: number; x: number; y: number } | null = null;

  const busy = $derived(phase === Phase.CARVING || phase === Phase.SOLVING);
  const steps_per_second = $derived(SPEED_RATES[speed] * Number(built.size) ** 2);
  const elapsed = $derived(timer_total + (timer_since === null ? 0 : Math.max(0, now - timer_since)));
  const best_time = $derived(best.value[built.size] as number | undefined);
  const timing = $derived(mode === Mode.PLAY && started && !finished);

  const status = $derived.by(() => {
    if (phase === Phase.CARVING) return `Building with ${CARVER_LABELS[built.carver]}…`;
    if (mode === Mode.PLAY) {
      if (finished) return record ? `New best: ${format_time(elapsed)}` : `Done in ${format_time(elapsed)}`;
      return started ? format_time(elapsed) : "Find the way to the exit";
    }
    if (phase === Phase.SOLVING) return `Searching… ${expanded} cells`;
    if (phase === Phase.SOLVED) {
      return path_length ? `Path of ${path_length} cells, ${expanded} searched` : "No way through";
    }
    return mode === Mode.SOLVE ? "Pick a solver and press Solve" : "Maze ready";
  });

  $effect(() => storage.set("prefs", { carver, size, speed, solver }));

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame = requestAnimationFrame(() => (palette = read_palette(probe)));
    return () => cancelAnimationFrame(frame);
  });

  $effect(draw);

  $effect(() => {
    if (!busy || win.is_minimized) return;
    const rate = steps_per_second;
    let last = performance.now();
    let budget = 0;
    let frame = requestAnimationFrame(function tick(time) {
      budget = Math.min(budget + ((time - last) / 1000) * rate, rate);
      last = time;
      const count = Math.floor(budget);
      budget -= count;
      advance(count);
      draw();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (timer_since === null) return;
    const interval = setInterval(() => (now = performance.now()), 100);
    return () => clearInterval(interval);
  });

  $effect(() => {
    const minimized = win.is_minimized;
    untrack(() => {
      if (minimized) pause_timer();
      else if (started && !finished && timer_since === null) timer_since = now = performance.now();
    });
  });

  new_maze();

  function draw() {
    const ctx = canvas?.getContext("2d");
    if (!ctx || !palette || !view.w || !view.h) return;
    const play = mode === Mode.PLAY;
    draw_maze(ctx, view.w, view.h, view.dpr, {
      ...scene,
      visited: play ? null : scene.visited,
      path: play ? null : scene.path,
      trail: play ? scene.trail : null,
      player: play ? scene.player : null,
    }, palette);
  }

  function build(next_seed: number) {
    const cells = Number(size);
    seed = next_seed;
    built = { carver, size };
    scene.maze = create_maze(cells, cells);
    scene.start = 0;
    scene.goal = cells * cells - 1;
    scene.carving = true;
    scene.head = null;
    scene.marks = null;
    clear_solution();
    carving = carve_steps(carver, scene.maze, create_rng(next_seed));
    phase = Phase.CARVING;
    if (mode === Mode.PLAY) skip();
    reset_play();
    draw();
  }

  function new_maze() {
    build(random_seed());
  }

  function advance(count: number) {
    for (let i = 0; i < count; i++) {
      if (phase === Phase.CARVING && carving) {
        const next = carving.next();
        if (next.done) return finish_carving();
        scene.head = next.value.head;
        scene.marks = next.value.marks ?? null;
      } else if (phase === Phase.SOLVING && solving) {
        const next = solving.next();
        if (next.done) return finish_solving(next.value);
        scene.visited![next.value] = 1;
        scene.head = next.value;
        expanded++;
      } else return;
    }
  }

  function finish_carving() {
    carving = null;
    scene.carving = false;
    scene.head = null;
    scene.marks = null;
    phase = Phase.READY;
  }

  function finish_solving(path: number[]) {
    solving = null;
    scene.head = null;
    scene.path = path;
    path_length = path.length;
    phase = Phase.SOLVED;
  }

  function skip() {
    advance(Infinity);
    draw();
  }

  function clear_solution() {
    solving = null;
    scene.visited = null;
    scene.path = null;
    expanded = 0;
    path_length = null;
    if (phase === Phase.SOLVING) scene.head = null;
    if (phase === Phase.SOLVING || phase === Phase.SOLVED) phase = Phase.READY;
  }

  function start_solve() {
    if (phase === Phase.CARVING) skip();
    clear_solution();
    scene.visited = new Uint8Array(scene.maze.open.length);
    solving = solve_steps(solver, scene.maze, scene.start, scene.goal);
    phase = Phase.SOLVING;
    draw();
  }

  function set_mode(next: Mode) {
    if (next === mode) return;
    mode = next;
    if (next === Mode.PLAY) {
      if (phase === Phase.CARVING) skip();
      clear_solution();
      board?.focus();
    }
    reset_play();
  }

  function set_carver(next: Carver) {
    carver = next;
    new_maze();
  }

  function set_size(next: Size) {
    size = next;
    new_maze();
  }

  function reset_play() {
    scene.player = scene.start;
    scene.trail = new Uint8Array(scene.maze.open.length);
    scene.trail[scene.start] = 1;
    started = false;
    finished = false;
    record = false;
    timer_total = 0;
    timer_since = null;
  }

  function restart() {
    reset_play();
    draw();
    board?.focus();
  }

  function pause_timer() {
    if (timer_since === null) return;
    timer_total += performance.now() - timer_since;
    timer_since = null;
  }

  function move(direction: Direction, far: boolean) {
    if (mode !== Mode.PLAY || finished || phase === Phase.CARVING || scene.player === null) return;
    const from = scene.player;
    const cells = far ? run(scene.maze, from, direction, scene.goal) : [step(scene.maze, from, direction)];
    const to = cells.at(-1);
    if (to === undefined || to === from) return;
    if (!started) {
      started = true;
      timer_since = now = performance.now();
    }
    for (const cell of cells) scene.trail![cell] = 1;
    scene.player = to;
    if (to === scene.goal) finish_play();
    draw();
  }

  function finish_play() {
    pause_timer();
    finished = true;
    const previous = best.value[built.size];
    if (previous === undefined || timer_total < previous) {
      best.value[built.size] = timer_total;
      record = true;
    }
  }

  function on_keydown(event: KeyboardEvent) {
    if (mode !== Mode.PLAY || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    const direction = KEY_DIRECTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!direction) return;
    event.preventDefault();
    move(direction, event.shiftKey);
  }

  function on_pointerdown(event: PointerEvent) {
    if (mode !== Mode.PLAY) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function on_pointerup(event: PointerEvent) {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_DISTANCE) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? Direction.E : Direction.W, true);
    else move(dy > 0 ? Direction.S : Direction.N, true);
  }

  function observe_size(element: HTMLElement) {
    const observer = new ResizeObserver(() => {
      view = { w: element.clientWidth, h: element.clientHeight, dpr: window.devicePixelRatio || 1 };
    });
    observer.observe(element);
    return () => observer.disconnect();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented class="hidden @lg:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select class="w-24 @lg:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <div class="flex-1"></div>
    {#if mode === Mode.BUILD}
      <Select class="w-32" size="sm" aria-label="Algorithm" options={CARVER_OPTIONS} bind:value={() => carver, set_carver} />
    {:else if mode === Mode.SOLVE}
      <Select class="w-24" size="sm" aria-label="Solver" options={SOLVER_OPTIONS} bind:value={solver} />
    {/if}
    {#if mode !== Mode.SOLVE}
      <Select class="w-26" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    {/if}
    {#if mode !== Mode.PLAY}
      <Select class="w-24" size="sm" aria-label="Speed" options={SPEED_OPTIONS} bind:value={speed} />
    {/if}
    {#if busy}
      <Button size="sm" variant="primary" onclick={skip}><FastForwardIcon weight="bold" />Skip</Button>
    {:else if mode === Mode.SOLVE}
      <Button size="sm" variant="primary" onclick={start_solve}>Solve</Button>
    {:else}
      {#if mode === Mode.PLAY}
        <IconButton size="sm" label="Restart" onclick={restart}><RestartIcon weight="bold" /></IconButton>
      {/if}
      <Button size="sm" variant="primary" onclick={new_maze}>New maze</Button>
    {/if}
  </Toolbar>

  <div class="flex min-h-0 flex-col items-center gap-3 p-3">
    <p
      class={cn("text-sm font-semibold", timing && "font-mono tabular-nums")}
      aria-live={timing ? "off" : "polite"}
    >
      {status}
    </p>

    <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        {@attach observe_size}
        role="application"
        tabindex="0"
        aria-label={mode === Mode.PLAY ? "Maze. Arrow keys or WASD move, Shift runs to the next junction." : "Maze"}
        class={cn(
          "relative size-[100cqmin] rounded-lg bg-background-light ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail",
          mode === Mode.PLAY && "touch-none"
        )}
        onpointerdown={on_pointerdown}
        onpointerup={on_pointerup}
        onpointercancel={() => (swipe = null)}
      >
        <canvas
          bind:this={canvas}
          class="absolute inset-0 size-full"
          width={Math.round(view.w * view.dpr)}
          height={Math.round(view.h * view.dpr)}
        ></canvas>
      </div>
    </div>

    {#if mode === Mode.PLAY}
      <div class="hidden grid-cols-3 gap-1.5 pointer-coarse:grid" role="group" aria-label="Direction">
        {#each PAD as key (key.direction)}
          <IconButton
            size="lg"
            variant="secondary"
            label={key.label}
            class={key.area}
            disabled={finished}
            onclick={() => move(key.direction, true)}
          >
            <key.icon weight="bold" />
          </IconButton>
        {/each}
      </div>
    {/if}
  </div>

  <StatusBar>
    <span>{size_label(built.size)}</span>
    <span>{CARVER_LABELS[built.carver]}</span>
    <span class="hidden @sm:inline">Seed {seed.toString(16).padStart(8, "0")}</span>
    <span class="hidden @md:inline">Best {best_time === undefined ? "–" : format_time(best_time)}</span>
  </StatusBar>
</div>
