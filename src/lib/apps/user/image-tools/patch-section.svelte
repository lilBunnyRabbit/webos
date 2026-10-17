<script lang="ts">
  import kernel, { NotificationType, type NotificationsService, type SettingsService } from "$lib/core/api";
  import { Button, Checkbox, EmptyState, IconButton, Input, Segmented, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { error_message, resolve_token } from "$lib/core/utils";
  import {
    ArrowsClockwise as ArrowsClockwiseIcon,
    Bandaids as BandaidsIcon,
    Devices as DevicesIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { parent_path } from "$lib/core/api/services/files/path";
  import { ImageFormat, has_files, image_files, load_image, load_image_at, paint, read_pixels, save_image, type SourceImage } from "$lib/core/utils/image";
  import { patched_name } from "./naming";
  import {
    IDENTITY_COLORS,
    Pyramid,
    RestoreMode,
    align,
    compare,
    compose,
    coverage,
    drag_rect,
    draw_aligned,
    draw_heatmap,
    draw_ops,
    find_regions,
    is_restored,
    rect_at,
    toggle_rect,
    type Alignment,
    type Rect,
    type RestoreOp,
  } from "./patch";
  import type { SectionProps } from "./sections";

  const Slot = { ORIGINAL: "original", EDITED: "edited" } as const;
  type Slot = (typeof Slot)[keyof typeof Slot];

  const View = { EDITED: "edited", RESULT: "result", ORIGINAL: "original", DIFF: "diff" } as const;
  type View = (typeof View)[keyof typeof View];

  const Tool = { SELECT: "select", BOX: "box", BRUSH: "brush", ERASE: "erase" } as const;
  type Tool = (typeof Tool)[keyof typeof Tool];

  const VIEWS = [
    { value: View.EDITED, label: "Edited" },
    { value: View.RESULT, label: "Result" },
    { value: View.ORIGINAL, label: "Original" },
    { value: View.DIFF, label: "Diff" },
  ];
  const TOOLS = [
    { value: Tool.SELECT, label: "Select" },
    { value: Tool.BOX, label: "Box" },
    { value: Tool.BRUSH, label: "Brush" },
    { value: Tool.ERASE, label: "Erase" },
  ];
  const PREVIEW_SIDE = 1600;
  /** Past this many boxes the tolerance is picking up noise, and a wall of boxes helps nobody. */
  const MAX_REGIONS = 80;

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window: win } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const settings = $derived(kernel.service<SettingsService>("settings"));

  let root = $state<HTMLElement>();
  let images = $state.raw<Record<Slot, SourceImage | null>>({ original: null, edited: null });
  let loading = $state.raw<Record<Slot, boolean>>({ original: false, edited: false });
  let dragging = $state(false);

  let alignment = $state.raw<Alignment | null>(null);
  let match = $state(0);
  let aligning = $state(false);

  let match_colors = $state(true);
  let tolerance = $state(12);
  let feather = $state(2);
  let brush = $state(24);
  let tool = $state<Tool>(Tool.SELECT);
  let view = $state<View>(View.EDITED);
  let ops = $state.raw<RestoreOp[]>([]);
  let draft = $state.raw<RestoreOp | null>(null);
  let hovered = $state.raw<Rect | null>(null);
  let cursor = $state.raw<{ x: number; y: number } | null>(null);
  let primary = $state<string | null>(null);
  let overlay = $state<HTMLElement>();

  const original = $derived(images.original);
  const edited = $derived(images.edited);
  const original_pyramid = $derived(original ? new Pyramid(read_pixels(original.bitmap)) : null);
  const edited_pyramid = $derived(edited ? new Pyramid(read_pixels(edited.bitmap)) : null);
  const ready = $derived(original && edited && alignment ? { original, edited, alignment } : null);

  const comparison = $derived(
    original_pyramid && edited_pyramid && alignment ? compare(original_pyramid, edited_pyramid, alignment, match_colors) : null
  );
  const all_regions = $derived(comparison ? find_regions(comparison.diff, (tolerance * 255) / 100) : []);
  const too_many = $derived(all_regions.length > MAX_REGIONS);
  const regions = $derived(too_many ? [] : all_regions);
  const restored_count = $derived(ops.filter((op) => op.mode === RestoreMode.ADD).length);
  const covered = $derived(ready ? coverage(ready.alignment, ready.original.bitmap, ready.edited.bitmap) : null);
  const hatch = $derived.by(() => {
    if (!edited || !ready) return [];
    const { width, height } = edited.bitmap;
    if (!covered) return [{ x: 0, y: 0, width, height }];
    const right = covered.x + covered.width;
    const bottom = covered.y + covered.height;
    return [
      { x: 0, y: 0, width, height: covered.y },
      { x: 0, y: bottom, width, height: height - bottom },
      { x: 0, y: covered.y, width: covered.x, height: covered.height },
      { x: right, y: covered.y, width: width - right, height: covered.height },
    ].filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  });

  const preview_scale = $derived(edited ? Math.min(1, PREVIEW_SIDE / Math.max(edited.bitmap.width, edited.bitmap.height)) : 1);
  const preview = $derived.by(() => {
    if (!edited) return null;
    if (!ready) return edited.bitmap;
    if (view === View.ORIGINAL) return draw_aligned(ready.original.bitmap, ready.edited.bitmap, ready.alignment, preview_scale);
    if (view === View.RESULT) {
      return compose({
        original: ready.original.bitmap,
        edited: ready.edited.bitmap,
        alignment: ready.alignment,
        ops,
        colors: comparison?.colors ?? IDENTITY_COLORS,
        feather,
        scale: preview_scale,
      });
    }
    return edited.bitmap;
  });
  const heatmap = $derived(view === View.DIFF && comparison && primary ? draw_heatmap(comparison.diff, primary) : null);

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (primary = resolve_token(probe, "var(--primary)")));
    return () => cancelAnimationFrame(frame);
  });

  const requests: Record<Slot, number> = { original: 0, edited: 0 };
  let align_request = 0;
  let destroyed = false;

  async function load(slot: Slot, task: () => Promise<SourceImage>) {
    const id = ++requests[slot];
    loading = { ...loading, [slot]: true };
    try {
      const result = await task();
      if (destroyed || id !== requests[slot]) return result.bitmap.close();
      const previous = images[slot];
      images = { ...images, [slot]: result };
      previous?.bitmap.close();
      ops = [];
      draft = null;
      realign();
    } catch (reason) {
      if (id === requests[slot]) {
        notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't open the image", message: error_message(reason) });
      }
    } finally {
      if (id === requests[slot]) loading = { ...loading, [slot]: false };
    }
  }

  async function realign() {
    const id = ++align_request;
    if (!original_pyramid || !edited_pyramid) {
      alignment = null;
      return;
    }
    aligning = true;
    // Lets the spinner paint before the search holds the main thread for a moment.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    if (id !== align_request) return;
    if (!original_pyramid || !edited_pyramid) {
      aligning = false;
      return;
    }
    const result = align(original_pyramid, edited_pyramid);
    alignment = result.alignment;
    match = result.match;
    aligning = false;
  }

  function nudge(field: keyof Alignment, value: number | string | null | undefined) {
    const number = typeof value === "number" ? value : Number.parseFloat(value ?? "");
    if (!alignment || !Number.isFinite(number) || (field === "scale" && number <= 0)) return;
    alignment = { ...alignment, [field]: number };
  }

  onDestroy(() => {
    destroyed = true;
    images.original?.bitmap.close();
    images.edited?.bitmap.close();
  });

  const initial = untrack(() => initial_paths);
  if (initial[0]) load(Slot.ORIGINAL, () => load_image_at(initial[0]));
  if (initial[1]) load(Slot.EDITED, () => load_image_at(initial[1]));

  const start_path = $derived.by(() => {
    const path = edited?.path ?? original?.path;
    return path ? parent_path(path) : undefined;
  });

  async function pick(slot: Slot) {
    const title = slot === Slot.ORIGINAL ? "Open the original" : "Open the edited copy";
    const chosen = await win.pick_file({ accept: ["image/*"], start_path, title });
    if (chosen) load(slot, () => load_image_at(chosen));
  }

  async function pick_device(slot?: Slot) {
    const files = await pick_device_files({ accept: ["image/*"], multiple: !slot });
    if (slot && files[0]) load(slot, () => load_image(files[0]));
    else take(files);
  }

  function take(files: File[]) {
    if (files.length >= 2) {
      load(Slot.ORIGINAL, () => load_image(files[0]));
      load(Slot.EDITED, () => load_image(files[1]));
      return;
    }
    const [file] = files;
    if (file) load(images.original ? Slot.EDITED : Slot.ORIGINAL, () => load_image(file));
  }

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused) return;
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

  function image_point(event: PointerEvent): { x: number; y: number; ratio: number } | null {
    if (!overlay || !edited) return null;
    const box = overlay.getBoundingClientRect();
    const ratio = edited.bitmap.width / box.width;
    return { x: (event.clientX - box.left) * ratio, y: (event.clientY - box.top) * ratio, ratio };
  }

  let drag_start: { x: number; y: number } | null = null;

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0 || !edited || !ready) return;
    const point = image_point(event);
    if (!point) return;
    if (tool === Tool.SELECT) {
      const restored_rects = ops.flatMap((op) => (op.kind === "rect" && op.mode === RestoreMode.ADD ? [op.rect] : []));
      const hit = rect_at([...regions, ...restored_rects], point.x, point.y);
      if (hit) ops = toggle_rect(ops, hit);
      return;
    }
    overlay?.setPointerCapture(event.pointerId);
    drag_start = { x: point.x, y: point.y };
    draft =
      tool === Tool.BOX
        ? { kind: "rect", mode: RestoreMode.ADD, rect: { x: point.x, y: point.y, width: 0, height: 0 } }
        : { kind: "brush", mode: tool === Tool.ERASE ? RestoreMode.ERASE : RestoreMode.ADD, size: brush * point.ratio, points: [point.x, point.y] };
  }

  function on_pointermove(event: PointerEvent) {
    const point = image_point(event);
    if (!point || !edited) return;
    cursor = { x: (point.x / edited.bitmap.width) * 100, y: (point.y / edited.bitmap.height) * 100 };
    if (!draft || !drag_start) return;
    if (draft.kind === "rect") {
      draft = { ...draft, rect: drag_rect(drag_start.x, drag_start.y, point.x, point.y, edited.bitmap.width, edited.bitmap.height) };
    } else {
      draft.points.push(point.x, point.y);
      draft = { ...draft };
    }
  }

  function on_lostpointercapture() {
    const done = draft;
    draft = null;
    drag_start = null;
    if (!done) return;
    if (done.kind === "rect" && (done.rect.width < 2 || done.rect.height < 2)) return;
    ops = [...ops, done];
  }

  function draw_mask(canvas: HTMLCanvasElement) {
    if (!edited) return;
    canvas.width = Math.max(1, Math.round(edited.bitmap.width * preview_scale));
    canvas.height = Math.max(1, Math.round(edited.bitmap.height * preview_scale));
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!primary) return;
    context.fillStyle = primary;
    draw_ops(context, draft ? [...ops, draft] : ops, preview_scale);
  }

  function save() {
    if (!ready) return;
    const canvas = compose({
      original: ready.original.bitmap,
      edited: ready.edited.bitmap,
      alignment: ready.alignment,
      ops,
      colors: comparison?.colors ?? IDENTITY_COLORS,
      feather,
    });
    save_image({
      app_id,
      window: win,
      canvas,
      name: patched_name(ready.edited.name),
      format: ImageFormat.PNG,
      start_path: start_path ?? null,
    });
  }

  function signed(value: number): string {
    return value < 0 ? `−${Math.abs(value)}` : `${value}`;
  }

  function percent(value: number, total: number): string {
    return `${(value / total) * 100}%`;
  }

  const match_label = $derived(match >= 0.9 ? "Good match" : match >= 0.6 ? "Rough match, check the Original view" : "No clear match, nudge it by hand");
</script>

<svelte:document onpaste={on_paste} />

{#snippet slot_row(slot: Slot, label: string)}
  {@const image = images[slot]}
  <div class="flex h-9 items-center gap-1 rounded-md pl-2 hover:bg-foreground/6">
    <span class="w-14 shrink-0 text-2xs font-medium text-foreground/65">{label}</span>
    {#if loading[slot]}
      <span class="flex-1"><Spinner label="Loading {label.toLowerCase()}" /></span>
    {:else if image}
      <span class="min-w-0 flex-1 truncate text-ui" title={image.path ?? image.name}>{image.name}</span>
      <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{image.bitmap.width}×{image.bitmap.height}</span>
    {:else}
      <span class="min-w-0 flex-1 truncate text-ui text-foreground/65">None</span>
    {/if}
    <IconButton label="Open {label.toLowerCase()}…" size="sm" onclick={() => pick(slot)}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open {label.toLowerCase()} from device…" size="sm" onclick={() => pick_device(slot)}><DevicesIcon weight="bold" /></IconButton>
  </div>
{/snippet}

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Patch"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{edited?.name ?? original?.name ?? ""}</span>
    {#if ready}
      <Button variant="primary" size="sm" disabled={!restored_count} onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
    {/if}
  </Toolbar>

  {#if !original && !edited && !loading.original && !loading.edited}
    <EmptyState
      icon={BandaidsIcon}
      title="No images yet"
      description="Takes back what an editor stamped on a picture, like its logo, from the original. Open the original and the edited copy, or drop both here."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={() => pick(Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open the original…</Button>
        <Button onclick={() => pick_device()}><DevicesIcon weight="bold" /> From device…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside class="flex max-h-60 flex-col gap-4 overflow-auto border-b border-foreground/8 bg-background-light p-3 @2xl:max-h-none @2xl:border-r @2xl:border-b-0">
        <div class="flex flex-col gap-0.5">
          {@render heading("Images")}
          {@render slot_row(Slot.ORIGINAL, "Original")}
          {@render slot_row(Slot.EDITED, "Edited")}
        </div>

        {#if original && edited}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              {@render heading("Alignment")}
              <IconButton label="Align again" size="sm" disabled={aligning} onclick={realign}><ArrowsClockwiseIcon weight="bold" /></IconButton>
            </div>
            {#if aligning || !alignment}
              <div class="flex items-center gap-2 px-0.5 text-ui text-foreground/80"><Spinner label="Aligning" /> Aligning…</div>
            {:else}
              <p class="px-0.5 text-ui">
                Scale {alignment.scale}, offset {signed(alignment.dx)}, {signed(alignment.dy)}
                <span class={["block text-2xs", match >= 0.9 ? "text-foreground/65" : "text-warning"]}>{match_label}</span>
              </p>
              <div class="grid grid-cols-3 gap-1.5">
                <label class="flex flex-col gap-1 text-2xs text-foreground/65">
                  Scale
                  <Input type="number" size="sm" step={0.001} min={0.001} value={alignment.scale} oninput={(event) => nudge("scale", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
                </label>
                <label class="flex flex-col gap-1 text-2xs text-foreground/65">
                  X
                  <Input type="number" size="sm" step={0.5} value={alignment.dx} oninput={(event) => nudge("dx", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
                </label>
                <label class="flex flex-col gap-1 text-2xs text-foreground/65">
                  Y
                  <Input type="number" size="sm" step={0.5} value={alignment.dy} oninput={(event) => nudge("dy", event.currentTarget.value)} class="w-full font-mono tabular-nums" />
                </label>
              </div>
            {/if}
          </div>

          <div class="flex flex-col gap-2">
            {@render heading("Changes")}
            <label class="flex items-center gap-2 text-ui" title="How different a pixel must be to count as changed">
              <span class="w-20 shrink-0">Tolerance</span>
              <Slider size="sm" min={1} max={60} bind:value={tolerance} class="min-w-0 flex-1" aria-label="Tolerance" />
              <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{tolerance}%</span>
            </label>
            <label class="flex items-center justify-between gap-2 text-ui" title="Ignore a colour change across the whole picture, and give restored areas the same change">
              Match colours
              <Switch bind:checked={match_colors} />
            </label>
            {#if too_many}
              <p class="px-0.5 text-2xs text-warning">{all_regions.length} changed spots. Raise the tolerance to see them as boxes.</p>
            {:else if !regions.length}
              <p class="px-0.5 text-2xs text-foreground/65">No changes above the tolerance.</p>
            {:else}
              <ul class="flex flex-col gap-0.5">
                {#each regions as region, index (`${region.x},${region.y},${region.width},${region.height}`)}
                  <li>
                    <label
                      class="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-foreground/6"
                      onpointerenter={() => (hovered = region)}
                      onpointerleave={() => (hovered = null)}
                    >
                      <Checkbox checked={is_restored(ops, region)} onchange={() => (ops = toggle_rect(ops, region))} />
                      <span class="w-5 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
                      <span class="min-w-0 flex-1 truncate font-mono text-2xs tabular-nums">{region.width}×{region.height} at {region.x}, {region.y}</span>
                    </label>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              {@render heading("Restore")}
              <IconButton label="Clear restore areas" size="sm" disabled={!ops.length} onclick={() => (ops = [])}><TrashIcon weight="bold" /></IconButton>
            </div>
            <label class="flex items-center gap-2 text-ui">
              <span class="w-20 shrink-0">Brush</span>
              <Slider size="sm" min={4} max={120} bind:value={brush} class="min-w-0 flex-1" aria-label="Brush size" />
              <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{brush}</span>
            </label>
            <label class="flex items-center gap-2 text-ui" title="Softens the edge of restored areas so no seam shows">
              <span class="w-20 shrink-0">Feather</span>
              <Slider size="sm" min={0} max={10} bind:value={feather} class="min-w-0 flex-1" aria-label="Feather" />
              <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{feather}px</span>
            </label>
          </div>
        {/if}
      </aside>

      {#if !edited || !original}
        <div class="stage grid min-h-0 place-items-center">
          {#if loading.original || loading.edited}
            <Spinner label="Loading image" />
          {:else}
            <EmptyState
              icon={BandaidsIcon}
              title={original ? "Now the edited copy" : "Now the original"}
              description={original ? "The version an editor exported, with its mark on it." : "The untouched version, from before the edit."}
            >
              {#snippet actions()}
                <Button variant="primary" onclick={() => pick(original ? Slot.EDITED : Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open…</Button>
                <Button onclick={() => pick_device(original ? Slot.EDITED : Slot.ORIGINAL)}><DevicesIcon weight="bold" /> From device…</Button>
              {/snippet}
            </EmptyState>
          {/if}
        </div>
      {:else}
        {@const width = edited.bitmap.width}
        {@const height = edited.bitmap.height}
        <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-3 @xl:p-4">
          <div class="flex flex-wrap items-center justify-center gap-2">
            <Segmented size="sm" label="View" options={VIEWS} bind:value={view} />
            <Segmented size="sm" label="Tool" options={TOOLS} bind:value={tool} />
          </div>
          <div class="grid min-h-0 place-items-center [container-type:size]">
            <div
              bind:this={overlay}
              class={[
                "checker relative touch-none overflow-hidden rounded-xs ring-1 ring-foreground/10 select-none",
                tool === Tool.SELECT ? "cursor-pointer" : tool === Tool.BOX ? "cursor-crosshair" : "cursor-none",
              ]}
              style:aspect-ratio="{width} / {height}"
              style:width="min(100cqw, calc(100cqh * {width / height}))"
              role="application"
              aria-label="Preview"
              onpointerdown={on_pointerdown}
              onpointermove={on_pointermove}
              onpointerleave={() => (cursor = null)}
              onlostpointercapture={on_lostpointercapture}
            >
              {#if preview}
                <canvas {@attach paint(preview)} class={["block size-full", view === View.DIFF && "opacity-35"]}></canvas>
              {/if}
              {#if heatmap}
                <canvas {@attach paint(heatmap)} class="pointer-events-none absolute inset-0 size-full"></canvas>
              {/if}
              {#if view !== View.RESULT}
                <canvas {@attach draw_mask} class="pointer-events-none absolute inset-0 size-full opacity-45"></canvas>
              {/if}
              {#each hatch as rect (`${rect.x},${rect.y}`)}
                <div
                  class="hatch pointer-events-none absolute"
                  style:left={percent(rect.x, width)}
                  style:top={percent(rect.y, height)}
                  style:width={percent(rect.width, width)}
                  style:height={percent(rect.height, height)}
                ></div>
              {/each}
              {#if view !== View.RESULT}
                {#each regions as region (`${region.x},${region.y},${region.width},${region.height}`)}
                  <div
                    class={["region pointer-events-none absolute", is_restored(ops, region) && "restored", hovered === region && "hovered"]}
                    style:left={percent(region.x, width)}
                    style:top={percent(region.y, height)}
                    style:width={percent(region.width, width)}
                    style:height={percent(region.height, height)}
                  ></div>
                {/each}
              {/if}
              {#if cursor && (tool === Tool.BRUSH || tool === Tool.ERASE)}
                <div
                  class="brush pointer-events-none absolute rounded-full"
                  style:left="{cursor.x}%"
                  style:top="{cursor.y}%"
                  style:width="{brush}px"
                  style:height="{brush}px"
                ></div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if edited}
      <StatusBar>
        <span>{edited.bitmap.width} × {edited.bitmap.height} px</span>
        {#if ready}
          <span>{too_many ? `${all_regions.length}+` : regions.length} {regions.length === 1 ? "change" : "changes"}</span>
          <span>{restored_count} restored</span>
          {#if hatch.length}<span class="ml-auto truncate">Hatched edges aren't in the original</span>{/if}
        {/if}
      </StatusBar>
    {/if}
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop the original, then the edited copy</span>
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

  .hatch {
    background: repeating-linear-gradient(
      -45deg,
      color-mix(in oklch, var(--foreground) 35%, transparent) 0 1.5px,
      color-mix(in oklch, var(--background-darkest) 45%, transparent) 1.5px 7px
    );
  }

  .region {
    outline: 1.5px dashed var(--primary);
    outline-offset: 1px;
  }

  .region.restored {
    outline-style: solid;
  }

  .region.hovered {
    outline: 2.5px solid var(--foreground);
  }

  .brush {
    translate: -50% -50%;
    box-shadow:
      0 0 0 1px var(--foreground),
      0 0 0 2px var(--background);
  }
</style>
