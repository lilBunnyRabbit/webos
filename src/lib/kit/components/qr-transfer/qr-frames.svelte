<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { qr_path } from "$kit/utils/qr";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";

  /** `frames` from `encode_frames`. More than one cycles on its own so the other phone's camera catches them all. */
  let { frames, label }: { frames: string[]; label: string } = $props();

  /** Slow enough for a camera to lock on, fast enough that a 5-code share takes about two seconds a round. */
  const CYCLE_MS = 400;

  let index = $state(0);
  let playing = $state(true);
  const shown = $derived(Math.min(index, frames.length - 1));
  const qr = $derived(qr_path(frames[shown] ?? ""));
  const many = $derived(frames.length > 1);

  $effect(() => {
    if (!playing || !many) return;
    const timer = setInterval(() => (index = (index + 1) % frames.length), CYCLE_MS);
    return () => clearInterval(timer);
  });

  function step(by: number) {
    playing = false;
    index = (shown + by + frames.length) % frames.length;
  }
</script>

<figure class="flex w-full flex-col items-center gap-2">
  <div class="aspect-square w-full max-w-72 overflow-hidden rounded-lg ring-1 ring-foreground/8">
    <!-- Scanners expect dark modules on a light field, so the colours flip with the theme's colour scheme. -->
    <svg viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label="{label}{many ? `, code ${shown + 1} of ${frames.length}` : ''}" shape-rendering="crispEdges" class="size-full bg-[light-dark(var(--background),var(--foreground))]">
      <path d={qr.d} class="fill-[light-dark(var(--foreground),var(--background-darkest))]" />
    </svg>
  </div>
  {#if many}
    <figcaption class="flex items-center gap-1">
      <IconButton label="Previous code" size="sm" onclick={() => step(-1)}><CaretLeftIcon weight="bold" /></IconButton>
      <div class="flex items-center gap-1 px-1" aria-hidden="true">
        {#each frames as _, dot (dot)}
          <span class={cn("size-1.5 rounded-full transition-colors", dot === shown ? "bg-foreground" : "bg-foreground/20")}></span>
        {/each}
      </div>
      <span class="min-w-10 text-center font-mono text-2xs text-foreground/65 tabular-nums">{shown + 1} / {frames.length}</span>
      <IconButton label="Next code" size="sm" onclick={() => step(1)}><CaretRightIcon weight="bold" /></IconButton>
      <IconButton label={playing ? "Pause" : "Play"} size="sm" onclick={() => (playing = !playing)}>
        {#if playing}<PauseIcon weight="bold" />{:else}<PlayIcon weight="bold" />{/if}
      </IconButton>
    </figcaption>
  {/if}
</figure>
