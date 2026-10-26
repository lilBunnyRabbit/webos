<script lang="ts">
  import kernel, { Platform, type FilesService } from "$lib/core/api";
  import { cn, format_bytes, format_datetime, error_message, clamp } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    CornersOut as CornersOutIcon,
    HardDrives as HardDrivesIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    MusicNote as MusicNoteIcon,
    Warning as WarningIcon,
    FileImage as FileImageIcon,
    FolderOpen as FolderOpenIcon,
    Image as ImageIcon,
  } from "phosphor-svelte";
  import { Button, EmptyState, IconButton, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { save_to_disk, set_wallpaper } from "$lib/core/components/files/file-actions";
  import { flushSync, untrack } from "svelte";
  import manifest from "./index";
  import { distance, fit_scale, midpoint, rotated_size, type Point, type Size } from "./zoom";
  import { find_duration } from "./duration";
  import { is_jxl, jxl_to_png } from "./jxl";

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.25;
  const STAGE_PADDING = kernel.platform === Platform.MOBILE ? 8 : 24;

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let source = $state.raw<string | File | undefined>(untrack(() => initial_path));
  const path = $derived(typeof source === "string" ? source : null);
  const { window: win } = get_app_context();

  async function pick() {
    const chosen = await win.pick_file({ accept: manifest.associations, title: "Open in Media Preview" });
    if (chosen) source = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));

  /** `undefined` while loading, `null` when the path points at nothing. */
  let file = $state<File | null | undefined>(undefined);
  let error = $state<string | null>(null);
  let url = $state<string | null>(null);

  let zoom = $state(1);
  let rotation = $state(0);
  let fit = $state(true);

  let stage: HTMLDivElement | null = $state(null);
  let box: HTMLDivElement | null = $state(null);
  let stage_width = $state(0);
  let stage_height = $state(0);
  /** The image's intrinsic size, known once it has loaded. */
  let natural = $state.raw<Size | null>(null);

  const turned = $derived(natural ? rotated_size(natural, rotation) : null);
  const fitted = $derived(
    turned ? fit_scale(turned, { width: stage_width - 2 * STAGE_PADDING, height: stage_height - 2 * STAGE_PADDING }) : 1
  );
  const scale = $derived(fit ? fitted : zoom);
  // The limits stretch to include fit, so a huge photo or a tiny icon can still zoom out of, and back into, fit.
  const min_zoom = $derived(Math.min(MIN_ZOOM, fitted || MIN_ZOOM));
  const max_zoom = $derived(Math.max(MAX_ZOOM, fitted));

  const kind = $derived.by(() => {
    const type = file?.type ?? "";
    if (type.startsWith("image/") || (file && is_jxl(file))) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "unsupported";
  });

  $effect(() => {
    if (!source) return;
    error = null;
    reset_view();
    if (source instanceof File) {
      file = source;
      return;
    }
    file = undefined;
    let cancelled = false;
    files
      .get_file(source)
      .then((result) => {
        if (!cancelled) file = result;
      })
      .catch((reason) => {
        if (!cancelled) error = error_message(reason);
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!file) return;
    const shown = file;
    natural = null;
    let object_url: string | null = null;
    let cancelled = false;
    const show = (blob: Blob) => {
      object_url = URL.createObjectURL(blob);
      url = object_url;
    };
    if (is_jxl(shown)) {
      jxl_to_png(shown)
        .then((png) => !cancelled && show(png))
        .catch((reason) => {
          if (!cancelled) error = `Couldn't decode the JPEG XL: ${error_message(reason)}`;
        });
    } else {
      show(shown);
    }
    return () => {
      cancelled = true;
      if (object_url) URL.revokeObjectURL(object_url);
      url = null;
    };
  });

  /** Zooms so the image point under `anchor` (client coordinates) stays under it. */
  function zoom_at(next: number, anchor: Point) {
    const before = box?.getBoundingClientRect();
    fit = false;
    zoom = clamp(next, min_zoom, max_zoom);
    if (!before || !box || !stage || !before.width || !before.height) return;
    const fx = (anchor.x - before.left) / before.width;
    const fy = (anchor.y - before.top) / before.height;
    flushSync();
    const after = box.getBoundingClientRect();
    stage.scrollLeft += after.left + fx * after.width - anchor.x;
    stage.scrollTop += after.top + fy * after.height - anchor.y;
  }

  function stage_center(): Point {
    const rect = stage?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  }

  function zoom_by(delta: number) {
    zoom_at(scale + delta, stage_center());
  }

  function reset_view() {
    fit = true;
    zoom = 1;
    rotation = 0;
  }

  function on_image_load(event: Event) {
    const image = event.currentTarget as HTMLImageElement;
    natural = { width: image.naturalWidth, height: image.naturalHeight };
  }

  function on_wheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom_at(scale + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), { x: event.clientX, y: event.clientY });
  }

  // Touch and pen only: the mouse keeps the scrollbars and Ctrl + wheel. Not reactive, it's per-gesture bookkeeping.
  const pointers = new Map<number, Point>();
  let gesture: { center: Point; spread: number; scale: number } | null = null;
  let pinched = false;

  function begin_gesture() {
    const [a, b] = pointers.values();
    gesture = a ? { center: b ? midpoint(a, b) : a, spread: b ? distance(a, b) : 0, scale } : null;
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" || pointers.size >= 2) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    begin_gesture();
  }

  function on_pointermove(event: PointerEvent) {
    if (!gesture || !stage || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a, b] = pointers.values();
    const center = b ? midpoint(a, b) : a;
    if (b && gesture.spread > 0) {
      pinched = true;
      zoom_at((gesture.scale * distance(a, b)) / gesture.spread, gesture.center);
    }
    stage.scrollLeft -= center.x - gesture.center.x;
    stage.scrollTop -= center.y - gesture.center.y;
    gesture.center = center;
  }

  function on_lostpointercapture(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    begin_gesture();
    if (gesture) return;
    // Pinching below fit snaps back to it, the way photo viewers settle.
    if (pinched && !fit && zoom <= fitted) fit = true;
    pinched = false;
  }

</script>

<div class="contents" {@attach paste_files({ win, accept: manifest.associations, onfiles: ([file]) => (source = file) })}>
  {#if !source}
    <EmptyState icon={FileImageIcon} title="Nothing to preview" description="Pick or paste an image, video or audio file, or open one from File Explorer.">
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>{/snippet}
    </EmptyState>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the file" description={error} />
  {:else if file === undefined}
    <div class="grid h-full place-items-center"><Spinner label="Loading file" /></div>
  {:else if file === null}
    <EmptyState icon={WarningIcon} tone="error" title="File not found" description={path ?? undefined} />
  {:else}
    <div class="grid h-full grid-rows-[auto_1fr_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <!-- Below @lg the controls don't leave the name room, so it takes the first row of the wrapping toolbar. -->
        <span class="order-first min-w-0 basis-full truncate px-1 text-ui font-medium @lg:order-none @lg:flex-1 @lg:basis-auto">{file.name}</span>

        {#if kind === "image"}
          <IconButton label="Zoom out" size="sm" disabled={scale <= min_zoom} onclick={() => zoom_by(-ZOOM_STEP)}>
            <MagnifyingGlassMinusIcon weight="bold" />
          </IconButton>
          <span class="min-w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
          <IconButton label="Zoom in" size="sm" disabled={scale >= max_zoom} onclick={() => zoom_by(ZOOM_STEP)}>
            <MagnifyingGlassPlusIcon weight="bold" />
          </IconButton>
          <IconButton label="Rotate" size="sm" onclick={() => (rotation = (rotation + 90) % 360)}>
            <ArrowClockwiseIcon weight="bold" />
          </IconButton>
          <IconButton label="Fit to window" size="sm" onclick={reset_view}>
            <CornersOutIcon weight="bold" />
          </IconButton>
          <Separator vertical />
        {/if}

        <!-- The desktop draws its wallpaper through CSS, which can't decode JPEG XL. -->
        {#if kind === "image" && source && !is_jxl(file)}
          <IconButton label="Set as wallpaper" size="sm" class="ml-auto @lg:ml-0" onclick={() => source && set_wallpaper(source)}>
            <ImageIcon weight="bold" />
          </IconButton>
        {/if}
        {#if path}
          <IconButton label="Save to disk…" size="sm" class={cn((kind !== "image" || is_jxl(file)) && "ml-auto @lg:ml-0")} onclick={() => path && save_to_disk(path)}>
            <HardDrivesIcon weight="bold" />
          </IconButton>
        {/if}
      </Toolbar>

      <div class="stage min-h-0 overflow-auto" bind:this={stage} bind:clientWidth={stage_width} bind:clientHeight={stage_height}>
        {#if !url}
          <div class="grid h-full place-items-center"><Spinner /></div>
        {:else if kind === "image"}
          <!--
            The box takes the zoomed, rotated size in layout, so overflow scrolls from its real top-left edge (a transform
            wouldn't grow the scroll area). overflow-clip stops the image's mid-rotation corners from adding scrollbars.
          -->
          <div
            role="presentation"
            class="grid min-h-full w-max min-w-full touch-none place-items-center overflow-clip"
            style:padding="{STAGE_PADDING}px"
            onwheel={on_wheel}
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onlostpointercapture={on_lostpointercapture}
          >
            <div
              bind:this={box}
              class="relative"
              style:width={turned ? `${Math.floor(turned.width * scale)}px` : undefined}
              style:height={turned ? `${Math.floor(turned.height * scale)}px` : undefined}
            >
              <img
                src={url}
                alt={file.name}
                draggable="false"
                class={cn("max-w-none rounded-sm transition-transform duration-200 ease-out", natural ? "absolute top-1/2 left-1/2" : "invisible")}
                style:width={natural ? `${natural.width * scale}px` : undefined}
                style:height={natural ? `${natural.height * scale}px` : undefined}
                style:transform={natural ? `translate(-50%, -50%) rotate(${rotation}deg)` : undefined}
                onload={on_image_load}
              />
            </div>
          </div>
        {:else if kind === "video"}
          <div class="grid h-full grid-cols-1 grid-rows-1 place-items-center p-6">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={url} controls {@attach find_duration} class="max-h-full max-w-full rounded-lg shadow-window"></video>
          </div>
        {:else if kind === "audio"}
          <div class="flex h-full flex-col items-center justify-center gap-5 p-8">
            <div class="grid size-28 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
              <MusicNoteIcon class="size-12 text-primary" weight="duotone" />
            </div>
            <p class="max-w-full truncate text-sm font-medium">{file.name}</p>
            <audio src={url} controls {@attach find_duration} class="w-full max-w-md"></audio>
          </div>
        {:else}
          <EmptyState icon={WarningIcon} title="Can't preview this file" description={file.type || "Unknown type"} />
        {/if}
      </div>

      <StatusBar>
        <span>{file.type || "unknown type"}</span>
        <span>{format_bytes(file.size)}</span>
        <span class="ml-auto">{format_datetime(file.lastModified)}</span>
      </StatusBar>
    </div>
  {/if}
</div>

<style>
  /* Media sits on the darker shade so images with transparency and dark video edges still read as a frame. */
  .stage {
    background: var(--background-darker);
  }
</style>
