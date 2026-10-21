<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, IconButton, Section, Segmented, Select, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowCounterClockwise as ResetIcon,
    ArrowUUpLeft as UndoIcon,
    ChartBar as ChartBarIcon,
    Lightbulb as LightbulbIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    DAILY_SIZE,
    daily_saved_schema,
    daily_seed_of,
    empty_stats,
    extend,
    found_cells,
    hint,
    hinted_cells,
    judge,
    new_game,
    record,
    reset,
    restore,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    to_saved,
    undo,
    with_found,
    type Game,
    type Saved,
  } from "./game";
  import { generate, LEVELS, MAX_LENGTH, MIN_LENGTH, type Dictionary } from "./puzzle";
  import { load_dictionary } from "./words";

  const LABELS: Record<Size, string> = { small: "Small", medium: "Medium", large: "Large" };
  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: LABELS[value] }));
  // Neighbours in the rotation differ in hue in both brand themes, so touching words stay tellable apart.
  const TRAILS = [
    "stroke-primary/40 fill-primary/40",
    "stroke-info/40 fill-info/40",
    "stroke-accent/40 fill-accent/40",
    "stroke-secondary/40 fill-secondary/40",
    "stroke-success/40 fill-success/40",
  ];
  const FILLS = ["bg-primary/30", "bg-info/30", "bg-accent/30", "bg-secondary/30", "bg-success/30"];

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", empty_stats(), stats_schema);

  let daily = $state(daily_day ?? null);
  let size = $state<Size>(daily_day ? DAILY_SIZE : (storage.get("size", size_schema) ?? Size.MEDIUM));
  let dictionary = $state.raw<Dictionary | null>(null);
  let game = $state.raw<Game | null>(null);
  let load_error = $state<string | null>(null);
  const clock = new Stopwatch(() => win.is_visible);
  let new_best = $state(false);
  let path = $state.raw<number[]>([]);
  let active = $state(0);
  let feedback = $state<{ kind: "found" | "unknown" | "elsewhere" | "short" | "hint"; text: string; cells: number[] } | null>(null);
  let flash = $state<number | null>(null);
  let show_stats = $state(false);
  let cells_element = $state<HTMLDivElement>();
  const cell_elements: HTMLButtonElement[] = $state([]);
  let loading_token = 0;

  let press: { pointer: number; moved: boolean; tapped_end: boolean } | null = null;

  const rows = $derived(game?.puzzle.rows ?? LEVELS[size].rows);
  const cols = $derived(game?.puzzle.cols ?? LEVELS[size].cols);
  const locked = $derived(game ? found_cells(game) : new Set<number>());
  const hinted = $derived(game ? hinted_cells(game) : new Map<number, number>());
  const colour_of = $derived(new Map(game?.found.map((tunnel, order) => [tunnel, order % TRAILS.length]) ?? []));
  const elapsed = $derived(clock.elapsed);
  const best = $derived(stats.value[size].best);
  const total = $derived(game?.puzzle.tunnels.length ?? 0);
  const path_text = $derived(game ? path.map((cell) => game!.puzzle.letters[cell]).join("") : "");

  const status = $derived.by(() => {
    if (!game) return load_error ?? "Digging tunnels…";
    if (game.solved)
      return `All ${total} words in ${format_time(elapsed)}${game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : ""}`;
    if (path.length) return path_text.toUpperCase();
    if (feedback?.kind === "found") return `Found ${feedback.text.toUpperCase()}`;
    if (feedback?.kind === "elsewhere") return `${feedback.text.toUpperCase()} is a word, but not one of these`;
    if (feedback?.kind === "unknown") return `${feedback.text.toUpperCase()} isn't a word here`;
    if (feedback?.kind === "short") return `Words here have ${MIN_LENGTH} to ${MAX_LENGTH} letters`;
    if (feedback?.kind === "hint") return "Hint: the marked letter is the next one of a word";
    if (daily) return `Daily · ${daily}`;
    return "Trace words through neighbouring letters";
  });

  void start();

  async function start() {
    if (daily_day) {
      const saved_daily = storage.get("daily", daily_saved_schema);
      await begin(DAILY_SIZE, daily_seed_of(daily_day), saved_daily?.day === daily_day ? saved_daily.game : null);
      return;
    }
    const saved = storage.get("game", saved_schema);
    if (saved) await begin(saved.size, saved.seed, saved);
    else await begin(size, random_seed(), null);
  }

  async function begin(next: Size, seed: number, saved: Saved | null) {
    const token = ++loading_token;
    load_error = null;
    let words: Dictionary;
    try {
      words = await load_dictionary();
    } catch (error) {
      if (token === loading_token) load_error = `Couldn't load the word list. ${error instanceof Error ? error.message : ""}`.trim();
      return;
    }
    if (token !== loading_token) return;
    dictionary = words;
    const puzzle = generate(next, seed, words).puzzle;
    const restored = saved ? restore(puzzle, saved) : null;
    size = next;
    game = restored ?? new_game(puzzle);
    clock.reset(restored && saved ? saved.elapsed : 0);
    new_best = false;
    path = [];
    feedback = null;
    flash = null;
    active = 0;
    if (!restored) save();
  }

  $effect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => (flash = null), 1800);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (feedback?.kind !== "unknown" && feedback?.kind !== "elsewhere") return;
    const timer = setTimeout(() => (feedback = null), 1200);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `tunnels.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("hint", "h", "Hint", give_hint),
      scoped("undo", "mod+z", "Undo", take_back),
      scoped("new", "f2", "New puzzle", () => start_over()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function save() {
    if (!game) return;
    const data = to_saved(game, clock.read());
    if (daily) storage.set("daily", { day: daily, game: data });
    else storage.set("game", data);
  }

  function start_clock() {
    if (game && !clock.running && !game.solved) clock.start();
  }

  function finish() {
    if (!game) return;
    const time = clock.pause();
    if (daily) play.daily(daily, time);
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
  }

  function submit() {
    const traced = path;
    path = [];
    if (!game || !dictionary || traced.length < 2) return;
    const text = traced.map((cell) => game!.puzzle.letters[cell]).join("");
    const verdict = judge(game, traced, dictionary.trie);
    if (verdict.kind !== "found") {
      feedback = { kind: verdict.kind, text, cells: traced };
      return;
    }
    feedback = { kind: "found", text, cells: traced };
    flash = null;
    game = with_found(game, verdict.tunnel);
    if (game.solved) finish();
    save();
  }

  function give_hint() {
    if (!game) return;
    const next = hint(game);
    if (!next) return;
    start_clock();
    path = [];
    game = next.game;
    flash = active = next.cell;
    feedback = { kind: "hint", text: "", cells: [next.cell] };
    if (game.solved) finish();
    save();
  }

  function take_back() {
    if (!game?.found.length || game.solved) return;
    game = undo(game);
    path = [];
    feedback = null;
    save();
  }

  async function reset_board() {
    if (!game?.found.length || game.solved) return;
    const confirmed = await win.confirm("Reset this puzzle?", {
      detail: "Every word found comes off the board. Hinted letters stay marked and the clock keeps running.",
      confirm_label: "Reset",
    });
    if (!confirmed || !game) return;
    game = reset(game);
    path = [];
    feedback = null;
    save();
  }

  async function start_over(next: Size = size) {
    if (game && !game.solved && game.found.length) {
      const confirmed = await win.confirm(next === size ? "Start a new puzzle?" : `Switch to ${LABELS[next]}?`, {
        detail: "The words found on this one are lost. Statistics stay.",
        confirm_label: next === size ? "New puzzle" : "Switch",
      });
      if (!confirmed) return;
    }
    daily = null;
    storage.set("size", next);
    game = null;
    clock.reset();
    await begin(next, random_seed(), null);
  }

  function set_size(next: Size) {
    if (next !== size) void start_over(next);
  }

  function blocked(cell: number): boolean {
    return locked.has(cell);
  }

  /** Strict hits only count near a letter's centre, so a drag along a row doesn't catch the corner of the row below. */
  function locate(event: PointerEvent, strict: boolean): number | null {
    if (!cells_element) return null;
    const rect = cells_element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * cols;
    const y = ((event.clientY - rect.top) / rect.height) * rows;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
    const [col, row] = [Math.floor(x), Math.floor(y)];
    if (strict && Math.hypot(x - col - 0.5, y - row - 0.5) > 0.42) return null;
    return row * cols + col;
  }

  function on_pointerdown(event: PointerEvent) {
    if (!game || game.solved || !event.isPrimary || event.button !== 0) return;
    const cell = locate(event, false);
    if (cell === null || blocked(cell)) return;
    event.preventDefault();
    start_clock();
    feedback = null;
    const tapped_end = path.length > 0 && cell === path[path.length - 1];
    const continues = path.length > 0 && extend(path, cell, cols, blocked).length > path.length;
    if (!tapped_end) path = continues ? extend(path, cell, cols, blocked) : [cell];
    press = { pointer: event.pointerId, moved: false, tapped_end };
    active = cell;
    cell_elements[cell]?.focus({ preventScroll: true });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointermove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointer) return;
    const cell = locate(event, true);
    if (cell === null || cell === path[path.length - 1]) return;
    const next = extend(path, cell, cols, blocked);
    if (next.length === path.length && next.every((each, i) => each === path[i])) return;
    press.moved = true;
    path = next;
    active = next[next.length - 1];
  }

  function on_lostcapture() {
    if (!press) return;
    const { moved, tapped_end } = press;
    press = null;
    if (moved && path.length > 1) submit();
    else if (tapped_end) {
      if (path.length > 1) submit();
      else path = [];
    }
  }

  function move(index: number) {
    active = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (!game || event.altKey || event.metaKey || event.ctrlKey) return;
    const row = Math.floor(active / cols);
    const col = active % cols;
    const moves: Record<string, number> = {
      ArrowUp: Math.max(0, row - 1) * cols + col,
      ArrowDown: Math.min(rows - 1, row + 1) * cols + col,
      ArrowLeft: row * cols + Math.max(0, col - 1),
      ArrowRight: row * cols + Math.min(cols - 1, col + 1),
      Home: row * cols,
      End: row * cols + cols - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(moves[event.key]);
    } else if (event.key === " ") {
      event.preventDefault();
      if (game.solved || blocked(active)) return;
      start_clock();
      feedback = null;
      const next = extend(path, active, cols, blocked);
      path = next.length > path.length || next.includes(active) ? next : [active];
    } else if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Backspace" && path.length) {
      event.preventDefault();
      path = path.slice(0, -1);
    } else if (event.key === "Escape" && path.length) {
      event.preventDefault();
      event.stopPropagation();
      path = [];
    }
  }

  function cell_label(index: number): string {
    if (!game) return "";
    const parts = [`Row ${Math.floor(index / cols) + 1}, column ${(index % cols) + 1}, ${game.puzzle.letters[index]}`];
    if (locked.has(index)) parts.push("in a found word");
    const order = hinted.get(index);
    if (order) parts.push(`hinted letter ${order} of a word`);
    const at = path.indexOf(index);
    if (at !== -1) parts.push(`letter ${at + 1} of the path`);
    return parts.join(", ");
  }

  function points(cells: readonly number[]): string {
    return cells.map((cell) => `${(cell % cols) + 0.5},${Math.floor(cell / cols) + 0.5}`).join(" ");
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

{#snippet trail(cells: readonly number[], class_name: string)}
  {#if cells.length === 1}
    <circle cx={(cells[0] % cols) + 0.5} cy={Math.floor(cells[0] / cols) + 0.5} r="0.39" stroke-width="0" class={class_name} />
  {:else}
    <polyline points={points(cells)} stroke-width="0.78" stroke-linecap="round" stroke-linejoin="round" class={cn(class_name, "fill-none")} />
  {/if}
{/snippet}

{#snippet word_list()}
  {#if game}
    <ul class="flex flex-wrap gap-x-4 gap-y-2" aria-label="Words to find">
      {#each game.puzzle.tunnels as tunnel, index (index)}
        {@const colour = colour_of.get(index)}
        {@const shown = game.revealed[index]}
        <li class="flex gap-0.5" aria-label={colour === undefined ? `${tunnel.word.length} letters${shown ? `, starts ${tunnel.word.slice(0, shown).toUpperCase()}` : ""}` : `${tunnel.word}, found`}>
          {#each [...tunnel.word] as letter, i (i)}
            <span
              class={cn(
                "grid size-5 place-items-center rounded-sm font-mono text-2xs font-semibold uppercase",
                colour === undefined ? "bg-foreground/8" : FILLS[colour],
                colour === undefined && i >= shown && "text-transparent"
              )}
              aria-hidden="true">{colour !== undefined || i < shown ? letter : "·"}</span
            >
          {/each}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet list_header()}
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-sm font-semibold">Words</h2>
    <span class="font-mono text-2xs text-foreground/65 tabular-nums">{game?.found.length ?? 0}/{total} found</span>
  </div>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {#if daily}
      <span class="text-ui font-medium">Daily</span>
    {:else}
      <Segmented size="sm" class="hidden @2xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
      <Select class="w-28 @2xl:hidden" size="sm" aria-label="Size" options={SIZE_OPTIONS} bind:value={() => size, set_size} />
    {/if}
    <div class="flex-1"></div>
    <IconButton size="sm" label="Undo (Mod+Z)" class="pointer-coarse:hidden" disabled={!game?.found.length || game.solved} onclick={take_back}>
      <UndoIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Reset" class="pointer-coarse:hidden" disabled={!game?.found.length || game.solved} onclick={reset_board}>
      <ResetIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Hint (H)" class="pointer-coarse:hidden" disabled={!game || game.solved} onclick={give_hint}>
      <LightbulbIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
  </Toolbar>

  <div class="relative grid min-h-0 grid-cols-[minmax(0,1fr)] @3xl:grid-cols-[minmax(0,1fr)_17rem]">
    <div class="flex min-h-0 flex-col justify-start @3xl:justify-center">
      <div class="flex aspect-(--ratio) min-h-0 shrink overflow-hidden p-2 @md:p-4 [container-type:size] @3xl:aspect-auto @3xl:flex-1" style:--ratio="{cols} / {rows}">
        {#if game}
          <div class="board relative m-auto rounded-xl bg-background-light p-[calc(var(--cell)*0.12)] ring-1 ring-foreground/8" style:--cols={cols} style:--rows={rows}>
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              bind:this={cells_element}
              role="grid"
              aria-label="Tunnels, {rows} by {cols} letters. Drag through neighbouring letters to trace a word, or tap them one by one and tap the last again. Arrows move, Space adds a letter, Enter checks the word, Backspace drops a letter, Escape clears"
              tabindex="-1"
              class="cells relative grid touch-none select-none [-webkit-touch-callout:none]"
              onpointerdown={on_pointerdown}
              onpointermove={on_pointermove}
              onlostpointercapture={on_lostcapture}
              oncontextmenu={(event) => event.preventDefault()}
              onkeydown={on_board_keydown}
            >
              <svg class="pointer-events-none absolute inset-0 size-full" viewBox="0 0 {cols} {rows}" aria-hidden="true">
                {#each { length: rows * cols }, cell (cell)}
                  <circle cx={(cell % cols) + 0.5} cy={Math.floor(cell / cols) + 0.5} r="0.39" class="fill-foreground/5" />
                {/each}
                {#each game.found as tunnel, order (tunnel)}
                  <g class={cn(feedback?.kind === "found" && order === game.found.length - 1 && "trail-in")}>
                    {@render trail(game.puzzle.tunnels[tunnel].cells, TRAILS[order % TRAILS.length])}
                  </g>
                {/each}
                {#each hinted as [cell] (cell)}
                  <circle cx={(cell % cols) + 0.5} cy={Math.floor(cell / cols) + 0.5} r="0.36" fill="none" stroke-width="0.05" stroke-dasharray="0.12 0.08" class="stroke-foreground/60" />
                {/each}
                {#if path.length}
                  {@render trail(path, "stroke-foreground/18 fill-foreground/18")}
                {:else if feedback?.kind === "unknown" || feedback?.kind === "elsewhere"}
                  <g class="trail-out">{@render trail(feedback.cells, "stroke-error/35 fill-error/35")}</g>
                {/if}
              </svg>

              {#each { length: rows }, row (row)}
                <div role="row" class="contents">
                  {#each { length: cols }, col (col)}
                    {@const index = row * cols + col}
                    {@const order = hinted.get(index)}
                    <button
                      bind:this={cell_elements[index]}
                      type="button"
                      role="gridcell"
                      tabindex={index === active ? 0 : -1}
                      aria-label={cell_label(index)}
                      onfocus={() => (active = index)}
                      class={cn(
                        "relative grid place-items-center rounded-full leading-none uppercase outline-none",
                        "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                        locked.has(index) || path.includes(index) ? "font-bold text-foreground" : "font-semibold text-foreground/85",
                        flash === index && "flash"
                      )}
                    >
                      {game.puzzle.letters[index]}
                      {#if order}
                        <span class="absolute top-[3%] right-[5%] font-mono text-[calc(var(--cell)*0.17)] font-medium text-foreground/70 tabular-nums">{order}</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/each}
            </div>

            {#if game.solved}
              <BoardOverlay class="rounded-xl bg-background/60" title="Every letter used" detail="{format_time(elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}">
                <Button size="sm" variant="primary" onclick={() => start_over()}>New puzzle</Button>
              </BoardOverlay>
            {/if}
          </div>
        {:else if load_error}
          <p class="m-auto p-4 text-center text-ui text-error">{load_error}</p>
        {:else}
          <div class="m-auto"><Spinner /></div>
        {/if}
      </div>

      <p class="min-h-5 shrink-0 truncate px-4 text-center text-ui font-medium tracking-wide" aria-live="polite">{status}</p>

      <div class="hidden grid-cols-3 gap-1.5 px-4 pt-2 pointer-coarse:grid" role="group" aria-label="Actions">
        <Button variant="quiet" disabled={!game?.found.length || game.solved} onclick={take_back}><UndoIcon weight="bold" />Undo</Button>
        <Button variant="quiet" disabled={!game?.found.length || game.solved} onclick={reset_board}><ResetIcon weight="bold" />Reset</Button>
        <Button variant="quiet" disabled={!game || game.solved} onclick={give_hint}><LightbulbIcon weight="bold" />Hint</Button>
      </div>

      <div class="flex flex-col gap-1.5 px-4 pt-2 pb-3 @3xl:hidden">
        {@render list_header()}
        {@render word_list()}
      </div>
    </div>

    <aside
      class={cn(
        "flex-col gap-6 overflow-auto p-4 @3xl:static @3xl:flex @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-foreground/8 @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] border-t border-foreground/8 bg-background" : "hidden"
      )}
    >
      <div class="hidden flex-col gap-2 @3xl:flex">
        {@render list_header()}
        {@render word_list()}
      </div>
      <Section title="Statistics" description="Puzzles solved per size. Best times count only solves without hints.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each SIZES as each (each)}
          {@const entry = stats.value[each]}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === size ? "font-medium" : "text-foreground/80")}>{LABELS[each]} · {LEVELS[each].rows}×{LEVELS[each].cols}</span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              Solved {entry.solved} · Best {entry.best === null ? "–" : format_time(entry.best)}
            </span>
          </div>
        {/each}
      </Section>
      <p class="text-2xs text-foreground/65">Words from ENABLE (public domain), hidden ones picked from its common words.</p>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0 font-mono tabular-nums">{format_time(elapsed)}</span>
    <span class="truncate">{daily ? `Daily · ${daily}` : `${LABELS[size]} · ${rows}×${cols}`}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{game?.found.length ?? 0}/{total} found</span>
    {#if game?.hints}<span class="hidden shrink-0 font-mono tabular-nums @2xl:inline">{game.hints} hint{game.hints === 1 ? "" : "s"}</span>{/if}
  </StatusBar>
</div>

<style>
  .board {
    --cell: min(
      calc((100cqw - 0.5rem) / (var(--cols) + 0.24)),
      calc((100cqh - 0.5rem) / (var(--rows) + 0.24)),
      4.5rem
    );
  }

  .cells {
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
    font-size: calc(var(--cell) * 0.46);
  }

  .trail-in {
    animation: trail-in 260ms var(--ease-out);
  }

  .trail-out {
    animation: trail-out 1200ms var(--ease-out) forwards;
  }

  .flash {
    animation: flash 1.8s var(--ease-out);
  }

  @keyframes trail-in {
    from {
      opacity: 0;
    }
  }

  @keyframes trail-out {
    0%,
    30% {
      translate: 0;
    }
    6% {
      translate: -0.06px;
    }
    12% {
      translate: 0.06px;
    }
    18% {
      translate: -0.06px;
    }
    24% {
      translate: 0.06px;
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
    .trail-in,
    .flash {
      animation: none;
    }

    .trail-out {
      animation: trail-fade 1200ms linear forwards;
    }
  }

  @keyframes trail-fade {
    to {
      opacity: 0;
    }
  }
</style>
