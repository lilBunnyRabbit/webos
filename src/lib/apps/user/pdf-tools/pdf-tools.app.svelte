<script lang="ts">
  import { Select, SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowsSplit as ArrowsSplitIcon,
    Export as ExportIcon,
    Images as ImagesIcon,
    PenNib as PenNibIcon,
    Signature as SignatureIcon,
    SquaresFour as SquaresFourIcon,
    Stack as StackIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import ExportSection from "./export-section.svelte";
  import ImagesSection from "./images-section.svelte";
  import MergeSection from "./merge-section.svelte";
  import OrganizeSection from "./organize-section.svelte";
  import { SECTION_IDS, Section, initial_section, launch_paths, type LaunchProps } from "./sections";
  import SignSection from "./sign-section.svelte";
  import SignaturesSection from "./signatures-section.svelte";
  import SplitSection from "./split-section.svelte";

  const props: LaunchProps = $props();
  const { storage, window: win } = get_app_context();

  const launch = untrack(() => ({ section: initial_section(props), paths: launch_paths(props) }));
  const section = storage.window<Section>("section", launch.section, z.enum(SECTION_IDS));

  const SECTIONS = [
    { value: Section.ORGANIZE, label: "Organize", icon: SquaresFourIcon },
    { value: Section.MERGE, label: "Merge", icon: StackIcon },
    { value: Section.SPLIT, label: "Split", icon: ArrowsSplitIcon },
    { value: Section.SIGN, label: "Sign", icon: PenNibIcon },
    { value: Section.IMAGES, label: "Images to PDF", icon: ImagesIcon },
    { value: Section.EXPORT, label: "Export images", icon: ExportIcon },
    { value: Section.SIGNATURES, label: "Signatures", icon: SignatureIcon },
  ];

  const paths_for = (target: Section) => (launch.section === target ? launch.paths : []);

  let sign_with = $state<string | null>(untrack(() => props.signature ?? null));

  /** Organize and Sign each hold unsaved work. Close offers Save only when one of them does. */
  const unsaved = $state<Partial<Record<Section, () => Promise<boolean>>>>({});
  function report(target: Section, dirty: boolean, save: () => Promise<boolean>) {
    if (dirty) unsaved[target] = save;
    else delete unsaved[target];
  }
  $effect(() => {
    const saves = Object.values(unsaved);
    win.set_dirty(saves.length > 0, saves.length === 1 ? { save: saves[0] } : undefined);
  });

  function use_signature(name: string) {
    sign_with = name;
    section.value = Section.SIGN;
  }
</script>

{#snippet picker()}
  <Select size="sm" aria-label="Tool" class="w-auto max-w-40 @2xl:hidden" options={SECTIONS} bind:value={section.value} />
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="PDF tools" items={SECTIONS} bind:value={section.value} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    <div class="h-full" hidden={section.value !== Section.ORGANIZE}>
      <OrganizeSection {picker} initial_paths={paths_for(Section.ORGANIZE)} active={section.value === Section.ORGANIZE}
        ondirty={(dirty, save) => report(Section.ORGANIZE, dirty, save)}
      />
    </div>
    <div class="h-full" hidden={section.value !== Section.MERGE}>
      <MergeSection {picker} initial_paths={paths_for(Section.MERGE)} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SPLIT}>
      <SplitSection {picker} initial_paths={paths_for(Section.SPLIT)} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SIGN}>
      <SignSection {picker} initial_paths={paths_for(Section.SIGN)} bind:signature_name={sign_with}
        active={section.value === Section.SIGN}
        ondirty={(dirty, save) => report(Section.SIGN, dirty, save)}
      />
    </div>
    <div class="h-full" hidden={section.value !== Section.IMAGES}>
      <ImagesSection {picker} initial_paths={paths_for(Section.IMAGES)} />
    </div>
    <div class="h-full" hidden={section.value !== Section.EXPORT}>
      <ExportSection {picker} initial_paths={paths_for(Section.EXPORT)} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SIGNATURES}>
      <SignaturesSection {picker} on_use={use_signature} />
    </div>
  </div>
</div>
