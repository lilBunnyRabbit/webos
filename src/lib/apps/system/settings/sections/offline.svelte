<script lang="ts">
  import kernel, { OfflineStatus, search_apps, type AppListing, type AppsService, type OfflineService } from "$lib/core/api";
  import { AppIcon, Badge, Input, Section, Spinner, Switch } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { MagnifyingGlass as MagnifyingGlassIcon, WifiSlash as WifiSlashIcon } from "phosphor-svelte";

  const offline = $derived(kernel.service<OfflineService>("offline"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  // Rows are a fixed height so only the ones in view render: the list has to stay fast with any number of apps.
  const ROW = 56;
  const OVERSCAN = 4;
  const MAX_HEIGHT = 448;

  let query = $state("");
  let scroll_top = $state(0);
  let list: HTMLElement | null = $state(null);
  // Picked-first is taken when the list opens or the search changes, so a row doesn't jump away as it's ticked.
  let picked_first = $state.raw(new Set<string>());

  const installed = $derived(apps.listings({ installed: true }));
  const rows = $derived.by(() => {
    const found = search_apps(installed, query);
    const rank = (app: AppListing) => (app.system ? 2 : picked_first.has(app.id) ? 0 : 1);
    return found.map((app, order) => ({ app, order })).sort((a, b) => rank(a.app) - rank(b.app) || a.order - b.order).map(({ app }) => app);
  });
  const height = $derived(Math.min(rows.length * ROW, MAX_HEIGHT));
  const first = $derived(Math.max(0, Math.floor(scroll_top / ROW) - OVERSCAN));
  const last = $derived(Math.min(rows.length, Math.ceil((scroll_top + height) / ROW) + OVERSCAN));

  $effect(() => {
    void query;
    untrack(() => {
      picked_first = new Set(offline.picked);
      if (list) list.scrollTop = 0;
      scroll_top = 0;
    });
  });

  const STATUS: Record<OfflineStatus, { label: string; tone: "success" | "primary" | "neutral" }> = {
    [OfflineStatus.SYSTEM]: { label: "Always saved", tone: "neutral" },
    [OfflineStatus.SAVED]: { label: "Saved", tone: "success" },
    [OfflineStatus.DOWNLOADING]: { label: "Downloading", tone: "primary" },
    [OfflineStatus.NOT_SAVED]: { label: "Not saved", tone: "neutral" },
  };
</script>

<div class="flex flex-col gap-8">
  <Section
    setting="offline-apps"
    title="Apps kept offline"
    description="Apps load when you open them, and an app you open stays until the next update. Ticked apps download again after every update, so they always open without a connection. System apps are always there."
  >
    <div class="flex flex-col gap-2 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <Input class="min-w-0 flex-1 basis-48" bind:value={query} placeholder="Search apps" aria-label="Search apps">
          {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
        </Input>
        <span class="flex items-center gap-2 text-ui text-foreground/65">
          {#if !offline.online}<Badge tone="warning"><WifiSlashIcon weight="bold" /> Offline</Badge>{/if}
          {#if offline.syncing}<Spinner label="Downloading" />{/if}
          {offline.picked.size} kept offline
        </span>
      </div>

      {#if rows.length === 0}
        <p class="px-1 py-6 text-center text-ui text-foreground/65">No installed app matches "{query}".</p>
      {:else}
        <div
          bind:this={list}
          class="overflow-y-auto rounded-lg bg-background-darker"
          style:height="{height}px"
          onscroll={(event) => (scroll_top = event.currentTarget.scrollTop)}
        >
          <ul class="relative" style:height="{rows.length * ROW}px" aria-label="Installed apps">
            {#each rows.slice(first, last) as app, index (app.id)}
              {@const status = STATUS[offline.status(app.id)]}
              <li class="absolute inset-x-0 flex items-center gap-3 border-b border-foreground/6 px-3" style:top="{(first + index) * ROW}px" style:height="{ROW}px">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-background-light ring-1 ring-foreground/10">
                  <AppIcon src={app.icon} class="size-5" />
                </span>
                <label for="offline-{app.id}" class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate text-ui font-medium">{app.name}</span>
                  <span class="flex items-center gap-1.5">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {#if offline.is_picked(app.id) && offline.status(app.id) === OfflineStatus.NOT_SAVED}
                      <span class="truncate text-2xs text-foreground/65">Downloads when you're online</span>
                    {/if}
                  </span>
                </label>
                <Switch
                  id="offline-{app.id}"
                  aria-label="Keep {app.name} offline"
                  checked={app.system || offline.is_picked(app.id)}
                  disabled={app.system}
                  onchange={(event) => offline.set_picked(app.id, event.currentTarget.checked)}
                />
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </Section>
</div>
