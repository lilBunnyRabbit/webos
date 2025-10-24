<script lang="ts">
  import type { WindowId } from "$lib/core/stores";
  import { WM } from "$lib/core/stores";

  let { zoom, windowId, children }: { zoom: number; windowId: WindowId; children?: any } = $props();

  const content = $derived(WM.windows.get(windowId)!.tmp__content);

  $effect(() => {
    console.log(zoom);
  });
</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {@render children?.()}
  {content}
</div>
