<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { create_rng, random_seed, type Rng } from "$lib/core/utils/random";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowLineDown as ArrowLineDownIcon,
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    ArrowLineUp as ArrowLineUpIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    ChartBar as ChartBarIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Swap as SwapIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import FourWallsPreview from "./four-walls-preview.svelte";
  import { draw_field, read_palette, type Palette } from "./draw";
  import {
    ALL_WALLS,
    arrow_for,
    CLEAR_MS,
    clear_name,
    create_game,
    Direction,
    empty_best,
    best_schema,
    hard_drop,
    hold,
    Mode,
    mode_schema,
    MODES,
    move,
    NEXT_COUNT,
    record_best,
    repeats,
    rotate,
    set_status,
    soft_drop,
    Status,
    step_of,
    tick,
    to_frame,
    type Best,
    type GameState,
  } from "./game";

  const MODE_LABELS: Record<Mode, string> = { cycle: "Cycle", random: "Random" };
  const MODE_OPTIONS = MODES.map((value) => ({ value, label: MODE_LABELS[value] }));
  const ARROW_LABELS: Record<Direction, string> = { down: "Down", left: "Left", up: "Up", right: "Right" };
  const ARROW_ICONS = { down: ArrowDownIcon, left: ArrowLeftIcon, up: ArrowUpIcon, right: ArrowRightIcon };
  const DROP_ICONS = { down: ArrowLineDownIcon, left: ArrowLineLeftIcon, up: ArrowLineUpIcon, right: ArrowLineRightIcon };
  const KEY_ARROWS: Record<string, Direction> = {
    ArrowDown: Direction.DOWN,
    ArrowLeft: Direction.LEFT,
    ArrowUp: Direction.UP,
    ArrowRight: Direction.RIGHT,
  };
  const TAP_MS = 250;

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const best = storage.persisted<Best>("best", empty_best(), best_schema);

  // Per window, so two open games don't switch each other's mode; storage only remembers the last pick.
  let daily = $state(daily_day ?? null);
  // The daily deals Random from the day's seed, so every player gets the same pieces and walls.
  let mode = $state<Mode>(daily_day ? Mode.RANDOM : (storage.get("mode", mode_schema) ?? Mode.CYCLE));
  let rng: Rng = untrack(() => fresh_rng());
  let game = $state.raw<GameState>(untrack(() => create_game(rng, { mode })));
  const clock = new Stopwatch(() => win.is_visible);
  let final_ms = $state(0);
  let new_best = $state(false);
  let show_stats = $state(false);
  let announcement = $state("");
  let size = $state({ width: 0, dpr: 1 });
  let palette = $state.raw<Palette | null>(null);
  let canvas: HTMLCanvasElement | undefined = $state();
  let board: HTMLDivElement | undefined = $state();
  let root: HTMLDivElement | undefined = $state();

  // Arrows are kept as board directions: what they do depends on the wall of the piece in play when they act.
  const input = { steer: null as Direction | null, held_ms: 0, soft: null as Direction | null };
  let touch: { id: number; x: number; y: number; start_x: number; start_y: number; at: number; moved: boolean } | null =
    null;

  const next = $derived(game.queue.slice(0, NEXT_COUNT));
  const way = $derived(game.active?.direction ?? game.queue[0]?.direction ?? Direction.DOWN);
  // The steer buttons sit in screen order (left or up first), whichever way the piece faces.
  const pad = $derived.by(() => {
    const a = arrow_for(way, { x: -1, y: 0 });
    const b = arrow_for(way, { x: 1, y: 0 });
    return a === Direction.LEFT || a === Direction.UP ? { back: a, forth: b } : { back: b, forth: a };
  });
  const finished = $derived(game.status === Status.OVER);
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const running = $derived(game.status === Status.PLAYING && !blocked);
  const can_pause = $derived(game.status === Status.PLAYING || game.status === Status.PAUSED);
  const mode_best = $derived(best.value[mode]);

  function fresh_rng(): Rng {
    return create_rng(daily ? daily_seed(daily, app_id) : random_seed());
  }

  function clear_ms(): number {
    return motion_reduced() ? 0 : CLEAR_MS;
  }

  $effect(() => {
    if (!blocked) return;
    untrack(() => pause());
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!running) return;
    const ms = clear_ms();
    let carry = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      // Capped, so a stalled tab doesn't replay seconds of gravity at once.
      const elapsed = Math.min(100, now - last);
      last = now;
      let state = game;
      const steer = input.steer && state.active ? across(state, input.steer) : 0;
      if (steer !== 0) {
        const before = input.held_ms;
        input.held_ms += elapsed;
        for (let i = repeats(before, input.held_ms); i > 0; i--) state = move(state, steer);
      }
      const soft = input.soft !== null && input.soft === state.active?.direction;
      const result = tick(state, carry, elapsed, soft, rng, ms);
      carry = result.carry;
      apply(result.state);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!canvas) return;
    const target = canvas;
    const observer = new ResizeObserver(([entry]) => {
      size = { width: entry.contentBoxSize[0].inlineSize, dpr: window.devicePixelRatio };
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
    const side = Math.round(size.width * size.dpr);
    if (canvas.width !== side) canvas.width = side;
    if (canvas.height !== side) canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (ctx) draw_field(ctx, game, size.width, size.dpr, palette);
  });

  function across(state: GameState, arrow: Direction): -1 | 0 | 1 {
    if (!state.active) return 0;
    const step = step_of(arrow);
    const local = to_frame(state.active.direction, step.x, step.y);
    return local.y === 0 ? (local.x as -1 | 1) : 0;
  }

  function apply(next_state: GameState) {
    if (next_state === game) return;
    const previous = game;
    game = next_state;
    if (next_state.pieces > previous.pieces && next_state.last_clear > 0) {
      if (next_state.last_clear >= 4) achievements.achieve("four-lines");
      if (next_state.last_zones >= 2) achievements.achieve("two-walls");
      if (next_state.walls === ALL_WALLS) achievements.achieve("every-wall");
      const name = clear_name(next_state.last_clear, next_state.last_zones);
      announcement = next_state.level > previous.level ? `${name}, level ${next_state.level}` : name;
    }
    if (next_state.status === Status.OVER) finish(next_state);
  }

  function finish(end: GameState) {
    release();
    final_ms = clock.pause();
    new_best = end.score > 0 && end.score > best.value[end.mode].score;
    best.value = record_best(best.value, end);
    achievements.progress("level-10", end.level);
    achievements.progress("lines-50", end.lines);
    if (!daily) return;
    play.daily(daily, final_ms, end.score);
    achievements.achieve("daily");
  }

  function release() {
    input.steer = null;
    input.held_ms = 0;
    input.soft = null;
  }

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function start() {
    if (game.status !== Status.READY && game.status !== Status.PAUSED) return;
    game = set_status(game, Status.PLAYING);
    clock.start();
    focus_board();
  }

  function pause() {
    release();
    if (game.status !== Status.PLAYING) return;
    game = set_status(game, Status.PAUSED);
    clock.pause();
  }

  function toggle_pause() {
    if (game.status === Status.PLAYING) pause();
    else start();
  }

  function new_game() {
    release();
    rng = fresh_rng();
    game = create_game(rng, { mode });
    clock.reset();
    new_best = false;
    announcement = "";
    focus_board();
  }

  function set_mode(next_mode: Mode) {
    daily = null;
    mode = next_mode;
    storage.set("mode", next_mode);
    new_game();
  }

  function act(action: (state: GameState) => GameState) {
    if (game.status === Status.READY) start();
    if (game.status === Status.PLAYING) apply(action(game));
  }

  function press(arrow: Direction) {
    if (game.status === Status.READY) start();
    const direction = game.active?.direction;
    if (arrow === direction) {
      input.soft = arrow;
      act(soft_drop);
      return;
    }
    input.steer = arrow;
    input.held_ms = 0;
    const steer = across(game, arrow);
    if (steer !== 0) act((state) => move(state, steer));
    else if (direction) act((state) => rotate(state, 1));
  }

  function lift(arrow: Direction) {
    if (input.soft === arrow) input.soft = null;
    if (input.steer !== arrow) return;
    input.steer = null;
    input.held_ms = 0;
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;
    const code = event.code;

    if (code === "KeyP" || code === "Escape") {
      if (code === "Escape" && game.status !== Status.PLAYING) return;
      if (!can_pause) return;
      event.preventDefault();
      toggle_pause();
      return;
    }
    if (target instanceof HTMLButtonElement && (code === "Space" || code === "Enter")) return;
    // Enter only: a Space still held from hard drops would skip the result.
    if (finished || game.status === Status.PAUSED) {
      if (code !== "Enter") return;
      event.preventDefault();
      if (finished) new_game();
      else start();
      return;
    }

    const arrow = KEY_ARROWS[code];
    if (arrow) {
      if (!event.repeat) press(arrow);
      event.preventDefault();
      return;
    }
    switch (code) {
      case "KeyX":
        if (!event.repeat) act((state) => rotate(state, 1));
        break;
      case "KeyZ":
        if (!event.repeat) act((state) => rotate(state, -1));
        break;
      case "Space":
        if (!event.repeat) act((state) => hard_drop(state, rng, clear_ms()));
        break;
      case "KeyC":
      case "ShiftLeft":
      case "ShiftRight":
        if (!event.repeat) act((state) => hold(state, rng));
        break;
      case "Enter":
        if (target !== board) return;
        start();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  function on_keyup(event: KeyboardEvent) {
    const arrow = KEY_ARROWS[event.code];
    if (arrow) lift(arrow);
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" || !board) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    board.setPointerCapture(event.pointerId);
    const { clientX: x, clientY: y } = event;
    touch = { id: event.pointerId, x, y, start_x: x, start_y: y, at: performance.now(), moved: false };
  }

  // One cell of finger travel across the piece's way steers it a cell, one along it soft-drops a row; the anchor follows.
  function on_pointermove(event: PointerEvent) {
    if (!touch || touch.id !== event.pointerId || !board || !game.active) return;
    const cell = board.clientWidth / game.size;
    const direction = game.active.direction;
    const way_step = step_of(direction);
    for (let guard = 0; guard < game.size * 2; guard++) {
      const local = to_frame(direction, event.clientX - touch.x, event.clientY - touch.y);
      if (Math.abs(local.x) >= cell) {
        const steer = local.x > 0 ? 1 : -1;
        const arrow = arrow_for(direction, { x: steer, y: 0 });
        touch.x += step_of(arrow).x * cell;
        touch.y += step_of(arrow).y * cell;
        touch.moved = true;
        act((state) => move(state, steer));
      } else if (local.y >= cell) {
        touch.x += way_step.x * cell;
        touch.y += way_step.y * cell;
        touch.moved = true;
        act(soft_drop);
      } else break;
    }
  }

  function on_pointerup(event: PointerEvent) {
    if (!touch || touch.id !== event.pointerId || !board) return;
    const quick = performance.now() - touch.at < TAP_MS;
    const cell = board.clientWidth / game.size;
    const direction = game.active?.direction ?? way;
    const flick = to_frame(direction, event.clientX - touch.start_x, event.clientY - touch.start_y).y;
    if (quick && flick > cell * 2) act((state) => hard_drop(state, rng, clear_ms()));
    else if (quick && !touch.moved) act((state) => rotate(state, 1));
  }

  function end_touch(event: PointerEvent) {
    if (touch?.id === event.pointerId) touch = null;
  }

  function hold_arrow(arrow: () => Direction) {
    let held: Direction | null = null;
    return {
      onpointerdown: (event: PointerEvent) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        held = arrow();
        press(held);
      },
      onlostpointercapture: () => {
        if (held) lift(held);
        held = null;
      },
    };
  }

  async function reset_best() {
    const confirmed = await win.confirm("Reset best scores?", {
      detail: "The best score and lines of both modes go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) best.value = empty_best();
  }

  const BackIcon = $derived(ARROW_ICONS[pad.back]);
  const ForthIcon = $derived(ARROW_ICONS[pad.forth]);
  const WayIcon = $derived(ARROW_ICONS[way]);
  const DropIcon = $derived(DROP_ICONS[way]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown} onkeyup={on_keyup}>
  <Toolbar>
    <Segmented size="sm" class="hidden @lg:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select class="w-28 @lg:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    {#if daily}<span class="hidden px-1.5 text-ui font-medium @md:inline">Daily · {daily}</span>{/if}
    <div class="flex-1"></div>
    <IconButton
      size="sm"
      label={game.status === Status.PLAYING ? "Pause (P)" : "Resume (P)"}
      disabled={!can_pause}
      onclick={toggle_pause}
    >
      {#if game.status === Status.PLAYING}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
    </IconButton>
    <IconButton size="sm" label="Best scores" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col items-center gap-3 p-3">
      <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
        <div class="stage grid grid-cols-[auto_auto_auto] items-start gap-[calc(var(--cell)*0.4)]" style:--size={game.size}>
          <div class="stage-hold flex flex-col items-center gap-[calc(var(--cell)*0.3)]">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Hold</span>
            <FourWallsPreview piece={game.hold} dim={!game.can_hold} />
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            bind:this={board}
            role="application"
            aria-label="Four Walls board. Each piece falls toward the wall its arrow shows. The arrows across its way steer, its own arrow drops softly, the opposite arrow or X rotates, Z rotates back, Space drops, C holds, P pauses."
            tabindex="0"
            class="stage-board relative size-[calc(var(--cell)*var(--size))] touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onpointerup={on_pointerup}
            onlostpointercapture={end_touch}
          >
            <canvas bind:this={canvas} class="block size-full"></canvas>

            {#if game.status === Status.READY}
              <BoardOverlay
                title={daily ? "Daily" : mode === Mode.CYCLE ? "Cycle" : "Random"}
                detail={daily ? "The same pieces and walls for everyone" : mode === Mode.CYCLE ? "Walls go round, turning back every 10 pieces" : "Every piece picks its own wall"}
              >
                <Button size="sm" variant="primary" onclick={start}>Start</Button>
              </BoardOverlay>
            {:else if game.status === Status.PAUSED}
              <BoardOverlay title="Paused" detail="Score {game.score}">
                <Button size="sm" variant="primary" onclick={start}>Resume</Button>
              </BoardOverlay>
            {:else if game.status === Status.OVER}
              <BoardOverlay title="Game over" detail="Score {game.score} · Lines {game.lines}{new_best ? ' · New best' : ''}">
                <Button size="sm" variant="primary" onclick={new_game}>Play again</Button>
              </BoardOverlay>
            {/if}
          </div>

          <div class="stage-next flex flex-col items-center gap-[calc(var(--cell)*0.3)]">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Next</span>
            {#each next as turn, i (i)}
              <FourWallsPreview piece={turn.piece} direction={turn.direction} />
            {/each}
          </div>
        </div>
      </div>
      <p class="sr-only" aria-live="polite">{announcement}</p>

      <div class="hidden grid-cols-4 gap-1.5 pointer-coarse:grid" role="group" aria-label="Controls">
        <IconButton size="lg" variant="secondary" label="Hold" onclick={() => act((state) => hold(state, rng))}>
          <SwapIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label="Rotate left" onclick={() => act((state) => rotate(state, -1))}>
          <ArrowCounterClockwiseIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label="Rotate right" onclick={() => act((state) => rotate(state, 1))}>
          <ArrowClockwiseIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label="Drop" onclick={() => act((state) => hard_drop(state, rng, clear_ms()))}>
          <DropIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label={ARROW_LABELS[pad.back]} {...hold_arrow(() => pad.back)}>
          <BackIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" class="col-span-2 w-auto" label={ARROW_LABELS[way]} {...hold_arrow(() => way)}>
          <WayIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label={ARROW_LABELS[pad.forth]} {...hold_arrow(() => pad.forth)}>
          <ForthIcon weight="bold" />
        </IconButton>
      </div>
    </div>

    <aside
      class={cn(
        "flex flex-col gap-5 overflow-auto p-4 @3xl:static @3xl:flex @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-foreground/8 @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @3xl:hidden" />
      <Section title="Best" description="Your best game in each mode. The daily counts as Random.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_best}>Reset</Button>
        {/snippet}
        {#each MODES as each (each)}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", mode === each ? "font-medium" : "text-foreground/80")}>{MODE_LABELS[each]}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Score {best.value[each].score} · Lines {best.value[each].lines}
            </span>
          </div>
        {/each}
      </Section>

      <Section title="How it plays">
        <ul class="flex flex-col gap-1.5 px-4 py-2.5 text-ui text-foreground/80">
          <li>The diagonals split the board into four walls' zones.</li>
          <li>A row of a zone that runs along its wall clears, and the zone slides toward its wall.</li>
          <li>The arrow beside each piece in Next is the wall it falls to.</li>
          <li>The middle four cells never clear.</li>
          <li>The game ends when a new piece has no room in the middle.</li>
        </ul>
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span>Score {game.score}</span>
    <span>Lines {game.lines}</span>
    <span>Level {game.level}</span>
    <span class="hidden @sm:inline">Best {mode_best.score}</span>
    {#if daily}<span class="@md:hidden">Daily</span>{/if}
    <span class="hidden @2xl:inline">Arrows steer and drop · X rotates · Space drops · C holds · P pauses</span>
  </StatusBar>
</div>

<style>
  .stage {
    --cell: min(100cqh / var(--size), 100cqw / (var(--size) + 6));
    --mini: calc(var(--cell) * 0.5);
  }

  /* Tall boxes (phones, narrow windows): Hold and Next sit in a row above the board so it gets the full width. */
  @container (orientation: portrait) {
    .stage {
      --cell: min(100cqw / var(--size), 100cqh / (var(--size) + 5));
      grid-template-columns: auto 1fr;
      grid-template-areas: "hold next" "board board";
      row-gap: calc(var(--cell) * 0.5);
    }
    .stage-hold,
    .stage-next {
      flex-direction: row;
    }
    .stage-hold {
      grid-area: hold;
    }
    .stage-next {
      grid-area: next;
      justify-self: end;
      column-gap: calc(var(--cell) * 0.9);
    }
    .stage-next > :global(:nth-child(n + 4)) {
      display: none;
    }
    .stage-board {
      grid-area: board;
    }
  }
</style>
