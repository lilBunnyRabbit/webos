<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { IconButton, Input, Slider } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { ArrowsLeftRight as ArrowsLeftRightIcon, Palette as PaletteIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { alpha_of, is_hex, normalize_hex, rgb_hex, with_alpha } from "./color";
  import { remove_color, replace_palette, set_color, used_colors } from "./document";
  import type { Editor } from "./editor.svelte";
  import HopspriteSwatches from "./hopsprite-swatches.svelte";
  import { below } from "./menu";
  import { MAX_COLORS } from "./model";
  import { PALETTE_PRESETS } from "./palettes";

  interface Props {
    id: string;
    anchor: string;
    editor: Editor;
    with_palette: boolean;
  }

  let { id, anchor, editor, with_palette }: Props = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const palette = $derived(editor.display.palette);
  const index = $derived(editor.primary);
  const hex = $derived(palette[index] ?? "#00000000");
  const transparent = $derived(index === 0);

  let hex_text = $state("");
  $effect(() => {
    hex_text = transparent ? "" : hex.slice(1, alpha_of(hex) === 255 ? 7 : 9).toUpperCase();
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
    else hex_text = hex.slice(1, 7).toUpperCase();
  }

  async function remove() {
    if (transparent) return;
    if (used_colors(editor.sprite).has(index)) {
      const confirmed = await win.confirm(`Remove colour ${index}?`, {
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
</script>

<div {id} popover="auto" class="hs-popover m-0 w-68 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover" style="position-anchor: {anchor}">
  <div class="flex flex-col gap-3">
    {#if transparent}
      <div class="flex items-center gap-3">
        <span class="checker size-12 shrink-0 rounded-md"></span>
        <p class="text-2xs text-foreground/80">Transparent paints holes. Pick a colour to edit it.</p>
      </div>
    {:else}
      <div class="flex items-center gap-3">
        <label class="picker size-12 shrink-0 rounded-md" style:--swatch={hex} title="Pick a colour">
          <span class="sr-only">Colour {index}</span>
          <input
            type="color"
            value={rgb_hex(hex)}
            oninput={(event) => preview(with_alpha(event.currentTarget.value, alpha_of(hex)))}
            onchange={(event) => commit(with_alpha(event.currentTarget.value, alpha_of(hex)))}
          />
        </label>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Input
            size="sm"
            class="font-mono tabular-nums"
            aria-label="Hex colour"
            spellcheck="false"
            maxlength={9}
            bind:value={hex_text}
            onchange={commit_text}
            onkeydown={(event) => event.key === "Enter" && commit_text()}
          >
            {#snippet leading()}<span class="font-mono text-2xs">#</span>{/snippet}
          </Input>
          <label class="flex items-center gap-2 text-2xs text-foreground/80">
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
            <span class="w-8 text-right font-mono tabular-nums">{Math.round((alpha_of(hex) / 255) * 100)}%</span>
          </label>
        </div>
      </div>
    {/if}

    {#if with_palette}
      <HopspriteSwatches {editor} class="max-h-48 overflow-y-auto p-0.5" />
    {/if}

    <div class="flex items-center gap-1 border-t border-foreground/8 pt-2">
      <span class="flex-1 font-mono text-2xs text-foreground/80 tabular-nums">{palette.length - 1}/{MAX_COLORS - 1} colours</span>
      <IconButton label="Swap with the second colour (X)" size="sm" onclick={() => ([editor.primary, editor.secondary] = [editor.secondary, editor.primary])}>
        <ArrowsLeftRightIcon weight="bold" />
      </IconButton>
      <IconButton label="Load a preset palette" size="sm" onclick={presets}><PaletteIcon weight="bold" /></IconButton>
      <IconButton label="Remove this colour" size="sm" disabled={transparent} onclick={remove}><TrashIcon weight="bold" /></IconButton>
    </div>
  </div>
</div>

<style>
  .hs-popover {
    position-area: left span-bottom;
    position-try-fallbacks: top span-right, bottom span-right;
    margin: 8px;
  }

  .picker,
  .checker {
    display: block;
    overflow: hidden;
    cursor: pointer;
    background:
      linear-gradient(var(--swatch, transparent), var(--swatch, transparent)),
      repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 20%, transparent);
  }

  .picker:has(:focus-visible) {
    outline: 2px solid var(--cottontail);
    outline-offset: 1px;
  }

  .picker input {
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
</style>
