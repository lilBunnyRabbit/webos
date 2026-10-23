<script lang="ts">
  import kernel, {
    Platform,
    ShortcutCategory,
    type NotificationsService,
    type SettingsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, IconButton, Input, Segmented, Separator, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { load_image_at, type SourceImage, write_image } from "$kit/utils/image";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    ArrowsLeftRight as ArrowsLeftRightIcon,
    CornersOut as CornersOutIcon,
    Circle as CircleIcon,
    Eraser as EraserIcon,
    Eyedropper as EyedropperIcon,
    EyedropperSample as EyedropperSampleIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    Hand as HandIcon,
    LineSegment as LineSegmentIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    PaintBrush as PaintBrushIcon,
    PaintBucket as PaintBucketIcon,
    PencilSimple as PencilSimpleIcon,
    Resize as ResizeIcon,
    Square as SquareIcon,
    TextT as TextTIcon,
    Toolbox as ToolboxIcon,
  } from "phosphor-svelte";
  import { onMount, untrack } from "svelte";
  import { z } from "zod";
  import { draw_shape, shape_bounds, stamp_pencil, stroke_brush } from "./draw";
  import { flood_fill } from "./flood-fill";
  import { changed_bounds, clip_rect, copy_region, empty_patch, paste_region, patch_bytes, segment_bounds, union, type Patch } from "./patch";
  import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$kit/utils/history";
  import { css_to_hex } from "./paint-file";
  import { clamp_side, fit_zoom, parse_hex, push_recent, step_zoom, to_canvas_point, to_hex, type Point, type Rect } from "./shapes";
  import {
    Background,
    FILL_MODES,
    FillMode,
    TOOL_KEYS,
    TOOL_LABELS,
    TOOLS,
    Tool,
    is_freehand,
    is_shape,
    text_font_size,
    uses_size,
  } from "./tools";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { report_error } from "$kit/utils/report-error";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const settings = $derived(kernel.service<SettingsService>("settings"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const HEX = z.string().regex(/^#[0-9a-f]{6}$/i);
  const tool = storage.persisted<Tool>("tool", Tool.BRUSH, z.enum(TOOLS));
  const size = storage.persisted("size", 4, z.number().int().min(1).max(100));
  const tolerance = storage.persisted("tolerance", 10, z.number().min(0).max(100));
  const fill_mode = storage.persisted<FillMode>("fill_mode", FillMode.OUTLINE, z.enum(FILL_MODES));
  const primary = storage.persisted("primary", "#000000", HEX);
  const secondary = storage.persisted("secondary", "#ffffff", HEX);
  const recent = storage.persisted<string[]>("recent", [], z.array(HEX).max(8));
  const panel_open = storage.window("panel_open", true, z.boolean());

  const DEFAULT_WIDTH = 800;
  const DEFAULT_HEIGHT = 600;
  const HISTORY_LIMITS = { max_entries: 50, max_bytes: 256 * 1024 * 1024, size_of: patch_bytes };

  const TOOL_ICONS: Record<Tool, IconComponent> = {
    pencil: PencilSimpleIcon,
    brush: PaintBrushIcon,
    eraser: EraserIcon,
    line: LineSegmentIcon,
    rectangle: SquareIcon,
    ellipse: CircleIcon,
    fill: PaintBucketIcon,
    picker: EyedropperIcon,
    text: TextTIcon,
    hand: HandIcon,
  };

  // Drawing colours are user content, not chrome: black and white plus the current theme's tokens as a starting palette.
  const SWATCH_TOKENS = ["foreground", "background", "primary", "secondary", "tertiary", "accent", "success", "warning", "error", "info"] as const;
  let swatch_group = $state<HTMLElement>();
  let theme_colors = $state.raw<string[]>([]);
  const swatches = $derived([...new Set(["#000000", "#ffffff", ...theme_colors])]);

  // Derived tokens are var() expressions a canvas can't parse; resolved a frame later, once the new theme is written.
  $effect(() => {
    Object.values(settings.theme);
    const probe = swatch_group;
    if (!probe) return;
    const frame = requestAnimationFrame(() => {
      theme_colors = SWATCH_TOKENS.map((token) => {
        probe.style.color = `var(--${token})`;
        return css_to_hex(getComputedStyle(probe).color);
      });
      probe.style.color = "";
    });
    return () => cancelAnimationFrame(frame);
  });

  interface EyeDropperInstance {
    open(): Promise<{ sRGBHex: string }>;
  }
  const EyeDropperApi = (globalThis as { EyeDropper?: new () => EyeDropperInstance }).EyeDropper;

  let doc_canvas = $state<HTMLCanvasElement>();
  let overlay_canvas = $state<HTMLCanvasElement>();
  let stage = $state<HTMLElement>();
  let size_popover = $state<HTMLElement>();

  let width = $state(DEFAULT_WIDTH);
  let height = $state(DEFAULT_HEIGHT);
  let zoom = $state(1);
  let file_path = $state<string | null>(null);
  /** The name Save as suggests while there's no path: a new canvas, or an image opened from the device. */
  let untitled_name = $state("Untitled.png");
  let history = $state.raw<History<Patch> | null>(null);
  let saved = $state.raw<Patch | null>(null);
  // The canvas as of the last commit: a stroke's undo keeps only the pixels it changed, read from here.
  let committed: ImageData | null = null;
  let loading = $state(false);
  let cursor = $state<Point | null>(null);

  let new_width = $state<number | null>(DEFAULT_WIDTH);
  let new_height = $state<number | null>(DEFAULT_HEIGHT);
  let new_background = $state<Background>(Background.WHITE);

  const dirty = $derived(history !== null && current(history) !== saved);
  const file_name = $derived(file_path ? base_name(file_path) : untitled_name);
  const undoable = $derived(history !== null && can_undo(history));
  const redoable = $derived(history !== null && can_redo(history));

  interface Stroke {
    pointer_id: number;
    tool: Tool;
    color: string;
    other: string;
    start: Point;
    last: Point;
    constrain: boolean;
    bounds: Rect | null;
  }
  let stroke: Stroke | null = null;
  let pan: { pointer_id: number; x: number; y: number } | null = null;

  function context(): CanvasRenderingContext2D {
    return doc_canvas!.getContext("2d", { willReadFrequently: true })!;
  }

  function overlay_context(): CanvasRenderingContext2D {
    return overlay_canvas!.getContext("2d")!;
  }

  // Canvas size is set here, never through template attributes: assigning width clears the bitmap, even to the same value.
  function set_size(next_width: number, next_height: number) {
    for (const canvas of [doc_canvas!, overlay_canvas!]) {
      canvas.width = next_width;
      canvas.height = next_height;
    }
    width = next_width;
    height = next_height;
  }

  function snapshot(): ImageData {
    return context().getImageData(0, 0, width, height);
  }

  function clone(image: ImageData): ImageData {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  }

  function restore(patch: Patch, image: ImageData | null) {
    if (!image) return;
    if (patch.resize) {
      set_size(image.width, image.height);
      context().putImageData(image, 0, 0);
      committed = clone(image);
      return;
    }
    context().putImageData(image, patch.x, patch.y);
    if (committed) paste_region(committed, image, patch.x, patch.y);
  }

  function reset_history() {
    committed = snapshot();
    const first = empty_patch();
    history = create_history(first);
    saved = first;
  }

  function commit(area: Rect | null) {
    if (!history || !committed) return;
    const rect = area && clip_rect(area, width, height);
    if (!rect) return void (history = push(history, empty_patch(), HISTORY_LIMITS));
    const before = new ImageData(copy_region(committed, rect), rect.width, rect.height);
    const after = context().getImageData(rect.x, rect.y, rect.width, rect.height);
    paste_region(committed, after, rect.x, rect.y);
    history = push(history, { x: rect.x, y: rect.y, before, after, resize: false }, HISTORY_LIMITS);
  }

  function do_undo() {
    if (stroke || !history || !can_undo(history)) return;
    const patch = current(history);
    history = undo(history);
    restore(patch, patch.before);
  }

  function do_redo() {
    if (stroke || !history || !can_redo(history)) return;
    history = redo(history);
    const patch = current(history);
    restore(patch, patch.after);
  }

  function remember(color: string) {
    recent.value = push_recent(recent.value, color);
  }

  function blank(next_width: number, next_height: number, background: Background) {
    set_size(next_width, next_height);
    const ctx = context();
    ctx.clearRect(0, 0, next_width, next_height);
    if (background === Background.WHITE) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, next_width, next_height);
    }
  }

  function fit() {
    if (!stage) return;
    zoom = fit_zoom(width, height, stage.clientWidth - 32, stage.clientHeight - 32);
  }

  async function discard_ok(): Promise<boolean> {
    return !dirty || confirm_discard(win, file_name);
  }

  async function new_canvas() {
    if (!(await discard_ok())) return;
    blank(clamp_side(new_width ?? DEFAULT_WIDTH), clamp_side(new_height ?? DEFAULT_HEIGHT), new_background);
    file_path = null;
    untitled_name = "Untitled.png";
    reset_history();
    size_popover?.hidePopover();
    fit();
  }

  function resize_canvas() {
    const next_width = clamp_side(new_width ?? width);
    const next_height = clamp_side(new_height ?? height);
    if (next_width === width && next_height === height) return size_popover?.hidePopover();
    const before = committed ?? snapshot();
    blank(next_width, next_height, new_background);
    context().drawImage(image_canvas(before), 0, 0);
    const after = snapshot();
    committed = clone(after);
    if (history) history = push(history, { x: 0, y: 0, before, after, resize: true }, HISTORY_LIMITS);
    size_popover?.hidePopover();
  }

  // putImageData ignores compositing and would punch transparent holes; drawImage keeps the new background under it.
  function image_canvas(image: ImageData): OffscreenCanvas {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext("2d")!.putImageData(image, 0, 0);
    return canvas;
  }

  let open_request = 0;

  async function open_image(task: () => Promise<SourceImage>) {
    const id = ++open_request;
    loading = true;
    try {
      const image = await task();
      if (id !== open_request) return image.bitmap.close();
      set_size(image.bitmap.width, image.bitmap.height);
      const ctx = context();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image.bitmap, 0, 0);
      image.bitmap.close();
      file_path = image.path;
      untitled_name = image.name;
      reset_history();
      fit();
    } catch (reason) {
      if (id !== open_request) return;
      report_error(app_id, "Couldn't open the image", reason);
    } finally {
      if (id === open_request) loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: ["image/*"],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Paint",
    });
    if (chosen) await open_image(() => load_image_at(chosen));
  }

  async function write(path: string): Promise<boolean> {
    if (!history) return false;
    const state = current(history);
    try {
      await write_image(path, doc_canvas!);
      file_path = path;
      saved = state;
      notifications.notify(app_id, { title: "Image saved", message: path });
      return true;
    } catch (reason) {
      report_error(app_id, "Couldn't save the image", reason);
      return false;
    }
  }

  async function save_as(): Promise<boolean> {
    const path = await win.pick_save({
      name: file_name,
      accept: ["image/*"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
    });
    return path ? write(path) : false;
  }

  /** An OS file (/etc, /var, /tmp) is never written back; Save asks where to keep a copy. */
  const read_only = $derived(file_path !== null && is_system_path(file_path));

  function save(): Promise<boolean> {
    return file_path && !read_only ? write(file_path) : save_as();
  }

  // The OS owns the unsaved-changes flow (ADR-029): titlebar title and dot, the close sheet, the tab-close warning.
  $effect(() => win.set_title(file_name));
  $effect(() => win.set_dirty(dirty, { save }));

  function canvas_point(event: PointerEvent): Point {
    const box = overlay_canvas!.getBoundingClientRect();
    return to_canvas_point({ x: event.clientX, y: event.clientY }, box, width, height);
  }

  function floor(point: Point): Point {
    return { x: Math.floor(point.x), y: Math.floor(point.y) };
  }

  function brush_width(event: PointerEvent): number {
    return event.pointerType === "pen" && event.pressure > 0 ? Math.max(1, size.value * event.pressure * 2) : size.value;
  }

  function freehand(from: Point, to: Point, event: PointerEvent, active: Stroke) {
    const ctx = context();
    if (active.tool === Tool.PENCIL) {
      stamp_pencil(ctx, floor(from), floor(to), size.value, active.color);
      active.bounds = union(active.bounds, segment_bounds(floor(from), floor(to), size.value + 1));
    } else {
      const line_width = brush_width(event);
      stroke_brush(ctx, from, to, line_width, active.color, active.tool === Tool.ERASER);
      active.bounds = union(active.bounds, segment_bounds(from, to, line_width / 2 + 2));
    }
  }

  function preview(active: Stroke) {
    const ctx = overlay_context();
    ctx.clearRect(0, 0, width, height);
    draw_shape(ctx, active.tool, active.start, active.last, active.constrain, {
      size: size.value,
      stroke: active.color,
      fill: active.other,
      mode: fill_mode.value,
    });
  }

  function pick_color(point: Point, target: { value: string }) {
    const { x, y } = floor(point);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const [r, g, b] = context().getImageData(x, y, 1, 1).data;
    target.value = to_hex(r, g, b);
  }

  function fill_at(point: Point, color: string) {
    const { x, y } = floor(point);
    const image = snapshot();
    if (!flood_fill(image, x, y, parse_hex(color), tolerance.value)) return;
    const changed = committed && changed_bounds(committed, image);
    if (changed) context().putImageData(image, 0, 0, changed.x, changed.y, changed.width, changed.height);
    commit(changed);
    remember(color);
  }

  async function place_text(point: Point, color: string) {
    const text = await win.prompt("Add text", { placeholder: "Text", confirm_label: "Place" });
    if (!text) return;
    const ctx = context();
    ctx.save();
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.font = `${text_font_size(size.value)}px sans-serif`;
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    ctx.fillText(text, x, y);
    const metrics = ctx.measureText(text);
    ctx.restore();
    commit({
      x: x - metrics.actualBoundingBoxLeft - 2,
      y: y - metrics.actualBoundingBoxAscent - 2,
      width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + 4,
      height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 4,
    });
    remember(color);
  }

  function on_pointerdown(event: PointerEvent) {
    const active_tool = tool.value;
    if (stroke || pan || loading) return;
    if (active_tool === Tool.HAND) {
      if (event.pointerType === "touch") return;
      overlay_canvas!.setPointerCapture(event.pointerId);
      pan = { pointer_id: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();

    const use_secondary = event.button === 2;
    const color = use_secondary ? secondary.value : primary.value;
    const other = use_secondary ? primary.value : secondary.value;
    const point = canvas_point(event);

    if (active_tool === Tool.FILL) return fill_at(point, color);
    if (active_tool === Tool.PICKER) return pick_color(point, use_secondary ? secondary : primary);
    if (active_tool === Tool.TEXT) return void place_text(point, color);

    overlay_canvas!.setPointerCapture(event.pointerId);
    stroke = { pointer_id: event.pointerId, tool: active_tool, color, other, start: point, last: point, constrain: event.shiftKey, bounds: null };
    if (is_freehand(active_tool)) freehand(point, point, event, stroke);
  }

  function on_pointermove(event: PointerEvent) {
    cursor = floor(canvas_point(event));
    if (pan && event.pointerId === pan.pointer_id) {
      stage?.scrollBy(pan.x - event.clientX, pan.y - event.clientY);
      pan = { ...pan, x: event.clientX, y: event.clientY };
      return;
    }
    const active = stroke;
    if (!active || event.pointerId !== active.pointer_id) return;

    if (is_freehand(active.tool)) {
      const events = event.getCoalescedEvents?.() ?? [];
      for (const sample of events.length ? events : [event]) {
        const point = canvas_point(sample);
        freehand(active.last, point, sample, active);
        active.last = point;
      }
      return;
    }

    active.last = canvas_point(event);
    active.constrain = event.shiftKey;
    preview(active);
  }

  function end_stroke(event: PointerEvent) {
    if (pan?.pointer_id === event.pointerId) pan = null;
    const active = stroke;
    if (!active || event.pointerId !== active.pointer_id) return;
    stroke = null;
    if (is_shape(active.tool)) {
      overlay_context().clearRect(0, 0, width, height);
      draw_shape(context(), active.tool, active.start, active.last, active.constrain, {
        size: size.value,
        stroke: active.color,
        fill: active.other,
        mode: fill_mode.value,
      });
      active.bounds = shape_bounds(active.tool, active.start, active.last, active.constrain, size.value);
    }
    commit(active.bounds);
    if (active.tool !== Tool.ERASER) remember(active.color);
  }

  function zoom_on_wheel(node: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom = step_zoom(zoom, event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener("wheel", on_wheel, { passive: false });
    return () => node.removeEventListener("wheel", on_wheel);
  }

  function swap_colors() {
    [primary.value, secondary.value] = [secondary.value, primary.value];
  }

  async function pick_from_screen() {
    if (!EyeDropperApi) return;
    try {
      const result = await new EyeDropperApi().open();
      primary.value = css_to_hex(result.sRGBHex);
    } catch {
      // Esc cancels the eyedropper with an AbortError; nothing to report.
    }
  }

  function sync_size_form() {
    new_width = width;
    new_height = height;
  }

  onMount(() => {
    const path = untrack(() => initial_path);
    blank(DEFAULT_WIDTH, DEFAULT_HEIGHT, Background.WHITE);
    reset_history();
    fit();
    if (path) open_image(() => load_image_at(path));
  });

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `paint.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", do_undo),
      scoped("redo", "mod+shift+z", "Redo", do_redo),
      scoped("redo-alt", "mod+y", "Redo", do_redo),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", save),
      scoped("save-as", "mod+shift+s", "Save as…", save_as),
      scoped("swap", "x", "Swap colours", swap_colors),
      ...TOOLS.map((item) => scoped(`tool.${item}`, TOOL_KEYS[item], TOOL_LABELS[item], () => (tool.value = item))),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });
</script>

{#snippet zoom_controls()}
  <IconButton label="Zoom out" size="sm" onclick={() => (zoom = step_zoom(zoom, -1))}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
  <span class="w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums">{Math.round(zoom * 100)}%</span>
  <IconButton label="Zoom in" size="sm" onclick={() => (zoom = step_zoom(zoom, 1))}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
  <IconButton label="Fit to window" size="sm" onclick={fit}><CornersOutIcon weight="bold" /></IconButton>
{/snippet}

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    <IconButton
      label={panel_open.value ? "Hide tools" : "Show tools"}
      size="sm"
      class="@md:hidden"
      pressed={panel_open.value}
      onclick={() => (panel_open.value = !panel_open.value)}
    >
      <ToolboxIcon weight="bold" />
    </IconButton>
    <IconButton label="New or resize…" size="sm" popovertarget="paint-size-{window_id}" onclick={sync_size_form} style="anchor-name: --paint-size-{window_id}">
      <FilePlusIcon weight="bold" />
    </IconButton>
    <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Save" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
    <IconButton label="Save as…" size="sm" onclick={save_as}><FloppyDiskBackIcon weight="bold" /></IconButton>
    <Separator vertical />
    <IconButton label="Undo" size="sm" disabled={!undoable} onclick={do_undo}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Redo" size="sm" disabled={!redoable} onclick={do_redo}><ArrowClockwiseIcon weight="bold" /></IconButton>

    <!-- The desktop titlebar shows the file name (window.set_title); the mobile shell has no titlebar. -->
    <span class="flex min-w-16 flex-1 items-center gap-1.5 px-1">
      {#if kernel.platform === Platform.MOBILE}
        <span class="truncate text-ui font-medium" title={file_path ?? "Not saved yet"}>{file_name}</span>
        {#if dirty}<span class="size-2 shrink-0 rounded-full bg-primary" role="img" aria-label="Unsaved changes"></span>{/if}
      {/if}
    </span>

    <div class="hidden items-center gap-1.5 @md:flex">{@render zoom_controls()}</div>
  </Toolbar>

  <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @md:grid-cols-[auto_minmax(0,1fr)] @md:grid-rows-1">
    <aside
      class={[
        "flex-wrap items-center gap-3 overflow-auto border-b border-hairline bg-background-light p-2",
        "@md:flex @md:w-44 @md:flex-col @md:flex-nowrap @md:items-stretch @md:border-r @md:border-b-0",
        panel_open.value ? "flex" : "hidden",
      ]}
      aria-label="Tools"
    >
      <div class="grid grid-cols-5 gap-1 @md:grid-cols-4" role="group" aria-label="Tool">
        {#each TOOLS as item (item)}
          {@const Icon = TOOL_ICONS[item]}
          <IconButton
            label="{TOOL_LABELS[item]} ({TOOL_KEYS[item].toUpperCase()})"
            size="sm"
            pressed={tool.value === item}
            onclick={() => (tool.value = item)}
          >
            <Icon weight={tool.value === item ? "fill" : "bold"} />
          </IconButton>
        {/each}
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <label class="color-well" title="Primary colour (left click)">
          <span class="sr-only">Primary colour</span>
          <input type="color" bind:value={primary.value} onchange={() => remember(primary.value)} />
        </label>
        <label class="color-well" title="Secondary colour (right click)">
          <span class="sr-only">Secondary colour</span>
          <input type="color" bind:value={secondary.value} onchange={() => remember(secondary.value)} />
        </label>
        <IconButton label="Swap colours (X)" size="sm" onclick={swap_colors}><ArrowsLeftRightIcon weight="bold" /></IconButton>
        {#if EyeDropperApi}
          <IconButton label="Pick a colour from the screen" size="sm" onclick={pick_from_screen}><EyedropperSampleIcon weight="bold" /></IconButton>
        {/if}
      </div>

      {#snippet swatch_row(label: string, colors: string[])}
        <div class="flex min-w-0 flex-col gap-1.5">
          <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{label}</span>
          <div class="swatches flex flex-wrap gap-1.5 @md:grid @md:grid-cols-[repeat(auto-fill,var(--swatch))]" role="group" aria-label={label}>
            {#each colors as color (color)}
              <button
                type="button"
                class="swatch"
                style:background-color={color}
                title="{color} · click for primary, right-click for secondary"
                aria-label="Use {color}"
                aria-pressed={color === primary.value.toLowerCase()}
                onclick={() => (primary.value = color)}
                oncontextmenu={(event) => {
                  event.preventDefault();
                  secondary.value = color;
                }}
              ></button>
            {/each}
          </div>
        </div>
      {/snippet}

      <div bind:this={swatch_group} class="contents">
        {@render swatch_row("Colours", swatches)}
      </div>
      {#if recent.value.length > 0}
        {@render swatch_row("Recent", recent.value)}
      {/if}

      {#if uses_size(tool.value)}
        <label class="flex items-center gap-2 text-ui text-foreground/80">
          {tool.value === Tool.TEXT ? "Text" : "Size"}
          <Slider min={1} max={100} bind:value={size.value} size="sm" class="flex-1" />
          <span class="w-8 text-right font-mono text-2xs tabular-nums">{tool.value === Tool.TEXT ? text_font_size(size.value) : size.value}</span>
        </label>
      {/if}

      {#if tool.value === Tool.RECTANGLE || tool.value === Tool.ELLIPSE}
        <Segmented
          label="Shape style"
          options={[
            { value: FillMode.OUTLINE, label: "Outline" },
            { value: FillMode.FILL, label: "Fill" },
            { value: FillMode.BOTH, label: "Both" },
          ]}
          bind:value={fill_mode.value}
        />
      {/if}

      {#if tool.value === Tool.FILL}
        <label class="flex items-center gap-2 text-ui text-foreground/80" title="How different a colour may be and still get filled">
          Tolerance
          <Slider min={0} max={100} bind:value={tolerance.value} size="sm" class="flex-1" />
          <span class="w-8 text-right font-mono text-2xs tabular-nums">{tolerance.value}%</span>
        </label>
      {/if}

      <div class="flex items-center gap-1.5 @md:hidden" role="group" aria-label="Zoom">{@render zoom_controls()}</div>
    </aside>

    <div
      bind:this={stage}
      {@attach zoom_on_wheel}
      class="stage relative grid min-h-0 min-w-0 overflow-auto bg-background-darker p-4"
    >
      <div
        class="checker relative m-auto shrink-0 ring-1 ring-hairline"
        style:width="{width * zoom}px"
        style:height="{height * zoom}px"
      >
        <canvas bind:this={doc_canvas} class={["absolute inset-0 size-full", zoom >= 2 && "[image-rendering:pixelated]"]}></canvas>
        <canvas
          bind:this={overlay_canvas}
          class={["absolute inset-0 size-full", zoom >= 2 && "[image-rendering:pixelated]", tool.value === Tool.HAND ? "cursor-grab touch-auto" : "cursor-crosshair touch-none"]}
          onpointerdown={on_pointerdown}
          onpointermove={on_pointermove}
          onpointerleave={() => (cursor = null)}
          onlostpointercapture={end_stroke}
          oncontextmenu={(event) => event.preventDefault()}
        ></canvas>
      </div>
      {#if loading}
        <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Loading image" /></div>
      {/if}
    </div>
  </div>

  <StatusBar>
    <span>{width} × {height} px</span>
    <span>{cursor ? `${cursor.x}, ${cursor.y}` : "–"}</span>
    <span class="hidden @sm:inline">{Math.round(zoom * 100)}%</span>
    <span class="hidden @md:inline">{TOOL_LABELS[tool.value]}</span>
  </StatusBar>
</div>

<div
  bind:this={size_popover}
  id="paint-size-{window_id}"
  popover="auto"
  class="size-popover m-0 w-64 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
  style="position-anchor: --paint-size-{window_id}"
>
  <div class="flex flex-col gap-3">
    <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Canvas</p>
    <div class="flex items-center gap-2">
      <Input type="number" size="sm" min={1} max={8192} bind:value={new_width} aria-label="Width" class="font-mono tabular-nums" />
      <span class="text-foreground/65">×</span>
      <Input type="number" size="sm" min={1} max={8192} bind:value={new_height} aria-label="Height" class="font-mono tabular-nums" />
    </div>
    <Segmented
      label="Background"
      options={[
        { value: Background.WHITE, label: "White" },
        { value: Background.TRANSPARENT, label: "Transparent" },
      ]}
      bind:value={new_background}
    />
    <div class="flex justify-end gap-2">
      <Button size="sm" onclick={resize_canvas}><ResizeIcon weight="bold" /> Resize</Button>
      <Button size="sm" variant="primary" onclick={new_canvas}><FilePlusIcon weight="bold" /> New</Button>
    </div>
  </div>
</div>

<style>
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  .size-popover {
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }

  .color-well {
    display: block;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 30%, transparent);
    cursor: pointer;
  }

  .color-well:has(:focus-visible) {
    outline: 2px solid var(--cottontail);
  }

  .color-well input {
    width: 150%;
    height: 150%;
    margin: -25%;
    border: 0;
    padding: 0;
    cursor: pointer;
  }

  .swatches {
    --swatch: 1.25rem;
  }

  .swatch {
    width: var(--swatch);
    height: var(--swatch);
    border-radius: var(--radius-sm);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 30%, transparent);
    cursor: pointer;
    transition: scale 150ms var(--ease-out);
  }

  .swatch:hover {
    scale: 1.1;
  }

  .swatch[aria-pressed="true"] {
    outline: 2px solid var(--foreground);
    outline-offset: 1px;
  }

  .swatch:focus-visible {
    outline: 2px solid var(--cottontail);
  }

  @media (pointer: coarse) {
    .swatches {
      --swatch: 2.25rem;
    }

    .color-well {
      width: 2.5rem;
      height: 2.5rem;
    }
  }
</style>
