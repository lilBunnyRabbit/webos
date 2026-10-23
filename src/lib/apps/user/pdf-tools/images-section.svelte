<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Select, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import {
    ArrowLeft as ArrowLeftIcon,
    ArrowRight as ArrowRightIcon,
    DotsSixVertical as DotsSixVerticalIcon,
    FilePdf as FilePdfIcon,
    ImageSquare as ImageSquareIcon,
    Images as ImagesIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import DropZone from "./drop-zone.svelte";
  import { PageSize } from "./geometry";
  import { run_job } from "./job";
  import { images_pdf_name } from "./naming";
  import { PdfWriter } from "./pdf";
  import { IMAGE_ACCEPT, is_image, prepare_image, source_at, write_at, type SourceFile } from "./pdf-files";
  import { ReorderHandler } from "./reorder.handler.svelte";
  import { parent_path } from "$lib/core/api/services/files/path";

  const { picker, initial_paths }: { picker: Snippet; initial_paths: string[] } = $props();
  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));

  interface ImageItem {
    id: string;
    source: SourceFile;
    url: string;
  }

  const SIZES = [
    { value: PageSize.A4, label: "A4" },
    { value: PageSize.LETTER, label: "Letter" },
    { value: PageSize.A3, label: "A3" },
    { value: PageSize.IMAGE, label: "Image size" },
  ];
  const MARGINS = [
    { value: "0", label: "No margin" },
    { value: "18", label: "Small margin" },
    { value: "36", label: "Margin" },
    { value: "72", label: "Wide margin" },
  ];

  const settings = storage.persisted(
    "images",
    { size: PageSize.A4 as PageSize, margin: "36" },
    z.object({ size: z.enum([PageSize.A4, PageSize.LETTER, PageSize.A3, PageSize.IMAGE]), margin: z.enum(["0", "18", "36", "72"]) })
  );

  let items = $state.raw<ImageItem[]>([]);
  let busy = $state(false);
  const start_path = $derived(items.find((item) => item.source.path)?.source.path);

  const reorder = new ReorderHandler("x", (from, slot) => move_to(from, slot > from ? slot - 1 : slot));

  function move_to(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    items = next;
  }

  function add(sources: SourceFile[]) {
    const added = sources.filter(is_image).map((source) => ({ id: crypto.randomUUID(), source, url: URL.createObjectURL(source.file) }));
    items = [...items, ...added];
  }

  function remove(id: string) {
    const item = items.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.url);
    items = items.filter((entry) => entry.id !== id);
  }

  function clear() {
    for (const item of items) URL.revokeObjectURL(item.url);
    items = [];
  }

  $effect(() => () => untrack(() => items).forEach((item) => URL.revokeObjectURL(item.url)));

  async function add_paths(paths: string[]) {
    const sources = await Promise.all(paths.map((path) => source_at(path).catch(() => null)));
    add(sources.filter((source) => source !== null));
  }

  const initial = untrack(() => initial_paths);
  if (initial.length) void add_paths(initial);

  async function pick() {
    const paths = await win.pick_file({
      accept: IMAGE_ACCEPT,
      title: "Add images",
      start_path: start_path ? parent_path(start_path) : undefined,
      multiple: true,
    });
    if (paths.length) await add_paths(paths);
  }

  async function create() {
    if (!items.length || busy) return;
    const path = await win.pick_save({
      name: images_pdf_name(items.map((item) => item.source.name)),
      accept: [".pdf", "application/pdf"],
      start_path: start_path ? parent_path(start_path) : "/home",
      title: "Save PDF as",
    });
    if (!path) return;
    const list = items.map((item) => item.source);
    const { size, margin } = settings.value;
    busy = true;
    await run_job(
      app_id,
      `Making a PDF of ${list.length} ${list.length === 1 ? "image" : "images"}`,
      () => {
        const writer = new PdfWriter();
        return [
          ...list.map((source) => ({
            name: source.name,
            async run() {
              const image = await prepare_image(source);
              await writer.append_image(image, size, Number(margin));
              return `${image.width}×${image.height} ${image.kind.toUpperCase()}`;
            },
          })),
          { name: "Write PDF", run: async () => write_at(path, await writer.finish()) },
        ];
      },
      () => ({ title: "PDF created", message: `${path} · ${list.length} ${list.length === 1 ? "page" : "pages"}`, actions: [{ label: "Open", on_click: () => apps.open(path) }] })
    );
    busy = false;
  }

  function on_key(event: KeyboardEvent, index: number) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove(items[index].id);
      return;
    }
    if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const to = index + (event.key === "ArrowLeft" ? -1 : 1);
    move_to(index, to);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-image-id="${items[to]?.id}"]`)?.focus());
  }
</script>

<DropZone label="Drop images to add them" class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={add}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Add images…" size="sm" onclick={pick} disabled={busy}><ImageSquareIcon weight="bold" /></IconButton>
    <span class="flex-1"></span>
    <Select size="sm" aria-label="Page size" class="w-auto" options={SIZES} bind:value={settings.value.size} />
    <Select size="sm" aria-label="Margin" class="w-auto" options={MARGINS} bind:value={settings.value.margin} />
    {#if items.length}
      <IconButton label="Remove all" size="sm" onclick={clear} disabled={busy}><TrashIcon weight="bold" /></IconButton>
    {/if}
    <Button variant="primary" size="sm" onclick={create} disabled={!items.length || busy}><FilePdfIcon weight="bold" /> Create PDF…</Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto bg-background-darker">
    {#if !items.length}
      <EmptyState icon={ImagesIcon} title="No images yet" description="Add PNG, JPEG or other images. Each one becomes a page, in the order shown.">
        {#snippet actions()}
          <Button variant="primary" onclick={pick}><ImageSquareIcon weight="bold" /> Add images…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <ol
        {@attach reorder.attachment()}
        role="listbox"
        aria-label="Pages in order. Alt+Left and Alt+Right move the focused image, Delete removes it."
        class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 p-3"
      >
        {#each items as item, index (item.id)}
          <li
            data-image-id={item.id}
            role="option"
            aria-selected="false"
            data-reorder-index={index}
            tabindex="0"
            onkeydown={(event) => on_key(event, index)}
            class={cn(
              "group relative flex cursor-grab flex-col gap-1.5 rounded-lg p-2 outline-none select-none transition-[background-color,box-shadow] hover:bg-background-lighter hover:shadow-control focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
              reorder.from === index && "opacity-40"
            )}
          >
            {#if reorder.from !== null && reorder.slot === index}
              <span class="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-primary"></span>
            {/if}
            {#if reorder.from !== null && reorder.slot === items.length && index === items.length - 1}
              <span class="absolute inset-y-2 -right-2 w-0.5 rounded-full bg-primary"></span>
            {/if}
            <div class="grid aspect-square place-items-center overflow-hidden">
              <img src={item.url} alt="" draggable="false" class="max-h-full max-w-full shadow-raised" />
            </div>
            <div class="flex items-center gap-1">
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
              <span class="min-w-0 flex-1 truncate text-2xs" title={item.source.name}>{item.source.name}</span>
              <span data-reorder-grip class="hidden size-9 shrink-0 touch-none place-items-center text-foreground/65 pointer-coarse:grid" aria-hidden="true">
                <DotsSixVerticalIcon weight="bold" class="size-4" />
              </span>
            </div>
            <div class="absolute top-1 right-1 flex gap-0.5 rounded-md bg-background-light opacity-0 shadow-raised group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
              <IconButton label="Move left" size="sm" class="hidden @md:inline-flex" disabled={index === 0} onclick={() => move_to(index, index - 1)}><ArrowLeftIcon weight="bold" /></IconButton>
              <IconButton label="Move right" size="sm" class="hidden @md:inline-flex" disabled={index === items.length - 1} onclick={() => move_to(index, index + 1)}><ArrowRightIcon weight="bold" /></IconButton>
              <IconButton label="Remove {item.source.name}" size="sm" onclick={() => remove(item.id)}><XIcon weight="bold" /></IconButton>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  <StatusBar>
    <span>{items.length} {items.length === 1 ? "image" : "images"}</span>
    <span>{SIZES.find((size) => size.value === settings.value.size)?.label} · {MARGINS.find((margin) => margin.value === settings.value.margin)?.label.toLowerCase()}</span>
  </StatusBar>
</DropZone>
