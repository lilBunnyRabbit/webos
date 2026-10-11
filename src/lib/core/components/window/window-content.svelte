<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { EmptyState, Spinner } from "$lib/core/components/ui";
  import { Warning as WarningIcon } from "phosphor-svelte";
  import { create_storage_handle, create_window_handle, set_app_context } from "$lib/core/contexts/app";

  let { zoom, window_id, children }: { zoom: number; window_id: WindowId; children?: Snippet } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(window_id)!);

  // Set once: a window's id and app never change, and context can only be set during init.
  untrack(() => {
    const app_id = instance.app.id;
    set_app_context({
      window_id,
      app_id,
      window: create_window_handle(window_id),
      storage: create_storage_handle(app_id),
    });
  });
</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {#await instance.app.component}
    <div class="grid h-full place-items-center"><Spinner label="Loading app" /></div>
  {:then Component}
    <Component {...instance.app.props} />
  {:catch error}
    <EmptyState icon={WarningIcon} tone="error" title="This app failed to load" description={error instanceof Error ? error.message : String(error)} />
  {/await}

  {#if instance.flags.has(WindowFlag.DEBUG)}
    {@render children?.()}
  {/if}
</div>
