<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { PointsView } from "../engine/step";
  import Stage from "./stage.svelte";
  import { TONE_FILL, TONE_STROKE } from "./tones";

  let { view }: { view: PointsView } = $props();

  const S = 5;
  const bounds = { x: -20, y: -20, width: 540, height: 540 };
  const polygon = $derived(view.polygon?.map((point) => `${point.x * S},${point.y * S}`).join(" "));
</script>

<Stage {bounds} label={view.title ?? "Points"} class="h-full">
  {#snippet children()}
    <rect x="0" y="0" width={100 * S} height={100 * S} rx="8" class="fill-background-light/50 stroke-foreground/10" />
    {#if polygon}
      <polygon points={polygon} stroke-width="2" class="fill-primary/10 stroke-primary transition-all duration-150" />
    {/if}
    {#if view.sweep !== undefined}
      <line x1={view.sweep * S} x2={view.sweep * S} y1="-10" y2={100 * S + 10} stroke-dasharray="6 5" stroke-width="1.5" class="stroke-tertiary" />
    {/if}
    {#each view.segments ?? [] as segment, index (index)}
      <line x1={segment.a.x * S} y1={segment.a.y * S} x2={segment.b.x * S} y2={segment.b.y * S} stroke-width={segment.tone ? 3 : 1.75} stroke-linecap="round" class={segment.tone ? TONE_STROKE[segment.tone] : "stroke-foreground/35"} />
    {/each}
    {#each view.points as point, index (index)}
      <circle cx={point.x * S} cy={point.y * S} r={point.tone ? 7 : 5.5} class={cn("transition-colors duration-150", point.tone ? TONE_FILL[point.tone] : "fill-foreground/60")} />
      {#if point.label}
        <text x={point.x * S + 10} y={point.y * S - 8} class="fill-foreground/80 font-mono text-[11px]">{point.label}</text>
      {/if}
    {/each}
  {/snippet}
</Stage>
