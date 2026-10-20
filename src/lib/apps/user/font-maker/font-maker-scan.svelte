<script lang="ts">
  import { Button, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { CHAR_SET_LABELS, type CharSet } from "./charsets";
  import { default_quad, type Quad } from "./scan";
  import type { ScanImage } from "./scan-image";

  interface Props {
    scan: ScanImage;
    found: Quad | null;
    sets: CharSet[];
    set: CharSet;
    busy: boolean;
    onapply: (set: CharSet, corners: Quad) => void;
    oncancel: () => void;
  }

  let { scan, found, sets, set: initial_set, busy, onapply, oncancel }: Props = $props();

  let corners = $state<Quad>(untrack(() => (found ? ([...found] as Quad) : default_quad(scan.gray.width, scan.gray.height))));
  let set = $state<CharSet>(untrack(() => initial_set));
  let frame = $state<HTMLElement>();
  let dragging = $state(-1);

  const { width, height } = $derived(scan.gray);
  const polygon = $derived(corners.map((corner) => `${corner.x},${corner.y}`).join(" "));
  const LABELS = ["Top left (the square with a hole)", "Top right", "Bottom right", "Bottom left"];

  function grab(event: PointerEvent, index: number) {
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    dragging = index;
  }

  function move(event: PointerEvent, index: number) {
    if (dragging !== index || !frame) return;
    const box = frame.getBoundingClientRect();
    const x = Math.min(width, Math.max(0, ((event.clientX - box.left) / box.width) * width));
    const y = Math.min(height, Math.max(0, ((event.clientY - box.top) / box.height) * height));
    corners[index] = { x, y };
  }

  function nudge(event: KeyboardEvent, index: number) {
    const step = (event.shiftKey ? 20 : 4) * (width / 1000);
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const corner = corners[index];
    corners[index] = { x: Math.min(width, Math.max(0, corner.x + delta[0])), y: Math.min(height, Math.max(0, corner.y + delta[1])) };
  }
</script>

<div class="absolute inset-0 z-10 grid grid-rows-[auto_auto_minmax(0,1fr)] bg-background">
  <Toolbar class="gap-2">
    <Button size="sm" variant="quiet" onclick={oncancel}>Cancel</Button>
    <span class="min-w-0 flex-1 truncate text-ui font-medium">Line up the corners</span>
    {#if sets.length > 1}
      <Select size="sm" aria-label="Which sheet" class="max-w-40" options={sets.map((value) => ({ value, label: CHAR_SET_LABELS[value] }))} bind:value={set} />
    {/if}
    <Button size="sm" variant="primary" disabled={busy} onclick={() => onapply(set, $state.snapshot(corners) as Quad)}>
      {#if busy}<Spinner label="Reading the sheet" class="size-3.5" />{/if}Use guides
    </Button>
  </Toolbar>
  <p class={["border-b border-foreground/8 px-3 py-2 text-ui", found ? "text-foreground/80" : "bg-warning/10"]} aria-live="polite">
    {found
      ? "Found the four corner squares. Drag a corner if it's off."
      : "Couldn't find the corner squares. Drag each corner onto its square; the top left one has a hole."}
  </p>
  <div class="stage grid min-h-0 place-items-center bg-background-darker p-4">
    <div bind:this={frame} class="frame relative" style:aspect-ratio="{width} / {height}" style:--ratio={width / height}>
      <img src={scan.url} alt="The scanned sheet" class="absolute inset-0 size-full select-none" draggable="false" />
      <svg viewBox="0 0 {width} {height}" class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        <polygon points={polygon} class="fill-primary/10 stroke-primary" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      {#each corners as corner, index (index)}
        <button
          type="button"
          class={["handle absolute grid size-11 -translate-1/2 touch-none place-items-center rounded-full", dragging === index && "active"]}
          style:left="{(corner.x / width) * 100}%"
          style:top="{(corner.y / height) * 100}%"
          aria-label="{LABELS[index]} corner, arrow keys move it"
          onpointerdown={(event) => grab(event, index)}
          onpointermove={(event) => move(event, index)}
          onlostpointercapture={() => (dragging = -1)}
          onkeydown={(event) => nudge(event, index)}
        >
          <span class={["grid size-6 place-items-center rounded-full ring-2 ring-primary", index === 0 ? "bg-primary/40" : "bg-background/40"]}>
            <span class="size-1.5 rounded-full bg-primary"></span>
          </span>
        </button>
      {/each}
    </div>
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
