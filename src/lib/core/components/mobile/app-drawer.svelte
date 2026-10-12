<script lang="ts">
  import kernel, { search_apps, type AppManifest, type AppsService, type DesktopService, type DialogsService } from "$lib/core/api";
  import { MagnifyingGlass as MagnifyingGlassIcon, PushPin as PushPinIcon } from "phosphor-svelte";
  import { fly } from "svelte/transition";
  import { EmptyState, Input } from "../ui";
  import { long_press } from "./long-press";

  let { onclose }: { onclose: () => void } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let query = $state("");
  const matches = $derived(search_apps([...apps.list()].map(([, manifest]) => manifest), query));

  function launch(manifest: AppManifest) {
    apps.launch(manifest.id);
    onclose();
  }

  async function menu(manifest: AppManifest, anchor: { x: number; y: number }) {
    const choice = await dialogs.menu([{ id: "pin", label: "Add to home screen", icon: PushPinIcon }], { anchor });
    if (choice === "pin") desktop.pin(manifest.id).catch((error) => console.error(`[AppDrawer] Failed to pin ${manifest.id}`, error));
  }
</script>

<!-- The start menu's mobile counterpart: a sheet over the home screen. No autofocus, so the keyboard stays down until asked. -->
<div class="absolute inset-0 z-10 flex flex-col bg-(--overlay)" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
  <div
    role="dialog"
    aria-label="All apps"
    class="mt-[calc(env(safe-area-inset-top)+2rem)] flex min-h-0 flex-1 flex-col rounded-t-3xl bg-background-lighter shadow-popover select-none [-webkit-touch-callout:none]"
    transition:fly={{ y: 48, duration: 200 }}
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

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
      {#if matches.length === 0}
        <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
      {:else}
        <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{query ? "Results" : "All apps"}</p>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1">
          {#each matches as manifest (manifest.id)}
            <li>
              <button
                {@attach long_press({ on_menu: (point) => menu(manifest, point) })}
                class="flex w-full flex-col items-center gap-1.5 rounded-2xl px-1 pt-3 pb-2 transition-colors duration-150 active:bg-foreground/8"
                onclick={() => launch(manifest)}
              >
                <span class="grid size-14 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
                  <manifest.icon class="size-7" weight="duotone" />
                </span>
                <span class="line-clamp-2 max-w-full text-center text-xs leading-tight font-medium">{manifest.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
