<script lang="ts">
  import kernel, { type AppId, type AppsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { AppWindow as AppWindowIcon, ArrowUpRight as ArrowUpRightIcon } from "phosphor-svelte";

  /** A `.desktop` shortcut: the target app's icon with a shortcut arrow, or a generic app glyph when unknown (ADR-022). */
  let { app_id, class: class_name = "" }: { app_id: AppId | null; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(app_id ? apps.get(app_id) : undefined);
</script>

<span class={cn("relative inline-flex shrink-0", class_name)}>
  {#if manifest}
    <manifest.icon class="size-full" />
  {:else}
    <AppWindowIcon class="size-full" />
  {/if}
  <span class="absolute right-0 bottom-0 grid size-[45%] place-items-center rounded-sm bg-background ring-1 ring-foreground/40">
    <ArrowUpRightIcon class="size-full" weight="bold" />
  </span>
</span>
