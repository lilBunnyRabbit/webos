<script lang="ts">
  import kernel, { NotificationType, type AppsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Input, Segmented, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import {
    Columns as ColumnsIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Rows as RowsIcon,
    SquareSplitHorizontal as SquareSplitHorizontalIcon,
    WarningCircle as WarningCircleIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import type { SectionProps } from "./sections";
  import { clamp_count, compute_layout, draw_preview, MAX_COUNT, render_tiles, SplitDirection } from "./split";
  import { split_folder_name, tile_name } from "./naming";
  import { has_files, image_files, load_image, type SourceImage } from "$lib/core/utils/image";
  import { parent_path } from "$lib/core/api/services/files/path";

  const { picker, initial_paths }: SectionProps = $props();

  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let source = $state.raw<SourceImage | null>(null);
  let loading = $state(false);
  let load_error = $state<{ title: string; description: string } | null>(null);
  let load_id = 0;

  let direction = $state<SplitDirection>(SplitDirection.COLUMNS);
  let count = $state(1);
  let progress = $state<{ done: number; total: number } | null>(null);
  let dragging = $state(false);

  const layout = $derived(
    source ? compute_layout(source.bitmap.width, source.bitmap.height, { direction, count }) : null
  );

  function report(title: string, error: unknown, type: NotificationType = NotificationType.ERROR) {
    console.error(`[ImageTools] ${title}`, error);
    notifications.notify(app_id, { type, title, message: error_message(error) });
  }

  // A save keeps rendering tiles from its bitmap after another image is opened; that one closes when the save ends.
  let saving: ImageBitmap | null = null;
  let destroyed = false;

  function release(bitmap: ImageBitmap) {
    if (bitmap !== saving) bitmap.close();
  }

  onDestroy(() => {
    destroyed = true;
    if (source) release(source.bitmap);
  });

  async function open_file(file: File, file_path: string | null) {
    const id = ++load_id;
    loading = true;
    try {
      const loaded = await load_image(file, file_path);
      if (id !== load_id) return loaded.bitmap.close();
      const previous = source;
      source = loaded;
      if (previous) release(previous.bitmap);
      load_error = null;
    } catch (error) {
      if (id !== load_id) return;
      if (source) report("Couldn't open the image", error);
      else load_error = { title: "Couldn't open the image", description: error_message(error) };
    } finally {
      if (id === load_id) loading = false;
    }
  }

  async function open_path(file_path: string) {
    const id = ++load_id;
    try {
      const file = await files.get_file(file_path);
      if (id !== load_id) return;
      if (file) return open_file(file, file_path);
      if (source) report("File not found", file_path);
      else load_error = { title: "File not found", description: file_path };
    } catch (error) {
      if (id !== load_id) return;
      if (source) report("Couldn't read the file", error);
      else load_error = { title: "Couldn't read the file", description: error_message(error) };
    }
  }

  async function pick() {
    const start_path = source?.path ? parent_path(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ["image/*"], title: "Split an image", start_path });
    if (chosen) open_path(chosen);
  }

  const initial = untrack(() => initial_paths[0]);
  if (initial) open_path(initial);

  async function save() {
    if (!source || !layout || progress) return;
    const { bitmap, name, path: source_path } = source;
    const plan = layout;

    const folder = await win.pick_directory({ title: "Save tiles to…", start_path: source_path ? parent_path(source_path) : undefined });
    if (!folder || bitmap !== source?.bitmap) return;

    const total = plan.columns * plan.rows;
    progress = { done: 0, total };
    saving = bitmap;
    try {
      const parent = await files.get_directory(folder);
      if (!parent) throw new Error(`${folder} no longer exists`);
      const target = await files.create_directory(parent, split_folder_name(name));
      for await (const tile of render_tiles(bitmap, plan)) {
        await files.create_file(target, tile_name(name, tile.number), { content: tile.blob });
        progress = { done: tile.number, total };
      }
      const target_path = `${folder === "/" ? "" : folder}/${target.name}`;
      notifications.notify(app_id, {
        title: `Saved ${total} ${total === 1 ? "tile" : "tiles"}`,
        message: target_path,
        actions: [{ label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: target_path }) }],
      });
    } catch (error) {
      report("Couldn't save the tiles", error);
    } finally {
      progress = null;
      saving = null;
      if (destroyed || bitmap !== source?.bitmap) bitmap.close();
    }
  }

  function on_drag(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    if (event.type === "dragleave") {
      if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dragging = false;
    } else {
      dragging = true;
    }
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    const file = image_files(event.dataTransfer)[0];
    if (file) open_file(file, null);
    else report("Not an image", "Drop a PNG, JPEG, WebP or other image file", NotificationType.WARNING);
  }

  function on_paste(event: ClipboardEvent) {
    const file = image_files(event.clipboardData)[0];
    if (!file) return;
    event.preventDefault();
    open_file(file, null);
  }
</script>

<!-- Focusable so clicks anywhere in the app take focus, which scopes paste to this window. -->
<div
  role="presentation"
  tabindex="-1"
  class={cn("relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto] outline-none", dragging && "ring-2 ring-primary ring-inset")}
  ondragenter={on_drag}
  ondragover={on_drag}
  ondragleave={on_drag}
  ondrop={on_drop}
  onpaste={on_paste}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    {#if source}
      <span class="hidden min-w-0 flex-1 truncate px-1 text-ui font-medium @md:block" title={source.path ?? source.name}>{source.name}</span>
      <span class="flex-1 @md:hidden"></span>
      <Segmented
        size="sm"
        label="Split into"
        bind:value={direction}
        options={[
          { value: SplitDirection.COLUMNS, label: "Columns", icon: ColumnsIcon },
          { value: SplitDirection.ROWS, label: "Rows", icon: RowsIcon },
        ]}
      />
      <Input
        size="sm"
        type="number"
        class="w-16"
        aria-label={direction === SplitDirection.COLUMNS ? "Columns" : "Rows"}
        min="1"
        max={MAX_COUNT}
        value={count}
        oninput={(event) => {
          const value = event.currentTarget.valueAsNumber;
          if (Number.isFinite(value)) count = clamp_count(value);
        }}
      />
      <Separator vertical />
      <Button variant="primary" size="sm" disabled={!!progress} onclick={save}>
        <FloppyDiskIcon weight="bold" /> Save tiles…
      </Button>
    {/if}
  </Toolbar>

  {#if !source}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
    {:else if load_error}
      <EmptyState icon={WarningCircleIcon} tone="error" title={load_error.title} description={load_error.description}>
        {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
      </EmptyState>
    {:else}
      <EmptyState
        icon={SquareSplitHorizontalIcon}
        title="Split an image into tiles"
        description="Cut an image into equal squares for grid layouts. Open one, or drop or paste it here."
      >
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="stage grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-6">
      {#if layout}
        <canvas
          class="max-h-full max-w-full rounded-sm"
          aria-label="{layout.columns} by {layout.rows} tiles"
          {@attach (canvas) => draw_preview(canvas, source!.bitmap, layout)}
        ></canvas>
      {/if}
    </div>

    <StatusBar>
      {#if progress}
        <span class="flex items-center gap-1.5 text-foreground"><Spinner label="Saving" /> Saving {progress.done} of {progress.total}</span>
      {/if}
      {#if layout}
        <span>{layout.columns} × {layout.rows} tiles</span>
        <span>{layout.tile} px</span>
      {/if}
      <span class="ml-auto hidden @sm:block">{source.bitmap.width} × {source.bitmap.height}</span>
    </StatusBar>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }
</style>
