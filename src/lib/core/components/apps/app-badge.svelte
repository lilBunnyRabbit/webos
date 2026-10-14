<script lang="ts">
  import kernel, { type AppId, type AppsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";

  /** The app's manifest `badge` count on its icon (ADR-034). Reading it is what starts the app's check; unmounting the last one stops it. */
  let { app_id, class: class_name = "" }: { app_id: AppId; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const count = $derived(apps.get(app_id)?.badge?.() ?? 0);
</script>

{#if count > 0}
  <span
    class={cn(
      "pointer-events-none absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-background tabular-nums ring-2 ring-background-light",
      class_name
    )}
    aria-label={`${count} pending`}>{count > 99 ? "99+" : count}</span
  >
{/if}
