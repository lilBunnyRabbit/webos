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

<div
  class="flex shrink-0 items-center gap-1 overflow-x-auto bg-background-light p-1.5 @2xl:flex-col @2xl:overflow-x-visible @2xl:overflow-y-auto"
  role="toolbar"
  aria-label="Tools"
  aria-orientation="vertical"
>
  {#each TOOL_GROUPS as group, g (g)}
    {#if g > 0}<span class="mx-0.5 h-5 w-px shrink-0 bg-foreground/10 @2xl:mx-0 @2xl:my-0.5 @2xl:h-px @2xl:w-5" aria-hidden="true"></span>{/if}
    {#each group as item (item)}
      {@const Icon = ICONS[item]}
      <IconButton
        label="{TOOL_LABELS[item]} ({TOOL_KEYS[item].toUpperCase()})"
        size="md"
        pressed={tool === item}
        onclick={() => (tool = item)}
      >
        <Icon weight={tool === item ? "fill" : "bold"} />
      </IconButton>
    {/each}
  {/each}
</div>
