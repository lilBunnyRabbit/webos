<script lang="ts">
  import kernel, { type DialogsService, type SettingsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { resolve_token } from "$lib/core/utils";
  import {
    FolderOpen as FolderOpenIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    SquareHalf as SquareHalfIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { has_files, image_files, paint } from "$kit/utils/image";
  import { changed_percent, tolerance_level } from "./compare";
  import { ImagePair, Slot } from "./pair.svelte";
  import PairAlignment from "./pair-alignment.svelte";
  import PairSlot from "./pair-slot.svelte";
  import { draw_aligned, draw_heatmap, type Rect } from "./patch";
  import type { SectionProps } from "./sections";
  import { pinch_view, zoom_view, type Point, type View as Camera } from "./sprite-sheet";

  const View = { WIPE: "wipe", ONION: "onion", DIFF: "diff" } as const;
  type View = (typeof View)[keyof typeof View];

  const Panel = { IMAGES: "images", ALIGN: "align", CHANGES: "changes" } as const;
  type Panel = (typeof Panel)[keyof typeof Panel];

  const PANELS = [
    { value: Panel.IMAGES, label: "Images" },
    { value: Panel.ALIGN, label: "Align" },
    { value: Panel.CHANGES, label: "Changes" },
  ];
  const VIEWS = [
    { value: View.WIPE, label: "Wipe" },
    { value: View.ONION, label: "Onion" },
    { value: View.DIFF, label: "Diff" },
  ];
  const PREVIEW_SIDE = 1600;
  const MAX_REGIONS = 80;
  const MAX_ZOOM = 32;
  const ZOOM_STEP = 1.5;
  const FIT: Camera = { scale: 1, offset_x: 0, offset_y: 0 };

  const { picker, initial_paths, active }: SectionProps = $props();
  const { app_id, window_id, window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const settings = $derived(kernel.service<SettingsService>("settings"));

  let root = $state<HTMLElement>();
  let dragging = $state(false);
  let view = $state<View>(View.WIPE);
  let wipe = $state(50);
  let onion = $state(50);
  let hovered = $state.raw<Rect | null>(null);
  let primary = $state<string | null>(null);
  let overlay = $state<HTMLElement>();
  let fit = $state<HTMLElement>();
  let camera = $state.raw<Camera>(FIT);
  let panel = $state<Panel>(Panel.IMAGES);

  const pair = new ImagePair({
    app_id,
    win,
    titles: { original: "Open the before image", edited: "Open the after image" },
    on_load: (slot) => {
      if (slot === Slot.EDITED) camera = FIT;
    },
    on_aligned: () => {
      if (panel === Panel.IMAGES) panel = Panel.CHANGES;
    },
  });

  const before = $derived(pair.original);
  const after = $derived(pair.edited);
  const ready = $derived(pair.ready);
  const too_many = $derived(pair.regions.length > MAX_REGIONS);
  const regions = $derived(too_many ? [] : pair.regions);
  const changed = $derived(pair.comparison ? changed_percent(pair.comparison.diff, tolerance_level(pair.tolerance), pair.covered) : null);

  const preview_scale = $derived(after ? Math.min(1, PREVIEW_SIDE / Math.max(after.bitmap.width, after.bitmap.height)) : 1);
  const aligned = $derived(ready ? draw_aligned(ready.original.bitmap, ready.edited.bitmap, ready.alignment, preview_scale) : null);
  const heatmap = $derived(view === View.DIFF && pair.comparison && primary ? draw_heatmap(pair.comparison.diff, primary) : null);

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!root) return;
    const probe = root;
    const frame = requestAnimationFrame(() => (primary = resolve_token(probe, "var(--primary)")));
    return () => cancelAnimationFrame(frame);
  });

  onDestroy(() => pair.destroy());

  pair.load_paths(untrack(() => initial_paths));

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const files = image_files(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    pair.take(files);
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
    pair.take(image_files(event.dataTransfer));
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

  function focus(rect: Rect) {
    if (!fit || !after) return;
    const { width, height } = fit.getBoundingClientRect();
    const base = width / after.bitmap.width;
    const scale = Math.min(MAX_ZOOM, Math.max(1, 0.8 * Math.min(width / (rect.width * base), height / (rect.height * base))));
    const center = { x: (rect.x + rect.width / 2) * base, y: (rect.y + rect.height / 2) * base };
    camera = clamp_camera({ scale, offset_x: width / 2 - center.x * scale, offset_y: height / 2 - center.y * scale });
  }

  const pointers = new Map<number, Point>();
  let pinch: { camera: Camera; mid: Point; distance: number } | null = null;
  let pan: { start: Point; camera: Camera } | null = null;
  let wiping = false;
  /** The touch already pinched: its remaining fingers don't pan or wipe until all lift. */
  let spent = false;

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...pointers.values()];
    return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  function wipe_to(event: PointerEvent) {
    if (!overlay) return;
    const box = overlay.getBoundingClientRect();
    wipe = Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100));
  }

  function on_pointerdown(event: PointerEvent) {
    if (!ready || (event.button !== 0 && event.button !== 1)) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pointers.size === 2 && event.pointerType !== "mouse") {
      pan = null;
      wiping = false;
      spent = true;
      pinch = { camera, ...spread() };
      return;
    }
    if (pointers.size > 1 || spent) return;
    if (view === View.WIPE && event.button === 0 && event.target instanceof Element && event.target.closest("[data-wipe]")) {
      wiping = true;
      return;
    }
    pan = { start: screen, camera };
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const screen = screen_point(event);
    pointers.set(event.pointerId, screen);
    if (pinch) {
      if (pointers.size < 2) return;
      const { mid, distance } = spread();
      camera = clamp_camera(pinch_view(pinch.camera, pinch.mid, pinch.distance, mid, distance));
      return;
    }
    if (wiping) {
      wipe_to(event);
      return;
    }
    if (pan) {
      camera = clamp_camera({
        scale: pan.camera.scale,
        offset_x: pan.camera.offset_x + screen.x - pan.start.x,
        offset_y: pan.camera.offset_y + screen.y - pan.start.y,
      });
    }
  }

  function on_pointerend(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch && pointers.size < 2) pinch = null;
    pan = null;
    wiping = false;
    if (!pointers.size) spent = false;
  }

  // Wheel listeners must be non-passive to stop the page from scrolling.
  function wheel(element: HTMLElement) {
    const on_wheel = (event: WheelEvent) => {
      if (!ready) return;
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

  function signed(value: number): string {
    return value < 0 ? `−${Math.abs(value)}` : `${value}`;
  }

  function percent(value: number, total: number): string {
    return `${(value / total) * 100}%`;
  }
</script>

<svelte:document onpaste={on_paste} />

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet stat(label: string, value: string)}
  <div class="flex flex-col gap-0.5 rounded-md bg-foreground/4 px-2 py-1.5">
    <dt class="text-2xs text-foreground/65">{label}</dt>
    <dd class="font-mono text-ui tabular-nums">{value}</dd>
  </div>
{/snippet}

<div
  bind:this={root}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto]"
  role="region"
  aria-label="Compare"
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    {@render picker()}
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{after?.name ?? before?.name ?? ""}</span>
  </Toolbar>

  {#if !before && !after && !pair.loading.original && !pair.loading.edited}
    <EmptyState
      icon={SquareHalfIcon}
      title="No images yet"
      description="Lays two versions of a picture over each other: wipe between them, fade one into the other, or see what changed. Open the before and the after, or drop both here."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={() => pair.pick(Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open the before…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] @2xl:grid-cols-[17rem_minmax(0,1fr)] @2xl:grid-rows-[minmax(0,1fr)]">
      <aside
        class="order-2 flex max-h-64 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:order-none @2xl:max-h-none @2xl:border-t-0 @2xl:border-r"
      >
        {#if before && after}
          <Segmented label="Settings" options={PANELS} bind:value={panel} class="sticky top-0 z-10 w-full shrink-0 *:flex-1 @2xl:hidden" />
        {/if}
        <div class={["flex flex-col gap-0.5", before && after && panel !== Panel.IMAGES && "hidden @2xl:flex"]}>
          {@render heading("Images")}
          <PairSlot {pair} slot={Slot.ORIGINAL} label="Before" />
          <PairSlot {pair} slot={Slot.EDITED} label="After" />
        </div>

        {#if before && after}
          <div class={["flex flex-col gap-2", panel !== Panel.ALIGN && "hidden @2xl:flex"]}>
            <PairAlignment {pair} rough="Rough match, check the Onion view" />
          </div>

          <div class={["flex flex-col gap-2", panel !== Panel.CHANGES && "hidden @2xl:flex"]}>
            {@render heading("Changes")}
            {#if ready && changed !== null}
              <dl class="grid grid-cols-2 gap-1.5">
                {@render stat("Changed", `${changed}%`)}
                {@render stat("Regions", too_many ? `${pair.regions.length}+` : `${regions.length}`)}
                {@render stat("Offset", `${signed(ready.alignment.dx)}, ${signed(ready.alignment.dy)}`)}
                {@render stat("Scale", `${ready.alignment.scale}`)}
              </dl>
            {/if}
            <label class="flex items-center gap-2 text-ui" title="How different a pixel must be to count as changed">
              <span class="w-20 shrink-0">Tolerance</span>
              <Slider size="sm" min={1} max={60} bind:value={pair.tolerance} class="min-w-0 flex-1" aria-label="Tolerance" />
              <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{pair.tolerance}%</span>
            </label>
            <label class="flex items-center justify-between gap-2 text-ui" title="Ignore a colour change across the whole picture">
              Match colours
              <Switch bind:checked={pair.match_colors} />
            </label>
            {#if too_many}
              <p class="px-0.5 text-2xs text-warning">{pair.regions.length} changed spots. Raise the tolerance to see them as boxes.</p>
            {:else if !regions.length}
              <p class="px-0.5 text-2xs text-foreground/65">No changes above the tolerance.</p>
            {:else}
              <ul class="flex flex-col gap-0.5">
                {#each regions as region, index (`${region.x},${region.y},${region.width},${region.height}`)}
                  <li
                    class="flex h-8 items-center gap-2 rounded-md pl-2 hover:bg-foreground/6 pointer-coarse:h-10"
                    onpointerenter={() => (hovered = region)}
                    onpointerleave={() => (hovered = null)}
                  >
                    <span class="w-5 shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
                    <span class="min-w-0 flex-1 truncate font-mono text-2xs tabular-nums">{region.width}×{region.height} at {region.x}, {region.y}</span>
                    <IconButton label="Zoom to change {index + 1}" size="sm" variant="quiet" onclick={() => focus(region)}><MagnifyingGlassIcon weight="bold" /></IconButton>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
      </aside>

      {#if !after || !before}
        <div class="stage grid min-h-0 place-items-center">
          {#if pair.loading.original || pair.loading.edited}
            <Spinner label="Loading image" />
          {:else}
            <EmptyState
              icon={SquareHalfIcon}
              title={before ? "Now the after image" : "Now the before image"}
              description={before ? "The version to hold up against the first." : "The version to compare against."}
            >
              {#snippet actions()}
                <Button variant="primary" onclick={() => pair.pick(before ? Slot.EDITED : Slot.ORIGINAL)}><FolderOpenIcon weight="bold" /> Open…</Button>
              {/snippet}
            </EmptyState>
          {/if}
        </div>
      {:else}
        {@const width = after.bitmap.width}
        {@const height = after.bitmap.height}
        <div class="stage grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 @xl:gap-3 @xl:p-4">
          <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            <Segmented size="sm" label="View" options={VIEWS} bind:value={view} />
            {#if view === View.WIPE}
              <Slider size="sm" min={0} max={100} step={0.5} bind:value={wipe} class="w-28" aria-label="Divider position" />
            {:else if view === View.ONION}
              <Slider size="sm" min={0} max={100} bind:value={onion} class="w-28" aria-label="Before opacity" />
            {/if}
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
            class="grid min-h-0 cursor-grab touch-none place-items-center overflow-hidden select-none [container-type:size]"
            role="application"
            aria-label="Preview. Pinch or Ctrl+scroll to zoom, scroll or drag to pan."
            onpointerdown={on_pointerdown}
            onpointermove={on_pointermove}
            onpointerup={on_pointerend}
            onpointercancel={on_pointerend}
            {@attach wheel}
          >
            <div
              bind:this={fit}
              class="relative"
              style:aspect-ratio="{width} / {height}"
              style:width="min(100cqw, calc(100cqh * {width / height}))"
            >
              <div
                bind:this={overlay}
                class="checker absolute inset-0 origin-top-left rounded-xs ring-1 ring-foreground/10"
                style:transform="translate({camera.offset_x}px, {camera.offset_y}px) scale({camera.scale})"
                style:--zoom={camera.scale}
              >
                <canvas {@attach paint(after.bitmap)} class={["block size-full", view === View.DIFF && "opacity-35", camera.scale > 2 && "[image-rendering:pixelated]"]}></canvas>
                {#if aligned && view !== View.DIFF}
                  <canvas
                    {@attach paint(aligned)}
                    class={["pointer-events-none absolute inset-0 size-full", camera.scale > 2 && "[image-rendering:pixelated]"]}
                    style:clip-path={view === View.WIPE ? `inset(0 ${100 - wipe}% 0 0)` : undefined}
                    style:opacity={view === View.ONION ? onion / 100 : undefined}
                  ></canvas>
                {/if}
                {#if heatmap}
                  <canvas {@attach paint(heatmap)} class="pointer-events-none absolute inset-0 size-full"></canvas>
                  {#each pair.uncovered as rect (`${rect.x},${rect.y}`)}
                    <div
                      class="hatch pointer-events-none absolute"
                      style:left={percent(rect.x, width)}
                      style:top={percent(rect.y, height)}
                      style:width={percent(rect.width, width)}
                      style:height={percent(rect.height, height)}
                    ></div>
                  {/each}
                  {#each regions as region (`${region.x},${region.y},${region.width},${region.height}`)}
                    <div
                      class={["region pointer-events-none absolute", hovered === region && "hovered"]}
                      style:left={percent(region.x, width)}
                      style:top={percent(region.y, height)}
                      style:width={percent(region.width, width)}
                      style:height={percent(region.height, height)}
                    ></div>
                  {/each}
                {/if}
                {#if ready && view === View.WIPE}
                  <div data-wipe class="wipe absolute inset-y-0 cursor-ew-resize" style:left="{wipe}%">
                    <div class="grip absolute top-1/2 left-1/2 rounded-full"></div>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if after}
      <StatusBar>
        <span>{after.bitmap.width} × {after.bitmap.height} px</span>
        {#if ready && changed !== null}
          <span>{changed}% changed</span>
          <span>{too_many ? `${pair.regions.length}+` : regions.length} {regions.length === 1 ? "region" : "regions"}</span>
          <span class="ml-auto hidden truncate pointer-coarse:inline">Pinch to zoom</span>
        {/if}
      </StatusBar>
    {/if}
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop the before, then the after</span>
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

  /* Inside the zoomed layer: divided by the zoom so lines and handles keep their screen size. */
  .region {
    outline: calc(1.5px / var(--zoom)) dashed var(--primary);
    outline-offset: calc(1px / var(--zoom));
  }

  .region.hovered {
    outline: calc(2.5px / var(--zoom)) solid var(--foreground);
  }

  .wipe {
    width: calc(24px / var(--zoom));
    translate: -50% 0;
    background: linear-gradient(var(--background), var(--background)) center / calc(3px / var(--zoom)) 100% no-repeat;
  }

  .wipe::after {
    content: "";
    position: absolute;
    inset-block: 0;
    left: 50%;
    width: calc(1px / var(--zoom));
    translate: -50% 0;
    background: var(--foreground);
  }

  .grip {
    width: calc(20px / var(--zoom));
    height: calc(32px / var(--zoom));
    translate: -50% -50%;
    background: var(--background-light);
    box-shadow:
      0 0 0 calc(1px / var(--zoom)) var(--foreground),
      0 0 0 calc(2px / var(--zoom)) var(--background);
    z-index: 1;
  }

  @media (pointer: coarse) {
    .wipe {
      width: calc(44px / var(--zoom));
    }
  }
</style>
