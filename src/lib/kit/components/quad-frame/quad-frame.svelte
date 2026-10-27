<script lang="ts">
  import { cn } from "$lib/core/utils";
  import type { Quad } from "$kit/utils/perspective";
  import type { Attachment } from "svelte/attachments";

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
    /** Shows the picture magnified around a dragged corner, clear of the finger. */
    loupe?: boolean;
    class?: string;
  }

  let {
    quad = $bindable(),
    image,
    alt = "",
    labels = ["Top left", "Top right", "Bottom right", "Bottom left"],
    marked = null,
    loupe = false,
    class: class_name,
  }: Props = $props();

  const ZOOM = 3;
  const LOUPE = 96;

  let frame = $state<HTMLElement>();
  let dragging = $state(-1);
  let frame_width = $state(0);
  let frame_height = $state(0);

  const { width, height } = $derived(image);
  const polygon = $derived(quad.map((corner) => `${corner.x},${corner.y}`).join(" "));

  // A corner dragged down inside a phone's bottom sheet would otherwise also swipe the sheet away.
  const own_touch: Attachment<HTMLElement> = (element) => {
    const stop = (event: TouchEvent) => event.stopPropagation();
    element.addEventListener("touchstart", stop, { passive: true });
    return () => element.removeEventListener("touchstart", stop);
  };

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
  <div bind:this={frame} bind:clientWidth={frame_width} bind:clientHeight={frame_height} class="frame relative" style:aspect-ratio="{width} / {height}" style:--ratio={width / height}>
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
        {@attach own_touch}
      >
        <span class={["grid size-6 place-items-center rounded-full ring-2 ring-primary", index === marked ? "bg-primary/40" : "bg-background/40"]}>
          <span class="size-1.5 rounded-full bg-primary"></span>
        </span>
      </button>
    {/each}
    {#if loupe && dragging >= 0}
      {@const x = (quad[dragging].x / width) * frame_width}
      {@const y = (quad[dragging].y / height) * frame_height}
      <div
        class="pointer-events-none absolute z-10 overflow-hidden rounded-full bg-background-darkest bg-no-repeat shadow-popover ring-2 ring-primary"
        style:width="{LOUPE}px"
        style:height="{LOUPE}px"
        style:left="{Math.min(Math.max(x, LOUPE / 2), Math.max(LOUPE / 2, frame_width - LOUPE / 2))}px"
        style:top="{y}px"
        style:translate={y < LOUPE + 48 ? "-50% 40px" : "-50% calc(-100% - 40px)"}
        style:background-image={`url("${image.src}")`}
        style:background-size="{frame_width * ZOOM}px {frame_height * ZOOM}px"
        style:background-position="{LOUPE / 2 - x * ZOOM}px {LOUPE / 2 - y * ZOOM}px"
        aria-hidden="true"
      >
        <span class="absolute inset-x-0 top-1/2 h-px bg-primary"></span>
        <span class="absolute inset-y-0 left-1/2 w-px bg-primary"></span>
      </div>
    {/if}
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
