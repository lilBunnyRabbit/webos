<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import AppProgress from "$lib/core/components/apps/app-progress.svelte";
  import { cn } from "$lib/core/utils";

  let { manifest, size = "md", class: class_name }: { manifest: AppListing; size?: "sm" | "md" | "lg" | "xl"; class?: string } = $props();

  const TILE = {
    sm: "size-8 rounded-lg",
    md: "size-12 rounded-xl",
    lg: "size-16 rounded-2xl",
    xl: "size-20 rounded-2xl @2xl:size-24",
  };
  const GLYPH = { sm: "size-5", md: "size-7", lg: "size-9", xl: "size-11 @2xl:size-13" };
</script>

<span class={cn("relative grid shrink-0 place-items-center bg-background-light shadow-raised ring-1 ring-foreground/10", TILE[size], class_name)}>
  <manifest.icon class={GLYPH[size]} weight="duotone" />
  {#if size !== "sm"}<AppProgress app_id={manifest.id} /><AppBadge app_id={manifest.id} />{/if}
</span>
