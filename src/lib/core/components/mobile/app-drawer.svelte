<script lang="ts">
  import { AppIcon } from "$lib/core/components/ui";
  import kernel, {
    group_apps,
    search_apps,
    type AppListing,
    type AppManifest,
    type AppsService,
    type DesktopService,
    type DialogsService,
    type OfflineService,
  } from "$lib/core/api";
  import {
    DownloadSimple as DownloadSimpleIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    PushPin as PushPinIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { fly } from "svelte/transition";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { Button, EmptyState, Grabber, Input } from "../ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { long_press } from "$lib/core/utils/long-press";
  import AppBadge from "../apps/app-badge.svelte";
  import { CLEAR_RECENT_ITEM, uninstall_app } from "../apps/app-actions";
  import RecentApps from "../apps/recent-apps.svelte";
  import { cn } from "$lib/core/utils";
  import { SentenceSearch } from "../apps/sentence-search.svelte";
  import { explain_offline, keep_offline_item, KEEP_OFFLINE_ID, toggle_keep_offline } from "../apps/offline-actions";
  import OfflineNote from "../apps/offline-note.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const APP_LIBRARY = "app-library";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const offline = $derived(kernel.service<OfflineService>("offline"));

  let query = $state("");
  let search: HTMLInputElement | null = $state(null);

  // The shell mounts the drawer with flushSync inside the tap, so this runs in the gesture and the keyboard comes up.
  $effect(() => {
    search?.focus();
  });

  const installed = $derived(apps.listings({ installed: true }));
  const matches = $derived(search_apps(installed, query));
  const gettable = $derived(query.trim() ? search_apps(apps.listings({ installed: false }), query) : []);
  // No AI row: phones have no on-device model.
  const sentence = new SentenceSearch<AppListing>({ apps: () => apps.listings(), query: () => query, shown: () => [...matches, ...gettable] });
  const best = $derived(matches[0] ?? gettable[0] ?? sentence.related[0]);
  const sections = $derived(group_apps(installed));

  function launch(manifest: AppManifest) {
    if (offline.can_open(manifest.id)) apps.launch(manifest.id);
    else explain_offline(manifest.id);
    onclose();
  }

  function launch_library() {
    apps.launch(APP_LIBRARY);
    onclose();
  }

  async function menu(manifest: AppManifest, anchor: { x: number; y: number }, recent = false) {
    const choice = await dialogs.menu(
      apps.is_installed(manifest.id)
        ? [
            { id: "pin", label: "Add to home screen", icon: PushPinIcon },
            ...keep_offline_item(manifest.id),
            ...(recent ? [{ separator: true } as const, CLEAR_RECENT_ITEM] : []),
            ...(manifest.system ? [] : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
          ]
        : [{ id: "open", label: "Get and open", icon: DownloadSimpleIcon }],
      { anchor }
    );
    if (choice === "pin") desktop.pin(manifest.id).catch((error) => console.error(`[AppDrawer] Failed to pin ${manifest.id}`, error));
    else if (choice === "open") launch(manifest);
    else if (choice === "uninstall") void uninstall_app(manifest.id, anchor);
    else if (choice === CLEAR_RECENT_ITEM.id) apps.clear_recent();
    else if (choice === KEEP_OFFLINE_ID) toggle_keep_offline(manifest.id);
  }
</script>

{#snippet app_tile(manifest: AppManifest, recent = false)}
  <li>
    <button
      {@attach long_press({ on_menu: (point) => menu(manifest, point, recent) })}
      class="group/tile flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 pt-3 pb-2 transition-colors duration-150"
      onclick={() => launch(manifest)}
    >
      <span class={cn("relative grid size-14 place-items-center rounded-2xl bg-background-lighter shadow-raised ring-1 ring-hairline transition-shadow duration-150 group-active/tile:shadow-pressed", !offline.can_open(manifest.id) && "opacity-38")}>
        <AppIcon src={manifest.icon} class="size-7" />
        <AppBadge app_id={manifest.id} />
      </span>
      <span class={cn("line-clamp-2 max-w-full text-center text-xs leading-tight font-medium", !offline.can_open(manifest.id) && "opacity-38")}>{manifest.name}</span>
      {#if !offline.can_open(manifest.id)}<span class="sr-only">(not saved for offline)</span>{/if}
      {#if !apps.is_installed(manifest.id)}<span class="rounded-full bg-primary/14 px-1.5 text-2xs font-medium text-primary">Get</span>{/if}
    </button>
  </li>
{/snippet}

{#snippet grid(label: string, list: AppManifest[])}
  <section>
    <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{label}</p>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1">
      {#each list as manifest (manifest.id)}
        {@render app_tile(manifest)}
      {/each}
    </ul>
  </section>
{/snippet}

<!-- The start menu's mobile counterpart: a sheet over the home screen. -->
<div class="absolute inset-0 z-10 flex flex-col bg-(--overlay)" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
  <div
    role="dialog"
    aria-label="All apps"
    class="relative mt-[calc(env(safe-area-inset-top)+2rem)] flex min-h-0 flex-1 flex-col rounded-t-3xl bg-background-lighter shadow-popover select-none [-webkit-touch-callout:none]"
    transition:fly={{ y: 48, duration: motion_reduced() ? 0 : 200 }}
    {@attach swipe_dismiss({ on_dismiss: onclose })}
  >
    <div>
      <Grabber class="mt-2" />

      <div class="flex items-center gap-2 p-4 pb-3">
        <Input
          class="min-w-0 flex-1"
          bind:value={query}
          bind:element={search}
          size="lg"
          placeholder="Search apps"
          aria-label="Search apps"
          enterkeyhint="go"
          onkeydown={(event) => {
            if (event.key === "Enter" && query.trim() && best) launch(best);
          }}
        >
          {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
        </Input>
        <Button variant="quiet" size="lg" class="px-3" onclick={() => launch_library()}><SquaresFourIcon weight="duotone" /> All apps</Button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
      <OfflineNote class="mb-3" onopen={onclose} />
      {#if query.trim() && !best && !sentence.pending}
        <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
      {:else if query.trim()}
        <div class="flex flex-col gap-3">
          {#if matches.length}{@render grid("Results", matches)}{/if}
          {#if gettable.length}{@render grid("Not installed", gettable)}{/if}
          {#if sentence.related.length}{@render grid("Related", sentence.related)}{/if}
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
  </div>
</div>
