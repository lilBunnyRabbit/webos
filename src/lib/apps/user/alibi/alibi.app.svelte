<script lang="ts">
  import kernel, { AiFeature, ShortcutCategory, type AiMessage, type AiService, type ShortcutsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { cn } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { Badge, BoardOverlay, Button, Spinner, StatusBar, Textarea, Toolbar } from "$lib/core/components/ui";
  import { AiGate } from "$kit/components/ai-gate";
  import { track_play } from "$kit/games";
  import { Detective as DetectiveIcon, PaperPlaneRight as PaperPlaneRightIcon, Scales as ScalesIcon, Stop as StopIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { onDestroy, tick, untrack } from "svelte";
  import {
    judge,
    lie_of,
    new_case,
    questions_in,
    saved_schema,
    score,
    status,
    Status,
    suspect_prompt,
    TRIES,
    wrong_count,
    type Case,
    type Pick,
    type Saved,
    type Turn,
  } from "./case";
  import { Flash } from "$kit/utils/flash.svelte";

  const { seed: seed_prop }: { seed?: number } = $props();
  const linked = untrack(() => seed_prop);

  const { window_id, app_id, window: win, storage } = get_app_context();
  const ai = $derived(kernel.service<AiService>("ai"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  track_play(app_id, () => win.is_visible);

  const saved = storage.get("case", saved_schema);
  const resumed = saved && (linked === undefined || saved.seed === linked) ? saved : null;

  let game = $state.raw<Case>(new_case(resumed?.seed ?? linked ?? random_seed()));
  let transcript = $state<Turn[]>(resumed?.transcript ?? []);
  let picks = $state<Pick[]>(resumed?.picks ?? []);
  let chosen_statement = $state<string | null>(null);
  let chosen_card = $state<string | null>(null);
  let draft = $state("");
  let error = $state<string | null>(null);
  const flash = new Flash(2400);
  let controller = $state.raw<AbortController | null>(null);
  let begun = $state(false);
  let reviewing = $state(false);
  let composer = $state<HTMLTextAreaElement | null>(null);
  let transcript_end = $state<HTMLElement | null>(null);

  const busy = $derived(controller !== null);
  const result = $derived(status(game, picks));
  const over = $derived(result !== Status.PLAYING);
  const questions = $derived(questions_in(transcript));
  const wrong = $derived(wrong_count(game, picks));
  const lie = $derived(over ? lie_of(game) : null);
  const tries_left = $derived(TRIES - picks.length);
  const case_number = $derived(String(game.seed % 10000).padStart(4, "0"));
  const statement_number = $derived(new Map(game.statements.map((statement, index) => [statement.id, index + 1])));
  const card_title = $derived(new Map(game.cards.map((card) => [card.id, card.title])));

  const status_line = $derived.by(() => {
    if (flash.text) return flash.text;
    if (result === Status.SOLVED) return `Caught: statement ${statement_number.get(lie!.statement.id)} breaks against the ${lie!.card.title.toLowerCase()}.`;
    if (result === Status.LOST) return `The lie was statement ${statement_number.get(lie!.statement.id)}, broken by the ${lie!.card.title.toLowerCase()}.`;
    if (chosen_statement && chosen_card) return "Accuse when you're sure.";
    return `Pick a statement and the evidence that breaks it. ${tries_left} ${tries_left === 1 ? "try" : "tries"} left.`;
  });

  const overlay = $derived.by(() => {
    if (over && !reviewing) {
      const detail = `${plural(questions, "question")} · ${plural(wrong, "wrong accusation")} · score ${score(questions, wrong)}`;
      return { title: result === Status.SOLVED ? "Case closed" : `${game.suspect.name} walks free`, detail, end: true };
    }
    if (!over && !begun && transcript.length === 0 && picks.length === 0)
      return { title: `Questioning ${game.suspect.name}`, detail: `Case ${case_number} · fewest questions wins`, end: false };
    return null;
  });

  function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function to_saved(): Saved {
    const turns = transcript.map(({ role, content, stopped }) => ({ role, content, ...(stopped ? { stopped } : {}) }));
    if (busy && turns.at(-1)?.role === "assistant") {
      const last = turns[turns.length - 1];
      if (last.content) last.stopped = true;
      else turns.splice(-2, 2);
    }
    return { seed: game.seed, transcript: turns, picks: picks.map((each) => ({ ...each })) };
  }

  // A linked case that hasn't been played yet leaves the saved one alone.
  function save() {
    if (transcript.length || picks.length) storage.set("case", to_saved());
  }
  onDestroy(save);

  $effect(() => () => controller?.abort());

  $effect(() => {
    const dispose = shortcuts.register({
      id: "alibi.new",
      keys: "f2",
      label: "New case",
      category: ShortcutCategory.APP,
      window: window_id,
      run: () => start_over(),
    });
    return () => dispose();
  });

  $effect(() =>
    over && reviewing
      ? win.on_back(() => {
          reviewing = false;
          return true;
        })
      : undefined
  );

  function begin() {
    begun = true;
    composer?.focus();
  }

  async function send() {
    const question = draft.trim();
    if (!question || busy || over) return;
    begun = true;
    draft = "";
    error = null;

    const earlier: AiMessage[] = transcript.map(({ role, content }) => ({ role, content }));
    transcript.push({ role: "user", content: question }, { role: "assistant", content: "" });
    const answer = transcript[transcript.length - 1];
    const own = new AbortController();
    controller = own;
    await tick();
    transcript_end?.scrollIntoView({ block: "nearest" });

    try {
      const stream = ai.prompt([{ role: "system", content: suspect_prompt(game) }, ...earlier, { role: "user", content: question }], {
        signal: own.signal,
      });
      for await (const chunk of stream) answer.content += chunk;
    } catch (reason) {
      if (own.signal.aborted) {
        answer.stopped = true;
        if (!answer.content && transcript.at(-1) === answer) transcript.splice(-2, 2);
      } else {
        error = error_message(reason);
        if (transcript.at(-1) === answer) transcript.splice(-2, 2);
        draft = draft || question;
      }
    } finally {
      if (controller === own) controller = null;
      save();
    }
  }

  function stop() {
    controller?.abort();
  }

  function accuse() {
    if (over || !chosen_statement || !chosen_card) return;
    const accusation = { statement: chosen_statement, card: chosen_card };
    picks.push(accusation);
    chosen_statement = null;
    chosen_card = null;
    if (!judge(game, accusation) && !over)
      flash.show(`The ${card_title.get(accusation.card)?.toLowerCase()} doesn't break statement ${statement_number.get(accusation.statement)}. ${tries_left} ${tries_left === 1 ? "try" : "tries"} left.`);
    if (over) controller?.abort();
    save();
  }

  async function start_over() {
    if (!over && (transcript.length > 0 || picks.length > 0)) {
      const confirmed = await win.confirm("Open a new case?", {
        detail: "This case and its transcript are lost.",
        confirm_label: "New case",
      });
      if (!confirmed) return;
    }
    controller?.abort();
    controller = null;
    storage.remove("case");
    game = new_case(random_seed());
    transcript = [];
    picks = [];
    chosen_statement = null;
    chosen_card = null;
    draft = "";
    error = null;
    flash.clear();
    begun = false;
    reviewing = false;
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    } else if (event.key === "Escape" && busy) {
      event.preventDefault();
      stop();
    }
  }
</script>

<AiGate
  features={[AiFeature.PROMPT]}
  icon={DetectiveIcon}
  title="Alibi isn't available on this device"
  download="The first question downloads Chrome's AI model once, a few GB. The suspect runs on this device after that, offline too."
>
  {#snippet children({ notice })}
    <div class="grid h-full grid-rows-[auto_auto_1fr_auto_auto]">
      <Toolbar>
        <span class="flex min-w-0 flex-1 items-baseline gap-2 px-1">
          <span class="truncate text-ui font-medium">{game.title}</span>
          <span class="hidden shrink-0 font-mono text-2xs text-foreground/65 tabular-nums @sm:inline">Case {case_number}</span>
        </span>
        <Button size="sm" variant="primary" onclick={() => start_over()}>New case</Button>
      </Toolbar>

      <div>{@render notice?.()}</div>

      <div class="min-h-0 overflow-auto @2xl:grid @2xl:grid-cols-2 @2xl:overflow-hidden">
        <section class="flex flex-col gap-4 p-3 @container @2xl:min-h-0 @2xl:overflow-auto" aria-label="Case file">
          <header class="flex flex-col gap-1">
            <p class="text-2xs tracking-[0.2em] text-foreground/65 uppercase">Case file</p>
            <p class="text-ui">{game.brief}</p>
            <p class="text-ui text-foreground/80">
              Suspect: <span class="font-medium text-foreground">{game.suspect.name}</span>, {game.suspect.role}.
            </p>
          </header>

          <div class="flex flex-col gap-1.5">
            <h2 class="text-2xs tracking-[0.2em] text-foreground/65 uppercase">Statements</h2>
            <ol class="flex flex-col gap-1" aria-label="Statements">
              {#each game.statements as statement, index (statement.id)}
                {@const is_lie = lie?.statement.id === statement.id}
                {@const tried = picks.some((each) => each.statement === statement.id && !judge(game, each))}
                <li>
                  <button
                    type="button"
                    aria-pressed={chosen_statement === statement.id}
                    disabled={over}
                    class={cn(
                      "flex min-h-9 w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-ui transition-[background-color,box-shadow,color] pointer-coarse:min-h-11",
                      "hover:bg-background-lighter hover:shadow-control active:shadow-pressed focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none disabled:hover:bg-transparent disabled:hover:shadow-none",
                      chosen_statement === statement.id && "bg-primary/12 ring-1 ring-primary/40 ring-inset hover:bg-primary/12",
                      is_lie && "bg-error/10"
                    )}
                    onclick={() => (chosen_statement = chosen_statement === statement.id ? null : statement.id)}
                  >
                    <span class="mt-px w-4 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
                    <span class="min-w-0 flex-1">{statement.claim}</span>
                    {#if is_lie}<Badge tone="error">Lie</Badge>{:else if tried}<Badge>Tried</Badge>{/if}
                  </button>
                </li>
              {/each}
            </ol>
          </div>

          <div class="flex flex-col gap-1.5">
            <h2 class="text-2xs tracking-[0.2em] text-foreground/65 uppercase">Evidence</h2>
            <ul class="grid grid-cols-1 gap-2 @sm:grid-cols-2" aria-label="Evidence">
              {#each game.cards as card (card.id)}
                {@const breaks = lie?.card.id === card.id}
                <li>
                  <button
                    type="button"
                    aria-pressed={chosen_card === card.id}
                    disabled={over}
                    class={cn(
                      "flex h-full min-h-11 w-full flex-col gap-0.5 rounded-lg bg-background-light px-3 py-2 text-left shadow-control ring-1 ring-hairline ring-inset transition-[background-color,box-shadow,translate] duration-150 active:translate-y-px active:shadow-pressed disabled:shadow-none",
                      "hover:bg-background-lighter focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none disabled:hover:bg-background-light",
                      chosen_card === card.id && "bg-primary/12 shadow-pressed ring-primary/40 hover:bg-primary/12",
                      breaks && "ring-error/40"
                    )}
                    onclick={() => (chosen_card = chosen_card === card.id ? null : card.id)}
                  >
                    <span class="flex items-center gap-2">
                      <span class="min-w-0 flex-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{card.title}</span>
                      {#if breaks}<Badge tone="error">Breaks it</Badge>{/if}
                    </span>
                    <span class="text-ui">{card.text}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <p class="min-w-0 flex-1 text-ui text-foreground/80" aria-live="polite">{status_line}</p>
              {#if !over}
                <Button variant="primary" disabled={!chosen_statement || !chosen_card} onclick={accuse}>
                  <ScalesIcon weight="bold" />Accuse
                </Button>
              {/if}
            </div>
            {#if over && lie}
              <p class="text-ui text-foreground/80">
                {game.suspect.name} was briefed: <span class="text-foreground">{lie.statement.claimed}</span>
                The truth: <span class="text-foreground">{lie.statement.truth}</span>
              </p>
            {/if}
          </div>
        </section>

        <section
          class="relative flex min-h-80 flex-col border-t border-hairline @2xl:min-h-0 @2xl:border-t-0 @2xl:border-l"
          aria-label="Interrogation"
        >
          <!-- column-reverse keeps the view pinned to the newest answer while it streams; mb-auto keeps a short transcript at the top. -->
          <div class="flex min-h-0 flex-1 flex-col-reverse @2xl:overflow-auto" aria-live="polite">
            <ol class="mb-auto flex w-full flex-col gap-3 p-3">
              {#if transcript.length === 0 && !error}
                <li class="grid min-h-40 place-items-center text-center">
                  <span>
                    <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">No questions yet</span>
                    <span class="mt-1 block text-ui text-foreground/65">Ask {game.suspect.name} about the statements, in your own words.</span>
                  </span>
                </li>
              {/if}
              {#each transcript as turn, index (index)}
                {#if turn.role === "user"}
                  <li class="max-w-[85%] self-end rounded-xl bg-primary/14 px-3 py-2 text-ui whitespace-pre-wrap">{turn.content}</li>
                {:else}
                  <li class="flex max-w-[92%] flex-col items-start gap-1 self-start">
                    <span class="px-1 text-2xs text-foreground/65">{game.suspect.name}</span>
                    <div class="min-w-0 max-w-full rounded-xl bg-background-light px-3 py-2 text-ui whitespace-pre-wrap">
                      {#if turn.content}{turn.content}{:else}<Spinner label="{game.suspect.name} is thinking" />{/if}
                    </div>
                    {#if turn.stopped}<span class="px-1 text-2xs text-foreground/65">Stopped</span>{/if}
                  </li>
                {/if}
              {/each}
              {#if error}
                <li role="alert" class="flex max-w-[92%] items-start gap-2 self-start rounded-xl bg-error/10 px-3 py-2 text-ui">
                  <WarningIcon weight="fill" class="mt-0.5 size-4 shrink-0 text-error" />
                  <span class="min-w-0">Couldn't get an answer: {error}</span>
                </li>
              {/if}
              <li bind:this={transcript_end} aria-hidden="true"></li>
            </ol>
          </div>

          {#if overlay}
            <BoardOverlay title={overlay.title} detail={overlay.detail}>
              {#if overlay.end}
                <Button size="sm" onclick={() => (reviewing = true)}>Transcript</Button>
                <Button size="sm" variant="primary" onclick={() => start_over()}>New case</Button>
              {:else}
                <Button size="sm" variant="primary" onclick={begin}>Start questioning</Button>
              {/if}
            </BoardOverlay>
          {/if}
        </section>
      </div>

      <div class="flex items-end gap-2 border-t border-hairline bg-background-light p-2">
        <Textarea
          bind:value={draft}
          bind:element={composer}
          rows={1}
          aria-label="Question"
          placeholder={over ? "The case is closed" : `Ask ${game.suspect.name} a question`}
          disabled={over}
          class="max-h-32 min-h-9 flex-1 resize-none field-sizing-content pointer-coarse:min-h-10"
          onkeydown={on_keydown}
        />
        {#if busy}
          <Button onclick={stop}><StopIcon weight="fill" /> Stop</Button>
        {:else}
          <Button variant="primary" aria-label="Ask" disabled={!draft.trim() || over} onclick={send}>
            <PaperPlaneRightIcon weight="fill" /> <span class="hidden @sm:inline">Ask</span>
          </Button>
        {/if}
      </div>

      <StatusBar>
        <span class="shrink-0 font-mono tabular-nums">{plural(questions, "question")}</span>
        <span class="shrink-0 font-mono tabular-nums">{wrong} wrong</span>
        <span class="shrink-0 font-mono tabular-nums">score {score(questions, wrong)}</span>
        <span class="hidden shrink-0 font-mono tabular-nums @md:inline">{over ? "closed" : `${tries_left} ${tries_left === 1 ? "try" : "tries"} left`}</span>
        <span class="hidden @2xl:inline pointer-coarse:hidden">Enter asks · Shift+Enter new line · Esc stops</span>
      </StatusBar>
    </div>
  {/snippet}
</AiGate>
