<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { available_name } from "$lib/core/api/services/files/opfs";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";
  import { has_files, image_files, load_image, load_image_at, paint, type SourceImage } from "$kit/utils/image";
  import { FilePdf as FilePdfIcon, FolderOpen as FolderOpenIcon, Printer as PrinterIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { poster_name } from "./naming";
  import {
    LOW_DPI,
    MAX_ACROSS,
    MAX_SHEETS,
    POOR_DPI,
    POSTER_PAPERS,
    format_mm,
    overlap_bands,
    poster_layout,
    sheet_cells,
    type Box,
    type PosterPaper,
  } from "./poster";
  import { write_poster } from "./poster-pdf";
  import type { SectionProps } from "./sections";

  const PREVIEW_SIDE = 1600;
  const MAX_OVERLAP = 30;
  /** Past this many columns the labels would cover the picture. */
  const LABELLED_COLUMNS = 12;
  const PAPERS: { value: PosterPaper; label: string }[] = [
    { value: "a4", label: "A4" },
    { value: "letter", label: "Letter" },
    { value: "a3", label: "A3" },
  ];
  const ORIENTATIONS = [
    { value: "portrait", label: "Portrait" },
    { value: "landscape", label: "Landscape" },
  ] as const;
  const MARGINS = [
    { value: "5", label: "5" },
    { value: "10", label: "10" },
    { value: "15", label: "15" },
  ] as const;

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  const settings = storage.persisted(
    "poster",
    { paper: "a4" as PosterPaper, orientation: "portrait" as "portrait" | "landscape", across: 3, overlap: 10, margin: "10" as "5" | "10" | "15", marks: true, map: true },
    z.object({
      paper: z.enum(POSTER_PAPERS),
      orientation: z.enum(["portrait", "landscape"]),
      across: z.number().int().min(1).max(MAX_ACROSS),
      overlap: z.number().min(0).max(MAX_OVERLAP),
      margin: z.enum(["5", "10", "15"]),
      marks: z.boolean(),
      map: z.boolean(),
    })
  );

  let root = $state<HTMLElement>();
  let source = $state.raw<SourceImage | null>(null);
  let preview = $state.raw<ImageBitmap | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let busy = $state(false);

  const layout = $derived(
    source
      ? poster_layout(source.bitmap.width, source.bitmap.height, {
          paper: settings.value.paper,
          landscape: settings.value.orientation === "landscape",
          across: settings.value.across,
          overlap: settings.value.overlap,
          margin: Number(settings.value.margin),
        })
      : null
  );
  const cells = $derived(layout ? sheet_cells(layout) : []);
  const bands = $derived(layout ? overlap_bands(layout) : []);
  const too_many = $derived(!!layout && layout.sheets.length > MAX_SHEETS);
  const dpi_note = $derived(
    !layout || layout.dpi >= LOW_DPI
      ? null
      : layout.dpi < POOR_DPI
        ? "Very low resolution: sheets will look blocky. Use fewer sheets across or a bigger image."
        : "Low resolution: sheets look soft up close. Fine for a poster seen from a few steps away."
  );

  // A running job keeps cutting sheets from its bitmap after another image is opened; it closes when the job ends.
  let saving: ImageBitmap | null = null;
  let destroyed = false;
  let request = 0;

  function release(image: SourceImage | null, small: ImageBitmap | null) {
    if (image && image.bitmap !== saving) image.bitmap.close();
    small?.close();
  }

  async function shrink(bitmap: ImageBitmap): Promise<ImageBitmap> {
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(bitmap.width, bitmap.height));
    return createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
      resizeQuality: "high",
    });
  }

  async function load(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      const small = await shrink(result.bitmap);
      if (destroyed || id !== request) return release(result, small);
      release(source, preview);
      source = result;
      preview = small;
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  onDestroy(() => {
    destroyed = true;
    release(source, preview);
  });

  const initial = untrack(() => initial_paths[0]);
  if (initial) load(() => load_image_at(initial));

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Print an image as a poster" });
    if (chosen) load(() => load_image_at(chosen));
  }

  function take(list: File[]) {
    const [file] = list;
    if (file) load(() => load_image(file));
  }

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const list = image_files(event.clipboardData);
    if (!list.length) return;
    event.preventDefault();
    take(list);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    take(image_files(event.dataTransfer));
  }

  async function target_for(image: SourceImage): Promise<string | null> {
    const name = poster_name(image.name);
    if (image.path) {
      const folder = parent_path(image.path);
      const directory = await files.get_directory(folder);
      if (directory) return `${folder === "/" ? "" : folder}/${await available_name(directory, name)}`;
    }
    return win.pick_save({ name, accept: [".pdf", "application/pdf"], start_path: "/home", title: "Save poster as" });
  }

  async function make() {
    if (!source || !layout || busy || too_many) return;
    const image = source;
    const plan = layout;
    const target = await target_for(image);
    if (!target || destroyed) return;
    busy = true;
    saving = image.bitmap;
    try {
      await write_poster({
        app_id,
        bitmap: image.bitmap,
        name: image.name,
        paper: settings.value.paper,
        layout: plan,
        marks: settings.value.marks,
        map: settings.value.map,
        target,
      });
    } finally {
      busy = false;
      saving = null;
      if (destroyed || image !== source) image.bitmap.close();
    }
  }

  function place(box: Box, grid: { width: number; height: number }) {
    return {
      left: `${(box.x / grid.width) * 100}%`,
      top: `${(box.y / grid.height) * 100}%`,
      width: `${(box.width / grid.width) * 100}%`,
      height: `${(box.height / grid.height) * 100}%`,
    };
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet field(label: string)}
  <span class="w-20 shrink-0 text-ui">{label}</span>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Poster print"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium" title={source?.path ?? source?.name}>{source?.name ?? ""}</span>
    {#if source && layout && !loading && !error}
      <Button variant="primary" size="sm" disabled={busy || too_many} onclick={make}><FilePdfIcon weight="bold" /> Make PDF</Button>
    {/if}
  </Toolbar>

  {#if loading && !source}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error && !source}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !preview || !layout}
    <EmptyState
      icon={PrinterIcon}
      title="No image open"
      description="Prints one image across several sheets as a PDF, with crop marks and a map for putting it together. Open one, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    {@const grid = layout.grid}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        <div class="flex flex-col gap-2">
          {@render heading("Paper")}
          <Segmented label="Paper" options={PAPERS} bind:value={settings.value.paper} class="w-full *:flex-1" />
          <Segmented label="Orientation" options={[...ORIENTATIONS]} bind:value={settings.value.orientation} class="w-full *:flex-1" />
        </div>

        <div class="flex flex-col gap-2">
          {@render heading("Size")}
          <label class="flex items-center gap-2">
            {@render field("Across")}
            <Slider size="sm" min={1} max={MAX_ACROSS} bind:value={settings.value.across} class="min-w-0 flex-1" aria-label="Sheets across" />
            <span class="w-12 text-right font-mono text-2xs text-foreground/80 tabular-nums">{layout.columns} × {layout.rows}</span>
          </label>
          <label class="flex items-center gap-2" title="How much each sheet shares with its neighbour, to glue over">
            {@render field("Overlap")}
            <Slider size="sm" min={0} max={MAX_OVERLAP} bind:value={settings.value.overlap} class="min-w-0 flex-1" aria-label="Overlap" />
            <span class="w-12 text-right font-mono text-2xs text-foreground/80 tabular-nums">{Math.round(layout.overlap)} mm</span>
          </label>
          <div class="flex items-center gap-2" title="Unprinted border, where crop marks and the sheet's label go">
            {@render field("Margin")}
            <Segmented size="sm" label="Margin" options={[...MARGINS]} bind:value={settings.value.margin} class="min-w-0 flex-1 *:flex-1 *:justify-center" />
            <span class="w-12 text-right font-mono text-2xs text-foreground/80">mm</span>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          {@render heading("Print")}
          <label class="flex items-center justify-between gap-2 text-ui">
            Crop marks
            <Switch bind:checked={settings.value.marks} />
          </label>
          <label class="flex items-center justify-between gap-2 text-ui" title="A first page showing where every sheet goes">
            Assembly map
            <Switch bind:checked={settings.value.map} />
          </label>
        </div>

        <div class="flex flex-col gap-1">
          {@render heading("Result")}
          <p class="px-0.5 text-ui">
            {layout.sheets.length} sheets{settings.value.map ? " and a map" : ""}
            <span class="block font-mono text-2xs text-foreground/65 tabular-nums">{format_mm(layout.poster.width)} × {format_mm(layout.poster.height)}</span>
            <span class={["block font-mono text-2xs tabular-nums", dpi_note ? "text-warning" : "text-foreground/65"]}>{Math.round(layout.dpi)} DPI</span>
          </p>
          {#if too_many}
            <p class="px-0.5 text-2xs text-warning">More than {MAX_SHEETS} sheets. Use fewer across or bigger paper.</p>
          {:else if dpi_note}
            <p class="px-0.5 text-2xs text-warning">{dpi_note}</p>
          {/if}
        </div>
      </aside>

      <div class="stage grid min-h-0 grid-rows-[minmax(0,1fr)] p-3 @xl:p-6">
        <div class="grid min-h-0 place-items-center [container-type:size]">
          <div
            class="paper relative overflow-hidden rounded-xs ring-1 ring-foreground/10"
            style:aspect-ratio="{grid.width} / {grid.height}"
            style:width="min(100cqw, calc(100cqh * {grid.width / grid.height}))"
          >
            <canvas
              {@attach paint(preview)}
              class="absolute top-0 left-0 block"
              style:width="{(layout.poster.width / grid.width) * 100}%"
              style:height="{(layout.poster.height / grid.height) * 100}%"
              aria-label="{layout.columns} by {layout.rows} sheets"
            ></canvas>
            {#each bands as band, index (index)}
              {@const at = place(band, grid)}
              <div class="band pointer-events-none absolute" style:left={at.left} style:top={at.top} style:width={at.width} style:height={at.height}></div>
            {/each}
            {#each cells as cell (cell.label)}
              {@const at = place(cell, grid)}
              <div class="cell pointer-events-none absolute grid place-items-center" style:left={at.left} style:top={at.top} style:width={at.width} style:height={at.height}>
                {#if layout.columns <= LABELLED_COLUMNS}
                  <span class="rounded-sm bg-background-light/85 px-1 font-mono text-2xs font-medium text-foreground tabular-nums">{cell.label}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <StatusBar>
      <span>{source.bitmap.width} × {source.bitmap.height} px</span>
      <span>{layout.columns} × {layout.rows} sheets</span>
      <span class={dpi_note ? "text-warning" : undefined}>{Math.round(layout.dpi)} DPI</span>
      {#if busy}<span class="ml-auto flex items-center gap-1.5 text-foreground"><Spinner label="Making the PDF" /> Making the PDF</span>{/if}
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .paper {
    background: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .band {
    background: color-mix(in oklch, var(--primary) 30%, transparent);
  }

  .cell {
    outline: 1px solid var(--primary);
  }
</style>
