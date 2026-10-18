<script lang="ts">
  import kernel, {
    introduced_apps,
    updated_apps,
    type AppManifest,
    type AppsService,
    type SessionService,
    type VersionService,
    type WindowsService,
  } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import AppBadge from "$lib/core/components/apps/app-badge.svelte";
  import { set_drag_app } from "$lib/core/components/apps/drag";
  import { Badge, Button, EmptyState, IconButton, Input, Segmented, Select, SideNav, StatusBar, Toolbar } from "$lib/core/components/ui";
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
    Storefront as StorefrontIcon,
    TerminalWindow as TerminalWindowIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import AppDetails from "./app-details.svelte";
  import { CATEGORY_ICONS } from "./category-icons";
  import { APP_LIBRARY_PROPS, LibraryView } from "./props";
  import Showcase from "./showcase.svelte";
  import ShowcaseDetail from "./showcase-detail.svelte";
  import {
    category_counts,
    category_label,
    has_filter,
    LIBRARY_CATEGORIES,
    library_sections,
    LibraryCategory,
    LibraryFilter,
    LibrarySort,
    showcase_sections,
  } from "./library";

  const ViewMode = { GRID: "grid", LIST: "list" } as const;
  type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

  const VIEWS = [
    { value: LibraryView.SHOWCASE, label: "Showcase", icon: SparkleIcon },
    { value: LibraryView.STORE, label: "Store", icon: StorefrontIcon },
  ];

  const FILTERS = [
    { id: LibraryFilter.WIDGET, label: "Has widget", icon: StickerIcon },
    { id: LibraryFilter.FILES, label: "Opens files", icon: FilesIcon },
    { id: LibraryFilter.COMMANDS, label: "Has commands", icon: TerminalWindowIcon },
    { id: LibraryFilter.USED, label: "Used before", icon: ClockCounterClockwiseIcon },
    { id: LibraryFilter.NOT_INSTALLED, label: "Not installed", icon: DownloadSimpleIcon },
  ];

  let { view: initial_view, app: initial_app }: Partial<z.infer<typeof APP_LIBRARY_PROPS>> = $props();

  const { window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const session = $derived(kernel.service<SessionService>("session"));
  const version = $derived(kernel.service<VersionService>("version"));
  void kernel.service<VersionService>("version").load_changelog();

  const category = storage.window<LibraryCategory>("category", LibraryCategory.ALL, z.enum(Object.values(LibraryCategory)));
  const filters = storage.window<LibraryFilter[]>("filters", [], z.array(z.enum(Object.values(LibraryFilter))));
  const sort = storage.window<LibrarySort>("sort", LibrarySort.NAME, z.enum(Object.values(LibrarySort)));
  const view = storage.window<ViewMode>("view", ViewMode.GRID, z.enum(Object.values(ViewMode)));
  const selected_id = storage.window<string | null>("selected", untrack(() => initial_app) ?? null, z.string().nullable());
  const page = storage.window<LibraryView>("page", untrack(() => initial_view) ?? LibraryView.STORE, z.enum(Object.values(LibraryView)));
  const showcase = $derived(page.value === LibraryView.SHOWCASE);
  const showcase_category = storage.window<LibraryCategory>("showcase_category", LibraryCategory.ALL, z.enum(Object.values(LibraryCategory)));

  let query = $state("");

  const manifests = $derived([...apps.list()].map(([, manifest]) => manifest));
  const selected = $derived(selected_id.value ? (apps.get(selected_id.value) ?? null) : null);

  // No usage log exists; an open window, a recently closed one or a remembered window frame is what the OS already knows.
  const used = $derived(
    new Set([
      ...windows.list().flatMap((id) => windows.get(id)?.app.id ?? []),
      ...session.closed.map((snapshot) => snapshot.app_id),
      ...Object.keys(windows.frames),
    ])
  );

  const installed = $derived(new Set([...apps.list({ installed: true })].map(([id]) => id)));

  const filter_query = $derived({ query, filters: filters.value, used, installed });
  const counts = $derived(category_counts(manifests, filter_query));
  const sections = $derived(
    library_sections(manifests, { ...filter_query, category: category.value, sort: sort.value, changelog: version.changelog })
  );
  // Only for this session, like What's new's "New to you": nothing records which apps were looked at.
  const fresh = $derived(new Set(introduced_apps(version.unseen).map(({ app }) => app)));
  const updated = $derived(updated_apps(version.unseen));
  const showcase_list = $derived(showcase_sections(manifests, { query, category: showcase_category.value }));
  const showcase_counts = $derived(category_counts(manifests, { query, filters: [], used: new Set(), installed: new Set() }));
  const shown = $derived((showcase ? showcase_list : sections).reduce((sum, section) => sum + section.apps.length, 0));
  const first = $derived(sections[0]?.apps[0]);

  const nav_items = $derived(LIBRARY_CATEGORIES.map(({ id, label }) => ({ value: id, label, icon: CATEGORY_ICONS[id], count: counts[id] })));

  function toggle(filter: LibraryFilter) {
    filters.value = filters.value.includes(filter) ? filters.value.filter((value) => value !== filter) : [...filters.value, filter];
  }

  function select(manifest: AppManifest) {
    selected_id.value = manifest.id;
  }

  $effect(() =>
    win.on_back(() => {
      if (!selected_id.value) return false;
      selected_id.value = null;
      return true;
    })
  );
</script>

{#snippet icon_tile(manifest: AppManifest, size: "sm" | "md")}
  <span
    class={cn(
      "relative grid shrink-0 place-items-center bg-background-light shadow-raised ring-1 ring-foreground/10",
      size === "md" ? "size-11 rounded-xl pointer-coarse:size-14 pointer-coarse:rounded-2xl" : "size-6 rounded-md pointer-coarse:size-8"
    )}
  >
    <manifest.icon class={size === "md" ? "size-6 pointer-coarse:size-7" : "size-4 pointer-coarse:size-5"} weight="duotone" />
    {#if size === "md"}<AppBadge app_id={manifest.id} />{/if}
  </span>
{/snippet}

{#snippet freshness(manifest: AppManifest)}
  {#if !installed.has(manifest.id)}
    <Badge tone="primary">Get</Badge>
  {:else if fresh.has(manifest.id)}
    <Badge tone="primary">New</Badge>
  {:else if updated.has(manifest.id)}
    <Badge tone="info">Updated</Badge>
  {/if}
{/snippet}

{#snippet tiles(list: AppManifest[])}
  {#if view.value === ViewMode.GRID}
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">
      {#each list as manifest (manifest.id)}
        <li>
          <button
            aria-current={manifest.id === selected_id.value ? "true" : undefined}
            title={manifest.description}
            class={cn(
              "flex w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-3 pb-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-cottontail",
              manifest.id === selected_id.value ? "bg-primary/14" : "hover:bg-foreground/8"
            )}
            onclick={() => select(manifest)}
            ondblclick={() => apps.launch(manifest.id)}
            draggable="true"
            ondragstart={(event) => set_drag_app(event, manifest.id)}
          >
            {@render icon_tile(manifest, "md")}
            <span class="line-clamp-2 max-w-full text-center text-2xs leading-tight font-medium pointer-coarse:text-xs">{manifest.name}</span>
            {@render freshness(manifest)}
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <ul class="flex flex-col">
      <li aria-hidden="true" class="flex h-7 items-center gap-2.5 px-2 text-2xs text-foreground/55">
        <span class="ml-auto flex shrink-0 items-center gap-1.5">
          {#each FILTERS.slice(0, 3) as filter (filter.id)}
            <span title={filter.label}><filter.icon class="size-3.5" weight="bold" /></span>
          {/each}
          <span class="hidden w-20 text-right @md:block">Category</span>
        </span>
      </li>
      {#each list as manifest (manifest.id)}
        <li>
          <button
            aria-current={manifest.id === selected_id.value ? "true" : undefined}
            class={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150 pointer-coarse:h-12 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cottontail",
              manifest.id === selected_id.value ? "bg-primary/14" : "hover:bg-foreground/6"
            )}
            onclick={() => select(manifest)}
            ondblclick={() => apps.launch(manifest.id)}
            draggable="true"
            ondragstart={(event) => set_drag_app(event, manifest.id)}
          >
            {@render icon_tile(manifest, "sm")}
            <span class="flex w-36 shrink-0 items-center gap-1.5 @lg:w-44">
              <span class="truncate text-ui font-medium">{manifest.name}</span>
              {@render freshness(manifest)}
            </span>
            <span class="hidden min-w-0 flex-1 truncate text-ui text-foreground/65 @lg:block">{manifest.description ?? ""}</span>
            <span class="ml-auto flex shrink-0 items-center gap-1.5 text-foreground/65">
              {#each FILTERS.slice(0, 3) as filter (filter.id)}
                <span title={has_filter(manifest, filter.id, filter_query) ? filter.label : undefined}>
                  <filter.icon class={cn("size-3.5", !has_filter(manifest, filter.id, filter_query) && "invisible")} aria-label={has_filter(manifest, filter.id, filter_query) ? filter.label : undefined} />
                </span>
              {/each}
              <span class="hidden w-20 truncate text-right text-2xs @md:block">{category_label(manifest)}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet search(onenter: () => void)}
  <Input
    bind:value={query}
    size="sm"
    class="min-w-36 flex-1"
    placeholder="Search apps"
    aria-label="Search apps"
    onkeydown={(event) => {
      if (event.key === "Enter" && query.trim()) onenter();
    }}
  >
    {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
    {#snippet trailing()}
      {#if query}
        <IconButton label="Clear search" size="sm" class="size-5 pointer-coarse:size-7" onclick={() => (query = "")}><XIcon weight="bold" /></IconButton>
      {/if}
    {/snippet}
  </Input>
{/snippet}

{#snippet view_switch()}
  <Segmented size="sm" label="Library view" options={VIEWS} bind:value={page.value} />
{/snippet}

<div class="flex h-full flex-col">
  {#if showcase}
    <div class={cn("min-h-0 flex-1 flex-col", selected ? "hidden" : "flex")}>
      <Toolbar>
        {@render view_switch()}
        {@render search(() => {
          const top = showcase_list[0]?.apps[0];
          if (top) select(top);
        })}
      </Toolbar>
      <Showcase
        sections={showcase_list}
        counts={showcase_counts}
        bind:category={showcase_category.value}
        total={manifests.length}
        {query}
        {fresh}
        {updated}
        onselect={select}
        onclear={() => {
          query = "";
          showcase_category.value = LibraryCategory.ALL;
        }}
      />
    </div>
    {#if selected}
      {#key selected.id}
        <ShowcaseDetail manifest={selected} onback={() => (selected_id.value = null)} onstore={() => (page.value = LibraryView.STORE)} />
      {/key}
    {/if}
  {:else}
    <div class="flex min-h-0 flex-1">
      <div class={cn("min-w-0 flex-1 flex-col", selected ? "hidden @4xl:flex" : "flex")}>
        <Toolbar>
          {@render view_switch()}
          {@render search(() => first && apps.launch(first.id))}
          <Select
            bind:value={sort.value}
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
            <IconButton label="Grid" size="sm" pressed={view.value === ViewMode.GRID} onclick={() => (view.value = ViewMode.GRID)}><SquaresFourIcon /></IconButton>
            <IconButton label="List" size="sm" pressed={view.value === ViewMode.LIST} onclick={() => (view.value = ViewMode.LIST)}><ListBulletsIcon /></IconButton>
          </div>
        </Toolbar>
  
        <div class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
          <!-- Remounts when the details view closes, so a narrow window's tab row scrolls the active category back into view. -->
          {#key selected === null}
            <SideNav bind:value={category.value} items={nav_items} label="Categories" />
          {/key}
  
          <div class="flex min-h-0 min-w-0 flex-1 flex-col">
            <div role="group" aria-label="Filters" class="flex shrink-0 gap-1 overflow-x-auto px-3 pt-2.5 pb-1">
              {#each FILTERS as filter (filter.id)}
                <Button size="sm" variant="quiet" pressed={filters.value.includes(filter.id)} onclick={() => toggle(filter.id)}>
                  <filter.icon weight={filters.value.includes(filter.id) ? "fill" : "regular"} />
                  {filter.label}
                </Button>
              {/each}
            </div>
  
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-3">
              {#if sections.length === 0}
                <EmptyState
                  icon={MagnifyingGlassIcon}
                  title="No apps match"
                  description={query ? `Nothing called "${query}" with these filters.` : "No app here has everything the filters ask for."}
                  class="py-10"
                >
                  {#snippet actions()}
                    {#if filters.value.length || query}
                      <Button
                        size="sm"
                        onclick={() => {
                          filters.value = [];
                          query = "";
                        }}>Clear search and filters</Button
                      >
                    {/if}
                  {/snippet}
                </EmptyState>
              {:else}
                <div class="flex flex-col gap-3">
                  {#each sections as section (section.id)}
                    <section>
                      {#if section.label}
                        <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{section.label}</p>
                      {/if}
                      {@render tiles(section.apps)}
                    </section>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>
  
      <aside
        aria-label="App details"
        class={cn(
          "min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background @4xl:w-80 @4xl:flex-none @4xl:border-l @4xl:border-foreground/8",
          selected ? "flex" : "hidden @4xl:flex"
        )}
      >
        {#if selected}
          {#key selected.id}
            <AppDetails
              manifest={selected}
              freshness={fresh.has(selected.id) ? "new" : updated.has(selected.id) ? "updated" : null}
              onback={() => (selected_id.value = null)}
            />
          {/key}
        {:else}
          <EmptyState icon={SquaresFourIcon} title="Pick an app" description="Its details, the files it opens and its commands show here." />
        {/if}
      </aside>
    </div>
  {/if}

  <StatusBar>
    <span>{shown} of {manifests.length} apps · {installed.size} installed</span>
    {#if !showcase && filters.value.length}<span class="hidden @sm:inline">{filters.value.length} filter{filters.value.length === 1 ? "" : "s"}</span>{/if}
    {#if selected}<span class="ml-auto">{selected.id}</span>{/if}
  </StatusBar>
</div>
