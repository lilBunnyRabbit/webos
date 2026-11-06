<script lang="ts">
  import { Select, SideNav, ToolHome } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowsSplit as ArrowsSplitIcon,
    Export as ExportIcon,
    House as HouseIcon,
    Images as ImagesIcon,
    PenNib as PenNibIcon,
    Ruler as RulerIcon,
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
  import { HOME, Section, VIEW_IDS, initial_view, launch_paths, type LaunchProps, type View } from "./sections";
  import SignSection from "./sign-section.svelte";
  import SignaturesSection from "./signatures-section.svelte";
  import SplitSection from "./split-section.svelte";
  import TestPdfSection from "./test-pdf-section.svelte";

  const props: LaunchProps = $props();
  const { storage, window: win } = get_app_context();

  const launch = untrack(() => ({ view: initial_view(props), paths: launch_paths(props) }));
  const section = storage.window<View>("section", launch.view, z.enum(VIEW_IDS));

  const PAGES = "Pages";
  const SIGN = "Sign";
  const CONVERT = "Convert";
  const SECTIONS = [
    { value: Section.ORGANIZE, label: "Organize", icon: SquaresFourIcon, group: PAGES, takes: "1 PDF", description: "Reorders, rotates and deletes pages, or adds blank ones." },
    { value: Section.MERGE, label: "Merge", icon: StackIcon, group: PAGES, takes: "2+ PDFs", description: "Puts several PDFs together into one file." },
    { value: Section.SPLIT, label: "Split", icon: ArrowsSplitIcon, group: PAGES, takes: "1 PDF", description: "Splits a PDF by page ranges, or every page into its own file." },
    { value: Section.SIGN, label: "Sign", icon: PenNibIcon, group: SIGN, takes: "1 PDF", description: "Places your drawn signature on any page and saves a signed copy." },
    { value: Section.SIGNATURES, label: "Signatures", icon: SignatureIcon, group: SIGN, takes: "nothing", description: "Draws and keeps the signatures Sign uses." },
    { value: Section.IMAGES, label: "Images to PDF", icon: ImagesIcon, group: CONVERT, takes: "images", description: "Makes a PDF with one image per page." },
    { value: Section.EXPORT, label: "Export images", icon: ExportIcon, group: CONVERT, takes: "1 PDF", description: "Saves pages as PNG or JPEG images." },
    { value: Section.TEST_PDF, label: "Test PDF", icon: RulerIcon, group: CONVERT, takes: "nothing", description: "Makes a PDF of any page count, page size or exact file size." },
  ];
  const NAV = [{ value: HOME, label: "Home", icon: HouseIcon }, ...SECTIONS];

  $effect(() =>
    win.on_back(() => {
      if (section.value === HOME) return false;
      section.value = HOME;
      return true;
    })
  );

  const paths_for = (target: Section) => (launch.view === target ? launch.paths : []);

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
  <Select size="sm" aria-label="Tool" class="w-auto max-w-40 @2xl:hidden" options={NAV} bind:value={section.value} />
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <div class="hidden @2xl:flex">
    <SideNav label="PDF tools" items={NAV} bind:value={section.value} />
  </div>
  <div class="min-h-0 min-w-0 flex-1">
    {#if section.value === HOME}
      <ToolHome title="PDF Tools" description="Work on PDFs on this device: nothing is uploaded. Pick a tool, then open, drop or paste a PDF into it." tools={SECTIONS} onpick={(value) => (section.value = value)} />
    {/if}
    <div class="h-full" hidden={section.value !== Section.ORGANIZE}>
      <OrganizeSection {picker} initial_paths={paths_for(Section.ORGANIZE)} active={section.value === Section.ORGANIZE}
        ondirty={(dirty, save) => report(Section.ORGANIZE, dirty, save)}
      />
    </div>
    <div class="h-full" hidden={section.value !== Section.MERGE}>
      <MergeSection {picker} initial_paths={paths_for(Section.MERGE)} active={section.value === Section.MERGE} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SPLIT}>
      <SplitSection {picker} initial_paths={paths_for(Section.SPLIT)} active={section.value === Section.SPLIT} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SIGN}>
      <SignSection {picker} initial_paths={paths_for(Section.SIGN)} bind:signature_name={sign_with}
        active={section.value === Section.SIGN}
        ondirty={(dirty, save) => report(Section.SIGN, dirty, save)}
      />
    </div>
    <div class="h-full" hidden={section.value !== Section.IMAGES}>
      <ImagesSection {picker} initial_paths={paths_for(Section.IMAGES)} active={section.value === Section.IMAGES} />
    </div>
    <div class="h-full" hidden={section.value !== Section.EXPORT}>
      <ExportSection {picker} initial_paths={paths_for(Section.EXPORT)} active={section.value === Section.EXPORT} />
    </div>
    <div class="h-full" hidden={section.value !== Section.SIGNATURES}>
      <SignaturesSection {picker} on_use={use_signature} />
    </div>
    <div class="h-full" hidden={section.value !== Section.TEST_PDF}>
      <TestPdfSection {picker} active={section.value === Section.TEST_PDF} />
    </div>
  </div>
</div>
