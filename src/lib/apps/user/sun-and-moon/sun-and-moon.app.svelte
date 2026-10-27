<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, grid_key_move, Stopwatch, track_play } from "$kit/games";
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
    Equals as EqualsIcon,
    Lightbulb as LightbulbIcon,
    Moon as MoonIcon,
    Sun as SunIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import {
    conflicts,
    cycle,
    daily_game,
    daily_saved_schema,
    DAILY_SIZE,
    empty_stats,
    hint,
    mark_name,
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
    with_values,
    type Game,
    type Saved,
  } from "./game";
  import { Edge, Mark } from "./puzzle";

  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage, achievements } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  // A daily puzzle saves under its own key, so it never replaces the regular game.
  const saved_daily = daily_day ? storage.get("daily", daily_saved_schema) : null;
  const saved = daily_day ? (saved_daily?.day === daily_day ? saved_daily.game : null) : storage.get("game", saved_schema);
  const restored = saved ? restore(saved) : null;
  let daily = $state(daily_day ?? null);
  const initial_size = daily_day ? DAILY_SIZE : restored ? saved!.size : (storage.get("size", size_schema) ?? Size.S6);
  let size = $state<Size>(initial_size);
  const initial_game = restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_size, random_seed()));
  let game = $state.raw<Game>(initial_game);
  let history = $state.raw<History<readonly Mark[]>>(create_history(initial_game.values));
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  let new_best = $state(false);
  let active = $state(first_open(initial_game));
  let flash = $state<{ index: number; fix: boolean } | null>(null);
  const hint_note = new Flash(6000);
  let show_panel = $state(false);
  const cell_elements: HTMLButtonElement[] = $state([]);

  const puzzle = $derived(game.puzzle);
  const n = $derived(puzzle.size);
  const signs = $derived(sign_states(game));
  const bad = $derived(conflicts(game));
  const elapsed = $derived(clock.elapsed);
  const filled = $derived(game.values.filter(Boolean).length);
  const best = $derived(stats.value[size].best);

  const status = $derived.by(() => {
    if (game.solved) return `Solved in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (hint_note.text) return hint_note.text;
    if (bad.size) return "Three alike in a row, too many of one, or a broken sign";
    if (daily) return `Daily · ${daily}`;
    return `${n / 2} suns and ${n / 2} moons in each row and column`;
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `sun-and-moon.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
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
    history = push(history, next.values, { max_entries: 200 });
    apply(next, hints);
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    report_solve(time);
  }

  function report_solve(time: number) {
    const clean = game.hints === 0;
    achievements.achieve("first-solve");
    if (daily) achievements.achieve("daily");
    if (size === Size.S8 && clean) achievements.achieve("big");
    if (size === Size.S6 && clean && time < 45_000) achievements.achieve("quick");
    achievements.progress("solves-25", Object.values(stats.value).reduce((sum, entry) => sum + entry.solved, 0));
  }

  function undo() {
    if (!can_undo(history) || game.solved) return;
    history = history_undo(history);
    hint_note.clear();
    apply(with_values(game, current(history)));
  }

  function redo() {
    if (!can_redo(history) || game.solved) return;
    history = history_redo(history);
    hint_note.clear();
    apply(with_values(game, current(history)));
  }

  function give_hint() {
    if (game.solved) return;
    const next = hint(game);
    if (!next) return;
    flash = { index: next.index, fix: next.fix };
    hint_note.show(next.reason);
    move(next.index);
    commit(place(game, next.index, next.mark), game.hints + 1);
  }

  async function start_over(next_size: Size = size) {
    const progress = !game.solved && game.values.some((value, index) => value && !puzzle.givens[index]);
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
    game = new_game(next_size, random_seed());
    history = create_history(game.values);
    clock.reset();
    new_best = false;
    flash = null;
    hint_note.clear();
    active = first_open(game);
    save();
  }

  async function set_size(next: Size) {
    if (next === size) return;
    if (!game.solved && game.values.some((value, index) => value && !puzzle.givens[index])) {
      const confirmed = await win.confirm(`Switch to ${next}×${next}?`, {
        detail: "A new puzzle replaces this one and its marks are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function edit(next: (of: Game) => Game) {
    if (game.solved || puzzle.givens[active]) return;
    flash = null;
    hint_note.clear();
    commit(next(game));
  }

  function tap(index: number) {
    active = index;
    cell_elements[index]?.focus();
    edit((of) => cycle(of, index));
  }

  function move(index: number) {
    active = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const to = grid_key_move(event.key, active, n, n);
    if (to !== null) {
      event.preventDefault();
      move(to);
      return;
    }
    const key = event.key.toLowerCase();
    const mark = key === "1" || key === "s" ? Mark.SUN : key === "2" || key === "m" ? Mark.MOON : null;
    if (mark !== null) {
      event.preventDefault();
      edit((of) => place(of, active, of.values[active] === mark ? Mark.EMPTY : mark));
    } else if (key === " " || key === "enter") {
      event.preventDefault();
      edit((of) => cycle(of, active));
    } else if (key === "0" || key === "backspace" || key === "delete") {
      event.preventDefault();
      edit((of) => place(of, active, Mark.EMPTY));
    }
  }

  const sign_word = (edge: Edge) => (edge === Edge.SAME ? "same as" : "different from");

  function cell_label(index: number): string {
    const row = Math.floor(index / n);
    const col = index % n;
    const value = game.values[index];
    const parts = [`Row ${row + 1}, column ${col + 1}`, value ? `${mark_name(value)}${puzzle.givens[index] ? ", given" : ""}` : "empty"];
    const around: string[] = [];
    if (col < n - 1 && puzzle.across[row * (n - 1) + col]) around.push(`${sign_word(puzzle.across[row * (n - 1) + col])} right`);
    if (col > 0 && puzzle.across[row * (n - 1) + col - 1]) around.push(`${sign_word(puzzle.across[row * (n - 1) + col - 1])} left`);
    if (row < n - 1 && puzzle.down[index]) around.push(`${sign_word(puzzle.down[index])} below`);
    if (row > 0 && puzzle.down[index - n]) around.push(`${sign_word(puzzle.down[index - n])} above`);
    if (around.length) parts.push(around.join(", "));
    if (bad.has(index)) parts.push("breaks a rule");
    return parts.join(", ");
  }

  function sign_class(state: SignState): string {
    if (game.solved || state === SignState.MET) return "text-foreground/40";
    return state === SignState.BROKEN ? "text-error ring-error" : "text-foreground/85";
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

{#snippet sign(edge: Edge, state: SignState, row: number, col: number, axis: "across" | "down")}
  <span
    class={cn("sign pointer-events-none absolute grid place-items-center rounded-full bg-background ring-1 ring-foreground/22 transition-colors", sign_class(state))}
    data-axis={axis}
    style:--r={row}
    style:--c={col}
    aria-hidden="true"
  >
    {#if edge === Edge.SAME}<EqualsIcon weight="bold" />{:else}<XIcon weight="bold" />{/if}
  </span>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @md:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <Select class="w-24 @md:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Ctrl+Z)" class="pointer-coarse:hidden" disabled={!can_undo(history) || game.solved} onclick={undo}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Redo (Ctrl+Shift+Z)" class="pointer-coarse:hidden" disabled={!can_redo(history) || game.solved} onclick={redo}>
      <RedoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" class="pointer-coarse:hidden" disabled={game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Rules and statistics" class="@5xl:hidden" pressed={show_panel} onclick={() => (show_panel = !show_panel)}>
      <ChartBarIcon weight={show_panel ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" class="hidden @sm:inline-flex" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @5xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col touch-manipulation">
      <div class="flex min-h-0 flex-1 overflow-auto p-3 pb-2 pointer-coarse:px-2 [container-type:size]">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="grid"
          aria-label="Sun & Moon, {n} by {n}. Arrows move, Space cycles sun, moon and empty, S or 1 sun, M or 2 moon, Backspace clears"
          tabindex="-1"
          class="board relative m-auto grid select-none [-webkit-touch-callout:none]"
          style:--n={n}
          onkeydown={on_board_keydown}
          oncontextmenu={(event) => event.preventDefault()}
        >
          {#each { length: n }, row (row)}
            <div role="row" class="contents">
              {#each { length: n }, col (col)}
                {@const index = row * n + col}
                {@const value = game.values[index]}
                {@const given = puzzle.givens[index] !== Mark.EMPTY}
                {@const selected = index === active && !game.solved}
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
                  onfocus={() => (active = index)}
                  onclick={() => (given ? move(index) : tap(index))}
                  class={cn(
                    "cell relative grid place-items-center rounded-[12%] outline-none",
                    "ring-1 ring-foreground/22 ring-inset transition-[background-color,box-shadow] duration-100",
                    "focus-visible:ring-2 focus-visible:ring-cottontail",
                    given ? "bg-foreground/12" : "bg-[light-dark(var(--background-lightest),var(--background-darker))] pointer-fine:hover:bg-foreground/6",
                    selected && "ring-2 ring-primary",
                    wrong && "bg-error/10 ring-2 ring-error",
                    flash?.index === index && (flash.fix ? "flash-fix" : "flash")
                  )}
                >
                  {#if value === Mark.SUN}
                    <SunIcon weight="duotone" class={cn("mark text-primary", game.solved && "opacity-85")} />
                  {:else if value === Mark.MOON}
                    <MoonIcon weight="duotone" class={cn("mark text-secondary", game.solved && "opacity-85")} />
                  {/if}
                </button>
              {/each}
            </div>
          {/each}

          {#each puzzle.across as edge, index (index)}
            {#if edge !== Edge.NONE}
              {@render sign(edge, signs.across[index], Math.floor(index / (n - 1)), index % (n - 1), "across")}
            {/if}
          {/each}
          {#each puzzle.down as edge, index (index)}
            {#if edge !== Edge.NONE}
              {@render sign(edge, signs.down[index], Math.floor(index / n), index % n, "down")}
            {/if}
          {/each}

          {#if game.solved}
            <BoardOverlay class="-m-2 rounded-xl bg-background/60" title="Solved" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
              <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
            </BoardOverlay>
          {/if}
        </div>
      </div>

      <div class="mx-auto hidden w-full max-w-md grid-cols-3 gap-1.5 px-3 pb-3 pointer-coarse:grid" role="group" aria-label="Actions">
        <Button variant="quiet" class="h-11" disabled={!can_undo(history) || game.solved} onclick={undo}>
          <UndoIcon weight="bold" />Undo
        </Button>
        <Button variant="quiet" class="h-11" disabled={!can_redo(history) || game.solved} onclick={redo}>
          <RedoIcon weight="bold" />Redo
        </Button>
        <Button variant="quiet" class="h-11" disabled={game.solved} onclick={give_hint}>
          <LightbulbIcon weight="bold" />Hint
        </Button>
      </div>
    </div>

    <aside
      class={cn(
        "flex-col gap-4 overflow-auto p-4 @5xl:static @5xl:flex @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-foreground/8 @5xl:bg-transparent",
        show_panel ? "absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_panel = false) })}
    >
      <Grabber class="-mt-2 mb-2 @5xl:hidden" />
      <Section title="Rules">
        <ul class="flex list-disc flex-col gap-1.5 py-3 pr-4 pl-8 text-ui text-foreground/80">
          <li>Every cell holds a sun or a moon.</li>
          <li>Each row and column has as many suns as moons.</li>
          <li>Never three of the same next to each other in a row or column.</li>
          <li>Cells joined by <b class="font-mono">=</b> match; cells joined by <b class="font-mono">×</b> differ.</li>
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
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{filled}/{n * n} filled</span>
    <span class="hidden shrink-0 @3xl:inline pointer-coarse:hidden">Space cycles · S sun · M moon · H hint</span>
  </StatusBar>
</div>

<style>
  .board {
    --ratio: 0.06;
    --cell: clamp(2rem, min(100cqw, 100cqh) / (var(--n) + (var(--n) - 1) * var(--ratio)), 5rem);
    --gap: calc(var(--cell) * var(--ratio));
    --sign: calc(var(--cell) * 0.36);
    grid-template-columns: repeat(var(--n), var(--cell));
    grid-template-rows: repeat(var(--n), var(--cell));
    gap: var(--gap);
  }

  .board :global(.mark) {
    width: 62%;
    height: 62%;
  }

  .sign {
    width: var(--sign);
    height: var(--sign);
    font-size: calc(var(--sign) * 0.62);
    translate: -50% -50%;
  }

  .sign[data-axis="across"] {
    left: calc((var(--c) + 1) * (var(--cell) + var(--gap)) - var(--gap) / 2);
    top: calc(var(--r) * (var(--cell) + var(--gap)) + var(--cell) / 2);
  }

  .sign[data-axis="down"] {
    left: calc(var(--c) * (var(--cell) + var(--gap)) + var(--cell) / 2);
    top: calc((var(--r) + 1) * (var(--cell) + var(--gap)) - var(--gap) / 2);
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
