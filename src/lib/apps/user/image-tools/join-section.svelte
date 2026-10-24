<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Input, Segmented, Select, Separator, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    Columns as ColumnsIcon,
    FloppyDisk as FloppyDiskIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Plus as PlusIcon,
    Rows as RowsIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { Align, Direction, concat_images } from "./join";
  import { joined_name } from "./naming";
  import type { SectionProps } from "./sections";
  import {
    FORMAT_OPTIONS,
    ImageFormat,
    extension_for,
    has_files,
    image_files,
    load_image,
    load_image_at,
    paint,
    save_image,
    type SourceImage,
  } from "$kit/utils/image";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { report_error } from "$kit/utils/report-error";

  const MIN_ZOOM = 10;
  const MAX_ZOOM = 100;
  const ZOOM_STEP = 10;

  const DIRECTIONS = [
    { value: Direction.COLUMN, label: "Vertical", icon: RowsIcon },
    { value: Direction.ROW, label: "Horizontal", icon: ColumnsIcon },
  ];
  const ALIGNS = [
    { value: Align.START, label: "Start" },
    { value: Align.CENTER, label: "Center" },
    { value: Align.END, label: "End" },
  ];

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window_id, window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let root = $state<HTMLElement>();
  let images = $state.raw<SourceImage[]>([]);
  let loading = $state(0);
  let dragging = $state(false);

  let direction = $state<Direction>(Direction.COLUMN);
  let align = $state<Align>(Align.START);
  let fit = $state(false);
  let gap = $state<number | null>(0);
  let background = $state("#ffffff");
  let alpha = $state<number | null>(0);
  let zoom = $state(50);
  let format = $state<ImageFormat>(ImageFormat.PNG);

  const result = $derived(
    concat_images(
      images.map((image) => image.bitmap),
      { gap: whole(gap), align, background, alpha: whole(alpha), fit, direction }
    )
  );
  const column = $derived(direction === Direction.COLUMN);

  function whole(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  async function add(tasks: (() => Promise<SourceImage>)[]) {
    if (!tasks.length) return;
    loading++;
    const results = await Promise.allSettled(tasks.map((task) => task()));
    loading--;
    const loaded = results.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
    if (destroyed) return close_all(loaded);
    if (loaded.length) images = [...images, ...loaded];
    for (const entry of results) {
      if (entry.status === "rejected") {
        report_error(app_id, "Couldn't open the image", entry.reason);
      }
    }
  }

  let destroyed = false;

  function close_all(list: SourceImage[]) {
    for (const image of list) image.bitmap.close();
  }

  onDestroy(() => {
    destroyed = true;
    close_all(images);
  });

  const initial = untrack(() => initial_paths);
  if (initial.length) add(initial.map((path) => () => load_image_at(path)));

  const start_path = $derived.by(() => {
    const path = images.find((image) => image.path)?.path;
    return path ? parent_path(path) : undefined;
  });

  async function pick() {
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Add to Join", multiple: true });
    add(chosen.map((path) => () => load_image_at(path)));
  }

  function take(files: File[]) {
    add(files.map((file) => () => load_image(file)));
  }

  function remove(index: number) {
    const removed = images[index];
    images = images.filter((_, i) => i !== index);
    removed?.bitmap.close();
  }

  function remove_all() {
    const removed = images;
    images = [];
    close_all(removed);
  }

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const files = image_files(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    take(files);
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

  function zoom_by(delta: number) {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
  }

  function save() {
    if (!result) return;
    save_image({
      app_id,
      window: win,
      canvas: result,
      name: joined_name(extension_for(format)),
      format,
      start_path: start_path ?? null,
    });
  }
</script>

<svelte:document onpaste={on_paste} />

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Join"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Add images…" size="sm" onclick={pick}><PlusIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{images.length ? `${images.length} ${images.length === 1 ? "image" : "images"}` : ""}</span>
    {#if result}
      {#if loading}<Spinner label="Loading images" />{/if}

      <IconButton label="Zoom out" size="sm" disabled={zoom <= MIN_ZOOM} onclick={() => zoom_by(-ZOOM_STEP)}>
        <MagnifyingGlassMinusIcon weight="bold" />
      </IconButton>
      <span class="min-w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums">{zoom}%</span>
      <IconButton label="Zoom in" size="sm" disabled={zoom >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)}>
        <MagnifyingGlassPlusIcon weight="bold" />
      </IconButton>
      <Separator vertical />
      <Select size="sm" class="w-auto" options={FORMAT_OPTIONS} bind:value={format} aria-label="Format" />
      <Button variant="primary" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
    {/if}
  </Toolbar>

  {#if !result}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading images" /></div>
    {:else}
      <EmptyState icon={RowsIcon} title="No images yet" description="Joins images into one, stacked or side by side. Add them one by one, drop them here or paste them.">
        {#snippet actions()}<Button variant="primary" onclick={pick}><PlusIcon weight="bold" /> Add images…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[16rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside class="flex max-h-56 flex-col gap-4 overflow-auto border-b border-hairline bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between px-0.5">
            <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Images</h3>
            <IconButton label="Remove all" size="sm" onclick={remove_all}><TrashIcon weight="bold" /></IconButton>
          </div>
          <ol class="flex flex-col gap-0.5">
            {#each images as image, index (image)}
              <li class="flex h-8 items-center gap-2 rounded-md pl-2">
                <span class="w-4 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
                <span class="min-w-0 flex-1 truncate text-ui" title={image.path ?? image.name}>{image.name}</span>
                <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{image.bitmap.width}×{image.bitmap.height}</span>
                <IconButton label="Remove {image.name}" size="sm" onclick={() => remove(index)}><XIcon weight="bold" /></IconButton>
              </li>
            {/each}
          </ol>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Layout</h3>
          <Segmented label="Direction" options={DIRECTIONS} bind:value={direction} class="self-start" />
          <label class="flex items-center justify-between gap-2 text-ui">
            {column ? "Match widths" : "Match heights"}
            <Switch bind:checked={fit} />
          </label>
          {#if !fit}
            <div class="flex flex-col gap-1.5">
              <span class="text-ui">Align</span>
              <Segmented label="Align" options={ALIGNS} bind:value={align} class="self-start" />
            </div>
          {/if}
          <label class="flex items-center justify-between gap-2 text-ui">
            Gap
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={0} bind:value={gap} class="w-16 font-mono tabular-nums" />
              <span class="w-3 font-mono text-2xs text-foreground/80">px</span>
            </span>
          </label>
        </div>

        <div class="flex flex-col gap-2.5">
          <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Background</h3>
          <div class="flex items-center gap-2">
            <label class="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-inset ring-hairline-strong" style:background title="Pick background colour">
              <input type="color" class="absolute inset-0 cursor-pointer opacity-0" bind:value={background} />
            </label>
            <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80 uppercase">{background}</span>
          </div>
          <label class="flex items-center justify-between gap-2 text-ui" title="0% leaves the background transparent">
            Opacity
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={0} max={100} bind:value={alpha} class="w-16 font-mono tabular-nums" />
              <span class="w-3 font-mono text-2xs text-foreground/80">%</span>
            </span>
          </label>
        </div>
      </aside>

      <div class="stage min-h-0 overflow-auto p-6 [container-type:size]">
        <div class="grid h-max min-h-full w-max min-w-full place-items-center">
          <canvas
            {@attach paint(result)}
            class="checker block ring-1 ring-hairline-strong [image-rendering:pixelated]"
            style:width={column ? `${zoom}cqw` : undefined}
            style:height={column ? undefined : `${zoom}cqh`}
          ></canvas>
        </div>
      </div>
    </div>

    <StatusBar>
      <span>{result.width} × {result.height} px</span>
      <span class="ml-auto">{column ? "vertical" : "horizontal"}{fit ? ", matched" : `, ${align}`}</span>
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to add</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  /* With no background fill the joined image keeps transparency, shown as a checkerboard. */
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>
