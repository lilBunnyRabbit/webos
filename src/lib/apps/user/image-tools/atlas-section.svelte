<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Input, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { has_drag_paths, read_drag_paths, read_os_entries } from "$lib/core/components/files/drag";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import {
    Export as ExportIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Plus as PlusIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { has_files, is_image_file, load_image, load_image_at, paint, read_pixels, type SourceImage } from "$kit/utils/image";
  import { AtlasFormat, SHEET_SIZES, natural_compare, pack, unique_names, type AtlasFrame, type Rect } from "./atlas";
  import { draw_sheet, export_atlas, type SheetFrame } from "./atlas-render";
  import { is_image_name } from "./naming";
  import type { SectionProps } from "./sections";
  import { pinch_view, zoom_view, type Point, type View as Camera } from "$kit/utils/view";
  import { find_crop_bounds, type CropBounds } from "./trim";
  import { report_error } from "$kit/utils/report-error";

  interface Frame {
    image: SourceImage;
    bounds: CropBounds;
  }

  const Panel = { FRAMES: "frames", OPTIONS: "options" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const PANELS = [
    { value: Panel.FRAMES, label: "Frames" },
    { value: Panel.OPTIONS, label: "Options" },
  ];
  const SIZE_OPTIONS = SHEET_SIZES.map((size) => ({ value: String(size), label: `${size} px` }));
  const FORMATS = [
    { value: AtlasFormat.JSON, label: "JSON" },
    { value: AtlasFormat.CSS, label: "CSS" },
  ];
  const PREVIEW_SIDE = 2048;
  const MAX_ZOOM = 32;
  const ZOOM_STEP = 1.5;
  const FIT: Camera = { scale: 1, offset_x: 0, offset_y: 0 };
  const TAP_SLOP = 6;

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let root = $state<HTMLElement>();
  let frames = $state.raw<Frame[]>([]);
  let loading = $state(0);
  let dragging = $state(false);
  let exporting = $state(false);
  let panel = $state<Panel>(Panel.FRAMES);

  let max_size = $state("2048");
  let padding = $state<number | null>(2);
  let extrude = $state<number | null>(0);
  let trim = $state(true);
  let power_of_two = $state(false);
  let format = $state<AtlasFormat>(AtlasFormat.JSON);

  let hovered = $state<number | null>(null);
  let selected = $state<number | null>(null);
  let fit = $state<HTMLElement>();
  let camera = $state.raw<Camera>(FIT);

  const names = $derived(unique_names(frames.map((frame) => frame.image.name)));
  const crops = $derived(
    frames.map(({ image, bounds }): Rect =>
      trim
        ? { x: bounds.left, y: bounds.top, w: bounds.right - bounds.left, h: bounds.bottom - bounds.top }
        : { x: 0, y: 0, w: image.bitmap.width, h: image.bitmap.height }
    )
  );
  const packed = $derived(
    frames.length ? pack(crops, { max: Number(max_size), padding: whole(padding), extrude: whole(extrude), power_of_two }) : null
  );
  const sheet = $derived(packed?.ok ? { w: packed.width, h: packed.height, positions: packed.positions } : null);
  const sheet_frames = $derived<SheetFrame[]>(
    sheet ? frames.map((frame, i) => ({ image: frame.image.bitmap, crop: crops[i], at: sheet.positions[i] })) : []
  );
  const preview = $derived(sheet ? draw_sheet(sheet, sheet_frames, whole(extrude), Math.min(1, PREVIEW_SIDE / Math.max(sheet.w, sheet.h))) : null);
  const label = $derived(hovered ?? selected);

  function whole(value: number | null): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  let destroyed = false;

  onDestroy(() => {
    destroyed = true;
    for (const frame of frames) frame.image.bitmap.close();
  });

  async function to_frame(task: () => Promise<SourceImage>): Promise<Frame> {
    const image = await task();
    return { image, bounds: find_crop_bounds(read_pixels(image.bitmap), 0) };
  }

  async function add(tasks: (() => Promise<SourceImage>)[]) {
    if (!tasks.length) return;
    loading++;
    const results = await Promise.allSettled(tasks.map(to_frame));
    loading--;
    const loaded = results.flatMap((entry) => (entry.status === "fulfilled" ? [entry.value] : []));
    if (destroyed) return loaded.forEach((frame) => frame.image.bitmap.close());
    if (loaded.length) {
      frames = [...frames, ...loaded].sort((a, b) => natural_compare(a.image.name, b.image.name));
      selected = null;
    }
    const failed = results.filter((entry) => entry.status === "rejected");
    if (failed.length) {
      report_error(app_id, failed.length === 1 ? "Couldn't open an image" : `Couldn't open ${failed.length} images`, failed[0].reason);
    }
  }

  async function add_paths(paths: string[]) {
    const expanded: string[] = [];
    for (const path of paths) {
      const directory = await files.get_directory(path);
      if (!directory) {
        if (is_image_name(path)) expanded.push(path);
        continue;
      }
      const items = await files.list(directory);
      for (const item of items) if (item.kind === "file" && is_image_name(item.name)) expanded.push(`${path === "/" ? "" : path}/${item.name}`);
    }
    add(expanded.map((path) => () => load_image_at(path)));
  }

  async function add_entries(entries: Promise<(File | FileSystemHandle)[]>) {
    const found: File[] = [];
    for (const entry of await entries) {
      if (entry instanceof File) found.push(entry);
      else if (entry instanceof FileSystemFileHandle) found.push(await entry.getFile());
      else if (entry instanceof FileSystemDirectoryHandle) {
        for await (const child of entry.values()) if (child instanceof FileSystemFileHandle) found.push(await child.getFile());
      }
    }
    take(found.filter(is_image_file));
  }

  function take(list: File[]) {
    add(list.map((file) => () => load_image(file)));
  }

  const initial = untrack(() => initial_paths);
  if (initial.length) add_paths(initial);

  const start_path = $derived.by(() => {
    const path = frames.find((frame) => frame.image.path)?.image.path;
    return path ? parent_path(path) : undefined;
  });

  async function pick_image() {
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Add frames", multiple: true });
    if (chosen.length) add_paths(chosen);
  }

  async function pick_folder() {
    const chosen = await win.pick_directory({ start_path, title: "Add a folder of frames" });
    if (chosen) add_paths([chosen]);
  }

  function remove(index: number) {
    const removed = frames[index];
    frames = frames.filter((_, i) => i !== index);
    removed?.image.bitmap.close();
    hovered = selected = null;
  }

  function remove_all() {
    const removed = frames;
    frames = [];
    for (const frame of removed) frame.image.bitmap.close();
    hovered = selected = null;
    camera = FIT;
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event) && !has_drag_paths(event)) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }

  function on_drop(event: DragEvent) {
    if (has_drag_paths(event)) {
      event.preventDefault();
      dragging = false;
      add_paths(read_drag_paths(event));
      return;
    }
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    add_entries(read_os_entries(event));
  }

  async function save() {
    if (!sheet || exporting) return;
    const chosen = await win.pick_save({ name: "atlas.zip", accept: [".zip"], start_path, title: "Export atlas as" });
    if (!chosen || !sheet) return;
    const canvas = draw_sheet(sheet, sheet_frames, whole(extrude));
    const entries: AtlasFrame[] = frames.map(({ image }, i) => ({
      name: names[i],
      frame: { ...sheet.positions[i], w: crops[i].w, h: crops[i].h },
      source: crops[i],
      source_size: { w: image.bitmap.width, h: image.bitmap.height },
    }));
    exporting = true;
    try {
      await export_atlas(app_id, canvas, entries, format, chosen);
    } finally {
      exporting = false;
    }
  }

  function screen_point(event: { clientX: number; clientY: number }): Point {
    const box = fit?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : { x: 0, y: 0 };
  }

  function clamp_camera(next: Camera): Camera {
    if (!fit) return FIT;
    const { width, height } = fit.getBoundingClientRect();
    const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
    return {
      scale,
      offset_x: Math.min(0, Math.max(width - width * scale, next.offset_x)),
      offset_y: Math.min(0, Math.max(height - height * scale, next.offset_y)),
    };
  }

  function zoom_by(factor: number) {
    if (!fit) return;
    const { width, height } = fit.getBoundingClientRect();
    camera = clamp_camera(zoom_view(camera, factor, width / 2, height / 2));
  }

  function frame_at(event: { clientX: number; clientY: number }): number | null {
    if (!sheet || !fit) return null;
    const point = screen_point(event);
    const ratio = sheet.w / (fit.getBoundingClientRect().width * camera.scale);
    const x = (point.x - camera.offset_x) * ratio;
    const y = (point.y - camera.offset_y) * ratio;
    const index = sheet.positions.findIndex((at, i) => x >= at.x && y >= at.y && x < at.x + crops[i].w && y < at.y + crops[i].h);
    return index >= 0 ? index : null;
  }

  const pointers = new Map<number, Point>();
  let pinch: { camera: Camera; mid: Point; distance: number } | null = null;
  let pan: { start: Point; camera: Camera; moved: boolean } | null = null;
  let spent = false;

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function on_pointerdown(event: PointerEvent) {
    if (!sheet || (event.button !== 0 && event.button !== 1)) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pointers.size === 2 && event.pointerType !== "mouse") {
      pan = null;
      spent = true;
      pinch = { camera, ...spread() };
      return;
    }
    if (pointers.size > 1 || spent) return;
    pan = { start: screen, camera, moved: false };
  }

  function on_pointermove(event: PointerEvent) {
    const screen = screen_point(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, screen);
    if (pinch) {
      if (pointers.size < 2) return;
      const { mid, distance } = spread();
      camera = clamp_camera(pinch_view(pinch.camera, pinch.mid, pinch.distance, mid, distance));
      return;
    }
    if (pan) {
      const dx = screen.x - pan.start.x;
      const dy = screen.y - pan.start.y;
      if (!pan.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      pan.moved = true;
      camera = clamp_camera({ scale: pan.camera.scale, offset_x: pan.camera.offset_x + dx, offset_y: pan.camera.offset_y + dy });
      return;
    }
    if (event.pointerType === "mouse") hovered = frame_at(event);
  }

  function on_pointerend(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
    } else if (pan) {
      if (!pan.moved && event.type !== "pointercancel") {
        const hit = frame_at(event);
        selected = hit === selected ? null : hit;
      }
      pan = null;
    }
    if (!pointers.size) spent = false;
  }

  // Wheel listeners must be non-passive to stop the page from scrolling.
  function wheel(element: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!sheet) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const { x, y } = screen_point(event);
        camera = clamp_camera(zoom_view(camera, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), x, y));
      } else {
        camera = clamp_camera({ scale: camera.scale, offset_x: camera.offset_x - event.deltaX, offset_y: camera.offset_y - event.deltaY });
      }
    };
    element.addEventListener("wheel", on_wheel, { passive: false });
    return () => element.removeEventListener("wheel", on_wheel);
  }

  function percent(value: number, total: number): string {
    return `${(value / total) * 100}%`;
  }
</script>

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept: ["image/*"], multiple: true, onfiles: (files) => take(files) })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Atlas"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Add images…" size="sm" onclick={pick_image}><PlusIcon weight="bold" /></IconButton>
    <IconButton label="Add a folder…" size="sm" onclick={pick_folder}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{frames.length ? `${frames.length} ${frames.length === 1 ? "frame" : "frames"}` : ""}</span>
    {#if loading}<Spinner label="Loading images" />{/if}
    {#if frames.length}
      <Button variant="primary" size="sm" disabled={!sheet || exporting} onclick={save}><ExportIcon weight="bold" /> Export…</Button>
    {/if}
  </Toolbar>

  {#if !frames.length}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading images" /></div>
    {:else}
      <EmptyState
        icon={SquaresFourIcon}
        title="No frames yet"
        description="Packs many images into one sprite sheet, with a JSON or CSS map of where each one went. Add a folder of frames, or drop or paste images here."
      >
        {#snippet actions()}
          <Button variant="primary" onclick={pick_folder}><FolderOpenIcon weight="bold" /> Add a folder…</Button>
          <Button onclick={pick_image}><PlusIcon weight="bold" /> Add images…</Button>
        {/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        <Segmented label="Settings" options={PANELS} bind:value={panel} class="sticky top-0 z-10 w-full shrink-0 *:flex-1 @2xl:hidden" />

        <div class={["flex flex-col gap-2.5", panel !== Panel.OPTIONS && "hidden @2xl:flex"]}>
          {@render heading("Sheet")}
          <label class="flex items-center justify-between gap-2 text-ui">
            Max size
            <Select size="sm" class="w-auto" options={SIZE_OPTIONS} bind:value={max_size} aria-label="Max size" />
          </label>
          <label class="flex items-center justify-between gap-2 text-ui" title="Pixels between frames and around the edge">
            Padding
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={0} max={256} bind:value={padding} class="w-16 font-mono tabular-nums" />
              <span class="w-3 font-mono text-2xs text-foreground/80">px</span>
            </span>
          </label>
          <label class="flex items-center justify-between gap-2 text-ui" title="Repeats each frame's edge pixels outward, so scaled sprites don't pick up their neighbours">
            Extrude
            <span class="flex items-center gap-1.5">
              <Input type="number" size="sm" min={0} max={256} bind:value={extrude} class="w-16 font-mono tabular-nums" />
              <span class="w-3 font-mono text-2xs text-foreground/80">px</span>
            </span>
          </label>
          <label class="flex items-center justify-between gap-2 text-ui" title="Packs only each frame's visible pixels; the JSON keeps the offset">
            Trim transparent borders
            <Switch bind:checked={trim} />
          </label>
          <label class="flex items-center justify-between gap-2 text-ui">
            Power of two
            <Switch bind:checked={power_of_two} />
          </label>
          <div class="flex items-center justify-between gap-2 text-ui">
            <span>Map</span>
            <Segmented size="sm" label="Map format" options={FORMATS} bind:value={format} />
          </div>
        </div>

        <div class={["flex flex-col gap-1.5", panel !== Panel.FRAMES && "hidden @2xl:flex"]}>
          <div class="flex items-center justify-between">
            {@render heading("Frames")}
            <IconButton label="Remove all" size="sm" onclick={remove_all}><TrashIcon weight="bold" /></IconButton>
          </div>
          <ol class="flex flex-col gap-0.5">
            {#each frames as frame, index (frame)}
              <li
                class={["flex h-8 items-center gap-2 rounded-md pl-2 hover:bg-foreground/6 pointer-coarse:h-10", selected === index && "bg-foreground/6"]}
                onpointerenter={() => (hovered = index)}
                onpointerleave={() => (hovered = null)}
              >
                <span class="min-w-0 flex-1 truncate text-ui" title={frame.image.path ?? frame.image.name}>{names[index]}</span>
                <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{crops[index].w}×{crops[index].h}</span>
                <IconButton label="Remove {names[index]}" size="sm" onclick={() => remove(index)}><XIcon weight="bold" /></IconButton>
              </li>
            {/each}
          </ol>
        </div>
      </aside>

      <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 @xl:gap-3 @xl:p-4">
        {#if sheet && preview}
          <div class="flex items-center justify-center gap-1">
            <IconButton label="Zoom out" size="sm" variant="quiet" disabled={camera.scale <= 1} onclick={() => zoom_by(1 / ZOOM_STEP)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
            <button
              type="button"
              class="h-7 min-w-11 rounded-md font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/6 pointer-coarse:h-9"
              title="Fit"
              onclick={() => (camera = FIT)}>{Math.round(camera.scale * 100)}%</button
            >
            <IconButton label="Zoom in" size="sm" variant="quiet" disabled={camera.scale >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
          </div>
          <div
            class="grid min-h-0 touch-none place-items-center overflow-hidden select-none [container-type:size]"
            role="application"
            aria-label="Sheet preview. Pinch or Ctrl+scroll to zoom, scroll or drag to pan, tap a frame for its name."
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onpointerup={on_pointerend}
            onpointercancel={on_pointerend}
            onpointerleave={(event) => event.pointerType === "mouse" && (hovered = null)}
            {@attach wheel}
          >
            <div bind:this={fit} class="relative" style:aspect-ratio="{sheet.w} / {sheet.h}" style:width="min(100cqw, calc(100cqh * {sheet.w / sheet.h}))">
              <div
                class="checker absolute inset-0 origin-top-left rounded-xs ring-1 ring-foreground/10"
                style:transform="translate({camera.offset_x}px, {camera.offset_y}px) scale({camera.scale})"
                style:--zoom={camera.scale}
              >
                <canvas {@attach paint(preview)} class={["block size-full", camera.scale > 2 && "[image-rendering:pixelated]"]}></canvas>
                {#each sheet.positions as at, index (index)}
                  <div
                    class={["outline-frame pointer-events-none absolute", label === index && "active"]}
                    style:left={percent(at.x, sheet.w)}
                    style:top={percent(at.y, sheet.h)}
                    style:width={percent(crops[index].w, sheet.w)}
                    style:height={percent(crops[index].h, sheet.h)}
                  ></div>
                {/each}
                {#if label !== null && sheet.positions[label]}
                  <span
                    class="tag pointer-events-none absolute max-w-60 truncate rounded-sm bg-background-light px-1.5 py-0.5 text-2xs font-medium shadow-raised"
                    style:left={percent(sheet.positions[label].x, sheet.w)}
                    style:top={percent(sheet.positions[label].y, sheet.h)}>{names[label]}</span
                  >
                {/if}
              </div>
            </div>
          </div>
        {:else if packed && !packed.ok}
          <div class="row-span-2 grid place-items-center">
            <EmptyState icon={SquaresFourIcon} title="Doesn't fit" description={packed.reason} />
          </div>
        {/if}
      </div>
    </div>

    <StatusBar>
      {#if sheet && packed?.ok}
        <span>{sheet.w} × {sheet.h} px</span>
        <span>{Math.round(packed.fill * 100)}% filled</span>
        {#if label !== null}<span class="min-w-0 truncate">{names[label]}</span>{/if}
        <span class="ml-auto hidden truncate pointer-coarse:inline">Pinch to zoom</span>
      {:else if packed && !packed.ok}
        <span class="truncate text-warning">{packed.reason}</span>
      {/if}
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop images or a folder to add</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  /* Inside the zoomed layer: divided by the zoom so outlines and the name tag keep their screen size. */
  .outline-frame {
    outline: calc(1px / var(--zoom)) dashed color-mix(in oklch, var(--primary) 70%, transparent);
  }

  .outline-frame.active {
    outline: calc(2px / var(--zoom)) solid var(--primary);
  }

  .tag {
    transform-origin: 0 0;
    scale: calc(1 / var(--zoom));
  }
</style>
