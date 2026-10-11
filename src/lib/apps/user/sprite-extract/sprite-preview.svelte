<script lang="ts">
  import { Checkbox, IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, Pause as PauseIcon, Play as PlayIcon } from "phosphor-svelte";
  import { anchor_offset } from "./sprite-export";
  import type { SpriteExtractState } from "./sprite-extract.svelte";
  import { frame_size, round_rect } from "./sprite-model";

  let { sprite }: { sprite: SpriteExtractState } = $props();

  let playing = $state(true);
  let step = $state(0);
  let follow_selection = $state(false);

  const cell = $derived(frame_size(sprite.grid.frames, sprite.sequence));
  const length = $derived(sprite.sequence.length);
  const current = $derived(length ? Math.min(step, length - 1) : 0);
  const frame_index = $derived(length ? sprite.sequence[current] : null);

  $effect(() => {
    if (!playing || length <= 1) return;
    const timer = setTimeout(() => (step = (current + 1) % length), 1000 / Math.max(1, sprite.fps));
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (!follow_selection || playing || sprite.selected === null) return;
    const position = sprite.sequence.indexOf(sprite.selected);
    if (position >= 0) step = position;
  });

  function draw(canvas: HTMLCanvasElement) {
    canvas.width = Math.max(1, cell.w);
    canvas.height = Math.max(1, cell.h);
    const ctx = canvas.getContext("2d");
    const source = sprite.source;
    const frame = frame_index === null ? undefined : sprite.grid.frames[frame_index];
    if (!ctx || !source || !frame) return;
    const src = round_rect(frame);
    const offset = anchor_offset(src, cell, sprite.anchor);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source.image, src.x, src.y, src.w, src.h, offset.x, offset.y, src.w, src.h);
  }

  export function toggle() {
    playing = !playing;
  }

  export function next() {
    playing = false;
    step = length ? (current + 1) % length : 0;
  }

  export function prev() {
    playing = false;
    step = length ? (current - 1 + length) % length : 0;
  }
</script>

<div class="flex flex-col gap-2">
  <div class="checker grid h-56 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden rounded-lg ring-1 ring-foreground/8">
    {#if length}
      <button type="button" class="grid size-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-2" title="Select this frame on the sheet" onclick={() => frame_index !== null && (sprite.selected = frame_index)}>
        <canvas class={cn("max-h-full max-w-full cursor-pointer", cell.w < 200 && "[image-rendering:pixelated]")} {@attach draw}></canvas>
      </button>
    {:else}
      <span class="text-ui text-foreground/65">No frames in the sequence</span>
    {/if}
  </div>

  <div class="flex items-center justify-between font-mono text-2xs text-foreground/80 tabular-nums">
    <span>
      {length ? `${current + 1} / ${length}` : "0 / 0"}
      {#if frame_index !== null}<span class="text-foreground/65"> · #{frame_index}</span>{/if}
    </span>
    <span class="text-foreground/65">{cell.w}×{cell.h}</span>
  </div>

  <div class="flex items-center gap-1">
    <IconButton label="Previous frame ([)" size="sm" onclick={prev}><CaretLeftIcon weight="bold" /></IconButton>
    <IconButton label={playing ? "Pause (P)" : "Play (P)"} size="sm" aria-pressed={playing} class={cn(playing && "bg-foreground/10 text-foreground")} onclick={toggle}>
      {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
    </IconButton>
    <IconButton label="Next frame (])" size="sm" onclick={next}><CaretRightIcon weight="bold" /></IconButton>
    <label class="ml-auto flex cursor-pointer items-center gap-1.5 text-ui text-foreground/80 select-none">
      <Checkbox bind:checked={follow_selection} />
      Follow selection
    </label>
  </div>
</div>

<style>
  .checker {
    background-color: var(--background-light);
    background-image: conic-gradient(var(--background-dark) 25%, transparent 0 50%, var(--background-dark) 0 75%, transparent 0);
    background-size: 16px 16px;
  }
</style>
