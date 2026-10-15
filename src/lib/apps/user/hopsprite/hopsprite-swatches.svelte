<script lang="ts">
  import { Plus as PlusIcon } from "phosphor-svelte";
  import { add_color } from "./document";
  import type { Editor } from "./editor.svelte";
  import { MAX_COLORS } from "./model";

  let { editor, class: class_name }: { editor: Editor; class?: string } = $props();

  const palette = $derived(editor.display.palette);

  function add() {
    const index = editor.primary;
    const result = add_color(editor.sprite, index === 0 ? "#ffffffff" : editor.sprite.palette[index]);
    if (!result) return;
    editor.apply(() => result.sprite);
    editor.primary = result.index;
  }
</script>

<div class={["swatches grid content-start gap-1", class_name]} role="listbox" aria-label="Palette colours">
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
      title="{i === 0 ? 'Transparent' : color.slice(0, 7).toUpperCase()} · click to draw with it, right-click for the second colour"
      aria-label={i === 0 ? "Transparent" : `Colour ${i}, ${color}`}
      onclick={() => (editor.primary = i)}
      oncontextmenu={(event) => {
        event.preventDefault();
        editor.secondary = i;
      }}
    ></button>
  {/each}
  {#if palette.length < MAX_COLORS}
    <button type="button" class="add grid place-items-center text-foreground/65" title="Add a colour (a copy of the current one)" aria-label="Add a colour" onclick={add}>
      <PlusIcon weight="bold" class="size-3.5" />
    </button>
  {/if}
</div>

<style>
  .swatches {
    grid-template-columns: repeat(auto-fill, minmax(1.5rem, 1fr));
  }

  .swatch,
  .add {
    aspect-ratio: 1;
    border-radius: var(--radius-xs);
    cursor: pointer;
  }

  .swatch {
    background:
      linear-gradient(var(--swatch), var(--swatch)),
      repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 14%, transparent);
    transition: scale 120ms var(--ease-out);
  }

  .swatch:hover {
    scale: 1.1;
  }

  .swatch.empty {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
  }

  .swatch.secondary {
    outline: 1.5px dashed color-mix(in oklch, var(--foreground) 70%, transparent);
    outline-offset: 1px;
  }

  .swatch.primary {
    outline: 2px solid var(--foreground);
    outline-offset: 1px;
    z-index: 1;
  }

  .add {
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  .add:hover {
    background: color-mix(in oklch, var(--foreground) 8%, transparent);
  }

  .swatch:focus-visible,
  .add:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 1px;
  }

  @media (pointer: coarse) {
    .swatches {
      grid-template-columns: repeat(auto-fill, minmax(2rem, 1fr));
    }
  }
</style>
