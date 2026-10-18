<script lang="ts" module>
  export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }
</script>

<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CornersIn as CornersInIcon } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import type { Point } from "../engine/step";

  let {
    bounds,
    label,
    pannable = true,
    class: class_name,
    children,
  }: {
    bounds: Bounds;
    label: string;
    pannable?: boolean | ((event: PointerEvent) => boolean);
    class?: string;
    children: Snippet<[(event: { clientX: number; clientY: number }) => Point]>;
  } = $props();

  let svg = $state<SVGSVGElement>();
  let zoom = $state(1);
  let offset = $state({ x: 0, y: 0 });
  const moved = $derived(zoom !== 1 || offset.x !== 0 || offset.y !== 0);

  const MAX_SCALE = 1.3;
  let client = $state({ width: 0, height: 0 });

  const framed = $derived({
    x: bounds.x - Math.max(0, client.width / MAX_SCALE - bounds.width) / 2,
    y: bounds.y - Math.max(0, client.height / MAX_SCALE - bounds.height) / 2,
    width: Math.max(bounds.width, client.width / MAX_SCALE),
    height: Math.max(bounds.height, client.height / MAX_SCALE),
  });

  const box = $derived.by(() => {
    const width = framed.width / zoom;
    const height = framed.height / zoom;
    const cx = framed.x + framed.width / 2 + offset.x;
    const cy = framed.y + framed.height / 2 + offset.y;
    return { x: cx - width / 2, y: cy - height / 2, width, height };
  });

  function to_point(event: { clientX: number; clientY: number }): Point {
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function zoom_at(factor: number, at: Point) {
    const next = Math.min(8, Math.max(0.5, zoom * factor));
    const applied = next / zoom;
    const cx = framed.x + framed.width / 2 + offset.x;
    const cy = framed.y + framed.height / 2 + offset.y;
    offset = { x: offset.x + (at.x - cx) * (1 - 1 / applied), y: offset.y + (at.y - cy) * (1 - 1 / applied) };
    zoom = next;
  }

  function onwheel(event: WheelEvent) {
    event.preventDefault();
    zoom_at(Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002)), to_point(event));
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  let press: { x: number; y: number } | null = null;

  function onpointerdown(event: PointerEvent) {
    const allowed = typeof pannable === "function" ? pannable(event) : pannable;
    if (!allowed && pointers.size === 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) press = { x: event.clientX, y: event.clientY };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      press = null;
      svg?.setPointerCapture(event.pointerId);
    }
  }

  function onpointermove(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last || !svg) return;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
      press = null;
      svg.setPointerCapture(event.pointerId);
    }
    if (press) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    if (pointers.size === 1) {
      offset = { x: offset.x - (event.clientX - last.x) / matrix.a, y: offset.y - (event.clientY - last.y) / matrix.d };
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoom_at(distance / pinch, to_point({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }));
      pinch = distance;
    }
  }

  function onpointerup(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0) press = null;
  }

  function fit() {
    zoom = 1;
    offset = { x: 0, y: 0 };
  }
</script>

<div class={cn("relative min-h-0 min-w-0", class_name)} bind:clientWidth={client.width} bind:clientHeight={client.height}>
  <svg
    bind:this={svg}
    role="img"
    aria-label={label}
    viewBox="{box.x} {box.y} {Math.max(1, box.width)} {Math.max(1, box.height)}"
    preserveAspectRatio="xMidYMid meet"
    class="size-full touch-none select-none"
    {onwheel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    onlostpointercapture={onpointerup}
  >
    {@render children(to_point)}
  </svg>
  {#if moved}
    <IconButton label="Fit to view" size="sm" class="absolute top-1 right-1 bg-background-light/90 shadow-raised" onclick={fit}>
      <CornersInIcon weight="bold" />
    </IconButton>
  {/if}
</div>
