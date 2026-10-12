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
    Circle as CircleIcon,
    Lightbulb as LightbulbIcon,
    Square as SquareIcon,
  } from "phosphor-svelte";
  import {
    cycle,
    empty_stats,
    feedback,
    format_time,
    hint,
    Mark,
    new_game,
    paint,
    record,
    restore,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    stroke_cells,
    Tool,
    with_marks,
    type Game,
  } from "./game";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));
  const TOOL_OPTIONS = [
    { value: Tool.SEA, label: "Sea", icon: SquareIcon },
    { value: Tool.DOT, label: "Dot", icon: CircleIcon },
  ];
  const HOLD_MS = 450;

  const { window_id, window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // Per window, so two open puzzles don't overwrite each other; storage keeps the last one touched for next time.
  const saved = storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  const initial_size = restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S7);
  let size = $state<Size>(initial_size);
  let game = $state.raw<Game>(restored ?? new_game(initial_size, random_seed()));
  let elapsed_before = $state(restored ? saved!.elapsed : 0);
  let started_at = $state<number | null>(null);
  let now = $state(Date.now());
  let new_best = $state(false);
  let tool = $state<Tool>(Tool.SEA);
  let undo_stack = $state.raw<(readonly Mark[])[]>([]);
  let redo_stack = $state.raw<(readonly Mark[])[]>([]);
  let active = $state(0);
  let flash = $state<{ index: number; fix: boolean } | null>(null);
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  let stroke: {
    pointer: number;
    start: number;
    last: number;
    mark: Mark;
    erased: Mark;
    base: readonly Mark[];
    axis: "row" | "col" | null;
    hold: ReturnType<typeof setTimeout> | null;
  } | null = null;

  const puzzle = $derived(game.puzzle);
  const width = $derived(puzzle.width);
  const height = $derived(puzzle.height);
  const checks = $derived(feedback(game));
  const elapsed = $derived(elapsed_before + (started_at === null ? 0 : now - started_at));
  const islands = $derived(puzzle.clues.filter(Boolean).length);
  const finished = $derived(puzzle.clues.filter((clue, index) => clue && checks.complete[index]).length);
  const best = $derived(stats.value[size].best);
  const tool_mark = $derived(tool === Tool.SEA ? Mark.SEA : Mark.DOT);
  const other_mark = $derived(tool === Tool.SEA ? Mark.DOT : Mark.SEA);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (checks.pools.some(Boolean)) return "No 2×2 blocks of sea";
    if (checks.errors.some(Boolean)) return "An island in red breaks a rule";
    if (!game.marks.some((mark) => mark !== Mark.EMPTY)) return "Shade the sea: each number is an island of that size";
    return "One sea, no 2×2 pools, one number per island";
  });

  $effect(() => {
    if (game.solved || started_at === null) return;
    const timer = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `nurikabe.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
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
    flash = null;
    set_marks(previous);
  }

  function redo() {
    if (!redo_stack.length || game.solved) return;
    undo_stack = [...undo_stack, game.marks];
    const next = redo_stack[redo_stack.length - 1];
    redo_stack = redo_stack.slice(0, -1);
    flash = null;
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

  function cell_at(x: number, y: number): number | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element?.dataset.cell ? Number(element.dataset.cell) : null;
  }

  /** A mouse click walks the cycle (backwards for right-click or Shift); a tap applies the tool, or takes it back off. */
  function first_mark(event: PointerEvent, current: Mark): Mark {
    if (event.pointerType === "mouse") return cycle(current, tool, event.button === 2 || event.shiftKey);
    return current === tool_mark ? Mark.EMPTY : tool_mark;
  }

  function on_pointerdown(event: PointerEvent) {
    if (game.solved || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null) return;
    event.preventDefault();
    active = index;
    if (puzzle.clues[index]) return;
    const current = game.marks[index];
    stroke = {
      pointer: event.pointerId,
      start: index,
      last: index,
      mark: first_mark(event, current),
      erased: current,
      base: game.marks,
      axis: null,
      // A held finger is the touch right-click: the other mark, without switching tools.
      hold: event.pointerType === "mouse" ? null : setTimeout(on_hold, HOLD_MS),
    };
    flash = null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (started_at === null) started_at = now = Date.now();
    game = with_marks(game, paint(stroke.base, puzzle.clues, [index], stroke.mark, stroke.erased));
  }

  function on_hold() {
    if (!stroke) return;
    stroke.hold = null;
    if (stroke.axis !== null) return;
    stroke.mark = stroke.erased === other_mark ? Mark.EMPTY : other_mark;
    game = with_marks(game, paint(stroke.base, puzzle.clues, [stroke.start], stroke.mark, stroke.erased));
    navigator.vibrate?.(12);
  }

  function on_pointermove(event: PointerEvent) {
    if (!stroke || event.pointerId !== stroke.pointer) return;
    const index = cell_at(event.clientX, event.clientY);
    if (index === null || index === stroke.last) return;
    if (stroke.hold) {
      clearTimeout(stroke.hold);
      stroke.hold = null;
    }
    if (stroke.axis === null && index !== stroke.start) {
      const same_row = Math.floor(index / width) === Math.floor(stroke.start / width);
      const same_col = index % width === stroke.start % width;
      stroke.axis = same_row ? "row" : same_col ? "col" : Math.abs((index % width) - (stroke.start % width)) >= Math.abs(Math.floor(index / width) - Math.floor(stroke.start / width)) ? "row" : "col";
    }
    // Locked to its axis, the stroke ends at the pointer's projection onto the start cell's row or column.
    const end =
      stroke.axis === "row"
        ? Math.floor(stroke.start / width) * width + (index % width)
        : Math.floor(index / width) * width + (stroke.start % width);
    stroke.last = index;
    active = end;
    game = with_marks(game, paint(stroke.base, puzzle.clues, stroke_cells(width, stroke.start, end, stroke.axis), stroke.mark, stroke.erased));
  }

  function end_stroke() {
    if (!stroke) return;
    if (stroke.hold) clearTimeout(stroke.hold);
    const base = stroke.base;
    stroke = null;
    const marks = game.marks;
    game = with_marks(game, base);
    commit(marks, base);
  }

  function set_cell(index: number, mark: Mark) {
    if (game.solved || puzzle.clues[index]) return;
    const marks = [...game.marks];
    marks[index] = mark;
    flash = null;
    commit(marks);
  }

  function move(index: number) {
    active = index;
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
      // Shift paints the cell left behind and the one arrived at, so a wall of sea can be laid without lifting the keys.
      if (event.shiftKey && !game.solved) {
        const marks = [...game.marks];
        for (const index of [active, next]) if (!puzzle.clues[index] && marks[index] === Mark.EMPTY) marks[index] = tool_mark;
        commit(marks);
      }
      move(next);
      return;
    }
    const key = event.key.toLowerCase();
    const current = game.marks[active];
    if (key === " " || key === "enter") {
      event.preventDefault();
      set_cell(active, cycle(current, tool, event.shiftKey));
    } else if (key === "s") {
      event.preventDefault();
      set_cell(active, current === Mark.SEA ? Mark.EMPTY : Mark.SEA);
    } else if (key === "d" || key === ".") {
      event.preventDefault();
      set_cell(active, current === Mark.DOT ? Mark.EMPTY : Mark.DOT);
    } else if (key === "backspace" || key === "delete") {
      event.preventDefault();
      set_cell(active, Mark.EMPTY);
    }
  }

  function cell_label(index: number): string {
    const clue = puzzle.clues[index];
    const mark = game.marks[index];
    const state = clue ? `island of ${clue}` : mark === Mark.SEA ? "sea" : mark === Mark.DOT ? "dot" : "blank";
    const note = checks.pools[index] ? ", in a 2 by 2 pool" : checks.errors[index] ? ", breaks a rule" : clue && checks.complete[index] ? ", complete" : "";
    return `Row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}, ${state}${note}`;
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
    <Segmented size="sm" class="pointer-coarse:hidden" label="Tool" options={TOOL_OPTIONS} bind:value={tool} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!undo_stack.length || game.solved} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length || game.solved} onclick={redo} class="hidden @md:inline-flex pointer-coarse:hidden">
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" class="pointer-coarse:hidden" disabled={game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @sm:inline-flex" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 overflow-auto p-3 [container-type:size] pointer-coarse:p-1.5">
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        role="grid"
        aria-label="Nurikabe, {width} by {height}. Arrows move, Space cycles sea and dot, S shades, D dots, Backspace clears"
        tabindex="-1"
        class="board relative m-auto grid touch-none overflow-hidden rounded-sm bg-foreground/22 ring-1 ring-foreground/40 select-none [-webkit-touch-callout:none]"
        style:--cols={width}
        style:--rows={height}
        onpointerdown={on_pointerdown}
        onpointermove={on_pointermove}
        onpointerup={end_stroke}
        onlostpointercapture={end_stroke}
        oncontextmenu={(event) => event.preventDefault()}
        onkeydown={on_board_keydown}
      >
        {#each { length: height }, row (row)}
          <div role="row" class="contents">
            {#each { length: width }, col (col)}
              {@const index = row * width + col}
              {@const clue = puzzle.clues[index]}
              {@const mark = game.marks[index]}
              {@const wrong = checks.errors[index]}
              {@const done = checks.complete[index] && !game.solved}
              <button
                bind:this={cell_elements[index]}
                type="button"
                role="gridcell"
                data-cell={index}
                tabindex={index === active ? 0 : -1}
                aria-label={cell_label(index)}
                aria-readonly={clue ? true : undefined}
                onfocus={() => (active = index)}
                class={cn(
                  "cell relative grid place-items-center font-mono font-semibold tabular-nums transition-[background-color] duration-75 outline-none",
                  "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                  mark === Mark.SEA
                    ? checks.pools[index] ? "bg-error" : game.solved ? "bg-primary" : "bg-foreground"
                    : wrong ? "bg-[color-mix(in_oklab,var(--error)_14%,var(--background))]"
                    : done ? "bg-[color-mix(in_oklab,var(--success)_16%,var(--background))]"
                    : "bg-background",
                  !clue && mark !== Mark.SEA && !game.solved && "pointer-fine:hover:bg-[color-mix(in_oklab,var(--foreground)_7%,var(--background))]",
                  flash?.index === index && (flash.fix ? "flash-fix" : "flash")
                )}
              >
                {#if clue}
                  <span class={cn(wrong ? "text-error" : done ? "text-success" : game.solved ? "text-primary" : "text-foreground")}>{clue}</span>
                {:else if mark === Mark.DOT && !game.solved}
                  <span class={cn("size-[24%] rounded-full", wrong ? "bg-error" : "bg-foreground/55")}></span>
                {/if}
              </button>
            {/each}
          </div>
        {/each}

        {#if game.solved}
          <BoardOverlay class="z-20 bg-background/60" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
            <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
          </BoardOverlay>
        {/if}
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

  <div class="hidden items-center gap-2 border-t border-foreground/8 bg-background-light px-3 py-2 pointer-coarse:flex" role="toolbar" aria-label="Play">
    <Segmented label="Tool" options={TOOL_OPTIONS} bind:value={tool} />
    <div class="flex-1"></div>
    <IconButton label="Undo" disabled={!undo_stack.length || game.solved} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton label="Redo" disabled={!redo_stack.length || game.solved} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton label="Hint" disabled={game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{finished}/{islands} islands</span>
    <span class="min-w-0" aria-live="polite">{status}</span>
    <span class="hidden @5xl:inline pointer-coarse:hidden">Click shades · right-click dots · drag paints</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 1px;
    --fit: min(100cqw / var(--cols), 100cqh / var(--rows));
    --cell: clamp(1.25rem, calc(var(--fit) - var(--gap)), 3.25rem);
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    padding: 1px;
    font-size: calc(var(--cell) * 0.5);
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
