<script lang="ts">
  import kernel, { type SettingsService } from "$lib/core/api";
  import { cn, resolve_token } from "$lib/core/utils";
  import { BOARD, LINE, to_board, type Point, type Stroke } from "./ink";
  import { draw_strokes, segment } from "./snapshot";

  let {
    strokes,
    enabled = false,
    class: class_name,
    onpen,
    onstroke,
  }: {
    strokes: readonly Stroke[];
    enabled?: boolean;
    class?: string;
    onpen?: (down: boolean) => void;
    onstroke?: (stroke: Stroke) => void;
  } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  let canvas: HTMLCanvasElement | undefined = $state();
  let size = $state({ width: 0, dpr: 1 });
  let ink = $state("");
  let live: { pointer_id: number; points: Point[] } | null = null;

  const scale = $derived((size.width * size.dpr) / BOARD);

  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      size = { width: entry.contentBoxSize[0].inlineSize, dpr: window.devicePixelRatio };
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  // A frame later, so the settings service has already written the new theme's variables.
  $effect(() => {
    Object.values(settings.theme);
    if (!canvas) return;
    const probe = canvas;
    const frame = requestAnimationFrame(() => (ink = resolve_token(probe, "var(--foreground)")));
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (!canvas || !ink || !size.width) return;
    const pixels = Math.round(size.width * size.dpr);
    if (canvas.width !== pixels) canvas.width = canvas.height = pixels;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw_strokes(ctx, live ? [...strokes, live.points] : strokes, scale, ink);
  });

  function point_of(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    return to_board({ x: event.clientX, y: event.clientY }, rect);
  }

  function paint(from: Point, to: Point) {
    const ctx = canvas!.getContext("2d")!;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = ink;
    ctx.lineWidth = LINE;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    segment(ctx, from, to);
    ctx.restore();
  }

  function on_pointerdown(event: PointerEvent) {
    if (!enabled || live || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    canvas!.setPointerCapture(event.pointerId);
    const point = point_of(event);
    live = { pointer_id: event.pointerId, points: [point] };
    paint(point, point);
    onpen?.(true);
  }

  function on_pointermove(event: PointerEvent) {
    if (!live || event.pointerId !== live.pointer_id) return;
    const samples = event.getCoalescedEvents();
    for (const sample of samples.length ? samples : [event]) {
      const point = point_of(sample);
      const last = live.points[live.points.length - 1];
      if (point.x === last.x && point.y === last.y) continue;
      paint(last, point);
      live.points.push(point);
    }
  }

  function on_lostpointercapture(event: PointerEvent) {
    if (!live || event.pointerId !== live.pointer_id) return;
    const stroke = live.points;
    live = null;
    onpen?.(false);
    onstroke?.(stroke);
  }
</script>

<canvas
  bind:this={canvas}
  class={cn("block aspect-square w-full touch-none", enabled && "cursor-crosshair", class_name)}
  onpointerdown={on_pointerdown}
  onpointermove={on_pointermove}
  onlostpointercapture={on_lostpointercapture}
></canvas>
