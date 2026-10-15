<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { IconButton, Input, Slider } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowsDownUp as ArrowsDownUpIcon,
    Minus as MinusIcon,
    Palette as PaletteIcon,
    Plus as PlusIcon,
  } from "phosphor-svelte";
  import { alpha_of, is_hex, normalize_hex, rgb_hex, with_alpha } from "./color";
  import { add_color, remove_color, replace_palette, set_color, used_colors } from "./document";
  import type { Editor } from "./editor.svelte";
  import { MAX_COLORS } from "./model";
  import { PALETTE_PRESETS } from "./palettes";
  import { below } from "./menu";

  let { editor }: { editor: Editor } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const palette = $derived(editor.display.palette);
  const index = $derived(editor.primary);
  const hex = $derived(palette[index] ?? "#00000000");
  const transparent = $derived(index === 0);

  let hex_text = $state("");
  $effect(() => {
    hex_text = transparent ? "" : hex.slice(1);
  });

  function preview(next: string) {
    if (transparent) return;
    const colors = [...editor.sprite.palette];
    colors[index] = normalize_hex(next);
    editor.palette_preview = colors;
  }

  function commit(next = hex) {
    editor.palette_preview = null;
    if (transparent || normalize_hex(next) === editor.sprite.palette[index]) return;
    editor.apply((sprite) => set_color(sprite, index, next));
  }

  function commit_text() {
    const value = `#${hex_text.trim().replace(/^#/, "")}`;
    if (is_hex(value)) commit(value.length === 7 ? with_alpha(value, alpha_of(hex)) : value);
    else hex_text = hex.slice(1);
  }

  function add() {
    const result = add_color(editor.sprite, transparent ? "#ffffffff" : hex);
    if (!result) return;
    editor.apply(() => result.sprite);
    editor.primary = result.index;
  }

  async function remove() {
    if (transparent) return;
    if (used_colors(editor.sprite).has(index)) {
      const confirmed = await win.confirm(`Remove colour #${index}?`, {
        detail: "Pixels in this colour become transparent, and later colours move up one.",
        confirm_label: "Remove",
        danger: true,
      });
      if (!confirmed) return;
    }
    editor.apply((sprite) => remove_color(sprite, index));
  }

  async function presets(event: MouseEvent) {
    const choice = await dialogs.menu(
      PALETTE_PRESETS.map((preset) => ({ id: preset.id, label: `${preset.name} · ${preset.colors.length}` })),
      { anchor: below(event) }
    );
    const preset = PALETTE_PRESETS.find((item) => item.id === choice);
    if (preset) editor.apply((sprite) => replace_palette(sprite, preset.colors));
  }

  function swap() {
    [editor.primary, editor.secondary] = [editor.secondary, editor.primary];
  }
</script>

<section class="flex min-h-0 flex-col gap-3 p-3" aria-label="Palette">
  <div class="flex items-center gap-3">
    <div class="wells relative size-14 shrink-0" role="group" aria-label="Current colours">
      <button
        type="button"
        class="well absolute right-0 bottom-0 size-9"
        style:--swatch={palette[editor.secondary]}
        class:empty={editor.secondary === 0}
        title="Secondary colour: index {editor.secondary} (right click)"
        aria-label="Swap with secondary colour"
        onclick={swap}
      ></button>
      <span
        class="well absolute top-0 left-0 z-1 size-9"
        style:--swatch={palette[editor.primary]}
        class:empty={editor.primary === 0}
        title="Primary colour: index {editor.primary} (left click)"
      ></span>
    </div>
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-2xs text-foreground/65 tabular-nums">#{index}</span>
        <IconButton label="Swap colours (X)" size="sm" onclick={swap}><ArrowsDownUpIcon weight="bold" /></IconButton>
      </div>
      {#if transparent}
        <p class="text-2xs text-foreground/65">Transparent: paints holes. Pick a colour to edit it.</p>
      {:else}
        <div class="flex items-center gap-1.5">
          <label class="picker size-7 shrink-0" style:--swatch={hex} title="Pick a colour">
            <span class="sr-only">Colour {index}</span>
            <input
              type="color"
              value={rgb_hex(hex)}
              oninput={(event) => preview(with_alpha(event.currentTarget.value, alpha_of(hex)))}
              onchange={(event) => commit(with_alpha(event.currentTarget.value, alpha_of(hex)))}
            />
          </label>
          <Input
            size="sm"
            class="font-mono text-2xs uppercase tabular-nums"
            aria-label="Hex colour"
            spellcheck="false"
            maxlength={9}
            bind:value={hex_text}
            onchange={commit_text}
            onkeydown={(event) => event.key === "Enter" && commit_text()}
          />
        </div>
      {/if}
    </div>
  </div>

  {#if !transparent}
    <label class="flex items-center gap-2 text-2xs text-foreground/65">
      Alpha
      <Slider
        size="sm"
        min={0}
        max={255}
        class="flex-1"
        value={alpha_of(hex)}
        oninput={(event) => preview(with_alpha(hex, Number(event.currentTarget.value)))}
        onchange={(event) => commit(with_alpha(hex, Number(event.currentTarget.value)))}
      />
      <span class="w-7 text-right font-mono tabular-nums">{Math.round((alpha_of(hex) / 255) * 100)}%</span>
    </label>
  {/if}

  <div class="flex items-center gap-1">
    <span class="flex-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
      Palette <span class="font-mono tracking-normal normal-case tabular-nums">{palette.length - 1}/{MAX_COLORS - 1}</span>
    </span>
    <IconButton label="Load a preset palette" size="sm" onclick={presets}><PaletteIcon weight="bold" /></IconButton>
    <IconButton label="Add colour" size="sm" disabled={palette.length >= MAX_COLORS} onclick={add}><PlusIcon weight="bold" /></IconButton>
    <IconButton label="Remove colour" size="sm" disabled={transparent} onclick={remove}><MinusIcon weight="bold" /></IconButton>
  </div>

  <div class="swatches grid min-h-0 content-start gap-1 overflow-auto pb-1" role="listbox" aria-label="Palette colours">
    {#each palette as color, i (i)}
      <button
        type="button"
        role="option"
        class="swatch"
        class:empty={i === 0}
        class:primary={i === editor.primary}
        class:secondary={i === editor.secondary}
        style:--swatch={color}
        aria-selected={i === editor.primary}
        title="{i === 0 ? 'Transparent' : color.toUpperCase()} · #{i} · click for primary, right-click for secondary"
        aria-label={i === 0 ? "Transparent" : `Colour ${i}, ${color}`}
        onclick={() => (editor.primary = i)}
        oncontextmenu={(event) => {
          event.preventDefault();
          editor.secondary = i;
        }}
      ></button>
    {/each}
  </div>
</section>

<style>
  .swatches {
    grid-template-columns: repeat(auto-fill, minmax(1.375rem, 1fr));
  }

  .swatch,
  .well,
  .picker {
    border-radius: var(--radius-xs);
    background:
      linear-gradient(var(--swatch), var(--swatch)),
      repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 18%, transparent);
  }

  .swatch {
    aspect-ratio: 1;
    cursor: pointer;
    transition: scale 120ms var(--ease-out);
  }

  .swatch:hover {
    scale: 1.12;
  }

  .swatch.empty,
  .well.empty {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
  }

  .swatch.secondary {
    outline: 1.5px dashed var(--foreground);
    outline-offset: 1px;
  }

  .swatch.primary {
    outline: 2px solid var(--foreground);
    outline-offset: 1px;
    z-index: 1;
  }

  .swatch:focus-visible,
  .well:focus-visible,
  .picker:has(:focus-visible) {
    outline: 2px solid var(--cottontail);
    outline-offset: 1px;
  }

  .well {
    border-radius: var(--radius-sm);
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--foreground) 22%, transparent),
      0 0 0 2px var(--background-light);
    cursor: pointer;
  }

  .picker {
    display: block;
    overflow: hidden;
    cursor: pointer;
  }

  .picker input {
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .swatches {
      grid-template-columns: repeat(auto-fill, minmax(2rem, 1fr));
    }
  }
</style>
