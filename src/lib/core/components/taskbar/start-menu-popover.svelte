<script lang="ts">
  import kernel, {
    format_keys,
    is_core_app,
    group_apps,
    search_apps,
    type AiService,
    type AppId,
    type AppListing,
    type AppManifest,
    type AppsService,
    type DesktopService,
    type DialogsService,
    type SettingsService,
    type ShellService,
    type ShortcutsService,
    type VersionService,
  } from "$lib/core/api";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    PushPin as PushPinIcon,
    PushPinSimple as PushPinSimpleIcon,
    PushPinSimpleSlash as PushPinSimpleSlashIcon,
    Sparkle as SparkleIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  import CommandMode from "./command-mode.svelte";
  import { Button, EmptyState, IconButton, Input, Kbd } from "../ui";
  import AppBadge from "../apps/app-badge.svelte";
  import AppProgress from "../apps/app-progress.svelte";
  import { apply_favourite, CLEAR_RECENT_ITEM, favourite_item, INSTALL_ITEM, OPEN_ITEM, uninstall_app } from "../apps/app-actions";
  import RecentApps from "../apps/recent-apps.svelte";
  import { set_drag_app } from "../apps/drag";
  import { cn } from "$lib/core/utils";
  import { SentenceSearch } from "../apps/sentence-search.svelte";
  import { with_pin, without_pin } from "$lib/core/api";
  import { flip } from "svelte/animate";
  import { tick } from "svelte";

  const APP_LIBRARY = "app-library";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const version = $derived(kernel.service<VersionService>("version"));
  const shell = $derived(kernel.service<ShellService>("shell"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const ai = $derived(kernel.service<AiService>("ai"));

  let query = $state("");
  let search: HTMLInputElement | null = $state(null);
  let command_mode: CommandMode | undefined = $state();

  /** `>` turns the launcher into the command palette (ADR-033). */
  const commanding = $derived(query.startsWith(">"));

  // `autofocus` doesn't fire here: this content mounts after the popover has already opened.
  $effect(() => {
    search?.focus();
  });


  const installed = $derived(apps.listings({ installed: true }));
  const matches = $derived(search_apps(installed, query));
  /** Search covers every app: the ones not installed come after, under Not installed (ADR-040), once the catalogue is here (ADR-077). */
  const gettable = $derived(query.trim() ? search_apps(apps.listings({ installed: false }), query) : []);
  $effect(() => {
    if (query.trim() && !commanding) void apps.catalogue();
  });
  const sentence = new SentenceSearch<AppListing>({
    apps: () => apps.listings(),
    query: () => (commanding ? "" : query),
    shown: () => [...matches, ...gettable],
    ai: () => ai,
  });
  const best = $derived(matches[0] ?? gettable[0] ?? sentence.related[0]);
  const sections = $derived(group_apps(installed));

  type TileKind = "recent" | "favourite" | null;

  const favourites = $derived(apps.favourites.flatMap((id) => apps.get(id) ?? []));
  let favourites_zone: HTMLElement | null = $state(null);
  /** The favourite being dragged: hidden but kept in the DOM (a removed drag source loses its drop), so the others close the gap. */
  let dragging = $state<AppId | null>(null);
  /** Where a drop would land, among the shown favourites. */
  let gap = $state<number | null>(null);
  const favourite_slots = $derived.by(() => {
    const list: ({ key: string; manifest: AppManifest } | { key: "gap"; manifest: null })[] = favourites
      .filter((manifest) => manifest.id !== dragging)
      .map((manifest) => ({ key: manifest.id, manifest }));
    if (gap !== null) list.splice(Math.min(gap, list.length), 0, { key: "gap", manifest: null });
    const ghost = favourites.find((manifest) => manifest.id === dragging);
    if (ghost) list.push({ key: ghost.id, manifest: ghost });
    return list;
  });

  /** Tiles before the pointer in reading order: whole rows above it, then the ones left of it in its row. */
  function favourite_index_at(event: DragEvent): number {
    const tiles = [...(favourites_zone?.querySelectorAll<HTMLElement>("[data-favourite]") ?? [])];
    return tiles.filter((tile) => {
      const rect = tile.getBoundingClientRect();
      return rect.bottom < event.clientY || (rect.top <= event.clientY && rect.left + rect.width / 2 < event.clientX);
    }).length;
  }

  function favourite_drag_start(manifest: AppManifest, index: number, event: DragEvent) {
    set_drag_app(event, manifest.id);
    // Still a pin for the desktop or the taskbar (copy), and a move inside the row.
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copyMove";
    // Hiding the source inside dragstart cancels the drag in Chromium, so it waits a frame.
    requestAnimationFrame(() => {
      dragging = manifest.id;
      gap = index;
    });
  }

  function favourite_over(event: DragEvent) {
    if (!dragging) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    gap = favourite_index_at(event);
  }

  function favourite_drop(event: DragEvent) {
    const id = dragging;
    const at = gap;
    dragging = null;
    gap = null;
    if (!id || at === null) return;
    event.preventDefault();
    apps.move_favourite(id, at);
  }

  async function favourite_key(manifest: AppManifest, index: number, event: KeyboardEvent) {
    const step = !event.altKey ? 0 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    apps.move_favourite(manifest.id, Math.max(0, index + step));
    await tick();
    favourites_zone?.querySelector<HTMLElement>(`[data-favourite="${manifest.id}"] button`)?.focus();
  }

  function close() {
    document.getElementById("start-menu-popover")?.hidePopover();
  }

  function launch(manifest: AppManifest) {
    apps.launch(manifest.id);
    close();
  }

  function launch_library() {
    apps.launch(APP_LIBRARY);
    close();
  }

  function pin(manifest: AppManifest) {
    desktop.pin(manifest.id).catch((error) => console.error(`[StartMenu] Failed to pin ${manifest.id}`, error));
  }

  async function menu(manifest: AppManifest, event: MouseEvent, kind: TileKind) {
    event.preventDefault();
    const anchor = { x: event.clientX, y: event.clientY };
    const choice = await dialogs.menu(
      apps.is_installed(manifest.id)
        ? [
            { id: "open", label: "Open", icon: ArrowSquareOutIcon },
            { id: "pin", label: "Pin to desktop", icon: PushPinIcon },
            settings.taskbar.pinned.includes(manifest.id)
              ? { id: "unpin-taskbar", label: "Unpin from taskbar", icon: PushPinSimpleSlashIcon }
              : { id: "pin-taskbar", label: "Pin to taskbar", icon: PushPinSimpleIcon },
            favourite_item(manifest.id),
            ...(kind === "recent" ? [{ separator: true } as const, CLEAR_RECENT_ITEM] : []),
            ...(is_core_app(manifest.id) ? [] : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
          ]
        : [OPEN_ITEM, INSTALL_ITEM],
      { anchor }
    );
    if (apply_favourite(choice, manifest.id)) return;
    if (choice === "open") launch(manifest);
    else if (choice === INSTALL_ITEM.id) apps.install(manifest.id);
    else if (choice === "pin") pin(manifest);
    else if (choice === "pin-taskbar") settings.taskbar.pinned = with_pin(settings.taskbar.pinned, manifest.id);
    else if (choice === "unpin-taskbar") settings.taskbar.pinned = without_pin(settings.taskbar.pinned, manifest.id);
    else if (choice === "uninstall") void uninstall_app(manifest.id, anchor);
    else if (choice === CLEAR_RECENT_ITEM.id) apps.clear_recent();
  }
</script>

{#snippet app_tile(manifest: AppManifest, kind: TileKind = null)}
  <li class="group relative flex flex-col">
    {@render tile_body(manifest, kind)}
  </li>
{/snippet}

{#snippet tile_body(manifest: AppManifest, kind: TileKind, index = 0)}
  <button
    class="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-3 pb-2 transition-colors duration-150 hover:bg-foreground/8 focus-visible:bg-foreground/8"
    title={kind === "favourite" ? `${manifest.name} · Alt+arrow keys to move` : undefined}
    onclick={() => launch(manifest)}
    oncontextmenu={(event) => menu(manifest, event, kind)}
    onkeydown={kind === "favourite" ? (event) => favourite_key(manifest, index, event) : undefined}
    draggable="true"
    ondragstart={(event) => {
      if (kind === "favourite") return favourite_drag_start(manifest, index, event);
      set_drag_app(event, manifest.id);
      // Out of the way of the desktop and the taskbar; closing inside dragstart would cancel the drag.
      requestAnimationFrame(close);
    }}
    ondragend={kind === "favourite"
      ? () => {
          dragging = null;
          gap = null;
        }
      : undefined}
  >
    <span class="relative grid size-11 place-items-center rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/10">
      <manifest.icon class="size-6" weight="duotone" />
      <AppProgress app_id={manifest.id} />
      <AppBadge app_id={manifest.id} />
    </span>
    <span class="line-clamp-1 max-w-full text-2xs font-medium">{manifest.name}</span>
    {#if manifest === best && query}<span class="sr-only">(Enter)</span>{/if}
  </button>
  {#if !apps.is_installed(manifest.id)}
    <Button size="sm" pressed class="mx-auto mb-1 flex h-6 px-2 text-2xs" aria-label="Install {manifest.name}" onclick={() => apps.install(manifest.id)}>
      Install
    </Button>
  {:else}
    <IconButton
      label="Pin {manifest.name} to desktop"
      size="sm"
      class="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      onclick={() => pin(manifest)}
    >
      <PushPinIcon weight="bold" />
    </IconButton>
  {/if}
{/snippet}

{#snippet grid(label: string, list: AppManifest[], ai = false)}
  <section>
    <p class="flex items-center gap-1 px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">
      {#if ai}<SparkleIcon weight="fill" class="size-3 text-primary" />{/if}{label}
    </p>
    <ul class="grid grid-cols-4 gap-1">
      {#each list as manifest (manifest.id)}
        {@render app_tile(manifest)}
      {/each}
    </ul>
  </section>
{/snippet}

<div class="flex items-center gap-2 p-3 pb-2">
  <Input
    class="min-w-0 flex-1"
    bind:value={query}
    bind:element={search}
    size="lg"
    placeholder="Search apps, or > for commands"
    aria-label="Search apps, or > for commands"
    onkeydown={(event) => {
      if (commanding) command_mode?.keydown(event);
      else if (event.key === "Enter" && query.trim() && best) launch(best);
    }}
  >
    {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
  </Input>
  <Button variant="quiet" size="lg" class="px-3" onclick={() => launch_library()}><SquaresFourIcon weight="duotone" /> All apps</Button>
</div>

<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
  {#if commanding}
    <CommandMode
      bind:this={command_mode}
      line={query.slice(1).trimStart()}
      online={(line) => {
        query = `> ${line}`;
        search?.focus();
      }}
      onclose={close}
    />
  {:else if query.trim() && !best && !sentence.suggested.length && !sentence.pending}
    <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
  {:else if query.trim()}
    <div class="flex flex-col gap-3">
      {#if matches.length}{@render grid("Results", matches)}{/if}
      {#if gettable.length}{@render grid("Not installed", gettable)}{/if}
      {#if sentence.related.length}{@render grid("Related", sentence.related)}{/if}
      {#if sentence.suggested.length}{@render grid("AI suggests", sentence.suggested, true)}{/if}
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#if favourites.length > 0}
        <section aria-labelledby="start-favourites">
          <p id="start-favourites" class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">Favourites</p>
          <ul
            bind:this={favourites_zone}
            class="relative grid grid-cols-4 gap-1"
            ondragover={favourite_over}
            ondragleave={(event) => {
              if (!favourites_zone?.contains(event.relatedTarget as Node | null)) gap = null;
            }}
            ondrop={favourite_drop}
          >
            {#each favourite_slots as slot, index (slot.key)}
              {@const hidden = slot.manifest?.id === dragging}
              <li
                animate:flip={{ duration: 160 }}
                data-favourite={slot.manifest && !hidden ? slot.manifest.id : undefined}
                aria-hidden={slot.manifest ? undefined : "true"}
                class={cn(
                  "group relative flex flex-col",
                  !slot.manifest && "min-h-18 rounded-xl bg-primary/12 ring-1 ring-primary/40 ring-inset",
                  hidden && "pointer-events-none absolute opacity-0"
                )}
              >
                {#if slot.manifest}{@render tile_body(slot.manifest, "favourite", index)}{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
      <RecentApps>
        {#snippet tile(manifest)}{@render app_tile(manifest, "recent")}{/snippet}
      </RecentApps>
      {#each sections as section (section.id)}
        {@render grid(section.label, section.apps)}
      {/each}
    </div>
  {/if}
</div>

<footer class="flex items-center justify-between gap-3 border-t border-foreground/10 bg-background-light px-4 py-2.5">
  <span class="flex items-center gap-2 text-ui font-semibold"><LogoLockup height={20} /> WebOS</span>
  <div class="flex items-center gap-2 text-2xs text-foreground/80">
    {#if commanding}<span class="flex items-center gap-1"><Kbd>↵</Kbd> run</span>
    {:else if query && best}<span class="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
    {:else}
      <button
        type="button"
        class="flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-foreground/8 hover:text-foreground"
        onclick={() => {
          close();
          void shell.execute("shortcuts sheet");
        }}
      >
        {#each format_keys("mod+/", shortcuts.mac) as part, index (index)}<Kbd>{part}</Kbd>{/each} shortcuts
      </button>
    {/if}
    {#if version.info}<span class="font-mono">v{version.info.version} · {version.info.commit}</span>{/if}
  </div>
</footer>
