<script lang="ts">
  import type { Snippet } from "svelte";
  import kernel, { WindowFlag, type NotificationsService, type WindowId, type WindowsService } from "$lib/core/api";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { ArrowClockwise as ArrowClockwiseIcon, Warning as WarningIcon } from "phosphor-svelte";

  let { zoom, window_id, children }: { zoom: number; window_id: WindowId; children?: Snippet } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(window_id)!);

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  // A minimized window's crash is otherwise invisible.
  function report(error: unknown) {
    console.error(`[${instance.app.id}] crashed:`, error);
    kernel.service<NotificationsService>("notifications").notify(instance.app.id, {
      type: "error",
      title: `${instance.app.manifest.name} crashed`,
      message: message(error),
    });
  }
</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {#await instance.app.component}
    <div class="grid h-full place-items-center"><Spinner label="Loading app" /></div>
  {:then Component}
    <svelte:boundary onerror={report}>
      <Component {...instance.app.props} />

      {#snippet failed(error, reset)}
        <EmptyState icon={WarningIcon} tone="error" title="This app crashed" description={message(error)}>
          {#snippet actions()}
            <Button onclick={reset}><ArrowClockwiseIcon weight="bold" /> Restart app</Button>
            <Button variant="quiet" onclick={() => windows.close(window_id)}>Close window</Button>
          {/snippet}
        </EmptyState>
      {/snippet}
    </svelte:boundary>
  {:catch error}
    <EmptyState icon={WarningIcon} tone="error" title="This app failed to load" description={message(error)} />
  {/await}

  {#if instance.flags.has(WindowFlag.DEBUG)}
    {@render children?.()}
  {/if}
</div>
