<script lang="ts">
  import kernel, { type AppId, type StoreService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";

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
    <svg viewBox="0 0 24 24" class="size-[70%] -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke-width="2.5" class="stroke-foreground/20" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke-width="2.5"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="100"
        stroke-dashoffset={100 - percent}
        class="stroke-primary transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  </span>
{/if}
