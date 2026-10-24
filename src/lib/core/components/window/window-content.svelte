<script lang="ts">
  import type { Snippet } from "svelte";
  import kernel, { WindowFlag, type AppsService, type NotificationsService, type WindowId, type WindowsService } from "$lib/core/api";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { ArrowClockwise as ArrowClockwiseIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { error_message } from "$lib/core/utils";
  import LoadFailed from "../update/load-failed.svelte";
  import { failed_module_url, failure_details, retry_url } from "../update/load-error";

  let { zoom, window_id, children }: { zoom: number; window_id: WindowId; children?: Snippet } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const instance = $derived(windows.get(window_id)!);

  type AppComponent = Awaited<typeof instance.app.component>;

  let retried = $state<Promise<AppComponent> | null>(null);
  let attempts = 0;
  const component = $derived(retried ?? instance.app.component);

  function retry(error: unknown) {
    const url = failed_module_url(error, location.origin);
    attempts += 1;
    retried = url
      ? (import(/* @vite-ignore */ retry_url(url, attempts)) as Promise<{ default: AppComponent }>).then((module) => module.default)
      : (apps.get(instance.app.id)?.component() ?? instance.app.component);
  }

  function close() {
    void windows.close(window_id);
  }

  // A minimized window's crash is otherwise invisible.
  function report(error: unknown) {
    console.error(`[${instance.app.id}] crashed:`, error);
    kernel.service<NotificationsService>("notifications").notify(instance.app.id, {
      type: "error",
      title: `${instance.app.manifest.name} crashed`,
      message: error_message(error),
    });
  }
</script>

<div class="h-full w-full overflow-auto @container" style:zoom>
  {#await component}
    <!-- Most apps load faster than a blink; the spinner only fades in once loading is noticeably slow. -->
    <div class="grid h-full place-items-center animate-[pop-in_160ms_ease-out_300ms_both]"><Spinner label="Loading app" /></div>
  {:then Component}
    <svelte:boundary onerror={report}>
      <Component {...instance.app.props} />

      {#snippet failed(error, reset)}
        <EmptyState
          icon={WarningIcon}
          tone="error"
          title="{instance.app.manifest.name} crashed"
          description="Restarting it reloads the app; anything it saved stays."
          details={failure_details(error)}
        >
          {#snippet actions()}
            <Button variant="primary" class="pointer-coarse:h-11" onclick={reset}><ArrowClockwiseIcon weight="bold" /> Restart app</Button>
            <Button variant="quiet" class="pointer-coarse:h-11" onclick={close}>Close window</Button>
          {/snippet}
        </EmptyState>
      {/snippet}
    </svelte:boundary>
  {:catch error}
    <LoadFailed {error} name={instance.app.manifest.name} onretry={() => retry(error)} onclose={close} />
  {/await}

  {#if instance.flags.has(WindowFlag.DEBUG)}
    {@render children?.()}
  {/if}
</div>
