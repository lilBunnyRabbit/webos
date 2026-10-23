<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Direction, format_time, key_direction, Stopwatch, swipe_direction, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowCounterClockwise as RestartIcon,
    ArrowDown as ArrowDownIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUp as ArrowUpIcon,
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    ChartBar as ChartBarIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    bests_schema,
    better,
    DAILY_DIFFICULTY,
    daily_game,
    daily_saved_schema,
    DIFFICULTIES,
    Difficulty,
    difficulty_schema,
    empty_stats,
    is_solved,
    level_key,
    move,
    move_count,
    new_game,
    push_count,
    record,
    record_best,
    redo,
    restart,
    restore,
    saved_schema,
    stats_schema,
    undo,
    type Game,
    type Saved,
  } from "./game";
  import { Tile } from "./puzzle";

  const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] }));
  const SWIPE_THRESHOLD_PX = 24;
  const PAD = [
    { direction: Direction.UP, label: "Up", icon: ArrowUpIcon, area: "col-start-2 row-start-1" },
    { direction: Direction.LEFT, label: "Left", icon: ArrowLeftIcon, area: "col-start-1 row-start-2" },
    { direction: Direction.DOWN, label: "Down", icon: ArrowDownIcon, area: "col-start-2 row-start-2" },
    { direction: Direction.RIGHT, label: "Right", icon: ArrowRightIcon, area: "col-start-3 row-start-2" },
  ];

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);
  const bests = storage.persisted("bests", {}, bests_schema);

  // Per window, so two open games don't overwrite each other; storage keeps the last one touched for next time.
  // A daily level saves under its own key, so it never replaces the regular game.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  const initial_difficulty = daily_day
    ? DAILY_DIFFICULTY
    : (restored?.difficulty ?? storage.get("difficulty", difficulty_schema) ?? Difficulty.EASY);
  let daily = $state(daily_day ?? null);
  let difficulty = $state<Difficulty>(initial_difficulty);
  let game = $state.raw<Game>(restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_difficulty, random_seed())));
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  let new_best = $state(false);
  let show_stats = $state(false);
  let swipe: { pointer: number; x: number; y: number } | null = null;
  let root = $state<HTMLDivElement>();
  let board = $state<HTMLDivElement>();

  const level = $derived(game.level);
  const solved = $derived(is_solved(game));
  const moves = $derived(move_count(game));
  const pushes = $derived(push_count(game));
  const elapsed = $derived(clock.elapsed);
  const key = $derived(level_key(game.difficulty, game.seed));
  const level_best = $derived(bests.value[key]);
  const placed = $derived(game.boxes.filter((box) => level.goals.includes(box)).length);
  const goal_set = $derived(new Set(level.goals));

  const status = $derived.by(() => {
    if (solved) return `Solved in ${moves} moves${new_best ? ", a new best" : ""}`;
    if (!moves) return "Push every crate onto a goal";
    if (daily) return `Daily · ${daily}`;
    return `${placed} of ${level.goals.length} on goals`;
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `sokoban.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", step_back),
      scoped("redo", "mod+shift+z", "Redo", step_forward),
      scoped("redo-alt", "mod+y", "Redo", step_forward),
      scoped("restart", "r", "Restart level", start_again),
      scoped("new", "f2", "New level", () => new_level()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  // The window frame focuses itself when it comes to the front; the keys belong on the board inside it.
  $effect(() => {
    if (win.is_focused && board && !root?.contains(document.activeElement)) board.focus({ preventScroll: true });
  });

  function save() {
    const entry: Saved = {
      difficulty: game.difficulty,
      seed: game.seed,
      log: game.log,
      future: game.future,
      elapsed: clock.read(),
    };
    if (daily) storage.set("daily", { day: daily, game: entry });
    else storage.set("game", entry);
  }

  function update(next: Game) {
    if (next === game) return;
    game = next;
    if (!clock.running && !is_solved(next) && next.log) clock.start();
    if (is_solved(next)) finish();
    save();
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    const result = { moves: move_count(game), pushes: push_count(game) };
    const previous = bests.value[key];
    new_best = previous !== undefined && better(result, previous);
    bests.value = record_best(bests.value, key, result);
    stats.value = record(stats.value, game.difficulty, time);
  }

  function step(direction: Direction) {
    update(move(game, direction));
  }

  function step_back() {
    if (!solved) update(undo(game));
  }

  function step_forward() {
    if (!solved) update(redo(game));
  }

  function start_again() {
    // After a solve the redo would replay the answer for a free second solve.
    const fresh = restart(game);
    if (solved) {
      clock.reset();
      new_best = false;
    }
    update(solved ? { ...fresh, future: "" } : fresh);
    board?.focus({ preventScroll: true });
  }

  async function new_level(next: Difficulty = difficulty) {
    if (game.log && !solved) {
      const confirmed = await win.confirm(next === difficulty ? "Start a new level?" : `Switch to ${DIFFICULTY_LABELS[next]}?`, {
        detail: "The moves on this level are lost. Statistics and best scores stay.",
        confirm_label: next === difficulty ? "New level" : "Switch",
      });
      if (!confirmed) return;
    }
    daily = null;
    difficulty = next;
    storage.set("difficulty", next);
    game = new_game(next, random_seed());
    clock.reset();
    new_best = false;
    save();
    board?.focus({ preventScroll: true });
  }

  function set_difficulty(next: Difficulty) {
    if (next !== difficulty) new_level(next);
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
    const direction = key_direction(event.code);
    if (!direction) return;
    event.preventDefault();
    step(direction);
  }

  function on_pointerdown(event: PointerEvent) {
    // Capturing over the end screen would retarget its buttons' clicks to the board.
    if (!event.isPrimary || event.button !== 0 || solved) return;
    swipe = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointerup(event: PointerEvent) {
    if (!swipe || swipe.pointer !== event.pointerId) return;
    const direction = swipe_direction(event.clientX - swipe.x, event.clientY - swipe.y, SWIPE_THRESHOLD_PX);
    swipe = null;
    if (direction) step(direction);
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Solved counts, best times and the fewest moves for every level go back to zero. The level in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (!confirmed) return;
    stats.value = empty_stats();
    bests.value = {};
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented
      size="sm"
      class="hidden @xl:inline-flex"
      label="Difficulty"
      options={DIFFICULTY_OPTIONS}
      bind:value={() => difficulty, set_difficulty}
    />
    <Select
      class="w-28 @xl:hidden"
      size="sm"
      aria-label="Difficulty"
      options={DIFFICULTY_OPTIONS}
      bind:value={() => difficulty, set_difficulty}
    />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!game.log || solved} onclick={step_back}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton
      size="sm"
      label="Redo (Ctrl+Shift+Z)"
      class="hidden @md:inline-flex pointer-coarse:hidden"
      disabled={!game.future || solved}
      onclick={step_forward}
    >
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Restart level (R)" disabled={!game.log} onclick={start_again}>
      <RestartIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @sm:inline-flex" onclick={() => new_level()}>New level</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 p-3 [container-type:size]">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        tabindex="0"
        aria-label="Sokoban, {level.goals.length} crates. Arrow keys or WASD move, Ctrl+Z undoes, R restarts"
        class="board relative m-auto touch-none rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
        style:--cols={level.width}
        style:--rows={level.height}
        onpointerdown={on_pointerdown}
        onpointerup={on_pointerup}
        onlostpointercapture={() => (swipe = null)}
      >
        <div class="tiles grid" aria-hidden="true">
          {#each level.tiles as tile, index (index)}
            <div
              class={cn(
                "grid place-items-center",
                tile === Tile.WALL && "rounded-[12%] bg-foreground/22 shadow-raised",
                tile === Tile.FLOOR && "bg-foreground/7"
              )}
            >
              {#if goal_set.has(index)}
                <span class="size-[38%] rounded-full border-2 border-cottontail"></span>
              {/if}
            </div>
          {/each}
        </div>

        {#each game.boxes as box, id (id)}
          {@const home = goal_set.has(box)}
          <div class="piece" style:--row={Math.floor(box / level.width)} style:--col={box % level.width} aria-hidden="true">
            <div class={cn("size-[80%] rounded-[18%] shadow-control ring-2 ring-background/35 ring-inset", home ? "bg-success" : "bg-secondary")}></div>
          </div>
        {/each}

        <div
          class="piece"
          style:--row={Math.floor(game.player / level.width)}
          style:--col={game.player % level.width}
          aria-hidden="true"
        >
          <div class="size-[62%] rounded-full bg-primary shadow-control"></div>
        </div>

        {#if solved}
          <BoardOverlay
            class="z-20"
            title="Solved"
            detail="{moves} moves · {pushes} pushes · {format_time(elapsed)}{level_best ? ` · Best ${level_best.moves}/${level_best.pushes}` : ''}"
          >
            <Button size="sm" variant="quiet" onclick={start_again}>Play again</Button>
            <Button size="sm" variant="primary" onclick={() => new_level()}>New level</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @3xl:static @3xl:block @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-hairline @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-hairline bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @3xl:hidden" />
      <Section title="Statistics" description="Levels solved per difficulty, with the fastest solve.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each DIFFICULTIES as each (each)}
          {@const entry = stats.value[each]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === difficulty ? "font-medium" : "text-foreground/80")}>{DIFFICULTY_LABELS[each]}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Solved {entry.solved} · Best {entry.best === null ? "–" : format_time(entry.best)}
            </span>
          </div>
        {/each}
        <div class="flex flex-col gap-0.5 px-4 py-2.5">
          <span class="text-ui">This level</span>
          <span class="font-mono text-2xs text-foreground/65 tabular-nums">
            {level_best ? `Fewest ${level_best.moves} moves · ${level_best.pushes} pushes` : "Not solved yet"}
          </span>
        </div>
      </Section>
    </aside>
  </div>

  <div class="hidden items-center gap-2 border-t border-hairline bg-background-light px-3 py-2 pointer-coarse:flex" role="toolbar" aria-label="Play">
    <IconButton label="Undo" disabled={!game.log || solved} onclick={step_back}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton label="Redo" disabled={!game.future || solved} onclick={step_forward}>
      <RedoIcon weight="bold" />
    </IconButton>
    <div class="flex-1"></div>
    <div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Direction">
      {#each PAD as pad (pad.direction)}
        <IconButton size="lg" variant="secondary" label={pad.label} class={pad.area} disabled={solved} onclick={() => step(pad.direction)}>
          <pad.icon weight="bold" />
        </IconButton>
      {/each}
    </div>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{moves} moves · {pushes} pushes</span>
    <span class="hidden shrink-0 font-mono tabular-nums @sm:inline">{format_time(elapsed)}</span>
    <span class="min-w-0" aria-live="polite">{status}</span>
    <span class="hidden font-mono tabular-nums @md:inline">
      Best {level_best ? `${level_best.moves}/${level_best.pushes}` : "–"}
    </span>
    <span class="hidden @2xl:inline pointer-coarse:hidden">Arrows or WASD · swipe on touch</span>
  </StatusBar>
</div>

<style>
  .board {
    --fit: min(100cqw / var(--cols), 100cqh / var(--rows));
    --cell: clamp(1.25rem, var(--fit), 3.25rem);
    width: calc(var(--cols) * var(--cell));
    height: calc(var(--rows) * var(--cell));
  }

  .tiles {
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
  }

  .piece {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: var(--cell);
    height: var(--cell);
    translate: calc(var(--col) * var(--cell)) calc(var(--row) * var(--cell));
    transition: translate 90ms var(--ease-out);
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .piece {
      transition: none;
    }
  }
</style>
