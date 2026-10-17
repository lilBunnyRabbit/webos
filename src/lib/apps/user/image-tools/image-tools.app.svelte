<script lang="ts">
  import { Select, SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    Crosshair as CrosshairIcon,
    Crop as CropIcon,
    Eraser as EraserIcon,
    FilmStrip as FilmStripIcon,
    Rows as RowsIcon,
    SquareSplitHorizontal as SquareSplitHorizontalIcon,
  } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { z } from "zod";
  import { SECTION_IDS, Section, initial_section, launch_paths, type LaunchProps, type SectionProps } from "./sections";

  const props: LaunchProps = $props();
  const { storage } = get_app_context();

  const launch = untrack(() => ({ section: initial_section(props), paths: launch_paths(props) }));
  const section = storage.window<Section>("section", launch.section, z.enum(SECTION_IDS));

  const SECTIONS = [
    { value: Section.REMOVE_BACKGROUND, label: "Remove background", icon: EraserIcon },
    { value: Section.JOIN, label: "Join", icon: RowsIcon },
    { value: Section.TRIM, label: "Trim", icon: CropIcon },
    { value: Section.SPLIT, label: "Split", icon: SquareSplitHorizontalIcon },
    { value: Section.SPRITES, label: "Sprites", icon: FilmStripIcon },
    { value: Section.TEST_IMAGE, label: "Test image", icon: CrosshairIcon },
  ];

  type SectionModule = Promise<{ default: Component<SectionProps> }>;
  const LOADERS: Record<Section, () => SectionModule> = {
    [Section.REMOVE_BACKGROUND]: () => import("./remove-background-section.svelte"),
    [Section.JOIN]: () => import("./join-section.svelte"),
    [Section.TRIM]: () => import("./trim-section.svelte"),
    [Section.SPLIT]: () => import("./split-section.svelte"),
    [Section.SPRITES]: () => import("./sprites-section.svelte"),
    [Section.TEST_IMAGE]: () => import("./test-image-section.svelte"),
  };

  // A section loads on its first visit and then stays mounted, so switching back keeps its image and settings.
  const visited = new SvelteSet<Section>([untrack(() => section.value)]);
  const modules: Partial<Record<Section, SectionModule>> = {};
  const module_for = (target: Section) => (modules[target] ??= LOADERS[target]());

  function select(next: Section) {
    visited.add(next);
    section.value = next;
  }

  const paths_for = (target: Section) => {
    if (launch.section !== target) return [];
    return target === Section.JOIN ? launch.paths : launch.paths.slice(0, 1);
  };
</script>

{#snippet picker()}
  <Select size="sm" aria-label="Tool" class="w-auto max-w-48 whitespace-nowrap @2xl:hidden" options={SECTIONS} bind:value={() => section.value, select} />
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="Image tools" items={SECTIONS} bind:value={() => section.value, select} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    {#each SECTIONS as item (item.value)}
      {#if visited.has(item.value)}
        <div class="h-full" hidden={section.value !== item.value}>
          {#await module_for(item.value) then { default: SectionComponent }}
            <SectionComponent {picker} initial_paths={paths_for(item.value)} active={section.value === item.value} />
          {/await}
        </div>
      {/if}
    {/each}
  </div>
</div>
