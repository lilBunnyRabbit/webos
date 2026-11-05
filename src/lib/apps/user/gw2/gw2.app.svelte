<script lang="ts">
  import { Select, SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Backpack as BackpackIcon, CalendarCheck as CalendarCheckIcon, Coins as CoinsIcon, Key as KeyIcon, Target as TargetIcon } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { z } from "zod";
  import { Account, type SectionProps } from "./account.svelte";
  import { SECTION_IDS, Section } from "./sections";
  import { empty_storage, storage_schema } from "./storage";

  const props: { section?: Section; query?: string } = $props();
  const { storage } = get_app_context();

  const data = storage.file("storage.json", empty_storage(), storage_schema);
  const key = {
    get value() {
      return data.value.key;
    },
    set value(next: string) {
      data.value.key = next;
    },
  };
  const account = new Account(key);
  // Null until the file is read when no section was asked for: a saved key opens Today, none opens API key.
  const section = storage.window<Section | null>("section", untrack(() => props.section ?? null), z.enum(SECTION_IDS).nullable());
  const current = $derived(section.value ?? Section.KEY);

  $effect(() => {
    if (!data.ready || section.value !== null) return;
    section.value = untrack(() => data.value.key) ? Section.TODAY : Section.KEY;
  });

  $effect(() => {
    if (key.value) void untrack(() => account.token.load());
  });

  const SECTIONS = [
    { value: Section.TODAY, label: "Today", icon: CalendarCheckIcon },
    { value: Section.WALLET, label: "Wallet", icon: CoinsIcon },
    { value: Section.INVENTORY, label: "Inventory", icon: BackpackIcon },
    { value: Section.GOALS, label: "Goals", icon: TargetIcon },
    { value: Section.KEY, label: "API key", icon: KeyIcon },
  ];

  type SectionModule = Promise<{ default: Component<SectionProps> }>;
  const LOADERS: Record<Section, () => SectionModule> = {
    [Section.TODAY]: () => import("./today-section.svelte"),
    [Section.WALLET]: () => import("./wallet-section.svelte"),
    [Section.INVENTORY]: () => import("./inventory-section.svelte"),
    [Section.GOALS]: () => import("./goals-section.svelte"),
    [Section.KEY]: () => import("./key-section.svelte"),
  };

  const visited = new SvelteSet<Section>();
  $effect(() => {
    if (section.value) untrack(() => visited.add(current));
  });
  const modules: Partial<Record<Section, SectionModule>> = {};
  const module_for = (target: Section) => (modules[target] ??= LOADERS[target]());

  function select(next: Section) {
    visited.add(next);
    section.value = next;
  }
</script>

{#snippet picker()}
  <Select size="sm" aria-label="View" class="w-auto max-w-40 whitespace-nowrap @2xl:hidden" options={SECTIONS} bind:value={() => current, select} />
{/snippet}

{#if section.value}
<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="GW2 Tracker" items={SECTIONS} bind:value={() => current, select} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    {#each SECTIONS as item (item.value)}
      {#if visited.has(item.value)}
        <div class="h-full" hidden={current !== item.value}>
          {#await module_for(item.value) then { default: SectionComponent }}
            <SectionComponent {account} {picker} active={current === item.value} onnavigate={select} query={props.query} />
          {/await}
        </div>
      {/if}
    {/each}
  </div>
</div>
{/if}
