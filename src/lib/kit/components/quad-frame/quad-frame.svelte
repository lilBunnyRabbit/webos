<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Quad } from "$kit/utils/perspective";

  interface QuadImage {
    src: string;
    width: number;
    height: number;
  }

  interface Props {
    /** In image pixels, clockwise from the top left. */
    quad: Quad;
    image: QuadImage;
    alt?: string;
    labels?: [string, string, string, string];
    marked?: number | null;
    class?: string;
  }

  let {
    quad = $bindable(),
    image,
    alt = "",
    labels = ["Top left", "Top right", "Bottom right", "Bottom left"],
    marked = null,
    class: class_name,
  }: Props = $props();

  let frame = $state<HTMLElement>();
  let dragging = $state(-1);

  const { width, height } = $derived(image);
  const polygon = $derived(quad.map((corner) => `${corner.x},${corner.y}`).join(" "));

  function set_corner(index: number, x: number, y: number) {
    const next = [...quad] as Quad;
    next[index] = { x: Math.min(width, Math.max(0, x)), y: Math.min(height, Math.max(0, y)) };
    quad = next;
  }

  function grab(event: PointerEvent, index: number) {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    dragging = index;
  }

  function move(event: PointerEvent, index: number) {
    if (dragging !== index || !frame) return;
    const box = frame.getBoundingClientRect();
    set_corner(index, ((event.clientX - box.left) / box.width) * width, ((event.clientY - box.top) / box.height) * height);
  }

  function nudge(event: KeyboardEvent, index: number) {
    const step = (event.shiftKey ? 20 : 4) * (width / 1000);
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    set_corner(index, quad[index].x + delta[0], quad[index].y + delta[1]);
  }
</script>

<div class={cn("stage grid min-h-0 place-items-center", class_name)}>
  <div bind:this={frame} class="frame relative" style:aspect-ratio="{width} / {height}" style:--ratio={width / height}>
    <img src={image.src} {alt} class="absolute inset-0 size-full select-none" draggable="false" />
    <svg viewBox="0 0 {width} {height}" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <polygon points={polygon} class="fill-primary/10 stroke-primary" stroke-width="2" vector-effect="non-scaling-stroke" />
    </svg>
    {#each quad as corner, index (index)}
      <button
        type="button"
        class={["handle absolute grid size-11 -translate-1/2 touch-none place-items-center rounded-full", dragging === index && "active"]}
        style:left="{(corner.x / width) * 100}%"
        style:top="{(corner.y / height) * 100}%"
        aria-label="{labels[index]} corner, arrow keys move it"
        onpointerdown={(event) => grab(event, index)}
        onpointermove={(event) => move(event, index)}
        onlostpointercapture={() => (dragging = -1)}
        onkeydown={(event) => nudge(event, index)}
      >
        <span class={["grid size-6 place-items-center rounded-full ring-2 ring-primary", index === marked ? "bg-primary/40" : "bg-background/40"]}>
          <span class="size-1.5 rounded-full bg-primary"></span>
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .stage {
    container-type: size;
  }

  .frame {
    width: min(100cqw, 100cqh * var(--ratio));
  }

  .handle {
    cursor: grab;
  }

  .handle.active {
    cursor: grabbing;
  }
</style>
