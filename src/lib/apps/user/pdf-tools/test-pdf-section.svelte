<script lang="ts">
  import { Button, Input, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes, parse_bytes } from "$lib/core/utils";
  import { paint } from "$kit/utils/image";
  import { FloppyDisk as FloppyDiskIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { z } from "zod";
  import { open_document, render_width } from "./render";
  import {
    DEFAULT_PDF,
    estimate_pdf_size,
    MAX_PAGES,
    MAX_PDF_BYTES,
    Orientation,
    Paper,
    pdf_bytes,
    pdf_date,
    test_pdf_name,
    test_pdf_schema,
    type TestPdfOptions,
  } from "./test-pdf";
  import { documents_folder, generate_test_pdf } from "./test-pdf-job";

  const { picker, active }: { picker: Snippet; active: boolean } = $props();
  const { app_id, window: win, storage } = get_app_context();

  const SizeBy = { NATURAL: "natural", BYTES: "bytes" } as const;
  type SizeBy = (typeof SizeBy)[keyof typeof SizeBy];

  const settings = storage.persisted(
    "test-pdf",
    { options: DEFAULT_PDF, by: SizeBy.NATURAL as SizeBy, target: "100MB" },
    z.object({ options: test_pdf_schema, by: z.enum([SizeBy.NATURAL, SizeBy.BYTES]), target: z.string() })
  );

  const PAPERS = [
    { value: Paper.A4, label: "A4" },
    { value: Paper.LETTER, label: "Letter" },
    { value: Paper.A5, label: "A5" },
    { value: Paper.A3, label: "A3" },
    { value: Paper.LEGAL, label: "Legal" },
    { value: Paper.MIXED, label: "Mixed sizes" },
    { value: Paper.CUSTOM, label: "Custom" },
  ];
  const ORIENTATIONS = [
    { value: Orientation.PORTRAIT, label: "Portrait" },
    { value: Orientation.LANDSCAPE, label: "Landscape" },
    { value: Orientation.MIXED, label: "Mixed" },
  ];
  const PREVIEW_PAGES = 4;

  const options = $derived(settings.value.options);
  const target = $derived(settings.value.by === SizeBy.BYTES ? parse_bytes(settings.value.target) : null);
  const target_error = $derived.by(() => {
    if (settings.value.by !== SizeBy.BYTES) return null;
    if (target === null) return "Give a size like 100MB or 2GB";
    if (target > MAX_PDF_BYTES) return "A PDF here can be at most 9.9 GB";
    return null;
  });

  function update(patch: Partial<TestPdfOptions>) {
    const next = test_pdf_schema.safeParse({ ...settings.value.options, ...patch });
    if (next.success) settings.value.options = next.data;
  }

  function set_number(key: keyof TestPdfOptions, value: number) {
    if (Number.isFinite(value)) update({ [key]: value });
  }

  let previews = $state.raw<HTMLCanvasElement[]>([]);
  let estimate = $state.raw<{ bytes: number; exact: boolean } | null>(null);
  let preview_error = $state<string | null>(null);
  let rendering = $state(false);

  $effect(() => {
    if (!active) return;
    const snapshot = $state.snapshot(options) as TestPdfOptions;
    let stale = false;
    const timer = setTimeout(async () => {
      rendering = true;
      try {
        estimate = estimate_pdf_size(snapshot);
        // A few small pages stand in for the document; "{pages}" keeps the real count.
        const sample = {
          ...snapshot,
          pages: Math.min(snapshot.pages, PREVIEW_PAGES),
          label: snapshot.label.replaceAll("{pages}", String(snapshot.pages)),
          image_size: Math.min(snapshot.image_size, 96),
        };
        const document = await open_document(pdf_bytes(sample, { payload: null, pad: 0, date: pdf_date(new Date()) }), "Preview");
        try {
          const canvases: HTMLCanvasElement[] = [];
          for (let index = 0; index < sample.pages; index++) canvases.push(await render_width(document, index, 360));
          if (!stale) {
            previews = canvases;
            preview_error = null;
          }
        } finally {
          void document.loadingTask.destroy();
        }
      } catch (error) {
        if (!stale) preview_error = error_message(error);
      } finally {
        if (!stale) rendering = false;
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  async function generate() {
    if (target_error) return;
    const folder = await documents_folder().catch(() => "/home");
    const path = await win.pick_save({ name: test_pdf_name(options, target), accept: [".pdf", "application/pdf"], start_path: folder, title: "Save test PDF as" });
    if (path) await generate_test_pdf(app_id, $state.snapshot(options) as TestPdfOptions, target, path);
  }
</script>

{#snippet number(label: string, key: keyof TestPdfOptions, min: number, max: number, unit = "")}
  <label class="flex items-center justify-between gap-2 text-ui">
    {label}
    <span class="flex items-center gap-1.5">
      <Input type="number" size="sm" {min} {max} class="w-24 font-mono tabular-nums" value={options[key] as number} oninput={(event) => set_number(key, event.currentTarget.valueAsNumber)} />
      <span class="w-6 font-mono text-2xs text-foreground/80">{unit}</span>
    </span>
  </label>
{/snippet}

{#snippet toggle(label: string, key: "number" | "rulers" | "crosshair" | "corners" | "tint")}
  <label class="flex items-center justify-between gap-2 text-ui">
    {label}
    <Switch checked={options[key]} onchange={(event) => update({ [key]: event.currentTarget.checked })} />
  </label>
{/snippet}

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    {@render picker()}
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">Test PDF</span>
    {#if rendering}<Spinner label="Rendering preview" />{/if}
    <Button variant="primary" size="sm" disabled={target_error !== null} onclick={generate}><FloppyDiskIcon weight="bold" /> Generate…</Button>
  </Toolbar>

  <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[18rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
    <aside class="flex max-h-64 flex-col gap-5 overflow-auto border-b border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Pages</h3>
        {@render number("Pages", "pages", 1, MAX_PAGES)}
        <Select size="sm" aria-label="Page size" options={PAPERS} value={options.paper} onchange={(event) => update({ paper: event.currentTarget.value as Paper })} />
        {#if options.paper === Paper.CUSTOM}
          {@render number("Width", "custom_width", 10, 5000, "mm")}
          {@render number("Height", "custom_height", 10, 5000, "mm")}
        {/if}
        <Segmented size="sm" label="Orientation" class="self-start" options={ORIENTATIONS} bind:value={() => options.orientation, (orientation) => update({ orientation })} />
      </div>

      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">File size</h3>
        <Segmented
          size="sm"
          label="File size"
          class="self-start"
          bind:value={settings.value.by}
          options={[
            { value: SizeBy.NATURAL, label: "As drawn" },
            { value: SizeBy.BYTES, label: "Exact" },
          ]}
        />
        {#if settings.value.by === SizeBy.BYTES}
          <label class="flex items-center justify-between gap-2 text-ui">
            Size
            <Input size="sm" class="w-28 font-mono" placeholder="100MB" bind:value={settings.value.target} />
          </label>
          <p class="px-0.5 text-2xs text-foreground/65">Random data is embedded in the pages, not drawn, so the file opens quickly at any size.</p>
        {/if}
      </div>

      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Markings</h3>
        {@render toggle("Big page number", "number")}
        <label class="flex flex-col gap-1.5 text-ui">
          Label
          <Input size="sm" placeholder="No label" value={options.label} oninput={(event) => update({ label: event.currentTarget.value })} />
        </label>
        <p class="px-0.5 text-2xs text-foreground/65">&lbrace;page&rbrace;, &lbrace;pages&rbrace;, &lbrace;paper&rbrace; and &lbrace;size&rbrace; are filled in.</p>
        {@render number("Margin", "margin", 0, 100, "mm")}
        {@render toggle("Rulers", "rulers")}
        {@render number("Grid every", "grid", 0, 500, "mm")}
        {@render toggle("Centre crosshair", "crosshair")}
        {@render toggle("Corner markers", "corners")}
        {@render toggle("Page tint", "tint")}
      </div>

      <div class="flex flex-col gap-2.5">
        <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Content</h3>
        {@render number("Paragraphs", "text", 0, 50)}
        {@render number("Images", "images", 0, 16)}
        {#if options.images > 0}{@render number("Image size", "image_size", 8, 4096, "px")}{/if}
      </div>
    </aside>

    <div class="stage min-h-0 overflow-auto p-4">
      {#if preview_error}
        <p role="alert" class="flex items-start gap-2 text-ui text-error"><WarningCircleIcon weight="bold" class="mt-0.5 size-4 shrink-0" />{preview_error}</p>
      {:else}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] items-start gap-4">
          {#each previews as canvas, index (canvas)}
            <figure class="flex flex-col items-center gap-1.5">
              <canvas {@attach paint(canvas)} class="h-auto max-w-full shadow-raised" aria-label="Page {index + 1}"></canvas>
              <figcaption class="font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</figcaption>
            </figure>
          {/each}
        </div>
        {#if options.pages > PREVIEW_PAGES}<p class="mt-4 text-center text-2xs text-foreground/65">First {PREVIEW_PAGES} of {options.pages} pages</p>{/if}
      {/if}
    </div>
  </div>

  <StatusBar>
    <span>{options.pages} {options.pages === 1 ? "page" : "pages"}</span>
    {#if target_error}
      <span class="ml-auto text-error">{target_error}</span>
    {:else if target !== null}
      <span class="ml-auto">exactly {format_bytes(target)}</span>
    {:else if estimate}
      <span class="ml-auto">{estimate.exact ? "" : "≈ "}{format_bytes(estimate.bytes)}</span>
    {/if}
  </StatusBar>
</div>

<style>
  .stage {
    background: var(--background-darker);
  }
</style>
