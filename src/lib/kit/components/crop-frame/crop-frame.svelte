<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Bounds, Dimensions } from "$lib/core/utils/type";
  import { drag_rect, Handle, RESIZE_HANDLES } from "./crop-rect";

  interface Props {
    /** In image pixels. */
    rect: Bounds;
    /** The image's size in pixels. The frame fills its positioned parent, which shows the image at any scale. */
    bounds: Dimensions;
    /** Width / height to hold, `null` for free. */
    aspect?: number | null;
    label?: string;
    class?: string;
  }

  let { rect = $bindable(), bounds, aspect = null, label = "Crop area", class: class_name }: Props = $props();

  interface Drag {
    pointer_id: number;
    handle: Handle;
    start: Bounds;
    x: number;
    y: number;
    scale: number;
  }

  let root = $state<HTMLElement | null>(null);
  let box = $state<HTMLElement | null>(null);
  let drag: Drag | null = null;

  const percent = (value: number, total: number) => `${(value / total) * 100}%`;

  function start(event: PointerEvent, handle: Handle) {
    if (drag || !root || !box || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.preventDefault();
    box.setPointerCapture(event.pointerId);
    const scale = bounds.width / (root.getBoundingClientRect().width || 1);
    drag = { pointer_id: event.pointerId, handle, start: { ...rect }, x: event.clientX, y: event.clientY, scale };
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer_id) return;
    const { handle, start, x, y, scale } = drag;
    rect = drag_rect(start, handle, (event.clientX - x) * scale, (event.clientY - y) * scale, bounds, aspect);
  }

  function end(event: PointerEvent) {
    if (drag?.pointer_id === event.pointerId) drag = null;
  }

  const KEYS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  function on_keydown(event: KeyboardEvent) {
    const step = KEYS[event.key];
    if (!step) return;
    event.preventDefault();
    const distance = Math.max(1, Math.round(Math.max(bounds.width, bounds.height) / 50));
    const handle = event.shiftKey ? Handle.SE : Handle.MOVE;
    rect = drag_rect(rect, handle, step[0] * distance, step[1] * distance, bounds, aspect);
  }
</script>

<div bind:this={root} class={cn("pointer-events-none absolute inset-0", class_name)}>
  <div class="absolute inset-0 overflow-hidden">
    <div
      class="shade absolute"
      style:left={percent(rect.x, bounds.width)}
      style:top={percent(rect.y, bounds.height)}
      style:width={percent(rect.width, bounds.width)}
      style:height={percent(rect.height, bounds.height)}
    ></div>
  </div>
  <div
    bind:this={box}
    class="box pointer-events-auto absolute cursor-move focus-visible:outline-2"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuetext="{Math.round(rect.width)} × {Math.round(rect.height)} at {Math.round(rect.x)}, {Math.round(rect.y)}"
    aria-valuenow={Math.round(rect.x)}
    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
    style:left={percent(rect.x, bounds.width)}
    style:top={percent(rect.y, bounds.height)}
    style:width={percent(rect.width, bounds.width)}
    style:height={percent(rect.height, bounds.height)}
    onpointerdown={(event) => start(event, Handle.MOVE)}
    onpointermove={move}
    onlostpointercapture={end}
    onkeydown={on_keydown}
  >
    <span class="thirds pointer-events-none absolute inset-0"></span>
    {#each RESIZE_HANDLES as handle (handle)}
      <span class="handle" role="presentation" data-handle={handle} onpointerdown={(event) => start(event, handle)}></span>
    {/each}
  </div>
</div>

<style>
  .shade {
    box-shadow: 0 0 0 100vmax color-mix(in oklch, var(--background-darkest) 65%, transparent);
  }

  .box {
    container: crop-box / size;
    outline: 1px solid var(--primary);
    touch-action: none;
    --dot: 8px;
    --hit: 24px;
  }

  @media (pointer: coarse) {
    .box {
      --dot: 12px;
      --hit: 44px;
    }
  }

  .box:focus-visible {
    outline: 2px solid var(--primary);
  }

  .thirds {
    background:
      linear-gradient(to right, transparent calc(100% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(200% / 3 + 0.5px), transparent 0),
      linear-gradient(to bottom, transparent calc(100% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(100% / 3 + 0.5px), transparent 0 calc(200% / 3 - 0.5px), color-mix(in oklch, var(--foreground) 35%, transparent) 0 calc(200% / 3 + 0.5px), transparent 0);
  }

  .handle {
    position: absolute;
    width: var(--dot);
    height: var(--dot);
    translate: -50% -50%;
    background: var(--primary);
    box-shadow: 0 0 0 1px var(--background-darkest);
    touch-action: none;
  }

  .handle::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--hit);
    height: var(--hit);
    translate: -50% -50%;
  }

  .handle[data-handle="nw"] { left: 0; top: 0; cursor: nwse-resize; }
  .handle[data-handle="n"] { left: 50%; top: 0; cursor: ns-resize; }
  .handle[data-handle="ne"] { left: 100%; top: 0; cursor: nesw-resize; }
  .handle[data-handle="e"] { left: 100%; top: 50%; cursor: ew-resize; }
  .handle[data-handle="se"] { left: 100%; top: 100%; cursor: nwse-resize; }
  .handle[data-handle="s"] { left: 50%; top: 100%; cursor: ns-resize; }
  .handle[data-handle="sw"] { left: 0; top: 100%; cursor: nesw-resize; }
  .handle[data-handle="w"] { left: 0; top: 50%; cursor: ew-resize; }

  /* Below three hit areas a side, centred targets would cover the subject and leave nothing to move by: corners only, sitting and grabbing outside the box. */
  @container crop-box (width < 72px) or (height < 72px) {
    .thirds,
    .handle:is([data-handle="n"], [data-handle="e"], [data-handle="s"], [data-handle="w"]) {
      display: none;
    }

    .handle[data-handle="nw"] { translate: -100% -100%; }
    .handle[data-handle="ne"] { translate: 0 -100%; }
    .handle[data-handle="se"] { translate: 0 0; }
    .handle[data-handle="sw"] { translate: -100% 0; }
    .handle[data-handle="nw"]::before { translate: calc(-100% + var(--dot) / 2) calc(-100% + var(--dot) / 2); }
    .handle[data-handle="ne"]::before { translate: calc(var(--dot) / -2) calc(-100% + var(--dot) / 2); }
    .handle[data-handle="se"]::before { translate: calc(var(--dot) / -2) calc(var(--dot) / -2); }
    .handle[data-handle="sw"]::before { translate: calc(-100% + var(--dot) / 2) calc(var(--dot) / -2); }
  }

  @media (pointer: coarse) {
    @container crop-box (width < 132px) or (height < 132px) {
      .thirds,
      .handle:is([data-handle="n"], [data-handle="e"], [data-handle="s"], [data-handle="w"]) {
        display: none;
      }

      .handle[data-handle="nw"] { translate: -100% -100%; }
      .handle[data-handle="ne"] { translate: 0 -100%; }
      .handle[data-handle="se"] { translate: 0 0; }
      .handle[data-handle="sw"] { translate: -100% 0; }
      .handle[data-handle="nw"]::before { translate: calc(-100% + var(--dot) / 2) calc(-100% + var(--dot) / 2); }
      .handle[data-handle="ne"]::before { translate: calc(var(--dot) / -2) calc(-100% + var(--dot) / 2); }
      .handle[data-handle="se"]::before { translate: calc(var(--dot) / -2) calc(var(--dot) / -2); }
      .handle[data-handle="sw"]::before { translate: calc(-100% + var(--dot) / 2) calc(var(--dot) / -2); }
    }
  }
</style>
