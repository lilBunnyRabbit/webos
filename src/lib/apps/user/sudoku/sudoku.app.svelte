<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, grid_key_move, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    ChartBar as ChartBarIcon,
    Eraser as EraserIcon,
    Lightbulb as LightbulbIcon,
    MagicWand as MagicWandIcon,
    PencilSimple as PencilIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    auto_notes,
    apply_hint,
    cell_name,
    completed_units,
    conflicts,
    DAILY_DIFFICULTY,
    daily_game,
    daily_saved_schema,
    DIFFICULTIES,
    Difficulty,
    DIFFICULTY_LABELS,
    difficulty_schema,
    digit_counts,
    empty_stats,
    erase,
    first_blank,
    hint,
    HintKind,
    is_given,
    new_game,
    place,
    record,
    restore,
    same_board,
    saved_schema,
    Size,
    SIZE_LABELS,
    size_schema,
    SIZES,
    stats_schema,
    to_saved,
    toggle_note,
    wave_delays,
    with_board,
    type Board,
    type Game,
  } from "./game";
  import { bit, SHAPES } from "./puzzle";

  const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] }));
  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: SIZE_LABELS[value] }));

  const { daily: daily_prop, mode: mode_prop }: { daily?: string; mode?: Size } = $props();
  const daily_day = untrack(() => daily_prop);
  const mode_size = untrack(() => mode_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  // 9×9 keeps the keys it had before 6×6 existed, so its stats and saves carry over.
  const key_for = (base: string, of: Size) => (of === Size.NINE ? base : `${base}-${of}`);
  const all_stats = {
    [Size.NINE]: storage.persisted("stats", empty_stats(), stats_schema),
    [Size.SIX]: storage.persisted(key_for("stats", Size.SIX), empty_stats(), stats_schema),
  };
  const play = track_play(app_id, () => win.is_visible);

  // Per window, so two open puzzles don't overwrite each other; storage keeps the last one touched for next time.
  // A daily puzzle saves under its own key per size, so it never replaces the regular game.
  const daily_size = mode_size ?? Size.NINE;
  const saved_daily = daily_day ? storage.get(key_for("daily", daily_size), daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  const initial_difficulty = daily_day
    ? DAILY_DIFFICULTY
    : restored
      ? restored.difficulty
      : (storage.get("difficulty", difficulty_schema) ?? Difficulty.EASY);
  const initial_size = daily_day
    ? daily_size
    : (mode_size ?? (restored ? restored.size : (storage.get("size", size_schema) ?? Size.NINE)));
  let difficulty = $state<Difficulty>(initial_difficulty);
  const fresh = () =>
    daily_day ? daily_game(daily_day, daily_size) : new_game(initial_difficulty, random_seed(), initial_size);
  const initial_game = restored && restored.size === initial_size ? restored : fresh();
  let game = $state.raw<Game>(initial_game);
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  let new_best = $state(false);
  let notes_mode = $state(false);
  let undo_stack = $state.raw<Board[]>([]);
  let redo_stack = $state.raw<Board[]>([]);
  let selected = $state(first_blank(initial_game.values));
  let flash = $state<{ cell: number; fix: boolean } | null>(null);
  let wave = $state.raw<Map<number, number>>(new Map());
  let message = $state<string | null>(null);
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);
  let board_element = $state<HTMLElement>();

  const size = $derived(game.size);
  const shape = $derived(SHAPES[size]);
  const n = $derived(shape.size);
  const digits = $derived(Array.from({ length: n }, (_, i) => i + 1));
  const stats = $derived(all_stats[size]);
  const values = $derived(game.values);
  const clashes = $derived(conflicts(values));
  const counts = $derived(digit_counts(values));
  const elapsed = $derived(clock.elapsed);
  const label = $derived(
    daily ? `Daily ${SIZE_LABELS[size]} · ${daily}` : `${DIFFICULTY_LABELS[difficulty]} · ${SIZE_LABELS[size]}`
  );
  const focus_digit = $derived(game.solved ? 0 : values[selected]);
  const filled = $derived(values.filter(Boolean).length);
  const best = $derived(stats.value[difficulty].best);
  const hint_note = $derived(game.hints ? `${game.hints} hint${game.hints === 1 ? "" : "s"}` : "");

  const status = $derived.by(() => {
    if (game.solved) {
      const extra = game.hints ? ` with ${hint_note}` : new_best ? ", a new best" : "";
      return `Solved in ${format_time(elapsed)}${extra}`;
    }
    if (message) return message;
    if (clashes.size) return "A digit repeats in a row, column or box";
    if (notes_mode) return "Notes on: digits go in as candidates";
    if (daily) return label;
    return `Every row, column and box holds 1 to ${n} once`;
  });

  $effect(() => {
    if (!wave.size) return;
    const timeout = setTimeout(() => (wave = new Map()), 1100);
    return () => clearTimeout(timeout);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `sudoku.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("notes", "n", "Notes on or off", toggle_notes),
      scoped("auto-notes", "shift+n", "Fill in all notes", fill_notes),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function save() {
    if (daily) storage.set(key_for("daily", size), { day: daily, game: to_saved(game, clock.read()) });
    else storage.set("game", to_saved(game, clock.read()));
  }

  function set_board(board: Board, hints = game.hints) {
    if (!clock.running) clock.start();
    const next = { ...with_board(game, board), hints };
    game = next;
    if (next.solved) finish();
    save();
  }

  function commit(board: Board, hints = game.hints) {
    if (same_board(board, game) && hints === game.hints) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }].slice(-500);
    redo_stack = [];
    set_board(board, hints);
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time, undefined, size);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, difficulty, time, game.hints);
  }

  function undo() {
    if (!undo_stack.length || game.solved) return;
    redo_stack = [...redo_stack, { values: game.values, notes: game.notes }];
    const previous = undo_stack[undo_stack.length - 1];
    undo_stack = undo_stack.slice(0, -1);
    message = null;
    set_board(previous);
  }

  function redo() {
    if (!redo_stack.length || game.solved) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }];
    const next = redo_stack[redo_stack.length - 1];
    redo_stack = redo_stack.slice(0, -1);
    message = null;
    set_board(next);
  }

  function celebrate(before: readonly number[], cell: number) {
    const units = completed_units(before, game.values, cell);
    if (!units.length || game.solved) return;
    wave = wave_delays(units, cell, n);
  }

  function input(digit: number, as_note = notes_mode) {
    if (game.solved || is_given(game, selected)) return;
    flash = null;
    message = null;
    if (as_note) {
      commit(toggle_note(game, selected, digit));
      return;
    }
    const before = game.values;
    commit(place(game, selected, digit));
    celebrate(before, selected);
  }

  function clear() {
    if (game.solved || is_given(game, selected)) return;
    flash = null;
    message = null;
    commit(erase(game, selected));
  }

  function toggle_notes() {
    if (game.solved) return;
    notes_mode = !notes_mode;
    message = null;
  }

  function fill_notes() {
    if (game.solved) return;
    message = "Notes filled with every digit each blank cell still allows";
    commit(auto_notes(game));
  }

  function give_hint() {
    if (game.solved) return;
    const next = hint(game);
    if (!next) return;
    const before = game.values;
    flash = { cell: next.cell, fix: next.kind === HintKind.FIX };
    select(next.cell);
    commit(apply_hint(game, next), game.hints + 1);
    celebrate(before, next.cell);
    const where = cell_name(next.cell, n);
    message =
      next.kind === HintKind.FIX
        ? `Hint: ${where} should be ${next.digit}`
        : next.kind === HintKind.DEDUCE
          ? `Hint: ${next.technique} gives ${next.digit} at ${where}`
          : `Hint: revealed ${next.digit} at ${where}; this one needs more than the basic techniques`;
  }

  async function start_over(next_difficulty: Difficulty = difficulty, next_size: Size = size) {
    const progress = !game.solved && undo_stack.length > 0;
    if (progress && next_difficulty === difficulty && next_size === size) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The digits and notes on this one are lost. Statistics stay.",
        confirm_label: "New puzzle",
      });
      if (!confirmed) return;
    }
    daily = null;
    difficulty = next_difficulty;
    storage.set("difficulty", next_difficulty);
    storage.set("size", next_size);
    game = new_game(next_difficulty, random_seed(), next_size);
    clock.reset();
    new_best = false;
    undo_stack = [];
    redo_stack = [];
    flash = null;
    wave = new Map();
    message = null;
    selected = first_blank(game.values);
    save();
  }

  async function set_difficulty(next: Difficulty) {
    if (next === difficulty) return;
    if (!game.solved && undo_stack.length > 0) {
      const confirmed = await win.confirm(`Switch to ${DIFFICULTY_LABELS[next]}?`, {
        detail: "A new puzzle replaces this one and its progress is lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (!game.solved && undo_stack.length > 0) {
      const confirmed = await win.confirm(`Switch to ${SIZE_LABELS[next]}?`, {
        detail: "A new puzzle replaces this one and its progress is lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(difficulty, next);
  }

  function select(index: number) {
    selected = index;
    if (board_element?.contains(document.activeElement)) cell_elements[index]?.focus();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
    if ((event.target as HTMLElement).closest("input, select, textarea")) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1];
    if (digit && Number(digit) > n) return;
    if (digit) {
      event.preventDefault();
      input(Number(digit), event.shiftKey ? !notes_mode : notes_mode);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete" || event.code === "Digit0" || event.code === "Numpad0") {
      event.preventDefault();
      clear();
      return;
    }
    const next = grid_key_move(event.key, selected, n, n);
    if (next !== null && !event.shiftKey) {
      event.preventDefault();
      select(next);
    }
  }

  function cell_label(index: number): string {
    const value = values[index];
    const where = `Row ${shape.row[index] + 1}, column ${shape.col[index] + 1}`;
    if (value) return `${where}, ${value}${is_given(game, index) ? ", given" : ""}${clashes.has(index) ? ", repeats" : ""}`;
    const notes = digits.filter((d) => game.notes[index] & bit(d));
    return `${where}, blank${notes.length ? `, notes ${notes.join(" ")}` : ""}`;
  }

  function cell_classes(index: number): string {
    const { row: rows, col: cols, box, box_rows, box_cols } = shape;
    const row = rows[index];
    const col = cols[index];
    const value = values[index];
    const peer = row === rows[selected] || col === cols[selected] || box[index] === box[selected];
    const live = !game.solved;
    return cn(
      "cell relative grid place-items-center border-foreground/15 outline-none transition-[background-color] duration-100",
      "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
      col < n - 1 && (col % box_cols === box_cols - 1 ? "border-r-2 border-r-foreground/55" : "border-r"),
      row < n - 1 && (row % box_rows === box_rows - 1 ? "border-b-2 border-b-foreground/55" : "border-b"),
      live && index === selected
        ? "bg-primary/35"
        : live && focus_digit && value === focus_digit
          ? "bg-primary/20"
          : live && peer
            ? "bg-primary/8"
            : "bg-background",
      live && clashes.has(index) && index !== selected && "bg-error/15",
      clashes.has(index) ? "text-error" : is_given(game, index) ? "text-foreground" : game.solved ? "text-foreground" : "text-primary",
      is_given(game, index) ? "font-semibold" : "font-medium",
      flash?.cell === index && (flash.fix ? "flash-fix" : "flash"),
      wave.has(index) && "wave"
    );
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: `Solved counts and best times for every ${SIZE_LABELS[size]} difficulty go back to zero. The puzzle in progress is kept.`,
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) all_stats[size].value = empty_stats();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-20 @2xl:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Difficulty" options={DIFFICULTY_OPTIONS} bind:value={() => difficulty, set_difficulty} />
    <Select class="w-28 @2xl:hidden" size="sm" aria-label="Difficulty" options={DIFFICULTY_OPTIONS} bind:value={() => difficulty, set_difficulty} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" class="hidden @sm:inline-flex" disabled={!redo_stack.length || game.solved} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @md:inline-flex" onclick={() => start_over()}>New puzzle</Button>
    <Button size="sm" variant="primary" class="@md:hidden" onclick={() => start_over()}>New</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="area min-h-0 overflow-hidden p-2 select-none [-webkit-touch-callout:none] @md:p-4">
      <div class="play" style:--n={n}>
        <div class="meta flex items-baseline gap-2 px-0.5 text-ui">
          <span class="font-medium">{label}</span>
          {#if game.hints}<span class="text-foreground/65">· {hint_note}</span>{/if}
          <span class="ml-auto font-mono text-foreground/80 tabular-nums">{format_time(elapsed)}</span>
        </div>

        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          bind:this={board_element}
          role="grid"
          aria-label="Sudoku. Arrows move, 1 to {n} places, Shift with a digit or N for notes, Backspace clears"
          class="board relative grid overflow-hidden rounded-md border-2 border-foreground/55 bg-background shadow-card"
        >
          {#each { length: n }, row (row)}
            <div role="row" class="contents">
              {#each { length: n }, col (col)}
                {@const index = row * n + col}
                {@const value = values[index]}
                <button
                  bind:this={cell_elements[index]}
                  type="button"
                  role="gridcell"
                  aria-selected={index === selected}
                  tabindex={index === selected ? 0 : -1}
                  aria-label={cell_label(index)}
                  class={cell_classes(index)}
                  style:--delay="{wave.get(index) ?? 0}ms"
                  onfocus={() => (selected = index)}
                  onclick={() => (selected = index)}
                >
                  {#if value}
                    <span class="digit leading-none">{value}</span>
                  {:else if game.notes[index]}
                    <span class={cn("notes grid size-full grid-cols-3 p-[6%]", n === 9 ? "grid-rows-3" : "grid-rows-2")} aria-hidden="true">
                      {#each digits as digit (digit)}
                        {@const noted = (game.notes[index] & bit(digit)) !== 0}
                        <span
                          class={cn(
                            "grid place-items-center leading-none font-medium tabular-nums",
                            noted && focus_digit === digit ? "aspect-square self-center rounded-full bg-primary/25 font-bold text-foreground" : "text-foreground/65"
                          )}
                        >
                          {noted ? digit : ""}
                        </span>
                      {/each}
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          {/each}

          {#if game.solved}
            <BoardOverlay
              class="z-20 bg-background/60"
              title="Solved"
              detail="{label} · {format_time(elapsed)}{game.hints ? ` · ${hint_note}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}"
            >
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>

        <div class="controls">
          <div class="tools grid grid-cols-5 gap-1" role="group" aria-label="Tools">
            {#snippet tool(label: string, onclick: () => void, disabled: boolean, pressed: boolean | undefined, icon: typeof UndoIcon, badge?: string)}
              {@const Icon = icon}
              <button
                type="button"
                class={cn(
                  "relative flex flex-col items-center justify-center gap-1 rounded-lg text-2xs font-medium whitespace-nowrap text-foreground/80 outline-none transition-[background-color,opacity] duration-150",
                  "hover:bg-foreground/8 active:shadow-pressed disabled:pointer-events-none disabled:opacity-38",
                  "focus-visible:ring-2 focus-visible:ring-cottontail",
                  pressed && "bg-primary/15 text-foreground shadow-pressed hover:bg-primary/20"
                )}
                aria-pressed={pressed}
                {disabled}
                onpointerdown={(event) => event.preventDefault()}
                {onclick}
              >
                <span class="relative">
                  <Icon weight={pressed ? "fill" : "bold"} class={cn("size-5", pressed && "text-primary")} />
                  {#if badge}
                    <span aria-hidden="true" class={cn("absolute -top-1.5 left-3.5 rounded-full px-1 font-mono text-[0.625rem] leading-[1.35] font-semibold", pressed ? "bg-primary text-background" : "bg-foreground/15 text-foreground/80")}>{badge}</span>
                  {/if}
                </span>
                {label}
              </button>
            {/snippet}
            {@render tool("Undo", undo, !undo_stack.length || game.solved, undefined, UndoIcon)}
            {@render tool("Erase", clear, game.solved || is_given(game, selected) || (!values[selected] && !game.notes[selected]), undefined, EraserIcon)}
            {@render tool("Notes", toggle_notes, game.solved, notes_mode, PencilIcon, notes_mode ? "On" : "Off")}
            {@render tool("Fill notes", fill_notes, game.solved, undefined, MagicWandIcon)}
            {@render tool("Hint", give_hint, game.solved, undefined, LightbulbIcon)}
          </div>

          <div class="pad grid gap-1" role="group" aria-label="Digits">
            {#each digits as digit (digit)}
              {@const left = n - counts[digit]}
              <button
                type="button"
                class={cn(
                  "flex flex-col items-center justify-center rounded-lg bg-raised text-primary shadow-control ring-1 ring-hairline outline-none transition-[background-color,opacity,box-shadow,translate] duration-150",
                  "hover:bg-raised-hover active:translate-y-px active:shadow-pressed disabled:pointer-events-none disabled:opacity-38 disabled:shadow-none",
                  "focus-visible:ring-2 focus-visible:ring-cottontail",
                  focus_digit === digit && "bg-primary/20 shadow-pressed hover:bg-primary/25",
                  notes_mode && "text-foreground/80"
                )}
                aria-label={notes_mode ? `Note ${digit}` : `${digit}, ${left} left`}
                disabled={game.solved || left <= 0}
                onpointerdown={(event) => event.preventDefault()}
                onclick={() => input(digit)}
              >
                <span class={cn("pad-digit leading-none font-medium tabular-nums", notes_mode && "pad-note")}>{digit}</span>
                <span class="pad-left font-mono leading-none text-foreground/55 tabular-nums">{left > 0 ? left : ""}</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-hairline @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-hairline bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @5xl:hidden" />
      <Section title="Statistics · {SIZE_LABELS[size]}" description="Puzzles solved per difficulty. Best times count only solves without hints.">
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
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{filled}/{shape.cells}</span>
    <span aria-live="polite">{status}</span>
    <span class="hidden @2xl:inline">1–{n} place · Shift+digit or N notes · H hint</span>
  </StatusBar>
</div>

<style>
  .area {
    container-type: size;
    touch-action: manipulation;
  }

  .play {
    --gap: 0.625rem;
    --meta: 1.25rem;
    --tools: 3.25rem;
    --board: min(100cqw, 100cqh - var(--meta) - var(--tools) - 3rem - 3 * var(--gap), 40rem);
    --key: clamp(3rem, 100cqh - var(--meta) - var(--tools) - var(--board) - 3 * var(--gap), 5rem);
    --cell: calc(var(--board) / var(--n));
    display: grid;
    height: 100%;
    grid-template-columns: var(--board);
    grid-template-rows: var(--meta) var(--board) auto;
    grid-template-areas: "meta" "board" "controls";
    place-content: center;
    gap: var(--gap);
  }

  .meta {
    grid-area: meta;
    line-height: var(--meta);
  }

  .board {
    grid-area: board;
    grid-template-columns: repeat(var(--n), 1fr);
    grid-template-rows: repeat(var(--n), 1fr);
  }

  .controls {
    grid-area: controls;
    display: grid;
    gap: var(--gap);
  }

  .tools {
    height: var(--tools);
  }

  .pad {
    grid-template-columns: repeat(var(--n), 1fr);
    height: var(--key);
  }

  .digit {
    font-size: calc(var(--cell) * 0.58);
  }

  .notes {
    font-size: calc(var(--cell) * 0.24);
  }

  .pad-digit {
    font-size: clamp(1.25rem, var(--key) * 0.44, 2rem);
  }

  .pad-digit.pad-note {
    font-size: clamp(0.95rem, var(--key) * 0.28, 1.25rem);
  }

  .pad-left {
    font-size: 0.6875rem;
    margin-top: 0.25rem;
    min-height: 1em;
  }

  @container (min-aspect-ratio: 6 / 5) {
    .play {
      --side: clamp(12rem, 32cqw, 18rem);
      --board: min(100cqh - var(--meta) - var(--gap), 100cqw - var(--side) - 2 * var(--gap), 40rem);
      grid-template-columns: var(--board) var(--side);
      grid-template-rows: var(--meta) var(--board);
      grid-template-areas: "meta ." "board controls";
      column-gap: calc(2 * var(--gap));
    }

    .controls {
      align-content: center;
    }

    .pad {
      grid-template-columns: repeat(3, 1fr);
      height: auto;
    }

    .pad > button {
      aspect-ratio: 1;
    }

    .pad-digit {
      font-size: clamp(1.25rem, var(--side) * 0.12, 1.875rem);
    }
  }

  .flash {
    animation: flash 900ms var(--ease-out);
  }

  .flash-fix {
    animation: flash-fix 900ms var(--ease-out);
  }

  .wave {
    animation: wave 520ms var(--ease-out) var(--delay) both;
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

  @keyframes wave {
    40% {
      background-color: color-mix(in oklab, var(--success) 35%, var(--background));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .flash,
    .flash-fix,
    .wave {
      animation: none;
    }
  }
</style>
