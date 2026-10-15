<script lang="ts">
  import type { Editor } from "./editor.svelte";

  interface Props {
    editor: Editor;
    popover: string;
    anchor: string;
    size?: "sm" | "md";
    onopen: () => void;
  }

  let { editor, popover, anchor, size = "md", onopen }: Props = $props();

  const palette = $derived(editor.display.palette);
</script>

<div class={["wells relative shrink-0", size === "md" ? "size-11" : "size-9"]} role="group" aria-label="Current colours">
  <button
    type="button"
    class="well secondary absolute right-0 bottom-0"
    class:empty={editor.secondary === 0}
    style:--swatch={palette[editor.secondary]}
    title="Second colour, drawn with the right button. Click to swap (X)"
    aria-label="Swap with the second colour"
    onclick={() => ([editor.primary, editor.secondary] = [editor.secondary, editor.primary])}
  ></button>
  <button
    type="button"
    class="well primary absolute top-0 left-0 z-1"
    class:empty={editor.primary === 0}
    style:--swatch={palette[editor.primary]}
    style:anchor-name={anchor}
    title="Edit this colour"
    aria-label="Edit the current colour"
    popovertarget={popover}
    onclick={onopen}
  ></button>
</div>

<style>
  .well {
    width: 68%;
    height: 68%;
    border-radius: var(--radius-sm);
    cursor: pointer;
    background:
      linear-gradient(var(--swatch), var(--swatch)),
      repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--foreground) 22%, transparent),
      0 0 0 2px var(--background-light);
  }

  .well.empty {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 22%, var(--background)) 0 25%, var(--background) 0 50%) 0 0 / 8px 8px;
  }

  .well:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 1px;
  }
</style>
