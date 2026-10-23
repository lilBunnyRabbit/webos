<script lang="ts">
  import kernel, { type DialogsService, type SettingsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Select, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes, resolve_token } from "$lib/core/utils";
  import {
    EyeSlash as EyeSlashIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { has_files, image_files, load_image, load_image_at, paint, save_image, type SourceImage } from "$kit/utils/image";
  import { kept_format, redacted_name } from "./naming";
  import { RestoreMode, drag_rect, draw_ops, type Rect, type RestoreOp } from "./patch";
  import { Effect, MIN_BLOCK, MIN_BLUR, area_at, area_bounds, redact, type RedactArea } from "./redact";
  import type { SectionProps } from "./sections";
  import { pinch_view, zoom_view, type Point, type View as Camera } from "$kit/utils/view";

  const Tool = { SELECT: "select", BOX: "box", BRUSH: "brush", ERASE: "erase" } as const;
  type Tool = (typeof Tool)[keyof typeof Tool];

  const Panel = { EFFECT: "effect", AREAS: "areas" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const PANELS = [
    { value: Panel.EFFECT, label: "Effect" },
    { value: Panel.AREAS, label: "Areas" },
  ];
  const EFFECTS = [
    { value: Effect.BOX, label: "Box" },
    { value: Effect.PIXELATE, label: "Pixelate" },
    { value: Effect.BLUR, label: "Blur" },
  ];
  const TOOLS = [
    { value: Tool.SELECT, label: "Select" },
    { value: Tool.BOX, label: "Box" },
    { value: Tool.BRUSH, label: "Brush" },
    { value: Tool.ERASE, label: "Erase" },
  ];
  const PREVIEW_SIDE = 1600;
  const MAX_ZOOM = 32;
  const ZOOM_STEP = 1.5;
  const FIT: Camera = { scale: 1, offset_x: 0, offset_y: 0 };
  const TAP_SLOP = 6;
  /** Screen pixels around an area that still count as tapping it: a fingertip hides what it's on. */
  const TAP_REACH = { mouse: 4, touch: 16 };

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window_id, window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));

  let root = $state<HTMLElement>();
  let source = $state.raw<SourceImage | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);

  let new_effect = $state<Effect>(Effect.BOX);
  let block = $state(16);
  let radius = $state(32);
  let brush = $state(32);
  let tool = $state<Tool>(Tool.BOX);
  let areas = $state.raw<RedactArea[]>([]);
  let draft = $state.raw<RestoreOp | null>(null);
  let selected = $state<number | null>(null);
  let hovered = $state<number | null>(null);
  let cursor = $state.raw<{ x: number; y: number } | null>(null);
  let primary = $state<string | null>(null);
  let overlay = $state<HTMLElement>();
  let fit = $state<HTMLElement>();
  let camera = $state.raw<Camera>(FIT);
  let panel = $state<Panel>(Panel.EFFECT);

  const listed = $derived(
    areas.flatMap((area, index) => {
      const bounds = area.op.mode === RestoreMode.ADD ? area_bounds(area) : null;
      return bounds ? [{ index, area, bounds }] : [];
    })
  );
  const preview_scale = $derived(source ? Math.min(1, PREVIEW_SIDE / Math.max(source.bitmap.width, source.bitmap.height)) : 1);
  const preview = $derived(source ? redact({ source: source.bitmap, areas, block, radius, scale: preview_scale }) : null);

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (primary = resolve_token(probe, "var(--primary)")));
    return () => cancelAnimationFrame(frame);
  });

  let request = 0;

  async function load(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      if (id !== request) return result.bitmap.close();
      const previous = source;
      source = result;
      previous?.bitmap.close();
      areas = [];
      draft = null;
      selected = null;
      camera = FIT;
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  onDestroy(() => source?.bitmap.close());

  const initial = untrack(() => initial_paths[0]);
  if (initial) load(() => load_image_at(initial));

  const start_path = $derived(source?.path ? parent_path(source.path) : undefined);

  async function pick() {
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title: "Redact an image" });
    if (chosen) load(() => load_image_at(chosen));
  }

  function take(files: File[]) {
    const [file] = files;
    if (file) load(() => load_image(file));
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

  function set_effect(index: number, next: Effect) {
    areas = areas.map((area, i) => (i === index ? { ...area, effect: next } : area));
  }

  function remove(index: number) {
    areas = areas.filter((_, i) => i !== index);
    selected = null;
    hovered = null;
  }

  function clear() {
    areas = [];
    selected = null;
    hovered = null;
  }

  function image_point(event: PointerEvent): { x: number; y: number; ratio: number } | null {
    if (!overlay || !source) return null;
    const box = overlay.getBoundingClientRect();
    const ratio = source.bitmap.width / box.width;
    return { x: (event.clientX - box.left) * ratio, y: (event.clientY - box.top) * ratio, ratio };
  }

  function screen_point(event: { clientX: number; clientY: number }): Point {
    const box = fit?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : { x: 0, y: 0 };
  }

  /** Zoomed in, the image always covers the fitted box: no panning it away into the void. */
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

  function focus(rect: Rect) {
    if (!fit || !source) return;
    const { width, height } = fit.getBoundingClientRect();
    const base = width / source.bitmap.width;
    const scale = Math.min(MAX_ZOOM, Math.max(1, 0.8 * Math.min(width / (rect.width * base), height / (rect.height * base))));
    const center = { x: (rect.x + rect.width / 2) * base, y: (rect.y + rect.height / 2) * base };
    camera = clamp_camera({ scale, offset_x: width / 2 - center.x * scale, offset_y: height / 2 - center.y * scale });
  }

  const pointers = new Map<number, Point>();
  let pinch: { camera: Camera; mid: Point; distance: number } | null = null;
  let pan: { start: Point; camera: Camera; moved: boolean; tap: boolean } | null = null;
  /** The touch already pinched: its remaining fingers neither draw nor tap until all lift. */
  let spent = false;
  let drag_start: { x: number; y: number } | null = null;

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function select_at(event: PointerEvent) {
    const point = image_point(event);
    if (!point) return;
    const reach = (event.pointerType === "mouse" ? TAP_REACH.mouse : TAP_REACH.touch) * point.ratio;
    selected = area_at(areas, point.x, point.y, reach);
    if (selected !== null) panel = Panel.AREAS;
  }

  function on_pointerdown(event: PointerEvent) {
    if (!source || (event.button !== 0 && event.button !== 1)) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pointers.size === 2 && event.pointerType !== "mouse") {
      draft = null;
      drag_start = null;
      pan = null;
      spent = true;
      pinch = { camera, ...spread() };
      return;
    }
    if (pointers.size > 1 || spent) return;
    if (tool === Tool.SELECT || event.button === 1) {
      pan = { start: screen, camera, moved: false, tap: event.button === 0 };
      return;
    }
    const point = image_point(event);
    if (!point) return;
    drag_start = { x: point.x, y: point.y };
    draft =
      tool === Tool.BOX
        ? { kind: "rect", mode: RestoreMode.ADD, rect: { x: point.x, y: point.y, width: 0, height: 0 } }
        : { kind: "brush", mode: tool === Tool.ERASE ? RestoreMode.ERASE : RestoreMode.ADD, size: brush * point.ratio, points: [point.x, point.y] };
  }

  function on_pointermove(event: PointerEvent) {
    const screen = screen_point(event);
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, screen);
    const point = image_point(event);
    if (!point || !source) return;
    cursor = { x: (point.x / source.bitmap.width) * 100, y: (point.y / source.bitmap.height) * 100 };
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
    if (!draft || !drag_start) return;
    if (draft.kind === "rect") {
      draft = { ...draft, rect: drag_rect(drag_start.x, drag_start.y, point.x, point.y, source.bitmap.width, source.bitmap.height) };
    } else {
      draft.points.push(point.x, point.y);
      draft = { ...draft };
    }
  }

  function on_pointerend(event: PointerEvent) {
    const cancelled = event.type === "pointercancel";
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
    } else if (pan) {
      if (!pan.moved && pan.tap && !cancelled) select_at(event);
      pan = null;
    } else if (draft) {
      const done = draft;
      draft = null;
      drag_start = null;
      if (!cancelled && !(done.kind === "rect" && (done.rect.width < 2 || done.rect.height < 2))) {
        areas = [...areas, { effect: new_effect, op: done }];
        if (done.mode === RestoreMode.ADD) selected = areas.length - 1;
      }
    }
    if (!pointers.size) spent = false;
  }

  // Wheel listeners must be non-passive to stop the page from scrolling.
  function wheel(element: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!source) return;
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

  function draw_draft(canvas: HTMLCanvasElement) {
    if (!source) return;
    canvas.width = Math.max(1, Math.round(source.bitmap.width * preview_scale));
    canvas.height = Math.max(1, Math.round(source.bitmap.height * preview_scale));
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!primary || !draft) return;
    context.fillStyle = primary;
    draw_ops(context, [draft], preview_scale);
  }

  function save() {
    if (!source || !listed.length) return;
    const { format, extension } = kept_format(source.name, false);
    save_image({
      app_id,
      window: win,
      canvas: redact({ source: source.bitmap, areas, block, radius }),
      name: redacted_name(source.name, extension),
      format,
      start_path: start_path ?? null,
    });
  }

  function percent(value: number, total: number): string {
    return `${(value / total) * 100}%`;
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Redact"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{source?.name ?? ""}</span>
    {#if source && !loading && !error}
      <Button variant="primary" size="sm" disabled={!listed.length} onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !source || !preview}
    <EmptyState
      icon={EyeSlashIcon}
      title="No image open"
      description="Covers names, faces or numbers with a box, pixels or a heavy blur, and saves a fresh copy without the original's metadata. Open an image, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open an image…</Button>{/snippet}
    </EmptyState>
  {:else}
    {@const width = source.bitmap.width}
    {@const height = source.bitmap.height}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-hairline bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        <Segmented label="Settings" options={PANELS} bind:value={panel} class="sticky top-0 z-10 w-full shrink-0 *:flex-1 @2xl:hidden" />

        <div class={["flex flex-col gap-2", panel !== Panel.EFFECT && "hidden @2xl:flex"]}>
          {@render heading("New areas")}
          <Segmented label="Effect for new areas" options={EFFECTS} bind:value={new_effect} class="w-full *:flex-1" />
          <label class="flex items-center gap-2 text-ui" title="Pixel blocks this small or smaller can be read back, so it stops at {MIN_BLOCK}">
            <span class="w-20 shrink-0">Blocks</span>
            <Slider size="sm" min={MIN_BLOCK} max={64} bind:value={block} class="min-w-0 flex-1" aria-label="Pixel block size" />
            <span class="w-10 text-right font-mono text-2xs text-foreground/80 tabular-nums">{block}px</span>
          </label>
          <label class="flex items-center gap-2 text-ui" title="A lighter blur can be read through, so it stops at {MIN_BLUR}">
            <span class="w-20 shrink-0">Blur</span>
            <Slider size="sm" min={MIN_BLUR} max={80} bind:value={radius} class="min-w-0 flex-1" aria-label="Blur radius" />
            <span class="w-10 text-right font-mono text-2xs text-foreground/80 tabular-nums">{radius}px</span>
          </label>
          <label class="flex items-center gap-2 text-ui">
            <span class="w-20 shrink-0">Brush</span>
            <Slider size="sm" min={4} max={160} bind:value={brush} class="min-w-0 flex-1" aria-label="Brush size" />
            <span class="w-10 text-right font-mono text-2xs text-foreground/80 tabular-nums">{brush}</span>
          </label>
        </div>

        <div class={["flex flex-col gap-2", panel !== Panel.AREAS && "hidden @2xl:flex"]}>
          <div class="flex items-center justify-between">
            {@render heading("Areas")}
            <IconButton label="Clear all areas" size="sm" disabled={!areas.length} onclick={clear}><TrashIcon weight="bold" /></IconButton>
          </div>
          {#if !listed.length}
            <p class="px-0.5 text-2xs text-foreground/65">Drag a box or paint over what to hide.</p>
          {:else}
            <ul class="flex flex-col gap-0.5">
              {#each listed as { index, area, bounds }, number (index)}
                <li
                  class={["flex items-center gap-1 rounded-md pl-2 hover:bg-foreground/6", selected === index && "bg-foreground/6"]}
                  onpointerenter={() => (hovered = index)}
                  onpointerleave={() => (hovered = null)}
                >
                  <span class="w-5 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{number + 1}</span>
                  <Select
                    size="sm"
                    class="w-auto"
                    aria-label="Effect of area {number + 1}"
                    options={EFFECTS}
                    bind:value={() => area.effect, (next) => set_effect(index, next)}
                  />
                  <span class="min-w-0 flex-1 truncate font-mono text-2xs tabular-nums">{Math.round(bounds.width)}×{Math.round(bounds.height)}</span>
                  <IconButton label="Zoom to area {number + 1}" size="sm" variant="quiet" onclick={() => focus(bounds)}><MagnifyingGlassIcon weight="bold" /></IconButton>
                  <IconButton label="Remove area {number + 1}" size="sm" variant="quiet" onclick={() => remove(index)}><TrashIcon weight="bold" /></IconButton>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </aside>

      <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 @xl:gap-3 @xl:p-4">
        <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <Segmented size="sm" label="Tool" options={TOOLS} bind:value={tool} />
          <div class="flex items-center gap-1">
            <IconButton label="Zoom out" size="sm" variant="quiet" disabled={camera.scale <= 1} onclick={() => zoom_by(1 / ZOOM_STEP)}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
            <button
              type="button"
              class="h-7 min-w-11 rounded-md font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/6 pointer-coarse:h-9"
              title="Fit"
              onclick={() => (camera = FIT)}>{Math.round(camera.scale * 100)}%</button
            >
            <IconButton label="Zoom in" size="sm" variant="quiet" disabled={camera.scale >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
          </div>
        </div>
        <div
          class={[
            "grid min-h-0 touch-none place-items-center overflow-hidden select-none [container-type:size]",
            tool === Tool.SELECT ? "cursor-pointer" : tool === Tool.BOX ? "cursor-crosshair" : "cursor-none",
          ]}
          role="application"
          aria-label="Image. Pinch or Ctrl+scroll to zoom, scroll or drag with Select to pan."
          onpointerdown={on_pointerdown}
          onpointermove={on_pointermove}
          onpointerup={on_pointerend}
          onpointercancel={on_pointerend}
          onpointerleave={() => (cursor = null)}
          {@attach wheel}
        >
          <div bind:this={fit} class="relative" style:aspect-ratio="{width} / {height}" style:width="min(100cqw, calc(100cqh * {width / height}))">
            <div
              bind:this={overlay}
              class="checker absolute inset-0 origin-top-left rounded-xs ring-1 ring-hairline"
              style:transform="translate({camera.offset_x}px, {camera.offset_y}px) scale({camera.scale})"
              style:--zoom={camera.scale}
            >
              <canvas {@attach paint(preview)} class={["block size-full", camera.scale > 2 && "[image-rendering:pixelated]"]}></canvas>
              <canvas {@attach draw_draft} class="pointer-events-none absolute inset-0 size-full opacity-45"></canvas>
              {#each listed as { index, bounds } (index)}
                <div
                  class={["area pointer-events-none absolute", selected === index && "selected", hovered === index && "hovered"]}
                  style:left={percent(bounds.x, width)}
                  style:top={percent(bounds.y, height)}
                  style:width={percent(bounds.width, width)}
                  style:height={percent(bounds.height, height)}
                ></div>
              {/each}
              {#if cursor && (tool === Tool.BRUSH || tool === Tool.ERASE)}
                <div
                  class="brush pointer-events-none absolute rounded-full"
                  style:left="{cursor.x}%"
                  style:top="{cursor.y}%"
                  style:width="{brush / camera.scale}px"
                  style:height="{brush / camera.scale}px"
                ></div>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>

    <StatusBar>
      <span>{width} × {height} px</span>
      <span>{format_bytes(source.size)}</span>
      <span>{listed.length} {listed.length === 1 ? "area" : "areas"}</span>
      <span class="ml-auto hidden truncate @xl:inline">Saved as a fresh copy, without metadata</span>
      <span class="ml-auto hidden truncate pointer-coarse:inline @xl:ml-0">Pinch to zoom</span>
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

  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  /* Inside the zoomed layer: divided by the zoom so outlines stay hairlines at any scale. */
  .area {
    outline: calc(1.5px / var(--zoom)) dashed var(--primary);
    outline-offset: calc(1px / var(--zoom));
  }

  .area.selected {
    outline-style: solid;
  }

  .area.hovered {
    outline: calc(2.5px / var(--zoom)) solid var(--foreground);
  }

  .brush {
    translate: -50% -50%;
    box-shadow:
      0 0 0 calc(1px / var(--zoom)) var(--foreground),
      0 0 0 calc(2px / var(--zoom)) var(--background);
  }
</style>
