<script lang="ts">
  import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";

  let { zoom, windowId, children }: { zoom: number; windowId: WindowId; children?: any } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(windowId)!);
</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {#await instance.app.component}
    <div class="flex items-center justify-center h-full">Loading...</div>
  {:then Component}
    <Component {...instance.app.props} />
  {:catch error}
    {`Error loading component: ${error}`}
  {/await}

  {#if instance.flags.has(WindowFlag.DEBUG)}
    {@render children?.()}
  {/if}
</div>
