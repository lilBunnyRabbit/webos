<script lang="ts">
  import kernel, { is_core_app, type AppListing, type AppsService, type StoreService } from "$lib/core/api";
  import { format_usage } from "$lib/core/api/services/apps/active-time";
  import { uninstall_app } from "$lib/core/components/apps/app-actions";
  import { EmptyState, IconButton, Select } from "$lib/core/components/ui";
  import { format_bytes, format_date } from "$lib/core/utils";
  import { Package as PackageIcon, Trash as TrashIcon } from "phosphor-svelte";
  import type { AppSizes } from "./app-sizes.svelte";
  import { is_game, LibrarySortBy, sort_library } from "./discover";
  import StoreRow from "./store-row.svelte";
  import { waiting_download } from "./waiting";

  interface Props {
    installed: AppListing[];
    sizes: AppSizes;
    sort: LibrarySortBy;
    onselect: (manifest: AppListing) => void;
  }

  let { installed, sizes, sort = $bindable(), onselect }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const store = $derived(kernel.service<StoreService>("store"));
  const list = $derived(sort_library(installed, sort, (id) => apps.usage(id), (id) => sizes.get(id)));
  // Slots are kept only when some row fills them: Open lines up either way, without a blank column on a phone.
  const updatable = $derived(list.some((manifest) => waiting_download(store, manifest.id)));
  const removable = $derived(list.some((manifest) => !is_core_app(manifest.id)));

  let estimate = $state<StorageEstimate | null>(null);
  void navigator.storage
    ?.estimate()
    .then((value) => (estimate = value))
    .catch(() => {});
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-3 px-4 pt-5 pb-8 @2xl:px-8 @2xl:pt-7">
  <header class="flex flex-wrap items-center gap-2">
    <div class="min-w-0 flex-1">
      <h2 class="text-2xl leading-tight font-semibold">Library</h2>
      <p class="text-2xs text-foreground/65">
        {installed.length} installed
        {#if sizes.total > 0}· <span class="font-mono">{format_bytes(sizes.total)}</span> of apps{/if}
        {#if estimate?.usage !== undefined && estimate.quota}
          <span class="hidden @md:inline">
            · WebOS uses <span class="font-mono">{format_bytes(estimate.usage)}</span> of <span class="font-mono">{format_bytes(estimate.quota)}</span> on this device
          </span>
        {/if}
      </p>
    </div>
    <Select
      bind:value={sort}
      size="sm"
      class="w-auto"
      aria-label="Sort"
      options={[
        { value: LibrarySortBy.RECENT, label: "Recently used" },
        { value: LibrarySortBy.NAME, label: "Name" },
        { value: LibrarySortBy.SIZE, label: "Size" },
      ]}
    />
  </header>

  {#if list.length === 0}
    <EmptyState icon={PackageIcon} title="Nothing installed yet" description="Install an app to keep it in your menus and use it offline." class="py-10" />
  {:else}
    <ul class="flex flex-col">
      {#each list as manifest (manifest.id)}
        {@const usage = apps.usage(manifest.id)}
        {@const size = sizes.get(manifest.id)}
        <StoreRow {manifest} {onselect} reserve={updatable}>
          {#snippet detail()}
            <span class="font-mono">{manifest.version}</span>
            {#if size !== null}· <span class="font-mono">{format_bytes(size)}</span>{/if}
            {#if usage}· {is_game(manifest) ? "Played" : "Used"} {format_usage(usage.seconds)}<span class="hidden @md:inline">, last {format_date(new Date(usage.last))}</span>{/if}
            {#if waiting_download(store, manifest.id)}· <span class="text-warning">Not offline yet</span>{/if}
            {#if is_core_app(manifest.id)}· Part of WebOS{/if}
          {/snippet}
          {#snippet actions()}
            {#if !is_core_app(manifest.id)}
              <IconButton label="Uninstall {manifest.name}…" size="sm" onclick={(event) => void uninstall_app(manifest.id, { x: event.clientX, y: event.clientY })}>
                <TrashIcon weight="bold" />
              </IconButton>
            {:else if removable}
              <span aria-hidden="true" class="w-7 shrink-0 pointer-coarse:w-9"></span>
            {/if}
          {/snippet}
        </StoreRow>
      {/each}
    </ul>
  {/if}
</div>
