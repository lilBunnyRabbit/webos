<script lang="ts">
  import { onMount, tick } from "svelte";
  import kernel from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { IconButton, Input, SideNav } from "$lib/core/components/ui";
  import { reveal_setting } from "$lib/core/components/ui/setting-anchor";
  import { cn } from "$lib/core/utils";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, MagnifyingGlass as MagnifyingGlassIcon, X as XIcon } from "phosphor-svelte";
  import { z } from "zod";
  import About from "./sections/about.svelte";
  import Backup from "./sections/backup.svelte";
  import Colours from "./sections/colours.svelte";
  import Files from "./sections/files.svelte";
  import Generate from "./sections/generate.svelte";
  import Interface from "./sections/interface.svelte";
  import Notifications from "./sections/notifications.svelte";
  import Offline from "./sections/offline.svelte";
  import Related from "./sections/related.svelte";
  import Roadmap from "./sections/roadmap.svelte";
  import Shortcuts from "./sections/shortcuts.svelte";
  import Speech from "./sections/speech.svelte";
  import Taskbar from "./sections/taskbar.svelte";
  import Theme from "./sections/theme.svelte";
  import Wallpaper from "./sections/wallpaper.svelte";
  import WhatsNew from "./sections/whats-new.svelte";
  import { page_of, SECTION_IDS, Subpage, type Page, type SectionId } from "./ids";
  import { pages_for, SUBPAGE_LABELS } from "./pages";
  import { find_setting, is_page, place_of, search_settings, type SettingEntry } from "./search";

  let { section: requested, setting, path }: { section?: SectionId; setting?: string; path?: string } = $props();

  const { storage } = get_app_context();
  const PAGES = pages_for(kernel.platform);
  const visible = (page: Page) => PAGES.some((item) => item.value === page);

  // svelte-ignore state_referenced_locally
  const target = setting ? find_setting(setting, kernel.platform) : undefined;
  // svelte-ignore state_referenced_locally
  const wanted: Page = path ? "theme" : (target?.page ?? (requested ? page_of(requested) : "theme"));

  const page = storage.window<Page>("section", visible(wanted) ? wanted : "theme", z.enum(SECTION_IDS).transform(page_of));
  // svelte-ignore state_referenced_locally
  const sub = storage.window<Subpage | null>("sub", target?.sub ?? null, z.enum(Subpage).nullable());
  // svelte-ignore state_referenced_locally
  const open = storage.window<boolean>("open", Boolean(requested || target || path), z.boolean());
  // The ring plays once: a restored window gets `null` back, not the link it was opened with.
  const pending = storage.window<string | null>("target", target && !is_page(target) && !target.sub ? target.id : null, z.string().nullable());
  // A restored window gets its own answer back, so an import done or cancelled doesn't ask again.
  // svelte-ignore state_referenced_locally
  const importing = storage.window<string | null>("import", path ?? null, z.string().nullable());

  const current = $derived(PAGES.find((item) => item.value === page.value) ?? PAGES[0]);

  let main: HTMLElement | null = $state(null);
  let query = $state("");
  let active = $state(0);
  const results = $derived(search_settings(query, kernel.platform));
  const searching = $derived(query.trim() !== "");
  const listbox_id = $props.id();

  function navigate(value: Page, subpage: Subpage | null = null) {
    page.value = value;
    sub.value = subpage;
    main?.scrollTo({ top: 0 });
  }

  async function go(entry: SettingEntry) {
    navigate(entry.page, entry.sub ?? null);
    open.value = true;
    await tick();
    if (!is_page(entry) && !entry.sub && main) reveal_setting(main, entry.id);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && searching) {
      event.preventDefault();
      event.stopPropagation();
      query = "";
    } else if (!searching || results.length === 0) return;
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      document.getElementById(`${listbox_id}-${active}`)?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      void go(results[Math.min(active, results.length - 1)]);
    }
  }

  onMount(() => {
    const id = pending.value;
    if (!id) return;
    pending.value = null;
    void tick().then(() => main && reveal_setting(main, id));
  });
</script>

{#snippet search()}
  <Input
    bind:value={() => query, (value) => ((query = value), (active = 0))}
    placeholder="Search settings"
    aria-label="Search settings"
    role="combobox"
    aria-expanded={searching}
    aria-controls={listbox_id}
    aria-activedescendant={searching && results.length > 0 ? `${listbox_id}-${active}` : undefined}
    autocomplete="off"
    spellcheck="false"
    {onkeydown}
  >
    {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
    {#snippet trailing()}
      {#if searching}<IconButton size="sm" class="size-6 pointer-coarse:size-8" label="Clear search" onclick={() => (query = "")}><XIcon weight="bold" /></IconButton>{/if}
    {/snippet}
  </Input>
{/snippet}

{#snippet found()}
  <p class="shrink-0 px-2.5 pt-2.5 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase" aria-live="polite">
    {results.length === 0 ? "No results" : results.length === 1 ? "1 result" : `${results.length} results`}
  </p>
  <div id={listbox_id} role="listbox" aria-label="Settings found" class="flex flex-col gap-0.5">
    {#each results as entry, index (entry.id)}
      <button
        id="{listbox_id}-{index}"
        role="option"
        aria-selected={index === active}
        tabindex="-1"
        class={cn(
          "flex min-h-11 shrink-0 flex-col justify-center rounded-lg px-2.5 py-1.5 text-left transition-colors duration-150 @2xl:min-h-0 pointer-coarse:min-h-11",
          index === active ? "bg-foreground/10" : "hover:bg-foreground/6"
        )}
        onclick={() => ((active = index), void go(entry))}
      >
        <span class="text-ui font-medium">{entry.label}</span>
        <span class="text-2xs text-foreground/65">{place_of(entry)}</span>
      </button>
    {/each}
  </div>
{/snippet}

<SideNav
  label="Settings pages"
  back_label="Settings"
  items={PAGES}
  bind:value={() => current.value, (value) => navigate(value)}
  bind:open={open.value}
  header={search}
  list={searching ? found : undefined}
  onback={() => (sub.value ? ((sub.value = null), true) : false)}
>
  <main bind:this={main} class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 @md:px-6">
      {#if current.value === "theme" && sub.value}
        <nav aria-label="Breadcrumb" class="-my-1 flex items-center gap-1.5 text-lg">
          <IconButton label="Back to Theme" onclick={() => (sub.value = null)}><CaretLeftIcon weight="bold" /></IconButton>
          <button class="font-semibold text-foreground/65 hover:text-foreground" onclick={() => (sub.value = null)}>{current.label}</button>
          <CaretRightIcon class="size-3 text-foreground/65" weight="bold" />
          <h1 class="font-semibold">{SUBPAGE_LABELS[sub.value]}</h1>
        </nav>
      {:else}
        <h1 class="text-lg font-semibold">{current.label}</h1>
      {/if}

      {#if current.value === "theme"}
        {#if sub.value === Subpage.CREATE}
          <Generate />
        {:else if sub.value === Subpage.COLOURS}
          <Colours />
        {:else}
          <Theme bind:import_path={importing.value} onsub={(next) => (sub.value = next)} />
        {/if}
      {:else if current.value === "wallpaper"}
        <Wallpaper />
      {:else if current.value === "interface"}
        <Interface />
      {:else if current.value === "taskbar"}
        <Taskbar />
      {:else if current.value === "files"}
        <Files />
      {:else if current.value === "shortcuts"}
        <Shortcuts />
      {:else if current.value === "notifications"}
        <Notifications />
      {:else if current.value === "speech"}
        <Speech />
      {:else if current.value === "backup"}
        <Backup />
      {:else if current.value === "offline"}
        <Offline />
      {:else if current.value === "whats-new"}
        <WhatsNew />
      {:else if current.value === "roadmap"}
        <Roadmap />
      {:else}
        <About />
      {/if}

      {#if !sub.value}
        <Related page={current.value} onnavigate={(value) => navigate(value)} />
      {/if}
    </div>
  </main>
</SideNav>
