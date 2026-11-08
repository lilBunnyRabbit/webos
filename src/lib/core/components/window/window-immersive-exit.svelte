<script lang="ts">
  import { ArrowsInSimple as ArrowsInSimpleIcon } from "phosphor-svelte";
  import kernel, { type WindowId, type WindowsService } from "$lib/core/api";
  import { IconButton } from "../ui";

  let { window_id }: { window_id: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
</script>

<!-- Its box is the window's immersive insets (window-immersive.ts): move one, move the other. -->
<IconButton
  label="Leave full screen"
  class="absolute top-2 right-2 z-10 rounded-full bg-background/55 text-foreground/80 ring-1 ring-foreground/10 backdrop-blur-sm hover:bg-background/80"
  onclick={() => windows.set_immersive(window_id, false)}
>
  <ArrowsInSimpleIcon weight="bold" />
</IconButton>
