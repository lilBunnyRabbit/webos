<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { Flash } from "$kit/utils/flash.svelte";
  import { can_redo, can_undo, create_history, current, push, redo as history_redo, undo as history_undo, type History } from "$kit/utils/history";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { ArrowUUpLeft as UndoIcon, ArrowUUpRight as RedoIcon, ChartBar as ChartBarIcon, Lightbulb as LightbulbIcon } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    arrow_step,
    arrow_target,
    back,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    draw_to,
    empty_stats,
    hint,
    last_dot,
    new_game,
    next_dot,
    record,
    Refusal,
    refusal,
    restore,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    to_saved,
    with_path,
    type Game,
    type Saved,
  } from "./game";
  import { Side } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // A daily puzzle saves under its own key, so it never replaces the regular game.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  const initial_size = daily_day ? DAILY_SIZE : restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S7);
  let size = $state<Size>(initial_size);
  const initial_game = restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_size, random_seed()));
  let game = $state.raw<Game>(initial_game);
  let history = $state.raw<History<readonly number[]>>(create_history(initial_game.path));
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  // The timer runs from Start, so a fresh puzzle stays covered until then and nobody reads it off the clock.
  let started = $state(!!saved && (saved.elapsed > 0 || saved.path.length > 1));
  let new_best = $state(false);
  let flash = $state<{ cells: Set<number>; fix: boolean } | null>(null);
  const note = new Flash(5000);
  let show_panel = $state(false);
  let board_element = $state<HTMLDivElement>();
  let stroke: { pointer: number; last: number } | null = null;

  const puzzle = $derived(game.puzzle);
  const n = $derived(puzzle.size);
  const end_number = $derived(last_dot(puzzle));
  const on_path = $derived(new Set(game.path));
  const head = $derived(game.path[game.path.length - 1]);
  const elapsed = $derived(clock.elapsed);
  const best = $derived(stats.value[size].best);
  const playing = $derived(started && !game.solved);
  const points = $derived(game.path.map((cell) => `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`).join(" "));

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (note.text) return note.text;
    if (daily) return `Daily · ${daily}`;
    return `Hop from 1 to ${end_number} in order and fill every cell`;
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `hop.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function store_game(saved: Saved) {
    if (daily) storage.set("daily", { day: daily, game: saved });
    else storage.set("game", saved);
  }

  function save() {
    store_game(to_saved(game, size, clock.read()));
  }
  // Moves save as they happen; the time since the last one would be lost on close.
  onDestroy(() => started && save());

  function begin() {
    started = true;
    clock.start();
    board_element?.focus();
  }

  function show(next: Game, hints = game.hints) {
    game = { ...next, hints };
    if (game.solved) {
      commit();
      finish();
    }
  }

  function commit() {
    if (game.path !== current(history)) history = push(history, game.path, { max_entries: 200 });
    save();
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    stroke = null;
  }

  function undo() {
    if (!playing || !can_undo(history)) return;
    history = history_undo(history);
    flash = null;
    note.clear();
    game = with_path(game, current(history));
    save();
  }

  function redo() {
    if (!playing || !can_redo(history)) return;
    history = history_redo(history);
    flash = null;
    note.clear();
    game = with_path(game, current(history));
    if (game.solved) finish();
    save();
  }

  function give_hint() {
    if (!playing) return;
    const next = hint(game);
    if (!next) return;
    flash = { cells: new Set(next.cells), fix: next.fix };
    const more = next.cells.length - 1;
    note.show(next.fix ? "That step went the wrong way; the path is back on track" : more ? `The next step, and ${more} more with only one way on` : "The next step");
    show(with_path(game, next.path), game.hints + 1);
    if (!game.solved) commit();
  }

  async function start_over(next_size: Size = size) {
    if (playing && game.path.length > 1 && next_size === size) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The path on this one is lost. Statistics stay.",
        confirm_label: "New puzzle",
      });
      if (!confirmed) return;
    }
    daily = null;
    size = next_size;
    storage.set("size", next_size);
    game = new_game(next_size, random_seed());
    history = create_history(game.path);
    clock.reset();
    new_best = false;
    flash = null;
    note.clear();
    started = true;
    clock.start();
    save();
    board_element?.focus();
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (playing && game.path.length > 1) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its path is lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function explain(to: number) {
    const why = refusal(puzzle, game.path, to);
    if (why === Refusal.ORDER) note.show(`Reach ${next_dot(puzzle, game.path)} before ${puzzle.numbers[to]}`);
    else if (why === Refusal.WALL) note.show("A wall is in the way");
    else if (why === Refusal.END) note.show(`The path ends at ${end_number}: back up and fill the rest first`);
  }

  function draw(cell: number) {
    const next = draw_to(game, cell);
    if (next === game) {
      if (!on_path.has(cell)) explain(cell);
      return;
    }
    flash = null;
    note.clear();
    show(next);
  }

  function locate(event: PointerEvent): number | null {
    if (!board_element) return null;
    const rect = board_element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x >= 1 || y < 0 || y >= 1) return null;
    return Math.floor(y * n) * n + Math.floor(x * n);
  }

  function on_pointerdown(event: PointerEvent) {
    if (!playing || !event.isPrimary || event.button !== 0) return;
    const cell = locate(event);
    if (cell === null) return;
    event.preventDefault();
    board_element?.focus({ preventScroll: true });
    draw(cell);
    if (game.solved || !game.path.includes(cell)) return;
    stroke = { pointer: event.pointerId, last: cell };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointermove(event: PointerEvent) {
    if (!stroke || event.pointerId !== stroke.pointer || !playing) return;
    const cell = locate(event);
    if (cell === null || cell === stroke.last) return;
    stroke.last = cell;
    draw(cell);
  }

  function end_stroke() {
    if (!stroke) return;
    stroke = null;
    if (!game.solved) commit();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey || !playing) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      if (game.path.length > 1) {
        show(back(game));
        commit();
      }
      return;
    }
    const to = arrow_target(game, event.key);
    if (to === null) return;
    event.preventDefault();
    const next = arrow_step(game, event.key);
    if (next === game) return explain(to);
    flash = null;
    note.clear();
    show(next);
    if (!game.solved) commit();
  }

  const walls = $derived(
    puzzle.walls.flatMap((bits, cell) => {
      const row = Math.floor(cell / n);
      const col = cell % n;
      const out: { row: number; col: number; axis: "across" | "down" }[] = [];
      if (bits & Side.RIGHT && col < n - 1) out.push({ row, col, axis: "across" });
      if (bits & Side.DOWN && row < n - 1) out.push({ row, col, axis: "down" });
      return out;
    })
  );

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Solved counts and best times for every size go back to zero. The puzzle in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @md:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-24 @md:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!playing || !can_undo(history)} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" class="pointer-coarse:hidden" disabled={!playing || !can_redo(history)} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" class="pointer-coarse:hidden" disabled={!playing} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Rules and statistics" class="@5xl:hidden" pressed={show_panel} onclick={() => (show_panel = !show_panel)}>
      <ChartBarIcon weight={show_panel ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @sm:inline-flex" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col">
      <div class="flex min-h-0 flex-1 overflow-hidden p-3 pb-2 pointer-coarse:px-2 [container-type:size]">
        <div class="frame relative m-auto rounded-xl" style:--n={n}>
          <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
          <div
            bind:this={board_element}
            role="application"
            aria-label="Hop, {n} by {n}. Draw one path from 1 to {end_number} through the numbers in order, filling every cell. Arrows extend the path or step back, Backspace steps back, H gives a hint"
            tabindex="0"
            class="board relative grid touch-none overflow-hidden rounded-xl bg-field shadow-recessed ring-1 ring-hairline-strong outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-cottontail"
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onlostpointercapture={end_stroke}
            onkeydown={on_board_keydown}
            oncontextmenu={(event) => event.preventDefault()}
          >
            {#each { length: n * n }, cell (cell)}
              <div
                class={cn(
                  "cell transition-colors duration-100",
                  on_path.has(cell) && "bg-primary/14",
                  flash?.cells.has(cell) && (flash.fix ? "flash-fix" : "flash")
                )}
                aria-hidden="true"
              ></div>
            {/each}

            <svg class="pointer-events-none absolute inset-0 size-full" viewBox="0 0 {n} {n}" aria-hidden="true">
              {#if game.path.length > 1}
                <polyline {points} fill="none" stroke="var(--primary)" stroke-width="0.34" stroke-linecap="round" stroke-linejoin="round" class={cn(game.solved && "opacity-85")} />
              {/if}
              {#if playing}
                <circle cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r="0.17" fill="var(--primary)" />
              {/if}
            </svg>

            {#each walls as wall (`${wall.row}-${wall.col}-${wall.axis}`)}
              <span class="wall pointer-events-none absolute rounded-full bg-foreground" data-axis={wall.axis} style:--r={wall.row} style:--c={wall.col} aria-hidden="true"></span>
            {/each}

            {#each puzzle.numbers as number, cell (cell)}
              {#if number}
                <span
                  class={cn(
                    "dot pointer-events-none absolute grid place-items-center rounded-full bg-foreground shadow-raised font-mono font-semibold text-background tabular-nums",
                    cell === head && playing && "ring-3 ring-primary"
                  )}
                  style:--r={Math.floor(cell / n)}
                  style:--c={cell % n}
                  aria-hidden="true">{number}</span
                >
              {/if}
            {/each}
          </div>

          {#if !started && !game.solved}
            <BoardOverlay class="z-20 bg-background" title={daily ? `Daily · ${daily}` : "Hop"} detail="{n}×{n} · 1 to {end_number}, every cell once">
              <Button size="sm" variant="primary" onclick={begin}>Start</Button>
            </BoardOverlay>
          {:else if game.solved}
            <BoardOverlay class="z-20 bg-background/60" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>
      </div>

      <div class="mx-auto hidden w-full max-w-md grid-cols-3 gap-1.5 px-3 pb-3 pointer-coarse:grid" role="group" aria-label="Actions">
        <Button variant="quiet" class="h-11" disabled={!playing || !can_undo(history)} onclick={undo}>
          <UndoIcon weight="bold" />Undo
        </Button>
        <Button variant="quiet" class="h-11" disabled={!playing || !can_redo(history)} onclick={redo}>
          <RedoIcon weight="bold" />Redo
        </Button>
        <Button variant="quiet" class="h-11" disabled={!playing} onclick={give_hint}>
          <LightbulbIcon weight="bold" />Hint
        </Button>
      </div>
    </div>

    <aside
      class={cn(
        "flex-col gap-4 overflow-auto p-4 @5xl:static @5xl:flex @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-hairline @5xl:bg-transparent",
        show_panel ? "absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] border-t border-hairline bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_panel = false) })}
    >
      <Grabber class="-mt-2 mb-2 @5xl:hidden" />
      <Section title="Rules">
        <ul class="flex list-disc flex-col gap-1.5 py-3 pr-4 pl-8 text-ui text-foreground/80">
          <li>Draw one path that starts at 1 and ends at the highest number.</li>
          <li>Pass the numbers in order.</li>
          <li>Fill every cell exactly once, moving up, down, left or right.</li>
          <li>Thick bars are walls the path can't cross.</li>
        </ul>
      </Section>
      <Section title="Statistics" description="Puzzles solved per size. Best times count only solves without hints.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each SIZES as each (each)}
          {@const entry = stats.value[each]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === size ? "font-medium" : "text-foreground/80")}>{each}×{each}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Solved {entry.solved} · Best {entry.best === null ? "–" : format_time(entry.best)}
            </span>
          </div>
        {/each}
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span aria-live="polite" class="min-w-0 truncate">{status}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{game.path.length}/{n * n} cells</span>
    <span class="hidden shrink-0 @3xl:inline pointer-coarse:hidden">Drag or arrows draw · H hint</span>
  </StatusBar>
</div>

<style>
  .frame {
    --cell: clamp(2.75rem, min(100cqw, 100cqh) / var(--n), 5rem);
  }

  .board {
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-template-rows: repeat(var(--n), var(--cell));
  }

  .cell {
    box-shadow: inset 0 0 0 0.5px color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .dot {
    width: calc(var(--cell) * 0.56);
    height: calc(var(--cell) * 0.56);
    font-size: calc(var(--cell) * 0.28);
    left: calc((var(--c) + 0.5) * var(--cell));
    top: calc((var(--r) + 0.5) * var(--cell));
    translate: -50% -50%;
  }

  .wall {
    --thick: calc(var(--cell) * 0.12);
  }

  .wall[data-axis="across"] {
    width: var(--thick);
    height: calc(var(--cell) + var(--thick));
    left: calc((var(--c) + 1) * var(--cell));
    top: calc((var(--r) + 0.5) * var(--cell));
    translate: -50% -50%;
  }

  .wall[data-axis="down"] {
    width: calc(var(--cell) + var(--thick));
    height: var(--thick);
    left: calc((var(--c) + 0.5) * var(--cell));
    top: calc((var(--r) + 1) * var(--cell));
    translate: -50% -50%;
  }

  .flash {
    animation: flash 900ms var(--ease-out);
  }

  .flash-fix {
    animation: flash-fix 900ms var(--ease-out);
  }

  @keyframes flash {
    from {
      box-shadow: inset 0 0 0 3px var(--warning);
    }
  }

  @keyframes flash-fix {
    from {
      box-shadow: inset 0 0 0 3px var(--error);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flash,
    .flash-fix {
      animation: none;
    }
  }
</style>
