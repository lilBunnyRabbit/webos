<script lang="ts">
  import { Select, SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { CalendarCheck as CalendarCheckIcon, Coins as CoinsIcon, Key as KeyIcon, Target as TargetIcon } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { z } from "zod";
  import { Account, type SectionProps } from "./account.svelte";
  import { KEY_STORAGE, SECTION_IDS, Section } from "./sections";

  const props: { section?: Section } = $props();
  const { storage } = get_app_context();

  const key = storage.persisted(KEY_STORAGE, "", z.string());
  const account = new Account(key);
  const launch = untrack(() => props.section ?? (key.value ? Section.TODAY : Section.KEY));
  const section = storage.window<Section>("section", launch, z.enum(SECTION_IDS));

  $effect(() => {
    if (key.value) void untrack(() => account.token.load());
  });

  const SECTIONS = [
    { value: Section.TODAY, label: "Today", icon: CalendarCheckIcon },
    { value: Section.WALLET, label: "Wallet", icon: CoinsIcon },
    { value: Section.GOALS, label: "Goals", icon: TargetIcon },
    { value: Section.KEY, label: "API key", icon: KeyIcon },
  ];

  type SectionModule = Promise<{ default: Component<SectionProps> }>;
  const LOADERS: Record<Section, () => SectionModule> = {
    [Section.TODAY]: () => import("./today-section.svelte"),
    [Section.WALLET]: () => import("./wallet-section.svelte"),
    [Section.GOALS]: () => import("./goals-section.svelte"),
    [Section.KEY]: () => import("./key-section.svelte"),
  };

  const visited = new SvelteSet<Section>([untrack(() => section.value)]);
  const modules: Partial<Record<Section, SectionModule>> = {};
  const module_for = (target: Section) => (modules[target] ??= LOADERS[target]());

  function select(next: Section) {
    visited.add(next);
    section.value = next;
  }
</script>

{#snippet picker()}
  <Select size="sm" aria-label="View" class="w-auto max-w-40 whitespace-nowrap @2xl:hidden" options={SECTIONS} bind:value={() => section.value, select} />
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="GW2 Tracker" items={SECTIONS} bind:value={() => section.value, select} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    {#each SECTIONS as item (item.value)}
      {#if visited.has(item.value)}
        <div class="h-full" hidden={section.value !== item.value}>
          {#await module_for(item.value) then { default: SectionComponent }}
            <SectionComponent {account} {picker} active={section.value === item.value} onnavigate={select} />
          {/await}
        </div>
      {/if}
    {/each}
  </div>
</div>
