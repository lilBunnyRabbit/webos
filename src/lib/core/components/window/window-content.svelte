<script lang="ts">
  import type { Snippet } from "svelte";
  import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { EmptyState, Spinner } from "$lib/core/components/ui";
  import { Warning as WarningIcon } from "phosphor-svelte";

  let { zoom, window_id, children }: { zoom: number; window_id: WindowId; children?: Snippet } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(window_id)!);

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
