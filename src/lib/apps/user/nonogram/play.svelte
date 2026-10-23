<script lang="ts" module>
  import type { Drawing } from "./file";
  import type { Mode as FreshMode, Size as FreshSize } from "./game";

  export type Source =
    | { kind: "free"; fresh?: { size?: FreshSize; mode?: FreshMode } }
    | { kind: "daily"; day: string }
    | { kind: "file"; path: string; drawing: Drawing }
    | { kind: "test"; drawing: Drawing };
</script>

<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { BoardOverlay, Button, Grabber, IconButton, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { daily_seed, format_time, Stopwatch } from "$kit/games";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import {
    ArrowUUpLeft as UndoIcon,
    ArrowUUpRight as RedoIcon,
    CalendarDots as CalendarIcon,
    ChartBar as ChartBarIcon,
    FileText as FileIcon,
    FolderOpen as FolderOpenIcon,
    Lightbulb as LightbulbIcon,
    MagnifyingGlassMinus as ZoomOutIcon,
    MagnifyingGlassPlus as ZoomInIcon,
    PencilSimpleLine as PencilIcon,
    Square as SquareIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import Board from "./board.svelte";
  import {
    cols_done,
    DAILY_SIZE,
    empty_stats,
    game_of,
    hint,
    Mark,
    Mode,
    mode_schema,
    new_game,
    progress_schema,
    record,
    restore,
    resume,
    rows_done,
    runs_done,
    saved_schema,
    Size,
    size_schema,
    SIZES,
    stats_schema,
    with_marks,
    type Game,
  } from "./game";
  import { col_of, is_color, row_of } from "./puzzle";
  import Swatches from "./swatches.svelte";
  import { base_name } from "$lib/core/api/services/files/path";

  interface Props {
    source: Source;
    on_solved?: (ms: number) => void;
    on_open: () => void;
    on_create: () => void;
    on_edit?: () => void;
    on_free: () => void;
    on_back?: () => void;
  }

  let { source, on_solved, on_open, on_create, on_edit, on_free, on_back }: Props = $props();

  const MODE_OPTIONS = [
    { value: Mode.BW, label: "B/W" },
    { value: Mode.COLOR, label: "Colour" },
  ];
  const SIZE_OPTIONS = SIZES.map((value) => ({ value, label: `${value}×${value}` }));
  const KIND_OPTIONS = SIZES.flatMap((value) => [
    { value: `bw:${value}`, label: `${value}×${value}` },
    { value: `color:${value}`, label: `${value}×${value} colour` },
  ]);
  const BW_TOOLS = [
    { value: "1", label: "Fill", icon: SquareIcon },
    { value: "-1", label: "Cross", icon: XIcon },
  ] as const;

  const { app_id, window_id, window: win, storage } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats_bw = storage.persisted("stats", empty_stats(), stats_schema);
  const stats_color = storage.persisted("stats-color", empty_stats(), stats_schema);
  const progress = storage.window("progress", null, progress_schema.nullable());

  const kind = untrack(() => source.kind);
  const progress_key = untrack(() =>
    source.kind === "daily" ? `daily:${source.day}` : source.kind === "file" ? `file:${source.path}` : null
  );

  /** Free play keeps the last puzzle touched in storage; a file or the daily keeps its marks with the window. */
  function initial(): { game: Game; size: Size; mode: Mode; elapsed: number } {
    const fallback_size = storage.get("size", size_schema) ?? Size.S10;
    const fallback_mode = storage.get("mode", mode_schema) ?? Mode.BW;
    const from_progress = (game: Game) => {
      const saved = progress.value;
      const back = saved && saved.key === progress_key ? resume(game, saved.marks, saved.hints) : null;
      return { game: back ?? game, elapsed: back ? saved!.elapsed : 0 };
    };
    if (source.kind === "free") {
      const saved = storage.get("game", saved_schema);
      const restored = saved ? restore(saved) : null;
      if (restored && saved) return { game: restored, size: saved.size, mode: saved.mode ?? Mode.BW, elapsed: saved.elapsed };
      return { game: new_game(fallback_size, random_seed(), fallback_mode), size: fallback_size, mode: fallback_mode, elapsed: 0 };
    }
    if (source.kind === "daily") {
      return { ...from_progress(new_game(DAILY_SIZE, daily_seed(source.day, app_id), Mode.BW)), size: DAILY_SIZE, mode: Mode.BW };
    }
    const game = game_of(source.drawing);
    const base = { size: fallback_size, mode: is_color(source.drawing.palette) ? Mode.COLOR : Mode.BW };
    return source.kind === "file" ? { ...from_progress(game), ...base } : { game, elapsed: 0, ...base };
  }

  const first = untrack(initial);
  let size = $state<Size>(first.size);
  let mode = $state<Mode>(first.mode);
  let game = $state.raw<Game>(first.game);
  const clock = new Stopwatch(() => win.is_visible, first.elapsed);
  let new_best = $state(false);
  let tool = $state<Mark>(Mark.FILLED);
  let last_color: Mark = Mark.FILLED;
  let undo_stack = $state.raw<(readonly Mark[])[]>([]);
  let redo_stack = $state.raw<(readonly Mark[])[]>([]);
  let flash = $state<{ index: number; fix: boolean } | null>(null);
  let show_stats = $state(false);
  let hide_result = $state(false);
  let zoomed = $state(false);
  let board = $state<ReturnType<typeof Board>>();

  const puzzle = $derived(game.puzzle);
  const width = $derived(puzzle.width);
  const height = $derived(puzzle.height);
  const colored = $derived(is_color(puzzle.palette));
  const done_rows = $derived(rows_done(game));
  const done_cols = $derived(cols_done(game));
  const row_runs = $derived(puzzle.rows.map((clue, row) => runs_done(clue, row_of(game.marks, width, row))));
  const col_runs = $derived(puzzle.cols.map((clue, col) => runs_done(clue, col_of(game.marks, width, height, col))));
  const filled = $derived(game.marks.filter((mark) => mark > 0).length);
  const target = $derived(puzzle.solution.filter((cell) => cell > 0).length);
  const tracks_stats = kind === "free" || kind === "daily";
  const stats = $derived(mode === Mode.COLOR ? stats_color : stats_bw);
  const best = $derived(tracks_stats ? stats.value[size].best : null);
  const started = $derived(clock.running || game.marks.some((mark) => mark !== Mark.EMPTY));
  const file_name = $derived(source.kind === "file" ? base_name(source.path) : null);
  const label = $derived.by(() => {
    if (source.kind === "daily") return `Daily · ${source.day}`;
    if (source.kind === "file") return source.drawing.title ?? file_name!.replace(/\.nonogram$/, "");
    if (source.kind === "test") return "Play-test";
    return null;
  });

  const status = $derived.by(() => {
    if (game.solved) {
      const hints = game.hints ? ` with ${game.hints} hint${game.hints === 1 ? "" : "s"}` : new_best ? ", a new best" : "";
      return `Solved in ${format_time(clock.elapsed)}${hints}`;
    }
    if (!started) return colored ? "Fill each cell with the colour its clues describe" : "Fill the cells the clues describe";
    return colored ? "Same colours need a gap between runs; different colours may touch" : "Each number is a run of filled cells, in order";
  });

  $effect(() => {
    const scoped = (id: string, keys: string, name: string, run: () => void) =>
      shortcuts.register({ id: `nonogram.${id}`, keys, label: name, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", undo),
      scoped("redo", "mod+shift+z", "Redo", redo),
      scoped("redo-alt", "mod+y", "Redo", redo),
      scoped("hint", "h", "Hint", give_hint),
      scoped("open", "mod+o", "Open puzzle…", on_open),
    ];
    if (kind !== "test") disposers.push(scoped("new", "f2", "New puzzle", () => new_puzzle()));
    if (colored) {
      puzzle.palette.forEach((_, index) => disposers.push(scoped(`color-${index + 1}`, String(index + 1), `Colour ${index + 1}`, () => choose(index + 1))));
    }
    return () => disposers.forEach((dispose) => dispose());
  });

  onMount(() => {
    if (source.kind === "free" && source.fresh) void new_puzzle(source.fresh.size ?? size, source.fresh.mode ?? mode);
  });

  $effect(() => {
    if (tool === Mark.CROSSED || tool <= puzzle.palette.length) return;
    tool = Mark.FILLED;
  });

  function choose(color: number) {
    tool = color;
  }

  function pick(secondary: boolean): Mark {
    if (tool > 0) last_color = tool;
    if (!secondary) return tool;
    return tool === Mark.CROSSED ? last_color : Mark.CROSSED;
  }

  function save() {
    if (kind === "test") return;
    if (kind === "free") {
      storage.set("game", { size, mode, seed: puzzle.seed, marks: [...game.marks], hints: game.hints, elapsed: clock.read() });
    } else if (progress_key) {
      progress.value = { key: progress_key, marks: [...game.marks], hints: game.hints, elapsed: clock.read() };
    }
  }

  function preview(marks: readonly Mark[]) {
    if (!clock.running && !game.solved) clock.start();
    flash = null;
    game = with_marks(game, marks);
  }

  function set_marks(marks: readonly Mark[], hints = game.hints) {
    if (!clock.running) clock.start();
    const next = { ...with_marks(game, marks), hints };
    game = next;
    if (next.solved) finish();
    save();
  }

  function commit(marks: readonly Mark[], base: readonly Mark[] = game.marks, hints = game.hints) {
    if (marks.every((mark, index) => mark === base[index]) && hints === game.hints) {
      if (marks !== game.marks) game = with_marks(game, marks);
      return;
    }
    undo_stack = [...undo_stack, base].slice(-200);
    redo_stack = [];
    set_marks(marks, hints);
  }

  function finish() {
    const time = clock.pause();
    if (!tracks_stats) return;
    new_best = game.hints === 0 && (best === null || time < best);
    stats.value = record(stats.value, size, time, game.hints);
    on_solved?.(time);
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
    board?.focus_cell_at(next.index);
    commit(marks, game.marks, game.hints + 1);
  }

  async function confirm_loss(message: string, detail: string, confirm_label: string): Promise<boolean> {
    const progress_made = !game.solved && game.marks.some((mark) => mark !== Mark.EMPTY);
    return !progress_made || win.confirm(message, { detail, confirm_label });
  }

  async function new_puzzle(next_size: Size = size, next_mode: Mode = mode) {
    if (kind !== "free") {
      on_free();
      return;
    }
    const same = next_size === size && next_mode === mode;
    const confirmed = same
      ? await confirm_loss("Start a new puzzle?", "The marks on this one are lost. Statistics stay.", "New puzzle")
      : await confirm_loss(
          `Switch to ${next_size}×${next_size}${next_mode === Mode.COLOR ? " colour" : ""}?`,
          "A new puzzle replaces this one and its marks are lost.",
          "Switch"
        );
    if (!confirmed) return;
    size = next_size;
    mode = next_mode;
    storage.set("size", next_size);
    storage.set("mode", next_mode);
    game = new_game(next_size, random_seed(), next_mode);
    clock.reset();
    new_best = false;
    undo_stack = [];
    redo_stack = [];
    flash = null;
    hide_result = false;
    tool = tool === Mark.CROSSED ? Mark.CROSSED : Mark.FILLED;
    board?.focus_cell_at(0);
    save();
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: `Solved counts and best times for every ${mode === Mode.COLOR ? "colour " : ""}size go back to zero. The puzzle in progress is kept.`,
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

{#snippet tools(control: "sm" | "md")}
  {#if colored}
    <Swatches size={control} palette={puzzle.palette} extra="cross" bind:value={tool} />
  {:else}
    <Segmented size={control} label="Tool" options={[...BW_TOOLS]} bind:value={() => String(tool) as "1" | "-1", (next) => (tool = Number(next))} />
  {/if}
  <IconButton size={control} label="Undo (Ctrl+Z)" disabled={!undo_stack.length || game.solved} onclick={undo}>
    <UndoIcon weight="bold" />
  </IconButton>
  <IconButton size={control} label="Redo (Ctrl+Shift+Z)" disabled={!redo_stack.length || game.solved} onclick={redo}>
    <RedoIcon weight="bold" />
  </IconButton>
  <IconButton size={control} label="Hint (H)" disabled={game.solved} onclick={give_hint}>
    <LightbulbIcon weight="bold" />
  </IconButton>
  {#if control === "md" && Math.max(width, height) >= 15}
    <IconButton size={control} label={zoomed ? "Fit the board" : "Zoom in"} pressed={zoomed} onclick={() => (zoomed = !zoomed)}>
      {#if zoomed}<ZoomOutIcon weight="bold" />{:else}<ZoomInIcon weight="bold" />{/if}
    </IconButton>
  {/if}
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto_auto] @2xl:grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {#if kind === "free"}
      <Segmented size="sm" class="hidden @5xl:inline-flex" label="Colours" options={MODE_OPTIONS} bind:value={() => mode, (next) => new_puzzle(size, next)} />
      <Segmented size="sm" class="hidden @5xl:inline-flex" label="Size" options={SIZE_OPTIONS} bind:value={() => size, (next) => new_puzzle(next, mode)} />
      <Select
        class="w-36 whitespace-nowrap @5xl:hidden"
        size="sm"
        aria-label="Puzzle"
        options={KIND_OPTIONS}
        bind:value={
          () => `${mode}:${size}`,
          (next) => {
            const [next_mode, next_size] = next.split(":");
            new_puzzle(next_size as Size, next_mode as Mode);
          }
        }
      />
    {:else}
      <span class="flex min-w-0 items-center gap-1.5 px-1 text-ui font-medium">
        {#if kind === "daily"}<CalendarIcon class="size-4 shrink-0 text-foreground/65" />{:else if kind === "file"}<FileIcon class="size-4 shrink-0 text-foreground/65" />{/if}
        <span class="truncate">{label}</span>
      </span>
    {/if}
    <div class="hidden items-center gap-1 @2xl:flex">{@render tools("sm")}</div>
    <div class="flex-1"></div>
    {#if kind === "file" && on_edit}
      <IconButton size="sm" label="Edit this puzzle" onclick={on_edit}><PencilIcon weight="bold" /></IconButton>
    {/if}
    {#if kind !== "test"}
      <IconButton size="sm" label="Open a puzzle file (Ctrl+O)" onclick={on_open}><FolderOpenIcon weight="bold" /></IconButton>
      {#if kind !== "file"}
        <IconButton size="sm" label="Create a puzzle" onclick={on_create}><PencilIcon weight="bold" /></IconButton>
      {/if}
    {/if}
    {#if tracks_stats}
      <IconButton size="sm" label="Statistics" class="@5xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
        <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
      </IconButton>
    {/if}
    {#if kind === "test"}
      <Button size="sm" variant="primary" onclick={on_back}>Back to editor</Button>
    {:else}
      <Button size="sm" variant="primary" onclick={() => new_puzzle()}>
        <span class="hidden @md:inline">New puzzle</span>
        <span class="@md:hidden">New</span>
      </Button>
    {/if}
  </Toolbar>

  <div class={cn("relative grid min-h-0", tracks_stats && "@5xl:grid-cols-[1fr_18rem]")}>
    <div class={cn("flex min-h-0 overflow-auto [container-type:size]", zoomed ? "p-0" : "p-2 @md:p-4")}>
      <Board
        bind:this={board}
        {width}
        {height}
        rows={puzzle.rows}
        cols={puzzle.cols}
        palette={puzzle.palette}
        {colored}
        marks={game.marks}
        label="Puzzle, {width} by {height}. Arrows move, Space fills, X crosses, Shift with arrows paints{colored ? ', 1 to ' + puzzle.palette.length + ' pick a colour' : ''}"
        {row_runs}
        {col_runs}
        {done_rows}
        {done_cols}
        solved={game.solved}
        {zoomed}
        {flash}
        {pick}
        on_change={preview}
        on_commit={(marks, base) => commit(marks, base)}
      >
        {#snippet corner()}
          <span class="hidden @2xl:inline">{format_time(clock.elapsed)}</span>
        {/snippet}
        {#snippet overlay()}
          {#if game.solved && !hide_result}
            <BoardOverlay
              class="overlay"
              title="Solved"
              detail="{format_time(clock.elapsed)}{game.hints ? ` · ${game.hints} hint${game.hints === 1 ? '' : 's'}` : ''}{best !== null ? ` · Best ${format_time(best)}` : ''}"
            >
              <Button size="sm" variant="quiet" onclick={() => (hide_result = true)}>View picture</Button>
              {#if kind === "test"}
                <Button size="sm" variant="primary" onclick={on_back}>Back to editor</Button>
              {:else}
                <Button size="sm" variant="primary" onclick={() => new_puzzle()}>New puzzle</Button>
              {/if}
            </BoardOverlay>
          {/if}
        {/snippet}
      </Board>
    </div>

    {#if tracks_stats}
      <aside
        class={cn(
          "overflow-auto p-4 @5xl:static @5xl:block @5xl:max-h-none @5xl:border-t-0 @5xl:border-l @5xl:border-hairline @5xl:bg-transparent",
          show_stats ? "absolute inset-x-0 bottom-0 z-20 max-h-[60%] border-t border-hairline bg-background" : "hidden"
        )}
        {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
      >
        <Grabber class="-mt-2 mb-2 @5xl:hidden" />
        <Section
          title={mode === Mode.COLOR ? "Colour statistics" : "Statistics"}
          description="Puzzles solved per size. Best times count only solves without hints."
        >
          {#snippet actions()}
            <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
          {/snippet}
          {#each SIZES as each (each)}
            {@const entry = stats.value[each]}
            <div class="flex flex-col gap-0.5 px-4 py-2.5">
              <span class={cn("text-ui", each === size ? "font-medium" : "text-foreground/80")}>{each}×{each}</span>
              <span class="font-mono text-2xs text-foreground/80 tabular-nums">
                Solved {entry.solved} · Best {entry.best === null ? "–" : format_time(entry.best)}
              </span>
            </div>
          {/each}
        </Section>
      </aside>
    {/if}
  </div>

  <!-- Narrow windows (phones) keep the tools under the board, where a thumb reaches them. -->
  <div class="flex flex-wrap items-center justify-center gap-2 border-t border-hairline px-3 py-2 @2xl:hidden">
    <span class="font-mono text-sm text-foreground/80 tabular-nums" aria-hidden="true">{format_time(clock.elapsed)}</span>
    {@render tools("md")}
  </div>

  <StatusBar class="hidden @md:flex">
    <span class="shrink-0 font-mono tabular-nums">{format_time(clock.elapsed)}</span>
    <span aria-live="polite">{kind === "daily" ? `${label} · ${status}` : status}</span>
    <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{filled}/{target} filled</span>
    <span class="hidden @4xl:inline">Right-click or Shift crosses · drag to paint a line</span>
  </StatusBar>
</div>
