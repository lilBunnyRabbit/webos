<script lang="ts">
  import { place_glyph } from "./build";
  import { BOX, BOX_HEIGHT, BOX_WIDTH, clamp_nudge, DEFAULT_PRESSURE, type Glyph, type Metrics, type Stroke } from "./model";
  import { contours_path, glyph_contours, stroke_contours } from "./outline";
  import { guide_lines } from "./template";

  interface Props {
    char: string;
    glyph: Glyph;
    metrics: Metrics;
    show_guide: boolean;
    onstroke: (stroke: Stroke) => void;
    onnudge: (lsb: number, rsb: number) => void;
  }

  let { char, glyph, metrics, show_guide, onstroke, onnudge }: Props = $props();

  const PAD = 160;
  const uid = $props.id();

  let svg = $state<SVGSVGElement>();
  let live = $state.raw<Stroke | null>(null);
  let drawing_pointer = -1;
  let drag = $state.raw<{ pointer: number; side: "left" | "right"; lsb: number; rsb: number } | null>(null);

  const lsb = $derived(drag?.lsb ?? glyph.lsb ?? 0);
  const rsb = $derived(drag?.rsb ?? glyph.rsb ?? 0);
  const ink_path = $derived(contours_path(glyph_contours(glyph.strokes)));
  const live_path = $derived(live ? contours_path(stroke_contours(live)) : "");
  const placed = $derived(place_glyph({ strokes: glyph.strokes, lsb, rsb }, metrics.bearing));
  const edges = $derived(placed ? { left: -placed.offset, right: placed.advance - placed.offset } : null);
  const lines = $derived(guide_lines(metrics));
  const LINE_LABELS = ["base", "x", "cap", "desc"];

  function to_font(event: PointerEvent): { x: number; y: number } {
    const matrix = svg!.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.round(point.x * 10) / 10, y: Math.round(-point.y * 10) / 10 };
  }

  function point_of(event: PointerEvent): [number, number, number] {
    const { x, y } = to_font(event);
    const pressure = event.pointerType === "pen" && event.pressure > 0 ? event.pressure : DEFAULT_PRESSURE;
    return [x, y, Math.round(pressure * 100) / 100];
  }

  function start(event: PointerEvent) {
    if (drag || drawing_pointer >= 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    svg!.setPointerCapture(event.pointerId);
    drawing_pointer = event.pointerId;
    live = [point_of(event)];
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== drawing_pointer || !live) return;
    const events = event.getCoalescedEvents?.() ?? [];
    live = [...live, ...(events.length ? events : [event]).map(point_of)];
  }

  function end(event: PointerEvent) {
    if (event.pointerId !== drawing_pointer) return;
    drawing_pointer = -1;
    const stroke = live;
    live = null;
    if (stroke?.length) onstroke(stroke);
  }

  function grab(event: PointerEvent, side: "left" | "right") {
    if (drawing_pointer >= 0 || !edges) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, side, lsb, rsb };
  }

  function slide(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer || !placed || !edges) return;
    const { x } = to_font(event);
    if (drag.side === "left") drag = { ...drag, lsb: clamp_nudge(drag.lsb + (edges.left - x)) };
    else drag = { ...drag, rsb: clamp_nudge(drag.rsb + (x - edges.right)) };
  }

  function release(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const done = drag;
    drag = null;
    if (done.lsb !== (glyph.lsb ?? 0) || done.rsb !== (glyph.rsb ?? 0)) onnudge(done.lsb, done.rsb);
  }
</script>

<svg
  bind:this={svg}
  class="canvas size-full touch-none select-none"
  viewBox="{-PAD} {-BOX.top} {BOX_WIDTH + PAD * 2} {BOX_HEIGHT}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label="Drawing box for {char}"
  onpointerdown={start}
  onpointermove={move}
  onlostpointercapture={end}
>
  <defs>
    <filter id="invert-{uid}" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" />
    </filter>
    {#if glyph.guide}
      <mask id="guide-{uid}" maskUnits="userSpaceOnUse" x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT}>
        <image href={glyph.guide} x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT} preserveAspectRatio="none" filter="url(#invert-{uid})" />
      </mask>
    {/if}
  </defs>

  <rect x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT} class="fill-background-darker stroke-foreground/12" stroke-width="1" vector-effect="non-scaling-stroke" />

  {#if glyph.guide && show_guide}
    <rect x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT} class="fill-foreground" opacity="0.4" mask="url(#guide-{uid})" />
  {/if}

  {#if edges}
    <rect x={edges.left} y={-BOX.top} width={Math.max(0, edges.right - edges.left)} height={BOX_HEIGHT} class="fill-primary/6" />
  {/if}

  {#each lines as line, index (index)}
    <line
      x1={-PAD / 2}
      x2={BOX_WIDTH + PAD / 2}
      y1={-line.y}
      y2={-line.y}
      class={line.strong ? "stroke-foreground/45" : "stroke-foreground/22"}
      stroke-width={line.strong ? 1.5 : 1}
      stroke-dasharray={line.strong ? undefined : "6 5"}
      vector-effect="non-scaling-stroke"
    />
    <text x={BOX_WIDTH + PAD / 2} y={-line.y - 10} text-anchor="end" class="fill-foreground/45 font-mono" font-size="30">{LINE_LABELS[index]}</text>
  {/each}

  <g transform="scale(1 -1)">
    <path d={ink_path} class="fill-foreground" />
    {#if live_path}<path d={live_path} class="fill-primary" />{/if}
  </g>

  {#if edges}
    {#each [["left", edges.left], ["right", edges.right]] as const as [side, x] (side)}
      <g class="handle" class:active={drag?.side === side}>
        <line x1={x} x2={x} y1={-BOX.top} y2={-BOX.bottom} class="stroke-primary" stroke-width="1.5" stroke-dasharray="8 6" vector-effect="non-scaling-stroke" />
        <rect
          x={x - 40}
          y={-BOX.top}
          width="80"
          height={BOX_HEIGHT}
          fill="transparent"
          class="cursor-ew-resize"
          role="slider"
          tabindex="-1"
          aria-label="{side === 'left' ? 'Left' : 'Right'} edge"
          aria-valuenow={side === "left" ? lsb : rsb}
          onpointerdown={(event) => grab(event, side)}
          onpointermove={slide}
          onlostpointercapture={release}
        />
        <circle cx={x} cy={-BOX.bottom - 30} r="30" class="fill-primary pointer-events-none" />
      </g>
    {/each}
  {/if}
</svg>

<style>
  .canvas {
    cursor: crosshair;
  }

  .handle.active line {
    stroke-dasharray: none;
  }
</style>
