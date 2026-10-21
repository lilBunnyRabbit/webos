<script lang="ts">
  import { BOX, BOX_HEIGHT, BOX_WIDTH, type Metrics, type Stroke } from "./model";
  import { contours_path, glyph_contours } from "./outline";

  interface Props {
    strokes: readonly Stroke[];
    width: number;
    ghost?: { char: string; metrics: Metrics };
    class?: string;
  }

  let { strokes, width, ghost, class: class_name }: Props = $props();

  const ink = $derived(strokes.length ? contours_path(glyph_contours(strokes, width)) : "");
</script>

<svg viewBox="{BOX.left} {-BOX.top} {BOX_WIDTH} {BOX_HEIGHT}" class={class_name} aria-hidden="true">
  {#if ink}
    <path d={ink} transform="scale(1 -1)" class="fill-foreground" />
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
