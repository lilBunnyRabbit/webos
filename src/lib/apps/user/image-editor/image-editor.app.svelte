<script lang="ts">
  import kernel, { NotificationType, Platform, ShortcutCategory, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import { Button, Checkbox, EmptyState, IconButton, Input, Segmented, Select, Separator, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { confirm_discard, get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    FORMAT_OPTIONS,
    ImageFormat,
    extension_for,
    format_of,
    has_files,
    has_quality,
    image_files,
    load_image,
    load_image_at,
    paint,
    type SourceImage,
    write_image,
  } from "$lib/core/utils/image";
  import {
    ArrowArcLeft as ArrowArcLeftIcon,
    ArrowArcRight as ArrowArcRightIcon,
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Check as CheckIcon,
    CornersOut as CornersOutIcon,
    Devices as DevicesIcon,
    FlipHorizontal as FlipHorizontalIcon,
    FlipVertical as FlipVerticalIcon,
    FloppyDisk as FloppyDiskIcon,
    FloppyDiskBack as FloppyDiskBackIcon,
    FolderOpen as FolderOpenIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Sliders as SlidersIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { flushSync, onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { ASPECT_PRESETS, Handle, RESIZE_HANDLES, aspect_of, drag_rect, fit_aspect } from "./crop-rect";
  import {
    DEFAULT_ADJUSTMENTS,
    EMPTY_DOC,
    OperationType,
    add_operation,
    adjustments_equal,
    clamp_zoom,
    filter_string,
    fit_zoom,
    name_for_format,
    resize_to,
    result_size,
    round_rect,
    step_zoom,
    type Adjustments,
    type EditDoc,
    type Operation,
    type Rect,
    type Size,
  } from "./edit";
  import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$lib/core/utils/history";
  import { render_final, render_operations } from "./render";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window_id, window: win, storage } = get_app_context();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const Tool = { CROP: "crop", RESIZE: "resize", ROTATE: "rotate", ADJUST: "adjust" } as const;
  type Tool = (typeof Tool)[keyof typeof Tool];
  const TOOLS = Object.values(Tool);
  const TOOL_OPTIONS = [
    { value: Tool.CROP, label: "Crop" },
    { value: Tool.RESIZE, label: "Resize" },
    { value: Tool.ROTATE, label: "Rotate" },
    { value: Tool.ADJUST, label: "Adjust" },
  ];

  const tool = storage.window<Tool>("tool", Tool.ADJUST, z.enum(TOOLS));
  const quality = storage.persisted("quality", 92, z.number().int().min(10).max(100));

  interface AdjustmentControl {
    key: keyof Adjustments;
    label: string;
    min: number;
    max: number;
    unit: string;
  }
  const ADJUSTMENTS: AdjustmentControl[] = [
    { key: "brightness", label: "Brightness", min: 0, max: 200, unit: "%" },
    { key: "contrast", label: "Contrast", min: 0, max: 200, unit: "%" },
    { key: "saturation", label: "Saturation", min: 0, max: 200, unit: "%" },
    { key: "hue", label: "Hue", min: -180, max: 180, unit: "°" },
    { key: "blur", label: "Blur", min: 0, max: 40, unit: "px" },
    { key: "grayscale", label: "Grayscale", min: 0, max: 100, unit: "%" },
    { key: "sepia", label: "Sepia", min: 0, max: 100, unit: "%" },
  ];

  let root = $state<HTMLElement>();
  let stage = $state<HTMLElement>();
  let frame = $state<HTMLElement>();
  let save_sheet = $state<HTMLElement>();

  let source = $state.raw<SourceImage | null>(null);
  let file_path = $state<string | null>(null);
  let file_name = $state("Untitled.png");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);

  let history = $state.raw<History<EditDoc>>(create_history(EMPTY_DOC));
  let saved = $state.raw<EditDoc>(EMPTY_DOC);
  /** Slider values while dragging; they join the history when the slider is let go. */
  let draft = $state<Adjustments>({ ...DEFAULT_ADJUSTMENTS });
  let manual_zoom = $state(1);
  /** Fit follows the stage and the image size until the user zooms. */
  let fitted = $state(true);
  let stage_size = $state<Size>({ width: 0, height: 0 });

  let crop_rect = $state<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  let aspect_choice = $state("free");
  let angle = $state(0);
  let resize_unit = $state<"px" | "%">("px");
  let resize_target = $state<Size>({ width: 1, height: 1 });
  let keep_ratio = $state(true);

  let sheet_open = $state(false);
  let sheet_format = $state<ImageFormat>(ImageFormat.PNG);

  const doc = $derived(current(history));
  const dirty = $derived(source !== null && doc !== saved);
  const undoable = $derived(can_undo(history));
  const redoable = $derived(can_redo(history));

  // The angle slider previews a rotation on top of the committed chain, so dragging it re-renders one step, not all.
  const operations = $derived(doc.operations);
  const base = $derived(source ? render_operations(source.bitmap, operations) : null);
  const preview_angle = $derived(tool.value === Tool.ROTATE ? angle : 0);
  const geometry = $derived(
    base && preview_angle !== 0 ? render_operations(base, [{ type: OperationType.ROTATE, degrees: preview_angle }]) : base
  );
  const size = $derived<Size>(geometry ? { width: geometry.width, height: geometry.height } : { width: 1, height: 1 });
  const aspect = $derived(aspect_of(aspect_choice, size));
  const file_format = $derived(file_path ? format_of(file_path) : null);
  const read_only = $derived(file_path !== null && is_system_path(file_path));
  const can_overwrite = $derived(file_path !== null && !read_only && file_format !== null);
  const zoom = $derived(
    fitted && source ? fit_zoom(size, { width: stage_size.width - 32, height: stage_size.height - 32 }) : manual_zoom
  );
  const crop_changed = $derived(crop_rect.x !== 0 || crop_rect.y !== 0 || crop_rect.width !== size.width || crop_rect.height !== size.height);

  $effect(() => win.set_title(source ? file_name : null));
  $effect(() => win.set_dirty(dirty, { save }));

  function reset_tool_state() {
    const next = geometry_size(doc.operations);
    crop_rect = fit_aspect(next, aspect_of(aspect_choice, next));
    angle = 0;
    resize_target = next;
  }

  function geometry_size(operations: readonly Operation[]): Size {
    return source ? result_size({ width: source.bitmap.width, height: source.bitmap.height }, operations) : { width: 1, height: 1 };
  }

  function select_tool(next: Tool) {
    tool.value = next;
    reset_tool_state();
  }

  function commit(next: EditDoc) {
    history = push(history, next);
    draft = { ...next.adjustments };
    reset_tool_state();
  }

  function add(operation: Operation) {
    commit({ ...doc, operations: add_operation(doc.operations, operation) });
  }

  function commit_adjustments() {
    if (adjustments_equal(draft, doc.adjustments)) return;
    commit({ ...doc, adjustments: { ...draft } });
  }

  function reset_adjustments() {
    draft = { ...DEFAULT_ADJUSTMENTS };
    commit_adjustments();
  }

  function travel(next: History<EditDoc>) {
    if (next === history) return;
    history = next;
    draft = { ...doc.adjustments };
    reset_tool_state();
  }

  const do_undo = () => travel(undo(history));
  const do_redo = () => travel(redo(history));

  function apply_crop() {
    if (!crop_changed) return;
    add({ type: OperationType.CROP, ...round_rect(crop_rect, size) });
  }

  function choose_aspect(value: string) {
    aspect_choice = value;
    crop_rect = fit_aspect(size, aspect_of(value, size));
  }

  function apply_angle() {
    if (angle === 0) return;
    const degrees = angle;
    angle = 0;
    add({ type: OperationType.ROTATE, degrees });
  }

  function apply_resize() {
    const { width, height } = resize_target;
    if (width === size.width && height === size.height) return;
    add({ type: OperationType.RESIZE, width, height });
  }

  function resize_field(side: "width" | "height") {
    return {
      get: () => (resize_unit === "px" ? resize_target[side] : Math.round((resize_target[side] / size[side]) * 1000) / 10),
      set: (value: unknown) => {
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return;
        const px = resize_unit === "px" ? value : (size[side] * value) / 100;
        resize_target = resize_to(keep_ratio ? size : resize_target, side, px, keep_ratio);
      },
    };
  }
  const resize_width = resize_field("width");
  const resize_height = resize_field("height");

  function fit() {
    fitted = true;
  }

  function measure(node: HTMLElement) {
    const observer = new ResizeObserver(() => (stage_size = { width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }

  function zoom_at(next: number, client_x?: number, client_y?: number) {
    if (!frame || !stage) return;
    const view = stage.getBoundingClientRect();
    const x = client_x ?? view.left + view.width / 2;
    const y = client_y ?? view.top + view.height / 2;
    const before = frame.getBoundingClientRect();
    const image_x = (x - before.left) / zoom;
    const image_y = (y - before.top) / zoom;
    flushSync(() => {
      manual_zoom = clamp_zoom(next);
      fitted = false;
    });
    const after = frame.getBoundingClientRect();
    stage.scrollBy(after.left + image_x * zoom - x, after.top + image_y * zoom - y);
  }

  let request = 0;

  onDestroy(() => source?.bitmap.close());

  async function open_image(task: () => Promise<SourceImage>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const image = await task();
      if (id !== request) return image.bitmap.close();
      source?.bitmap.close();
      source = image;
      file_path = image.path;
      file_name = image.name;
      history = create_history(EMPTY_DOC);
      saved = EMPTY_DOC;
      draft = { ...DEFAULT_ADJUSTMENTS };
      aspect_choice = "free";
      reset_tool_state();
      fit();
    } catch (reason) {
      if (id !== request) return;
      if (source) notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't open the image", message: error_message(reason) });
      else error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  async function discard_ok(): Promise<boolean> {
    return !dirty || confirm_discard(win, file_name);
  }

  async function open() {
    if (!(await discard_ok())) return;
    const chosen = await win.pick_file({
      accept: ["image/*"],
      start_path: file_path ? parent_path(file_path) : undefined,
      title: "Open in Image Editor",
    });
    if (chosen) await open_image(() => load_image_at(chosen));
  }

  async function open_device() {
    if (!(await discard_ok())) return;
    const [file] = await pick_device_files({ accept: ["image/*"] });
    if (file) await open_image(() => load_image(file));
  }

  async function take(files: File[]) {
    const [file] = files;
    if (file && (await discard_ok())) await open_image(() => load_image(file));
  }

  const initial = untrack(() => initial_path);
  if (initial) open_image(() => load_image_at(initial));

  async function write(path: string, format: ImageFormat): Promise<boolean> {
    if (!source) return false;
    const state = doc;
    try {
      await write_image(path, render_final(source.bitmap, state.operations, state.adjustments), { format, quality: quality.value / 100 });
      file_path = path;
      file_name = base_name(path);
      saved = state;
      notifications.notify(app_id, { title: "Image saved", message: path });
      return true;
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the image", message: error_message(reason) });
      return false;
    }
  }

  async function save_to_picker(format: ImageFormat): Promise<boolean> {
    const picked = await win.pick_save({
      name: name_for_format(file_name, format, extension_for(format)),
      accept: ["image/*"],
      start_path: file_path && !read_only ? parent_path(file_path) : "/home",
    });
    if (!picked) return false;
    const named = format_of(picked);
    return named ? write(picked, named) : write(`${picked}${extension_for(format)}`, format);
  }

  function save(): Promise<boolean> {
    if (can_overwrite && file_format) return write(file_path!, file_format);
    return save_to_picker(file_format ?? ImageFormat.PNG);
  }

  function show_save_sheet() {
    sheet_format = file_format ?? ImageFormat.PNG;
    save_sheet?.showPopover();
  }

  function confirm_save_as() {
    save_sheet?.hidePopover();
    save_to_picker(sheet_format);
  }

  interface CropDrag {
    pointer_id: number;
    handle: Handle;
    start: Rect;
    x: number;
    y: number;
  }
  let crop_drag: CropDrag | null = null;

  function start_crop_drag(event: PointerEvent, handle: Handle) {
    if (crop_drag || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-crop-box]")!.setPointerCapture(event.pointerId);
    crop_drag = { pointer_id: event.pointerId, handle, start: { ...crop_rect }, x: event.clientX, y: event.clientY };
  }

  function move_crop(event: PointerEvent) {
    if (!crop_drag || event.pointerId !== crop_drag.pointer_id) return;
    const { handle, start, x, y } = crop_drag;
    crop_rect = drag_rect(start, handle, (event.clientX - x) / zoom, (event.clientY - y) / zoom, size, aspect);
  }

  function end_crop(event: PointerEvent) {
    if (crop_drag?.pointer_id === event.pointerId) crop_drag = null;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number } | null = null;

  function distance(): number {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  function on_stage_down(event: PointerEvent) {
    if (!source || (event.pointerType === "mouse" && event.button !== 0)) return;
    stage!.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch = pointers.size === 2 ? { distance: distance(), zoom } : null;
  }

  function on_stage_move(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoom_at(pinch.zoom * (distance() / pinch.distance), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointers.size === 1) {
      stage!.scrollBy(last.x - event.clientX, last.y - event.clientY);
    }
  }

  function on_stage_up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  function zoom_on_wheel(node: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom_at(zoom * Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
    };
    node.addEventListener("wheel", on_wheel, { passive: false });
    return () => node.removeEventListener("wheel", on_wheel);
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

  $effect(() =>
    win.on_back(() => {
      if (!sheet_open) return false;
      save_sheet?.hidePopover();
      return true;
    })
  );

  $effect(() => {
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `image-editor.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [
      scoped("undo", "mod+z", "Undo", do_undo),
      scoped("redo", "mod+shift+z", "Redo", do_redo),
      scoped("redo-alt", "mod+y", "Redo", do_redo),
      scoped("open", "mod+o", "Open…", open),
      scoped("save", "mod+s", "Save", () => source && save()),
      scoped("save-as", "mod+shift+s", "Save as…", () => source && show_save_sheet()),
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  function percent(value: number, total: number) {
    return `${(value / total) * 100}%`;
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet open_actions(primary: boolean)}
  <Button variant={primary ? "primary" : "secondary"} onclick={open}><FolderOpenIcon weight="bold" /> Open an image…</Button>
  <Button onclick={open_device}><DevicesIcon weight="bold" /> From device…</Button>
{/snippet}

{#snippet value_label(text: string)}
  <span class="w-14 shrink-0 text-right font-mono text-2xs text-foreground/80 tabular-nums">{text}</span>
{/snippet}

<div
  bind:this={root}
  class="relative h-full"
  role="region"
  aria-label="Image Editor"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if !source}
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Loading image" /></div>
    {:else if error}
      <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the image" description={error}>
        {#snippet actions()}{@render open_actions(false)}{/snippet}
      </EmptyState>
    {:else}
      <EmptyState icon={SlidersIcon} title="No image open" description="Crop, resize, rotate and adjust an image. Open one, drop it here or paste it.">
        {#snippet actions()}{@render open_actions(true)}{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={open}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={open_device}><DevicesIcon weight="bold" /></IconButton>
        <IconButton label="Save" size="sm" onclick={save}><FloppyDiskIcon weight="bold" /></IconButton>
        <IconButton label="Save as…" size="sm" onclick={show_save_sheet} style="anchor-name: --image-editor-save-{window_id}">
          <FloppyDiskBackIcon weight="bold" />
        </IconButton>
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
      </Toolbar>

      <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[minmax(0,1fr)_18rem] @2xl:grid-rows-1">
        <div class="relative min-h-0 min-w-0">
          <div
            bind:this={stage}
            {@attach zoom_on_wheel}
            {@attach measure}
            class="grid size-full touch-none overflow-auto bg-background-darker p-4 select-none"
            role="presentation"
            onpointerdown={on_stage_down}
            onpointermove={on_stage_move}
            onlostpointercapture={on_stage_up}
          >
            {#if geometry}
              <div
                bind:this={frame}
                class="checker relative m-auto shrink-0 ring-1 ring-foreground/10"
                style:width="{size.width * zoom}px"
                style:height="{size.height * zoom}px"
              >
                <canvas
                  {@attach paint(geometry)}
                  class={["absolute inset-0 size-full", zoom >= 2 && "[image-rendering:pixelated]"]}
                  style:filter={filter_string(draft, zoom)}
                ></canvas>
                {#if tool.value === Tool.CROP}
                  <div class="pointer-events-none absolute inset-0 overflow-hidden">
                    <div
                      class="crop-shade absolute"
                      style:left={percent(crop_rect.x, size.width)}
                      style:top={percent(crop_rect.y, size.height)}
                      style:width={percent(crop_rect.width, size.width)}
                      style:height={percent(crop_rect.height, size.height)}
                    ></div>
                  </div>
                  <div
                    data-crop-box
                    class="crop-box absolute cursor-move"
                    role="group"
                    aria-label="Crop area"
                    style:left={percent(crop_rect.x, size.width)}
                    style:top={percent(crop_rect.y, size.height)}
                    style:width={percent(crop_rect.width, size.width)}
                    style:height={percent(crop_rect.height, size.height)}
                    onpointerdown={(event) => start_crop_drag(event, Handle.MOVE)}
                    onpointermove={move_crop}
                    onlostpointercapture={end_crop}
                  >
                    <span class="thirds pointer-events-none absolute inset-0"></span>
                    {#each RESIZE_HANDLES as handle (handle)}
                      <span class="handle" role="presentation" data-handle={handle} onpointerdown={(event) => start_crop_drag(event, handle)}></span>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <div class="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-lg bg-background-light p-0.5 shadow-raised" role="group" aria-label="Zoom">
            <IconButton label="Zoom out" size="sm" onclick={() => zoom_at(step_zoom(zoom, -1))}><MagnifyingGlassMinusIcon weight="bold" /></IconButton>
            <button
              type="button"
              class="h-7 w-12 rounded-sm font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/6 pointer-coarse:h-9"
              title="Actual size"
              onclick={() => zoom_at(1)}>{Math.round(zoom * 100)}%</button
            >
            <IconButton label="Zoom in" size="sm" onclick={() => zoom_at(step_zoom(zoom, 1))}><MagnifyingGlassPlusIcon weight="bold" /></IconButton>
            <IconButton label="Fit to window" size="sm" onclick={fit}><CornersOutIcon weight="bold" /></IconButton>
          </div>

          {#if loading}
            <div class="absolute inset-0 grid place-items-center bg-background-darker/70"><Spinner label="Loading image" /></div>
          {/if}
        </div>

        <aside
          class="flex max-h-[45cqh] flex-col gap-3 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-t-0 @2xl:border-l"
          aria-label="Edit"
        >
          <Segmented size="sm" label="Tool" class="w-full [&>label]:flex-1 [&>label]:justify-center" options={TOOL_OPTIONS} bind:value={() => tool.value, select_tool} />

          {#if tool.value === Tool.CROP}
            <div class="flex flex-wrap items-center gap-2">
              <label class="flex flex-1 items-center gap-2 text-ui text-foreground/80">
                Ratio
                <Select size="sm" class="min-w-24 flex-1" options={ASPECT_PRESETS} bind:value={() => aspect_choice, choose_aspect} />
              </label>
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">{Math.round(crop_rect.width)} × {Math.round(crop_rect.height)}</span>
            </div>
            <div class="flex justify-end gap-2">
              <Button size="sm" variant="quiet" disabled={!crop_changed} onclick={() => choose_aspect(aspect_choice)}>Reset</Button>
              <Button size="sm" variant="primary" disabled={!crop_changed} onclick={apply_crop}><CheckIcon weight="bold" /> Crop</Button>
            </div>
          {:else if tool.value === Tool.RESIZE}
            <Segmented
              size="sm"
              label="Unit"
              options={[
                { value: "px", label: "Pixels" },
                { value: "%", label: "Percent" },
              ]}
              bind:value={resize_unit}
            />
            <div class="flex items-center gap-2">
              <Input
                type="number"
                size="sm"
                min={1}
                aria-label="Width"
                class="min-w-0 flex-1 font-mono tabular-nums"
                bind:value={resize_width.get, resize_width.set}
              />
              <span class="text-foreground/65">×</span>
              <Input
                type="number"
                size="sm"
                min={1}
                aria-label="Height"
                class="min-w-0 flex-1 font-mono tabular-nums"
                bind:value={resize_height.get, resize_height.set}
              />
              <span class="w-6 font-mono text-2xs text-foreground/65">{resize_unit}</span>
            </div>
            <label class="flex items-center gap-2 text-ui text-foreground/80">
              <Checkbox bind:checked={keep_ratio} onchange={() => keep_ratio && (resize_target = resize_to(size, "width", resize_target.width, true))} />
              Keep aspect ratio
            </label>
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">{size.width} × {size.height} → {resize_target.width} × {resize_target.height}</span>
              <Button
                size="sm"
                variant="primary"
                disabled={resize_target.width === size.width && resize_target.height === size.height}
                onclick={apply_resize}><CheckIcon weight="bold" /> Resize</Button
              >
            </div>
          {:else if tool.value === Tool.ROTATE}
            <div class="grid grid-cols-2 gap-2">
              <Button size="sm" title="Rotate left 90°" onclick={() => add({ type: OperationType.ROTATE, degrees: -90 })}><ArrowArcLeftIcon weight="bold" /> Left</Button>
              <Button size="sm" title="Rotate right 90°" onclick={() => add({ type: OperationType.ROTATE, degrees: 90 })}><ArrowArcRightIcon weight="bold" /> Right</Button>
              <Button size="sm" title="Flip horizontally" onclick={() => add({ type: OperationType.FLIP, horizontal: true })}>
                <FlipHorizontalIcon weight="bold" /> Horizontal
              </Button>
              <Button size="sm" title="Flip vertically" onclick={() => add({ type: OperationType.FLIP, horizontal: false })}>
                <FlipVerticalIcon weight="bold" /> Vertical
              </Button>
            </div>
            <label class="flex items-center gap-2 text-ui text-foreground/80">
              <span class="w-20 shrink-0">Angle</span>
              <Slider size="sm" min={-180} max={180} class="flex-1" bind:value={angle} />
              {@render value_label(`${angle}°`)}
            </label>
            <div class="flex justify-end gap-2">
              <Button size="sm" variant="quiet" disabled={angle === 0} onclick={() => (angle = 0)}>Reset</Button>
              <Button size="sm" variant="primary" disabled={angle === 0} onclick={apply_angle}><CheckIcon weight="bold" /> Rotate</Button>
            </div>
          {:else}
            <div class="grid gap-x-4 @md:grid-cols-2 @2xl:grid-cols-1">
              {#each ADJUSTMENTS as control (control.key)}
                <label class="flex items-center gap-2 text-ui text-foreground/80">
                  <span class="w-20 shrink-0">{control.label}</span>
                  <Slider size="sm" min={control.min} max={control.max} class="flex-1" bind:value={draft[control.key]} onchange={commit_adjustments} />
                  {@render value_label(`${draft[control.key]}${control.unit}`)}
                </label>
              {/each}
            </div>
            <div class="flex justify-end">
              <Button size="sm" variant="quiet" disabled={adjustments_equal(draft, DEFAULT_ADJUSTMENTS)} onclick={reset_adjustments}>Reset all</Button>
            </div>
          {/if}
        </aside>
      </div>

      <StatusBar>
        <span>{size.width} × {size.height} px</span>
        <span class="hidden @sm:inline">{source.bitmap.width} × {source.bitmap.height} original</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span class="hidden @md:inline">{source.type || "unknown type"}</span>
      </StatusBar>
    </div>

    <div
      bind:this={save_sheet}
      id="image-editor-save-{window_id}"
      popover="auto"
      class="save-sheet m-0 w-72 max-w-[calc(100cqw-2rem)] rounded-xl bg-background-lighter p-3 text-foreground shadow-popover"
      style="position-anchor: --image-editor-save-{window_id}"
      ontoggle={(event) => (sheet_open = event.newState === "open")}
    >
      <div class="flex flex-col gap-3">
        <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Save as</p>
        <Segmented label="Format" class="w-full [&>label]:flex-1 [&>label]:justify-center" options={FORMAT_OPTIONS} bind:value={sheet_format} />
        {#if has_quality(sheet_format)}
          <label class="flex items-center gap-2 text-ui text-foreground/80">
            Quality
            <Slider size="sm" min={10} max={100} class="flex-1" bind:value={quality.value} />
            {@render value_label(`${quality.value}%`)}
          </label>
        {:else}
          <p class="text-ui text-foreground/65">Lossless, keeps transparency.</p>
        {/if}
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="quiet" onclick={() => save_sheet?.hidePopover()}>Cancel</Button>
          <Button size="sm" variant="primary" onclick={confirm_save_as}><FloppyDiskBackIcon weight="bold" /> Choose location…</Button>
        </div>
      </div>
    </div>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

<style>
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  .crop-shade {
    box-shadow: 0 0 0 100vmax color-mix(in oklch, var(--background-darkest) 65%, transparent);
  }

  .crop-box {
    outline: 1px solid var(--primary);
    touch-action: none;
  }

  .thirds {
    background:
      linear-gradient(to right, transparent calc(100% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(200% / 3 + 0.5px), transparent 0),
      linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(200% / 3 + 0.5px), transparent 0);
  }

  .handle {
    --hit: 28px;
    position: absolute;
    width: var(--hit);
    height: var(--hit);
    translate: -50% -50%;
    display: grid;
    place-items: center;
    touch-action: none;
  }

  .handle::after {
    content: "";
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    background: var(--primary);
    box-shadow: 0 0 0 2px var(--background-darkest);
  }

  @media (pointer: coarse) {
    .handle {
      --hit: 40px;
    }

    .handle::after {
      width: 16px;
      height: 16px;
    }
  }

  .handle[data-handle="nw"] { left: 0; top: 0; cursor: nwse-resize; }
  .handle[data-handle="n"] { left: 50%; top: 0; cursor: ns-resize; }
  .handle[data-handle="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
  .handle[data-handle="e"] { left: 100%; top: 50%; cursor: ew-resize; }
  .handle[data-handle="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
  .handle[data-handle="s"] { left: 50%; top: 100%; cursor: ns-resize; }
  .handle[data-handle="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
  .handle[data-handle="w"] { left: 0; top: 50%; cursor: ew-resize; }

  .save-sheet {
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>
