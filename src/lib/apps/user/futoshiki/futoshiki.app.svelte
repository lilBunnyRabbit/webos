<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    CaretDown as CaretDownIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    CaretUp as CaretUpIcon,
    ChartBar as ChartBarIcon,
    Eraser as EraserIcon,
    Lightbulb as LightbulbIcon,
    PencilSimple as PencilIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    clear_notes,
    conflicts,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    digit_counts,
    empty_stats,
    fill_notes,
    hint,
    new_game,
    place,
    record,
    restore,
    saved_schema,
    SignState,
    sign_states,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    to_saved,
    toggle_note,
    with_cells,
    type Game,
    type Saved,
  } from "./game";
  import { Relation } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));

  interface Snapshot {
    values: readonly number[];
    notes: readonly number[];
  }

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // Per window, so two open puzzles don't overwrite each other; storage keeps the last one touched for next time.
  // A daily puzzle saves under its own key, so it never replaces the regular game.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  const initial_size = daily_day ? DAILY_SIZE : restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S5);
  let size = $state<Size>(initial_size);
  const initial_game = restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_size, random_seed()));
  let game = $state.raw<Game>(initial_game);
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  // The clock starts on the first move; a quick solve counts from when the puzzle was shown, unknown for a resumed one.
  let shown_at: number | null = restored ? null : performance.now();
  let new_best = $state(false);
  let notes_mode = $state(false);
  let undo_stack = $state.raw<Snapshot[]>([]);
  let redo_stack = $state.raw<Snapshot[]>([]);
  let active = $state(first_open(initial_game));
  let flash = $state<{ index: number; fix: boolean } | null>(null);
  let show_stats = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  const puzzle = $derived(game.puzzle);
  const n = $derived(puzzle.size);
  const signs = $derived(sign_states(game));
  const bad = $derived(conflicts(game));
  const counts = $derived(digit_counts(game));
  const elapsed = $derived(clock.elapsed);
  const active_row = $derived(Math.floor(active / n));
  const active_col = $derived(active % n);
  const active_digit = $derived(game.values[active]);
  const filled = $derived(game.values.filter(Boolean).length);
  const best = $derived(stats.value[size].best);
  const note_cols = $derived(n <= 4 ? 2 : 3);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (bad.size) return "A digit repeats or a sign is broken";
    if (notes_mode) return "Notes: digits pencil in as candidates";
    if (daily) return `Daily · ${daily}`;
    return `1 to ${n} once in each row and column`;
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `futoshiki.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("notes", "n", "Toggle notes", () => (notes_mode = !notes_mode)),
      scoped("fill-notes", "m", "Pencil in all candidates", pencil_all),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function first_open(of: Game): number {
    return Math.max(0, of.values.findIndex((value) => !value));
  }

  function store_game(saved: Saved) {
    if (daily) storage.set("daily", { day: daily, game: saved });
    else storage.set("game", saved);
  }

  function save() {
    store_game(to_saved(game, size, clock.read()));
  }
  // Moves save as they happen; the time since the last one would be lost on close.
  onDestroy(save);

  function apply(next: Game, hints = game.hints) {
    if (!clock.running) clock.start();
    game = { ...next, hints };
    if (game.solved) finish();
    save();
  }

  function commit(next: Game, hints = game.hints) {
    if (next === game && hints === game.hints) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }].slice(-200);
    redo_stack = [];
    apply(next, hints);
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    report_solve();
  }

  function report_solve() {
    const clean = game.hints === 0;
    achievements.achieve("first-solve");
    if (daily) achievements.achieve("daily");
    if (size === Size.S7 && clean) achievements.achieve("big");
    if (size === Size.S5 && clean && shown_at !== null && performance.now() - shown_at < 60_000) achievements.achieve("quick");
    achievements.progress("solves-25", Object.values(stats.value).reduce((sum, entry) => sum + entry.solved, 0));
  }

  function restore_snapshot(snapshot: Snapshot) {
    apply(with_cells(game, snapshot.values, snapshot.notes));
  }

  function undo() {
    if (!undo_stack.length || game.solved) return;
    redo_stack = [...redo_stack, { values: game.values, notes: game.notes }];
    restore_snapshot(undo_stack[undo_stack.length - 1]);
    undo_stack = undo_stack.slice(0, -1);
  }

  function redo() {
    if (!redo_stack.length || game.solved) return;
    undo_stack = [...undo_stack, { values: game.values, notes: game.notes }];
    restore_snapshot(redo_stack[redo_stack.length - 1]);
    redo_stack = redo_stack.slice(0, -1);
  }

  function give_hint() {
    if (game.solved) return;
    const next = hint(game);
    if (!next) return;
    flash = { index: next.index, fix: next.fix };
    active = next.index;
    commit(place(game, next.index, next.digit), game.hints + 1);
  }

  function pencil_all() {
    if (game.solved) return;
    commit(fill_notes(game));
  }

  async function start_over(next_size: Size = size) {
    const progress = !game.solved && game.values.some((value, index) => value && !puzzle.givens[index]);
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
    shown_at = performance.now();
    new_best = false;
    undo_stack = [];
    redo_stack = [];
    flash = null;
    active = first_open(game);
    save();
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (!game.solved && game.values.some((value, index) => value && !puzzle.givens[index])) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its digits are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function input(digit: number, as_note = notes_mode) {
    if (game.solved || puzzle.givens[active]) return;
    flash = null;
    if (as_note) {
      if (!game.values[active]) commit(toggle_note(game, active, digit));
      return;
    }
    commit(place(game, active, game.values[active] === digit ? 0 : digit));
  }

  function erase() {
    if (game.solved || puzzle.givens[active]) return;
    flash = null;
    commit(game.values[active] ? place(game, active, 0) : clear_notes(game, active));
  }

  function move(index: number) {
    active = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const moves: Record<string, number> = {
      ArrowUp: Math.max(0, active_row - 1) * n + active_col,
      ArrowDown: Math.min(n - 1, active_row + 1) * n + active_col,
      ArrowLeft: active_row * n + Math.max(0, active_col - 1),
      ArrowRight: active_row * n + Math.min(n - 1, active_col + 1),
      Home: active_row * n,
      End: active_row * n + n - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(moves[event.key]);
      return;
    }
    // The code, not the key, so Shift+digit reads as a digit on every layout.
    const digit = Number(/^(?:Digit|Numpad)(\d)$/.exec(event.code)?.[1] ?? NaN);
    if (digit >= 1 && digit <= n) {
      event.preventDefault();
      input(digit, notes_mode !== event.shiftKey);
    } else if (digit === 0 || event.key === "Backspace" || event.key === "Delete" || event.key === " ") {
      event.preventDefault();
      erase();
    } else if (event.key === "Enter") {
      event.preventDefault();
      notes_mode = !notes_mode;
    }
  }

  function relation_word(relation: Relation, smaller_first: boolean): string {
    return (relation === Relation.LESS) === smaller_first ? "less than" : "greater than";
  }

  function cell_label(index: number): string {
    const row = Math.floor(index / n);
    const col = index % n;
    const value = game.values[index];
    const parts = [`Row ${row + 1}, column ${col + 1}`];
    if (value) parts.push(puzzle.givens[index] ? `${value}, given` : String(value));
    else if (game.notes[index]) parts.push(`notes ${[...Array(n).keys()].filter((d) => game.notes[index] & (1 << (d + 1))).map((d) => d + 1).join(" ")}`);
    else parts.push("empty");
    const signs_around: string[] = [];
    if (col < n - 1 && puzzle.across[row * (n - 1) + col]) signs_around.push(`${relation_word(puzzle.across[row * (n - 1) + col], true)} right`);
    if (col > 0 && puzzle.across[row * (n - 1) + col - 1]) signs_around.push(`${relation_word(puzzle.across[row * (n - 1) + col - 1], false)} left`);
    if (row < n - 1 && puzzle.down[index]) signs_around.push(`${relation_word(puzzle.down[index], true)} below`);
    if (row > 0 && puzzle.down[index - n]) signs_around.push(`${relation_word(puzzle.down[index - n], false)} above`);
    if (signs_around.length) parts.push(signs_around.join(", "));
    if (bad.has(index)) parts.push("breaks a rule");
    return parts.join(", ");
  }

  function sign_class(state: SignState): string {
    if (game.solved) return "text-foreground/30";
    return state === SignState.BROKEN ? "text-error" : state === SignState.MET ? "text-foreground/30" : "text-foreground/85";
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
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!undo_stack.length || game.solved} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length || game.solved} onclick={redo} class="hidden @md:inline-flex">
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
    <div class="flex min-h-0 flex-col touch-manipulation">
      <div class="flex min-h-0 flex-1 overflow-auto p-3 pb-2 [container-type:size]">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="grid"
          aria-label="Futoshiki, {n} by {n}. Arrows move, digits fill, Shift with a digit notes it, Backspace clears, Enter toggles notes"
          tabindex="-1"
          class="board relative m-auto grid select-none [-webkit-touch-callout:none]"
          style:--n={n}
          style:--note-cols={note_cols}
          onkeydown={on_board_keydown}
          oncontextmenu={(event) => event.preventDefault()}
        >
          {#each { length: n }, row (row)}
            <div role="row" class="contents">
              {#each { length: n }, col (col)}
                {@const index = row * n + col}
                {@const value = game.values[index]}
                {@const given = puzzle.givens[index] !== 0}
                {@const selected = index === active && !game.solved}
                {@const in_line = !game.solved && (row === active_row || col === active_col)}
                {@const same = !game.solved && active_digit !== 0 && value === active_digit}
                {@const wrong = bad.has(index)}
                <button
                  bind:this={cell_elements[index]}
                  type="button"
                  role="gridcell"
                  data-cell={index}
                  tabindex={index === active ? 0 : -1}
                  aria-label={cell_label(index)}
                  aria-selected={index === active}
                  aria-readonly={given}
                  style:grid-row={row * 2 + 1}
                  style:grid-column={col * 2 + 1}
                  onfocus={() => (active = index)}
                  onclick={() => move(index)}
                  class={cn(
                    "cell relative grid place-items-center rounded-[14%] font-mono leading-none tabular-nums outline-none",
                    "ring-1 ring-foreground/22 ring-inset transition-[background-color,box-shadow,color] duration-100",
                    "focus-visible:ring-2 focus-visible:ring-cottontail",
                    "bg-[light-dark(var(--background-lightest),var(--background-darker))]",
                    given ? "font-bold text-foreground" : "font-medium text-primary",
                    in_line && !selected && "bg-[color-mix(in_oklab,var(--primary)_8%,var(--background))]",
                    same && !selected && "bg-primary/18",
                    selected && "bg-primary/30 ring-2 ring-primary",
                    wrong && "bg-error/14 text-error",
                    game.solved && "text-foreground",
                    flash?.index === index && (flash.fix ? "flash-fix" : "flash")
                  )}
                >
                  {#if value}
                    <span class="digit">{value}</span>
                  {:else if game.notes[index]}
                    <span class="notes grid size-full p-[8%]" aria-hidden="true">
                      {#each { length: n }, d (d)}
                        <span
                          class={cn(
                            "grid place-items-center leading-none font-medium",
                            game.notes[index] & (1 << (d + 1)) ? (active_digit === d + 1 ? "text-primary" : "text-foreground/70") : "invisible"
                          )}>{d + 1}</span
                        >
                      {/each}
                    </span>
                  {/if}
                </button>
                {#if col < n - 1 && puzzle.across[row * (n - 1) + col] !== Relation.NONE}
                  {@const sign = row * (n - 1) + col}
                  <span
                    class={cn("sign grid place-items-center transition-colors", sign_class(signs.across[sign]))}
                    style:grid-row={row * 2 + 1}
                    style:grid-column={col * 2 + 2}
                    aria-hidden="true"
                  >
                    {#if puzzle.across[sign] === Relation.LESS}<CaretLeftIcon weight="bold" />{:else}<CaretRightIcon weight="bold" />{/if}
                  </span>
                {/if}
                {#if row < n - 1 && puzzle.down[index] !== Relation.NONE}
                  <span
                    class={cn("sign grid place-items-center transition-colors", sign_class(signs.down[index]))}
                    style:grid-row={row * 2 + 2}
                    style:grid-column={col * 2 + 1}
                    aria-hidden="true"
                  >
                    {#if puzzle.down[index] === Relation.LESS}<CaretUpIcon weight="bold" />{:else}<CaretDownIcon weight="bold" />{/if}
                  </span>
                {/if}
              {/each}
            </div>
          {/each}

          {#if game.solved}
            <BoardOverlay class="-m-2 rounded-xl bg-background/60" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>
      </div>

      <div class="mx-auto flex w-full max-w-md flex-col gap-1.5 px-3 pb-3">
        <div class="pad grid gap-1.5" style:--n={n} role="group" aria-label="Digits">
          {#each { length: n }, d (d)}
            {@const digit = d + 1}
            <Button
              variant={notes_mode ? "quiet" : "secondary"}
              class={cn(
                "h-11 px-0 font-mono text-lg tabular-nums pointer-coarse:h-13",
                notes_mode && "text-base ring-1 ring-foreground/22 ring-inset",
                counts[digit] >= n && "opacity-38"
              )}
              aria-label={notes_mode ? `Note ${digit}` : `Place ${digit}`}
              disabled={game.solved}
              onmousedown={(event: MouseEvent) => event.preventDefault()}
              onclick={() => input(digit)}
              {@attach long_press({ on_menu: () => input(digit, !notes_mode) })}
            >
              {digit}
            </Button>
          {/each}
        </div>
        <div class="actions grid grid-cols-2 gap-1.5 pointer-coarse:grid-cols-4" role="group" aria-label="Actions">
          <Button variant="quiet" class="hidden pointer-coarse:inline-flex" disabled={!undo_stack.length || game.solved} onclick={undo}>
            <UndoIcon weight="bold" />Undo
          </Button>
          <Button variant="quiet" disabled={game.solved} onmousedown={(event: MouseEvent) => event.preventDefault()} onclick={erase}>
            <EraserIcon weight="bold" />Erase
          </Button>
          <Button
            variant="quiet"
            pressed={notes_mode}
            disabled={game.solved}
            onmousedown={(event: MouseEvent) => event.preventDefault()}
            onclick={() => (notes_mode = !notes_mode)}
          >
            <PencilIcon weight={notes_mode ? "fill" : "bold"} />Notes
          </Button>
          <Button variant="quiet" class="hidden pointer-coarse:inline-flex" disabled={game.solved} onclick={give_hint}>
            <LightbulbIcon weight="bold" />Hint
          </Button>
        </div>
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-foreground/8 @5xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
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

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span aria-live="polite">{status}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{filled}/{n * n} filled</span>
    <span class="hidden @2xl:inline pointer-coarse:hidden">Shift+digit notes · M pencils in all · H hint</span>
  </StatusBar>
</div>

<style>
  .board {
    --ratio: 0.42;
    --cell: clamp(1.75rem, min(100cqw, 100cqh) / (var(--n) + (var(--n) - 1) * var(--ratio)), 4.5rem);
    --gap: calc(var(--cell) * var(--ratio));
    grid-template-columns: repeat(calc(var(--n) - 1), var(--cell) var(--gap)) var(--cell);
    grid-template-rows: repeat(calc(var(--n) - 1), var(--cell) var(--gap)) var(--cell);
  }

  .digit {
    font-size: calc(var(--cell) * 0.52);
  }

  .notes {
    grid-template-columns: repeat(var(--note-cols), 1fr);
    grid-auto-rows: 1fr;
    font-size: calc(var(--cell) * 0.25);
  }

  .sign {
    font-size: calc(var(--gap) * 1.15);
  }

  .pad {
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
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
