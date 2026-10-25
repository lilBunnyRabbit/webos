<script lang="ts">
  import { Stopwatch } from "$kit/games";
  import { Badge, Button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import { TIER_NAMES } from "./atlas";
  import ChannelSlider from "./channel-slider.svelte";
  import {
    band,
    channel_track,
    COLLECT_DELTA,
    format_score,
    format_value,
    guess_hex,
    play_channels,
    round_delta,
    round_score,
    ROUND_MAX,
    ROUNDS,
    share_text,
    slider_step,
    target_coords,
    total_score,
    type Round,
    type RunState,
  } from "./game";
  import ShareCard from "./share-card.svelte";

  interface NextAction {
    label: string;
    run: () => void;
  }

  interface Props {
    rounds: Round[];
    daily: boolean;
    head: string;
    link: string;
    saved: RunState | null;
    collected: ReadonlySet<string>;
    onsave: (state: RunState) => void;
    onround: (model_id: string, delta: number) => void;
    onfinish: (ms: number, score: number) => void;
    next: NextAction;
  }

  let { rounds, daily, head, link, saved, collected, onsave, onround, onfinish, next }: Props = $props();

  const Phase = { PLAY: "play", REVEAL: "reveal", DONE: "done" } as const;
  type Phase = (typeof Phase)[keyof typeof Phase];

  const { window: win } = get_app_context();
  const initial = untrack(() => ({ saved, rounds, collected: new Set(collected) }));
  const clock = new Stopwatch(() => win.is_visible, initial.saved?.ms ?? 0);

  const initial_guesses = initial.saved?.guesses.filter((guess, index) => guess.length === initial.rounds[index]?.start.length) ?? [];
  const initial_phase = initial_guesses.length >= ROUNDS ? Phase.DONE : Phase.PLAY;
  let guesses = $state<number[][]>(initial_guesses);
  let phase = $state<Phase>(initial_phase);
  let coords = $state<number[]>(initial.rounds[Math.min(initial_guesses.length, ROUNDS - 1)].start.slice());
  let root = $state<HTMLDivElement>();

  const current = $derived(Math.min(guesses.length, ROUNDS - 1));
  const round = $derived(rounds[current]);
  const channels = $derived(play_channels(round.model.model));
  const shown_hex = $derived(guess_hex(round.model.model, coords));
  const deltas = $derived(guesses.map((guess, index) => round_delta(rounds[index].target, rounds[index].model.model, guess)));
  const scores = $derived(deltas.map(round_score));
  const total = $derived(total_score(scores));
  const last = $derived(guesses.length - 1);

  if (initial_phase === Phase.PLAY) clock.start();

  function submit() {
    if (phase !== Phase.PLAY) return;
    const played = round;
    guesses = [...guesses, coords.slice()];
    onround(played.model.id, round_delta(played.target, played.model.model, coords));
    phase = Phase.REVEAL;
    if (guesses.length === ROUNDS) onfinish(clock.pause(), total);
    onsave({ guesses: guesses.map((guess) => guess.slice()), ms: clock.read() });
  }

  function after_reveal() {
    if (phase !== Phase.REVEAL) return;
    if (guesses.length >= ROUNDS) {
      phase = Phase.DONE;
      return;
    }
    coords = rounds[guesses.length].start.slice();
    phase = Phase.PLAY;
  }

  function set_channel(index: number, value: number) {
    coords[index] = value;
  }

  $effect(() => {
    if (phase === Phase.PLAY) root?.querySelector<HTMLInputElement>("input[type=range]")?.focus({ preventScroll: true });
    else if (win.is_focused && !root?.contains(document.activeElement)) root?.focus({ preventScroll: true });
  });

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.defaultPrevented || (event.target as HTMLElement).closest("button")) return;
    const action = { [Phase.PLAY]: submit, [Phase.REVEAL]: after_reveal, [Phase.DONE]: null }[phase];
    if (!action) return;
    event.preventDefault();
    action();
  }
</script>

{#snippet pair(target: string, guess: string | null, size: "lg" | "sm")}
  <div class="grid grid-cols-2 overflow-hidden ring-1 ring-foreground/10 {size === 'lg' ? 'min-h-28 flex-1 rounded-2xl' : 'h-9 rounded-lg'}">
    <div style:background-color={target} role="img" aria-label="Target, {target}"></div>
    <div style:background-color={guess ?? "transparent"} role="img" aria-label="Yours, {guess ?? 'no sRGB colour'}"></div>
  </div>
{/snippet}

{#snippet values(label: string, names: readonly string[], list: readonly number[] | null)}
  <div class="flex min-w-0 flex-col gap-0.5">
    <span class="text-2xs text-foreground/65">{label}</span>
    <span class="truncate font-mono text-2xs tabular-nums">
      {#if list}
        {#each names as name, index (name)}<span class="mr-2">{name} {format_value(list[index])}</span>{/each}
      {:else}
        —
      {/if}
    </span>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  class="flex h-full min-h-0 flex-col outline-none"
  tabindex="-1"
  role="application"
  aria-label="Colour Atlas: match the target with this model's sliders. Enter submits"
  onkeydown={on_keydown}
>
  {#if phase === Phase.PLAY}
    <div class="grid min-h-0 flex-1 grid-rows-[minmax(7rem,1fr)_auto] gap-3 overflow-auto p-3 @xl:grid-cols-[1fr_minmax(17rem,24rem)] @xl:grid-rows-1 @xl:p-4">
      <div class="flex min-h-0 flex-col gap-1.5">
        {@render pair(round.target, shown_hex, "lg")}
        <div class="grid grid-cols-2 text-2xs text-foreground/65">
          <span>Target</span>
          <span class="text-right">Yours</span>
        </div>
      </div>
      <div class="flex flex-col gap-3 @xl:justify-center">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2">
          <span class="text-ui font-semibold">{round.model.name}</span>
          <span class="text-2xs text-foreground/65">Round {current + 1} of {ROUNDS} · {TIER_NAMES[round.model.tier]}</span>
        </div>
        {#each channels as channel, index (channel.name)}
          <ChannelSlider
            label={channel.name}
            min={channel.min}
            max={channel.max}
            step={slider_step(channel)}
            value={coords[index]}
            track={channel_track(round.model.model, coords, index, channel)}
            shown={format_value(coords[index])}
            oninput={(value) => set_channel(index, value)}
          />
        {/each}
        <Button variant="primary" class="mt-1 h-11" onclick={submit}>Submit</Button>
      </div>
    </div>
  {:else if phase === Phase.REVEAL}
    {@const shown = rounds[last]}
    {@const names = play_channels(shown.model.model).map((channel) => channel.name)}
    {@const first =
      deltas[last] < COLLECT_DELTA &&
      !initial.collected.has(shown.model.id) &&
      !rounds.slice(0, last).some((earlier, index) => earlier.model.id === shown.model.id && deltas[index] < COLLECT_DELTA)}
    <div class="m-auto flex min-h-0 w-full max-w-md flex-col gap-4 overflow-auto p-4">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-ui font-semibold">{shown.model.name}</span>
        {#if first}
          <Badge tone="success">Collected</Badge>
        {:else if deltas[last] < COLLECT_DELTA}
          <Badge>In your atlas</Badge>
        {/if}
      </div>
      <div class="flex h-36">{@render pair(shown.target, guess_hex(shown.model.model, guesses[last]), "lg")}</div>
      <div class="grid grid-cols-2 gap-3">
        {@render values("Target", names, target_coords(shown.target, shown.model.model))}
        {@render values("Yours", names, guesses[last])}
      </div>
      <p class="text-center">
        <span class="font-mono text-3xl font-semibold tabular-nums">{format_score(scores[last])}</span>
        <span class="font-mono text-ui text-foreground/65">/ {ROUND_MAX}</span>
        <span class="block text-2xs text-foreground/65">ΔE2000 {deltas[last].toFixed(2)}{deltas[last] < COLLECT_DELTA ? "" : ` · under ${COLLECT_DELTA} collects`}</span>
      </p>
      <Button variant="primary" class="h-11" onclick={after_reveal}>{guesses.length >= ROUNDS ? "See your score" : "Next round"}</Button>
    </div>
  {:else}
    <div class="mx-auto flex min-h-0 w-full max-w-md flex-col items-center gap-4 overflow-auto p-4">
      <p class="text-center" aria-live="polite">
        <span class="block text-2xs tracking-[0.2em] text-foreground/65 uppercase">{daily ? "Today's run" : "Practice run"}</span>
        <span class="font-mono text-4xl font-semibold tabular-nums">{format_score(total)}</span>
        <span class="font-mono text-base text-foreground/65">/ {ROUNDS * ROUND_MAX}</span>
      </p>
      <ol class="flex w-full flex-col gap-2">
        {#each guesses as guess, index (index)}
          <li class="grid grid-cols-[1fr_auto] items-center gap-3">
            <div class="min-w-0">
              <div class="mb-0.5 flex justify-between gap-2 text-2xs">
                <span class="truncate font-medium">{rounds[index].model.name}</span>
                <span class="shrink-0 font-mono text-foreground/65">ΔE {deltas[index].toFixed(1)}</span>
              </div>
              {@render pair(rounds[index].target, guess_hex(rounds[index].model.model, guess), "sm")}
            </div>
            <span class="w-16 text-right font-mono text-ui tabular-nums">
              <span aria-hidden="true">{band(scores[index])}</span>
              {format_score(scores[index])}
            </span>
          </li>
        {/each}
      </ol>
      <ShareCard text={share_text(head, scores, link)} {next} />
    </div>
  {/if}
</div>
