<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { daily_seed, format_time, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { day_key } from "$lib/core/utils/date";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { create_rng, random_seed, type Rng } from "$lib/core/utils/random";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowLineDown as ArrowLineDownIcon,
    ArrowRight as ArrowRightIcon,
    ChartBar as ChartBarIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Swap as SwapIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import BlocksPreview from "./blocks-preview.svelte";
  import { draw_field, read_palette, type Palette } from "./draw";
  import {
    CLEAR_MS,
    clear_name,
    create_game,
    empty_stats,
    hard_drop,
    HEIGHT,
    hold,
    Mode,
    mode_schema,
    MODES,
    move,
    NEXT_COUNT,
    record_marathon,
    record_sprint,
    repeats,
    rotate,
    set_status,
    soft_drop,
    SPRINT_LINES,
    stats_schema,
    Status,
    tick,
    WIDTH,
    type GameState,
    type Stats,
  } from "./game";

  const MODE_LABELS: Record<Mode, string> = { marathon: "Marathon", sprint: `Sprint ${SPRINT_LINES}` };
  const MODE_OPTIONS = MODES.map((value) => ({ value, label: MODE_LABELS[value] }));
  const TAP_MS = 250;

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const { app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const stats = storage.persisted<Stats>("stats", empty_stats(), stats_schema);

  // Per window, so two open games don't switch each other's mode; storage only remembers the last pick.
  let daily = $state(daily_day ?? null);
  // The daily is a sprint so its result is a time, which is what Game Hub records and compares.
  let mode = $state<Mode>(daily_day ? Mode.SPRINT : (storage.get("mode", mode_schema) ?? Mode.MARATHON));
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

  const input = { dir: 0 as -1 | 0 | 1, held_ms: 0, soft: false };
  let touch: { id: number; x: number; y: number; start_y: number; at: number; moved: boolean } | null = null;

  const queue = $derived(game.queue);
  const next = $derived(queue.slice(0, NEXT_COUNT));
  const finished = $derived(game.status === Status.OVER || game.status === Status.WON);
  const blocked = $derived(!win.is_focused || !win.is_visible);
  const running = $derived(game.status === Status.PLAYING && !blocked);
  const can_pause = $derived(game.status === Status.PLAYING || game.status === Status.PAUSED);
  const marathon = $derived(stats.value.marathon);
  const sprint = $derived(stats.value.sprint);
  const elapsed = $derived(clock.elapsed);
  const best_label = $derived(
    mode === Mode.MARATHON
      ? `Best ${marathon.best_score}`
      : `Best ${sprint.best_ms === null ? "–" : format_time(sprint.best_ms, { tenths: true })}`
  );

  function fresh_rng(): Rng {
    return create_rng(daily ? daily_seed(daily, app_id) : random_seed());
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
    const clear_ms = motion_reduced() ? 0 : CLEAR_MS;
    let carry = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function loop(now) {
      // Capped, so a stalled tab doesn't replay seconds of gravity at once.
      const elapsed = Math.min(100, now - last);
      last = now;
      let state = game;
      if (input.dir !== 0) {
        const before = input.held_ms;
        input.held_ms += elapsed;
        for (let i = repeats(before, input.held_ms); i > 0; i--) state = move(state, input.dir);
      }
      const result = tick(state, carry, elapsed, input.soft, rng, clear_ms);
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
    const width = Math.round(size.width * size.dpr);
    const height = Math.round((size.width / WIDTH) * HEIGHT * size.dpr);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) draw_field(ctx, game, size.width, size.dpr, palette);
  });

  function apply(next: GameState) {
    if (next === game) return;
    const previous = game;
    game = next;
    if (next.pieces > previous.pieces && next.last_clear > 0) {
      if (next.last_clear === 4) achievements.achieve("four-lines");
      announcement = next.level > previous.level ? `${clear_name(next.last_clear)}, level ${next.level}` : clear_name(next.last_clear);
    }
    if (next.status === Status.OVER || next.status === Status.WON) finish(next);
  }

  function finish(end: GameState) {
    release();
    final_ms = clock.pause();
    if (end.mode === Mode.MARATHON) {
      new_best = end.score > 0 && end.score > marathon.best_score;
      stats.value = record_marathon(stats.value, end, day_key());
      achievements.progress("level-10", end.level);
      achievements.progress("lines-500", stats.value.marathon.total_lines);
      return;
    }
    const won = end.status === Status.WON;
    new_best = won && (sprint.best_ms === null || final_ms < sprint.best_ms);
    stats.value = record_sprint(stats.value, won ? final_ms : null);
    if (won && daily) play.daily(daily, final_ms);
    if (!won) return;
    achievements.achieve("sprint");
    if (daily) achievements.achieve("daily");
    if (final_ms < 90_000) achievements.achieve("sprint-90");
  }

  function release() {
    input.dir = 0;
    input.held_ms = 0;
    input.soft = false;
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

  function set_mode(next: Mode) {
    daily = null;
    mode = next;
    storage.set("mode", next);
    new_game();
  }

  function act(action: (state: GameState) => GameState) {
    if (game.status === Status.READY) start();
    if (game.status === Status.PLAYING) apply(action(game));
  }

  function shift_start(dir: -1 | 1) {
    input.dir = dir;
    input.held_ms = 0;
    act((state) => move(state, dir));
  }

  function shift_end(dir: -1 | 1) {
    if (input.dir !== dir) return;
    input.dir = 0;
    input.held_ms = 0;
  }

  function soft_start() {
    input.soft = true;
    act(soft_drop);
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

    switch (code) {
      case "ArrowLeft":
      case "ArrowRight":
        if (!event.repeat) shift_start(code === "ArrowLeft" ? -1 : 1);
        break;
      case "ArrowDown":
        if (!event.repeat) soft_start();
        break;
      case "ArrowUp":
      case "KeyX":
        if (!event.repeat) act((state) => rotate(state, 1));
        break;
      case "KeyZ":
        if (!event.repeat) act((state) => rotate(state, -1));
        break;
      case "Space":
        if (!event.repeat) act((state) => hard_drop(state, rng, motion_reduced() ? 0 : CLEAR_MS));
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
    if (event.code === "ArrowLeft") shift_end(-1);
    else if (event.code === "ArrowRight") shift_end(1);
    else if (event.code === "ArrowDown") input.soft = false;
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" || !board) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    board.setPointerCapture(event.pointerId);
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, start_y: event.clientY, at: performance.now(), moved: false };
  }

  // One cell of finger travel moves the piece one column or soft-drops it one row; the anchor follows, so a long drag keeps going.
  function on_pointermove(event: PointerEvent) {
    if (!touch || touch.id !== event.pointerId || !board) return;
    const cell = board.clientWidth / WIDTH;
    while (Math.abs(event.clientX - touch.x) >= cell) {
      const dir = event.clientX > touch.x ? 1 : -1;
      touch.x += dir * cell;
      touch.moved = true;
      act((state) => move(state, dir));
    }
    while (event.clientY - touch.y >= cell) {
      touch.y += cell;
      touch.moved = true;
      act(soft_drop);
    }
  }

  function on_pointerup(event: PointerEvent) {
    if (!touch || touch.id !== event.pointerId || !board) return;
    const quick = performance.now() - touch.at < TAP_MS;
    const cell = board.clientWidth / WIDTH;
    if (quick && event.clientY - touch.start_y > cell * 2) act((state) => hard_drop(state, rng, motion_reduced() ? 0 : CLEAR_MS));
    else if (quick && !touch.moved) act((state) => rotate(state, 1));
  }

  function end_touch(event: PointerEvent) {
    if (touch?.id === event.pointerId) touch = null;
  }

  function hold_button(start_action: () => void, end_action: () => void) {
    return {
      onpointerdown: (event: PointerEvent) => {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        start_action();
      },
      onlostpointercapture: end_action,
    };
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Games played, best scores, best sprint time and the high score list go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown} onkeyup={on_keyup}>
  <Toolbar>
    <Segmented size="sm" class="hidden @lg:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
    <Select class="w-32 @lg:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => mode, set_mode} />
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
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col items-center gap-3 p-3">
      <div class="grid min-h-0 w-full flex-1 place-items-center [container-type:size]">
        <div class="stage grid grid-cols-[auto_auto_auto] items-start gap-[calc(var(--cell)*0.5)]">
          <div class="flex flex-col items-center gap-[calc(var(--cell)*0.3)]">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Hold</span>
            <BlocksPreview piece={game.hold} dim={!game.can_hold} />
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            bind:this={board}
            role="application"
            aria-label="Blocks field. Left and Right move, Down drops softly, Up or X rotates, Z rotates back, Space drops, C holds, P pauses."
            tabindex="0"
            class="relative h-[calc(var(--cell)*20)] w-[calc(var(--cell)*10)] touch-none overflow-hidden rounded-lg ring-1 ring-foreground/8 outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onpointerup={on_pointerup}
            onlostpointercapture={end_touch}
          >
            <canvas bind:this={canvas} class="block size-full"></canvas>

            {#if game.status === Status.READY}
              <div class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-[8%] text-center">
                <p class="text-ui text-foreground/80">
                  {daily ? `Daily sprint · ${SPRINT_LINES} lines` : mode === Mode.SPRINT ? `Clear ${SPRINT_LINES} lines` : "Arrows to move, Space to drop"}
                </p>
                <Button size="sm" variant="primary" onclick={start}>Start</Button>
              </div>
            {:else if game.status === Status.PAUSED}
              <BoardOverlay title="Paused" detail={mode === Mode.SPRINT ? `Lines ${game.lines}/${SPRINT_LINES}` : `Score ${game.score}`}>
                <Button size="sm" variant="primary" onclick={start}>Resume</Button>
              </BoardOverlay>
            {:else if game.status === Status.WON}
              <BoardOverlay title="{SPRINT_LINES} lines" detail="{format_time(final_ms, { tenths: true })}{new_best ? ' · New best' : ''}">
                <Button size="sm" variant="primary" onclick={new_game}>Play again</Button>
              </BoardOverlay>
            {:else if game.status === Status.OVER}
              <BoardOverlay
                title="Game over"
                detail={game.mode === Mode.SPRINT
                  ? `Lines ${game.lines}/${SPRINT_LINES}`
                  : `Score ${game.score} · Lines ${game.lines}${new_best ? " · New best" : ""}`}
              >
                <Button size="sm" variant="primary" onclick={new_game}>Play again</Button>
              </BoardOverlay>
            {/if}
          </div>

          <div class="flex flex-col items-center gap-[calc(var(--cell)*0.3)]">
            <span class="text-2xs tracking-wide text-foreground/65 uppercase">Next</span>
            {#each next as piece, i (i)}
              <BlocksPreview {piece} />
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
        <IconButton
          size="lg"
          variant="secondary"
          label="Drop"
          onclick={() => act((state) => hard_drop(state, rng, motion_reduced() ? 0 : CLEAR_MS))}
        >
          <ArrowLineDownIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label="Left" {...hold_button(() => shift_start(-1), () => shift_end(-1))}>
          <ArrowLeftIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" class="col-span-2 w-auto" label="Down" {...hold_button(soft_start, () => (input.soft = false))}>
          <ArrowDownIcon weight="bold" />
        </IconButton>
        <IconButton size="lg" variant="secondary" label="Right" {...hold_button(() => shift_start(1), () => shift_end(1))}>
          <ArrowRightIcon weight="bold" />
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
      <Section title="Statistics" description="Every finished game, per mode.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        <div class="flex flex-col gap-0.5 px-4 py-2.5">
          <span class={cn("text-ui", mode === Mode.MARATHON ? "font-medium" : "text-foreground/80")}>Marathon</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">
            Played {marathon.played} · Best {marathon.best_score} · Lines {marathon.best_lines} · Level {marathon.best_level}
          </span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">Total lines {marathon.total_lines}</span>
        </div>
        <div class="flex flex-col gap-0.5 px-4 py-2.5">
          <span class={cn("text-ui", mode === Mode.SPRINT ? "font-medium" : "text-foreground/80")}>{MODE_LABELS.sprint}</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">
            Played {sprint.played} · Finished {sprint.finished} · Best {sprint.best_ms === null ? "–" : format_time(sprint.best_ms, { tenths: true })}
          </span>
        </div>
      </Section>

      <Section title="High scores" description="The best marathon games.">
        {#if stats.value.scores.length === 0}
          <p class="px-4 py-2.5 text-ui text-foreground/65">No finished marathon yet.</p>
        {:else}
          <ol>
            {#each stats.value.scores as entry, i (i)}
              <li class="flex items-baseline gap-3 px-4 py-1.5">
                <span class="w-4 font-mono text-2xs text-foreground/65 tabular-nums">{i + 1}</span>
                <span class="flex-1 font-mono text-ui tabular-nums">{entry.score}</span>
                <span class="font-mono text-2xs text-foreground/65 tabular-nums">L{entry.lines} · Lv{entry.level} · {entry.day}</span>
              </li>
            {/each}
          </ol>
        {/if}
      </Section>
    </aside>
  </div>

  <StatusBar>
    {#if mode === Mode.SPRINT}
      <span>Lines {game.lines}/{SPRINT_LINES}</span>
      <span>{format_time(finished ? final_ms : elapsed, { tenths: true })}</span>
    {:else}
      <span>Score {game.score}</span>
      <span>Lines {game.lines}</span>
      <span>Level {game.level}</span>
    {/if}
    <span class="hidden @sm:inline">{best_label}</span>
    {#if daily}<span class="@md:hidden">Daily</span>{/if}
    <span class="hidden @2xl:inline">Arrows move · Up rotates · Space drops · C holds · P pauses</span>
  </StatusBar>
</div>

<style>
  .stage {
    --cell: min(100cqh / 20, 100cqw / 18);
    --mini: calc(var(--cell) * 0.6);
  }
</style>
