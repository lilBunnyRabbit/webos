<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { ThumbCache } from "./thumbs.svelte";

  const {
    cache,
    index,
    rotation = 0,
    class: class_name,
  }: {
    cache: ThumbCache | null;
    index: number | null;
    rotation?: number;
    class?: string;
  } = $props();

  const url = $derived(cache && index !== null ? cache.urls.get(index) : undefined);

  function observe(node: HTMLElement) {
    if (!cache || index === null) return;
    const target = { cache, index };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) target.cache.want(target.index);
        else target.cache.unwant(target.index);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      target.cache.unwant(target.index);
    };
  }
</script>

<div {@attach observe} class={cn("grid aspect-square place-items-center overflow-hidden", class_name)}>
  {#if index === null}
    <div class="aspect-[1/1.414] h-[85%] bg-[light-dark(var(--background-lightest),var(--foreground))] shadow-raised transition-transform duration-200" style:rotate="{rotation}deg"></div>
  {:else if url}
    <img src={url} alt="" draggable="false" class="max-h-full max-w-full shadow-raised transition-transform duration-200" style:rotate="{rotation}deg" />
  {:else}
    <div class="aspect-[1/1.414] h-[85%] animate-pulse rounded-xs bg-foreground/8"></div>
  {/if}
</div>
