<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { BarsView } from "../engine/step";
  import { TONE_BG, TONE_TEXT } from "./tones";

  let { view }: { view: BarsView } = $props();

  const CANVAS_FROM = 150;
  const TONE_VARS: Record<string, string> = {
    active: "--info",
    compare: "--secondary",
    warn: "--warning",
    mark: "--tertiary",
    done: "--success",
    bad: "--error",
  };

  const max = $derived(Math.max(1, ...view.values));
  const labelled = $derived(view.values.length <= 24);
  const pointed = $derived(new Map((view.pointers ?? []).map((pointer) => [pointer.index, pointer])));

  let canvas = $state<HTMLCanvasElement>();
  let width = $state(0);
  let height = $state(0);

  $effect(() => {
    if (!canvas || view.values.length < CANVAS_FROM || width === 0) return;
    const ratio = devicePixelRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    const style = getComputedStyle(canvas);
    const color = (name: string) => style.getPropertyValue(name).trim();
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    const step = width / view.values.length;
    const gap = step > 3 ? 1 : 0;
    const neutral = color("--foreground");
    view.values.forEach((value, index) => {
      const tone = view.tones?.[index];
      context.globalAlpha = tone && TONE_VARS[tone] ? 1 : 0.35;
      context.fillStyle = tone && TONE_VARS[tone] ? color(TONE_VARS[tone]) : neutral;
      const bar = (value / max) * (height - 4);
      context.fillRect(index * step, height - bar, Math.max(1, step - gap), bar);
    });
  });
</script>

<div class="flex h-full min-h-40 flex-col gap-1">
  {#if view.values.length >= CANVAS_FROM}
    <div class="relative min-h-0 flex-1" bind:clientWidth={width} bind:clientHeight={height}>
      <canvas bind:this={canvas} class="absolute inset-0 size-full" aria-label="{view.values.length} bars"></canvas>
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 items-end gap-[clamp(1px,0.6cqw,6px)]" role="img" aria-label={view.values.join(", ")}>
      {#each view.values as value, index (index)}
        {@const tone = view.tones?.[index]}
        <div class="flex h-full min-w-0 flex-1 flex-col justify-end">
          {#if labelled}
            <span class={cn("mb-0.5 text-center font-mono text-2xs tabular-nums", tone ? TONE_TEXT[tone] : "text-foreground/65")}>{value}</span>
          {/if}
          <div
            class={cn("min-h-0.5 rounded-t-sm transition-[height,background-color] duration-150 ease-out", tone ? TONE_BG[tone] : "bg-foreground/30")}
            style:height="calc({value / max} * (100% - {labelled ? '1.125rem' : '0px'}))"
          ></div>
        </div>
      {/each}
    </div>
  {/if}
  {#if view.pointers?.length && view.values.length < CANVAS_FROM}
    <div class="flex h-4 gap-[clamp(1px,0.6cqw,6px)]">
      {#each view.values as _, index (index)}
        {@const pointer = pointed.get(index)}
        <span class={cn("min-w-0 flex-1 text-center font-mono text-2xs leading-4", pointer?.tone ? TONE_TEXT[pointer.tone] : "text-foreground/80")}>{pointer ? `↑${pointer.label}` : ""}</span>
      {/each}
    </div>
  {/if}
</div>
