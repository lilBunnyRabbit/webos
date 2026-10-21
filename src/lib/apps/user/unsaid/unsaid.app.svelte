<script lang="ts">
  import kernel, { AiFeature, type AiService } from "$lib/core/api";
  import { RouteKind, route_url } from "$lib/core/api/services/router/route";
  import { get_app_context } from "$lib/core/contexts/app";
  import { AiGate } from "$kit/components/ai-gate";
  import { track_play } from "$kit/games";
  import { Badge, BoardOverlay, Button, CopyButton, Input, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import { random_seed } from "$lib/core/utils/random";
  import { ChatCircleSlash as ChatCircleSlashIcon, PaperPlaneRight as PaperPlaneRightIcon, SkipForward as SkipForwardIcon, Stop as StopIcon } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { CATEGORY_LABELS, type Card } from "./card";
  import {
    better_best,
    card_score,
    CardStatus,
    current,
    deal,
    give_clue,
    guess_messages,
    GuessesSchema,
    is_over,
    MAX_CLUE,
    next_card,
    pass,
    PASS_COST,
    round_score,
    ROUND_CARDS,
    wrong_guesses,
    type Round,
  } from "./round";
  import { is_hit, violations } from "./words";

  const { seed: seed_prop }: { seed?: number } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const ai = $derived(kernel.service<AiService>("ai"));
  track_play(app_id, () => win.is_visible);
  const best = storage.persisted("best", null as number | null, z.number().int().nonnegative().nullable());

  let deck = $state.raw<Card[] | null>(null);
  let round = $state.raw<Round | null>(null);
  let started = $state(false);
  let draft = $state("");
  let pending = $state<string | null>(null);
  let controller = $state.raw<AbortController | null>(null);
  let failure = $state<string | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let recorded = false;

  import("./cards").then((module) => {
    deck = module.CARDS;
    round = deal(untrack(() => seed_prop) ?? random_seed(), module.CARDS);
  });

  const play = $derived(round ? current(round) : null);
  const over = $derived(round !== null && is_over(round));
  const score = $derived(round ? round_score(round) : 0);
  const thinking = $derived(controller !== null);
  const blocked = $derived(play ? violations(draft, play.card.word, play.card.banned) : []);
  const wrong = $derived(play ? wrong_guesses(play) : []);
  const link = $derived(round ? route_url({ kind: RouteKind.SOLO, id: app_id, props: { seed: round.seed } }) : "");

  const status = $derived.by(() => {
    if (!round || !started) return "Describe the word without saying it or any banned word.";
    if (over) return "";
    if (failure) return failure;
    if (!play) return "";
    if (thinking) return "Thinking…";
    if (play.status === CardStatus.GUESSED) return `Guessed after ${clues(play.clues.length)}`;
    if (play.status === CardStatus.PASSED) return `Passed. The word was ${play.card.word}`;
    if (play.clues.length === 0) return "Give a first clue.";
    return "Not yet. Add another clue.";
  });

  function points(count: number): string {
    return `${count} ${count === 1 ? "point" : "points"}`;
  }

  function clues(count: number): string {
    return `${count} ${count === 1 ? "clue" : "clues"}`;
  }

  $effect(() => {
    if (win.is_focused && started && input && !over) input.focus({ preventScroll: true });
  });

  onDestroy(() => controller?.abort());

  function start() {
    started = true;
    queueMicrotask(() => input?.focus());
  }

  async function send(event?: SubmitEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!round || !play || play.status !== CardStatus.PLAYING || thinking || !text || blocked.length) return;
    const asked = round;
    const own = new AbortController();
    controller = own;
    pending = text;
    failure = null;
    try {
      const messages = guess_messages([...play.clues.map((clue) => clue.text), text], wrong);
      const result = await ai.extract(messages, GuessesSchema, { signal: own.signal });
      if (round !== asked) return;
      round = give_clue(round, text, result.guesses);
      draft = "";
    } catch (reason) {
      if (!own.signal.aborted) failure = `The AI couldn't answer: ${error_message(reason)}`;
    } finally {
      if (controller === own) controller = null;
      pending = null;
    }
  }

  function stop() {
    controller?.abort();
    controller = null;
  }

  function skip() {
    if (!round || !play || play.status !== CardStatus.PLAYING) return;
    stop();
    failure = null;
    round = pass(round);
  }

  function advance() {
    if (!round) return;
    round = next_card(round);
    draft = "";
    failure = null;
    if (is_over(round) && !recorded) {
      recorded = true;
      best.value = better_best(best.value, round_score(round));
    } else {
      queueMicrotask(() => input?.focus());
    }
  }

  async function new_round() {
    if (!deck) return;
    const in_play = started && round && !over && round.cards.some((each) => each.clues.length || each.status !== CardStatus.PLAYING);
    if (in_play) {
      const confirmed = await win.confirm("Start a new round?", {
        detail: "This round's cards and clues are lost and it doesn't count.",
        confirm_label: "New round",
      });
      if (!confirmed) return;
    }
    stop();
    round = deal(random_seed(), deck);
    recorded = false;
    draft = "";
    failure = null;
    start();
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && thinking) {
      event.preventDefault();
      stop();
    }
  }
</script>

{#snippet marked(text: string)}
  {@const found = violations(text, play!.card.word, play!.card.banned)}
  {#each found as token, index (index)}{text.slice(index === 0 ? 0 : found[index - 1].end, token.start)}<mark class="rounded-sm bg-error/20 px-0.5 text-error">{text.slice(token.start, token.end)}</mark>{/each}{text.slice(found.at(-1)?.end ?? 0)}
{/snippet}

<AiGate
  features={[AiFeature.PROMPT]}
  icon={ChatCircleSlashIcon}
  title="Unsaid isn't available on this device"
  download="The first clue downloads Chrome's AI model once, a few GB. It runs on this device after that, offline too."
>
  {#snippet children({ notice })}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid h-full grid-rows-[auto_auto_1fr_auto]" onkeydown={on_keydown}>
      <Toolbar>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">
          {#if round && started && !over}Card {round.index + 1} of {ROUND_CARDS}{:else}Unsaid{/if}
        </span>
        <Button size="sm" variant="quiet" aria-label="Pass, costs {PASS_COST} points" disabled={!started || !play || play.status !== CardStatus.PLAYING} onclick={skip}>
          <SkipForwardIcon weight="bold" /> <span class="hidden @sm:inline">Pass</span>
        </Button>
        <Button size="sm" variant="primary" disabled={!deck} onclick={new_round}>New round</Button>
      </Toolbar>

      <div>{@render notice?.()}</div>

      <div class="min-h-0 overflow-auto">
        <div class="mx-auto flex w-full max-w-xl flex-col gap-3 p-3">
          {#if !round}
            <div class="grid min-h-48 place-items-center"><Spinner label="Shuffling cards" /></div>
          {:else}
            {@const shown = play ?? round.cards.at(-1)!}
            <section class="relative min-h-48 rounded-lg bg-background-light p-4 ring-1 ring-foreground/8" aria-label="Card">
              <div class={cn(!started && "invisible")}>
              <div class="flex items-start justify-between gap-2">
                <Badge>{CATEGORY_LABELS[shown.card.category]}</Badge>
                {#if shown.status === CardStatus.GUESSED}<Badge tone="success">Guessed</Badge>{/if}
                {#if shown.status === CardStatus.PASSED}<Badge tone="warning">Passed</Badge>{/if}
              </div>
              <p class="mt-3 text-center text-2xl font-semibold tracking-wide break-words @md:text-3xl">{shown.card.word}</p>
              <p class="mt-4 text-center text-2xs tracking-wide text-foreground/65 uppercase">Don't say</p>
              <ul class="mt-2 flex flex-wrap justify-center gap-1.5" aria-label="Banned words">
                {#each shown.card.banned as word (word)}
                  <li class="rounded-md bg-error/10 px-2 py-1 text-ui text-error">{word}</li>
                {/each}
              </ul>
              </div>

              {#if !started}
                <BoardOverlay title="Unsaid" detail="{ROUND_CARDS} cards · 1 point a clue · pass +{PASS_COST} · lowest wins">
                  <Button size="sm" variant="primary" onclick={start}>Start</Button>
                </BoardOverlay>
              {:else if over}
                <BoardOverlay title="Round over" detail="{points(score)}{best.value !== null ? ` · best ${best.value}` : ''}">
                  <CopyButton text={link} label="Copy a link to these cards" />
                  <Button size="sm" variant="primary" onclick={new_round}>Play again</Button>
                </BoardOverlay>
              {/if}
            </section>

            {#if started && over}
              <ol class="flex flex-col rounded-lg bg-background-light ring-1 ring-foreground/8" aria-label="Round">
                {#each round.cards as each, index (index)}
                  <li class="flex items-center gap-3 border-b border-foreground/8 px-3 py-2 last:border-b-0">
                    <span class="min-w-0 flex-1 truncate text-ui font-medium">{each.card.word}</span>
                    <span class="text-2xs text-foreground/65">
                      {#if each.status !== CardStatus.PASSED}{clues(each.clues.length)}{:else if each.clues.length}passed after {clues(each.clues.length)}{:else}passed{/if}
                    </span>
                    <span class="w-8 text-right font-mono text-ui tabular-nums">{card_score(each)}</span>
                  </li>
                {/each}
              </ol>
            {:else if started && play}
              <ol class="flex flex-col gap-2" aria-label="Clues">
                {#each play.clues as clue, index (index)}
                  <li class="rounded-lg bg-background-light px-3 py-2 ring-1 ring-foreground/8">
                    <p class="text-ui"><span class="mr-1.5 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>{clue.text}</p>
                    <ul class="mt-1.5 flex flex-wrap gap-1.5" aria-label="Guesses">
                      {#each clue.guesses as guess, rank (rank)}
                        {@const hit = play.status === CardStatus.GUESSED && index === play.clues.length - 1 && is_hit(guess, play.card.word)}
                        <li class={cn("rounded-md px-2 py-0.5 text-ui", hit ? "bg-success/15 font-medium text-success" : "bg-foreground/6 text-foreground/80")}>{guess}</li>
                      {/each}
                    </ul>
                  </li>
                {/each}
                {#if pending}
                  <li class="flex items-center gap-2 rounded-lg bg-background-light px-3 py-2 ring-1 ring-foreground/8">
                    <span class="min-w-0 flex-1 text-ui"><span class="mr-1.5 font-mono text-2xs text-foreground/65 tabular-nums">{play.clues.length + 1}</span>{pending}</span>
                    <Spinner label="Guessing" />
                  </li>
                {/if}
              </ol>

              {#if play.status === CardStatus.PLAYING}
                <form class="flex flex-col gap-2" onsubmit={send}>
                  <div class="flex gap-2">
                    <Input
                      bind:element={input}
                      bind:value={draft}
                      class="min-w-0 flex-1 pointer-coarse:h-11"
                      placeholder="Your clue"
                      aria-label="Clue"
                      aria-invalid={blocked.length > 0}
                      maxlength={MAX_CLUE}
                      autocomplete="off"
                      enterkeyhint="send"
                    />
                    {#if thinking}
                      <Button variant="secondary" class="pointer-coarse:h-11" onclick={stop}><StopIcon weight="bold" />Stop</Button>
                    {:else}
                      <Button type="submit" variant="primary" class="pointer-coarse:h-11" disabled={!draft.trim() || blocked.length > 0}>
                        <PaperPlaneRightIcon weight="bold" />Send
                      </Button>
                    {/if}
                  </div>
                  {#if blocked.length}
                    <p role="alert" class="rounded-md bg-error/10 px-3 py-2 text-ui">
                      <span class="font-medium text-error">Can't say {[...new Set(blocked.map((token) => token.banned))].join(", ")}:</span>
                      {@render marked(draft)}
                    </p>
                  {/if}
                </form>
              {:else}
                <Button variant="primary" class="self-center pointer-coarse:h-11" onclick={advance}>{round.index === ROUND_CARDS - 1 ? "See the score" : "Next card"}</Button>
              {/if}
            {/if}

            <p class="min-h-5 text-center text-ui" aria-live="polite">{status}</p>
          {/if}
        </div>
      </div>

      <StatusBar>
        {#if round && started}
          <span class="shrink-0 font-mono tabular-nums">{over ? "Done" : `${round.index + 1}/${ROUND_CARDS}`}</span>
          <span class="shrink-0 font-mono tabular-nums">{points(score)}</span>
          {#if wrong.length && !over}<span class="hidden min-w-0 truncate @md:inline">Ruled out: {wrong.join(", ")}</span>{/if}
        {/if}
        <span class="ml-auto shrink-0 font-mono tabular-nums">Best {best.value ?? "–"}</span>
      </StatusBar>
    </div>
  {/snippet}
</AiGate>
