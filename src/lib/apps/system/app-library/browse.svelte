<script lang="ts">
  import type { AppListing } from "$lib/core/api";
  import { Button, EmptyState, Select } from "$lib/core/components/ui";
  import {
    ClockCounterClockwise as ClockCounterClockwiseIcon,
    DownloadSimple as DownloadSimpleIcon,
    Files as FilesIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Sparkle as SparkleIcon,
    Star as StarIcon,
    Sticker as StickerIcon,
    TerminalWindow as TerminalWindowIcon,
  } from "phosphor-svelte";
  import AppList from "./app-list.svelte";
  import { LIBRARY_CATEGORIES, LibraryCategory, LibraryFilter, LibrarySort, SearchSection, ViewMode, type LibrarySection } from "./library";
  import ViewToggle from "./view-toggle.svelte";

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
    { id: LibraryFilter.FAVOURITES, label: "Favourites", icon: StarIcon },
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
    <ViewToggle bind:view />
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
      <AppList apps={section.apps} {view} {onselect} {fresh} {updated} />
    </section>
  {/each}
</div>
