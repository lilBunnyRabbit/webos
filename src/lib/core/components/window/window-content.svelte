<script lang="ts">
  import type { WindowId } from "$lib/core/api";

  let { zoom, windowId, children }: { zoom: number; windowId: WindowId; children?: any } = $props();

</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {@render children?.()}
  {`content ${windowId}`}
</div>
