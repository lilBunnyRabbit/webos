<script lang="ts">
  import { pinch_view, zoom_view, type View } from "$kit/utils/view";
  import { untrack } from "svelte";
  import { Pick, type Editor } from "./editor.svelte";
  import { same_target, type Point, type Target } from "./model";
  import { orbit_by, type Orbit } from "./projection";
  import { into_view, label_center, LABEL_FONT } from "./scene";
  import { build_solid_scene, EdgeKind, FaceKind, hit_solid, type SolidEdge } from "./solid";

  interface Props {
    editor: Editor;
    orbit: Orbit;
    view: View;
    width: number;
    height: number;
    ontap: (target: Target | null) => void;
    onreset: () => void;
  }

  let { editor, orbit = $bindable(), view = $bindable(), width = $bindable(), height = $bindable(), ontap, onreset }: Props = $props();

  const scene = $derived(build_solid_scene(editor.sketch, orbit, view, editor.target));
  const picked_path = $derived(editor.selection?.kind === Pick.PATH ? editor.selection.id : null);

  let svg = $state<SVGSVGElement>();

  interface Gesture {
    id: number;
    start: Point;
    last: Point;
    touch: boolean;
    dragging: boolean;
    cancelled: boolean;
  }

  const DOUBLE_TAP_MS = 320;
  const DOUBLE_TAP_PX = 28;

  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let pinch: { view: View; mid: Point; distance: number } | null = null;
  let last_empty: { at: Point; time: number } | null = null;

  function local(event: PointerEvent | WheelEvent): Point {
    const box = svg!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    svg!.setPointerCapture(event.pointerId);
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pointers.size === 2) {
      if (gesture) gesture.cancelled = true;
      const [a, b] = [...pointers.values()];
      pinch = { view, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointers.size > 2) return;
    gesture = { id: event.pointerId, start: p, last: p, touch: event.pointerType !== "mouse", dragging: false, cancelled: false };
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      view = pinch_view(pinch.view, pinch.mid, pinch.distance, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y));
      return;
    }
    const current = gesture;
    if (!current || current.cancelled || current.id !== event.pointerId) return;
    if (!current.dragging) {
      if (Math.hypot(p.x - current.start.x, p.y - current.start.y) < (current.touch ? 9 : 4)) return;
      current.dragging = true;
    }
    orbit = orbit_by(orbit, p.x - current.last.x, p.y - current.last.y);
    current.last = p;
  }

  function on_pointerend(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) gesture = null;
      return;
    }
    const current = gesture;
    if (!current || current.id !== event.pointerId) return;
    gesture = null;
    if (current.cancelled || current.dragging) return;
    const target = hit_solid(scene, current.start, current.touch ? 22 : 10);
    if (target) {
      last_empty = null;
      ontap(target);
      return;
    }
    const now = performance.now();
    const twice = last_empty && now - last_empty.time < DOUBLE_TAP_MS && Math.hypot(current.start.x - last_empty.at.x, current.start.y - last_empty.at.y) < DOUBLE_TAP_PX;
    last_empty = twice ? null : { at: current.start, time: now };
    if (twice) onreset();
    else ontap(null);
  }

  function on_pointercancel(event: PointerEvent) {
    if (gesture?.id === event.pointerId) gesture.cancelled = true;
  }

  function wheel(node: SVGSVGElement) {
    const on_wheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = local(event);
      if (event.ctrlKey || event.metaKey) {
        view = zoom_view(view, Math.exp(-event.deltaY * 0.01), p.x, p.y);
        return;
      }
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      view = { ...view, offset_x: view.offset_x - dx, offset_y: view.offset_y - dy };
    };
    node.addEventListener("wheel", on_wheel, { passive: false });
    return () => node.removeEventListener("wheel", on_wheel);
  }

  $effect(() => {
    const target = editor.target;
    if (!target || !width || !height) return;
    untrack(() => {
      const at = label_center(scene.labels, target);
      if (!at) return;
      const shift = into_view(at, width, height);
      if (shift.x || shift.y) view = { ...view, offset_x: view.offset_x + shift.x, offset_y: view.offset_y + shift.y };
    });
  });

  function edge_class(edge: SolidEdge): string {
    if (same_target(edge.target, editor.target)) return "stroke-primary";
    if (edge.path === picked_path) return "stroke-primary/70";
    return edge.kind === EdgeKind.RISE ? "stroke-foreground/70" : "stroke-foreground";
  }

  function edge_width(edge: SolidEdge): number {
    if (same_target(edge.target, editor.target)) return 4;
    return edge.kind === EdgeKind.RISE ? 1.5 : 2.5;
  }

  const points = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(" ");
</script>

<div class="relative min-h-0 min-w-0 overflow-hidden" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svg}
    class="canvas absolute inset-0 size-full cursor-grab select-none active:cursor-grabbing"
    role="application"
    aria-label="Sketch in 3D"
    tabindex="-1"
    {@attach wheel}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointercancel={on_pointercancel}
    onlostpointercapture={on_pointerend}
  >
    {#each scene.faces as face, i (i)}
      <polygon
        points={points(face.points)}
        class={face.kind === FaceKind.FLOOR ? "fill-foreground/4" : "fill-foreground/7"}
      />
    {/each}

    {#each scene.dims as dim (dim.id)}
      {@const active = editor.target?.kind === "dim" && editor.target.id === dim.id}
      <g class={active ? "stroke-primary fill-primary" : "stroke-foreground/60 fill-foreground/60"}>
        <line x1={dim.a.x} y1={dim.a.y} x2={dim.b.x} y2={dim.b.y} stroke-width="1.25" />
        {#each dim.extensions as line, i (i)}
          <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} stroke-width="1.25" />
        {/each}
        {#each dim.arrows as arrow, i (i)}
          <polygon points={points(arrow)} stroke="none" />
        {/each}
      </g>
    {/each}

    {#each scene.edges as edge, i (i)}
      <line x1={edge.a.x} y1={edge.a.y} x2={edge.b.x} y2={edge.b.y} class={edge_class(edge)} stroke-width={edge_width(edge)} stroke-linecap="round" />
    {/each}

    {#each scene.handles as handle (handle.path)}
      {@const current = editor.target?.kind === "height" && editor.target.path === handle.path}
      <line x1={handle.foot.x} y1={handle.foot.y} x2={handle.tip.x} y2={handle.tip.y} class={current ? "stroke-primary" : "stroke-primary/60"} stroke-width="1.5" stroke-dasharray="3 3" />
      <circle cx={handle.foot.x} cy={handle.foot.y} r="3.5" class="fill-primary" />
    {/each}

    {#each scene.markers as marker (marker.id)}
      <circle cx={marker.at.x} cy={marker.at.y} r="6.5" class="fill-primary stroke-background" stroke-width="2" />
    {/each}

    {#each scene.labels as label (label.id)}
      {@const current = same_target(label.target, editor.target)}
      <g>
        <rect
          x={label.rect.x}
          y={label.rect.y}
          width={label.rect.w}
          height={label.rect.h}
          rx="4"
          class={current ? "fill-primary stroke-primary" : label.measured ? "fill-background-light stroke-foreground/15" : "fill-background-light stroke-primary/60"}
          stroke-dasharray={!label.measured && !current ? "3 2" : undefined}
        />
        <text
          x={label.rect.x + label.rect.w / 2}
          y={label.rect.y + label.rect.h / 2}
          dominant-baseline="central"
          text-anchor="middle"
          font-size={LABEL_FONT}
          class={["font-mono tabular-nums", current ? "fill-background font-bold" : label.measured ? "fill-foreground" : "fill-primary font-bold"]}
        >
          {label.text}
        </text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .canvas {
    touch-action: none;
    outline: none;
  }

  .canvas :global(rect),
  .canvas :global(polygon) {
    stroke-width: 1;
  }
</style>
