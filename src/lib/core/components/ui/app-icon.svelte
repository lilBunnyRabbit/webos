<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { ClassValue } from "svelte/elements";

  interface Props {
    src: string;
    class?: ClassValue | null;
  }

  let { src, class: class_name }: Props = $props();

  let loaded_src = $state<string | null>(null);
  const loaded = $derived(loaded_src === src);

  // Probes the same URL the masks use: an icon already drawn is in the memory cache and `complete` at once, so no skeleton flash.
  $effect.pre(() => {
    const current = src;
    const image = new Image();
    image.src = current;
    if (image.complete) {
      loaded_src = current;
      return;
    }
    image.onload = () => (loaded_src = current);
    return () => (image.onload = null);
  });

  const layer = "absolute inset-0 mask-contain mask-center mask-no-repeat";
</script>

<span aria-hidden="true" class={cn("relative inline-block size-[1em] shrink-0", !loaded && "rounded-[22%] bg-foreground/10", class_name)}>
  {#if loaded}
    <span class={cn(layer, "bg-current")} style:mask-image={`url("${src}")`}></span>
    <span class={cn(layer, "bg-primary")} style:mask-image={`url("${src}#primary")`}></span>
    <span class={cn(layer, "bg-secondary")} style:mask-image={`url("${src}#secondary")`}></span>
  {/if}
</span>
