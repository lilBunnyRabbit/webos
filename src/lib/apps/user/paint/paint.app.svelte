<script lang="ts">
  import kernel, {
    NotificationType,
    ShortcutCategory,
    type NotificationsService,
    type SettingsService,
    type ShortcutsService,
  } from "$lib/core/api";
  import { Button, IconButton, Input, Segmented, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, file_stem, load_image_at, parent_folder } from "$lib/core/utils/image";
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
  import { draw_shape, stamp_pencil, stroke_brush } from "./draw";
  import { flood_fill } from "./flood-fill";
  import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "./history";
  import { base_name, css_to_hex, write_image } from "./paint-file";
  import { clamp_side, fit_zoom, parse_hex, push_recent, step_zoom, to_canvas_point, to_hex, type Point } from "./shapes";
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
  const HISTORY_LIMITS = { max_entries: 50, max_bytes: 256 * 1024 * 1024, size_of: (image: ImageData) => image.data.byteLength };

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
  let history = $state.raw<History<ImageData> | null>(null);
  let saved = $state.raw<ImageData | null>(null);
  let loading = $state(false);
  let cursor = $state<Point | null>(null);

  let new_width = $state<number | null>(DEFAULT_WIDTH);
  let new_height = $state<number | null>(DEFAULT_HEIGHT);
  let new_background = $state<Background>(Background.WHITE);

  const dirty = $derived(history !== null && current(history) !== saved);
  const file_name = $derived(file_path ? base_name(file_path) : "Untitled.png");
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

  function restore(image: ImageData) {
    if (image.width !== width || image.height !== height) set_size(image.width, image.height);
    context().putImageData(image, 0, 0);
  }

  function reset_history() {
    const image = snapshot();
    history = create_history(image);
    saved = image;
  }

  function commit() {
    if (!history) return;
    history = push(history, snapshot(), HISTORY_LIMITS);
  }

  function do_undo() {
    if (stroke || !history || !can_undo(history)) return;
    history = undo(history);
    restore(current(history));
  }

  function do_redo() {
    if (stroke || !history || !can_redo(history)) return;
    history = redo(history);
    restore(current(history));
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
    if (!dirty) return true;
    return win.confirm(`Discard changes to “${file_name}”?`, {
      detail: "Your unsaved changes will be lost.",
      confirm_label: "Discard",
      danger: true,
    });
  }

  async function new_canvas() {
    if (!(await discard_ok())) return;
    blank(clamp_side(new_width ?? DEFAULT_WIDTH), clamp_side(new_height ?? DEFAULT_HEIGHT), new_background);
    file_path = null;
    reset_history();
    size_popover?.hidePopover();
    fit();
  }

  function resize_canvas() {
    const next_width = clamp_side(new_width ?? width);
    const next_height = clamp_side(new_height ?? height);
    if (next_width === width && next_height === height) return size_popover?.hidePopover();
    const before = snapshot();
    blank(next_width, next_height, new_background);
    context().drawImage(image_canvas(before), 0, 0);
    commit();
    size_popover?.hidePopover();
  }

  // putImageData ignores compositing and would punch transparent holes; drawImage keeps the new background under it.
  function image_canvas(image: ImageData): OffscreenCanvas {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext("2d")!.putImageData(image, 0, 0);
    return canvas;
  }

  async function open_path(path: string) {
    loading = true;
    try {
      const image = await load_image_at(path);
      set_size(image.bitmap.width, image.bitmap.height);
      const ctx = context();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image.bitmap, 0, 0);
      image.bitmap.close();
      file_path = path;
      reset_history();
      fit();
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't open the image", message: error_message(reason) });
    } finally {
      loading = false;
    }
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: ["image/*"],
      start_path: file_path ? parent_folder(file_path) : undefined,
      title: "Open in Paint",
    });
    if (chosen) await open_path(chosen);
  }

  async function write(path: string) {
    if (!history) return;
    const state = current(history);
    try {
      await write_image(path, doc_canvas!);
      file_path = path;
      saved = state;
      notifications.notify(app_id, { title: "Image saved", message: path });
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the image", message: error_message(reason) });
    }
  }

  async function save_as() {
    const path = await win.pick_save({
      name: file_path ? base_name(file_path) : "Untitled.png",
      accept: ["image/*"],
      start_path: file_path ? parent_folder(file_path) : "/home",
    });
    if (path) await write(path);
  }

  async function save() {
    if (file_path) await write(file_path);
    else await save_as();
  }

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
    if (active.tool === Tool.PENCIL) stamp_pencil(ctx, floor(from), floor(to), size.value, active.color);
    else stroke_brush(ctx, from, to, brush_width(event), active.color, active.tool === Tool.ERASER);
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
    context().putImageData(image, 0, 0);
    commit();
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
    ctx.fillText(text, Math.floor(point.x), Math.floor(point.y));
    ctx.restore();
    commit();
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
    stroke = { pointer_id: event.pointerId, tool: active_tool, color, other, start: point, last: point, constrain: event.shiftKey };
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
      const events = event.getCoalescedEvents();
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
    }
    commit();
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
    if (path) open_path(path);
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

<div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
  <Toolbar>
    <IconButton
      label={panel_open.value ? "Hide tools" : "Show tools"}
      size="sm"
      class="@md:hidden"
      aria-pressed={panel_open.value}
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

    <span class="flex min-w-16 flex-1 items-center gap-1.5 px-1">
      <span class="truncate text-ui font-medium" title={file_path ?? "Not saved yet"}>{file_name}</span>
      {#if dirty}<span class="size-2 shrink-0 rounded-full bg-primary" title="Unsaved changes"></span>{/if}
    </span>

    <IconButton label="Zoom out" size="sm" onclick={() => (zoom = step_zoom(zoom, -1))}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
    <span class="hidden w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums @sm:inline">{Math.round(zoom * 100)}%</span>
    <IconButton label="Zoom in" size="sm" onclick={() => (zoom = step_zoom(zoom, 1))}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
    <IconButton label="Fit to window" size="sm" onclick={fit}><CornersOutIcon weight="bold" /></IconButton>
  </Toolbar>

  <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @md:grid-cols-[auto_minmax(0,1fr)] @md:grid-rows-1">
    <aside
      class={[
        "flex-wrap items-center gap-3 overflow-auto border-b border-foreground/8 bg-background-light p-2",
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
            variant={tool.value === item ? "secondary" : "quiet"}
            class={tool.value === item ? "text-primary" : ""}
            aria-pressed={tool.value === item}
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
          <input type="range" min="1" max="100" bind:value={size.value} class="min-w-20 flex-1 accent-primary" />
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
          <input type="range" min="0" max="100" bind:value={tolerance.value} class="min-w-20 flex-1 accent-primary" />
          <span class="w-8 text-right font-mono text-2xs tabular-nums">{tolerance.value}%</span>
        </label>
      {/if}
    </aside>

    <div
      bind:this={stage}
      {@attach zoom_on_wheel}
      class="stage relative grid min-h-0 min-w-0 overflow-auto bg-background-darker p-4"
    >
      <div
        class="checker relative m-auto shrink-0 ring-1 ring-foreground/10"
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
