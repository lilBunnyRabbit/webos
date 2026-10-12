<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { SideNav } from "$lib/core/components/ui";
  import { z } from "zod";
  import CoinSection from "./sections/coin-section.svelte";
  import DiceSection from "./sections/dice-section.svelte";
  import DrawsSection from "./sections/draws-section.svelte";
  import ListSection from "./sections/list-section.svelte";
  import NumberSection from "./sections/number-section.svelte";
  import PasswordSection from "./sections/password-section.svelte";
  import { SECTIONS, SECTION_IDS, type Section } from "./sections";

  const { storage } = get_app_context();
  const section = storage.window<Section>("section", storage.get("section", z.enum(SECTION_IDS)) ?? "number", z.enum(SECTION_IDS));

  const current = $derived(SECTIONS.find((item) => item.value === section.value) ?? SECTIONS[0]);

  function select(value: Section) {
    section.value = value;
    storage.set("section", value);
  }
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Tools" items={[...SECTIONS]} bind:value={() => section.value, select} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if section.value === "number"}
        <NumberSection />
      {:else if section.value === "draws"}
        <DrawsSection />
      {:else if section.value === "dice"}
        <DiceSection />
      {:else if section.value === "coin"}
        <CoinSection />
      {:else if section.value === "list"}
        <ListSection />
      {:else}
        <PasswordSection />
      {/if}
    </div>
  </main>
</div>
