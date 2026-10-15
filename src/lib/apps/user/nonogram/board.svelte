<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { X as XIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { grid_key_move, stroke_axis, stroke_cells, stroke_end, type Axis } from "$lib/core/games";
  import { Mark, paint } from "./game";
  import type { Clue, Ink } from "./puzzle";

  interface Props {
    width: number;
    height: number;
    rows: readonly Clue[];
    cols: readonly Clue[];
    palette: readonly Ink[];
    colored: boolean;
    marks: readonly Mark[];
    label: string;
    row_runs?: readonly (readonly boolean[])[];
    col_runs?: readonly (readonly boolean[])[];
    done_rows?: readonly boolean[];
    done_cols?: readonly boolean[];
    solved?: boolean;
    zoomed?: boolean;
    flash?: { index: number; fix: boolean } | null;
    /** Cells to call out: where an editor's picture has more than one answer. */
    flagged?: ReadonlySet<number>;
    overwrite?: boolean;
    /** What a stroke or key paints; `secondary` is right-click, Shift or X. */
    pick: (secondary: boolean) => Mark;
    on_change: (marks: readonly Mark[]) => void;
    on_commit: (marks: readonly Mark[], base: readonly Mark[]) => void;
    corner?: Snippet;
    overlay?: Snippet;
  }

  let {
    width,
    height,
    rows,
    cols,
    palette,
    colored,
    marks,
    label,
    row_runs,
    col_runs,
    done_rows,
    done_cols,
    solved = false,
    zoomed = false,
    flash = null,
    flagged,
    overwrite = false,
    pick,
    on_change,
    on_commit,
    corner,
    overlay,
  }: Props = $props();

  let active = $state(0);
  let hover = $state<number | null>(null);
  let board_focused = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  let stroke: {
    pointer: number;
    start: number;
    last: number;
    mark: Mark;
    erase: boolean;
    base: readonly Mark[];
    axis: Axis | null;
  } | null = null;

  const clue_cols = $derived(Math.max(1, ...rows.map((clue) => clue.length)));
  const clue_rows = $derived(Math.max(1, ...cols.map((clue) => clue.length)));
  const crosshair = $derived(!solved && (hover !== null || board_focused));
  const focus_cell = $derived(Math.min(hover ?? active, width * height - 1));
  const focus_row = $derived(Math.floor(focus_cell / width));
  const focus_col = $derived(focus_cell % width);
  const wash = $derived(!colored);

  export function focus_cell_at(index: number) {
    active = index;
  }

  function ink(color: number): string {
    return `var(--${palette[color - 1] ?? "foreground"})`;
  }

  function cell_at(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element?.dataset.cell ? Number(element.dataset.cell) : null;
  }

  function on_pointerdown(event: PointerEvent) {
    if (solved || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    const mark = pick(event.button === 2 || event.shiftKey);
    stroke = { pointer: event.pointerId, start: index, last: index, mark, erase: marks[index] === mark, base: marks, axis: null };
    active = index;
    hover = index;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    on_change(paint(stroke.base, [index], mark, stroke.erase, overwrite));
  }

  function on_pointermove(event: PointerEvent) {
    if (event.pointerType === "mouse" && !stroke) hover = cell_at(event.clientX, event.clientY);
    if (!stroke || event.pointerId !== stroke.pointer) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null || index === stroke.last) return;
    if (stroke.axis === null && index !== stroke.start) stroke.axis = stroke_axis(width, stroke.start, index);
    const end = stroke_end(width, stroke.start, index, stroke.axis);
    stroke.last = index;
    active = hover = end;
    on_change(paint(stroke.base, stroke_cells(width, stroke.start, end, stroke.axis), stroke.mark, stroke.erase, overwrite));
  }

  function end_stroke(event: PointerEvent) {
    if (event.pointerType !== "mouse") hover = null;
    if (!stroke) return;
    const base = stroke.base;
    stroke = null;
    on_commit(marks, base);
  }

  function set_cell(index: number, mark: Mark) {
    if (solved) return;
    const next = [...marks];
    next[index] = marks[index] === mark ? Mark.EMPTY : mark;
    on_commit(next, marks);
  }

  function move(index: number) {
    active = index;
    hover = null;
    cell_elements[index]?.focus();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const next = grid_key_move(event.key, active, width, height);
    if (next !== null) {
      event.preventDefault();
      // Shift paints the cell left behind, so a run can be laid down without lifting the keys.
      if (event.shiftKey && !solved && marks[active] === Mark.EMPTY) {
        const painted = [...marks];
        painted[active] = pick(false);
        painted[next] = painted[next] === Mark.EMPTY ? painted[active] : painted[next];
        on_commit(painted, marks);
      }
      move(next);
      return;
    }
    const key = event.key.toLowerCase();
    if (key === " " || key === "enter" || key === "f") {
      event.preventDefault();
      set_cell(active, pick(false));
    } else if (key === "x") {
      event.preventDefault();
      set_cell(active, pick(true));
    } else if (key === "backspace" || key === "delete") {
      event.preventDefault();
      if (marks[active] !== Mark.EMPTY) set_cell(active, marks[active]);
    }
  }

  function cell_label(index: number): string {
    const mark = marks[index];
    const state =
      mark === Mark.CROSSED ? "crossed" : mark > 0 ? (colored ? palette[mark - 1] : "filled") : "blank";
    return `Row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}, ${state}`;
  }

  function clue_label(kind: "Row" | "Column", index: number, clue: Clue, done: boolean): string {
    const text = clue.length ? clue.map((run) => (colored ? `${run.length} ${palette[run.color - 1]}` : run.length)).join(", ") : "empty";
    return `${kind} ${index + 1}: ${text}${done ? ", done" : ""}`;
  }
</script>

{#snippet clue_numbers(clue: Clue, done: readonly boolean[] | undefined)}
  {#if clue.length}
    {#each clue as run, index (index)}
      {#if colored}
        <span class={cn("chip grid place-items-center rounded-[3px] text-background transition-opacity", done?.[index] && "opacity-30")} style:background={ink(run.color)}>{run.length}</span>
      {:else}
        <span class={cn("transition-colors", done?.[index] && "text-foreground/30")}>{run.length}</span>
      {/if}
    {/each}
  {:else}
    <span class="text-foreground/30">0</span>
  {/if}
{/snippet}

<div
  class={cn("board relative m-auto grid select-none [-webkit-touch-callout:none]", zoomed && "zoomed", colored && "colored")}
  style:--cols={width}
  style:--rows={height}
  style:--clue-cols={clue_cols}
  style:--clue-rows={clue_rows}
>
  <div class="corner sticky top-0 left-0 z-20 grid place-items-center bg-background font-mono text-foreground/65 tabular-nums" aria-hidden="true">
    {@render corner?.()}
  </div>

  <div class="col-clues sticky top-0 z-10 grid bg-background" role="group" aria-label="Column clues">
    {#each cols as clue, col (col)}
      <div
        class={cn(
          "col-clue flex flex-col items-center justify-end rounded-t-sm font-mono leading-none font-semibold text-foreground/85 tabular-nums transition-colors",
          crosshair && col === focus_col && "bg-primary/14 text-foreground"
        )}
        aria-label={clue_label("Column", col, clue, done_cols?.[col] ?? false)}
      >
        {@render clue_numbers(clue, col_runs?.[col])}
      </div>
    {/each}
  </div>

  <div class="row-clues sticky left-0 z-10 grid bg-background" role="group" aria-label="Row clues">
    {#each rows as clue, row (row)}
      <div
        class={cn(
          "row-clue flex items-center justify-end rounded-l-sm font-mono font-semibold text-foreground/85 tabular-nums transition-colors",
          crosshair && row === focus_row && "bg-primary/14 text-foreground"
        )}
        aria-label={clue_label("Row", row, clue, done_rows?.[row] ?? false)}
      >
        {@render clue_numbers(clue, row_runs?.[row])}
      </div>
    {/each}
  </div>

  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    role="grid"
    aria-label={label}
    tabindex="-1"
    class={cn("cells relative grid touch-none overflow-hidden rounded-sm bg-foreground/22 ring-1 ring-foreground/45", solved && "solved", solved && wash && "wash")}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointerup={end_stroke}
    onlostpointercapture={end_stroke}
    onpointerleave={() => (hover = null)}
    onfocusin={() => (board_focused = true)}
    onfocusout={() => (board_focused = false)}
    oncontextmenu={(event) => event.preventDefault()}
    onkeydown={on_keydown}
  >
    {#each { length: height }, row (row)}
      <div role="row" class="contents">
        {#each { length: width }, col (col)}
          {@const index = row * width + col}
          {@const mark = marks[index] ?? Mark.EMPTY}
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
            style:--ink={mark > 0 ? ink(mark) : null}
            class={cn(
              "cell relative grid place-items-center outline-none",
              "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
              col % 5 === 0 && col > 0 && "major-left",
              row % 5 === 0 && row > 0 && "major-top",
              mark > 0 ? "filled" : lit ? "lit" : "blank",
              flagged?.has(index) && "flagged",
              flash?.index === index && (flash.fix ? "flash-fix" : "flash")
            )}
          >
            {#if solved}
              <!-- The picture alone, without the working. -->
            {:else if mark === Mark.CROSSED}
              <XIcon weight="bold" class="size-[55%] text-foreground/45" />
            {:else if mark === Mark.EMPTY && (done_rows?.[row] || done_cols?.[col])}
              <span class="size-[16%] rounded-full bg-foreground/30"></span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}

    {@render overlay?.()}
  </div>
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

  /* Colour chips need a little more room than bare numbers to stay legible. */
  .colored {
    --clue: 0.72;
    --clue-min: 1.05rem;
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

  .col-clue {
    gap: 0.1em;
    padding-bottom: 0.25em;
  }

  .row-clues {
    grid-template-rows: repeat(var(--rows), var(--cell));
    gap: var(--gap);
    padding-block: 1px;
  }

  .row-clue {
    gap: 0.4em;
    padding-right: 0.4em;
  }

  .colored .col-clue {
    gap: 2px;
    padding-bottom: 3px;
  }

  .colored .row-clue {
    gap: 2px;
    padding-right: 3px;
  }

  .col-clue .chip {
    width: calc(var(--cell) - 4px);
    height: calc(var(--clue-size) - 2px);
  }

  .row-clue .chip {
    width: calc(var(--clue-size) - 2px);
    height: calc(var(--cell) - 4px);
  }

  .chip {
    font-size: 0.9em;
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
    background: var(--ink);
  }

  .flagged::after {
    content: "";
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 0 2px var(--error);
    background: repeating-linear-gradient(
      45deg,
      color-mix(in oklab, var(--error) 30%, transparent) 0 2px,
      transparent 2px 6px
    );
    pointer-events: none;
  }

  .solved .filled {
    animation: reveal 500ms var(--ease-out) backwards;
    animation-delay: calc(var(--wave) * 22ms);
  }

  /* Solving washes a black-and-white picture into the brand colour from the top-left corner. */
  .wash .filled {
    background: var(--primary);
    animation-name: reveal-wash;
  }

  .solved :global(.overlay) {
    animation: overlay-in 300ms var(--ease-out) 900ms backwards;
  }

  @keyframes reveal {
    from {
      scale: 0.6;
    }
  }

  @keyframes reveal-wash {
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
