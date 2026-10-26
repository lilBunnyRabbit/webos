<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, Grabber, IconButton, Toolbar } from "$lib/core/components/ui";
  import { button } from "$lib/core/components/ui/variants";
  import { cn } from "$lib/core/utils";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    House as HouseIcon,
    List as ListIcon,
    ListBullets as ListBulletsIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import { fallback_title, file_path, MAP_ID, REPO_URL, short_name } from "./catalog";
  import DocsReader from "./docs-reader.svelte";
  import DocsSidebar from "./docs-sidebar.svelte";
  import DocsToc from "./docs-toc.svelte";
  import HomeMap from "./home-map.svelte";
  import HomeOverview from "./home-overview.svelte";
  import { load_library, placeholder_info, type Library } from "./library";
  import type { Heading } from "./outline";
  import { ALIASES, locate, near_pages, PAGE_IDS } from "./pages";

  let { page }: { page?: string } = $props();

  const { window: win, storage } = get_app_context();

  // svelte-ignore state_referenced_locally
  const requested = page ? locate(page) : null;
  // svelte-ignore state_referenced_locally
  let missing = $state<string | null>(page && !requested ? page : null);

  interface Location {
    id: string | null;
    hash: string;
  }

  const location = storage.window<Location>(
    "location",
    requested ?? { id: null, hash: "" },
    z.object({ id: z.string().nullable(), hash: z.string() }).refine((value) => value.id === null || value.id === MAP_ID || PAGE_IDS.includes(value.id))
  );
  let history = $state<Location[]>([]);
  let nav = $state(0);

  let library = $state<Library | null>(null);
  let headings = $state<Heading[]>([]);
  let active = $state<string | null>(null);
  let drawer = $state(false);
  let sheet = $state(false);

  const current = $derived(location.value.id);
  const doc_id = $derived(current !== null && current !== MAP_ID ? current : null);
  const pages = $derived(library ? [...library.pages.values()] : PAGE_IDS.map(placeholder_info));
  const title = $derived(current ? (library?.pages.get(current)?.title ?? fallback_title(current)) : null);

  onMount(() => {
    load_library()
      .then((loaded) => (library = loaded))
      .catch((error) => console.warn("[Docs] Couldn't read every page:", error));
  });

  $effect(() => win.set_title(missing ? null : title ? `${title} · Docs` : null));

  function open(id: string | null, hash = "") {
    missing = null;
    drawer = false;
    sheet = false;
    if (id !== location.value.id) {
      history = [...history, location.value];
      headings = [];
      active = null;
    }
    location.value = { id, hash };
    nav++;
  }

  function back(): boolean {
    if (drawer || sheet) {
      drawer = false;
      sheet = false;
      return true;
    }
    const previous = history.at(-1);
    if (!previous) return false;
    history = history.slice(0, -1);
    headings = [];
    location.value = previous;
    nav++;
    return true;
  }

  $effect(() => win.on_back(() => untrack(back)));

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && (drawer || sheet)) {
      event.stopPropagation();
      drawer = false;
      sheet = false;
    } else if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      back();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="relative grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-background" {onkeydown}>
  <Toolbar>
    <IconButton label="Pages" size="sm" class="@3xl:hidden" onclick={() => (drawer = true)}><ListIcon weight="bold" /></IconButton>
    <IconButton label="Back" size="sm" disabled={history.length === 0} onclick={back}><ArrowLeftIcon weight="bold" /></IconButton>
    <IconButton label="Home" size="sm" pressed={current === null && !missing} onclick={() => open(null)}><HouseIcon weight="bold" /></IconButton>
    <p class="min-w-0 flex-1 truncate px-1 text-ui font-medium">
      {#if current}
        {title}
        {#if doc_id}<span class="ml-1 hidden font-mono text-2xs font-normal text-foreground/65 @lg:inline">{short_name(doc_id, ALIASES)}</span>{/if}
      {:else}
        Docs
      {/if}
    </p>
    {#if doc_id}
      <IconButton label="On this page" size="sm" class={cn("@5xl:hidden", headings.length === 0 && "hidden")} onclick={() => (sheet = true)}>
        <ListBulletsIcon weight="bold" />
      </IconButton>
      <a
        href={REPO_URL + file_path(doc_id)}
        target="_blank"
        rel="noopener noreferrer"
        class={button({ variant: "quiet", size: "sm", icon: true })}
        aria-label="Open on GitHub"
        title="Open on GitHub"><ArrowSquareOutIcon weight="bold" /></a
      >
    {/if}
  </Toolbar>

  <div class="flex min-h-0">
    <aside class="hidden w-64 shrink-0 border-r border-foreground/8 bg-background-light @3xl:block">
      <DocsSidebar {pages} current={missing ? undefined : current} onopen={open} />
    </aside>

    <div data-docs-main class={cn("@container min-w-0 flex-1", current === MAP_ID && !missing ? "overflow-hidden" : "overflow-y-auto")}>
      {#if missing}
        {@const near = near_pages(missing)}
        <EmptyState icon={MagnifyingGlassIcon} title="No page called “{missing}”" description={near.length > 0 ? "Maybe one of these:" : "Search the sidebar, or start from the home page."}>
          {#snippet actions()}
            {#each near as id (id)}
              <Button size="sm" onclick={() => open(id)}>{library?.pages.get(id)?.title ?? fallback_title(id)}</Button>
            {/each}
            <Button size="sm" variant="primary" onclick={() => open(null)}>Home</Button>
          {/snippet}
        </EmptyState>
      {:else if current === null}
        <HomeOverview {library} onopen={open} />
      {:else if current === MAP_ID}
        <HomeMap {library} onopen={open} />
      {:else if doc_id}
        <DocsReader
          id={doc_id}
          hash={location.value.hash}
          {nav}
          {library}
          onopen={open}
          onoutline={(items) => (headings = items)}
          onactive={(slug) => (active = slug)}
        />
      {/if}
    </div>

    {#if doc_id && headings.length > 0}
      <aside class="hidden w-56 shrink-0 overflow-y-auto py-6 pr-4 @5xl:block" aria-label="On this page">
        <p class="mb-2 pl-3 text-2xs font-medium tracking-wide text-foreground/65 uppercase">On this page</p>
        <DocsToc {headings} {active} onpick={(slug) => open(current, slug)} />
      </aside>
    {/if}
  </div>

  {#if drawer}
    <div class="absolute inset-0 z-30 @3xl:hidden">
      <button class="absolute inset-0 bg-(--overlay)" aria-label="Close pages" onclick={() => (drawer = false)}></button>
      <div class="absolute inset-y-0 left-0 flex w-[min(20rem,88%)] flex-col bg-background-light shadow-popover animate-pop-in">
        <div class="flex items-center gap-2 border-b border-foreground/8 px-3 py-2">
          <p class="flex-1 text-sm font-semibold">Pages</p>
          <IconButton label="Close" size="sm" onclick={() => (drawer = false)}><XIcon weight="bold" /></IconButton>
        </div>
        <div class="min-h-0 flex-1"><DocsSidebar {pages} current={missing ? undefined : current} onopen={open} /></div>
      </div>
    </div>
  {/if}

  {#if sheet && current}
    <div class="absolute inset-0 z-30 @5xl:hidden">
      <button class="absolute inset-0 bg-(--overlay)" aria-label="Close contents" onclick={() => (sheet = false)}></button>
      <div
        class="absolute inset-x-0 bottom-0 flex max-h-[70%] flex-col rounded-t-2xl bg-background-lighter pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-popover animate-sheet-in"
        {@attach swipe_dismiss({ on_dismiss: () => (sheet = false) })}
      >
        <Grabber class="mb-2" />
        <p class="px-4 pb-2 text-sm font-semibold">On this page</p>
        <div class="min-h-0 overflow-y-auto px-2"><DocsToc {headings} {active} onpick={(slug) => open(current, slug)} /></div>
      </div>
    </div>
  {/if}
</div>
