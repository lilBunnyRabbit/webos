<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { BoardOverlay, Button, IconButton, Section, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { ChartBar as ChartBarIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { key_marks } from "./feedback";
  import {
    BOARD_COUNTS,
    daily_saved_schema,
    daily_seed_of,
    DAILY_VARIANT,
    DEFAULT_VARIANT,
    EMPTY_RECORD,
    hard_allowed,
    max_rows,
    Mode,
    MODES,
    new_game,
    NO_WORDS,
    play,
    record_game,
    record_run,
    replay,
    saved_schema,
    stats_schema,
    Status,
    uses_words,
    variant_key,
    variant_schema,
    word_length,
    type BoardCount,
    type Game,
    type Saved,
    type Variant,
  } from "./game";
  import { display, key_of, LETTER_ROWS, NERDLE_ROWS } from "./tiles";
  import LettererBoard from "./letterer-board.svelte";
  import LettererKeyboard from "./letterer-keyboard.svelte";
  import { LENGTHS, load_words, type Length, type Words } from "./words";

  const MODE_LABELS: Record<Mode, string> = {
    classic: "Classic",
    multi: "Multi",
    survival: "Survival",
    absurdle: "Dodge",
    nerdle: "Math",
  };
  const MODE_OPTIONS = MODES.map((value) => ({ value, label: MODE_LABELS[value] }));
  const BOARD_LABELS: Record<BoardCount, string> = { 2: "2 boards", 4: "4 boards", 8: "8 boards" };
  const BOARD_OPTIONS = BOARD_COUNTS.map((value) => ({ value: String(value), label: BOARD_LABELS[value] }));
  const LENGTH_OPTIONS = LENGTHS.map((value) => ({ value: String(value), label: String(value) }));
  const RULES: Record<Mode, string> = {
    classic: "Guess the word",
    multi: "Every guess goes on every board",
    survival: "Each word solved starts the next one",
    absurdle: "The word keeps changing to dodge you",
    nerdle: "Guess the equation",
  };

  const { daily: daily_prop }: { daily?: string } = $props();
  const daily_day = untrack(() => daily_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const play_tracker = track_play(app_id, () => win.is_visible);
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const stats = storage.persisted("stats", {}, stats_schema);

  // Per window, so two open games don't switch each other's mode; storage only remembers the last pick.
  let pick = $state<Variant>(storage.get("variant", variant_schema) ?? DEFAULT_VARIANT);
  let daily = $state<string | null>(daily_day ?? null);
  let words = $state.raw<Words>(NO_WORDS);
  let game = $state.raw<Game | null>(null);
  let load_error = $state<string | null>(null);
  let typed = $state("");
  let message = $state<string | null>(null);
  let shake = $state(false);
  let reveal = $state(-1);
  let show_stats = $state(false);
  let root = $state<HTMLDivElement>();
  let board_element = $state<HTMLDivElement>();
  const clock = new Stopwatch(() => win.is_visible);
  let loading_token = 0;

  const variant = $derived(game?.variant ?? pick);
  const length = $derived(word_length(variant));
  const limit = $derived(max_rows(variant));
  const nerdle = $derived(variant.mode === Mode.NERDLE);
  const finished = $derived(game !== null && game.status !== Status.PLAYING);
  const used = $derived(game?.guesses.length ?? 0);
  const stats_key = $derived(variant_key(variant));
  const record = $derived(stats.value[stats_key] ?? EMPTY_RECORD);
  const elapsed = $derived(clock.elapsed);
  const visible_rows = $derived.by(() => {
    if (!game) return 6;
    if (limit !== null) return limit;
    return Math.max(6, game.boards[0].rows.length + (finished ? 0 : 1));
  });
  const keyboard_boards = $derived(game?.boards.map((board) => ({ marks: key_marks(board.rows), solved: board.solved })) ?? []);
  const solved_boards = $derived(game?.boards.filter((board) => board.solved).length ?? 0);
  const can_toggle_hard = $derived(hard_allowed(pick) && (game === null || finished || used === 0));

  const title = $derived.by(() => {
    if (daily) return `Daily · ${daily}`;
    if (variant.mode === Mode.MULTI) return `${BOARD_LABELS[variant.boards]} · ${variant.length} letters`;
    if (nerdle) return "Math";
    return `${MODE_LABELS[variant.mode]} · ${variant.length} letters`;
  });

  const status = $derived.by(() => {
    if (message) return message;
    if (!game) return load_error ?? "Loading words…";
    const answers = game.boards.map((board) => (board.answer ? display_word(board.answer) : "")).join(", ");
    if (game.status === Status.WON) {
      if (variant.mode === Mode.ABSURDLE) return `Cornered it in ${used} guesses`;
      return `Solved in ${used} ${used === 1 ? "guess" : "guesses"}`;
    }
    if (game.status === Status.LOST) {
      if (variant.mode === Mode.SURVIVAL)
        return `Run over after ${game.round} ${game.round === 1 ? "word" : "words"}. It was ${answers}`;
      return game.boards.length > 1 ? `Out of guesses. The words were ${answers}` : `Out of guesses. It was ${answers}`;
    }
    if (variant.mode === Mode.SURVIVAL && game.round > 0) return `Word ${game.round + 1} · the last answer is your first row`;
    if (game.boards.length > 1) return `${solved_boards} of ${game.boards.length} solved`;
    return RULES[variant.mode];
  });

  const overlay = $derived.by(() => {
    if (!game || !finished) return null;
    if (variant.mode === Mode.SURVIVAL)
      return { title: "Run over", detail: `${game.round} ${game.round === 1 ? "word" : "words"} · best ${record.best_streak}` };
    if (game.status === Status.WON) return { title: daily ? "Daily solved" : "Solved", detail: `${used}/${limit ?? used} · ${format_time(elapsed)}` };
    return { title: "Out of guesses", detail: game.boards.map((board) => display_word(board.answer ?? "")).join(" · ") };
  });

  const distribution = $derived.by(() => {
    const counts = record.distribution;
    const survival = variant.mode === Mode.SURVIVAL;
    const size = survival ? Math.max(counts.length, 1) : Math.max(limit ?? 0, counts.length);
    const bars = Array.from({ length: size }, (_, i) => ({ label: String(survival ? i : i + 1), count: counts[i] ?? 0 }));
    const peak = Math.max(1, ...bars.map((bar) => bar.count));
    const latest = game && finished ? (survival ? game.round : game.status === Status.WON ? used : null) : null;
    return { bars, peak, latest: latest === null ? null : String(latest) };
  });

  function display_word(word: string): string {
    return [...word].map(display).join("");
  }

  $effect(() => {
    if (win.is_focused && board_element && !root?.contains(document.activeElement)) board_element.focus({ preventScroll: true });
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `letterer.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const dispose = scoped("new", "f2", "New game", () => start_over());
    return () => dispose();
  });

  $effect(() => {
    if (!message) return;
    const timer = setTimeout(() => (message = null), 1800);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (!shake) return;
    const timer = setTimeout(() => (shake = false), 400);
    return () => clearTimeout(timer);
  });

  untrack(() => boot());

  async function boot() {
    if (daily_day) {
      const saved_daily = storage.get("daily", daily_saved_schema);
      const saved = saved_daily?.day === daily_day ? saved_daily.game : null;
      const variant = saved?.variant ?? { ...DAILY_VARIANT, hard: pick.hard };
      await begin(variant, daily_seed_of(daily_day), saved);
      return;
    }
    const saved = storage.get("game", saved_schema);
    if (saved && saved.guesses.length) await begin(saved.variant, saved.seed, saved);
    else await begin(pick, random_seed(), null);
  }

  async function begin(next: Variant, seed: number, saved: Saved | null) {
    const token = ++loading_token;
    load_error = null;
    let list: Words;
    try {
      list = uses_words(next) ? await load_words(next.length) : NO_WORDS;
    } catch (error) {
      if (token === loading_token) load_error = `Couldn't load the word list. ${error instanceof Error ? error.message : ""}`.trim();
      return;
    }
    if (token !== loading_token) return;
    words = list;
    const restored = saved ? replay(next, seed, saved.guesses, list) : null;
    game = restored ?? new_game(next, seed, list);
    typed = "";
    reveal = -1;
    message = null;
    clock.reset(restored && saved ? saved.elapsed : 0);
    if (restored?.status === Status.PLAYING && restored.guesses.length) clock.start();
    if (!restored) save();
  }

  function save() {
    if (!game) return;
    const data: Saved = { variant: game.variant, seed: game.seed, guesses: [...game.guesses], elapsed: clock.read() };
    if (daily) storage.set("daily", { day: daily, game: data });
    else storage.set("game", data);
  }

  function finish(done: Game) {
    const time = clock.pause();
    const key = variant_key(done.variant);
    if (done.variant.mode === Mode.SURVIVAL) {
      stats.value = record_run(stats.value, key, done.round);
      return;
    }
    const won = done.status === Status.WON;
    stats.value = record_game(stats.value, key, won, done.guesses.length);
    if (won && daily) play_tracker.daily(daily, time);
  }

  function submit() {
    if (!game || finished) return;
    if (typed.length < length) return reject(nerdle ? "Not enough characters" : "Not enough letters");
    const result = play(game, typed, words);
    if (!result.ok) return reject(result.error);
    if (!clock.running) clock.start();
    const before = game.round;
    game = result.game;
    reveal = Math.max(...game.boards.map((board) => board.rows.length)) - 1;
    typed = "";
    message = game.round !== before ? `Solved. Word ${game.round + 1}` : null;
    if (game.status !== Status.PLAYING) finish(game);
    save();
  }

  function reject(text: string) {
    message = text;
    shake = true;
  }

  function press(key: string) {
    if (!game || finished) return;
    if (key === "enter") return submit();
    if (key === "backspace") {
      typed = typed.slice(0, -1);
      return;
    }
    if (typed.length < length) typed += key;
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    // Segmented and Switch are radio and checkbox inputs: typing after a click on them still guesses.
    if (target.closest("input:not([type=radio], [type=checkbox]), select, textarea")) return;
    const key = key_of(event, nerdle);
    if (!key) return;
    if (key === "enter" && target.closest("button")) return;
    event.preventDefault();
    press(key);
  }

  async function confirm_abandon(): Promise<boolean> {
    if (!game || finished || used === 0) return true;
    return win.confirm("Start a new game?", {
      detail: "The game in progress is lost and doesn't count in the statistics.",
      confirm_label: "New game",
    });
  }

  async function start_over(next: Variant = pick) {
    if (!(await confirm_abandon())) return;
    daily = null;
    pick = next;
    storage.set("variant", next);
    await begin(next, random_seed(), null);
    board_element?.focus({ preventScroll: true });
  }

  function set_mode(mode: Mode) {
    if (mode !== pick.mode || daily) start_over({ ...pick, mode });
  }

  function set_length(value: string) {
    const next = Number(value) as Length;
    if (next !== pick.length || daily) start_over({ ...pick, length: next });
  }

  function set_boards(value: string) {
    const next = Number(value) as BoardCount;
    if (next !== pick.boards) start_over({ ...pick, boards: next });
  }

  function set_hard(hard: boolean) {
    pick = { ...pick, hard };
    storage.set("variant", pick);
    if (game && !finished && used === 0) {
      game = { ...game, variant: { ...game.variant, hard } };
      save();
    }
  }

  async function reset_stats() {
    const confirmed = await win.confirm("Reset statistics?", {
      detail: "Games played, wins, streaks and guess counts for every mode go back to zero. The game in progress is kept.",
      confirm_label: "Reset",
      danger: true,
    });
    if (confirmed) stats.value = {};
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div bind:this={root} class="grid h-full grid-rows-[auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <Segmented size="sm" class="hidden @3xl:inline-flex" label="Mode" options={MODE_OPTIONS} bind:value={() => pick.mode, set_mode} />
    <Select class="w-30 @3xl:hidden" size="sm" aria-label="Mode" options={MODE_OPTIONS} bind:value={() => pick.mode, set_mode} />
    {#if pick.mode === Mode.MULTI}
      <Segmented size="sm" class="hidden @xl:inline-flex" label="Boards" options={BOARD_OPTIONS} bind:value={() => String(pick.boards), set_boards} />
      <Select class="w-28 @xl:hidden" size="sm" aria-label="Boards" options={BOARD_OPTIONS} bind:value={() => String(pick.boards), set_boards} />
    {/if}
    {#if pick.mode !== Mode.NERDLE}
      <Segmented size="sm" label="Letters" options={LENGTH_OPTIONS} bind:value={() => String(pick.length), set_length} />
    {/if}
    <label
      class={cn("flex items-center gap-1.5 px-1 text-ui", !can_toggle_hard && "opacity-38")}
      title={hard_allowed(pick) ? "Revealed hints must be used in every later guess" : "Multi plays without hard mode"}
    >
      <Switch checked={pick.hard && hard_allowed(pick)} disabled={!can_toggle_hard} onchange={(event) => set_hard(event.currentTarget.checked)} />
      Hard
    </label>
    <div class="flex-1"></div>
    <IconButton size="sm" label="Statistics" class="@3xl:hidden" pressed={show_stats} onclick={() => (show_stats = !show_stats)}>
      <ChartBarIcon weight={show_stats ? "fill" : "bold"} />
    </IconButton>
    <Button size="sm" variant="primary" onclick={() => start_over()}>New game</Button>
  </Toolbar>

  <div class="relative grid min-h-0 @3xl:grid-cols-[1fr_18rem]">
    <div class="flex min-h-0 flex-col items-center gap-2 px-3 pt-3 pb-3">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board_element}
        role="application"
        tabindex="0"
        aria-label="{title}. Type to guess, Enter to submit, Backspace to delete"
        class="relative flex min-h-0 w-full flex-1 overflow-auto outline-none [container-type:size]"
      >
        {#if game}
          {@const count = game.boards.length}
          <div
            class="boards m-auto grid gap-[var(--board-gap)] p-1"
            data-count={count}
            style:--len={length}
            style:--rows={visible_rows}
          >
            {#each game.boards as board, index (index)}
              <LettererBoard
                rows={board.rows}
                current={!finished && !board.solved ? typed : null}
                {length}
                total={visible_rows}
                {reveal}
                {shake}
                solved={board.solved && count > 1}
                label={count > 1 ? `Board ${index + 1}${board.solved ? ", solved" : ""}` : "Guesses"}
              />
            {/each}
          </div>
        {:else if load_error}
          <p class="m-auto p-4 text-center text-ui text-error">{load_error}</p>
        {:else}
          <div class="m-auto"><Spinner /></div>
        {/if}
      </div>

      <p class="min-h-5 shrink-0 truncate text-center text-ui" aria-live="polite">{status}</p>

      <div class="relative flex w-full shrink-0 justify-center">
        <LettererKeyboard rows={nerdle ? NERDLE_ROWS : LETTER_ROWS} boards={keyboard_boards} disabled={!game || finished} onkey={press} />
        {#if overlay}
          <BoardOverlay class="rounded-lg" title={overlay.title} detail={overlay.detail}>
            <Button size="sm" variant="primary" onclick={() => start_over()}>{daily ? "Play a new game" : "Play again"}</Button>
          </BoardOverlay>
        {/if}
      </div>
    </div>

    <aside
      class={cn(
        "flex-col gap-6 overflow-auto p-4 @3xl:static @3xl:flex @3xl:max-h-none @3xl:border-t-0 @3xl:border-l @3xl:border-foreground/8 @3xl:bg-transparent",
        show_stats ? "absolute inset-x-0 bottom-0 z-20 flex max-h-[70%] border-t border-foreground/8 bg-background" : "hidden"
      )}
    >
      <Section title="Statistics" description={title.startsWith("Daily") ? "Classic · 5 letters, the daily included." : `${title}.`}>
        {#snippet actions()}
          <Button size="sm" variant="quiet" onclick={reset_stats}>Reset</Button>
        {/snippet}
        {@const survival = variant.mode === Mode.SURVIVAL}
        {@const figures = survival
          ? [
              ["Runs", record.played],
              ["Words", record.won],
              ["Last run", record.streak],
              ["Best run", record.best_streak],
            ]
          : [
              ["Played", record.played],
              ["Win %", record.played ? Math.round((record.won / record.played) * 100) : 0],
              ["Streak", record.streak],
              ["Best streak", record.best_streak],
            ]}
        <dl class="grid grid-cols-4 gap-2 px-4 py-3 text-center">
          {#each figures as [label, value] (label)}
            <div class="flex flex-col-reverse gap-0.5">
              <dt class="text-2xs text-foreground/65">{label}</dt>
              <dd class="font-mono text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          {/each}
        </dl>
        <div class="flex flex-col gap-1 border-t border-foreground/8 px-4 py-3">
          <p class="pb-1 text-2xs text-foreground/65">{survival ? "Words per run" : "Wins by guesses"}</p>
          {#each distribution.bars as bar (bar.label)}
            <div class="grid grid-cols-[1.5rem_1fr] items-center gap-2 font-mono text-2xs tabular-nums">
              <span class="text-right text-foreground/65">{bar.label}</span>
              <span
                class={cn(
                  "min-w-6 rounded-sm px-1.5 py-0.5 text-right",
                  bar.label === distribution.latest ? "bg-primary text-background" : "bg-foreground/12"
                )}
                style:width="{(bar.count / distribution.peak) * 100}%">{bar.count}</span
              >
            </div>
          {/each}
        </div>
      </Section>
      <p class="text-2xs text-foreground/65">
        Word lists from ENABLE (public domain), answers picked from its common words.
      </p>
    </aside>
  </div>

  <StatusBar>
    <span class="shrink-0">{title}</span>
    <span class="shrink-0 tabular-nums">{format_time(elapsed)}</span>
    <span class="hidden shrink-0 tabular-nums @md:inline">{limit === null ? `${used} guesses` : `${used}/${limit} guesses`}</span>
    {#if variant.hard && hard_allowed(variant)}<span class="hidden shrink-0 @lg:inline">Hard</span>{/if}
    {#if variant.mode === Mode.SURVIVAL && game}<span class="hidden shrink-0 @lg:inline">{game.round} solved</span>{/if}
  </StatusBar>
</div>

<style>
  .boards {
    --cols: 1;
    --brows: 1;
    --gap: 0.3rem;
    --board-gap: 1.25rem;
    --fit: min(
      (100cqw - 0.5rem - (var(--cols) - 1) * var(--board-gap) - var(--cols) * (var(--len) - 1) * var(--gap)) / (var(--cols) * var(--len)),
      (100cqh - 0.5rem - (var(--brows) - 1) * var(--board-gap) - var(--brows) * (var(--rows) - 1) * var(--gap)) / (var(--brows) * var(--rows))
    );
    --tile: clamp(1.25rem, var(--fit), 3.5rem);
    grid-template-columns: repeat(var(--cols), auto);
  }

  .boards[data-count="2"] {
    --cols: 2;
  }

  .boards[data-count="4"] {
    --cols: 2;
    --brows: 2;
  }

  .boards[data-count="8"] {
    --cols: 4;
    --brows: 2;
    --gap: 0.2rem;
    --board-gap: 0.75rem;
  }

  /* In a wide window one row of boards leaves bigger tiles than a block of them. */
  @container (min-aspect-ratio: 6/5) {
    .boards[data-count="4"] {
      --cols: 4;
      --brows: 1;
    }
  }

  @container (min-aspect-ratio: 8/5) {
    .boards[data-count="8"] {
      --cols: 8;
      --brows: 1;
    }
  }
</style>
