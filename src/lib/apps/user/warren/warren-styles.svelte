<script lang="ts">
  import { BUILTIN_FONTS } from "$lib/core/api";
  import { Button, IconButton, Input, Select } from "$lib/core/components/ui";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    TextAlignCenter as TextAlignCenterIcon,
    TextAlignJustify as TextAlignJustifyIcon,
    TextAlignLeft as TextAlignLeftIcon,
    TextAlignRight as TextAlignRightIcon,
    TextB as TextBIcon,
    TextItalic as TextItalicIcon,
  } from "phosphor-svelte";
  import { TEXT_SWATCHES } from "./colour";
  import { style_of, type WarrenEditor } from "./editor.svelte";
  import { Align } from "./model";
  import { DEFAULT_STYLES, INTER, LINE_HEIGHTS, STYLE_IDS, STYLE_LIMITS, STYLE_NAMES, StyleId, type StyleSpec } from "./styles";
  import WarrenColour from "./warren-colour.svelte";

  let { editor }: { editor: WarrenEditor } = $props();

  let chosen = $state<StyleId | null>(null);
  const id = $derived(chosen ?? style_of(editor.block));
  const spec = $derived(editor.styles[id]);
  const changed = $derived((Object.keys(spec) as (keyof StyleSpec)[]).some((key) => spec[key] !== DEFAULT_STYLES[id][key]));

  const STYLE_OPTIONS = STYLE_IDS.map((value) => ({ value, label: STYLE_NAMES[value] }));
  const font_options = $derived([
    { value: "", label: id === StyleId.NORMAL ? "Document font" : "Same as Normal" },
    { value: INTER, label: "Inter" },
    ...Object.entries(BUILTIN_FONTS).map(([value, font]) => ({ value, label: font.name })),
  ]);
  const line_options = $derived(
    [...new Set([...LINE_HEIGHTS, spec.line])].sort((a, b) => a - b).map((value) => ({ value: String(value), label: value.toFixed(2).replace(/0$/, "") }))
  );
  const ALIGN_BUTTONS = [
    { value: Align.LEFT, label: "Left", icon: TextAlignLeftIcon },
    { value: Align.CENTER, label: "Centre", icon: TextAlignCenterIcon },
    { value: Align.RIGHT, label: "Right", icon: TextAlignRightIcon },
    { value: Align.JUSTIFY, label: "Justify", icon: TextAlignJustifyIcon },
  ];

  const set = (patch: Partial<StyleSpec>) => editor.set_style(id, patch);

  function number_field(field: HTMLInputElement, key: "size" | "before" | "after", limit: { min: number; max: number }) {
    const value = Number(field.value);
    if (!field.value.trim() || !Number.isFinite(value)) {
      field.value = String(spec[key]);
      return;
    }
    const clamped = Math.min(limit.max, Math.max(limit.min, Math.round(value * 2) / 2));
    set({ [key]: clamped });
    field.value = String(clamped);
  }
</script>

<label class="flex items-center justify-between gap-2 text-ui">
  <span>Style</span>
  <Select size="sm" class="w-32" aria-label="Style to change" value={id} options={STYLE_OPTIONS} onchange={(event) => (chosen = event.currentTarget.value as StyleId)} />
</label>
<p class="-mt-1 text-2xs text-foreground/65">Every {STYLE_NAMES[id]} paragraph follows it.{chosen === null ? " This is the caret's." : ""}</p>
<Select
  size="sm"
  class="w-full"
  aria-label="{STYLE_NAMES[id]} font"
  value={spec.font ?? ""}
  options={font_options}
  onchange={(event) => set({ font: event.currentTarget.value || null })}
/>
<div class="flex items-center gap-1">
  <Input
    size="sm"
    class="w-20 shrink-0 text-right tabular-nums"
    type="number"
    min={STYLE_LIMITS.size.min}
    max={STYLE_LIMITS.size.max}
    step="0.5"
    inputmode="decimal"
    aria-label="{STYLE_NAMES[id]} size in points"
    title="Size in points"
    value={spec.size}
    onchange={(event) => number_field(event.currentTarget, "size", STYLE_LIMITS.size)}
  />
  <span class="text-2xs text-foreground/65">pt</span>
  <div class="flex-1"></div>
  <IconButton label="Bold" pressed={spec.bold} onclick={() => set({ bold: !spec.bold })}><TextBIcon weight="bold" /></IconButton>
  <IconButton label="Italic" pressed={spec.italic} onclick={() => set({ italic: !spec.italic })}><TextItalicIcon weight="bold" /></IconButton>
</div>
<div class="grid grid-cols-4 gap-1" role="group" aria-label="{STYLE_NAMES[id]} alignment">
  {#each ALIGN_BUTTONS as item (item.value)}
    <IconButton label="{item.label}{spec.align === item.value ? ' (click again for none)' : ''}" class="w-full" pressed={spec.align === item.value} onclick={() => set({ align: spec.align === item.value ? null : item.value })}
      ><item.icon weight="bold" /></IconButton
    >
  {/each}
</div>
<div class="grid grid-cols-3 gap-1.5">
  <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/65">
    <span>Before (pt)</span>
    <Input
      size="sm"
      class="w-full text-right tabular-nums"
      type="number"
      min="0"
      max={STYLE_LIMITS.spacing.max}
      step="1"
      inputmode="decimal"
      value={spec.before}
      onchange={(event) => number_field(event.currentTarget, "before", STYLE_LIMITS.spacing)}
    />
  </label>
  <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/65">
    <span>After (pt)</span>
    <Input
      size="sm"
      class="w-full text-right tabular-nums"
      type="number"
      min="0"
      max={STYLE_LIMITS.spacing.max}
      step="1"
      inputmode="decimal"
      value={spec.after}
      onchange={(event) => number_field(event.currentTarget, "after", STYLE_LIMITS.spacing)}
    />
  </label>
  <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/65">
    <span>Line</span>
    <Select size="sm" class="w-full" value={String(spec.line)} options={line_options} onchange={(event) => set({ line: Number(event.currentTarget.value) })} />
  </label>
</div>
<WarrenColour label="Colour" value={spec.color} swatches={TEXT_SWATCHES} none="Automatic" start="#1971c2" onpick={(color) => set({ color })} />
{#if changed}
  <Button size="sm" variant="quiet" onclick={() => editor.reset_style(id)}><ArrowCounterClockwiseIcon weight="bold" />Reset {STYLE_NAMES[id]}</Button>
{/if}
