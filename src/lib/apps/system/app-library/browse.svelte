<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import { Badge, Button, EmptyState, IconButton, Select } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ClockCounterClockwise as ClockCounterClockwiseIcon,
    DownloadSimple as DownloadSimpleIcon,
    Files as FilesIcon,
    ListBullets as ListBulletsIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Sparkle as SparkleIcon,
    SquaresFour as SquaresFourIcon,
    Sticker as StickerIcon,
    TerminalWindow as TerminalWindowIcon,
    Trophy as TrophyIcon,
  } from "phosphor-svelte";
  import IconTile from "./icon-tile.svelte";
  import { category_label, LIBRARY_CATEGORIES, LibraryCategory, LibraryFilter, LibrarySort, SearchSection, ViewMode, type LibrarySection } from "./library";
  import StoreButton from "./store-button.svelte";
  import StoreRow from "./store-row.svelte";

  interface Props {
    title: string;
    category: LibraryCategory;
    sections: LibrarySection[];
    filters: LibraryFilter[];
    sort: LibrarySort;
    view: ViewMode;
    fresh: ReadonlySet<string>;
    updated: ReadonlySet<string>;
    onselect: (manifest: AppListing) => void;
  }

  let { title, category = $bindable(), sections, filters = $bindable(), sort = $bindable(), view = $bindable(), fresh, updated, onselect }: Props = $props();

  const FILTERS = [
    { id: LibraryFilter.WIDGET, label: "Has widget", icon: StickerIcon },
    { id: LibraryFilter.FILES, label: "Opens files", icon: FilesIcon },
    { id: LibraryFilter.COMMANDS, label: "Has commands", icon: TerminalWindowIcon },
    { id: LibraryFilter.USED, label: "Used before", icon: ClockCounterClockwiseIcon },
    { id: LibraryFilter.NOT_INSTALLED, label: "Not installed", icon: DownloadSimpleIcon },
  ];

  const shown = $derived(sections.reduce((sum, section) => sum + section.apps.length, 0));

  function toggle(filter: LibraryFilter) {
    filters = filters.includes(filter) ? filters.filter((value) => value !== filter) : [...filters, filter];
  }
</script>

{#snippet freshness(manifest: AppListing)}
  {#if fresh.has(manifest.id)}<Badge tone="primary">New</Badge>{:else if updated.has(manifest.id)}<Badge tone="info">Updated</Badge>{/if}
{/snippet}

<div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-5 pb-8 @2xl:px-8 @2xl:pt-7">
  <header class="flex flex-wrap items-center gap-2">
    <div class="min-w-0 flex-1 basis-full @xl:basis-0">
      <h2 class="text-2xl leading-tight font-semibold">{title}</h2>
      <p class="text-2xs text-foreground/65">{shown} app{shown === 1 ? "" : "s"}</p>
    </div>
    <!-- The narrow tab row holds only the four places; categories are picked here (and on Discover). -->
    <Select
      bind:value={category}
      size="sm"
      class="w-auto @2xl:hidden"
      aria-label="Category"
      options={LIBRARY_CATEGORIES.map(({ id, label }) => ({ value: id, label: id === LibraryCategory.ALL ? "All categories" : label }))}
    />
    <Select
      bind:value={sort}
      size="sm"
      class="w-auto"
      aria-label="Sort"
      options={[
        { value: LibrarySort.NAME, label: "A–Z" },
        { value: LibrarySort.CATEGORY, label: "By category" },
        { value: LibrarySort.RECENT, label: "Recently added / updated" },
      ]}
    />
    <div role="group" aria-label="View" class="flex">
      <IconButton label="Grid" size="sm" pressed={view === ViewMode.GRID} onclick={() => (view = ViewMode.GRID)}><SquaresFourIcon /></IconButton>
      <IconButton label="List" size="sm" pressed={view === ViewMode.LIST} onclick={() => (view = ViewMode.LIST)}><ListBulletsIcon /></IconButton>
    </div>
  </header>

  <div role="group" aria-label="Filters" class="-mx-4 -my-1 flex gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] @xl:mx-0 @xl:my-0 @xl:flex-wrap @xl:overflow-visible @xl:px-0 @xl:py-0">
    {#each FILTERS as filter (filter.id)}
      <Button size="sm" variant="quiet" class="shrink-0 rounded-full ring-1 ring-foreground/10 ring-inset aria-pressed:ring-primary/30" pressed={filters.includes(filter.id)} onclick={() => toggle(filter.id)}>
        <filter.icon weight={filters.includes(filter.id) ? "fill" : "regular"} />
        {filter.label}
      </Button>
    {/each}
  </div>

  {#if sections.length === 0}
    <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description="No app here has everything the filters ask for." class="py-10">
      {#snippet actions()}
        {#if filters.length}<Button size="sm" onclick={() => (filters = [])}>Clear filters</Button>{/if}
      {/snippet}
    </EmptyState>
  {/if}

  {#each sections as section (section.id)}
    <section class="flex flex-col gap-2">
      {#if section.label}
        <h3 class="flex items-center gap-1 pt-2 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
          {#if section.id === SearchSection.SUGGESTED}<SparkleIcon weight="fill" class="size-3 text-primary" />{/if}{section.label}
        </h3>
      {/if}
      {#if view === ViewMode.GRID}
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9.5rem),1fr))] gap-3">
          {#each section.apps as manifest (manifest.id)}
            <li
              class="relative flex flex-col items-center gap-2 rounded-xl bg-background-light px-2 pt-4 pb-3 text-center ring-1 ring-foreground/10 transition-shadow duration-150 hover:shadow-raised hover:ring-foreground/20 has-[.tile-open:focus-visible]:outline-2 has-[.tile-open:focus-visible]:outline-cottontail"
              draggable="true"
              ondragstart={(event) => set_drag_app(event, manifest.id)}
            >
              <IconTile {manifest} class="mb-1" />
              <div class="flex max-w-full flex-col gap-0.5">
                <button
                  type="button"
                  class="tile-open line-clamp-2 max-w-full text-ui leading-tight font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                  onclick={() => onselect(manifest)}>{manifest.name}</button
                >
                <span class="flex items-center justify-center gap-1 text-2xs text-foreground/65">
                  <span class="truncate">{category_label(manifest)}</span>
                  {#if manifest.achievement_count}
                    <span class="flex shrink-0 items-center gap-0.5" title="{manifest.achievement_count} achievements"
                      ><span aria-hidden="true">·</span><TrophyIcon class="size-3" weight="fill" aria-hidden="true" /><span class="sr-only">Achievements:</span
                      >{manifest.achievement_count}</span
                    >
                  {/if}
                </span>
              </div>
              <span class={cn("flex min-h-5 items-center", !fresh.has(manifest.id) && !updated.has(manifest.id) && "hidden")}>{@render freshness(manifest)}</span>
              <StoreButton {manifest} class="relative mt-auto pt-1" />
            </li>
          {/each}
        </ul>
      {:else}
        <ul class="flex flex-col">
          {#each section.apps as manifest (manifest.id)}
            <StoreRow {manifest} {onselect} />
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
