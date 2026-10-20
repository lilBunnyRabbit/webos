<script lang="ts">
  import kernel, { type AppManifest, type AppsService } from "$lib/core/api";
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";

  const PAGE_SIZE = 4;

  let { tile, class: class_name }: { tile: Snippet<[AppManifest]>; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const pages = $derived.by(() => {
    const manifests = apps.recent.flatMap((id) => apps.get(id) ?? []);
    return Array.from({ length: Math.ceil(manifests.length / PAGE_SIZE) }, (_, index) => manifests.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE));
  });

  let scroller: HTMLElement | null = $state(null);
  let scrolled = $state(0);
  const page = $derived(Math.min(scrolled, pages.length - 1));

  function go_to(index: number) {
    scroller?.scrollTo({ top: index * scroller.clientHeight, behavior: motion_reduced() ? "instant" : "smooth" });
  }
</script>

{#if pages.length > 0}
  <section class={class_name} aria-label="Recent apps">
    <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">Recent</p>
    <!-- One row tall: an invisible copy of a tile sets the height, and the pages scroll inside it, snapping a page at a
         time to the wheel or a swipe. contain-size keeps the pages from growing the row. -->
    <div class="grid">
      <ul class="invisible col-start-1 row-start-1 grid grid-cols-4 gap-1" aria-hidden="true" inert>
        {@render tile(pages[0][0])}
      </ul>
      <div
        bind:this={scroller}
        onscroll={(event) => {
          const element = event.currentTarget;
          scrolled = Math.round(element.scrollTop / Math.max(1, element.clientHeight));
        }}
        class="col-start-1 row-start-1 snap-y snap-mandatory overflow-y-auto contain-size [scrollbar-width:none]"
      >
        {#each pages as list, index (index)}
          <ul class="grid h-full snap-start snap-always grid-cols-4 gap-1" aria-label="Page {index + 1} of {pages.length}">
            {#each list as manifest (manifest.id)}
              {@render tile(manifest)}
            {/each}
          </ul>
        {/each}
      </div>
    </div>
    {#if pages.length > 1}
      <div class="flex justify-center gap-1.5 pt-1.5" role="tablist" aria-label="Recent pages">
        {#each pages as _, index (index)}
          <button
            role="tab"
            aria-selected={index === page}
            aria-label="Page {index + 1}"
            class={cn("h-1.5 rounded-full transition-all duration-200", index === page ? "w-4 bg-primary" : "w-1.5 bg-foreground/30")}
            onclick={() => go_to(index)}
          ></button>
        {/each}
      </div>
    {/if}
  </section>
{/if}
