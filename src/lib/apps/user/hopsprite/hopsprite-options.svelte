<script lang="ts">
  import { Checkbox, IconButton, Segmented, Select, Separator, Slider } from "$lib/core/components/ui";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    FlipHorizontal as FlipHorizontalIcon,
    FlipVertical as FlipVerticalIcon,
    GridFour as GridFourIcon,
    SelectionAll as SelectionAllIcon,
    SelectionInverse as SelectionInverseIcon,
    SelectionSlash as SelectionSlashIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { Transform } from "./document";
  import type { Editor } from "./editor.svelte";
  import { MAX_BRUSH, type Prefs } from "./prefs";
  import { BrushShape, Pattern } from "./raster";
  import { is_freehand, is_shape, paints, Tool, TOOL_LABELS, uses_brush } from "./tools";

  let { editor, prefs }: { editor: Editor; prefs: Prefs } = $props();

  const tool = $derived(prefs.tool.value);
  const selecting = $derived(tool === Tool.SELECT || tool === Tool.WAND || tool === Tool.MOVE);
  const has_selection = $derived(editor.outline !== null);

  const PATTERN_OPTIONS = [
    { value: Pattern.SOLID, label: "Solid" },
    { value: Pattern.DENSE, label: "Dither 75%" },
    { value: Pattern.CHECKER, label: "Dither 50%" },
    { value: Pattern.SPARSE, label: "Dither 25%" },
  ];

  const TILE_OPTIONS = [
    { value: "0", label: "No tiles" },
    { value: "8", label: "8 px tiles" },
    { value: "16", label: "16 px tiles" },
    { value: "32", label: "32 px tiles" },
  ];
</script>

<div class="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-foreground/8 bg-background-light px-2 py-1" role="toolbar" aria-label="Tool options">
  <span class="w-20 shrink-0 truncate text-2xs font-medium tracking-wide text-foreground/65 uppercase">{TOOL_LABELS[tool]}</span>

  {#if uses_brush(tool) && !(is_shape(tool) && prefs.filled.value && tool !== Tool.LINE)}
    <label class="flex items-center gap-2 text-ui text-foreground/80">
      Size
      <Slider size="sm" min={1} max={MAX_BRUSH} class="w-24" bind:value={prefs.size.value} />
      <span class="w-5 font-mono text-2xs tabular-nums">{prefs.size.value}</span>
    </label>
    <Segmented
      size="sm"
      label="Brush shape"
      options={[
        { value: BrushShape.SQUARE, label: "Square" },
        { value: BrushShape.ROUND, label: "Round" },
      ]}
      bind:value={prefs.shape.value}
    />
  {/if}

  {#if is_freehand(tool) && prefs.size.value === 1}
    <label class="flex items-center gap-1.5 text-ui text-foreground/80" title="Removes the corner pixel of every L so curves stay one pixel thick">
      <Checkbox bind:checked={prefs.pixel_perfect.value} />
      Pixel-perfect
    </label>
  {/if}

  {#if tool === Tool.RECTANGLE || tool === Tool.ELLIPSE}
    <Segmented
      size="sm"
      label="Shape style"
      options={[
        { value: "outline", label: "Outline" },
        { value: "filled", label: "Filled" },
      ]}
      bind:value={() => (prefs.filled.value ? "filled" : "outline"), (value) => (prefs.filled.value = value === "filled")}
    />
  {/if}

  {#if tool === Tool.FILL || tool === Tool.WAND}
    <Segmented
      size="sm"
      label="Fill area"
      options={[
        { value: "contiguous", label: "Contiguous" },
        { value: "global", label: "Same colour" },
      ]}
      bind:value={() => (prefs.contiguous.value ? "contiguous" : "global"), (value) => (prefs.contiguous.value = value === "contiguous")}
    />
  {/if}

  {#if paints(tool) && tool !== Tool.ERASER}
    <Select size="sm" class="w-30" aria-label="Pattern" options={PATTERN_OPTIONS} bind:value={prefs.pattern.value} />
  {/if}

  {#if selecting}
    <div class="flex items-center" role="group" aria-label="Selection">
      <IconButton label="Select all (Mod+A)" size="sm" onclick={() => editor.select_all()}><SelectionAllIcon weight="bold" /></IconButton>
      <IconButton label="Deselect (Mod+D)" size="sm" disabled={!has_selection} onclick={() => editor.deselect()}><SelectionSlashIcon weight="bold" /></IconButton>
      <IconButton label="Invert selection (Mod+Shift+I)" size="sm" onclick={() => editor.invert_selection()}><SelectionInverseIcon weight="bold" /></IconButton>
      <Separator vertical />
      <IconButton label="Flip horizontally (Shift+H)" size="sm" onclick={() => editor.transform_selection(Transform.FLIP_H)}><FlipHorizontalIcon weight="bold" /></IconButton>
      <IconButton label="Flip vertically (Shift+V)" size="sm" onclick={() => editor.transform_selection(Transform.FLIP_V)}><FlipVerticalIcon weight="bold" /></IconButton>
      <IconButton label="Rotate left" size="sm" onclick={() => editor.transform_selection(Transform.ROTATE_CCW)}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
      <IconButton label="Rotate right" size="sm" onclick={() => editor.transform_selection(Transform.ROTATE_CW)}><ArrowClockwiseIcon weight="bold" /></IconButton>
      <IconButton label="Delete selected pixels (Delete)" size="sm" disabled={!has_selection} onclick={() => editor.delete_selection()}><TrashIcon weight="bold" /></IconButton>
    </div>
  {/if}

  <span class="flex-1"></span>

  {#if paints(tool)}
    <div class="flex items-center gap-0.5" role="group" aria-label="Symmetry">
      <IconButton label="Mirror left and right" size="sm" pressed={prefs.mirror_x.value} onclick={() => (prefs.mirror_x.value = !prefs.mirror_x.value)}>
        <FlipHorizontalIcon weight="bold" />
      </IconButton>
      <IconButton label="Mirror top and bottom" size="sm" pressed={prefs.mirror_y.value} onclick={() => (prefs.mirror_y.value = !prefs.mirror_y.value)}>
        <FlipVerticalIcon weight="bold" />
      </IconButton>
    </div>
    <Separator vertical />
  {/if}
  <IconButton label="Pixel grid" size="sm" pressed={prefs.grid.value} onclick={() => (prefs.grid.value = !prefs.grid.value)}>
    <GridFourIcon weight="bold" />
  </IconButton>
  <Select
    size="sm"
    class="hidden w-30 @lg:flex"
    aria-label="Tile grid"
    options={TILE_OPTIONS}
    bind:value={() => String(prefs.tile.value), (value) => (prefs.tile.value = Number(value))}
  />
</div>
