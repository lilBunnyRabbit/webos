<script lang="ts">
  import kernel, { group_apps, search_apps, type AppManifest, type AppsService, type DesktopService, type DialogsService } from "$lib/core/api";
  import { MagnifyingGlass as MagnifyingGlassIcon, PushPin as PushPinIcon } from "phosphor-svelte";
  import { fly } from "svelte/transition";
  import { EmptyState, Input } from "../ui";
  import { long_press } from "$lib/core/utils/long-press";
  import AppBadge from "../apps/app-badge.svelte";

  let { onclose }: { onclose: () => void } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let query = $state("");
  const manifests = $derived([...apps.list()].map(([, manifest]) => manifest));
  const matches = $derived(search_apps(manifests, query));
  const sections = $derived(group_apps(manifests));

  function launch(manifest: AppManifest) {
    apps.launch(manifest.id);
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
    const choice = await dialogs.menu([{ id: "pin", label: "Add to home screen", icon: PushPinIcon }], { anchor });
    if (choice === "pin") desktop.pin(manifest.id).catch((error) => console.error(`[AppDrawer] Failed to pin ${manifest.id}`, error));
  }
</script>

{#snippet grid(label: string, list: AppManifest[])}
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
    transition:fly={{ y: 48, duration: 200 }}
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

      <div class="p-4 pb-3">
        <Input
          bind:value={query}
          size="lg"
          placeholder="Search apps"
          aria-label="Search apps"
          enterkeyhint="go"
          onkeydown={(event) => {
            if (event.key === "Enter" && query.trim() && matches[0]) launch(matches[0]);
          }}
        >
          {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
        </Input>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
      {#if matches.length === 0}
        <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
      {:else if query.trim()}
        {@render grid("Results", matches)}
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
