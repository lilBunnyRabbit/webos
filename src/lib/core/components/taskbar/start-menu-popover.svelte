<script lang="ts">
  import kernel, { type AppManifest, type AppsService, type DesktopService, type VersionService } from "$lib/core/api";
  import { MagnifyingGlass as MagnifyingGlassIcon, PushPin as PushPinIcon } from "phosphor-svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  import { EmptyState, IconButton, Input, Kbd } from "../ui";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const version = $derived(kernel.service<VersionService>("version"));

  let query = $state("");
  let search: HTMLInputElement | null = $state(null);

  // `autofocus` doesn't fire here: this content mounts after the popover has already opened.
  $effect(() => {
    search?.focus();
  });

  const all = $derived([...apps.list()].map(([, manifest]) => manifest).sort((a, b) => a.name.localeCompare(b.name)));
  const matches = $derived(
    query.trim() === ""
      ? all
      : all.filter((manifest) =>
          [manifest.name, manifest.id, ...(manifest.keywords ?? [])].some((text) => text.toLowerCase().includes(query.trim().toLowerCase()))
        )
  );

  function close() {
    document.getElementById("start-menu-popover")?.hidePopover();
  }

  function launch(manifest: AppManifest) {
    apps.launch(manifest.id);
    close();
  }
</script>

<div class="flex flex-col gap-3 p-3 pb-2">
  <Input
    bind:value={query}
    bind:element={search}
    size="lg"
    placeholder="Search apps"
    aria-label="Search apps"
    onkeydown={(event) => {
      if (event.key === "Enter" && query.trim() && matches[0]) launch(matches[0]);
    }}
  >
    {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
  </Input>
</div>

<div class="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
  {#if matches.length === 0}
    <EmptyState icon={MagnifyingGlassIcon} title="No apps match" description={`Nothing called "${query}".`} class="py-10" />
  {:else}
    <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{query ? "Results" : "All apps"}</p>
    <ul class="grid grid-cols-4 gap-1">
      {#each matches as manifest, index (manifest.id)}
        <li class="group relative">
          <button
            class="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-3 pb-2 transition-colors duration-150 hover:bg-foreground/8 focus-visible:bg-foreground/8"
            onclick={() => launch(manifest)}
          >
            <span class="grid size-11 place-items-center rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/10">
              <manifest.icon class="size-6" weight="duotone" />
            </span>
            <span class="line-clamp-1 max-w-full text-2xs font-medium">{manifest.name}</span>
            {#if index === 0 && query}<span class="sr-only">(Enter)</span>{/if}
          </button>
          <IconButton
            label="Pin {manifest.name} to desktop"
            size="sm"
            class="absolute top-1 right-1 size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onclick={() => desktop.pin(manifest.id).catch((error) => console.error(`[StartMenu] Failed to pin ${manifest.id}`, error))}
          >
            <PushPinIcon weight="bold" />
          </IconButton>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<footer class="flex items-center justify-between gap-3 border-t border-foreground/10 bg-background-light px-4 py-2.5">
  <span class="flex items-center gap-2 text-ui font-semibold"><LogoLockup height={20} /> WebOS</span>
  <div class="flex items-center gap-2 text-2xs text-foreground/80">
    {#if query && matches[0]}<span class="flex items-center gap-1"><Kbd>↵</Kbd> open</span>{/if}
    <span class="font-mono">v{version.info.version} · {version.info.commit}</span>
  </div>
</footer>
