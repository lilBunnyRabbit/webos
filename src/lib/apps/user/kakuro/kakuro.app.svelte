<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$lib/core/games";
  import { BoardOverlay, Button, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowRight as ArrowRightIcon,
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    Backspace as BackspaceIcon,
    ChartBar as ChartBarIcon,
    Lightbulb as LightbulbIcon,
    PencilSimple as PencilIcon,
    PenNib as PenIcon,
    Plus as PlusIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    clear,
    conflicts,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    empty_stats,
    hint,
    is_white,
    new_game,
    peers,
    place,
    record,
    restore,
    run_combos,
    run_states,
    RunState,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    toggle_note,
    with_entries,
    type Game,
    type Saved,
  } from "./game";
  import { bit } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));
  const TOOL_OPTIONS = [
    { value: "digit", label: "Digit", icon: PenIcon },
    { value: "notes", label: "Notes", icon: PencilIcon },
  ] as const;
  type Tool = (typeof TOOL_OPTIONS)[number]["value"];
  const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const MAX_COMBOS = 6;

  interface Entries {
    values: readonly number[];
    notes: readonly number[];
  }

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
  const initial_size = daily_day ? DAILY_SIZE : restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S8);
  let size = $state<Size>(initial_size);
  const initial_game = restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_size, random_seed()));
  let game = $state.raw<Game>(initial_game);
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  let new_best = $state(false);
  let tool = $state<Tool>("digit");
  let undo_stack = $state.raw<Entries[]>([]);
  let redo_stack = $state.raw<Entries[]>([]);
  let active = $state(first_white(initial_game));
  let flash = $state<{ cell: number; fix: boolean } | null>(null);
  let announcement = $state("");
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);
  let board: HTMLDivElement | undefined = $state();

  const puzzle = $derived(game.puzzle);
  const side = $derived(puzzle.size);
  const states = $derived(run_states(game));
  const clashing = $derived(conflicts(game));
  const across_run = $derived(puzzle.runs[puzzle.across_of[active]]);
  const down_run = $derived(puzzle.runs[puzzle.down_of[active]]);
  const highlighted = $derived(new Set(game.solved ? [] : [...(across_run?.cells ?? []), ...(down_run?.cells ?? [])]));
  const used_by_peers = $derived(
    peers(puzzle, active).reduce((mask, cell) => (game.values[cell] ? mask | bit(game.values[cell]) : mask), 0)
  );
  const clues = $derived.by(() => {
    const map = new Map<number, { across?: number; down?: number }>();
    puzzle.runs.forEach((run, index) => {
      const entry = map.get(run.clue) ?? {};
      if (run.across) entry.across = index;
      else entry.down = index;
      map.set(run.clue, entry);
    });
    return map;
  });
  const elapsed = $derived(clock.elapsed);
  const white_count = $derived(puzzle.across_of.filter((run) => run >= 0).length);
  const filled = $derived(game.values.filter(Boolean).length);
  const best = $derived(stats.value[size].best);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (clashing.size) return "A digit repeats in a run";
    if (states.includes(RunState.WRONG)) return "A run doesn't add up";
    if (daily) return `Daily · ${daily}`;
    return "Each run adds up to its clue, no digit twice";
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `kakuro.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("notes", "n", "Toggle notes", () => (tool = tool === "digit" ? "notes" : "digit")),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function first_white(of: Game): number {
    return of.puzzle.across_of.findIndex((run) => run >= 0);
  }

  function store_game(saved: Saved) {
    if (daily) storage.set("daily", { day: daily, game: saved });
    else storage.set("game", saved);
  }

  function save() {
    store_game({
      size,
      seed: puzzle.seed,
      values: [...game.values],
      notes: [...game.notes],
      hints: game.hints,
      elapsed: clock.read(),
    });
  }

  function apply(entries: Entries, hints = game.hints) {
    if (!clock.running) clock.start();
    const next = { ...with_entries(game, entries.values, entries.notes), hints };
    game = next;
    if (next.solved) finish();
    save();
  }

  function commit(entries: Entries, hints = game.hints) {
    const same = (a: readonly number[], b: readonly number[]) => a.every((value, index) => value === b[index]);
    if (same(entries.values, game.values) && same(entries.notes, game.notes) && hints === game.hints) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }].slice(-200);
    redo_stack = [];
    apply(entries, hints);
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    announcement = `Solved in ${format_time(time)}`;
  }

  function undo() {
    if (!undo_stack.length || game.solved) return;
    redo_stack = [...redo_stack, { values: game.values, notes: game.notes }];
    const previous = undo_stack[undo_stack.length - 1];
    undo_stack = undo_stack.slice(0, -1);
    flash = null;
    apply(previous);
  }

  function redo() {
    if (!redo_stack.length || game.solved) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }];
    const next = redo_stack[redo_stack.length - 1];
    redo_stack = redo_stack.slice(0, -1);
    flash = null;
    apply(next);
  }

  function give_hint() {
    if (game.solved) return;
    const next = hint(game);
    if (!next) return;
    const values = [...game.values];
    values[next.cell] = next.digit;
    flash = { cell: next.cell, fix: next.fix };
    if (board?.contains(document.activeElement)) select(next.cell);
    else active = next.cell;
    announcement = `${next.fix ? "Corrected" : "Hint"}: ${cell_name(next.cell)} is ${next.digit}`;
    commit({ values, notes: game.notes }, game.hints + 1);
  }

  async function start_over(next_size: Size = size) {
    const progress = !game.solved && (game.values.some(Boolean) || game.notes.some(Boolean));
    if (progress && next_size === size) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The digits on this one are lost. Statistics stay.",
        confirm_label: "New puzzle",
      });
      if (!confirmed) return;
    }
    daily = null;
    size = next_size;
    storage.set("size", next_size);
    game = new_game(next_size, random_seed());
    clock.reset();
    new_best = false;
    undo_stack = [];
    redo_stack = [];
    flash = null;
    announcement = "";
    active = first_white(game);
    save();
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (!game.solved && (game.values.some(Boolean) || game.notes.some(Boolean))) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its digits are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function enter(digit: number, as_note = tool === "notes") {
    if (game.solved || !is_white(puzzle, active)) return;
    flash = null;
    if (as_note) {
      if (game.values[active]) return;
      commit(toggle_note(game, active, digit));
    } else commit(place(game, active, digit));
  }

  function erase() {
    if (game.solved || !is_white(puzzle, active)) return;
    flash = null;
    commit(clear(game, active));
  }

  function select(cell: number) {
    active = cell;
    cell_elements[cell]?.focus();
  }

  function step(from: number, d_row: number, d_col: number): number {
    let row = Math.floor(from / side) + d_row;
    let col = (from % side) + d_col;
    while (row >= 0 && row < side && col >= 0 && col < side) {
      if (is_white(puzzle, row * side + col)) return row * side + col;
      row += d_row;
      col += d_col;
    }
    return from;
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const row = Math.floor(active / side);
    const moves: Record<string, () => number> = {
      ArrowUp: () => step(active, -1, 0),
      ArrowDown: () => step(active, 1, 0),
      ArrowLeft: () => step(active, 0, -1),
      ArrowRight: () => step(active, 0, 1),
      Home: () => step(row * side, 0, 1),
      End: () => (is_white(puzzle, row * side + side - 1) ? row * side + side - 1 : step(row * side + side - 1, 0, -1)),
    };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]());
      return;
    }
    // `code` rather than `key`: Shift+1 types "!" on most layouts, but Shift+digit is how notes go in from the keyboard.
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (match) {
      event.preventDefault();
      enter(Number(match[1]), event.shiftKey ? tool === "digit" : tool === "notes");
    } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
      event.preventDefault();
      erase();
    }
  }

  function cell_name(cell: number): string {
    return `row ${Math.floor(cell / side) + 1}, column ${(cell % side) + 1}`;
  }

  function cell_label(cell: number): string {
    const digit = game.values[cell];
    const notes = game.notes[cell];
    const marks = DIGITS.filter((d) => notes & bit(d));
    const state = digit ? `${digit}${clashing.has(cell) ? ", repeats" : ""}` : marks.length ? `notes ${marks.join(" ")}` : "empty";
    return `${cell_name(cell)[0].toUpperCase()}${cell_name(cell).slice(1)}, ${state}`;
  }

  function clue_label(cell: number): string {
    const entry = clues.get(cell);
    if (!entry) return "Blank";
    const parts: string[] = [];
    if (entry.across !== undefined) parts.push(`across ${puzzle.runs[entry.across].sum} in ${puzzle.runs[entry.across].cells.length}`);
    if (entry.down !== undefined) parts.push(`down ${puzzle.runs[entry.down].sum} in ${puzzle.runs[entry.down].cells.length}`);
    return `Clue, ${parts.join(", ")}`;
  }

  function combos_text(run: (typeof puzzle.runs)[number] | undefined): string {
    if (!run) return "";
    const all = run_combos(run, game.values);
    if (!all.length) return "no combination fits";
    const shown = all.slice(0, MAX_COMBOS).join("  ");
    return all.length > MAX_COMBOS ? `${shown}  +${all.length - MAX_COMBOS}` : shown;
  }

  function sum_class(state: RunState, focused: boolean): string {
    if (state === RunState.WRONG) return "text-error";
    if (state === RunState.DONE) return "text-foreground/35";
    return focused ? "text-primary" : "text-foreground";
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

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-24 @2xl:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Segmented size="sm" class="hidden @lg:inline-flex" label="Tool" options={[...TOOL_OPTIONS]} bind:value={tool} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" disabled={!undo_stack.length || game.solved} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length || game.solved} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" disabled={game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <IconButton size="sm" variant="primary" label="New puzzle (F2)" class="@md:hidden" onclick={() => start_over()}>
      <PlusIcon weight="bold" />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @md:inline-flex" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col">
      <div class="flex min-h-0 flex-1 p-1 @md:p-3 [container-type:size]">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          bind:this={board}
          role="grid"
          aria-label="Kakuro, {side} by {side}. Arrows move, digits fill, Shift with a digit or N for notes, Backspace clears"
          tabindex="-1"
          class="board relative m-auto grid touch-manipulation overflow-hidden rounded-md bg-foreground/30 select-none [-webkit-touch-callout:none]"
          style:--side={side}
          onkeydown={on_board_keydown}
        >
          {#each { length: side }, row (row)}
            <div role="row" class="contents">
              {#each { length: side }, col (col)}
                {@const cell = row * side + col}
                {#if is_white(puzzle, cell)}
                  {@const digit = game.values[cell]}
                  {@const notes = game.notes[cell]}
                  {@const selected = cell === active && !game.solved}
                  {@const clash = clashing.has(cell)}
                  <button
                    bind:this={cell_elements[cell]}
                    type="button"
                    role="gridcell"
                    tabindex={cell === active ? 0 : -1}
                    aria-label={cell_label(cell)}
                    aria-selected={cell === active}
                    onclick={() => select(cell)}
                    onfocus={() => (active = cell)}
                    class={cn(
                      "entry relative grid place-items-center font-mono leading-none transition-[background-color] duration-100 outline-none",
                      "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                      selected
                        ? "bg-[color-mix(in_oklab,var(--primary)_34%,var(--field))]"
                        : highlighted.has(cell)
                          ? "bg-[color-mix(in_oklab,var(--primary)_12%,var(--field))]"
                          : "bg-(--field)",
                      clash && "bg-[color-mix(in_oklab,var(--error)_16%,var(--field))]",
                      game.solved ? "text-primary" : clash ? "text-error" : "text-foreground",
                      flash?.cell === cell && (flash.fix ? "flash-fix" : "flash")
                    )}
                  >
                    {#if digit}
                      <span class="digit font-semibold">{digit}</span>
                    {:else if notes}
                      <span class="notes grid h-full w-full grid-cols-3 grid-rows-3 p-[4%] text-foreground/80" aria-hidden="true">
                        {#each DIGITS as d (d)}
                          <span class="grid place-items-center">{notes & bit(d) ? d : ""}</span>
                        {/each}
                      </span>
                    {/if}
                  </button>
                {:else}
                  {@const entry = clues.get(cell)}
                  <div
                    role="gridcell"
                    aria-label={clue_label(cell)}
                    class={cn("relative bg-(--block)", entry && "clue font-mono leading-none font-semibold tabular-nums")}
                  >
                    {#if entry?.across !== undefined}
                      {@const focused = entry.across === puzzle.across_of[active] && !game.solved}
                      <span class={cn("sum across absolute", sum_class(states[entry.across], focused))}>{puzzle.runs[entry.across].sum}</span>
                    {/if}
                    {#if entry?.down !== undefined}
                      {@const focused = entry.down === puzzle.down_of[active] && !game.solved}
                      <span class={cn("sum down absolute", sum_class(states[entry.down], focused))}>{puzzle.runs[entry.down].sum}</span>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/each}

          {#if game.solved}
            <BoardOverlay class="z-20 bg-background/70" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>
      </div>

      <div class="mx-auto flex w-full max-w-[34rem] shrink-0 flex-col gap-2 px-2 pb-2 @md:px-3 @md:pb-3">
        <div class="grid min-h-9 gap-0.5 font-mono text-2xs text-foreground/80 tabular-nums">
          {#if !game.solved && across_run}
            <p class="flex min-w-0 items-center gap-1.5">
              <ArrowRightIcon weight="bold" class="size-3 shrink-0 text-foreground/65" aria-label="Across" />
              <span class="shrink-0 font-semibold text-foreground">{across_run.sum} in {across_run.cells.length}</span>
              <span class="truncate">{combos_text(across_run)}</span>
            </p>
          {/if}
          {#if !game.solved && down_run}
            <p class="flex min-w-0 items-center gap-1.5">
              <ArrowDownIcon weight="bold" class="size-3 shrink-0 text-foreground/65" aria-label="Down" />
              <span class="shrink-0 font-semibold text-foreground">{down_run.sum} in {down_run.cells.length}</span>
              <span class="truncate">{combos_text(down_run)}</span>
            </p>
          {/if}
        </div>

        <div class="pad grid touch-manipulation gap-1" role="group" aria-label="Digits">
          {#each DIGITS as digit (digit)}
            {@const noted = tool === "notes" && !!(game.notes[active] & bit(digit)) && !game.values[active]}
            {@const pressed = !game.solved && (noted || game.values[active] === digit)}
            <button
              type="button"
              class={cn(
                "grid h-10 place-items-center rounded-md font-mono text-base font-semibold tabular-nums transition-[background-color,opacity] duration-150 @md:h-9 pointer-coarse:h-11",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail",
                "disabled:pointer-events-none disabled:opacity-38",
                pressed
                  ? "bg-primary/15 text-primary hover:bg-primary/20"
                  : "bg-foreground/8 hover:bg-foreground/12 active:bg-foreground/16",
                !pressed && !game.solved && used_by_peers & bit(digit) && "text-foreground/35"
              )}
              aria-label={tool === "notes" ? `Note ${digit}` : `Digit ${digit}`}
              aria-pressed={pressed}
              disabled={game.solved}
              onclick={() => enter(digit)}
            >
              {digit}
            </button>
          {/each}
          <IconButton
            class="h-10 w-full @lg:hidden @md:h-9 pointer-coarse:h-11 pointer-coarse:w-full"
            label="Notes (N)"
            variant="secondary"
            pressed={tool === "notes"}
            disabled={game.solved}
            onclick={() => (tool = tool === "digit" ? "notes" : "digit")}
          >
            <PencilIcon weight={tool === "notes" ? "fill" : "bold"} />
          </IconButton>
          <IconButton
            class="h-10 w-full @md:h-9 pointer-coarse:h-11 pointer-coarse:w-full"
            label="Clear (Backspace)"
            variant="secondary"
            disabled={game.solved}
            onclick={erase}
          >
            <BackspaceIcon weight="bold" />
          </IconButton>
        </div>
      </div>
      <p class="sr-only" aria-live="polite">{announcement}</p>
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

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span aria-live="polite">{status}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{filled}/{white_count} filled</span>
    <span class="hidden @2xl:inline">Shift+digit or N for notes · H for a hint</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 1px;
    --fit: min(100cqw, 100cqh) / var(--side) - var(--gap);
    --cell: clamp(1.75rem, calc(var(--fit)), 3.5rem);
    --field: light-dark(var(--background-lightest), color-mix(in oklab, var(--foreground) 9%, var(--background)));
    --block: light-dark(color-mix(in oklab, var(--foreground) 18%, var(--background)), var(--background-darker));
    grid-template-columns: repeat(var(--side), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    padding: var(--gap);
  }

  .digit {
    font-size: calc(var(--cell) * 0.56);
  }

  .notes {
    font-size: calc(var(--cell) * 0.27);
    line-height: 1;
  }

  .clue {
    background-image: linear-gradient(
      to top right,
      transparent calc(50% - 0.5px),
      color-mix(in oklab, var(--foreground) 35%, transparent) calc(50% - 0.5px),
      color-mix(in oklab, var(--foreground) 35%, transparent) calc(50% + 0.5px),
      transparent calc(50% + 0.5px)
    );
    font-size: calc(var(--cell) * 0.3);
  }

  .sum {
    transition: color 150ms var(--ease-out);
  }

  .across {
    top: 9%;
    right: 9%;
  }

  .down {
    bottom: 9%;
    left: 9%;
  }

  .pad {
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
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
