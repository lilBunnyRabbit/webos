<script lang="ts">
  import { Button, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, Eraser as EraserIcon, PencilSimple as PencilSimpleIcon } from "phosphor-svelte";
  import { blob_to_data_url } from "$kit/utils/picture";
  import { onMount } from "svelte";
  import { sketch_size, stroke_width, type SketchStroke, type SketchTool } from "./sketch";

  interface Props {
    oninsert: (image: string) => void;
    oncancel: () => void;
  }

  let { oninsert, oncancel }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let stage = $state<HTMLDivElement>();
  let size = $state.raw<{ width: number; height: number } | null>(null);

  onMount(() => {
    size = sketch_size(!!stage && stage.clientHeight > stage.clientWidth);
  });
  let tool = $state<SketchTool>("pen");
  let strokes = $state.raw<SketchStroke[]>([]);
  let live = $state.raw<SketchStroke | null>(null);
  let pointer = -1;
  let saving = $state(false);

  $effect(() => {
    if (!canvas || !size) return;
    const { width, height } = size;
    const context = canvas.getContext("2d")!;
    const style = getComputedStyle(canvas);
    const ink = style.getPropertyValue("--foreground").trim();
    const paper = style.getPropertyValue("--background").trim();
    context.fillStyle = paper;
    context.fillRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of live ? [...strokes, live] : strokes) {
      context.strokeStyle = stroke.tool === "pen" ? ink : paper;
      context.fillStyle = context.strokeStyle;
      context.lineWidth = stroke_width(stroke.tool);
      const [first, ...rest] = stroke.points;
      if (!rest.length) {
        context.beginPath();
        context.arc(first[0], first[1], context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(first[0], first[1]);
      for (const [x, y] of rest) context.lineTo(x, y);
      context.stroke();
    }
  });

  function point_of(event: PointerEvent): [number, number] {
    const box = canvas!.getBoundingClientRect();
    const { width, height } = size!;
    return [
      Math.round(((event.clientX - box.left) / box.width) * width * 10) / 10,
      Math.round(((event.clientY - box.top) / box.height) * height * 10) / 10,
    ];
  }

  function start(event: PointerEvent) {
    if (!size || pointer >= 0 || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    canvas!.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    live = { tool: event.pointerType === "pen" && event.button === 5 ? "eraser" : tool, points: [point_of(event)] };
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointer || !live) return;
    const events = event.getCoalescedEvents?.() ?? [];
    live = { ...live, points: [...live.points, ...(events.length ? events : [event]).map(point_of)] };
  }

  function end(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    pointer = -1;
    if (live) strokes = [...strokes, live];
    live = null;
  }

  async function insert() {
    if (!canvas || saving) return;
    saving = true;
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas!.toBlob((value) => (value ? resolve(value) : reject(new Error("Couldn't encode the sketch"))), "image/webp", 0.85)
      );
      oninsert(await blob_to_data_url(blob));
    } finally {
      saving = false;
    }
  }
</script>

<div class="absolute inset-0 z-10 grid grid-rows-[auto_minmax(0,1fr)] bg-background" role="dialog" aria-label="Sketch">
  <Toolbar class="flex-nowrap gap-1">
    <Button size="sm" variant="quiet" class="shrink-0" onclick={oncancel}>Cancel</Button>
    <span class="hidden min-w-0 truncate text-ui font-medium @sm:inline">Sketch</span>
    <div class="flex-1"></div>
    <IconButton label="Pen" size="sm" class="shrink-0" pressed={tool === "pen"} onclick={() => (tool = "pen")}><PencilSimpleIcon weight="bold" /></IconButton>
    <IconButton label="Eraser" size="sm" class="shrink-0" pressed={tool === "eraser"} onclick={() => (tool = "eraser")}><EraserIcon weight="bold" /></IconButton>
    <IconButton label="Undo" size="sm" class="shrink-0" disabled={!strokes.length} onclick={() => (strokes = strokes.slice(0, -1))}>
      <ArrowCounterClockwiseIcon weight="bold" />
    </IconButton>
    <div class="flex-1"></div>
    <Button size="sm" variant="primary" class="shrink-0" disabled={!strokes.length || saving} onclick={insert}>
      {#if saving}<Spinner label="Inserting the sketch" class="size-3.5" />{/if}Insert
    </Button>
  </Toolbar>
  <div bind:this={stage} class="stage grid min-h-0 place-items-center bg-background-darker p-3">
    {#if size}
      <canvas
        bind:this={canvas}
        width={size.width}
        height={size.height}
        style:--ratio={size.width / size.height}
        class="pad touch-none rounded-lg ring-1 ring-foreground/12 select-none"
        aria-label="Sketch pad"
        onpointerdown={start}
        onpointermove={move}
        onlostpointercapture={end}
      ></canvas>
    {/if}
  </div>
</div>

<style>
  .stage {
    container-type: size;
  }

  .pad {
    width: min(100cqw, 100cqh * var(--ratio));
    aspect-ratio: var(--ratio);
    cursor: crosshair;
  }
</style>
