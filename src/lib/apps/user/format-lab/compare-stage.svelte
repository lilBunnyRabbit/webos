<script lang="ts">
  import { IconButton, Slider } from "$lib/core/components/ui";
  import { paint } from "$kit/utils/image";
  import { MagnifyingGlassMinus as MagnifyingGlassMinusIcon, MagnifyingGlassPlus as MagnifyingGlassPlusIcon } from "phosphor-svelte";
  import { pinch_view, zoom_view, type Point, type View as Camera } from "../image-tools/sprite-sheet";

  interface HeatmapLayer {
    canvas: OffscreenCanvas;
    /** Where the map sits over the image, in % of its size: the windows don't reach the right and bottom edge. */
    box: { left: number; top: number; width: number; height: number };
  }

  interface Props {
    left: ImageBitmap;
    right: ImageBitmap | null;
    left_label: string;
    right_label: string;
    heatmap: HeatmapLayer | null;
    split: number;
  }

  let { left, right, left_label, right_label, heatmap, split = $bindable() }: Props = $props();

  const MAX_ZOOM = 32;
  const ZOOM_STEP = 1.5;
  const FIT: Camera = { scale: 1, offset_x: 0, offset_y: 0 };

  let fit = $state<HTMLElement>();
  let layer = $state<HTMLElement>();
  let camera = $state.raw<Camera>(FIT);

  const width = $derived(left.width);
  const height = $derived(left.height);
  const pixelated = $derived(camera.scale > 2);

  function screen_point(event: { clientX: number; clientY: number }): Point {
    const box = fit?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : { x: 0, y: 0 };
  }

  function clamp_camera(next: Camera): Camera {
    if (!fit) return FIT;
    const { width: box_width, height: box_height } = fit.getBoundingClientRect();
    const scale = Math.min(MAX_ZOOM, Math.max(1, next.scale));
    return {
      scale,
      offset_x: Math.min(0, Math.max(box_width - box_width * scale, next.offset_x)),
      offset_y: Math.min(0, Math.max(box_height - box_height * scale, next.offset_y)),
    };
  }

  function zoom_by(factor: number) {
    if (!fit) return;
    const { width: box_width, height: box_height } = fit.getBoundingClientRect();
    camera = clamp_camera(zoom_view(camera, factor, box_width / 2, box_height / 2));
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
    if (!layer) return;
    const box = layer.getBoundingClientRect();
    split = Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100));
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
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
    // At fit there's nothing to pan, so a drag anywhere moves the divider; zoomed in, only the handle does.
    const on_handle = event.target instanceof Element && event.target.closest("[data-wipe]");
    if (event.button === 0 && right && (on_handle || camera.scale === 1)) {
      wiping = true;
      wipe_to(event);
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
</script>

<div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2 @xl:gap-3 @xl:p-4">
  <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
    {#if right}
      <Slider size="sm" min={0} max={100} step={0.5} bind:value={split} class="w-36 pointer-coarse:h-11" aria-label="Divider position" />
    {/if}
    <div class="flex items-center gap-1">
      <IconButton label="Zoom out" size="sm" disabled={camera.scale <= 1} onclick={() => zoom_by(1 / ZOOM_STEP)} class="pointer-coarse:size-11">
        <MagnifyingGlassMinusIcon weight="bold" />
      </IconButton>
      <button
        type="button"
        class="h-7 min-w-11 rounded-md font-mono text-2xs text-foreground/80 tabular-nums hover:bg-foreground/6 pointer-coarse:h-11"
        title="Fit"
        onclick={() => (camera = FIT)}>{Math.round(camera.scale * 100)}%</button
      >
      <IconButton label="Zoom in" size="sm" disabled={camera.scale >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)} class="pointer-coarse:size-11">
        <MagnifyingGlassPlusIcon weight="bold" />
      </IconButton>
    </div>
  </div>
  <div
    class="grid min-h-0 touch-none place-items-center overflow-hidden select-none [container-type:size]"
    role="application"
    aria-label="Comparison. Drag to move the divider, pinch or Ctrl+scroll to zoom, drag to pan when zoomed in."
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointerup={on_pointerend}
    onpointercancel={on_pointerend}
    {@attach wheel}
  >
    <div bind:this={fit} class="relative" style:aspect-ratio="{width} / {height}" style:width="min(100cqw, calc(100cqh * {width / height}))">
      <div
        bind:this={layer}
        class="checker absolute inset-0 origin-top-left rounded-xs ring-1 ring-foreground/10"
        style:transform="translate({camera.offset_x}px, {camera.offset_y}px) scale({camera.scale})"
        style:--zoom={camera.scale}
      >
        <canvas {@attach paint(left)} class={["block size-full", pixelated && "[image-rendering:pixelated]"]}></canvas>
        {#if right}
          <div class="pointer-events-none absolute inset-0" style:clip-path="inset(0 0 0 {split}%)">
            <canvas {@attach paint(right)} class={["block size-full", pixelated && "[image-rendering:pixelated]"]}></canvas>
            {#if heatmap}
              <canvas
                {@attach paint(heatmap.canvas)}
                class="absolute"
                style:left="{heatmap.box.left}%"
                style:top="{heatmap.box.top}%"
                style:width="{heatmap.box.width}%"
                style:height="{heatmap.box.height}%"
              ></canvas>
            {/if}
          </div>
          <div data-wipe class="wipe absolute inset-y-0 cursor-ew-resize" style:left="{split}%">
            <div class="grip absolute top-1/2 left-1/2 rounded-full"></div>
          </div>
        {/if}
      </div>
      {#if right}
        <span class="pointer-events-none absolute top-2 left-2 rounded-sm bg-background-light/85 px-2 py-0.5 text-2xs font-medium">{left_label}</span>
        <span class="pointer-events-none absolute top-2 right-2 rounded-sm bg-background-light/85 px-2 py-0.5 text-2xs font-medium">{right_label}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }

  /* Inside the zoomed layer: divided by the zoom so the line and handle keep their screen size. */
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

    .grip {
      width: calc(28px / var(--zoom));
      height: calc(44px / var(--zoom));
    }
  }
</style>
