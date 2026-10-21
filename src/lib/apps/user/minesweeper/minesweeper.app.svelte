<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { Button, Grabber, IconButton, Input, Section, Segmented, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import { long_press } from "$lib/core/utils/long-press";
  import type { Position } from "$lib/core/utils/type";
  import {
    ChartBar as ChartBarIcon,
    Flag as FlagIcon,
    Smiley as SmileyIcon,
    SmileySticker as SmileyWonIcon,
    SmileyXEyes as SmileyLostIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import {
    activate,
    clamp_config,
    config_of,
    config_schema,
    DAILY_DIFFICULTY,
    daily_game,
    DIFFICULTIES,
    Difficulty,
    difficulty_schema,
    empty_stats,
    LIMITS,
    max_mines,
    mines_left,
    new_game,
    record,
    stats_schema,
    Status,
    step,
    toggle_flag,
    type Config,
    type Game,
    type GameRecord,
  } from "./game";
  import MineCell from "./mine-cell.svelte";

  const DIFFICULTY_LABELS: Record<Difficulty, string> = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    expert: "Expert",
    custom: "Custom",
  };
  const DIFFICULTY_OPTIONS = DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] }));

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { app_id, window: win, storage } = get_app_context();
  const play = track_play(app_id, () => win.is_visible);
  const stats = storage.persisted("stats", empty_stats(), stats_schema);
  const custom = storage.persisted<Config>("custom", { width: 20, height: 12, mines: 40 }, config_schema);

  // Per window, so two open games don't switch each other's board; storage only remembers the last pick.
  const initial_difficulty = daily_day ? DAILY_DIFFICULTY : (storage.get("difficulty", difficulty_schema) ?? Difficulty.BEGINNER);
  let daily = $state(daily_day ?? null);
  let difficulty = $state<Difficulty>(initial_difficulty);
  let game = $state.raw<Game>(daily_day ? daily_game(daily_day) : new_game(config_of(initial_difficulty, custom.value)));
  const clock = new Stopwatch(() => win.is_visible);
  let new_best = $state(false);
  let active = $state(0);
  let show_stats = $state(false);
  let draft = $state<Config>({ ...custom.value });
  const cell_elements: HTMLButtonElement[] = $state([]);

  const config = $derived(game.config);
  const finished = $derived(game.status === Status.WON || game.status === Status.LOST);
  const lost = $derived(game.status === Status.LOST);
  // Each board field on its own: a flag replaces only `cells`, so the per-cell reads of the others stay quiet.
  const cells = $derived(game.cells);
  const mines = $derived(game.mines);
  const counts = $derived(game.counts);
  const exploded_at = $derived(game.exploded);
  const elapsed = $derived(clock.elapsed);
  const seconds = $derived(Math.min(Math.floor(elapsed / 1000), 999));
  const counter = $derived(mines_left(game));
  const current = $derived(stats.value[difficulty]);

  const status = $derived.by(() => {
    switch (game.status) {
      case Status.READY:
        return "Click any cell to start";
      case Status.PLAYING:
        return daily ? `Daily · ${daily}` : "Clear every cell without a mine";
      case Status.WON:
        return `Cleared in ${format_time(elapsed, { tenths: true })}${new_best ? ", a new best" : ""}`;
      case Status.LOST:
        return "You hit a mine";
    }
  });

  function apply(next: Game) {
    if (next === game) return;
    game = next;
    if (!clock.running && next.status !== Status.READY) clock.start();
    if (next.status === Status.WON || next.status === Status.LOST) {
      const won = next.status === Status.WON;
      const time = clock.pause();
      if (won && daily) play.daily(daily, time);
      const best = stats.value[difficulty].best;
      new_best = won && difficulty !== Difficulty.CUSTOM && (best === null || time < best);
      stats.value = record(stats.value, difficulty, won, time);
    }
  }

  function restart(next_config: Config = config_of(difficulty, custom.value)) {
    game = daily ? daily_game(daily) : new_game(next_config);
    clock.reset();
    new_best = false;
    active = Math.min(active, next_config.width * next_config.height - 1);
  }

  function set_difficulty(next: Difficulty) {
    daily = null;
    difficulty = next;
    storage.set("difficulty", next);
    restart();
  }

  function apply_custom(event: SubmitEvent) {
    event.preventDefault();
    const next = clamp_config(draft);
    custom.value = next;
    draft = { ...next };
    daily = null;
    restart(next);
  }

  function open_cell(index: number) {
    active = index;
    apply(activate(game, index));
  }

  function flag_cell(index: number) {
    active = index;
    apply(toggle_flag(game, index));
  }

  function flag_at(point: Position) {
    const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-cell]");
    if (target?.dataset.cell) flag_cell(Number(target.dataset.cell));
  }

  function set_active(index: number) {
    active = index;
  }

  function focus_cell(index: number) {
    active = index;
    cell_elements[index]?.focus();
  }

  function on_board_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const next = step(config, active, event.key);
    if (next !== active || event.key.startsWith("Arrow")) {
      event.preventDefault();
      focus_cell(next);
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      flag_cell(active);
    }
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === "F2") {
      event.preventDefault();
      restart();
    }
  }

  function format_record(entry: GameRecord, for_difficulty: Difficulty): string {
    const rate = entry.played ? Math.round((entry.won / entry.played) * 100) : 0;
    const parts = [`Played ${entry.played}`, `Won ${entry.won} (${rate}%)`];
    if (for_difficulty !== Difficulty.CUSTOM) parts.push(`Best ${entry.best === null ? "–" : format_time(entry.best, { tenths: true })}`);
    return parts.join(" · ");
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Games played, games won and best times for every difficulty go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = empty_stats();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <div>
    <Toolbar>
      <Segmented
        size="sm"
        class="hidden @xl:inline-flex"
        label="Difficulty"
        options={DIFFICULTY_OPTIONS}
        bind:value={() => difficulty, set_difficulty}
      />
      <Select
        class="w-36 @xl:hidden"
        size="sm"
        aria-label="Difficulty"
        options={DIFFICULTY_OPTIONS}
        bind:value={() => difficulty, set_difficulty}
      />
      <div class="flex-1"></div>
      <IconButton
        size="sm"
        label="Statistics"
        class="@3xl:hidden"
        pressed={show_stats}
        onclick={() => (show_stats = !show_stats)}
      >
        <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
      </IconButton>
      <Button size="sm" variant="primary" onclick={() => restart()}>New game</Button>
    </Toolbar>

    {#if difficulty === Difficulty.CUSTOM}
      <form
        class="flex flex-wrap items-center gap-2 border-b border-foreground/8 bg-background-light px-3 py-2 text-ui"
        onsubmit={apply_custom}
      >
        <label class="flex items-center gap-1.5">
          <span class="text-foreground/65">Width</span>
          <Input
            class="w-16"
            size="sm"
            type="number"
            min={LIMITS.width.min}
            max={LIMITS.width.max}
            bind:value={() => draft.width, (v) => (draft.width = Number(v))}
          />
        </label>
        <label class="flex items-center gap-1.5">
          <span class="text-foreground/65">Height</span>
          <Input
            class="w-16"
            size="sm"
            type="number"
            min={LIMITS.height.min}
            max={LIMITS.height.max}
            bind:value={() => draft.height, (v) => (draft.height = Number(v))}
          />
        </label>
        <label class="flex items-center gap-1.5">
          <span class="text-foreground/65">Mines</span>
          <Input
            class="w-18"
            size="sm"
            type="number"
            min={LIMITS.mines.min}
            max={max_mines(clamp_config(draft).width, clamp_config(draft).height)}
            bind:value={() => draft.mines, (v) => (draft.mines = Number(v))}
          />
        </label>
        <Button size="sm" type="submit">Apply</Button>
      </form>
    {/if}
  </div>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_20rem]">
    <div class="flex min-h-0 flex-col">
      <div class="flex shrink-0 items-center justify-center gap-4 px-3 pt-3">
        <span
          class="flex w-16 items-center gap-1.5 font-mono text-sm tabular-nums"
          aria-label={`${counter} mines left`}
        >
          <FlagIcon weight="fill" class="size-3.5 shrink-0 text-error" />
          {counter}
        </span>
        <IconButton label="New game (F2)" variant="secondary" onclick={() => restart()}>
          {#if game.status === Status.WON}
            <SmileyWonIcon weight="fill" class="text-success" />
          {:else if game.status === Status.LOST}
            <SmileyLostIcon weight="fill" class="text-error" />
          {:else}
            <SmileyIcon weight="fill" class="text-warning" />
          {/if}
        </IconButton>
        <span class="w-16 text-right font-mono text-sm tabular-nums" aria-label={`${seconds} seconds`}>
          {String(seconds).padStart(3, "0")}
        </span>
      </div>
      <p class="sr-only" aria-live="polite">{finished ? status : ""}</p>

      <div class="flex min-h-0 flex-1 overflow-auto p-3 [container-type:size]">
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="grid"
          aria-label="Minefield"
          tabindex="-1"
          class="board m-auto grid touch-manipulation select-none [-webkit-touch-callout:none]"
          style:--cols={config.width}
          style:--rows={config.height}
          onkeydown={on_board_keydown}
          {@attach long_press({ on_menu: flag_at })}
        >
          {#each { length: config.height }, row (row)}
            <div role="row" class="contents">
              {#each { length: config.width }, col (col)}
                {@const index = row * config.width + col}
                {@const cell = cells[index]}
                {@const mine = mines[index] ?? false}
                {@const count = counts[index] ?? 0}
                {@const is_active = index === active}
                {@const exploded = index === exploded_at}
                <MineCell
                  bind:element={cell_elements[index]}
                  {index}
                  {row}
                  {col}
                  {cell}
                  {mine}
                  {count}
                  active={is_active}
                  {finished}
                  {lost}
                  {exploded}
                  onopen={open_cell}
                  onfocus={set_active}
                />
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <aside
      class={cn(
        "overflow-auto p-4 @3xl:static @3xl:block @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-foreground/8 @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 max-h-[60%] border-t border-foreground/8 bg-background" : "hidden"
      )}
      {@attach swipe_dismiss({ on_dismiss: () => (show_stats = false) })}
    >
      <Grabber class="-mt-2 mb-2 @3xl:hidden" />
      <Section title="Statistics" description="Every finished game, per difficulty.">
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {#each DIFFICULTIES as each (each)}
          <div class="flex flex-col gap-0.5 px-4 py-2.5">
            <span class={cn("text-ui", each === difficulty ? "font-medium" : "text-foreground/80")}>
              {DIFFICULTY_LABELS[each]}
            </span>
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">
              {format_record(stats.value[each], each)}
            </span>
          </div>
        {/each}
      </Section>
    </aside>
  </div>

  <StatusBar>
    <span>{DIFFICULTY_LABELS[difficulty]} · {config.width}×{config.height} · {config.mines} mines</span>
    <span>{status}</span>
    {#if difficulty !== Difficulty.CUSTOM}
      <span class="hidden @md:inline">Best {current.best === null ? "–" : format_time(current.best, { tenths: true })}</span>
    {/if}
    <span class="hidden @2xl:inline">Right-click or long press to flag</span>
  </StatusBar>
</div>

<style>
  .board {
    --gap: 0.125rem;
    --min: 1.5rem;
    --fit: min(
      (100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols),
      (100cqh - (var(--rows) - 1) * var(--gap)) / var(--rows)
    );
    --cell: clamp(var(--min), var(--fit), 3rem);
    grid-template-columns: repeat(var(--cols), var(--cell));
    grid-auto-rows: var(--cell);
    gap: var(--gap);
    font-size: calc(var(--cell) * 0.55);
  }

  @media (pointer: coarse) {
    .board {
      --min: 2rem;
    }
  }
</style>
