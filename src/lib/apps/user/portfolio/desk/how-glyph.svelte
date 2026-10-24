<script lang="ts" module>
  import { shape_for } from "../particles/glyphs";
  import { draw_shape } from "../particles/shapes";
  import { glyph_dots, type DotGrid } from "./how-glyph";

  const grids = new Map<string, DotGrid>();

  function grid_for(principle: string, columns: number): DotGrid {
    const key = `${principle}:${columns}`;
    let grid = grids.get(key);
    if (!grid) {
      const drawn = draw_shape(shape_for(principle), 1);
      grid = glyph_dots(drawn.mask, columns, 0.3, drawn.seed);
      grids.set(key, grid);
    }
    return grid;
  }
</script>

<script lang="ts">
  import { cn } from "$lib/core/utils";

  interface Props {
    principle: string;
    lit: boolean;
    columns?: number;
    class?: string;
  }

  let { principle, lit, columns = 15, class: class_name }: Props = $props();

  const grid = $derived(grid_for(principle, columns));
</script>

<svg class={cn("glyph", lit && "lit", class_name)} viewBox="0 0 {grid.columns} {grid.rows}" aria-hidden="true">
  {#each grid.dots as dot, i (i)}
    <circle cx={dot.x} cy={dot.y} r={dot.r} style:--dx="{dot.dx}px" style:--dy="{dot.dy}px" style:--d={dot.delay} />
  {/each}
</svg>

<style>
  .glyph {
    overflow: visible;
    fill: currentColor;
  }

  .lit circle {
    animation: land 560ms var(--ease-out) calc(var(--d) * 280ms) backwards;
  }

  @keyframes land {
    from {
      translate: var(--dx) var(--dy);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lit circle {
      animation: none;
    }
  }
</style>
