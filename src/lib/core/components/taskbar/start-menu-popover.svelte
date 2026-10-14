<script lang="ts">
  import kernel, { group_apps, search_apps, type AppManifest, type AppsService, type DesktopService, type VersionService } from "$lib/core/api";
  import { MagnifyingGlass as MagnifyingGlassIcon, PushPin as PushPinIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  import CommandMode from "./command-mode.svelte";
  import { Button, EmptyState, IconButton, Input, Kbd } from "../ui";
  import AppBadge from "../apps/app-badge.svelte";

  const APP_LIBRARY = "app-library";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const version = $derived(kernel.service<VersionService>("version"));

  let query = $state("");
  let search: HTMLInputElement | null = $state(null);
  let command_mode: CommandMode | undefined = $state();

  /** `>` turns the launcher into the command palette (ADR-033). */
  const commanding = $derived(query.startsWith(">"));

  // `autofocus` doesn't fire here: this content mounts after the popover has already opened.
  $effect(() => {
    search?.focus();
  });

  const manifests = $derived([...apps.list()].map(([, manifest]) => manifest));
  const matches = $derived(search_apps(manifests, query));
  const sections = $derived(group_apps(manifests));

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
</script>

{#snippet grid(label: string, list: AppManifest[])}
  <section>
    <p class="px-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{label}</p>
    <ul class="grid grid-cols-4 gap-1">
      {#each list as manifest (manifest.id)}
        <li class="group relative">
          <button
            class="flex w-full flex-col items-center gap-1.5 rounded-xl px-1 pt-3 pb-2 transition-colors duration-150 hover:bg-foreground/8 focus-visible:bg-foreground/8"
            onclick={() => launch(manifest)}
          >
            <span class="relative grid size-11 place-items-center rounded-xl bg-background-light shadow-raised ring-1 ring-foreground/10">
              <manifest.icon class="size-6" weight="duotone" />
              <AppBadge app_id={manifest.id} />
            </span>
            <span class="line-clamp-1 max-w-full text-2xs font-medium">{manifest.name}</span>
            {#if manifest === matches[0] && query}<span class="sr-only">(Enter)</span>{/if}
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
      else if (event.key === "Enter" && query.trim() && matches[0]) launch(matches[0]);
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
  {:else if matches.length === 0}
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

<footer class="flex items-center justify-between gap-3 border-t border-foreground/10 bg-background-light px-4 py-2.5">
  <span class="flex items-center gap-2 text-ui font-semibold"><LogoLockup height={20} /> WebOS</span>
  <div class="flex items-center gap-2 text-2xs text-foreground/80">
    {#if commanding}<span class="flex items-center gap-1"><Kbd>↵</Kbd> run</span>
    {:else if query && matches[0]}<span class="flex items-center gap-1"><Kbd>↵</Kbd> open</span>{/if}
    <span class="font-mono">v{version.info.version} · {version.info.commit}</span>
  </div>
</footer>
