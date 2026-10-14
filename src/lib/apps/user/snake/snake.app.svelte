<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { track_play } from "$lib/core/games";
  import { BoardOverlay, Button, IconButton, Segmented, Select, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { draw_board, read_palette, type Palette } from "./draw";
  import {
    create_game,
    Direction,
    fixed_steps,
    high_scores_schema,
    key_direction,
    mode_key,
    set_status,
    Speed,
    SPEEDS,
    speed_schema,
    Status,
    step,
    STEP_MS,
    swipe_direction,
    turn,
    type HighScores,
  } from "./game";

  const SPEED_LABELS: Record<Speed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };
  const SPEED_OPTIONS = SPEEDS.map((value) => ({ value, label: SPEED_LABELS[value] }));
  const SWIPE_THRESHOLD = 24;

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { app_id, window: win, storage } = get_app_context();
  track_play(app_id, () => win.is_visible);
  const high_scores = storage.persisted<HighScores>("high_scores", {}, high_scores_schema);

  // Per window, so two open games don't change each other's mode; storage only remembers the last pick.
  let speed = $state<Speed>(storage.get("speed", speed_schema) ?? Speed.NORMAL);
  let wrap = $state(storage.get("wrap", z.boolean()) ?? false);
  let game = $state.raw(create_game(Math.random, untrack(() => wrap)));
  let new_best = $state(false);
  let size = $state({ width: 0, height: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();
  let swipe: { id: number; x: number; y: number } | null = null;

  const key = $derived(mode_key(speed, wrap));
  const best = $derived(high_scores.value[key] ?? 0);
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const running = $derived(game.status === Status.PLAYING && !blocked);
  const can_pause = $derived(game.status === Status.PLAYING || game.status === Status.PAUSED);

  $effect(() => {
    if (!blocked) return;
    untrack(() => {
      if (game.status === Status.PLAYING) game = set_status(game, Status.PAUSED);
    });
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!running) return;
    const step_ms = STEP_MS[speed];
    let accumulator = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const result = fixed_steps(accumulator, now - last, step_ms);
      last = now;
      accumulator = result.remainder;
      if (result.steps > 0) advance(result.steps);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!canvas) return;
    const target = canvas;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize[0];
      size = { width: box.inlineSize, height: box.blockSize, dpr: window.devicePixelRatio };
    });
    observer.observe(target);
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
    if (ctx) draw_board(ctx, game, size.width, size.dpr, palette);
  });

  function advance(steps: number) {
    let next = game;
    for (let i = 0; i < steps && next.status === Status.PLAYING; i++) next = step(next, Math.random);
    game = next;
    if (next.status === Status.OVER || next.status === Status.WON) record(next.score);
  }

  function record(score: number) {
    new_best = score > best;
    if (new_best) high_scores.value[key] = score;
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function play() {
    if (game.status !== Status.READY && game.status !== Status.PAUSED) return;
    game = set_status(game, Status.PLAYING);
    focus_board();
  }

  function pause() {
    if (game.status === Status.PLAYING) game = set_status(game, Status.PAUSED);
  }

  function toggle_pause() {
    if (game.status === Status.PLAYING) pause();
    else play();
  }

  function new_game() {
    game = create_game(Math.random, wrap);
    new_best = false;
    focus_board();
  }

  function steer(direction: Direction) {
    if (game.status === Status.OVER || game.status === Status.WON) return;
    game = turn(game, direction);
    play();
  }

  function set_speed(next: Speed) {
    speed = next;
    storage.set("speed", next);
    new_game();
  }

  function set_wrap(next: boolean) {
    wrap = next;
    storage.set("wrap", next);
    new_game();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;

    const direction = key_direction(event.code);
    if (direction) {
      event.preventDefault();
      steer(direction);
      return;
    }
    if (event.code === "Space" || event.code === "KeyP" || event.code === "Escape") {
      if (target instanceof HTMLButtonElement && event.code === "Space") return;
      if (event.code === "Escape" && game.status !== Status.PLAYING) return;
      event.preventDefault();
      if (game.status === Status.OVER || game.status === Status.WON) new_game();
      else toggle_pause();
    } else if (event.code === "Enter" && target === board) {
      event.preventDefault();
      if (game.status === Status.OVER || game.status === Status.WON) new_game();
      else play();
    }
  }

  function on_pointerdown(event: PointerEvent) {
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function on_pointermove(event: PointerEvent) {
    if (!swipe || swipe.id !== event.pointerId) return;
    const direction = swipe_direction(event.clientX - swipe.x, event.clientY - swipe.y, SWIPE_THRESHOLD);
    if (!direction) return;
    // Measured again from here, so one continuous drag can steer several times.
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    steer(direction);
  }

  function end_swipe(event: PointerEvent) {
    if (swipe?.id === event.pointerId) swipe = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented
      size="sm"
      class="hidden @lg:inline-flex"
      label="Speed"
      options={SPEED_OPTIONS}
      bind:value={() => speed, set_speed}
    />
    <Select
      class="w-28 @lg:hidden"
      size="sm"
      aria-label="Speed"
      options={SPEED_OPTIONS}
      bind:value={() => speed, set_speed}
    />
    <label class="flex items-center gap-2 px-1 text-ui">
      Wrap
      <Switch bind:checked={() => wrap, set_wrap} />
    </label>
    <div class="flex-1"></div>
    <IconButton
      size="sm"
      label={game.status === Status.PLAYING ? "Pause (Space)" : "Resume (Space)"}
      disabled={!can_pause}
      onclick={toggle_pause}
    >
      {#if game.status === Status.PLAYING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
  </Toolbar>

  <div class="flex min-h-0 flex-col items-center gap-3 p-3">
    <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label="Snake board. Arrow keys or WASD to steer, Space to pause."
        tabindex="0"
        class="relative size-[100cqmin] touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
        onpointerdown={on_pointerdown}
        onpointermove={on_pointermove}
        onpointerup={end_swipe}
        onpointercancel={end_swipe}
      >
        <canvas bind:this={canvas} class="block size-full"></canvas>

        {#if game.status === Status.READY}
          <!-- Below the snake, which starts in the middle, so the player sees where it is and which way it faces. -->
          <div class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-[8cqmin] text-center" aria-live="polite">
            <p class="text-ui text-foreground/80">Arrow keys, WASD or a swipe to start</p>
            <Button size="sm" variant="primary" onclick={play}>Start</Button>
          </div>
        {:else if game.status === Status.PAUSED}
          <BoardOverlay title="Paused" detail="Score {game.score}">
            <Button size="sm" variant="primary" onclick={play}>Resume</Button>
          </BoardOverlay>
        {:else if game.status !== Status.PLAYING}
          <BoardOverlay title={game.status === Status.WON ? "You filled the board" : "Game over"} detail="Score {game.score}{new_best ? ' · New best' : ''}">
            <Button size="sm" variant="primary" onclick={new_game}>Play again</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <div class="hidden grid-cols-3 gap-1.5 pointer-coarse:grid" role="group" aria-label="Direction">
      <IconButton size="lg" variant="secondary" class="col-start-2" label="Up" onclick={() => steer(Direction.UP)}>
        <ArrowUpIcon weight="bold" />
      </IconButton>
      <IconButton size="lg" variant="secondary" class="col-start-1" label="Left" onclick={() => steer(Direction.LEFT)}>
        <ArrowLeftIcon weight="bold" />
      </IconButton>
      <IconButton size="lg" variant="secondary" label="Down" onclick={() => steer(Direction.DOWN)}>
        <ArrowDownIcon weight="bold" />
      </IconButton>
      <IconButton size="lg" variant="secondary" label="Right" onclick={() => steer(Direction.RIGHT)}>
        <ArrowRightIcon weight="bold" />
      </IconButton>
    </div>
  </div>

  <StatusBar>
    <span>Score {game.score}</span>
    <span>Best {best}</span>
    <span>{SPEED_LABELS[speed]} · {wrap ? "Wrap" : "Walls"}</span>
    <span class="hidden @md:inline">Arrows or WASD to steer, Space to pause</span>
  </StatusBar>
</div>
