<script lang="ts">
  import { Spinner } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Database as DatabaseIcon,
    FolderSimple as FolderSimpleIcon,
    HardDrives as HardDrivesIcon,
    Key as KeyIcon,
    Package as PackageIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import { live_services, service_page } from "../live";
  import { has_page, load_page } from "../pages";
  import { opfs_area, parse_storage_map, type StorageEntry } from "../persistence";

  interface Props {
    onopen: (id: string) => void;
  }

  let { onopen }: Props = $props();

  const loading = load_page("system/persistence").then(parse_storage_map);
  const classes = $derived(new Map(live_services().map((service) => [service.name, service.key])));

  const AREAS = ["/etc", "/var/lib", "/home", "/tmp", "/"];
  const AREA_NOTES: Record<string, string> = {
    "/etc": "Config",
    "/var/lib": "State",
    "/home": "Your files",
    "/tmp": "Scratch, swept at boot",
    "/": "The whole tree",
  };
  const STORE_ICONS: Record<string, Component> = {
    localStorage: KeyIcon,
    IndexedDB: DatabaseIcon,
    "Cache Storage": PackageIcon,
  };

  function owner_page(owner: string): string | null {
    const key = classes.get(owner) ?? classes.get(owner.replace(/^Mobile|^Solo/, ""));
    if (key && has_page(service_page(key))) return service_page(key);
    const app = /^(?:user|system)\/([\w-]+)/.exec(owner);
    if (app && has_page(`apps/${app[1]}`)) return `apps/${app[1]}`;
    return null;
  }

  function stores(entries: StorageEntry[]) {
    const others = new Map<string, StorageEntry[]>();
    for (const entry of entries) {
      if (entry.store === "OPFS") continue;
      const store = entry.store.startsWith("Cache Storage") ? "Cache Storage" : entry.store;
      others.set(store, [...(others.get(store) ?? []), entry]);
    }
    return [...others.entries()];
  }
</script>

{#snippet owner_chip(entry: StorageEntry)}
  {@const page = owner_page(entry.owner)}
  {#if page}
    <button
      class="max-w-full truncate rounded-sm bg-primary/12 px-1.5 py-0.5 text-2xs font-medium text-primary transition-opacity hover:opacity-85"
      title={entry.owner_detail}
      onclick={() => onopen(page)}>{entry.owner}</button
    >
  {:else}
    <span class="max-w-full truncate rounded-sm bg-foreground/8 px-1.5 py-0.5 text-2xs text-foreground/80" title={entry.owner_detail}>{entry.owner}</span>
  {/if}
{/snippet}

{#snippet row(entry: StorageEntry)}
  <li class="flex flex-col gap-1 border-b border-foreground/6 px-3 py-2 last:border-b-0 @md:flex-row @md:items-center @md:gap-3">
    <span class="min-w-0 flex-1 font-mono text-2xs break-all">{entry.key}</span>
    <span class="flex min-w-0 @md:max-w-[45%] @md:justify-end">{@render owner_chip(entry)}</span>
  </li>
{/snippet}

{#await loading}
  <div class="grid place-items-center py-6"><Spinner label="Loading the storage map" /></div>
{:then map}
  {@const opfs = map.entries.filter((entry) => entry.store === "OPFS")}
  <section class="flex flex-col gap-4" aria-label="Where WebOS stores data">
    <p class="text-ui text-foreground/80">
      <span class="font-mono tabular-nums">{map.entries.length}</span> places from the storage map below, with who owns each. Owners in
      <span class="text-primary">primary</span> open their page.
    </p>
    <div class="grid items-start gap-3 @2xl:grid-cols-2">
      <div class="flex flex-col overflow-hidden rounded-xl bg-background-light ring-1 ring-foreground/8 @2xl:row-span-3">
        <h3 class="flex items-center gap-2 border-b border-foreground/8 px-3 py-2 text-ui font-semibold">
          <HardDrivesIcon class="size-4 text-primary" weight="duotone" /> OPFS
          <span class="ml-auto font-mono text-2xs font-normal text-foreground/65 tabular-nums">{opfs.length}</span>
        </h3>
        {#each AREAS as area (area)}
          {@const items = opfs.filter((entry) => opfs_area(entry.key) === area)}
          {#if items.length > 0}
            <div class="flex items-center gap-1.5 bg-foreground/3 px-3 py-1.5">
              <FolderSimpleIcon class="size-3.5 text-primary" weight="fill" />
              <span class="font-mono text-2xs font-semibold">{area}</span>
              <span class="text-2xs text-foreground/65">{AREA_NOTES[area]}</span>
            </div>
            <ul>
              {#each items as entry, index (index)}{@render row(entry)}{/each}
            </ul>
          {/if}
        {/each}
      </div>
      {#each stores(map.entries) as [store, items] (store)}
        {@const Icon = STORE_ICONS[store] ?? DatabaseIcon}
        <div class="flex flex-col overflow-hidden rounded-xl bg-background-light ring-1 ring-foreground/8">
          <h3 class="flex items-center gap-2 border-b border-foreground/8 px-3 py-2 text-ui font-semibold">
            <Icon class="size-4 text-primary" weight="duotone" />{store}
            <span class="ml-auto font-mono text-2xs font-normal text-foreground/65 tabular-nums">{items.length}</span>
          </h3>
          <ul>
            {#each items as entry, index (index)}{@render row(entry)}{/each}
          </ul>
          {#if store === "localStorage" && map.app_keys.length > 0}
            <details class="group border-t border-foreground/8">
              <summary class="flex cursor-pointer items-center gap-2 px-3 py-2 text-2xs text-foreground/80 hover:bg-foreground/4">
                <span class={cn("transition-transform group-open:rotate-90")}>›</span>
                <span class="font-mono tabular-nums">{map.app_keys.length}</span> app keys under <span class="font-mono">app.*</span>
              </summary>
              <ul class="max-h-72 overflow-y-auto">
                {#each map.app_keys as item, index (index)}
                  <li class="flex items-center gap-3 border-b border-foreground/6 px-3 py-1.5 last:border-b-0">
                    <span class="min-w-0 flex-1 font-mono text-2xs break-all">{item.key}</span>
                    <span class="truncate font-mono text-2xs text-foreground/65">{item.app}</span>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{:catch}
  <p class="text-ui text-error">Couldn't read the storage map.</p>
{/await}
