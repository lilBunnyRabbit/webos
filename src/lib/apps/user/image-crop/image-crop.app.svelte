<script lang="ts">
  import { Button, EmptyState, IconButton, Input, Select, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_bytes } from "$lib/core/utils";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowRight as ArrowRightIcon,
    Crop as CropIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { crop, find_crop_bounds, type CropBounds } from "./crop";
  import {
    FORMAT_OPTIONS,
    ImageFormat,
    error_message,
    extension_for,
    file_stem,
    has_files,
    image_files,
    load_image,
    load_image_at,
    paint,
    parent_folder,
    read_pixels,
    save_image,
    type SourceImage,
  } from "./image-io";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window: win } = get_app_context();

  let root = $state<HTMLElement>();
  let source = $state.raw<SourceImage | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);

  let alpha = $state<number | null>(0);
  let format = $state<ImageFormat>(ImageFormat.PNG);

  const alpha_percent = $derived(typeof alpha === "number" && Number.isFinite(alpha) ? alpha : 0);
  const pixels = $derived(source ? read_pixels(source.bitmap) : null);
  const bounds = $derived(pixels ? find_crop_bounds(pixels, alpha_percent) : null);
  const cropped = $derived(source && bounds ? crop(source.bitmap, bounds) : null);

  let request = 0;

  async function load(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      if (id === request) source = result;
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  const initial = untrack(() => initial_path);
  if (initial) load(() => load_image_at(initial));

  async function pick() {
    const start_path = source?.path ? parent_folder(source.path) : undefined;
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Open in Image Crop" });
    if (chosen) load(() => load_image_at(chosen));
  }

  function take(files: File[]) {
    const [file] = files;
    if (file) load(() => load_image(file));
  }

  function on_paste(event: ClipboardEvent) {
    if (!win.is_focused) return;
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

  function save() {
    if (!source || !cropped) return;
    save_image({
      app_id,
      window: win,
      canvas: cropped,
      name: `${file_stem(source.name)}-cropped${extension_for(format)}`,
      format,
      start_path: source.path ? parent_folder(source.path) : null,
    });
  }

  function percent(value: number, total: number) {
    return `${(value / total) * 100}%`;
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet panel(label: string, width: number, height: number, draw: (canvas: HTMLCanvasElement) => void, frame: CropBounds | null)}
  <figure class="flex min-h-0 min-w-0 flex-col gap-2">
    <div class="grid min-h-0 flex-1 place-items-center [container-type:size]">
      <div
        class="checker relative overflow-hidden rounded-xs ring-1 ring-foreground/10"
        style:aspect-ratio="{width} / {height}"
        style:width="min(100cqw, calc(100cqh * {width / height}))"
      >
        <canvas {@attach draw} class="block size-full [image-rendering:pixelated]"></canvas>
        {#if frame}
          <div
            class="crop-frame absolute"
            style:left={percent(frame.left, width)}
            style:top={percent(frame.top, height)}
            style:width={percent(frame.right - frame.left, width)}
            style:height={percent(frame.bottom - frame.top, height)}
          ></div>
        {/if}
      </div>
    </div>
    <figcaption class="truncate text-center font-mono text-2xs text-foreground/65 tabular-nums">{label} · {width} × {height} px</figcaption>
  </figure>
{/snippet}

<div
  bind:this={root}
  class="relative h-full"
  role="region"
  aria-label="Image Crop"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !bounds || !cropped}
    <EmptyState icon={CropIcon} title="No image open" description="Trims transparent borders from an image. Open one, drop it here or paste it.">
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid h-full grid-rows-[auto_1fr_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{source.name}</span>

        <label class="flex items-center gap-1.5 text-ui text-foreground/80" title="Pixels at or below this opacity count as transparent">
          Alpha
          <Input type="number" size="sm" min={0} max={100} bind:value={alpha} class="w-16 font-mono tabular-nums" />
          <span class="font-mono text-2xs">%</span>
        </label>
        <Separator vertical />
        <Select size="sm" options={FORMAT_OPTIONS} bind:value={format} aria-label="Format" />
        <Button variant="primary" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
      </Toolbar>

      <div
        class="stage grid min-h-0 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] place-items-stretch gap-3 p-4 @xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @xl:grid-rows-[minmax(0,1fr)] @xl:gap-4 @xl:p-6"
      >
        {@render panel("Original", source.bitmap.width, source.bitmap.height, paint(source.bitmap), bounds)}
        <div class="grid place-items-center text-foreground/65">
          <ArrowDownIcon class="size-5 @xl:hidden" weight="bold" />
          <ArrowRightIcon class="hidden size-5 @xl:block" weight="bold" />
        </div>
        {@render panel("Cropped", cropped.width, cropped.height, paint(cropped), null)}
      </div>

      <StatusBar>
        <span>{source.type || "unknown type"}</span>
        <span>{format_bytes(source.size)}</span>
      </StatusBar>
    </div>
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

  /* Transparent pixels are what this tool is about, so they show as a checkerboard instead of the stage colour. */
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  .crop-frame {
    outline: 1px solid var(--primary);
    box-shadow: 0 0 0 100vmax color-mix(in oklch, var(--primary) 40%, transparent);
  }
</style>
