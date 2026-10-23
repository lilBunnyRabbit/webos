<script lang="ts">
  import { Stopwatch } from "$kit/games";
  import { Button, Segmented } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { z } from "zod";
  import ChannelSlider from "./channel-slider.svelte";
  import { hex_hsb, hex_lch, hsb_hex, hsb_tracks, lch_hex, lch_tracks, OKLCH_MAX_CHROMA, Space, type Hsb, type Lch } from "./color";
  import { Level } from "./modes";
  import { MEMORISE_MS, recall_rounds, round_score, ROUNDS, ROUND_MAX, total_score, type RecallState } from "./recall";
  import type { RunProps } from "./run";
  import ShareCard from "./share-card.svelte";
  import { band, format_score, recall_share } from "./share";

  let { seed, level, daily, head, link, saved, onsave, onfinish, next }: RunProps<RecallState> = $props();

  const Phase = { READY: "ready", MEMORISE: "memorise", GUESS: "guess", REVEAL: "reveal", DONE: "done" } as const;
  type Phase = (typeof Phase)[keyof typeof Phase];

  const SPACE_OPTIONS = [
    { value: Space.HSB, label: "HSB" },
    { value: Space.OKLCH, label: "OKLCH" },
  ];

  const { window: win, storage } = get_app_context();
  const space = storage.persisted<Space>("space", Space.HSB, z.enum(Space));

  const initial = untrack(() => ({ seed, saved, level }));
  const rounds = recall_rounds(initial.seed);
  const memorise_ms = MEMORISE_MS[initial.level];
  const clock = new Stopwatch(() => win.is_visible, initial.saved?.ms ?? 0);

  const initial_guesses = initial.saved?.guesses ?? [];
  const initial_phase = initial_guesses.length >= ROUNDS ? Phase.DONE : initial.saved?.shown ? Phase.GUESS : Phase.READY;
  let guesses = $state<string[]>(initial_guesses);
  let phase = $state<Phase>(initial_phase);
  let hsb = $state<Hsb>({ h: 0, s: 0, b: 0 });
  let lch = $state<Lch>({ l: 0, c: 0, h: 0 });
  let root = $state<HTMLDivElement>();
  let first_slider = $state<HTMLInputElement>();

  const current = $derived(Math.min(guesses.length, ROUNDS - 1));
  const guess_hex = $derived(space.value === Space.HSB ? hsb_hex(hsb) : lch_hex(lch));
  const tracks = $derived(space.value === Space.HSB ? hsb_tracks(hsb) : lch_tracks(lch));
  const scores = $derived(guesses.map((guess, index) => round_score(rounds[index].hex, guess)));
  const total = $derived(total_score(scores));
  const last = $derived(guesses.length - 1);

  if (initial_phase === Phase.GUESS) {
    start_sliders(initial_guesses.length);
    clock.start();
  }

  function start_sliders(index: number) {
    const start = rounds[index].start;
    hsb = { ...start };
    lch = round_lch(hex_lch(hsb_hex(start)));
  }

  function round_lch(value: Lch): Lch {
    return { l: Math.round(value.l * 2) / 2, c: Math.round(value.c * 200) / 200, h: Math.round(value.h) };
  }

  function set_space(next_space: Space) {
    if (next_space === space.value) return;
    const hex = guess_hex;
    if (next_space === Space.OKLCH) lch = round_lch(hex_lch(hex));
    else {
      const value = hex_hsb(hex);
      hsb = { h: Math.round(value.h), s: Math.round(value.s), b: Math.round(value.b) };
    }
    space.value = next_space;
  }

  function save(shown: boolean) {
    onsave({ guesses: [...guesses], shown, ms: clock.read() });
  }

  function memorise() {
    phase = Phase.MEMORISE;
    if (!clock.running) clock.start();
    save(true);
  }

  $effect(() => {
    if (phase !== Phase.MEMORISE) return;
    const timer = setTimeout(guess, memorise_ms);
    return () => clearTimeout(timer);
  });

  function guess() {
    if (phase !== Phase.MEMORISE) return;
    start_sliders(current);
    phase = Phase.GUESS;
  }

  function lock_in() {
    if (phase !== Phase.GUESS) return;
    guesses = [...guesses, guess_hex];
    phase = Phase.REVEAL;
    if (guesses.length === ROUNDS) {
      const ms = clock.pause();
      onfinish(ms, total);
    }
    save(false);
  }

  function after_reveal() {
    if (phase !== Phase.REVEAL) return;
    if (guesses.length >= ROUNDS) phase = Phase.DONE;
    else memorise();
  }

  $effect(() => {
    if (phase === Phase.GUESS) first_slider?.focus({ preventScroll: true });
    else if (win.is_focused && !root?.contains(document.activeElement)) root?.focus({ preventScroll: true });
  });

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.defaultPrevented || (event.target as HTMLElement).closest("button")) return;
    const action = { [Phase.READY]: memorise, [Phase.MEMORISE]: guess, [Phase.GUESS]: lock_in, [Phase.REVEAL]: after_reveal, [Phase.DONE]: null }[phase];
    if (!action) return;
    event.preventDefault();
    action();
  }

  const format_hsb = (value: Hsb) => [`${Math.round(value.h)}°`, `${Math.round(value.s)}%`, `${Math.round(value.b)}%`];
  const format_lch = (value: Lch) => [`${value.l.toFixed(1)}%`, value.c.toFixed(3), `${Math.round(value.h)}°`];
</script>

{#snippet pair(target: string, guess: string, size: "lg" | "sm")}
  <div class={cn("grid grid-cols-2 overflow-hidden ring-1 ring-hairline", size === "lg" ? "rounded-2xl" : "rounded-lg")}>
    <div style:background-color={target} class={size === "lg" ? "min-h-32" : "h-10"}></div>
    <div style:background-color={guess} class={size === "lg" ? "min-h-32" : "h-10"}></div>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  class="flex h-full min-h-0 flex-col outline-none"
  tabindex="-1"
  role="application"
  aria-label="Recall: memorise each colour, then rebuild it with the sliders. Enter moves on"
  onkeydown={on_keydown}
>
  {#if phase === Phase.READY}
    <div class="m-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
      <div class="grid grid-cols-5 gap-1.5" aria-hidden="true">
        {#each { length: ROUNDS }, index (index)}
          <span class={cn("size-6 rounded-md ring-1 ring-hairline-strong ring-inset", index < guesses.length ? "bg-foreground/40 shadow-control" : "bg-field shadow-recessed")}></span>
        {/each}
      </div>
      <div>
        <h2 class="text-lg font-semibold">{guesses.length ? `Colour ${guesses.length + 1} of ${ROUNDS}` : "Five colours"}</h2>
        <p class="mt-1 text-ui text-foreground/65">
          Each one shows for {memorise_ms / 1000} seconds. Then rebuild it from memory with the sliders.
          {daily ? "One attempt for today's daily." : ""}
        </p>
      </div>
      <Button variant="primary" size="lg" onclick={memorise}>Show the {guesses.length ? "next" : "first"} colour</Button>
    </div>
  {:else if phase === Phase.MEMORISE}
    <div class="relative min-h-0 flex-1" style:background-color={rounds[current].hex} aria-label="Colour {current + 1} of {ROUNDS}. Memorise it" role="img">
      <div class="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
        <span class="rounded-full bg-background/85 px-3 py-1 text-ui font-medium shadow-raised">Colour {current + 1} of {ROUNDS}</span>
        <Button size="sm" class="shadow-raised" onclick={guess}>I'm ready</Button>
      </div>
      <div class="absolute inset-x-0 bottom-0 h-1.5 bg-background/40">
        <div class="countdown h-full bg-foreground" style:animation-duration="{memorise_ms}ms"></div>
      </div>
    </div>
  {:else if phase === Phase.GUESS}
    <div class="grid min-h-0 flex-1 grid-rows-[minmax(6rem,1fr)_auto] gap-3 overflow-auto p-3 @xl:grid-cols-[1fr_minmax(16rem,22rem)] @xl:grid-rows-1 @xl:p-4">
      <div class="min-h-24 rounded-2xl ring-1 ring-hairline" style:background-color={guess_hex} role="img" aria-label="Your colour, {guess_hex}"></div>
      <div class="flex flex-col gap-2 @xl:justify-center">
        <div class="flex items-center justify-between gap-2">
          <span class="text-ui font-medium">Colour {current + 1} of {ROUNDS}</span>
          <Segmented size="sm" label="Slider colour space" options={SPACE_OPTIONS} bind:value={() => space.value, set_space} />
        </div>
        {#if space.value === Space.HSB}
          {@const shown = format_hsb(hsb)}
          <ChannelSlider label="Hue" min={0} max={359} step={1} bind:value={hsb.h} track={tracks[0]} shown={shown[0]} bind:element={first_slider} />
          <ChannelSlider label="Saturation" min={0} max={100} step={1} bind:value={hsb.s} track={tracks[1]} shown={shown[1]} />
          <ChannelSlider label="Brightness" min={0} max={100} step={1} bind:value={hsb.b} track={tracks[2]} shown={shown[2]} />
        {:else}
          {@const shown = format_lch(lch)}
          <ChannelSlider label="Lightness" min={0} max={100} step={0.5} bind:value={lch.l} track={tracks[0]} shown={shown[0]} bind:element={first_slider} />
          <ChannelSlider label="Chroma" min={0} max={OKLCH_MAX_CHROMA} step={0.005} bind:value={lch.c} track={tracks[1]} shown={shown[1]} />
          <ChannelSlider label="Hue" min={0} max={359} step={1} bind:value={lch.h} track={tracks[2]} shown={shown[2]} />
        {/if}
        <Button variant="primary" class="mt-1 h-11" onclick={lock_in}>Lock in</Button>
      </div>
    </div>
  {:else if phase === Phase.REVEAL}
    <div class="m-auto flex w-full max-w-md flex-col gap-4 p-4">
      {@render pair(rounds[last].hex, guesses[last], "lg")}
      <div class="grid grid-cols-2 text-2xs text-foreground/65">
        <span>Target <span class="font-mono">{rounds[last].hex}</span></span>
        <span class="text-right">Yours <span class="font-mono">{guesses[last]}</span></span>
      </div>
      <p class="text-center">
        <span class="font-mono text-3xl font-semibold tabular-nums">{format_score(scores[last])}</span>
        <span class="font-mono text-ui text-foreground/65">/ {ROUND_MAX}</span>
      </p>
      <Button variant="primary" class="h-11" onclick={after_reveal}>{guesses.length >= ROUNDS ? "See your score" : "Next colour"}</Button>
    </div>
  {:else}
    <div class="mx-auto flex w-full max-w-md flex-col items-center gap-4 overflow-auto p-4">
      <p class="text-center" aria-live="polite">
        <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">{daily ? "Today's recall" : "Recall"}{level === Level.HARD ? " · Hard" : ""}</span>
        <span class="font-mono text-4xl font-semibold tabular-nums">{format_score(total)}</span>
        <span class="font-mono text-base text-foreground/65">/ {ROUNDS * ROUND_MAX}</span>
      </p>
      <ol class="flex w-full flex-col gap-2">
        {#each guesses as guess, index (index)}
          <li class="grid grid-cols-[1.25rem_1fr_auto] items-center gap-3">
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
            <div>
              {@render pair(rounds[index].hex, guess, "sm")}
              <div class="mt-0.5 flex justify-between font-mono text-2xs text-foreground/65"><span>{rounds[index].hex}</span><span>{guess}</span></div>
            </div>
            <span class="w-16 text-right font-mono text-ui tabular-nums" title="Score out of {ROUND_MAX}">
              <span aria-hidden="true">{band(scores[index])}</span>
              {format_score(scores[index])}
            </span>
          </li>
        {/each}
      </ol>
      <ShareCard text={recall_share(head, scores, link)} {next} />
    </div>
  {/if}
</div>

<style>
  .countdown {
    animation-name: countdown;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes countdown {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }
</style>
