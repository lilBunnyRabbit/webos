<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { create_storage_handle, create_window_handle, set_app_context } from "$lib/core/contexts/app";

  let { zoom, window_id, children }: { zoom: number; window_id: WindowId; children?: any } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(window_id)!);

  // Set once: a window's id and app never change, and context can only be set during init.
  const app_id = untrack(() => instance.app.id);
  set_app_context({
    window_id,
    app_id,
    window: create_window_handle(window_id),
    storage: create_storage_handle(app_id),
  });
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
