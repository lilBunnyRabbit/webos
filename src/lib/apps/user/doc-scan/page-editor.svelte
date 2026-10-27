<script lang="ts">
  import { Button, Segmented, Spinner } from "$lib/core/components/ui";
  import { QuadFrame } from "$kit/components/quad-frame";
  import { ArrowsOut as ArrowsOutIcon, Eye as EyeIcon, MagicWand as MagicWandIcon, PencilSimple as PencilSimpleIcon } from "phosphor-svelte";
  import type { ScanPage } from "./page.svelte";
  import { FILTER_LABELS, PageFilter } from "./warp";

  interface Props {
    page: ScanPage;
    preview?: boolean;
  }

  let { page, preview = $bindable(false) }: Props = $props();

  const FILTERS = Object.values(PageFilter).map((value) => ({ value, label: FILTER_LABELS[value] }));

  $effect(() => {
    if (preview && !page.current) void page.render();
  });
</script>

<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] @container">
  <p class={["border-b border-foreground/8 px-3 py-2 text-ui", page.error ? "bg-error/10" : page.found || preview ? "text-foreground/80" : "bg-warning/10"]} aria-live="polite">
    {#if page.error}
      {page.error}
    {:else if preview}
      The straightened page, as it goes into the PDF.
    {:else if page.found}
      Found the page's edges. Drag a corner if it's off.
    {:else if page.ready}
      Couldn't find the page's edges. Drag each corner onto a corner of the page.
    {:else}
      Looking for the page…
    {/if}
  </p>
  <div class="relative min-h-0 bg-background-darker">
    {#if !page.ready}
      <div class="grid h-full place-items-center"><Spinner label="Finding the page" /></div>
    {:else if preview}
      <div class="absolute inset-0 p-4">
        {#if page.result_url}
          <img src={page.result_url} alt="The straightened page" class="size-full object-contain" />
        {/if}
      </div>
    {:else}
      <QuadFrame
        bind:quad={() => page.quad!, (quad) => (page.quad = quad)}
        image={{ src: page.url, width: page.width, height: page.height }}
        alt="The photo of the page"
        labels={["Top left of the page", "Top right of the page", "Bottom right of the page", "Bottom left of the page"]}
        loupe
        class="absolute inset-0 p-6"
      />
    {/if}
    {#if page.busy && page.ready && preview}
      <div class="absolute inset-0 grid place-items-center bg-background-darker/60"><Spinner label="Straightening" /></div>
    {/if}
  </div>
  <div class="flex flex-wrap items-center gap-2 border-t border-foreground/8 bg-background-light px-3 py-2">
    <Segmented size="sm" label="Filter" options={FILTERS} bind:value={page.filter} />
    <div class="ml-auto flex flex-wrap items-center gap-1.5">
      {#if !preview}
        <Button size="sm" variant="quiet" disabled={!page.ready} onclick={() => page.edges()}><MagicWandIcon /> Find edges</Button>
        <Button size="sm" variant="quiet" disabled={!page.ready} onclick={() => page.whole()}><ArrowsOutIcon /> Whole photo</Button>
      {/if}
      <Button size="sm" disabled={!page.ready} onclick={() => (preview = !preview)}>
        {#if preview}<PencilSimpleIcon /> Corners{:else}<EyeIcon /> Preview{/if}
      </Button>
    </div>
  </div>
</div>
