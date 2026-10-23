<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { ChartBar as ChartBarIcon, Lightbulb as LightbulbIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    capsules,
    daily_game,
    daily_saved_schema,
    DAILY_DIFFICULTY,
    DIFFICULTIES,
    Difficulty,
    difficulty_schema,
    empty_stats,
    hint,
    line_between,
    match,
    new_game,
    record,
    restore,
    saved_schema,
    snap_end,
    stats_schema,
    with_found,
    type Game,
    type Saved,
  } from "./game";
  import { placement_cells } from "./puzzle";

  const LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: LABELS[value] }));
  const RULES: Record<Difficulty, string> = {
    easy: "Words run across and down",
    medium: "Words run across, down and diagonally",
    hard: "Words run in all eight directions, backwards too",
  };
  // Neighbours in the rotation differ in hue in both brand themes, so crossing words stay tellable apart.
  const CAPSULE_CLASSES = [
    "bg-primary/28 ring-primary/60",
    "bg-info/28 ring-info/60",
    "bg-accent/28 ring-accent/60",
    "bg-secondary/28 ring-secondary/60",
    "bg-success/28 ring-success/60",
    "bg-tertiary/30 ring-tertiary/65",
  ];
  const DOT_CLASSES = ["bg-primary", "bg-info", "bg-accent", "bg-secondary", "bg-success", "bg-tertiary"];

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
  const initial_difficulty = daily_day ? DAILY_DIFFICULTY : restored ? saved!.difficulty : (storage.get("difficulty", difficulty_schema) ?? Difficulty.EASY);
  let difficulty = $state<Difficulty>(initial_difficulty);
  let game = $state.raw<Game>(restored ?? (daily_day ? daily_game(daily_day) : new_game(initial_difficulty, random_seed())));
  const clock = new Stopwatch(() => win.is_visible, restored ? saved!.elapsed : 0);
  let new_best = $state(false);
  let active = $state(0);
  /** Where a selection starts: a press being dragged, or the first of two taps (or Space presses). */
  let anchor = $state<number | null>(null);
  let reach = $state<number | null>(null);
  let feedback = $state<{ kind: "found" | "miss" | "again" | "hint"; word: string; cells: number[] } | null>(null);
  let flash = $state<number | null>(null);
  let show_stats = $state(false);
  let cells_element = $state<HTMLDivElement>();
  const cell_elements: HTMLButtonElement[] = $state([]);

  let press: { pointer: number; start: number; dragged: boolean; was_anchor: number | null } | null = null;

  const puzzle = $derived(game.puzzle);
  const side = $derived(puzzle.size);
  const found_capsules = $derived(capsules(game));
  const colour_of = $derived(new Map(found_capsules.map((capsule) => [capsule.word, capsule.colour])));
  const found_cells = $derived(
    new Set(
      puzzle.placements
        .filter((placement) => game.found.includes(placement.word))
        .flatMap((placement) => placement_cells(side, placement))
    )
  );
  const selection = $derived(anchor === null ? null : (line_between(side, anchor, reach ?? anchor) ?? [anchor]));
  const elapsed = $derived(clock.elapsed);
  const best = $derived(stats.value[difficulty].best);
  const total = $derived(puzzle.placements.length);

  const status = $derived.by(() => {
    if (game.solved) return `All ${total} found in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (feedback?.kind === "found") return `Found ${feedback.word}`;
    if (feedback?.kind === "again") return `${feedback.word} is already found`;
    if (feedback?.kind === "miss") return `${feedback.word} isn't on the list`;
    if (feedback?.kind === "hint") return "A word starts at the highlighted letter";
    if (anchor !== null && press === null) return "Now pick the last letter";
    if (daily) return `Daily · ${daily}`;
    return RULES[difficulty];
  });

  $effect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => (flash = null), 1800);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (feedback?.kind !== "miss") return;
    const timer = setTimeout(() => (feedback = null), 700);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `word-search.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("hint", "h", "Hint", give_hint), scoped("new", "f2", "New puzzle", () => start_over())];
    return () => disposers.forEach((dispose) => dispose());
  });

  function store_game(saved: Saved) {
    if (daily) storage.set("daily", { day: daily, game: saved });
    else storage.set("game", saved);
  }

  function start_clock() {
    if (!clock.running && !game.solved) clock.start();
  }

  function save() {
    store_game({ difficulty, seed: puzzle.seed, found: [...game.found], hints: game.hints, elapsed: clock.read() });
  }

  function finish() {
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, difficulty, time, game.hints);
  }

  function submit(cells: number[]) {
    anchor = reach = null;
    if (cells.length < 2 || game.solved) return;
    const placement = match(puzzle, cells);
    const text = cells.map((cell) => puzzle.letters[cell]).join("");
    if (!placement) {
      feedback = { kind: "miss", word: text, cells };
      return;
    }
    if (game.found.includes(placement.word)) {
      feedback = { kind: "again", word: placement.word, cells };
      return;
    }
    feedback = { kind: "found", word: placement.word, cells };
    flash = null;
    game = with_found(game, placement.word);
    if (game.solved) finish();
    save();
  }

  function give_hint() {
    if (game.solved) return;
    const cell = hint(game);
    if (cell === null) return;
    start_clock();
    flash = cell;
    active = cell;
    feedback = { kind: "hint", word: "", cells: [cell] };
    game = { ...game, hints: game.hints + 1 };
    save();
  }

  async function start_over(next: Difficulty = difficulty) {
    if (!game.solved && game.found.length && next === difficulty) {
      const confirmed = await win.confirm("Start a new puzzle?", {
        detail: "The words found on this one are lost. Statistics stay.",
        confirm_label: "New puzzle",
      });
      if (!confirmed) return;
    }
    daily = null;
    difficulty = next;
    storage.set("difficulty", next);
    game = new_game(next, random_seed());
    clock.reset();
    new_best = false;
    anchor = reach = null;
    feedback = null;
    flash = null;
    active = 0;
    save();
  }

  async function set_difficulty(next: Difficulty) {
    if (next === difficulty) return;
    if (!game.solved && game.found.length) {
      const confirmed = await win.confirm(`Switch to ${LABELS[next]}?`, {
        detail: "A new puzzle replaces this one and the words found are lost.",
        confirm_label: "Switch",
      });
      if (!confirmed) return;
    }
    start_over(next);
  }

  function locate(event: PointerEvent, from?: number): { cell: number; dx: number; dy: number } | null {
    if (!cells_element) return null;
    const rect = cells_element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * side;
    const y = ((event.clientY - rect.top) / rect.height) * side;
    const col = Math.min(side - 1, Math.max(0, Math.floor(x)));
    const row = Math.min(side - 1, Math.max(0, Math.floor(y)));
    const origin = from ?? row * side + col;
    return { cell: row * side + col, dx: x - ((origin % side) + 0.5), dy: y - (Math.floor(origin / side) + 0.5) };
  }

  function on_pointerdown(event: PointerEvent) {
    if (game.solved || !event.isPrimary || event.button !== 0) return;
    const spot = locate(event);
    if (!spot) return;
    event.preventDefault();
    start_clock();
    feedback = null;
    press = { pointer: event.pointerId, start: spot.cell, dragged: false, was_anchor: anchor };
    if (anchor === null) anchor = reach = spot.cell;
    active = spot.cell;
    cell_elements[spot.cell]?.focus({ preventScroll: true });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointermove(event: PointerEvent) {
    if (press && event.pointerId === press.pointer) {
      const spot = locate(event, press.start);
      if (!spot) return;
      if (!press.dragged && (spot.cell !== press.start || Math.hypot(spot.dx, spot.dy) > 0.6)) {
        press.dragged = true;
        anchor = press.start;
      }
      if (press.dragged) reach = snap_end(side, press.start, spot.dx, spot.dy);
      return;
    }
    if (!press && anchor !== null && event.pointerType === "mouse") {
      const spot = locate(event, anchor);
      if (spot) reach = snap_end(side, anchor, spot.dx, spot.dy);
    }
  }

  function on_pointerup(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointer) return;
    const { start, dragged, was_anchor } = press;
    press = null;
    if (dragged) return submit(selection ?? []);
    if (was_anchor === null) return;
    if (was_anchor === start) {
      anchor = reach = null;
      return;
    }
    const spot = locate(event, was_anchor);
    const end = spot ? snap_end(side, was_anchor, spot.dx, spot.dy) : start;
    anchor = was_anchor;
    reach = end;
    submit(selection ?? []);
  }

  function on_lostcapture() {
    if (press?.dragged) anchor = reach = null;
    press = null;
  }

  function move(index: number) {
    active = index;
    if (anchor !== null) reach = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const row = Math.floor(active / side);
    const col = active % side;
    const moves: Record<string, number> = {
      ArrowUp: Math.max(0, row - 1) * side + col,
      ArrowDown: Math.min(side - 1, row + 1) * side + col,
      ArrowLeft: row * side + Math.max(0, col - 1),
      ArrowRight: row * side + Math.min(side - 1, col + 1),
      Home: row * side,
      End: row * side + side - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(moves[event.key]);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (game.solved) return;
      start_clock();
      feedback = null;
      if (anchor === null) anchor = reach = active;
      else if (anchor === active) anchor = reach = null;
      else submit(line_between(side, anchor, active) ?? []);
    } else if (event.key === "Escape" && anchor !== null) {
      event.preventDefault();
      event.stopPropagation();
      anchor = reach = null;
    }
  }

  function cell_label(index: number): string {
    const parts = [`Row ${Math.floor(index / side) + 1}, column ${(index % side) + 1}, ${puzzle.letters[index]}`];
    if (found_cells.has(index)) parts.push("in a found word");
    if (index === anchor) parts.push("selection start");
    return parts.join(", ");
  }

  function capsule_style(row: number, col: number, end_row: number, end_col: number): string {
    const length = Math.hypot(end_row - row, end_col - col);
    const angle = Math.atan2(end_row - row, end_col - col);
    return [
      `left: calc(${(col + end_col) / 2 + 0.5} * var(--cell))`,
      `top: calc(${(row + end_row) / 2 + 0.5} * var(--cell))`,
      `width: calc(${length} * var(--cell) + var(--cell) * 0.84)`,
      `transform: translate(-50%, -50%) rotate(${angle}rad)`,
    ].join("; ");
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Solved counts and best times for every difficulty go back to zero. The puzzle in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

{#snippet word_list(columns: string)}
  <ul class={cn("grid gap-x-3 gap-y-0.5", columns)} aria-label="Words to find">
    {#each puzzle.placements as placement (placement.word)}
      {@const colour = colour_of.get(placement.word)}
      <li
        class={cn(
          "flex min-w-0 items-center gap-2 py-0.5 text-ui font-medium tracking-wide transition-colors",
          colour === undefined ? "text-foreground" : "text-foreground/45 line-through decoration-foreground/45"
        )}
        aria-label="{placement.word}{colour === undefined ? '' : ', found'}"
      >
        <span
          class={cn("size-2 shrink-0 rounded-full", colour === undefined ? "ring-1 ring-foreground/30 ring-inset" : DOT_CLASSES[colour])}
          aria-hidden="true"
        ></span>
        <span class="truncate">{placement.word}</span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet list_header()}
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-sm font-semibold">{puzzle.theme}</h2>
    <span class="font-mono text-2xs text-foreground/65 tabular-nums">{game.found.length}/{total} found</span>
  </div>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <Segmented size="sm" class="hidden @2xl:inline-flex" label="Difficulty" options={DIFFICULTY_OPTIONS} bind:value={() => difficulty, set_difficulty} />
    <Select class="w-28 @2xl:hidden" size="sm" aria-label="Difficulty" options={DIFFICULTY_OPTIONS} bind:value={() => difficulty, set_difficulty} />
    <div class="flex-1"></div>
    <IconButton size="sm" label="Hint (H)" disabled={game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_17rem]">
    <div class="flex min-h-0 flex-col justify-start @3xl:justify-center">
      <div class="flex aspect-square min-h-0 shrink overflow-hidden p-2 @md:p-4 [container-type:size] @3xl:aspect-auto @3xl:flex-1">
        <div class="board m-auto rounded-xl bg-background-light p-[calc(var(--cell)*0.12)] shadow-card ring-1 ring-hairline" style:--side={side}>
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            bind:this={cells_element}
            role="grid"
            aria-label="{puzzle.theme} word search, {side} by {side}. Drag across a word, or tap its first and last letter. Arrows move, Space marks the first and last letter, Escape cancels"
            tabindex="-1"
            class="cells relative grid touch-none select-none [-webkit-touch-callout:none]"
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onpointerup={on_pointerup}
            onlostpointercapture={on_lostcapture}
            oncontextmenu={(event) => event.preventDefault()}
            onkeydown={on_board_keydown}
          >
            <div class="pointer-events-none absolute inset-0" aria-hidden="true">
              {#each found_capsules as capsule (capsule.word)}
                <div
                  class={cn("capsule absolute rounded-full ring-1 ring-inset", CAPSULE_CLASSES[capsule.colour], feedback?.kind === "found" && feedback.word === capsule.word && "capsule-in")}
                  style={capsule_style(capsule.row, capsule.col, capsule.end_row, capsule.end_col)}
                ></div>
              {/each}
              {#if selection}
                {@const first = selection[0]}
                {@const last = selection[selection.length - 1]}
                <div
                  class="capsule absolute rounded-full bg-foreground/14 ring-2 ring-foreground/55 ring-inset"
                  style={capsule_style(Math.floor(first / side), first % side, Math.floor(last / side), last % side)}
                ></div>
              {:else if feedback?.kind === "miss" || feedback?.kind === "again"}
                {@const first = feedback.cells[0]}
                {@const last = feedback.cells[feedback.cells.length - 1]}
                <div
                  class={cn("capsule capsule-out absolute rounded-full ring-2 ring-inset", feedback.kind === "miss" ? "bg-error/15 ring-error/70" : "bg-foreground/10 ring-foreground/40")}
                  style={capsule_style(Math.floor(first / side), first % side, Math.floor(last / side), last % side)}
                ></div>
              {/if}
            </div>

            {#each { length: side }, row (row)}
              <div role="row" class="contents">
                {#each { length: side }, col (col)}
                  {@const index = row * side + col}
                  <button
                    bind:this={cell_elements[index]}
                    type="button"
                    role="gridcell"
                    tabindex={index === active ? 0 : -1}
                    aria-label={cell_label(index)}
                    onfocus={() => (active = index)}
                    class={cn(
                      "relative grid place-items-center rounded-full leading-none outline-none",
                      "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                      found_cells.has(index) ? "font-bold text-foreground" : "font-semibold text-foreground/85",
                      flash === index && "flash"
                    )}
                  >
                    {puzzle.letters[index]}
                  </button>
                {/each}
              </div>
            {/each}

            {#if game.solved}
              <BoardOverlay class="-m-[calc(var(--cell)*0.12)] rounded-xl bg-background/60" title="All words found" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
                <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
              </BoardOverlay>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5 px-4 pt-1 pb-3 @3xl:hidden">
        {@render list_header()}
        {@render word_list("grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]")}
      </div>
    </div>

    <aside
      class={cn(
        "flex-col gap-6 overflow-auto p-4 @3xl:static @3xl:flex @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-hairline @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] border-t border-hairline bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @3xl:hidden" />
      <div class="hidden flex-col gap-2 @3xl:flex">
        {@render list_header()}
        {@render word_list("grid-cols-2")}
      </div>
      <Section title="Statistics" description="Puzzles solved per difficulty. Best times count only solves without hints.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each DIFFICULTIES as each (each)}
          {@const entry = stats.value[each]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === difficulty ? "font-medium" : "text-foreground/80")}>{LABELS[each]}</span>
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
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{game.found.length}/{total} found</span>
    {#if game.hints}<span class="hidden shrink-0 font-mono tabular-nums @2xl:inline">{game.hints} hint{game.hints === 1 ? "" : "s"}</span>{/if}
  </StatusBar>
</div>

<style>
  .board {
    --cell: min(calc((100cqw - 0.5rem) / (var(--side) + 0.24)), calc((100cqh - 0.5rem) / (var(--side) + 0.24)), 3rem);
  }

  .cells {
    grid-template-columns: repeat(var(--side), var(--cell));
    grid-auto-rows: var(--cell);
    font-size: calc(var(--cell) * 0.5);
  }

  .capsule {
    height: calc(var(--cell) * 0.84);
  }

  .capsule-in {
    animation: capsule-in 260ms var(--ease-out);
  }

  .capsule-out {
    animation: capsule-out 700ms var(--ease-out) forwards;
  }

  .flash {
    animation: flash 1.8s var(--ease-out);
  }

  @keyframes capsule-in {
    from {
      opacity: 0;
      scale: 0.9;
    }
  }

  @keyframes capsule-out {
    0%,
    20% {
      translate: 0;
    }
    8% {
      translate: -3px;
    }
    14% {
      translate: 3px;
    }
    to {
      opacity: 0;
    }
  }

  @keyframes flash {
    0%,
    50% {
      background-color: color-mix(in oklab, var(--warning) 45%, transparent);
      box-shadow: 0 0 0 2px var(--warning);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .capsule-in,
    .flash {
      animation: none;
    }

    .capsule-out {
      animation: capsule-fade 700ms linear forwards;
    }
  }

  @keyframes capsule-fade {
    to {
      opacity: 0;
    }
  }
</style>
