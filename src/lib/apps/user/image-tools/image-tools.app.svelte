<script lang="ts">
  import { Select, SideNav, ToolHome } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowsIn as ArrowsInIcon,
    ArrowsInSimple as ArrowsInSimpleIcon,
    Bandaids as BandaidsIcon,
    Crosshair as CrosshairIcon,
    Crop as CropIcon,
    Eraser as EraserIcon,
    EyeSlash as EyeSlashIcon,
    FilmStrip as FilmStripIcon,
    House as HouseIcon,
    Printer as PrinterIcon,
    Rows as RowsIcon,
    SquareHalf as SquareHalfIcon,
    SquareSplitHorizontal as SquareSplitHorizontalIcon,
    Swap as SwapIcon,
    SquaresFour as SquaresFourIcon,
  } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { z } from "zod";
  import { HOME, Section, VIEW_IDS, initial_view, launch_paths, type LaunchProps, type SectionProps, type View } from "./sections";

  const props: LaunchProps = $props();
  const { storage, window: win } = get_app_context();

  const launch = untrack(() => ({ view: initial_view(props), paths: launch_paths(props) }));
  const section = storage.window<View>("section", launch.view, z.enum(VIEW_IDS));

  const EDIT = "Edit";
  const CUT = "Combine and cut";
  const SIZE = "Size and format";
  const CHECK = "Check and print";
  const SECTIONS = [
    { value: Section.REMOVE_BACKGROUND, label: "Remove background", icon: EraserIcon, group: EDIT, takes: "1 image", description: "Makes chosen colours see-through, like the flat backdrop behind a logo." },
    { value: Section.TRIM, label: "Trim", icon: CropIcon, group: EDIT, takes: "1 image", description: "Cuts the empty, see-through border off an image." },
    { value: Section.PATCH, label: "Patch", icon: BandaidsIcon, group: EDIT, takes: "2 images", description: "Takes back what an editor stamped on a picture, using the original." },
    { value: Section.REDACT, label: "Redact", icon: EyeSlashIcon, group: EDIT, takes: "1 image", description: "Covers names, faces or numbers and saves a copy without the metadata." },
    { value: Section.JOIN, label: "Join", icon: RowsIcon, group: CUT, takes: "2+ images", description: "Puts images together into one, stacked or side by side." },
    { value: Section.SPLIT, label: "Split", icon: SquareSplitHorizontalIcon, group: CUT, takes: "1 image", description: "Cuts an image into equal tiles for a grid layout." },
    { value: Section.SPRITES, label: "Sprites", icon: FilmStripIcon, group: CUT, takes: "1 sheet", description: "Slices a sprite sheet into frames, plays them and exports." },
    { value: Section.ATLAS, label: "Atlas", icon: SquaresFourIcon, group: CUT, takes: "images", description: "Packs many images into one sheet, with a map of where each went." },
    { value: Section.SQUASH, label: "Squash", icon: ArrowsInIcon, group: SIZE, takes: "images", description: "Saves smaller WebP or JPEG copies of many images at once." },
    { value: Section.FIT, label: "Fit under a size", icon: ArrowsInSimpleIcon, group: SIZE, takes: "1 image", description: "Makes a copy under an upload limit, keeping as much quality as it can." },
    { value: Section.CONVERT, label: "Convert", icon: SwapIcon, group: SIZE, takes: "1 image", description: "Writes one image in every format, with the size of each." },
    { value: Section.COMPARE, label: "Compare", icon: SquareHalfIcon, group: CHECK, takes: "2 images", description: "Lays two versions over each other: wipe, fade or show what changed." },
    { value: Section.POSTER, label: "Poster print", icon: PrinterIcon, group: CHECK, takes: "1 image", description: "Prints one image across several sheets, as a PDF to tape together." },
    { value: Section.TEST_IMAGE, label: "Test image", icon: CrosshairIcon, group: CHECK, takes: "nothing", description: "Makes a test pattern of any size, or a file of an exact byte size." },
  ];
  const NAV = [{ value: HOME, label: "Home", icon: HouseIcon }, ...SECTIONS];

  type SectionModule = Promise<{ default: Component<SectionProps> }>;
  const LOADERS: Record<Section, () => SectionModule> = {
    [Section.REMOVE_BACKGROUND]: () => import("./remove-background-section.svelte"),
    [Section.JOIN]: () => import("./join-section.svelte"),
    [Section.TRIM]: () => import("./trim-section.svelte"),
    [Section.SPLIT]: () => import("./split-section.svelte"),
    [Section.SPRITES]: () => import("./sprites-section.svelte"),
    [Section.ATLAS]: () => import("./atlas-section.svelte"),
    [Section.PATCH]: () => import("./patch-section.svelte"),
    [Section.REDACT]: () => import("./redact-section.svelte"),
    [Section.SQUASH]: () => import("./squash-section.svelte"),
    [Section.FIT]: () => import("./fit-section.svelte"),
    [Section.CONVERT]: () => import("./convert-section.svelte"),
    [Section.COMPARE]: () => import("./compare-section.svelte"),
    [Section.POSTER]: () => import("./poster-section.svelte"),
    [Section.TEST_IMAGE]: () => import("./test-image-section.svelte"),
  };

  // A section loads on its first visit and then stays mounted, so switching back keeps its image and settings.
  const visited = new SvelteSet<View>([untrack(() => section.value)]);
  const modules: Partial<Record<Section, SectionModule>> = {};
  const module_for = (target: Section) => (modules[target] ??= LOADERS[target]());

  function select(next: View) {
    visited.add(next);
    section.value = next;
  }

  $effect(() =>
    win.on_back(() => {
      if (section.value === HOME) return false;
      select(HOME);
      return true;
    })
  );

  const paths_for = (target: Section) => {
    if (launch.view !== target) return [];
    if (target === Section.JOIN || target === Section.SQUASH || target === Section.ATLAS) return launch.paths;
    return launch.paths.slice(0, target === Section.PATCH || target === Section.COMPARE ? 2 : 1);
  };
</script>

{#snippet picker()}
  <Select size="sm" aria-label="Tool" class="w-auto max-w-48 whitespace-nowrap @2xl:hidden" options={NAV} bind:value={() => section.value, select} />
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="Image tools" items={NAV} bind:value={() => section.value, select} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    {#if section.value === HOME}
      <ToolHome title="Image Tools" description="Small jobs for pictures, done on this device. Pick a tool, then open, drop or paste an image into it." tools={SECTIONS} onpick={select} />
    {/if}
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
