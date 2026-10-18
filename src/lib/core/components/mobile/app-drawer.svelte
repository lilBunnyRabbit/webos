<script lang="ts">
  import kernel, {
    group_apps,
    load_metas,
    search_apps,
    with_meta,
    type AppId,
    type AppManifest,
    type AppMeta,
    type AppsService,
    type DesktopService,
    type DialogsService,
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
  import { Button, EmptyState, Input } from "../ui";
  import { long_press } from "$lib/core/utils/long-press";
  import AppBadge from "../apps/app-badge.svelte";
  import { uninstall_app } from "../apps/app-actions";

  let { onclose }: { onclose: () => void } = $props();

  const APP_LIBRARY = "app-library";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let query = $state("");
  let metas = $state.raw<ReadonlyMap<AppId, AppMeta>>(new Map());
  void load_metas(kernel.service<AppsService>("apps")).then((loaded) => (metas = loaded));

  const installed = $derived([...apps.list({ installed: true })].map(([, manifest]) => with_meta(manifest, metas)));
  const matches = $derived(search_apps(installed, query));
  const gettable = $derived(query.trim() ? search_apps([...apps.list({ installed: false })].map(([, manifest]) => with_meta(manifest, metas)), query) : []);
  const best = $derived(matches[0] ?? gettable[0]);
  const sections = $derived(group_apps(installed));

  function launch(manifest: AppManifest) {
    apps.launch(manifest.id);
    onclose();
  }

  function launch_library() {
    apps.launch(APP_LIBRARY);
    onclose();
  }

  /** Pulled down past this many px, the sheet closes. */
  const CLOSE_DISTANCE = 96;
  let pull = $state<{ pointer: number; start: number; dy: number; active: boolean } | null>(null);

  function on_pull_down(event: PointerEvent) {
    if (!event.isPrimary) return;
    pull = { pointer: event.pointerId, start: event.clientY, dy: 0, active: false };
  }

  function on_pull_move(event: PointerEvent) {
    if (!pull || event.pointerId !== pull.pointer) return;
    const dy = event.clientY - pull.start;
    if (!pull.active && dy > 8) {
      pull.active = true;
      try {
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended can't be captured; the pull still follows its moves.
      }
    }
    if (pull.active) pull.dy = Math.max(0, dy);
  }

  function on_pull_up(event: PointerEvent) {
    if (!pull || event.pointerId !== pull.pointer) return;
    const close = pull.active && pull.dy > CLOSE_DISTANCE;
    pull = null;
    if (close) onclose();
  }

  async function menu(manifest: AppManifest, anchor: { x: number; y: number }) {
    const choice = await dialogs.menu(
      apps.is_installed(manifest.id)
        ? [
            { id: "pin", label: "Add to home screen", icon: PushPinIcon },
            ...(manifest.system ? [] : [{ separator: true } as const, { id: "uninstall", label: "Uninstall…", icon: TrashIcon, danger: true }]),
          ]
        : [{ id: "open", label: "Get and open", icon: DownloadSimpleIcon }],
      { anchor }
    );
    if (choice === "pin") desktop.pin(manifest.id).catch((error) => console.error(`[AppDrawer] Failed to pin ${manifest.id}`, error));
    else if (choice === "open") launch(manifest);
    else if (choice === "uninstall") void uninstall_app(manifest.id, anchor);
  }
</script>

{#snippet grid(label: string, list: AppManifest[], get = false)}
  <section>
    <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{label}</p>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1">
      {#each list as manifest (manifest.id)}
        <li>
          <button
            {@attach long_press({ on_menu: (point) => menu(manifest, point) })}
            class="flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 pt-3 pb-2 transition-colors duration-150 active:bg-foreground/8"
            onclick={() => launch(manifest)}
          >
            <span class="relative grid size-14 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
              <manifest.icon class="size-7" weight="duotone" />
              <AppBadge app_id={manifest.id} />
            </span>
            <span class="line-clamp-2 max-w-full text-center text-xs leading-tight font-medium">{manifest.name}</span>
            {#if get}<span class="rounded-full bg-primary/14 px-1.5 text-2xs font-medium text-primary">Get</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/snippet}

<!-- The start menu's mobile counterpart: a sheet over the home screen. No autofocus, so the keyboard stays down until asked. -->
<div class="absolute inset-0 z-10 flex flex-col bg-(--overlay)" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
  <div
    role="dialog"
    aria-label="All apps"
    class="mt-[calc(env(safe-area-inset-top)+2rem)] flex min-h-0 flex-1 flex-col rounded-t-3xl bg-background-lighter shadow-popover select-none [-webkit-touch-callout:none]"
    transition:fly={{ y: 48, duration: motion_reduced() ? 0 : 200 }}
    style:translate={pull?.active ? `0 ${pull.dy}px` : undefined}
    style:transition={pull?.active ? "none" : "translate 200ms var(--ease-out)"}
  >
    <!-- The top of the sheet pulls it down; touch-none so the browser doesn't scroll or refresh instead. Back and the
         scrim are the accessible ways to close. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="touch-none"
      onpointerdown={on_pull_down}
      onpointermove={on_pull_move}
      onpointerup={on_pull_up}
      onpointercancel={() => (pull = null)}
    >
      <div class="mx-auto mt-2 h-1 w-9 rounded-full bg-foreground/20" aria-hidden="true"></div>

      <div class="flex items-center gap-2 p-4 pb-3">
        <Input
          class="min-w-0 flex-1"
          bind:value={query}
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
      {#if query.trim() && !best}
        <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
      {:else if query.trim()}
        <div class="flex flex-col gap-3">
          {#if matches.length}{@render grid("Results", matches)}{/if}
          {#if gettable.length}{@render grid("Not installed", gettable, true)}{/if}
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each sections as section (section.id)}
            {@render grid(section.label, section.apps)}
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
