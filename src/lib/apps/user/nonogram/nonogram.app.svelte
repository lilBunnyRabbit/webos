<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { BoardOverlay, Button, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    ChartBar as ChartBarIcon,
    Lightbulb as LightbulbIcon,
    MagnifyingGlassMinus as ZoomOutIcon,
    MagnifyingGlassPlus as ZoomInIcon,
    Square as SquareIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import {
    cols_done,
    empty_stats,
    format_time,
    hint,
    Mark,
    new_game,
    paint,
    record,
    restore,
    rows_done,
    runs_done,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    stroke_cells,
    with_marks,
    type Game,
  } from "./game";
  import { col_of, row_of } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));
  const TOOL_OPTIONS = [
    { value: "fill", label: "Fill", icon: SquareIcon },
    { value: "cross", label: "Cross", icon: XIcon },
  ] as const;
  type Tool = (typeof TOOL_OPTIONS)[number]["value"];

  const { window_id, window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // Per window, so two open puzzles don't overwrite each other; storage keeps the last one touched for next time.
  const saved = storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  const initial_size = restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S10);
  let size = $state<Size>(initial_size);
  let game = $state.raw<Game>(restored ?? new_game(initial_size, random_seed()));
  let elapsed_before = $state(restored ? saved!.elapsed : 0);
  let started_at = $state<number | null>(null);
  let now = $state(Date.now());
  let new_best = $state(false);
  let tool = $state<Tool>("fill");
  let undo_stack = $state.raw<(readonly Mark[])[]>([]);
  let redo_stack = $state.raw<(readonly Mark[])[]>([]);
  let active = $state(0);
  let hover = $state<number | null>(null);
  let flash = $state<{ index: number; fix: boolean } | null>(null);
  let show_stats = $state(false);
  let hide_result = $state(false);
  let zoomed = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  let stroke: {
    pointer: number;
    start: number;
    last: number;
    mark: Mark;
    erase: boolean;
    base: readonly Mark[];
    axis: "row" | "col" | null;
  } | null = null;

  const puzzle = $derived(game.puzzle);
  const width = $derived(puzzle.width);
  const height = $derived(puzzle.height);
  const done_rows = $derived(rows_done(game));
  const done_cols = $derived(cols_done(game));
  const clue_cols = $derived(Math.max(1, ...puzzle.rows.map((clue) => clue.length)));
  const clue_rows = $derived(Math.max(1, ...puzzle.cols.map((clue) => clue.length)));
  const elapsed = $derived(elapsed_before + (started_at === null ? 0 : now - started_at));
  const row_runs = $derived(puzzle.rows.map((clue, row) => runs_done(clue, row_of(game.marks, width, row))));
  const col_runs = $derived(puzzle.cols.map((clue, col) => runs_done(clue, col_of(game.marks, width, height, col))));
  let board_focused = $state(false);
  const crosshair = $derived(!game.solved && (hover !== null || board_focused));
  const focus_cell = $derived(hover ?? active);
  const focus_row = $derived(Math.floor(focus_cell / width));
  const focus_col = $derived(focus_cell % width);
  const filled = $derived(game.marks.filter((mark) => mark === Mark.FILLED).length);
  const target = $derived(puzzle.solution.filter(Boolean).length);
  const best = $derived(stats.value[size].best);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (started_at === null && !game.marks.some((mark) => mark !== Mark.EMPTY)) return "Fill the cells the clues describe";
    return "Each number is a run of filled cells, in order";
  });

  $effect(() => {
    if (game.solved || started_at === null) return;
    const timer = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(timer);
  });

  // Time away from the tab isn't time spent solving.
  $effect(() => {
    let away = false;
    const on_visibility = () => {
      if (document.hidden && started_at !== null) {
        elapsed_before = current_elapsed();
        started_at = null;
        away = true;
      } else if (!document.hidden && away) {
        away = false;
        if (!game.solved) started_at = now = Date.now();
      }
    };
    document.addEventListener("visibilitychange", on_visibility);
    return () => document.removeEventListener("visibilitychange", on_visibility);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `nonogram.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function current_elapsed(): number {
    return elapsed_before + (started_at === null ? 0 : Date.now() - started_at);
  }

  function save() {
    storage.set("game", {
      size,
      seed: puzzle.seed,
      marks: [...game.marks],
      hints: game.hints,
      elapsed: current_elapsed(),
    });
  }

  function set_marks(marks: readonly Mark[], hints = game.hints) {
    if (started_at === null) started_at = now = Date.now();
    const next = { ...with_marks(game, marks), hints };
    game = next;
    if (next.solved) finish();
    save();
  }

  function commit(marks: readonly Mark[], base: readonly Mark[] = game.marks, hints = game.hints) {
    if (marks.every((mark, index) => mark === base[index]) && hints === game.hints) return;
    undo_stack = [...undo_stack, base].slice(-200);
    redo_stack = [];
    set_marks(marks, hints);
  }

  function finish() {
    const time = current_elapsed();
    elapsed_before = time;
    started_at = null;
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
  }

  function undo() {
    if (!undo_stack.length || game.solved) return;
    redo_stack = [...redo_stack, game.marks];
    const previous = undo_stack[undo_stack.length - 1];
    undo_stack = undo_stack.slice(0, -1);
    set_marks(previous);
  }

  function redo() {
    if (!redo_stack.length || game.solved) return;
    undo_stack = [...undo_stack, game.marks];
    const next = redo_stack[redo_stack.length - 1];
    redo_stack = redo_stack.slice(0, -1);
    set_marks(next);
  }

  function give_hint() {
    if (game.solved) return;
    const next = hint(game);
    if (!next) return;
    const marks = [...game.marks];
    marks[next.index] = next.mark;
    flash = { index: next.index, fix: next.fix };
    active = next.index;
    commit(marks, game.marks, game.hints + 1);
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
    size = next_size;
    storage.set("size", next_size);
    game = new_game(next_size, random_seed());
    elapsed_before = 0;
    started_at = null;
    new_best = false;
    undo_stack = [];
    redo_stack = [];
    flash = null;
    hide_result = false;
    active = 0;
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

  function tool_mark(event: PointerEvent | null): Mark {
    if (event && (event.button === 2 || event.shiftKey)) return tool === "fill" ? Mark.CROSSED : Mark.FILLED;
    return tool === "fill" ? Mark.FILLED : Mark.CROSSED;
  }

  function cell_at(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element?.dataset.cell ? Number(element.dataset.cell) : null;
  }

  function on_pointerdown(event: PointerEvent) {
    if (game.solved || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    const mark = tool_mark(event);
    stroke = { pointer: event.pointerId, start: index, last: index, mark, erase: game.marks[index] === mark, base: game.marks, axis: null };
    active = index;
    hover = index;
    flash = null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (started_at === null) started_at = now = Date.now();
    game = with_marks(game, paint(stroke.base, [index], mark, stroke.erase));
  }

  function on_pointermove(event: PointerEvent) {
    if (event.pointerType === "mouse" && !stroke) hover = cell_at(event.clientX, event.clientY);
    if (!stroke || event.pointerId !== stroke.pointer) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null || index === stroke.last) return;
    if (stroke.axis === null && index !== stroke.start) {
      const same_row = Math.floor(index / width) === Math.floor(stroke.start / width);
      const same_col = index % width === stroke.start % width;
      stroke.axis = same_row ? "row" : same_col ? "col" : Math.abs((index % width) - (stroke.start % width)) >= Math.abs(Math.floor(index / width) - Math.floor(stroke.start / width)) ? "row" : "col";
    }
    // Locked to its axis, the stroke ends at the pointer's projection onto the start cell's row or column.
    const end =
      stroke.axis === "row"
        ? Math.floor(stroke.start / width) * width + (index % width)
        : (Math.floor(index / width) * width) + (stroke.start % width);
    stroke.last = index;
    active = hover = end;
    game = with_marks(game, paint(stroke.base, stroke_cells(width, stroke.start, end, stroke.axis), stroke.mark, stroke.erase));
  }

  function end_stroke(event: PointerEvent) {
    if (event.pointerType !== "mouse") hover = null;
    if (!stroke) return;
    const base = stroke.base;
    stroke = null;
    commit(game.marks, base);
  }

  function set_cell(index: number, mark: Mark) {
    if (game.solved) return;
    const marks = [...game.marks];
    marks[index] = marks[index] === mark ? Mark.EMPTY : mark;
    flash = null;
    commit(marks);
  }

  function move(index: number) {
    active = index;
    hover = null;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const row = Math.floor(active / width);
    const col = active % width;
    const moves: Record<string, number> = {
      ArrowUp: Math.max(0, row - 1) * width + col,
      ArrowDown: Math.min(height - 1, row + 1) * width + col,
      ArrowLeft: row * width + Math.max(0, col - 1),
      ArrowRight: row * width + Math.min(width - 1, col + 1),
      Home: row * width,
      End: row * width + width - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = moves[event.key];
      // Shift paints the cell left behind, so a run can be laid down without lifting the keys.
      if (event.shiftKey && !game.solved && game.marks[active] === Mark.EMPTY) {
        const marks = [...game.marks];
        marks[active] = tool === "fill" ? Mark.FILLED : Mark.CROSSED;
        marks[next] = marks[next] === Mark.EMPTY ? marks[active] : marks[next];
        commit(marks);
      }
      move(next);
      return;
    }
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter" || key === "f") {
      event.preventDefault();
      set_cell(active, tool === "fill" ? Mark.FILLED : Mark.CROSSED);
    } else if (key === "x") {
      event.preventDefault();
      set_cell(active, tool === "fill" ? Mark.CROSSED : Mark.FILLED);
    } else if (key === "backspace" || key === "delete") {
      event.preventDefault();
      if (game.marks[active] !== Mark.EMPTY) set_cell(active, game.marks[active]);
    }
  }

  function cell_label(index: number): string {
    const mark = game.marks[index];
    const state = mark === Mark.FILLED ? "filled" : mark === Mark.CROSSED ? "crossed" : "blank";
    return `Row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}, ${state}`;
  }

  function clue_label(kind: "Row" | "Column", index: number, clue: readonly number[], done: boolean): string {
    return `${kind} ${index + 1}: ${clue.length ? clue.join(" ") : "empty"}${done ? ", done" : ""}`;
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

{#snippet tools(control: "sm" | "md")}
  <Segmented size={control} label="Tool" options={[...TOOL_OPTIONS]} bind:value={tool} />
  <IconButton size={control} label="Undo (Ctrl+Z)" disabled={!undo_stack.length || game.solved} onclick={undo}>
    <UndoIcon weight="bold" />
  </IconButton>
  <IconButton size={control} label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length || game.solved} onclick={redo}>
    <RedoIcon weight="bold" />
  </IconButton>
  <IconButton size={control} label="Hint (H)" disabled={game.solved} onclick={give_hint}>
    <LightbulbIcon weight="bold" />
  </IconButton>
  {#if control === "md" && width >= 15}
    <IconButton size={control} label={zoomed ? "Fit the board" : "Zoom in"} pressed={zoomed} onclick={() => (zoomed = !zoomed)}>
      {#if zoomed}<ZoomOutIcon weight="bold" />{:else}<ZoomInIcon weight="bold" />{/if}
    </IconButton>
  {/if}
{/snippet}

{#snippet clue_numbers(clue: readonly number[], done: readonly boolean[])}
  {#if clue.length}
    {#each clue as run, index (index)}
      <span class={cn("transition-colors", done[index] && "text-foreground/30")}>{run}</span>
    {/each}
  {:else}
    <span class="text-foreground/30">0</span>
  {/if}
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto_auto] @2xl:grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-24 @2xl:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <div class="hidden items-center gap-1 @2xl:flex">{@render tools("sm")}</div>
    <div class="flex-1"></div>
    <span class="font-mono text-sm text-foreground/80 tabular-nums @2xl:hidden" aria-hidden="true">{format_time(elapsed)}</span>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class={cn("flex min-h-0 overflow-auto [container-type:size]", zoomed ? "p-0" : "p-2 @md:p-4")}>
      <div
        class={cn("board relative m-auto grid select-none [-webkit-touch-callout:none]", zoomed && "zoomed")}
        style:--cols={width}
        style:--rows={height}
        style:--clue-cols={clue_cols}
        style:--clue-rows={clue_rows}
      >
        <div class="corner sticky top-0 left-0 z-20 grid place-items-center bg-background font-mono text-foreground/65 tabular-nums" aria-hidden="true">
          <span class="hidden @2xl:inline">{format_time(elapsed)}</span>
        </div>

        <div class="col-clues sticky top-0 z-10 grid bg-background" role="group" aria-label="Column clues">
          {#each puzzle.cols as clue, col (col)}
            <div
              class={cn(
                "flex flex-col items-center justify-end gap-[0.1em] rounded-t-sm pb-[0.25em] font-mono leading-none font-semibold text-foreground/85 tabular-nums transition-colors",
                crosshair && col === focus_col && "bg-primary/14 text-foreground"
              )}
              aria-label={clue_label("Column", col, clue, done_cols[col])}
            >
              {@render clue_numbers(clue, col_runs[col])}
            </div>
          {/each}
        </div>

        <div class="row-clues sticky left-0 z-10 grid bg-background" role="group" aria-label="Row clues">
          {#each puzzle.rows as clue, row (row)}
            <div
              class={cn(
                "flex items-center justify-end gap-[0.4em] rounded-l-sm pr-[0.4em] font-mono font-semibold text-foreground/85 tabular-nums transition-colors",
                crosshair && row === focus_row && "bg-primary/14 text-foreground"
              )}
              aria-label={clue_label("Row", row, clue, done_rows[row])}
            >
              {@render clue_numbers(clue, row_runs[row])}
            </div>
          {/each}
        </div>

        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="grid"
          aria-label="Puzzle, {width} by {height}. Arrows move, Space fills, X crosses, Shift with arrows paints"
          tabindex="-1"
          class={cn("cells relative grid touch-none overflow-hidden rounded-sm bg-foreground/22 ring-1 ring-foreground/45", game.solved && "solved")}
          onpointerdown={on_pointerdown}
          onpointermove={on_pointermove}
          onpointerup={end_stroke}
          onlostpointercapture={end_stroke}
          onpointerleave={() => (hover = null)}
          onfocusin={() => (board_focused = true)}
          onfocusout={() => (board_focused = false)}
          oncontextmenu={(event) => event.preventDefault()}
          onkeydown={on_board_keydown}
        >
          {#each { length: height }, row (row)}
            <div role="row" class="contents">
              {#each { length: width }, col (col)}
                {@const index = row * width + col}
                {@const mark = game.marks[index]}
                {@const lit = crosshair && (row === focus_row || col === focus_col)}
                <button
                  bind:this={cell_elements[index]}
                  type="button"
                  role="gridcell"
                  data-cell={index}
                  tabindex={index === active ? 0 : -1}
                  aria-label={cell_label(index)}
                  onfocus={() => (active = index)}
                  style:--wave={row + col}
                  class={cn(
                    "cell relative grid place-items-center outline-none",
                    "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                    col % 5 === 0 && col > 0 && "major-left",
                    row % 5 === 0 && row > 0 && "major-top",
                    mark === Mark.FILLED ? "filled" : lit ? "lit" : "blank",
                    flash?.index === index && (flash.fix ? "flash-fix" : "flash")
                  )}
                >
                  {#if game.solved}
                    <!-- The picture alone, without the working. -->
                  {:else if mark === Mark.CROSSED}
                    <XIcon weight="bold" class="size-[55%] text-foreground/45" />
                  {:else if mark === Mark.EMPTY && (done_rows[row] || done_cols[col])}
                    <span class="size-[16%] rounded-full bg-foreground/30"></span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}

          {#if game.solved && !hide_result}
            <BoardOverlay class="overlay" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
              <Button size="sm" variant="quiet" onclick={() => (hide_result = true)}>View picture</Button>
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-foreground/8 @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
    >
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

  <!-- Narrow windows (phones) keep the tools under the board, where a thumb reaches them. -->
  <div class="flex items-center justify-center gap-2 border-t border-foreground/8 px-3 py-2 @2xl:hidden">
    {@render tools("md")}
  </div>

  <StatusBar class="hidden @md:flex">
    <span class="font-mono tabular-nums">{format_time(elapsed)}</span>
    <span>{status}</span>
    <span class="hidden font-mono tabular-nums @md:inline">{filled}/{target} filled</span>
    <span class="hidden @4xl:inline">Right-click or Shift crosses · drag to paint a line</span>
  </StatusBar>
</div>

<style>
  /*
   * Clue strips scale with the cells but never below a readable size, so the fit has to hold both ways: proportional
   * clues, and minimum-size clues plus the cells.
   */
  .board {
    --gap: 1px;
    --clue: 0.62;
    --clue-min: 0.95rem;
    --fit: min(
      (100cqw - 4px) / (var(--cols) + var(--clue-cols) * var(--clue)),
      (100cqh - 4px) / (var(--rows) + var(--clue-rows) * var(--clue)),
      (100cqw - 4px - var(--clue-cols) * var(--clue-min)) / var(--cols),
      (100cqh - 4px - var(--clue-rows) * var(--clue-min)) / var(--rows)
    );
    --cell: clamp(0.75rem, calc(var(--fit) - var(--gap)), 3.25rem);
    --clue-size: max(var(--cell) * var(--clue), var(--clue-min));
    grid-template-columns: calc(var(--clue-cols) * var(--clue-size)) auto;
    grid-template-rows: calc(var(--clue-rows) * var(--clue-size)) auto;
    font-size: max(var(--cell) * 0.46, 0.7rem);
  }

  /* Zoomed, a phone keeps finger-sized cells and scrolls the board instead; the clue strips stay pinned. */
  .zoomed {
    --cell: max(1.9rem, calc(var(--fit) - var(--gap)));
  }

  .col-clues {
    grid-template-columns: repeat(var(--cols), var(--cell));
    gap: var(--gap);
    padding-inline: 1px;
  }

  .row-clues {
    grid-template-rows: repeat(var(--rows), var(--cell));
    gap: var(--gap);
    padding-block: 1px;
  }

  .corner {
    font-size: 0.85em;
  }

  .cells {
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    padding: 1px;
  }

  /* Every fifth line is heavier, the way paper nonograms are counted. */
  .major-left {
    box-shadow: -1px 0 0 0 color-mix(in oklab, var(--foreground) 55%, transparent);
  }

  .major-top {
    box-shadow: 0 -1px 0 0 color-mix(in oklab, var(--foreground) 55%, transparent);
  }

  .major-left.major-top {
    box-shadow:
      -1px 0 0 0 color-mix(in oklab, var(--foreground) 55%, transparent),
      0 -1px 0 0 color-mix(in oklab, var(--foreground) 55%, transparent);
  }

  .cell {
    transition: background-color 70ms;
  }

  .blank {
    background: var(--background);
  }

  .lit {
    background: color-mix(in oklab, var(--primary) 12%, var(--background));
  }

  .filled {
    background: var(--foreground);
  }

  /* Solving washes the picture into the brand colour from the top-left corner. */
  .solved .filled {
    background: var(--primary);
    animation: reveal 500ms var(--ease-out) backwards;
    animation-delay: calc(var(--wave) * 22ms);
  }

  .solved :global(.overlay) {
    animation: overlay-in 300ms var(--ease-out) 900ms backwards;
  }

  @keyframes reveal {
    from {
      background: var(--foreground);
      scale: 0.6;
    }
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
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
    .flash-fix,
    .solved .filled,
    .solved :global(.overlay) {
      animation: none;
    }
  }
</style>
