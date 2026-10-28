<script lang="ts">
  import kernel, {
    introduced_apps,
    search_apps,
    updated_apps,
    type AiService,
    type AppListing,
    type AppsService,
    type SessionService,
    type StoreService,
    type VersionService,
    type WindowsService,
  } from "$lib/core/api";
  import { FEATURED } from "./featured";
  import { INTERESTS } from "$lib/core/api/services/apps/suggestions";
  import { get_app_context } from "$lib/core/contexts/app";
  import { SentenceSearch } from "$lib/core/components/apps/sentence-search.svelte";
  import { Button, button, EmptyState, IconButton, Input, SideNav, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowsClockwise as ArrowsClockwiseIcon,
    Books as BooksIcon,
    Compass as CompassIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Sparkle as SparkleIcon,
    SquaresFour as SquaresFourIcon,
    WifiSlash as WifiSlashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AppPage from "./app-page.svelte";
  import { AppSizes } from "./app-sizes.svelte";
  import Browse from "./browse.svelte";
  import { CATEGORY_ICONS } from "./category-icons";
  import Discover from "./discover.svelte";
  import { app_updates, collections, hero_cards, LibrarySortBy, new_apps, recently_updated, type Shelf } from "./discover";
  import {
    category_counts,
    category_of,
    LIBRARY_CATEGORIES,
    library_sections,
    LibraryCategory,
    LibraryFilter,
    LibrarySort,
    SearchSection,
    ViewMode,
  } from "./library";
  import LibraryPage from "./library-page.svelte";
  import { APP_LIBRARY_PROPS, place_of, StorePlace } from "./props";
  import StoreRow from "./store-row.svelte";
  import Updates from "./updates.svelte";
  import { waiting_download } from "./waiting";

  let { view: initial_view, app: initial_app }: Partial<z.infer<typeof APP_LIBRARY_PROPS>> = $props();

  const { window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const store = $derived(kernel.service<StoreService>("store"));
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const session = $derived(kernel.service<SessionService>("session"));
  const version = $derived(kernel.service<VersionService>("version"));
  const ai = $derived(kernel.service<AiService>("ai"));
  void kernel.service<VersionService>("version").load_changelog();

  const place = storage.window<StorePlace>(
    "place",
    untrack(() => (initial_view ? place_of(initial_view) : StorePlace.DISCOVER)),
    z.enum(Object.values(StorePlace))
  );
  const category = storage.window<LibraryCategory>("category", LibraryCategory.ALL, z.enum(Object.values(LibraryCategory)));
  const filters = storage.window<LibraryFilter[]>("filters", [], z.array(z.enum(Object.values(LibraryFilter))));
  const sort = storage.window<LibrarySort>("sort", LibrarySort.NAME, z.enum(Object.values(LibrarySort)));
  const view = storage.window<ViewMode>("view", ViewMode.GRID, z.enum(Object.values(ViewMode)));
  const library_sort = storage.window<LibrarySortBy>("library_sort", LibrarySortBy.RECENT, z.enum(Object.values(LibrarySortBy)));
  const selected_id = storage.window<string | null>("selected", untrack(() => initial_app) ?? null, z.string().nullable());
  const collection_id = storage.window<string | null>("collection", null, z.string().nullable());

  let query = $state("");
  let base: HTMLElement | null = $state(null);

  // Boot knows only the installed apps (ADR-077): the Store asks for the rest, again when the connection comes back.
  const CatalogueState = { LOADING: "loading", READY: "ready", OFFLINE: "offline" } as const;
  type CatalogueState = (typeof CatalogueState)[keyof typeof CatalogueState];
  let catalogue = $state<CatalogueState>(CatalogueState.LOADING);
  function load_catalogue() {
    if (catalogue === CatalogueState.READY) return;
    catalogue = CatalogueState.LOADING;
    void apps.catalogue().then((ready) => (catalogue = ready ? CatalogueState.READY : CatalogueState.OFFLINE));
  }
  load_catalogue();

  const manifests = $derived(apps.listings());
  const installed_list = $derived(apps.listings({ installed: true }));
  const installed = $derived(new Set(installed_list.map((manifest) => manifest.id)));
  const favourites = $derived(new Set(apps.favourites));
  const selected = $derived(selected_id.value ? (manifests.find((manifest) => manifest.id === selected_id.value) ?? null) : null);

  // No usage log for the filter; an open window, a recently closed one or a remembered window frame is what the OS already knows.
  const used = $derived(
    new Set([
      ...windows.list().flatMap((id) => windows.get(id)?.app.id ?? []),
      ...session.closed.map((snapshot) => snapshot.app_id),
      ...Object.keys(windows.frames),
    ])
  );

  const sentence = new SentenceSearch<AppListing>({
    apps: () => manifests,
    query: () => query,
    shown: () => search_apps(manifests, query),
    ai: () => ai,
  });

  const searching = $derived(query.trim().length > 0);
  const results = $derived(
    library_sections(manifests, {
      query,
      filters: [],
      used,
      installed,
      category: LibraryCategory.ALL,
      sort: LibrarySort.NAME,
      related: sentence.related,
      suggested: sentence.suggested,
    })
  );
  const counts = $derived(category_counts(manifests, { query: "", filters: [], used, installed }));
  const sections = $derived(
    library_sections(manifests, {
      query: "",
      filters: filters.value,
      used,
      installed,
      favourites,
      category: category.value,
      sort: sort.value,
      changelog: version.changelog,
    })
  );

  // Waits for the notes and the catalogue: cards arriving in front would leave the carousel snapped to a later one.
  const hero = $derived(version.changelog.length && catalogue !== CatalogueState.LOADING ? hero_cards(manifests, version.changelog, FEATURED) : []);
  const shelves = $derived(
    [
      { id: "new", label: "New apps", description: "The latest to join WebOS", apps: new_apps(manifests, version.changelog) },
      { id: "updated", label: "Recently updated", description: "Changed in the latest releases", apps: recently_updated(manifests, version.changelog) },
      ...collections(manifests, INTERESTS),
    ].filter((shelf) => shelf.apps.length > 0)
  );
  const collection = $derived(collection_id.value ? (shelves.find((shelf) => shelf.id === collection_id.value) ?? null) : null);

  const waiting = $derived(installed_list.filter((manifest) => waiting_download(store, manifest.id) || store.progress(manifest.id) !== null));
  const recent_updates = $derived(app_updates(installed_list, version.changelog));

  // Only for this session, like What's new's "New to you": nothing records which apps were looked at.
  const fresh = $derived(new Set(introduced_apps(version.unseen).map(({ app }) => app)));
  const updated = $derived(updated_apps(version.unseen));

  const sizes = new AppSizes();
  const measured = $derived((apps.installed_catalogue()?.apps ?? []).filter(({ id }) => apps.is_installed(id)));
  // Keyed on what's measured: a launch or a pin changes the slice, not the installed apps' files.
  const measured_key = $derived(measured.map(({ id, files }) => `${id}:${files.join(",")}`).join("|"));
  $effect(() => {
    if (place.value !== StorePlace.LIBRARY && !selected) return;
    if (store.syncing || !measured_key) return;
    untrack(() => void sizes.measure(measured.map(({ id, files }) => ({ id, files }))));
  });

  const related = $derived(
    selected
      ? manifests
          .filter((manifest) => manifest.id !== selected.id && category_of(manifest) === category_of(selected))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 12)
      : []
  );

  type NavValue = StorePlace | Exclude<LibraryCategory, "all">;
  const nav_items = $derived([
    { value: StorePlace.DISCOVER as NavValue, label: "Discover", icon: CompassIcon },
    { value: StorePlace.APPS as NavValue, label: "All apps", icon: SquaresFourIcon, count: counts[LibraryCategory.ALL] },
    { value: StorePlace.LIBRARY as NavValue, label: "Library", icon: BooksIcon, count: installed.size },
    { value: StorePlace.UPDATES as NavValue, label: "Updates", icon: ArrowsClockwiseIcon, count: waiting.length || undefined },
    ...LIBRARY_CATEGORIES.filter(({ id }) => id !== LibraryCategory.ALL).map(({ id, label }) => ({
      value: id as NavValue,
      label,
      icon: CATEGORY_ICONS[id],
      count: counts[id],
      group: "Categories",
    })),
  ]);
  // A phone-width window gets the four places as equal tabs, so the row never scrolls sideways; categories live on Discover and in All apps.
  const places = $derived(nav_items.filter((item) => !("group" in item)));
  const nav_value = $derived<NavValue>(
    place.value === StorePlace.APPS && category.value !== LibraryCategory.ALL ? (category.value as NavValue) : place.value
  );

  function go(value: NavValue) {
    selected_id.value = null;
    collection_id.value = null;
    query = "";
    if (value === StorePlace.APPS) category.value = LibraryCategory.ALL;
    if ((Object.values(StorePlace) as string[]).includes(value)) place.value = value as StorePlace;
    else {
      category.value = value as LibraryCategory;
      place.value = StorePlace.APPS;
    }
    base?.scrollTo({ top: 0 });
  }

  function select(manifest: AppListing) {
    selected_id.value = manifest.id;
  }

  function open_shelf(shelf: Shelf) {
    collection_id.value = shelf.id;
  }

  $effect(() =>
    win.on_back(() => {
      if (selected_id.value) selected_id.value = null;
      else if (query) query = "";
      else if (collection_id.value) collection_id.value = null;
      else return false;
      return true;
    })
  );

  const middle = $derived(searching || collection !== null);
  const browse_title = $derived(category.value === LibraryCategory.ALL ? "All apps" : (LIBRARY_CATEGORIES.find(({ id }) => id === category.value)?.label ?? "All apps"));
</script>

{#snippet back_bar(label: string, onback: () => void)}
  <div class="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 pt-3 @2xl:px-8">
    <IconButton label="Back" class="-ml-1" onclick={onback}><ArrowLeftIcon weight="bold" /></IconButton>
    <h2 class="truncate text-xl font-semibold">{label}</h2>
  </div>
{/snippet}

<svelte:window ononline={load_catalogue} />

<div class="flex h-full flex-col">
  <Toolbar>
    <Input
      bind:value={query}
      size="sm"
      class="min-w-36 flex-1 @2xl:max-w-md"
      placeholder="Search apps"
      aria-label="Search apps"
      onkeydown={(event) => {
        const first = results[0]?.apps[0];
        if (event.key === "Enter" && first) select(first);
      }}
    >
      {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
      {#snippet trailing()}
        {#if query}
          <IconButton label="Clear search" size="sm" class="size-5 pointer-coarse:size-7" onclick={() => (query = "")}><XIcon weight="bold" /></IconButton>
        {/if}
      {/snippet}
    </Input>
  </Toolbar>

  <!-- Online, the catalogue isn't this core's (a core update waits): its new apps list, and Open says to update. -->
  {#if catalogue === CatalogueState.OFFLINE && !store.online}
    <div class="flex shrink-0 items-center gap-2 border-b border-foreground/8 bg-warning/10 px-3 py-1.5 text-ui">
      <WifiSlashIcon class="size-4 shrink-0 text-warning" weight="fill" />
      <span class="min-w-0 flex-1">Offline: only the apps this device knows show. The rest come back with the connection.</span>
      <Button size="sm" onclick={load_catalogue}>Try again</Button>
    </div>
  {/if}

  <div class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
    <div class="hidden @2xl:flex">
      <SideNav bind:value={() => nav_value, go} items={nav_items} label="App Store" />
    </div>
    <nav aria-label="App Store" class="grid shrink-0 grid-cols-4 gap-1 border-b border-foreground/8 bg-background-light p-1.5 @2xl:hidden">
      {#each places as item (item.value)}
        {@const active = item.value === place.value}
        <button
          aria-current={active ? "page" : undefined}
          class={cn(
            button({ variant: "quiet", size: "sm" }),
            "h-auto min-w-0 flex-col gap-0.5 rounded-lg px-1 py-1.5 pointer-coarse:h-auto",
            active && "bg-foreground/10 text-foreground hover:bg-foreground/10"
          )}
          onclick={() => go(item.value)}
        >
          <item.icon class={cn("size-5!", active && "text-primary")} weight={active ? "fill" : "regular"} />
          <span class="max-w-full truncate text-2xs">
            {item.label}{#if item.value === StorePlace.UPDATES && item.count}<span class="font-mono text-primary"> {item.count}</span>{/if}
          </span>
        </button>
      {/each}
    </nav>

    <div class="relative min-h-0 min-w-0 flex-1">
      <main bind:this={base} class={cn("absolute inset-0 overflow-y-auto overscroll-contain", (middle || selected) && "hidden")}>
        {#if place.value === StorePlace.DISCOVER}
          <Discover {hero} {shelves} {counts} total={manifests.length} onselect={select} oncategory={go} onshelf={open_shelf} />
        {:else if place.value === StorePlace.APPS}
          <Browse
            title={browse_title}
            bind:category={category.value}
            {sections}
            bind:filters={filters.value}
            bind:sort={sort.value}
            bind:view={view.value}
            {fresh}
            {updated}
            onselect={select}
          />
        {:else if place.value === StorePlace.LIBRARY}
          <LibraryPage installed={installed_list} {sizes} bind:sort={library_sort.value} onselect={select} />
        {:else}
          <Updates {waiting} recent={recent_updates} onselect={select} />
        {/if}
      </main>

      {#if middle}
        <div class={cn("absolute inset-0 overflow-y-auto overscroll-contain", selected && "hidden")}>
          {#if searching}
            <div class="mx-auto flex max-w-4xl flex-col gap-4 px-4 pt-5 pb-8 @2xl:px-8">
              <h2 class="text-xl font-semibold">Results for “{query.trim()}”</h2>
              {#if results.length === 0 && !sentence.pending}
                <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10">
                  {#snippet actions()}<Button size="sm" onclick={() => (query = "")}>Clear search</Button>{/snippet}
                </EmptyState>
              {/if}
              {#each results as section (section.id)}
                <section class="flex flex-col gap-1">
                  {#if section.label}
                    <h3 class="flex items-center gap-1 pt-2 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
                      {#if section.id === SearchSection.SUGGESTED}<SparkleIcon weight="fill" class="size-3 text-primary" />{/if}{section.label}
                    </h3>
                  {/if}
                  <ul class="flex flex-col">
                    {#each section.apps as manifest (manifest.id)}<StoreRow {manifest} onselect={select} />{/each}
                  </ul>
                </section>
              {/each}
            </div>
          {:else if collection}
            {@render back_bar(collection.label, () => (collection_id.value = null))}
            <div class="mx-auto flex max-w-4xl flex-col gap-2 px-4 pt-1 pb-8 @2xl:px-8">
              {#if collection.description}<p class="text-ui text-foreground/80">{collection.description}</p>{/if}
              <ul class="flex flex-col">
                {#each collection.apps as manifest (manifest.id)}<StoreRow {manifest} onselect={select} />{/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}

      {#if selected}
        <div class="absolute inset-0 overflow-y-auto overscroll-contain">
          {#key selected.id}
            <AppPage
              manifest={selected}
              size={sizes.get(selected.id)}
              {related}
              freshness={fresh.has(selected.id) ? "new" : updated.has(selected.id) ? "updated" : null}
              onback={() => (selected_id.value = null)}
              onselect={select}
            />
          {/key}
        </div>
      {/if}
    </div>
  </div>

  <StatusBar>
    <span>{manifests.length} apps · {installed.size} installed</span>
    {#if catalogue === CatalogueState.LOADING}
      <span class="flex items-center gap-1.5"><Spinner label="Loading every app" /> Loading every app…</span>
    {/if}
    {#if selected}<span class="ml-auto hidden @sm:inline">{selected.id}</span>{/if}
  </StatusBar>
</div>
