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
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    apply_hint,
    cell_plots,
    clues_in,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    describe_rect,
    empty_stats,
    hint,
    new_game,
    place,
    plot_at,
    Problem,
    problem_of,
    record,
    remove,
    restore,
    saved_schema,
    shape_name,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    to_saved,
    with_plots,
    type Game,
    type Saved,
  } from "./game";
  import { area_of, overlaps, Shape, span, type Rect } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));
  const TINTS = 8;

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
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  // The timer runs from Start, so a fresh puzzle stays covered until then and nobody reads it off the clock.
  let started = $state(!!restored && (saved!.elapsed > 0 || restored.plots.length > 0));
  let history = $state.raw<History<readonly Rect[]>>(create_history(initial_game.plots));
  let new_best = $state(false);
  let active = $state(0);
  let anchor = $state<number | null>(null);
  let drag = $state<{ pointer: number; start: number; end: number; moved: boolean } | null>(null);
  let tip = $state<{ cells: Set<number>; fix: boolean } | null>(null);
  const reason = new Flash(8000);
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  const puzzle = $derived(game.puzzle);
  const n = $derived(puzzle.size);
  const owner = $derived(cell_plots(n, game.plots));
  const edges = $derived(region_edges(owner, n));
  const problems = $derived(game.plots.map((rect) => problem_of(puzzle, rect)));
  const clue_at = $derived(new Map(puzzle.clues.map((clue, index) => [clue.cell, index])));
  const tints = $derived(game.plots.map((rect) => clues_in(puzzle, rect)));
  const satisfied = $derived(new Set(game.plots.flatMap((rect, index) => (problems[index] ? [] : clues_in(puzzle, rect)))));
  const draft = $derived(drag?.moved ? span(n, drag.start, drag.end) : anchor !== null ? span(n, anchor, active) : null);
  const draft_problem = $derived(draft ? problem_of(puzzle, draft) : null);
  const replaced = $derived(draft ? new Set(game.plots.flatMap((rect, index) => (overlaps(rect, draft) ? [index] : []))) : new Set<number>());
  const elapsed = $derived(clock.elapsed);
  const best = $derived(stats.value[size].best);
  const playing = $derived(started && !game.solved);

  const PROBLEM_TEXT: Record<Problem, string> = {
    [Problem.NO_CLUE]: "A plot has no clue in it",
    [Problem.CLUES]: "A plot holds more than one clue",
    [Problem.AREA]: "A plot's size doesn't match its number",
    [Problem.SHAPE]: "A plot's shape doesn't match its icon",
  };
  const DRAFT_TEXT: Record<Problem, string> = {
    [Problem.NO_CLUE]: "no clue",
    [Problem.CLUES]: "more than one clue",
    [Problem.AREA]: "wrong size for its number",
    [Problem.SHAPE]: "wrong shape for its icon",
  };

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (draft) return `${draft.width}×${draft.height} · ${area_of(draft)} cells${draft_problem ? ` · ${DRAFT_TEXT[draft_problem]}` : ""}`;
    if (reason.text) return reason.text;
    const first = problems.find(Boolean);
    if (first) return PROBLEM_TEXT[first];
    if (daily) return `Daily · ${daily}`;
    return "One clue in every plot: the number is its size, the icon its shape";
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `plots.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
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
    store_game({ size, seed: puzzle.seed, plots: game.plots.map(to_saved), hints: game.hints, elapsed: clock.read() });
  }
  // Moves save as they happen; the time since the last one would be lost on close.
  onDestroy(() => started && save());

  function set_plots(plots: readonly Rect[], hints = game.hints) {
    game = { ...with_plots(game, plots), hints };
    if (game.solved) finish();
    save();
  }

  function commit(plots: readonly Rect[], hints = game.hints) {
    history = push(history, plots, { max_entries: 200 });
    set_plots(plots, hints);
  }

  function finish() {
    const time = clock.pause();
    reason.clear();
    anchor = null;
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
  }

  function begin() {
    started = true;
    clock.start();
    cell_elements[active]?.focus();
  }

  function forget_tip() {
    tip = null;
    reason.clear();
  }

  function undo() {
    if (!playing || !can_undo(history)) return;
    history = history_undo(history);
    forget_tip();
    set_plots(current(history));
  }

  function redo() {
    if (!playing || !can_redo(history)) return;
    history = history_redo(history);
    forget_tip();
    set_plots(current(history));
  }

  function give_hint() {
    if (!playing) return;
    const next = hint(game);
    if (!next) return;
    anchor = null;
    tip = { cells: new Set(next.cells), fix: next.fix };
    reason.show(next.reason);
    active = next.cells[0];
    commit(apply_hint(game.plots, next), game.hints + 1);
  }

  function reset_to(next: Game) {
    game = next;
    history = create_history(next.plots);
    clock.reset();
    new_best = false;
    anchor = null;
    forget_tip();
    active = 0;
  }

  async function start_over(next_size: Size = size) {
    const progress = !game.solved && game.plots.length > 0;
    if (progress && next_size === size) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The plots on this one are lost. Statistics stay.",
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
    if (!game.solved && game.plots.length > 0) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its plots are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function place_plot(rect: Rect) {
    forget_tip();
    commit(place(game.plots, rect));
  }

  function remove_at(cell: number) {
    const index = plot_at(game.plots, n, cell);
    if (index === -1) return;
    forget_tip();
    commit(remove(game.plots, index));
  }

  function cell_at(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element?.dataset.cell ? Number(element.dataset.cell) : null;
  }

  function on_pointerdown(event: PointerEvent) {
    if (!playing || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    active = index;
    anchor = null;
    if (event.button === 2) {
      remove_at(index);
      return;
    }
    drag = { pointer: event.pointerId, start: index, end: index, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointermove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null || index === drag.end) return;
    drag = { ...drag, end: index, moved: drag.moved || index !== drag.start };
    active = index;
  }

  function end_drag() {
    if (!drag) return;
    const { start, end, moved } = drag;
    drag = null;
    if (moved) place_plot(span(n, start, end));
    else remove_at(start);
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
    if (key === " " || key === "enter") {
      event.preventDefault();
      if (anchor === null) anchor = active;
      else if (anchor === active) anchor = null;
      else {
        const rect = span(n, anchor, active);
        anchor = null;
        place_plot(rect);
      }
    } else if (key === "escape" && anchor !== null) {
      event.preventDefault();
      event.stopPropagation();
      anchor = null;
    } else if (key === "backspace" || key === "delete") {
      event.preventDefault();
      remove_at(active);
    }
  }

  function cell_label(index: number): string {
    const parts = [`Row ${Math.floor(index / n) + 1}, column ${(index % n) + 1}`];
    const clue_index = clue_at.get(index);
    if (clue_index !== undefined) {
      const clue = puzzle.clues[clue_index];
      parts.push(`clue ${clue.area ?? "no number"}, ${shape_name(clue.shape)}`);
    }
    const plot = owner[index];
    if (plot !== -1) {
      parts.push(`in a plot ${describe_rect(game.plots[plot])}`);
      if (problems[plot]) parts.push(PROBLEM_TEXT[problems[plot]!].toLowerCase());
    } else parts.push("open");
    return parts.join(", ");
  }

  function tint_of(plot: number): number | null {
    if (plot === -1) return null;
    const inside = tints[plot];
    return inside.length === 1 ? inside[0] % TINTS : -1;
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

{#snippet shape_icon(shape: Shape, small: boolean)}
  {#if shape !== Shape.ANY}
    <span class={cn("glyph rounded-[2px] border-current", small ? "glyph-badge" : "glyph-shape")} data-shape={shape}></span>
  {/if}
{/snippet}

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
        aria-label="Plots, {n} by {n}. Arrows move, Space marks a corner and Space again at the opposite corner places a plot, Escape cancels, Backspace removes a plot"
        tabindex="-1"
        class="board relative m-auto grid touch-none overflow-hidden rounded-sm bg-foreground/25 select-none [-webkit-touch-callout:none]"
        style:--n={n}
        onpointerdown={on_pointerdown}
        onpointermove={on_pointermove}
        onlostpointercapture={end_drag}
        oncontextmenu={(event) => event.preventDefault()}
        onkeydown={on_board_keydown}
      >
        {#each { length: n }, row (row)}
          <div role="row" class="contents">
            {#each { length: n }, col (col)}
              {@const index = row * n + col}
              {@const plot = owner[index]}
              {@const sides = edges[index]}
              {@const clue_index = clue_at.get(index)}
              {@const clue = clue_index === undefined ? null : puzzle.clues[clue_index]}
              {@const tint = tint_of(plot)}
              <button
                bind:this={cell_elements[index]}
                type="button"
                role="gridcell"
                data-cell={index}
                data-tint={tint}
                tabindex={index === active ? 0 : -1}
                aria-label={cell_label(index)}
                onfocus={() => (active = index)}
                style:--t={plot !== -1 && sides & Edge.TOP ? "var(--thick)" : "0px"}
                style:--r={plot !== -1 && sides & Edge.RIGHT ? "var(--thick)" : "0px"}
                style:--b={plot !== -1 && sides & Edge.BOTTOM ? "var(--thick)" : "0px"}
                style:--l={plot !== -1 && sides & Edge.LEFT ? "var(--thick)" : "0px"}
                class={cn(
                  "cell relative grid place-items-center outline-none",
                  "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                  plot !== -1 && "planted",
                  plot !== -1 && problems[plot] && "bad",
                  plot !== -1 && replaced.has(plot) && "replaced",
                  tip?.cells.has(index) && (tip.fix ? "flash-fix" : "flash")
                )}
              >
                {#if clue}
                  {@const done = satisfied.has(clue_index!)}
                  <span class={cn("clue relative grid size-full place-items-center", done ? "text-foreground/45" : plot !== -1 && problems[plot] ? "text-error" : "text-foreground")}>
                    {#if clue.area !== null}
                      <span class="clue-number font-mono font-semibold tabular-nums">{clue.area}</span>
                      <span class="absolute top-[6%] right-[8%] grid place-items-center">{@render shape_icon(clue.shape, true)}</span>
                    {:else}
                      {@render shape_icon(clue.shape, false)}
                    {/if}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        {/each}

        {#if draft}
          <div
            class={cn("draft pointer-events-none absolute z-10 rounded-[3px] ring-2 ring-inset", draft_problem ? "ring-error/80" : "ring-primary")}
            style:--row={draft.row}
            style:--col={draft.col}
            style:--w={draft.width}
            style:--h={draft.height}
            aria-hidden="true"
          ></div>
        {/if}

        {#if !started && !game.solved}
          <BoardOverlay class="z-20 bg-background" title={daily ? `Daily · ${daily}` : "Plots"} detail="{n}×{n} · one clue in every plot">
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
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-hairline @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-30 max-h-[60%] border-t border-hairline bg-background" : "hidden"
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

  <div class="hidden items-center gap-2 border-t border-hairline bg-background-light px-3 py-2 pointer-coarse:flex" role="toolbar" aria-label="Play">
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
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{satisfied.size}/{puzzle.clues.length} plots</span>
    <span class="min-w-0" aria-live="polite">{status}</span>
    <span class="hidden @5xl:inline pointer-coarse:hidden">Drag corner to corner · click or right-click a plot to remove it</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 1px;
    --cell: clamp(1.5rem, calc((min(100cqw, 100cqh) - var(--gap)) / var(--n) - var(--gap)), 4rem);
    --thick: max(2px, calc(var(--cell) * 0.06));
    --edge: color-mix(in oklab, var(--foreground) 85%, transparent);
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    padding: var(--gap);
  }

  .cell {
    background-color: var(--fill, var(--background));
    box-shadow:
      inset 0 var(--t) 0 var(--edge),
      inset calc(var(--r) * -1) 0 0 var(--edge),
      inset 0 calc(var(--b) * -1) 0 var(--edge),
      inset var(--l) 0 0 var(--edge);
  }

  .cell.bad {
    --edge: var(--error);
    background-image: repeating-linear-gradient(
      45deg,
      color-mix(in oklab, var(--error) 22%, transparent) 0 2px,
      transparent 2px calc(var(--cell) / 6)
    );
  }

  .cell.replaced {
    opacity: 0.45;
  }

  .clue-number {
    font-size: calc(var(--cell) * 0.42);
    line-height: 1;
  }

  .glyph {
    display: block;
    border-width: max(1.5px, calc(var(--g) * 0.11));
    width: calc(var(--g) * 0.8);
    height: calc(var(--g) * 0.8);
  }

  .glyph[data-shape="wide"] {
    width: var(--g);
    height: calc(var(--g) * 0.55);
  }

  .glyph[data-shape="tall"] {
    width: calc(var(--g) * 0.55);
    height: var(--g);
  }

  .glyph-badge {
    --g: calc(var(--cell) * 0.26);
  }

  .glyph-shape {
    --g: calc(var(--cell) * 0.5);
  }

  /* Soft tints from the theme's own colours, keyed by the plot's clue so a plot keeps its colour when redrawn. */
  .planted[data-tint="-1"] {
    --fill: color-mix(in oklab, var(--foreground) 14%, var(--background));
  }
  .planted[data-tint="0"] {
    --fill: color-mix(in oklab, var(--info) 30%, var(--background));
  }
  .planted[data-tint="1"] {
    --fill: color-mix(in oklab, var(--warning) 30%, var(--background));
  }
  .planted[data-tint="2"] {
    --fill: color-mix(in oklab, var(--secondary) 36%, var(--background));
  }
  .planted[data-tint="3"] {
    --fill: color-mix(in oklab, var(--success) 30%, var(--background));
  }
  .planted[data-tint="4"] {
    --fill: color-mix(in oklab, var(--cottontail) 24%, var(--background));
  }
  .planted[data-tint="5"] {
    --fill: color-mix(in oklab, var(--tertiary) 36%, var(--background));
  }
  .planted[data-tint="6"] {
    --fill: color-mix(in oklab, var(--accent) 34%, var(--background));
  }
  .planted[data-tint="7"] {
    --fill: color-mix(in oklab, var(--primary) 30%, var(--background));
  }

  .draft {
    left: calc(var(--gap) + var(--col) * (var(--cell) + var(--gap)));
    top: calc(var(--gap) + var(--row) * (var(--cell) + var(--gap)));
    width: calc(var(--w) * (var(--cell) + var(--gap)) - var(--gap));
    height: calc(var(--h) * (var(--cell) + var(--gap)) - var(--gap));
    background-color: color-mix(in oklab, var(--primary) 14%, transparent);
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
