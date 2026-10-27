<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Edge, format_time, grid_key_move, region_edges, Stopwatch, track_play } from "$kit/games";
  import { Flash } from "$kit/utils/flash.svelte";
  import { can_redo, can_undo, create_history, current, push, redo as history_redo, undo as history_undo, type History } from "$kit/utils/history";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    ChartBar as ChartBarIcon,
    Lightbulb as LightbulbIcon,
    Rabbit as RabbitIcon,
    X as XIcon,
    XSquare as AutoCrossIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import {
    apply_hint,
    auto_crosses,
    cycle,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    empty_stats,
    feedback,
    hint,
    line_cells,
    Mark,
    new_game,
    paint,
    rabbits_of,
    record,
    restore,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    with_marks,
    type Game,
    type Saved,
  } from "./game";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);
  const auto_cross = storage.persisted("auto-cross", false, z.boolean());

  // A daily puzzle saves under its own key, so it never replaces the regular game.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  const initial_size = daily_day ? DAILY_SIZE : restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S8);
  let size = $state<Size>(initial_size);
  const initial_game = restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_size, random_seed()));
  let game = $state.raw<Game>(initial_game);
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  // The timer runs from Start, so a fresh puzzle stays covered until then and nobody reads it off the clock.
  let started = $state(!!saved && (saved.elapsed > 0 || saved.marks.some((mark) => mark !== Mark.EMPTY)));
  // "By hand" needs auto-cross off for the whole game, not just at the solve; a resumed game's history is unknown.
  let auto_crossed = restored !== null || auto_cross.value;
  let history = $state.raw<History<readonly Mark[]>>(create_history(initial_game.marks));
  let new_best = $state(false);
  let active = $state(0);
  let tip = $state<{ cells: number[]; focus: Set<number>; fix: boolean } | null>(null);
  const reason = new Flash(8000);
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  let stroke: {
    pointer: number;
    start: number;
    last: number;
    base: readonly Mark[];
    erase: boolean;
    painted: Set<number>;
    moved: boolean;
  } | null = null;

  const puzzle = $derived(game.puzzle);
  const n = $derived(puzzle.size);
  const edges = $derived(region_edges(puzzle.regions, n));
  const crossed = $derived(auto_cross.value && !game.solved ? auto_crosses(game) : new Set<number>());
  const checks = $derived(feedback(game, crossed));
  const placed = $derived(rabbits_of(game.marks).length);
  const elapsed = $derived(clock.elapsed);
  const best = $derived(stats.value[size].best);
  const playing = $derived(started && !game.solved);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (reason.text) return reason.text;
    if (checks.rabbits.size) return "Two rabbits share a line or meadow, or touch";
    if (checks.dead.size) return "A row, column or meadow has no place left";
    if (daily) return `Daily · ${daily}`;
    return "One rabbit in every row, column and meadow, none touching";
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `hutches.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("auto-cross", "a", "Toggle auto-cross", () => (auto_cross.value = !auto_cross.value)),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  $effect(() => {
    if (auto_cross.value) auto_crossed = true;
  });

  function store_game(saved: Saved) {
    if (daily) storage.set("daily", { day: daily, game: saved });
    else storage.set("game", saved);
  }

  function save() {
    store_game({ size, seed: puzzle.seed, marks: [...game.marks], hints: game.hints, elapsed: clock.read() });
  }
  // Moves save as they happen; the time since the last one would be lost on close.
  onDestroy(() => started && save());

  function set_marks(marks: readonly Mark[], hints = game.hints) {
    game = { ...with_marks(game, marks), hints };
    if (game.solved) finish();
    save();
  }

  function commit(marks: readonly Mark[], hints = game.hints) {
    if (marks.every((mark, index) => mark === game.marks[index]) && hints === game.hints) return;
    history = push(history, marks, { max_entries: 200 });
    set_marks(marks, hints);
  }

  function finish() {
    const time = clock.pause();
    reason.clear();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    report_solve();
  }

  function report_solve() {
    const clean = game.hints === 0;
    achievements.achieve("first-solve");
    if (daily) achievements.achieve("daily");
    if (size === Size.S10) achievements.achieve("big");
    if (size === Size.S10 && clean && !auto_crossed && !auto_cross.value) achievements.achieve("by-hand");
    achievements.progress("solves-25", Object.values(stats.value).reduce((sum, entry) => sum + entry.solved, 0));
  }

  function begin() {
    started = true;
    clock.start();
    cell_elements[active]?.focus();
  }

  function undo() {
    if (!playing || !can_undo(history)) return;
    history = history_undo(history);
    tip = null;
    reason.clear();
    set_marks(current(history));
  }

  function redo() {
    if (!playing || !can_redo(history)) return;
    history = history_redo(history);
    tip = null;
    reason.clear();
    set_marks(current(history));
  }

  function give_hint() {
    if (!playing) return;
    const next = hint(game);
    if (!next) return;
    tip = { cells: next.cells, focus: new Set(next.focus), fix: next.fix };
    reason.show(next.reason);
    active = next.cells[0];
    commit(apply_hint(game.marks, next), game.hints + 1);
  }

  function reset_to(next: Game) {
    game = next;
    history = create_history(next.marks);
    clock.reset();
    auto_crossed = auto_cross.value;
    new_best = false;
    tip = null;
    reason.clear();
    active = 0;
  }

  async function start_over(next_size: Size = size) {
    const progress = !game.solved && game.marks.some((mark) => mark !== Mark.EMPTY);
    if (progress && next_size === size) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The marks on this one are lost. Statistics stay.",
        confirm_label: "New puzzle",
      });
      if (!confirmed) return;
    }
    daily = null;
    size = next_size;
    storage.set("size", next_size);
    reset_to(new_game(next_size, random_seed()));
    started = true;
    clock.start();
    save();
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (!game.solved && game.marks.some((mark) => mark !== Mark.EMPTY)) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its marks are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function cell_at(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element?.dataset.cell ? Number(element.dataset.cell) : null;
  }

  function set_cell(index: number, mark: Mark) {
    if (!playing) return;
    const marks = [...game.marks];
    marks[index] = mark;
    tip = null;
    reason.clear();
    commit(marks);
  }

  function on_pointerdown(event: PointerEvent) {
    if (!playing || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    active = index;
    if (event.button === 2) {
      set_cell(index, game.marks[index] === Mark.RABBIT ? Mark.EMPTY : Mark.RABBIT);
      return;
    }
    const base = game.marks;
    stroke = { pointer: event.pointerId, start: index, last: index, base, erase: base[index] === Mark.CROSS, painted: new Set([index]), moved: false };
    tip = null;
    reason.clear();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (base[index] === Mark.EMPTY) game = with_marks(game, paint(base, [index], false));
  }

  function on_pointermove(event: PointerEvent) {
    if (!stroke || event.pointerId !== stroke.pointer) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null || index === stroke.last) return;
    for (const cell of line_cells(n, stroke.last, index)) stroke.painted.add(cell);
    stroke.last = index;
    stroke.moved = true;
    active = index;
    game = with_marks(game, paint(stroke.base, stroke.painted, stroke.erase));
  }

  function end_stroke() {
    if (!stroke) return;
    const { base, start, moved } = stroke;
    stroke = null;
    const marks = moved ? game.marks : base.map((mark, index) => (index === start ? cycle(mark) : mark));
    game = with_marks(game, base);
    commit(marks);
  }

  function move(index: number) {
    active = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey || !playing) return;
    const next = grid_key_move(event.key, active, n, n);
    if (next !== null) {
      event.preventDefault();
      move(next);
      return;
    }
    const key = event.key.toLowerCase();
    const mark = game.marks[active];
    if (key === " " || key === "enter") {
      event.preventDefault();
      set_cell(active, cycle(mark));
    } else if (key === "x") {
      event.preventDefault();
      set_cell(active, mark === Mark.CROSS ? Mark.EMPTY : Mark.CROSS);
    } else if (key === "r") {
      event.preventDefault();
      set_cell(active, mark === Mark.RABBIT ? Mark.EMPTY : Mark.RABBIT);
    } else if (key === "backspace" || key === "delete") {
      event.preventDefault();
      set_cell(active, Mark.EMPTY);
    }
  }

  function cell_label(index: number): string {
    const mark = game.marks[index];
    const state = mark === Mark.RABBIT ? "rabbit" : mark === Mark.CROSS || crossed.has(index) ? "crossed" : "blank";
    const note = checks.rabbits.has(index) ? ", breaks a rule" : checks.dead.has(index) ? ", in a line with no place left" : "";
    return `Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}, meadow ${puzzle.regions[index] + 1}, ${state}${note}`;
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Solved counts and best times for every size go back to zero. The puzzle in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-24 @2xl:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!playing || !can_undo(history)} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" class="hidden @md:inline-flex pointer-coarse:hidden" disabled={!playing || !can_redo(history)} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" class="pointer-coarse:hidden" disabled={!playing} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Auto-cross around rabbits (A)" class="pointer-coarse:hidden" pressed={auto_cross.value} onclick={() => (auto_cross.value = !auto_cross.value)}>
      <AutoCrossIcon weight={auto_cross.value ? "fill" : "bold"} />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @sm:inline-flex" onclick={() => start_over()}>New puzzle</Button>
    <Button size="sm" variant="primary" class="@sm:hidden pointer-coarse:hidden" onclick={() => start_over()}>New</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 overflow-auto p-3 [container-type:size] pointer-coarse:p-1.5">
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="grid"
        aria-label="Hutches, {n} by {n}. Arrows move, Space cycles cross and rabbit, X crosses, R places a rabbit, Backspace clears"
        tabindex="-1"
        class="board relative m-auto grid touch-none overflow-hidden rounded-sm bg-foreground/25 select-none [-webkit-touch-callout:none]"
        style:--n={n}
        onpointerdown={on_pointerdown}
        onpointermove={on_pointermove}
        onlostpointercapture={end_stroke}
        oncontextmenu={(event) => event.preventDefault()}
        onkeydown={on_board_keydown}
      >
        {#each { length: n }, row (row)}
          <div role="row" class="contents">
            {#each { length: n }, col (col)}
              {@const index = row * n + col}
              {@const mark = game.marks[index]}
              {@const sides = edges[index]}
              {@const bad = checks.rabbits.has(index)}
              {@const dead = checks.dead.has(index)}
              <button
                bind:this={cell_elements[index]}
                type="button"
                role="gridcell"
                data-cell={index}
                data-meadow={puzzle.regions[index]}
                tabindex={index === active ? 0 : -1}
                aria-label={cell_label(index)}
                onfocus={() => (active = index)}
                style:--t={sides & Edge.TOP ? "var(--thick)" : "0px"}
                style:--r={sides & Edge.RIGHT ? "var(--thick)" : "0px"}
                style:--b={sides & Edge.BOTTOM ? "var(--thick)" : "0px"}
                style:--l={sides & Edge.LEFT ? "var(--thick)" : "0px"}
                class={cn(
                  "cell meadow relative grid place-items-center outline-none",
                  "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                  dead && "dead",
                  reason.text && tip?.focus.has(index) && "focus",
                  tip?.cells.includes(index) && (tip.fix ? "flash-fix" : "flash")
                )}
              >
                {#if mark === Mark.RABBIT}
                  <RabbitIcon weight="fill" class={cn("glyph-rabbit", bad ? "text-error" : "text-foreground")} />
                {:else if mark === Mark.CROSS}
                  <XIcon weight="bold" class="glyph-cross text-foreground/75" />
                {:else if crossed.has(index)}
                  <XIcon weight="bold" class="glyph-cross text-foreground/35" />
                {/if}
                {#if bad}<span class="pointer-events-none absolute inset-[8%] rounded-full ring-2 ring-error"></span>{/if}
              </button>
            {/each}
          </div>
        {/each}

        {#if !started && !game.solved}
          <BoardOverlay class="z-20 bg-background" title={daily ? `Daily · ${daily}` : "Hutches"} detail="{n}×{n} · one rabbit per row, column and meadow">
            <Button size="sm" variant="primary" onclick={begin}>Start</Button>
          </BoardOverlay>
        {:else if game.solved}
          <BoardOverlay class="z-20 bg-background/60" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
            <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-foreground/8 @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-30 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @5xl:hidden" />
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

  <div class="hidden items-center gap-2 border-t border-foreground/8 bg-background-light px-3 py-2 pointer-coarse:flex" role="toolbar" aria-label="Play">
    <IconButton label="Auto-cross around rabbits" pressed={auto_cross.value} onclick={() => (auto_cross.value = !auto_cross.value)}>
      <AutoCrossIcon weight={auto_cross.value ? "fill" : "bold"} />
    </IconButton>
    <div class="flex-1"></div>
    <IconButton label="Undo" disabled={!playing || !can_undo(history)} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton label="Redo" disabled={!playing || !can_redo(history)} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton label="Hint" disabled={!playing} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <Button variant="primary" class="@sm:hidden" onclick={() => start_over()}>New</Button>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{placed}/{n} rabbits</span>
    <span class="min-w-0" aria-live="polite">{status}</span>
    <span class="hidden @5xl:inline pointer-coarse:hidden">Click cycles × and rabbit · right-click places a rabbit · drag crosses</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 1px;
    --cell: clamp(1.5rem, calc(min(100cqw, 100cqh) / var(--n) - var(--gap)), 3.75rem);
    --thick: max(1.5px, calc(var(--cell) * 0.05));
    --edge: color-mix(in oklab, var(--foreground) 85%, transparent);
    --ink: color-mix(in oklab, var(--foreground) 16%, transparent);
    --stripe: max(1px, calc(var(--cell) * 0.03));
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    padding: var(--gap);
  }

  .cell {
    background-color: var(--fill);
    box-shadow:
      inset 0 var(--t) 0 var(--edge),
      inset calc(var(--r) * -1) 0 0 var(--edge),
      inset 0 calc(var(--b) * -1) 0 var(--edge),
      inset var(--l) 0 0 var(--edge);
  }

  .cell :global(.glyph-rabbit) {
    width: calc(var(--cell) * 0.62);
    height: calc(var(--cell) * 0.62);
  }

  .cell :global(.glyph-cross) {
    width: calc(var(--cell) * 0.32);
    height: calc(var(--cell) * 0.32);
  }

  /* Meadows differ by colour and by pattern, so a meadow reads without telling its colour apart. Error tints only the tenth. */
  .meadow[data-meadow="0"] {
    --fill: color-mix(in oklab, var(--info) 34%, var(--background));
  }
  .meadow[data-meadow="1"] {
    --fill: color-mix(in oklab, var(--warning) 34%, var(--background));
    background-image: radial-gradient(circle, var(--ink) 14%, transparent 16%);
    background-size: calc(var(--cell) / 3) calc(var(--cell) / 3);
  }
  .meadow[data-meadow="2"] {
    --fill: color-mix(in oklab, var(--secondary) 40%, var(--background));
    background-image: repeating-linear-gradient(45deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 5));
  }
  .meadow[data-meadow="3"] {
    --fill: color-mix(in oklab, var(--success) 34%, var(--background));
    background-image: repeating-linear-gradient(0deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 5));
  }
  .meadow[data-meadow="4"] {
    --fill: color-mix(in oklab, var(--cottontail) 26%, var(--background));
    background-image: repeating-linear-gradient(-45deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 5));
  }
  .meadow[data-meadow="5"] {
    --fill: color-mix(in oklab, var(--tertiary) 40%, var(--background));
    background-image: repeating-linear-gradient(90deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 5));
  }
  .meadow[data-meadow="6"] {
    --fill: color-mix(in oklab, var(--accent) 40%, var(--background));
    background-image:
      repeating-linear-gradient(0deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 4)),
      repeating-linear-gradient(90deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 4));
  }
  .meadow[data-meadow="7"] {
    --fill: color-mix(in oklab, var(--primary) 34%, var(--background));
    background-image:
      repeating-linear-gradient(45deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 4)),
      repeating-linear-gradient(-45deg, var(--ink) 0 var(--stripe), transparent var(--stripe) calc(var(--cell) / 4));
  }
  .meadow[data-meadow="8"] {
    --fill: color-mix(in oklab, var(--foreground) 22%, var(--background));
    background-image: radial-gradient(circle, var(--ink) 22%, transparent 24%);
    background-size: calc(var(--cell) / 2) calc(var(--cell) / 2);
  }
  .meadow[data-meadow="9"] {
    --fill: color-mix(in oklab, var(--error) 30%, var(--background));
    background-image: conic-gradient(var(--ink) 25%, transparent 0 50%, var(--ink) 0 75%, transparent 0);
    background-size: calc(var(--cell) / 2.5) calc(var(--cell) / 2.5);
  }

  .meadow.dead {
    background-image: repeating-linear-gradient(
      45deg,
      color-mix(in oklab, var(--error) 70%, transparent) 0 calc(var(--stripe) * 2),
      transparent calc(var(--stripe) * 2) calc(var(--cell) / 6)
    );
    background-size: auto;
  }

  .focus::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 2px var(--warning);
  }

  .flash {
    animation: flash 900ms var(--ease-out);
  }

  .flash-fix {
    animation: flash-fix 900ms var(--ease-out);
  }

  @keyframes flash {
    from {
      background-color: var(--warning);
    }
  }

  @keyframes flash-fix {
    from {
      background-color: var(--error);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flash,
    .flash-fix {
      animation: none;
    }
  }
</style>
