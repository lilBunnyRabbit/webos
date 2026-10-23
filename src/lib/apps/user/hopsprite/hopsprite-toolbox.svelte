<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import {
    ArrowsOutCardinal as ArrowsOutCardinalIcon,
    Circle as CircleIcon,
    Eraser as EraserIcon,
    Eyedropper as EyedropperIcon,
    Hand as HandIcon,
    LineSegment as LineSegmentIcon,
    MagicWand as MagicWandIcon,
    PaintBucket as PaintBucketIcon,
    PencilSimple as PencilSimpleIcon,
    Selection as SelectionIcon,
    Square as SquareIcon,
  } from "phosphor-svelte";
  import { Tool, TOOL_GROUPS, TOOL_KEYS, TOOL_LABELS } from "./tools";

  let { tool = $bindable() }: { tool: Tool } = $props();

  const ICONS: Record<Tool, IconComponent> = {
    pencil: PencilSimpleIcon,
    eraser: EraserIcon,
    fill: PaintBucketIcon,
    eyedropper: EyedropperIcon,
    line: LineSegmentIcon,
    rectangle: SquareIcon,
    ellipse: CircleIcon,
    select: SelectionIcon,
    wand: MagicWandIcon,
    move: ArrowsOutCardinalIcon,
    hand: HandIcon,
  };
</script>

<div class="toolbox" role="toolbar" aria-label="Tools">
  {#each TOOL_GROUPS as group, g (g)}
    {#if g > 0}<span class="divider shrink-0 bg-hairline-strong" aria-hidden="true"></span>{/if}
    {#each group as item (item)}
      {@const Icon = ICONS[item]}
      <IconButton label="{TOOL_LABELS[item]} ({TOOL_KEYS[item].toUpperCase()})" pressed={tool === item} class="shrink-0" onclick={() => (tool = item)}>
        <Icon weight={tool === item ? "fill" : "bold"} />
      </IconButton>
    {/each}
  {/each}
</div>

<style>
  .toolbox {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .divider {
    width: 1px;
    height: 1.25rem;
    margin-inline: 0.25rem;
  }

  @container (width >= 40rem) {
    .toolbox {
      height: 100%;
      flex-direction: column;
      flex-wrap: wrap;
      align-content: flex-start;
      overflow: visible;
    }

    .divider {
      width: 1.25rem;
      height: 1px;
      margin: 0.25rem 0.375rem;
    }
  }
</style>
