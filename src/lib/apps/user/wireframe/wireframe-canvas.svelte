<script lang="ts" module>
  import type { Point } from "./projection";

  export type Hit = { kind: "point"; id: string } | { kind: "line"; id: string } | { kind: "origin" };

  export interface StrokeEvent {
    from: string | null;
    toward: Point;
    over: Hit | null;
    done: boolean;
  }
</script>

<script lang="ts">
  import { AXIS_STROKE, ink_css } from "./colors";
  import { Tool, type Editor } from "./editor.svelte";
  import { AXES, axis_vector, ORIGIN, type Vec3 } from "./model";
  import { orbit_by, projector, repivot, type Camera } from "./projection";
  import { build_scene, LABEL_FONT, zoom_at } from "./scene";

  interface Props {
    editor: Editor;
    camera: Camera;
    width: number;
    height: number;
    pivot: Vec3;
    ghost: { a: Vec3; b: Vec3; text: string } | null;
    guides: Vec3 | null;
    ontap: (hit: Hit | null, shift: boolean) => void;
    onstroke: (event: StrokeEvent) => void;
    onturn: () => void;
  }

  let {
    editor,
    camera = $bindable(),
    width = $bindable(),
    height = $bindable(),
    pivot,
    ghost,
    guides,
    ontap,
    onstroke,
    onturn,
  }: Props = $props();

  const scene = $derived(build_scene(editor.wire, camera, true));
  const project = $derived(projector(camera));
  const picked_lines = $derived(new Set(editor.selection.lines));
  const picked_points = $derived(new Set(editor.selection.points));
  const empty = $derived(!editor.wire.points.length);
  const origin = $derived(project.project(ORIGIN));

  const ghost_shown = $derived.by(() => {
    if (!ghost) return null;
    const a = project.project(ghost.a);
    const b = project.project(ghost.b);
    return { a, b, text: ghost.text, axis: editor.pending?.axis ?? null };
  });

  const guide_lines = $derived.by(() => {
    if (!guides) return [];
    const at = project.project(guides);
    return AXES.map((axis) => {
      const v = project.direction(axis_vector(axis));
      const length = Math.hypot(v.x, v.y);
      if (length < 1e-9) return null;
      const reach = Math.min(width, height) * 0.18;
      const ux = (v.x / length) * reach;
      const uy = (v.y / length) * reach;
      return { axis, a: { x: at.x - ux, y: at.y - uy }, b: { x: at.x + ux, y: at.y + uy } };
    }).filter((each) => each !== null);
  });

  let svg = $state<SVGSVGElement>();

  const Kind = { STROKE: "stroke", PAN: "pan", ORBIT: "orbit" } as const;
  type Kind = (typeof Kind)[keyof typeof Kind];

  interface Gesture {
    id: number;
    start: Point;
    last: Point;
    hit: Hit | null;
    kind: Kind | null;
    forced: Kind | null;
    slop: number;
    shift: boolean;
    cancelled: boolean;
  }

  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let pinch: { mid: Point; distance: number } | null = null;

  function local(event: PointerEvent | WheelEvent): Point {
    const box = svg!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function read_hit(target: EventTarget | null): Hit | null {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-hit]") : null;
    if (!element) return null;
    const { hit, id = "" } = element.dataset;
    if (hit === "point" || hit === "line") return { kind: hit, id };
    if (hit === "origin") return { kind: "origin" };
    return null;
  }

  function stroke_from(hit: Hit | null): string | null | undefined {
    if (editor.tool !== Tool.DRAW) return undefined;
    if (hit?.kind === "point") return hit.id;
    if (hit?.kind === "origin" && empty) return null;
    return undefined;
  }

  function begin_orbit() {
    camera = repivot(camera, pivot);
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button > 2) return;
    svg!.setPointerCapture(event.pointerId);
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pointers.size === 2) {
      if (gesture) {
        gesture.cancelled = true;
        if (gesture.kind === Kind.STROKE) editor.clear_length();
      }
      const [a, b] = [...pointers.values()];
      pinch = { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
      begin_orbit();
      return;
    }
    if (pointers.size > 2) return;
    const mouse = event.pointerType === "mouse";
    const forced = mouse && event.button !== 0 ? (event.shiftKey ? Kind.PAN : Kind.ORBIT) : null;
    gesture = {
      id: event.pointerId,
      start: p,
      last: p,
      hit: read_hit(event.target),
      kind: null,
      forced,
      slop: mouse ? 4 : 9,
      shift: event.shiftKey || event.ctrlKey || event.metaKey,
      cancelled: false,
    };
  }

  function on_pointermove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const turned = { ...camera, orbit: orbit_by(camera.orbit, mid.x - pinch.mid.x, mid.y - pinch.mid.y) };
      camera = { ...turned, view: zoom_at(turned.view, distance / Math.max(1, pinch.distance), mid.x, mid.y) };
      pinch = { mid, distance };
      onturn();
      return;
    }
    const current = gesture;
    if (!current || current.cancelled || current.id !== event.pointerId) return;
    if (!current.kind) {
      if (Math.hypot(p.x - current.start.x, p.y - current.start.y) < current.slop) return;
      const from = stroke_from(current.hit);
      current.kind = current.forced ?? (from !== undefined ? Kind.STROKE : Kind.PAN);
      if (current.kind === Kind.ORBIT) begin_orbit();
    }
    if (current.kind === Kind.PAN) {
      camera = {
        ...camera,
        view: { ...camera.view, offset_x: camera.view.offset_x + p.x - current.last.x, offset_y: camera.view.offset_y + p.y - current.last.y },
      };
    } else if (current.kind === Kind.ORBIT) {
      camera = { ...camera, orbit: orbit_by(camera.orbit, p.x - current.last.x, p.y - current.last.y) };
      onturn();
    } else {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      onstroke({
        from: stroke_from(current.hit) ?? null,
        toward: { x: p.x - current.start.x, y: p.y - current.start.y },
        over: read_hit(element),
        done: false,
      });
    }
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
    if (current.cancelled) return;
    if (!current.kind) {
      if (!current.forced) ontap(current.hit, current.shift);
      return;
    }
    if (current.kind === Kind.STROKE) {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      onstroke({
        from: stroke_from(current.hit) ?? null,
        toward: { x: current.last.x - current.start.x, y: current.last.y - current.start.y },
        over: read_hit(element),
        done: true,
      });
    }
  }

  function on_pointercancel(event: PointerEvent) {
    if (gesture?.id === event.pointerId) gesture.cancelled = true;
  }

  function wheel(node: SVGSVGElement) {
    const on_wheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = local(event);
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      camera = { ...camera, view: zoom_at(camera.view, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015)), p.x, p.y) };
    };
    node.addEventListener("wheel", on_wheel, { passive: false });
    return () => node.removeEventListener("wheel", on_wheel);
  }

  const from_id = $derived(editor.tool === Tool.DRAW ? editor.from : editor.slope_from);
</script>

<div class="relative min-h-0 min-w-0 overflow-hidden" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svg}
    class="canvas absolute inset-0 size-full select-none"
    role="application"
    aria-label="Wireframe"
    tabindex="-1"
    {@attach wheel}
    oncontextmenu={(event) => event.preventDefault()}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointercancel={on_pointercancel}
    onlostpointercapture={on_pointerend}
  >
    {#each guide_lines as guide (guide.axis)}
      <line x1={guide.a.x} y1={guide.a.y} x2={guide.b.x} y2={guide.b.y} class={[AXIS_STROKE[guide.axis], "opacity-40"]} stroke-width="1" stroke-dasharray="4 4" />
    {/each}

    {#if empty}
      <circle cx={origin.x} cy={origin.y} r="7" class="fill-none stroke-foreground/45" stroke-width="1.5" stroke-dasharray="2 2" />
      {#if editor.tool === Tool.DRAW}
        <circle cx={origin.x} cy={origin.y} r="4" class="fill-primary" />
      {/if}
      <circle cx={origin.x} cy={origin.y} r="20" class="hit-fill" data-hit="origin" />
    {/if}

    {#each scene.lines as line (line.id)}
      {#if picked_lines.has(line.id)}
        <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} class="stroke-primary/35" stroke-width="9" stroke-linecap="round" />
      {/if}
      <line
        x1={line.a.x}
        y1={line.a.y}
        x2={line.b.x}
        y2={line.b.y}
        style:stroke={ink_css(line.color)}
        stroke-width={picked_lines.has(line.id) ? 2.75 : 2}
        stroke-linecap="round"
      />
      <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} class="hit" stroke-width="16" data-hit="line" data-id={line.id} />
    {/each}

    {#if ghost_shown}
      <g class="pointer-events-none">
      <line
        x1={ghost_shown.a.x}
        y1={ghost_shown.a.y}
        x2={ghost_shown.b.x}
        y2={ghost_shown.b.y}
        class={ghost_shown.axis ? AXIS_STROKE[ghost_shown.axis] : "stroke-primary"}
        stroke-width="2.5"
        stroke-dasharray="6 4"
        stroke-linecap="round"
      />
      <circle cx={ghost_shown.b.x} cy={ghost_shown.b.y} r="4" class="fill-background stroke-primary" stroke-width="2" />
      {#if ghost_shown.text}
        <text x={ghost_shown.b.x + 10} y={ghost_shown.b.y - 10} font-size="13" class="fill-primary font-mono font-bold">{ghost_shown.text}</text>
      {/if}
      </g>
    {/if}

    {#each scene.points as point (point.id)}
      {@const active = picked_points.has(point.id) || point.id === from_id}
      {#if active}
        <circle cx={point.at.x} cy={point.at.y} r="9" class="fill-primary/20" />
      {/if}
      <circle cx={point.at.x} cy={point.at.y} r={active ? 4 : 3} class={active ? "fill-primary stroke-primary" : "fill-background stroke-foreground/80"} stroke-width="1.5" />
      <circle cx={point.at.x} cy={point.at.y} r="13" class="hit-fill" data-hit="point" data-id={point.id} />
    {/each}

    <g class="labels">
      {#each scene.labels as label (label.id)}
        {@const picked = picked_lines.has(label.id)}
        <g data-hit="line" data-id={label.id}>
          <rect x={label.rect.x} y={label.rect.y} width={label.rect.w} height={label.rect.h} rx="3" class={picked ? "fill-primary" : "fill-background-light/90 stroke-foreground/12"} />
          <text
            x={label.rect.x + label.rect.w / 2}
            y={label.rect.y + label.rect.h / 2}
            dominant-baseline="central"
            text-anchor="middle"
            font-size={LABEL_FONT}
            class={["font-mono tabular-nums", picked ? "fill-background font-bold" : "fill-foreground/90"]}>{label.text}</text
          >
        </g>
      {/each}
    </g>
  </svg>
</div>

<style>
  .canvas {
    touch-action: none;
    outline: none;
  }

  .hit {
    stroke: transparent;
    fill: none;
    pointer-events: stroke;
  }

  .hit-fill {
    fill: transparent;
    stroke: none;
  }

  .canvas :global(rect) {
    stroke-width: 1;
  }
</style>
