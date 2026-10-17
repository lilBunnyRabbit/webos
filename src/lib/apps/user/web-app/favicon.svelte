<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Globe as GlobeIcon } from "phosphor-svelte";

  let { src, class: class_name }: { src: string | null; class?: string } = $props();

  let loaded = $state<string | null>(null);
</script>

{#if src}
  <img {src} alt="" class={cn("shrink-0 object-contain", loaded !== src && "hidden", class_name)} referrerpolicy="no-referrer" onload={() => (loaded = src)} />
{/if}
{#if !src || loaded !== src}
  <GlobeIcon weight="duotone" class={cn("shrink-0 text-foreground/65", class_name)} />
{/if}
