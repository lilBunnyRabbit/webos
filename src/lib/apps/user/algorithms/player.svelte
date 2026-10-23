<script lang="ts">
  import kernel, { ShortcutCategory, type ShortcutsService } from "$lib/core/api";
  import { Button, IconButton, Select, Slider } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import {
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SkipBack as SkipBackIcon,
    SkipForward as SkipForwardIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import type { Recording } from "./engine/definition";
  import type { View as StepView } from "./engine/step";
  import View from "./views/view.svelte";
  import { step_tones, TONE_BG, TONE_LABEL } from "./views/tones";

  let {
    recording,
    pseudocode,
    start = 0,
    autoplay = false,
    stage_override,
  }: {
    recording: Recording<unknown>;
    pseudocode: string[];
    start?: number;
    autoplay?: boolean;
    stage_override?: Snippet;
  } = $props();

  const { window_id } = get_app_context();
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const SPEEDS = ["0.5", "1", "2", "4", "8", "16", "64"] as const;
  type Speed = (typeof SPEEDS)[number];
  const SPEED_OPTIONS = SPEEDS.map((speed) => ({ value: speed, label: `${speed}×` }));

  let index = $state(0);
  let playing = $state(false);
  let speed = $state<Speed>("2");

  const steps = $derived(recording.steps);
  const last = $derived(Math.max(0, steps.length - 1));
  const step = $derived(steps[Math.min(index, last)]);
  const tones = $derived(step_tones(step));

  $effect(() => {
    void recording;
    untrack(() => {
      index = Math.min(start, Math.max(0, recording.steps.length - 1));
      playing = autoplay && index < recording.steps.length - 1;
    });
  });

  $effect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      if (index >= last) playing = false;
      else index++;
    }, 1000 / (2 * Number(speed)));
    return () => clearInterval(timer);
  });

  function toggle() {
    if (index >= last) index = 0;
    playing = !playing;
  }

  function go(target: number) {
    playing = false;
    index = Math.max(0, Math.min(last, target));
  }

  const typing = () => {
    const active = document.activeElement;
    return active instanceof HTMLElement && (active.matches("input, textarea, select") || active.isContentEditable);
  };

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `algorithms.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run, when: () => !typing() });
    const disposers = [
      scoped("play", "space", "Play or pause", toggle),
      scoped("back", "left", "Step back", () => go(index - 1)),
      scoped("forward", "right", "Step forward", () => go(index + 1)),
      scoped("start", "home", "First step", () => go(0)),
      scoped("end", "end", "Last step", () => go(last)),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  const flexible = (view: StepView) => view.kind === "bars" || view.kind === "tree" || view.kind === "graph" || view.kind === "points" || view.kind === "ring";
  const counter_label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
</script>

<div class="grid min-h-0 gap-3 @4xl:h-full @4xl:grid-cols-[minmax(0,1fr)_19rem] @4xl:grid-rows-[minmax(0,1fr)]">
  <section class="flex min-h-0 min-w-0 flex-col gap-2" aria-label="Visualisation">
    <div class="flex min-h-[22rem] flex-col gap-3 rounded-xl bg-background-light/60 p-3 ring-1 ring-hairline @4xl:min-h-0 @4xl:flex-1 @4xl:overflow-hidden">
      {#if stage_override}
        {@render stage_override()}
      {:else if step}
        {#each step.views as view, n (n)}
          <figure class={cn("flex min-h-0 min-w-0 flex-col gap-1.5", flexible(view) ? "min-h-64 flex-1 basis-0 @4xl:min-h-0" : "shrink-0")}>
            {#if view.title}
              <figcaption class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{view.title}</figcaption>
            {/if}
            <div class={cn("min-h-0 min-w-0", flexible(view) && "flex-1")}>
              <View {view} />
            </div>
          </figure>
        {/each}
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Playback">
      <IconButton label="First step" size="sm" disabled={index === 0} onclick={() => go(0)}><SkipBackIcon weight="bold" /></IconButton>
      <IconButton label="Step back" size="sm" disabled={index === 0} onclick={() => go(index - 1)}><CaretLeftIcon weight="bold" /></IconButton>
      <Button variant="primary" size="sm" class="w-20" onclick={toggle} disabled={steps.length < 2}>
        {#if playing}<PauseIcon weight="fill" /> Pause{:else}<PlayIcon weight="fill" /> Play{/if}
      </Button>
      <IconButton label="Step forward" size="sm" disabled={index >= last} onclick={() => go(index + 1)}><CaretRightIcon weight="bold" /></IconButton>
      <IconButton label="Last step" size="sm" disabled={index >= last} onclick={() => go(last)}><SkipForwardIcon weight="bold" /></IconButton>
      <Slider size="sm" min={0} max={last} bind:value={() => index, (value) => go(Number(value))} aria-label="Step" class="min-w-24 flex-1" />
      <span class="w-24 text-right font-mono text-2xs text-foreground/80 tabular-nums">{Math.min(index, last) + 1} / {steps.length}</span>
      <Select size="sm" aria-label="Speed" class="w-20" options={SPEED_OPTIONS} bind:value={speed} />
    </div>
  </section>

  <aside class="flex min-h-0 min-w-0 flex-col gap-3 @4xl:overflow-y-auto @4xl:pr-1" aria-label="Explanation">
    <div class="flex flex-col gap-1.5 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">What happens</span>
      <p class="min-h-[2.75rem] text-sm text-pretty" aria-live="polite">{step?.note ?? ""}</p>
      {#if recording.truncated}
        <p class="text-2xs text-warning">Stopped after {steps.length.toLocaleString("en")} steps. Try a smaller input.</p>
      {/if}
    </div>

    {#if step?.counters && Object.keys(step.counters).length}
      <dl class="grid grid-cols-2 gap-1.5">
        {#each Object.entries(step.counters) as [key, value] (key)}
          <div class="flex flex-col rounded-lg bg-background-light px-2.5 py-1.5 shadow-card ring-1 ring-hairline">
            <dt class="truncate text-2xs text-foreground/80">{counter_label(key)}</dt>
            <dd class="font-mono text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if tones.length}
      <ul class="flex flex-wrap gap-x-3 gap-y-1" aria-label="Legend">
        {#each tones as tone (tone)}
          <li class="flex items-center gap-1.5 text-2xs text-foreground/80">
            <span class={cn("size-2.5 rounded-xs", TONE_BG[tone])}></span>{TONE_LABEL[tone]}
          </li>
        {/each}
      </ul>
    {/if}

    {#if pseudocode.length}
      <div class="flex flex-col gap-1.5">
        <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Pseudocode</span>
        <ol class="rounded-xl bg-background-darker py-2 font-mono text-2xs leading-5 ring-1 ring-hairline">
          {#each pseudocode as line, n (n)}
            {@const indent = line.length - line.trimStart().length}
            <li
              class={cn(
                "border-l-2 pr-3 transition-colors duration-150",
                step?.line === n ? "border-primary bg-primary/12 text-foreground" : "border-transparent text-foreground/80"
              )}
              style:padding-left="calc(0.625rem + {indent}ch)"
              aria-current={step?.line === n ? "step" : undefined}
            >
              {line.trimStart()}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  </aside>
</div>
