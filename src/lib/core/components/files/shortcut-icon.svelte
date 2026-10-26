<script lang="ts">
  import kernel, { type AppId, type AppsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { AppWindow as AppWindowIcon, ArrowUpRight as ArrowUpRightIcon } from "phosphor-svelte";

  /**
   * A `.desktop` shortcut: the target app's icon with a shortcut arrow, or a generic app glyph when unknown (ADR-022).
   * `badge={false}` drops the arrow where the surface already sets apps apart (the desktop and phone home tile them).
   */
  let { app_id, badge = true, class: class_name = "" }: { app_id: AppId | null; badge?: boolean; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(app_id ? apps.get(app_id) : undefined);
  $effect(() => {
    if (app_id && !manifest) void apps.catalogue();
  });
</script>

<span class={cn("relative inline-flex shrink-0", class_name)}>
  {#if manifest}
    <manifest.icon class="size-full" />
  {:else}
    <AppWindowIcon class="size-full" />
  {/if}
  {#if badge}
    <span class="absolute right-0 bottom-0 grid size-[45%] place-items-center rounded-sm bg-background ring-1 ring-foreground/40">
      <ArrowUpRightIcon class="size-full" weight="bold" />
    </span>
  {/if}
</span>
