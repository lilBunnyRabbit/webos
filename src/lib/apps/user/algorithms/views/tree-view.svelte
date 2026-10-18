<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { TreeView } from "../engine/step";
  import Stage from "./stage.svelte";
  import { NODE_HEIGHT, layout_tree } from "./tree-layout";
  import { TONE_FILL, TONE_STROKE } from "./tones";

  let { view }: { view: TreeView } = $props();

  const layout = $derived(layout_tree(view.roots));
  const PAD = 24;
  const bounds = $derived({ x: -PAD, y: -NODE_HEIGHT / 2 - PAD, width: layout.width + PAD * 2, height: layout.height + PAD * 2 + 12 });
  const half = NODE_HEIGHT / 2;
</script>

{#if view.roots.length === 0}
  <p class="grid h-full place-items-center text-ui text-foreground/65">Empty</p>
{:else}
  <Stage {bounds} label={view.title ?? "Tree"} class="h-full">
    {#snippet children()}
      <g class="fill-none stroke-foreground/30" stroke-width="1.5">
        {#each layout.edges as edge (edge.key)}
          <path class="transition-[d] duration-300 ease-out" style:d={`path("M ${edge.from.x} ${edge.from.y + half} L ${edge.to.x} ${edge.to.y - half}")`} />
        {/each}
      </g>
      {#each layout.nodes as placed (placed.node.id)}
        {@const tone = placed.node.tone}
        <g class="transition-transform duration-300 ease-out" style:transform="translate({placed.x}px, {placed.y}px)">
          <rect
            x={-placed.width / 2}
            y={-half}
            width={placed.width}
            height={NODE_HEIGHT}
            rx={half}
            stroke-width={placed.node.red || tone ? 2 : 1.25}
            class={cn(
              "transition-colors duration-150",
              tone ? TONE_FILL[tone] : placed.node.red ? "fill-error/15" : "fill-background-light",
              placed.node.red ? "stroke-error" : tone ? TONE_STROKE[tone] : "stroke-foreground/40"
            )}
          />
          <text
            y="0.5"
            text-anchor="middle"
            dominant-baseline="middle"
            class={cn("font-mono text-[12px]", tone && tone !== "muted" ? "fill-background font-semibold" : "fill-foreground")}>{placed.node.label}</text
          >
          {#if placed.node.badge}
            <text y={half + 11} text-anchor="middle" class="fill-foreground/65 font-mono text-[10px]">{placed.node.badge}</text>
          {/if}
        </g>
      {/each}
    {/snippet}
  </Stage>
{/if}
