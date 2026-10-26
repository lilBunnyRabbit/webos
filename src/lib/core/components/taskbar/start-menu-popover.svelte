<script lang="ts">
  import kernel, {
    format_keys,
    is_core_app,
    group_apps,
    search_apps,
    type AiService,
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
  import { CLEAR_RECENT_ITEM, INSTALL_ITEM, OPEN_ITEM, uninstall_app } from "../apps/app-actions";
  import RecentApps from "../apps/recent-apps.svelte";
  import { set_drag_app } from "../apps/drag";
  import { cn } from "$lib/core/utils";
  import { SentenceSearch } from "../apps/sentence-search.svelte";
  import { with_pin, without_pin } from "$lib/core/api";

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

  async function menu(manifest: AppManifest, event: MouseEvent, recent = false) {
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
            ...(recent ? [{ separator: true } as const, CLEAR_RECENT_ITEM] : []),
            ...(is_core_app(manifest.id) ? [] : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
          ]
        : [OPEN_ITEM, INSTALL_ITEM],
      { anchor }
    );
    if (choice === "open") launch(manifest);
    else if (choice === INSTALL_ITEM.id) apps.install(manifest.id);
    else if (choice === "pin") pin(manifest);
    else if (choice === "pin-taskbar") settings.taskbar.pinned = with_pin(settings.taskbar.pinned, manifest.id);
    else if (choice === "unpin-taskbar") settings.taskbar.pinned = without_pin(settings.taskbar.pinned, manifest.id);
    else if (choice === "uninstall") void uninstall_app(manifest.id, anchor);
    else if (choice === CLEAR_RECENT_ITEM.id) apps.clear_recent();
  }
</script>

{#snippet app_tile(manifest: AppManifest, recent = false)}
  <li class="group relative flex flex-col">
    <button
      class="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-3 pb-2 transition-colors duration-150 hover:bg-foreground/8 focus-visible:bg-foreground/8"
      onclick={() => launch(manifest)}
      oncontextmenu={(event) => menu(manifest, event, recent)}
      draggable="true"
      ondragstart={(event) => {
        set_drag_app(event, manifest.id);
        // Out of the way of the desktop and the taskbar; closing inside dragstart would cancel the drag.
        requestAnimationFrame(close);
      }}
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
  </li>
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
      <RecentApps>
        {#snippet tile(manifest)}{@render app_tile(manifest, true)}{/snippet}
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
    <span class="font-mono">v{version.info.version} · {version.info.commit}</span>
  </div>
</footer>
