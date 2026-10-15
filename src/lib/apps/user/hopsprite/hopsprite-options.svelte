<script lang="ts">
  import { IconButton, Select, Separator, Slider } from "$lib/core/components/ui";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Circle as CircleIcon,
    FlipHorizontal as FlipHorizontalIcon,
    FlipVertical as FlipVerticalIcon,
    PaintBucket as PaintBucketIcon,
    SelectionAll as SelectionAllIcon,
    SelectionInverse as SelectionInverseIcon,
    SelectionSlash as SelectionSlashIcon,
    Square as SquareIcon,
    Stairs as StairsIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { Transform } from "./document";
  import type { Editor } from "./editor.svelte";
  import { MAX_BRUSH, type Prefs } from "./prefs";
  import { BrushShape, Pattern } from "./raster";
  import { is_freehand, paints, Tool, uses_brush } from "./tools";

  let { editor, prefs }: { editor: Editor; prefs: Prefs } = $props();

  const tool = $derived(prefs.tool.value);
  const selecting = $derived(tool === Tool.SELECT || tool === Tool.WAND || tool === Tool.MOVE);
  const has_selection = $derived(editor.outline !== null);
  const shaped = $derived(tool === Tool.RECTANGLE || tool === Tool.ELLIPSE);
  const sized = $derived(uses_brush(tool) && !(shaped && prefs.filled.value));

  const PATTERN_OPTIONS = [
    { value: Pattern.SOLID, label: "Solid" },
    { value: Pattern.DENSE, label: "Dither 75%" },
    { value: Pattern.CHECKER, label: "Dither 50%" },
    { value: Pattern.SPARSE, label: "Dither 25%" },
  ];
</script>

{#if sized}
  <label class="flex items-center gap-1.5 text-2xs text-foreground/80" title="Brush size (Shift+, and Shift+.)">
    <span class="sr-only">Brush size</span>
    <Slider size="sm" min={1} max={MAX_BRUSH} class="w-16 @lg:w-24" bind:value={prefs.size.value} />
    <span class="w-7 font-mono tabular-nums">{prefs.size.value}px</span>
  </label>
  {#if prefs.size.value > 2}
    <IconButton
      label={prefs.shape.value === BrushShape.ROUND ? "Round brush" : "Square brush"}
      size="sm"
      onclick={() => (prefs.shape.value = prefs.shape.value === BrushShape.ROUND ? BrushShape.SQUARE : BrushShape.ROUND)}
    >
      {#if prefs.shape.value === BrushShape.ROUND}<CircleIcon weight="bold" />{:else}<SquareIcon weight="bold" />{/if}
    </IconButton>
  {/if}
{/if}

{#if is_freehand(tool) && prefs.size.value === 1}
  <IconButton label="Pixel-perfect: no doubled corners on curves" size="sm" pressed={prefs.pixel_perfect.value} onclick={() => (prefs.pixel_perfect.value = !prefs.pixel_perfect.value)}>
    <StairsIcon weight="bold" />
  </IconButton>
{/if}

{#if shaped}
  <IconButton label={prefs.filled.value ? "Filled shape" : "Outlined shape"} size="sm" pressed={prefs.filled.value} onclick={() => (prefs.filled.value = !prefs.filled.value)}>
    {#if tool === Tool.ELLIPSE}<CircleIcon weight={prefs.filled.value ? "fill" : "bold"} />{:else}<SquareIcon weight={prefs.filled.value ? "fill" : "bold"} />{/if}
  </IconButton>
{/if}

{#if tool === Tool.FILL || tool === Tool.WAND}
  <IconButton
    label={prefs.contiguous.value ? "Touching pixels only" : "Every pixel of that colour"}
    size="sm"
    pressed={!prefs.contiguous.value}
    onclick={() => (prefs.contiguous.value = !prefs.contiguous.value)}
  >
    <PaintBucketIcon weight={prefs.contiguous.value ? "bold" : "fill"} />
  </IconButton>
{/if}

{#if paints(tool) && tool !== Tool.ERASER}
  <Select size="sm" class="w-28" aria-label="Pattern" title="Pattern: solid or dithered" options={PATTERN_OPTIONS} bind:value={prefs.pattern.value} />
{/if}

{#if paints(tool)}
  <IconButton label="Mirror left and right" size="sm" pressed={prefs.mirror_x.value} onclick={() => (prefs.mirror_x.value = !prefs.mirror_x.value)}>
    <FlipHorizontalIcon weight="bold" />
  </IconButton>
  <IconButton label="Mirror top and bottom" size="sm" pressed={prefs.mirror_y.value} onclick={() => (prefs.mirror_y.value = !prefs.mirror_y.value)}>
    <FlipVerticalIcon weight="bold" />
  </IconButton>
{/if}

{#if selecting}
  <IconButton label="Select all (Mod+A)" size="sm" onclick={() => editor.select_all()}><SelectionAllIcon weight="bold" /></IconButton>
  <IconButton label="Invert selection (Mod+Shift+I)" size="sm" onclick={() => editor.invert_selection()}><SelectionInverseIcon weight="bold" /></IconButton>
  {#if has_selection}
    <IconButton label="Deselect (Mod+D)" size="sm" onclick={() => editor.deselect()}><SelectionSlashIcon weight="bold" /></IconButton>
    <Separator vertical />
    <IconButton label="Flip horizontally (Shift+H)" size="sm" onclick={() => editor.transform_selection(Transform.FLIP_H)}><FlipHorizontalIcon weight="bold" /></IconButton>
    <IconButton label="Flip vertically (Shift+V)" size="sm" onclick={() => editor.transform_selection(Transform.FLIP_V)}><FlipVerticalIcon weight="bold" /></IconButton>
    <IconButton label="Rotate left" size="sm" onclick={() => editor.transform_selection(Transform.ROTATE_CCW)}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Rotate right" size="sm" onclick={() => editor.transform_selection(Transform.ROTATE_CW)}><ArrowClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Delete selected pixels (Delete)" size="sm" onclick={() => editor.delete_selection()}><TrashIcon weight="bold" /></IconButton>
  {/if}
{/if}
