<script lang="ts" module>
  import type { Point, Target } from "./model";

  export type Hit =
    | { kind: "point"; id: string }
    | { kind: "edge"; path: string; index: number }
    | { kind: "label"; id: string }
    | { kind: "dim"; id: string }
    | { kind: "box"; id: string }
    | { kind: "note"; id: string }
    | { kind: "marker"; id: string }
    | { kind: "target"; target: Target };

  export interface TapEvent {
    hit: Hit | null;
    at: Point;
  }
</script>

<script lang="ts">
  import { pinch_view, to_image, zoom_view, type View } from "$kit/utils/view";
  import { untrack } from "svelte";
  import { Pick, Tool, type Editor } from "./editor.svelte";
  import { move_point, set_box, set_dim_offset, set_note } from "./edit";
  import { add, align, dot, sub } from "./geometry";
  import { same_target } from "./model";
  import { build_scene, label_center, LABEL_FONT, NOTE_FONT, type SceneLabel } from "./scene";

  interface Props {
    editor: Editor;
    view: View;
    width: number;
    height: number;
    ontap: (event: TapEvent) => void;
  }

  let { editor, view = $bindable(), width = $bindable(), height = $bindable(), ontap }: Props = $props();

  const scene = $derived(build_scene(editor.sketch, view));
  const labels = $derived(new Map(scene.labels.map((label) => [label.id, label])));
  const selection = $derived(editor.selection);
  const drawing_first = $derived.by(() => {
    const path = editor.sketch.paths.find((each) => each.id === editor.drawing);
    return path && path.points.length >= 3 ? path.points[0] : null;
  });

  let svg = $state<SVGSVGElement>();

  const DragKind = { POINT: "point", DIM: "dim", BOX: "box", NOTE: "note", PAN: "pan" } as const;
  type DragKind = (typeof DragKind)[keyof typeof DragKind];

  interface Gesture {
    id: number;
    start: Point;
    last: Point;
    hit: Hit | null;
    kind: DragKind | null;
    grab: Point;
    slop: number;
    cancelled: boolean;
  }

  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let pinch: { view: View; mid: Point; distance: number } | null = null;

  function local(event: PointerEvent | WheelEvent): Point {
    const box = svg!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function sketch_at(p: Point): Point {
    return to_image(view, p.x, p.y);
  }

  function read_hit(target: EventTarget | null): Hit | null {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-hit]") : null;
    if (!element) return null;
    const { hit, id = "", path = "", index = "0" } = element.dataset;
    if (hit === "edge") return { kind: "edge", path, index: Number(index) };
    if (hit === "point" || hit === "label" || hit === "dim" || hit === "box" || hit === "note" || hit === "marker") return { kind: hit, id };
    return null;
  }

  function resolve(hit: Hit | null): Hit | null {
    if (hit?.kind !== "label") return hit;
    const target = labels.get(hit.id)?.target;
    return target ? { kind: "target", target } : null;
  }

  function label_owner(label: SceneLabel | undefined): Hit | null {
    const target = label?.target;
    if (target?.kind === "dim") return { kind: "dim", id: target.id };
    if (target?.kind === "box") return { kind: "box", id: target.id };
    return null;
  }

  function drag_kind(hit: Hit | null): DragKind {
    const tool = editor.tool;
    if (!hit || tool === Tool.WALK) return DragKind.PAN;
    if (hit.kind === "point" && (tool === Tool.SELECT || tool === Tool.CORNERS)) return DragKind.POINT;
    if (tool !== Tool.SELECT) return DragKind.PAN;
    if (hit.kind === "marker") return DragKind.POINT;
    const owner = hit.kind === "label" ? label_owner(labels.get(hit.id)) : hit;
    if (owner?.kind === "dim") return DragKind.DIM;
    if (owner?.kind === "box") return DragKind.BOX;
    if (owner?.kind === "note") return DragKind.NOTE;
    return DragKind.PAN;
  }

  function point_of(hit: Hit): string | null {
    if (hit.kind === "point") return hit.id;
    if (hit.kind === "marker") return editor.sketch.markers.find((marker) => marker.id === hit.id)?.point ?? null;
    return null;
  }

  function neighbours(id: string): Point[] {
    const sketch = editor.committed;
    const out: Point[] = [];
    for (const path of sketch.paths) {
      const i = path.points.indexOf(id);
      if (i < 0) continue;
      const count = path.points.length;
      const around = [i - 1, i + 1].filter((j) => path.closed || (j >= 0 && j < count)).map((j) => path.points[(j + count) % count]);
      for (const other of around) {
        const point = sketch.points.find((each) => each.id === other);
        if (point && other !== id) out.push(point);
      }
    }
    return out;
  }

  function start_drag(current: Gesture): void {
    const kind = drag_kind(current.hit);
    current.kind = kind;
    const sketch = editor.committed;
    const at = sketch_at(current.start);
    const hit = current.hit!;
    if (kind === DragKind.POINT) {
      const point = sketch.points.find((each) => each.id === point_of(hit))!;
      current.grab = sub(point, at);
    } else if (kind === DragKind.BOX) {
      const id = hit.kind === "label" ? (label_owner(labels.get(hit.id)) as { id: string }).id : (hit as { id: string }).id;
      const box = sketch.boxes.find((each) => each.id === id)!;
      current.grab = sub(box, at);
    } else if (kind === DragKind.NOTE) {
      const note = sketch.notes.find((each) => each.id === (hit as { id: string }).id)!;
      current.grab = sub(note, at);
    }
  }

  function drag(current: Gesture, p: Point): void {
    const hit = current.hit;
    const sketch = editor.committed;
    const at = sketch_at(p);
    if (current.kind === DragKind.PAN) {
      view = { ...view, offset_x: view.offset_x + p.x - current.last.x, offset_y: view.offset_y + p.y - current.last.y };
      return;
    }
    if (!hit) return;
    if (current.kind === DragKind.POINT) {
      const id = point_of(hit)!;
      const target = align(add(at, current.grab), neighbours(id), 8 / view.scale);
      editor.preview = move_point(sketch, id, target);
    } else if (current.kind === DragKind.DIM) {
      const id = hit.kind === "label" ? (label_owner(labels.get(hit.id)) as { id: string }).id : (hit as { id: string }).id;
      const dim = sketch.dims.find((each) => each.id === id);
      const a = sketch.points.find((each) => each.id === dim?.a);
      const shown = scene.dims.find((each) => each.id === id);
      if (!dim || !a || !shown) return;
      const base = sub(p, { x: a.x * view.scale + view.offset_x, y: a.y * view.scale + view.offset_y });
      editor.preview = set_dim_offset(sketch, id, Math.round(dot(base, shown.normal) / view.scale));
    } else if (current.kind === DragKind.BOX) {
      const id = hit.kind === "label" ? (label_owner(labels.get(hit.id)) as { id: string }).id : (hit as { id: string }).id;
      const to = add(at, current.grab);
      editor.preview = set_box(sketch, id, { x: to.x, y: to.y });
    } else if (current.kind === DragKind.NOTE) {
      const to = add(at, current.grab);
      editor.preview = set_note(sketch, (hit as { id: string }).id, { x: to.x, y: to.y });
    }
  }

  function on_pointerdown(event: PointerEvent) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    svg!.setPointerCapture(event.pointerId);
    const p = local(event);
    pointers.set(event.pointerId, p);
    if (pointers.size === 2) {
      if (gesture) {
        gesture.cancelled = true;
        editor.preview = null;
      }
      const [a, b] = [...pointers.values()];
      pinch = { view, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (pointers.size > 2) return;
    const slop = event.pointerType === "mouse" ? 4 : 9;
    gesture = { id: event.pointerId, start: p, last: p, hit: read_hit(event.target), kind: null, grab: { x: 0, y: 0 }, slop, cancelled: false };
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
    if (!current.kind) {
      if (Math.hypot(p.x - current.start.x, p.y - current.start.y) < current.slop) return;
      start_drag(current);
    }
    drag(current, p);
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
    if (current.cancelled) {
      editor.preview = null;
      return;
    }
    if (!current.kind) {
      ontap({ hit: resolve(current.hit), at: sketch_at(current.start) });
      return;
    }
    const moved = editor.preview;
    if (moved) editor.apply(() => moved);
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
    if (!target) return;
    untrack(() => keep_visible(label_center(scene, target)));
  });

  $effect(() => {
    const from = editor.walk_from;
    if (!from) return;
    const point = editor.sketch.points.find((each) => each.id === from);
    if (point) untrack(() => keep_visible({ x: point.x * view.scale + view.offset_x, y: point.y * view.scale + view.offset_y }));
  });

  function keep_visible(at: Point | null): void {
    if (!at || !width || !height) return;
    const side = Math.min(56, width / 4);
    const top = Math.min(48, height / 4);
    const bottom = Math.min(150, height / 3);
    const dx = at.x < side ? side - at.x : at.x > width - side ? width - side - at.x : 0;
    const dy = at.y < top ? top - at.y : at.y > height - bottom ? height - bottom - at.y : 0;
    if (dx || dy) view = { ...view, offset_x: view.offset_x + dx, offset_y: view.offset_y + dy };
  }

  function is_target(label: SceneLabel): boolean {
    return same_target(label.target, editor.target);
  }

  function picked(kind: Pick, id: string): boolean {
    return selection?.kind === kind && selection.id === id;
  }
</script>

<div class="relative min-h-0 min-w-0 overflow-hidden" bind:clientWidth={width} bind:clientHeight={height}>
  <svg
    bind:this={svg}
    class="canvas absolute inset-0 size-full select-none"
    role="application"
    aria-label="Sketch"
    tabindex="-1"
    {@attach wheel}
    onpointerdown={on_pointerdown}
    onpointermove={on_pointermove}
    onpointercancel={on_pointercancel}
    onlostpointercapture={on_pointerend}
  >
    {#each scene.boxes as box (box.id)}
      {@const active = picked(Pick.BOX, box.id)}
      <g data-hit="box" data-id={box.id}>
        {#each box.faces as face, i (i)}
          <polygon points={face.map((p) => `${p.x},${p.y}`).join(" ")} class={active ? "fill-primary/10" : "fill-foreground/5"} />
        {/each}
        {#each box.hidden as line, i (i)}
          <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} class="stroke-foreground/45" stroke-width="1.25" stroke-dasharray="4 4" />
        {/each}
        {#each box.visible as line, i (i)}
          <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} class={active ? "stroke-primary" : "stroke-foreground"} stroke-width="2" stroke-linecap="round" />
        {/each}
      </g>
    {/each}

    {#each scene.dims as dim (dim.id)}
      {@const active = picked(Pick.DIM, dim.id) || (editor.target?.kind === "dim" && editor.target.id === dim.id)}
      <g data-hit="dim" data-id={dim.id} class={active ? "stroke-primary fill-primary" : "stroke-foreground/60 fill-foreground/60"}>
        <line x1={dim.a.x} y1={dim.a.y} x2={dim.b.x} y2={dim.b.y} stroke-width="1.25" />
        {#each dim.extensions as line, i (i)}
          <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} stroke-width="1.25" />
        {/each}
        {#each dim.arrows as arrow, i (i)}
          <polygon points={arrow.map((p) => `${p.x},${p.y}`).join(" ")} stroke="none" />
        {/each}
        <line x1={dim.a.x} y1={dim.a.y} x2={dim.b.x} y2={dim.b.y} class="hit" stroke-width="20" />
      </g>
    {/each}

    {#each scene.edges as edge (`${edge.path}:${edge.index}`)}
      {@const current = editor.target?.kind === "edge" && editor.target.path === edge.path && editor.target.index === edge.index}
      {@const active = picked(Pick.PATH, edge.path)}
      <line
        x1={edge.a.x}
        y1={edge.a.y}
        x2={edge.b.x}
        y2={edge.b.y}
        class={current ? "stroke-primary" : active ? "stroke-primary/70" : "stroke-foreground"}
        stroke-width={current ? 4.5 : 2.5}
        stroke-linecap="round"
      />
      <line x1={edge.a.x} y1={edge.a.y} x2={edge.b.x} y2={edge.b.y} class="hit" stroke-width="26" data-hit="edge" data-path={edge.path} data-index={edge.index} />
    {/each}

    {#each scene.notes as note (note.id)}
      {@const active = picked(Pick.NOTE, note.id)}
      <g data-hit="note" data-id={note.id}>
        <rect x={note.rect.x} y={note.rect.y} width={note.rect.w} height={note.rect.h} rx="4" class={active ? "fill-primary/15 stroke-primary" : "fill-background-light/80 stroke-foreground/15"} />
        {#each note.text.split("\n") as line, i (i)}
          <text x={note.rect.x + 6} y={note.rect.y + 5 + NOTE_FONT * (i + 1) * 1.1} font-size={NOTE_FONT} class="fill-foreground font-sans">{line}</text>
        {/each}
      </g>
    {/each}

    {#each scene.points as point (point.id)}
      {@const active = picked(Pick.POINT, point.id) || editor.walk_from === point.id || editor.dim_from === point.id}
      {#if point.id === drawing_first}
        <circle cx={point.at.x} cy={point.at.y} r="13" class="fill-primary/15 stroke-primary" stroke-width="1.5" />
      {/if}
      {#if active}
        <circle cx={point.at.x} cy={point.at.y} r="10" class="fill-primary/20" />
      {/if}
      <circle cx={point.at.x} cy={point.at.y} r="4" class={active ? "fill-primary stroke-primary" : "fill-background stroke-foreground"} stroke-width="2" />
      <circle cx={point.at.x} cy={point.at.y} r="16" class="hit-fill" data-hit="point" data-id={point.id} />
    {/each}

    {#each scene.markers as marker (marker.id)}
      {@const active = picked(Pick.MARKER, marker.id)}
      <g data-hit="marker" data-id={marker.id}>
        {#if active}<circle cx={marker.at.x} cy={marker.at.y} r="12" class="fill-primary/20" />{/if}
        <circle cx={marker.at.x} cy={marker.at.y} r="6.5" class="fill-primary stroke-background" stroke-width="2" />
        <circle cx={marker.at.x} cy={marker.at.y} r="16" class="hit-fill" />
      </g>
    {/each}

    {#each scene.labels as label (label.id)}
      {@const current = is_target(label)}
      {@const hit_id = label.kind === "marker" ? label.owner : label.id}
      <g data-hit={label.kind === "marker" ? "marker" : label.kind === "box-note" ? "box" : "label"} data-id={label.kind === "box-note" ? label.owner : hit_id}>
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
        <rect x={label.rect.x - 6} y={label.rect.y - 10} width={label.rect.w + 12} height={label.rect.h + 20} class="hit-fill" />
      </g>
    {/each}
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

  .canvas :global(rect),
  .canvas :global(polygon) {
    stroke-width: 1;
  }
</style>
