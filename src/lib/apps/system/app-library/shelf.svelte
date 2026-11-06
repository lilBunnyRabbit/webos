<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { Button, IconButton } from "$lib/core/components/ui";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon } from "phosphor-svelte";
  import AppCard from "./app-card.svelte";
  import { ScrollRow } from "./scroll-row.svelte";

  interface Props {
    id: string;
    label: string;
    description?: string;
    apps: AppListing[];
    onselect: (manifest: AppListing) => void;
    onall?: () => void;
  }

  let { id, label, description, apps, onselect, onall }: Props = $props();

  const row = new ScrollRow();
</script>

<section class="flex flex-col gap-3" aria-labelledby="shelf-{id}">
  <header class="flex items-end gap-2">
    <div class="min-w-0 flex-1">
      <h3 id="shelf-{id}" class="text-base leading-tight font-semibold">{label}</h3>
      {#if description}<p class="truncate text-2xs text-foreground/65">{description}</p>{/if}
    </div>
    {#if onall}<Button size="sm" variant="quiet" onclick={onall}>See all</Button>{/if}
    {#if row.scrolls}
      <div class="hidden gap-1 pointer-fine:flex">
        <IconButton label="Scroll {label} back" size="sm" variant="secondary" class="rounded-full" disabled={row.at_start} onclick={() => row.step(-1)}>
          <CaretLeftIcon weight="bold" />
        </IconButton>
        <IconButton label="Scroll {label} on" size="sm" variant="secondary" class="rounded-full" disabled={row.at_end} onclick={() => row.step(1)}>
          <CaretRightIcon weight="bold" />
        </IconButton>
      </div>
    {/if}
  </header>
  <!-- The padding and matching negative margins give the cards' rings, hover shadows and focus outlines room: a horizontal scroller clips both axes. -->
  <ul
    {@attach row.attach}
    class="-mx-4 -my-2 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] @2xl:-mx-8 @2xl:scroll-px-8 @2xl:px-8"
  >
    {#each apps as manifest (manifest.id)}
      <AppCard {manifest} {onselect} class="w-[min(17rem,80cqi)] shrink-0 snap-start pointer-coarse:snap-always" />
    {/each}
  </ul>
</section>
