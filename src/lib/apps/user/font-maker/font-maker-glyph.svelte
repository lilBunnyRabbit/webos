<script lang="ts">
  import { BOX, BOX_HEIGHT, BOX_WIDTH, type Metrics, type Stroke } from "./model";

  interface Props {
    strokes: readonly Stroke[];
    width: number;
    ghost?: { char: string; metrics: Metrics };
    class?: string;
  }

  let { strokes, width, ghost, class: class_name }: Props = $props();

  const polyline = (stroke: Stroke) => (stroke.length === 1 ? `M${stroke[0][0]} ${-stroke[0][1]}h0.1` : `M${stroke.map(([x, y]) => `${x} ${-y}`).join("L")}`);
</script>

<svg viewBox="{BOX.left} {-BOX.top} {BOX_WIDTH} {BOX_HEIGHT}" class={class_name} aria-hidden="true">
  {#if strokes.length}
    {#each strokes as stroke, index (index)}
      <path d={polyline(stroke)} class="stroke-foreground" fill="none" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" />
    {/each}
  {:else if ghost}
    <text x={BOX_WIDTH / 2} y="0" text-anchor="middle" font-size={ghost.metrics.cap} class="ghost fill-foreground">{ghost.char}</text>
  {/if}
</svg>

<style>
  .ghost {
    font-family: var(--font-sans);
    font-size-adjust: cap-height 1;
    opacity: 0.16;
  }
</style>
