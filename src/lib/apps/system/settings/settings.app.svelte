<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { SideNav } from "$lib/core/components/ui";
  import {
    FileText as FileTextIcon,
    Info as InfoIcon,
    Palette as PaletteIcon,
    SquareSplitVertical as SquareSplitVerticalIcon,
  } from "phosphor-svelte";
  import { z } from "zod";
  import About from "./sections/about.svelte";
  import Appearance from "./sections/appearance.svelte";
  import Files from "./sections/files.svelte";
  import Taskbar from "./sections/taskbar.svelte";

  const SECTIONS = [
    { value: "appearance", label: "Appearance", icon: PaletteIcon },
    { value: "taskbar", label: "Taskbar", icon: SquareSplitVerticalIcon },
    { value: "files", label: "Default apps", icon: FileTextIcon },
    { value: "about", label: "About", icon: InfoIcon },
  ] as const;
  type Section = (typeof SECTIONS)[number]["value"];

  const { storage } = get_app_context();
  const section = storage.persisted<Section>("section", "appearance", z.enum(SECTIONS.map((item) => item.value)));

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
      {:else}
        <About />
      {/if}
    </div>
  </main>
</div>
