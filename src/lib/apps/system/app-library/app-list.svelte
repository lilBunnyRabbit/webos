<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { Badge } from "$lib/core/components/ui";
  import AppCard from "./app-card.svelte";
  import { ViewMode } from "./library";
  import StoreRow from "./store-row.svelte";

  interface Props {
    apps: AppListing[];
    view: ViewMode;
    onselect: (manifest: AppListing) => void;
    fresh?: ReadonlySet<string>;
    updated?: ReadonlySet<string>;
  }

  let { apps, view, onselect, fresh, updated }: Props = $props();
</script>

{#if view === ViewMode.GRID}
  <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
    {#each apps as manifest (manifest.id)}
      <AppCard {manifest} {onselect} lines={3}>
        {#snippet badge()}
          {#if fresh?.has(manifest.id)}<Badge tone="primary">New</Badge>{:else if updated?.has(manifest.id)}<Badge tone="info">Updated</Badge>{/if}
        {/snippet}
      </AppCard>
    {/each}
  </ul>
{:else}
  <ul class="flex flex-col">
    {#each apps as manifest (manifest.id)}<StoreRow {manifest} {onselect} />{/each}
  </ul>
{/if}
