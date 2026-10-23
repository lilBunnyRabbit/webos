<script lang="ts">
  import kernel, {
    NotificationType,
    format_keys,
    ShortcutCategory,
    type AiMessage,
    type AiService,
    type FilesService,
    type NotificationsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { BoardOverlay, Button, IconButton, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { format_time, Stopwatch, track_play } from "$kit/games";
  import { can_undo, create_history, current, push, undo, type History } from "$kit/utils/history";
  import { ImageFormat, save_image } from "$kit/utils/image";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Eraser as EraserIcon, SkipForward as SkipForwardIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { describe_guesses, GuessesSchema, IDLE_MS, is_better, is_hit, Outcome, pick_words, ROUND_WORDS, score_of, ScoreSchema, Status, WORD_MS, type Score, type WordResult } from "./game";
  import { GuessQueue } from "./guess-queue";
  import { GUESS_SIZE, SAVE_SIZE, type Stroke } from "./ink";
  import Recap from "./recap.svelte";
  import SketchPad from "./sketch-pad.svelte";
  import { render_snapshot, snapshot_png } from "./snapshot";
  import type { Word } from "./words";

  let { notice }: { notice: Snippet | null } = $props();

  const INSTRUCTIONS =
    "You play a sketch guessing game. The picture is a quick doodle of one everyday thing, black lines on white. Guess what it shows: up to three words from the allowed list, most likely first. Answer with no words only when the picture is blank or unreadable.";

  const ai = $derived(kernel.service<AiService>("ai"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const files = $derived(kernel.service<FilesService>("files"));
  const { app_id, window_id, window: win, storage } = get_app_context();
  track_play(app_id, () => win.is_visible);
  const best = storage.persisted<Score | null>("best", null, ScoreSchema.nullable());

  let status = $state<Status>(Status.READY);
  let words = $state.raw<Word[]>([]);
  let index = $state(0);
  let results = $state.raw<WordResult[]>([]);
  let history = $state.raw<History<Stroke[]>>(create_history([]));
  let guesses = $state.raw<Word[]>([]);
  let error = $state<string | null>(null);
  let new_best = $state(false);
  let recap_open = $state(false);
  let board: HTMLDivElement | undefined = $state();
  const clock = new Stopwatch(() => win.is_visible);
  let queue: GuessQueue<{ guesses: Word[]; ms: number }> | null = null;
  let reported: string | null = null;

  const word = $derived(words[index] as Word | undefined);
  const strokes = $derived(current(history));
  const left = $derived(Math.max(0, WORD_MS - clock.elapsed));
  const score = $derived(score_of(results));
  const drawing = $derived(status === Status.DRAWING);
  const undo_keys = $derived(format_keys("mod+z", shortcuts.mac).join(shortcuts.mac ? "" : "+"));

  $effect(() => {
    if (status === Status.DRAWING && clock.elapsed >= WORD_MS) time_up();
  });

  $effect(() => () => queue?.cancel());

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `doodlehop.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("undo", "mod+z", "Undo", undo_stroke)];
    return () => disposers.forEach((dispose) => dispose());
  });

  function focus_board() {
    board?.focus({ preventScroll: true });
  }

  function new_game() {
    queue?.cancel();
    queue = null;
    clock.reset();
    words = pick_words(Math.random);
    index = 0;
    results = [];
    history = create_history([]);
    guesses = [];
    error = null;
    reported = null;
    new_best = false;
    recap_open = false;
    status = Status.PROMPT;
    focus_board();
  }

  function begin() {
    if (status !== Status.PROMPT) return;
    history = create_history([]);
    guesses = [];
    queue = make_queue(index);
    clock.reset();
    clock.start();
    status = Status.DRAWING;
    focus_board();
  }

  function make_queue(for_index: number) {
    const created: GuessQueue<{ guesses: Word[]; ms: number }> = new GuessQueue({
      idle_ms: IDLE_MS,
      ask: async (signal) => {
        const ms = clock.read();
        const image = await snapshot_png(current(history), GUESS_SIZE);
        if (!image) return { guesses: [], ms };
        // The target word is never in the prompt: the list is the whole schema, and matching happens here.
        const messages: AiMessage[] = [
          { role: "system", content: INSTRUCTIONS },
          { role: "user", content: [{ type: "text", value: "What is this drawing?" }, { type: "image", value: image }] },
        ];
        const answer = await ai.extract(messages, GuessesSchema, { signal });
        return { guesses: answer.guesses, ms };
      },
      onanswer: (answer) => {
        if (queue !== created || index !== for_index) return;
        guesses = answer.guesses;
        error = null;
        if (word && is_hit(answer.guesses, word)) finish(Outcome.RECOGNISED, answer.ms);
      },
      onerror: (reason) => {
        if (queue !== created) return;
        const message = error_message(reason);
        error = message;
        if (reported === message) return;
        reported = message;
        notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't get a guess", message });
      },
    });
    return created;
  }

  function time_up() {
    if (status !== Status.DRAWING || !queue) return;
    status = Status.WAITING;
    clock.pause();
    const waiting = queue;
    const at = index;
    waiting.close().then(() => {
      if (queue === waiting && index === at && status === Status.WAITING) finish(Outcome.MISSED, null);
    });
  }

  function finish(outcome: Outcome, ms: number | null) {
    if ((status !== Status.DRAWING && status !== Status.WAITING) || !word) return;
    queue?.cancel();
    queue = null;
    clock.pause();
    results = [
      ...results,
      {
        word,
        outcome,
        ms: outcome === Outcome.RECOGNISED ? Math.min(ms ?? WORD_MS, WORD_MS) : null,
        strokes,
        guesses,
      },
    ];
    history = create_history([]);
    guesses = [];
    if (index + 1 < words.length) {
      index++;
      status = Status.PROMPT;
      return;
    }
    status = Status.OVER;
    recap_open = false;
    const final = score_of(results);
    new_best = is_better(final, best.value);
    if (new_best) best.value = final;
  }

  function skip() {
    if (status === Status.DRAWING) finish(Outcome.SKIPPED, null);
  }

  function add_stroke(stroke: Stroke) {
    if (!drawing) return;
    history = push(history, [...strokes, stroke]);
    queue?.changed();
  }

  function undo_stroke() {
    if (!drawing || !can_undo(history)) return;
    history = undo(history);
    queue?.replaced();
  }

  function clear() {
    if (!drawing || strokes.length === 0) return;
    history = push(history, []);
    guesses = [];
    queue?.replaced();
  }

  async function save(result: WordResult) {
    const canvas = render_snapshot(result.strokes, SAVE_SIZE);
    if (!canvas) return;
    const pictures = "/home/Pictures";
    const start_path = (await files.get_directory(pictures)) ? pictures : "/home";
    await save_image({ app_id, window: win, canvas, name: `${result.word}.png`, format: ImageFormat.PNG, start_path });
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.target !== board || event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (status === Status.READY) new_game();
    else if (status === Status.PROMPT) begin();
  }

  function previous_line(): string {
    const last = results.at(-1);
    if (!last) return `Word 1 of ${ROUND_WORDS} · 20 seconds`;
    const said = last.outcome === Outcome.RECOGNISED ? `Got ${last.word} in ${format_time(last.ms ?? 0)}` : `Missed ${last.word}`;
    return `${said} · Word ${index + 1} of ${ROUND_WORDS}`;
  }

  const summary = $derived(
    `${score.recognised} of ${ROUND_WORDS} · ${format_time(score.ms, { tenths: true })}${new_best ? " · New best" : ""}`
  );
  const best_line = $derived(best.value ? `Best ${best.value.recognised} · ${format_time(best.value.ms, { tenths: true })}` : "No best yet");
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid h-full grid-rows-[auto_auto_1fr_auto]" onkeydown={on_keydown}>
  <Toolbar>
    <IconButton size="sm" label="Undo" disabled={!drawing || !can_undo(history)} onclick={undo_stroke}>
      <ArrowCounterClockwiseIcon weight="bold" />
    </IconButton>
    <IconButton size="sm" label="Clear" disabled={!drawing || strokes.length === 0} onclick={clear}>
      <EraserIcon weight="bold" />
    </IconButton>
    <Button size="sm" variant="quiet" aria-label="Skip" disabled={!drawing} onclick={skip}>
      <SkipForwardIcon weight="bold" /> <span class="hidden @sm:inline">Skip</span>
    </Button>
    <div class="flex-1"></div>
    <Button size="sm" variant="primary" onclick={new_game}>New game</Button>
  </Toolbar>

  {#if notice}{@render notice()}{:else}<div></div>{/if}

  {#if status === Status.OVER}
    <div class="relative min-h-0">
      <div class="h-full overflow-auto p-3" inert={!recap_open}>
        <Recap {results} onsave={save} />
      </div>
      {#if !recap_open}
        <BoardOverlay title="Round over" detail={summary}>
          <Button size="sm" variant="secondary" onclick={() => (recap_open = true)}>See drawings</Button>
          <Button size="sm" variant="primary" onclick={new_game}>Play again</Button>
        </BoardOverlay>
      {/if}
    </div>
  {:else}
    <div class="flex min-h-0 flex-col items-center justify-center gap-2 p-3 [container-type:size]">
      <div class="flex w-[min(100cqw,calc(100cqh-4rem))] items-baseline justify-between gap-3 px-1">
        <p class="min-w-0 truncate text-ui">
          {#if word && status !== Status.READY && status !== Status.PROMPT}
            Draw <span class="text-base font-semibold">{word}</span>
          {:else}
            <span class="text-foreground/65">Draw what it says, the AI guesses</span>
          {/if}
        </p>
        <span class={["font-mono text-base tabular-nums", drawing && left <= 5000 && "text-warning"]} aria-label="Time left">
          {format_time(status === Status.DRAWING || status === Status.WAITING ? Math.ceil(left / 1000) * 1000 : WORD_MS)}
        </span>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        bind:this={board}
        role="application"
        aria-label="Drawing board. Draw with the mouse, a pen or a finger. {undo_keys} to undo."
        tabindex="0"
        class="relative aspect-square w-[min(100cqw,calc(100cqh-4rem))] overflow-hidden rounded-lg bg-background-darker ring-1 ring-hairline outline-none select-none focus-visible:ring-2 focus-visible:ring-cottontail"
      >
        <SketchPad {strokes} enabled={drawing} onpen={(down) => queue?.pen(down)} onstroke={add_stroke} />

        {#if status === Status.READY}
          <BoardOverlay title="Doodlehop" detail="{ROUND_WORDS} words · 20 seconds each">
            <Button size="sm" variant="primary" onclick={new_game}>Start</Button>
          </BoardOverlay>
        {:else if status === Status.PROMPT && word}
          <BoardOverlay title="Draw {word}" detail={previous_line()}>
            <Button size="sm" variant="primary" onclick={begin}>Go</Button>
          </BoardOverlay>
        {/if}
      </div>

      <p class="min-h-5 w-[min(100cqw,calc(100cqh-4rem))] truncate px-1 text-center text-ui text-foreground/80" aria-live="polite">
        {#if status === Status.WAITING}
          Time's up. Waiting for the last guess…
        {:else if drawing && error}
          No guess: {error}
        {:else if drawing}
          {describe_guesses(guesses)}
        {/if}
      </p>
    </div>
  {/if}

  <StatusBar>
    <span>Recognised {score.recognised} of {ROUND_WORDS}</span>
    <span>{best_line}</span>
    <span class="hidden @md:inline">{undo_keys} to undo</span>
  </StatusBar>
</div>
