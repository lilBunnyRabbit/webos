<script lang="ts">
  import kernel, { type AppId, type StoreService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import ProgressRing from "./progress-ring.svelte";

  /** A ring over the app's icon while its files download (ADR-077). Sits in a `relative` icon tile, under `AppBadge`. */
  let { app_id, class: class_name = "" }: { app_id: AppId; class?: string } = $props();

  const store = $derived(kernel.service<StoreService>("store"));
  const progress = $derived(store.progress(app_id));
  const percent = $derived(progress === null ? 0 : Math.round(progress * 100));
</script>

{#if progress !== null}
  <span
    role="progressbar"
    aria-label="Downloading"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
    class={cn("pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-background/60", class_name)}
  >
    <ProgressRing {percent} class="size-[70%]" />
  </span>
{/if}
