<script lang="ts">
  import type { Editor } from "./editor.svelte";
  import HopspriteLayers from "./hopsprite-layers.svelte";

  interface Props {
    id: string;
    anchor: string;
    editor: Editor;
  }

  let { id, anchor, editor }: Props = $props();
</script>

<div {id} popover="auto" class="hs-popover m-0 w-72 rounded-xl bg-background-lighter p-2 text-foreground shadow-popover" style="position-anchor: {anchor}">
  <HopspriteLayers {editor} class="max-h-80" />
</div>

<style>
  .hs-popover {
    position-area: top span-left;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 6px;
  }
</style>
