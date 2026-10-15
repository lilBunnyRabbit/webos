<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { SideNav } from "$lib/core/components/ui";
  import { z } from "zod";
  import About from "./sections/about.svelte";
  import Appearance from "./sections/appearance.svelte";
  import Backup from "./sections/backup.svelte";
  import Files from "./sections/files.svelte";
  import Taskbar from "./sections/taskbar.svelte";
  import WhatsNew from "./sections/whats-new.svelte";
  import Roadmap from "./sections/roadmap.svelte";
  import Shortcuts from "./sections/shortcuts.svelte";
  import { SECTIONS, SECTION_IDS, type Section } from "./sections";

  let { section: requested }: { section?: Section } = $props();

  const { storage } = get_app_context();
  // svelte-ignore state_referenced_locally
  const section = storage.window<Section>("section", requested ?? "appearance", z.enum(SECTION_IDS));

  const current = $derived(SECTIONS.find((item) => item.value === section.value) ?? SECTIONS[0]);
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Settings sections" items={[...SECTIONS]} bind:value={section.value} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if section.value === "appearance"}
        <Appearance />
      {:else if section.value === "taskbar"}
        <Taskbar />
      {:else if section.value === "files"}
        <Files />
      {:else if section.value === "shortcuts"}
        <Shortcuts />
      {:else if section.value === "backup"}
        <Backup />
      {:else if section.value === "whats-new"}
        <WhatsNew />
      {:else if section.value === "roadmap"}
        <Roadmap />
      {:else}
        <About />
      {/if}
    </div>
  </main>
</div>
