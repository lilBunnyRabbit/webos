<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { strokes_path, type StrokePoint } from "./stroke";

  let { strokes = $bindable([]), class: class_name }: { strokes?: StrokePoint[][]; class?: string } = $props();

  const WIDTH = 600;
  const HEIGHT = 220;
  const BASELINE = HEIGHT * 0.72;

  let svg = $state<SVGSVGElement | null>(null);
  let pointer: number | null = null;
  let current: StrokePoint[] = [];

  const d = $derived(strokes_path(strokes));

  function point(event: PointerEvent): StrokePoint {
    const rect = svg!.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
      t: event.timeStamp,
      pressure: event.pointerType === "pen" ? event.pressure : null,
    };
  }

  function on_down(event: PointerEvent) {
    if (event.button !== 0 || !svg) return;
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    current = [point(event)];
    strokes = [...strokes, current];
  }

  function on_move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    for (const sample of event.getCoalescedEvents?.() ?? [event]) current.push(point(sample));
    strokes = [...strokes.slice(0, -1), [...current]];
  }

  function on_end(event: PointerEvent) {
    if (event.pointerId === pointer) pointer = null;
  }
</script>

<svg
  bind:this={svg}
  viewBox="0 0 {WIDTH} {HEIGHT}"
  role="img"
  aria-label="Signature pad: draw with the mouse, a finger or a pen"
  class={cn("block aspect-[600/220] w-full cursor-crosshair touch-none select-none", class_name)}
  onpointerdown={on_down}
  onpointermove={on_move}
  onpointerup={on_end}
  onlostpointercapture={on_end}
>
  <line x1="40" x2={WIDTH - 40} y1={BASELINE} y2={BASELINE} class="stroke-foreground/20" stroke-width="1.5" stroke-dasharray="6 6" />
  <path d="M44 {BASELINE - 22}l14 14m0 -14l-14 14" class="stroke-foreground/35" stroke-width="2" stroke-linecap="round" fill="none" />
  <path {d} class="fill-foreground" />
</svg>
