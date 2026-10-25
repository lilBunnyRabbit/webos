<script lang="ts">
  import { paint, read_pixels } from "$kit/utils/image";
  import { cn } from "$lib/core/utils";
  import { clamp_point, pixel_at, read_rgba, type Point, type Rgba } from "./sample";

  interface Props {
    picture: ImageBitmap;
    label: string;
    onpick: (rgba: Rgba) => void;
    class?: string;
  }

  let { picture, label, onpick, class: class_name }: Props = $props();

  const RADIUS = 5;
  const LOUPE = 112;
  const SPAN = RADIUS * 2 + 1;

  const pixels = $derived(read_pixels(picture));
  const size = $derived({ width: picture.width, height: picture.height });

  let canvas = $state<HTMLCanvasElement>();
  let loupe = $state<HTMLCanvasElement>();
  let cursor = $state<Point | null>(null);
  let dragging = $state(false);
  let box = $state({ width: 1, height: 1 });

  const hex = $derived.by(() => {
    if (!cursor) return "";
    const { r, g, b } = read_rgba(pixels.data, pixels.width, cursor);
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  });
  const at = $derived(cursor ? { x: ((cursor.x + 0.5) / size.width) * box.width, y: ((cursor.y + 0.5) / size.height) * box.height } : null);
  let touch = $state(false);
  // A finger hides what's under and below it, so on touch the loupe always sits above.
  const below = $derived(at !== null && !touch && at.y < LOUPE + 40);

  $effect(() => {
    if (!loupe || !cursor) return;
    const context = loupe.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, loupe.width, loupe.height);
    context.drawImage(picture, cursor.x - RADIUS, cursor.y - RADIUS, SPAN, SPAN, 0, 0, loupe.width, loupe.height);
  });

  function point_of(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    box = { width: rect.width, height: rect.height };
    return pixel_at({ x: event.clientX - rect.left, y: event.clientY - rect.top }, box, size);
  }

  function pick() {
    if (cursor) onpick(read_rgba(pixels.data, pixels.width, cursor));
  }

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas!.setPointerCapture(event.pointerId);
    dragging = true;
    touch = event.pointerType !== "mouse";
    cursor = point_of(event);
  }

  function onpointermove(event: PointerEvent) {
    if (dragging || event.pointerType === "mouse") cursor = point_of(event);
  }

  function onlostpointercapture() {
    if (!dragging) return;
    dragging = false;
    pick();
  }

  function onpointerleave(event: PointerEvent) {
    if (!dragging && event.pointerType === "mouse" && document.activeElement !== canvas) cursor = null;
  }

  function onkeydown(event: KeyboardEvent) {
    const steps: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      box = { width: rect.width, height: rect.height };
      const from = cursor ?? { x: size.width / 2, y: size.height / 2 };
      const by = event.shiftKey ? 10 : 1;
      cursor = clamp_point({ x: from.x + step.x * by, y: from.y + step.y * by }, size);
    } else if ((event.key === "Enter" || event.key === " ") && cursor) {
      event.preventDefault();
      pick();
    }
  }

  function onfocus() {
    const rect = canvas!.getBoundingClientRect();
    box = { width: rect.width, height: rect.height };
    cursor ??= clamp_point({ x: size.width / 2, y: size.height / 2 }, size);
  }
</script>

<div class={cn("relative mx-auto w-fit max-w-full", class_name)}>
  <canvas
    bind:this={canvas}
    {@attach paint(picture)}
    tabindex="0"
    aria-label="{label}. Drag or use the arrow keys to aim, release or press Enter to pick."
    class="block h-auto max-h-96 w-auto max-w-full cursor-crosshair touch-none rounded-lg ring-1 ring-foreground/10 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail"
    {onpointerdown}
    {onpointermove}
    {onlostpointercapture}
    {onpointerleave}
    {onkeydown}
    {onfocus}
    onblur={() => !dragging && (cursor = null)}
  ></canvas>

  {#if at}
    <div
      class="pointer-events-none absolute size-3 -translate-1/2 rounded-full ring-2 ring-foreground"
      style:left="{at.x}px"
      style:top="{at.y}px"
      style:box-shadow="0 0 0 3px var(--background)"
    ></div>
    <div
      class="pointer-events-none absolute z-10 flex -translate-x-1/2 flex-col items-center gap-1 rounded-xl bg-background-lighter p-1.5 shadow-popover"
      style:left="{Math.min(Math.max(at.x, LOUPE / 2 + 8), box.width - LOUPE / 2 - 8)}px"
      style:top={below ? `${at.y + 24}px` : `${at.y - LOUPE - 56}px`}
    >
      <div class="relative overflow-hidden rounded-lg ring-1 ring-foreground/10" style:width="{LOUPE}px" style:height="{LOUPE}px">
        <canvas bind:this={loupe} width={SPAN * 8} height={SPAN * 8} class="size-full" style:image-rendering="pixelated"></canvas>
        <div
          class="absolute ring-2 ring-foreground"
          style:left="{(RADIUS / SPAN) * 100}%"
          style:top="{(RADIUS / SPAN) * 100}%"
          style:width="{100 / SPAN}%"
          style:height="{100 / SPAN}%"
        ></div>
      </div>
      <span class="font-mono text-2xs text-foreground/80">{hex}</span>
    </div>
  {/if}
</div>
