<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { Plus as PlusIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { tick, untrack } from "svelte";
  import { free_spot, is_arrow, nudge } from "./editor-keys";
  import type { Point } from "./engine/step";
  import Stage from "./views/stage.svelte";

  let { value, onchange, validate }: { value: unknown; onchange: (value: unknown) => void; validate: (value: unknown) => string | null } = $props();

  const S = 5;
  const bounds = { x: -20, y: -20, width: 540, height: 540 };
  let points = $state<Point[]>(untrack(() => structuredClone(value as Point[])));
  let selected = $state<number | null>(null);
  let error = $state<string | null>(null);
  let root = $state<HTMLDivElement>();

  function commit(next: Point[]) {
    points = next;
    error = validate(next);
    if (!error) onchange($state.snapshot(next));
  }

  const clamp = (point: Point) => ({ x: Math.round(Math.min(100, Math.max(0, point.x / S))), y: Math.round(Math.min(100, Math.max(0, point.y / S))) });

  async function focus_point(index: number) {
    await tick();
    root?.querySelectorAll<SVGGElement>("[data-point]")[index]?.focus();
  }

  let drag: { index: number; from: Point; moved: boolean } | null = null;
  let down_at: Point | null = null;

  function point_down(event: PointerEvent, index: number) {
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag = { index, from: { x: event.clientX, y: event.clientY }, moved: false };
  }

  function point_move(event: PointerEvent, to_point: (event: PointerEvent) => Point) {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y) > 4) drag.moved = true;
    if (!drag.moved) return;
    const at = clamp(to_point(event));
    const index = drag.index;
    points = points.map((point, i) => (i === index ? at : point));
  }

  function point_up(index: number) {
    const was = drag;
    drag = null;
    if (!was) return;
    if (was.moved) commit(points);
    else selected = selected === index ? null : index;
  }

  let nudged = false;

  function settle() {
    if (!nudged) return;
    nudged = false;
    commit(points);
  }

  function point_key(event: KeyboardEvent, index: number) {
    if (is_arrow(event.key)) {
      event.preventDefault();
      points = points.map((point, i) => (i === index ? nudge(point, event.key, event.shiftKey) : point));
      selected = index;
      nudged = true;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selected = selected === index ? null : index;
    } else if (event.key === "Escape" && selected !== null) {
      event.preventDefault();
      selected = null;
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      selected = index;
      remove();
      void focus_point(Math.min(index, points.length - 1));
    }
  }

  function add_point() {
    commit([...points, free_spot(points)]);
    selected = points.length - 1;
    void focus_point(points.length - 1);
  }

  function background_click(event: MouseEvent, to_point: (event: MouseEvent) => Point) {
    if (!down_at || Math.hypot(event.clientX - down_at.x, event.clientY - down_at.y) > 4) return;
    down_at = null;
    if (selected !== null) {
      selected = null;
      return;
    }
    commit([...points, clamp(to_point(event))]);
  }

  function remove() {
    if (selected === null) return;
    const index = selected;
    selected = null;
    commit(points.filter((_, i) => i !== index));
  }
</script>

<div bind:this={root} class="flex h-full min-h-0 flex-col gap-2">
  <div class="flex min-h-9 flex-wrap items-center gap-1.5 text-ui text-foreground/80" aria-live="polite">
    {#if selected !== null}
      <span class="font-mono text-foreground">({points[selected]?.x}, {points[selected]?.y})</span>
      <Button size="sm" variant="quiet" class="ml-auto" onclick={remove}><TrashIcon weight="bold" /> Delete</Button>
    {:else}
      <span class="min-w-0 flex-1">
        Tap to add a point, drag to move one. {points.length} points.
        <span class="hidden @2xl:inline">Keys: Tab to a point, arrows move it (Shift for 10), Delete removes.</span>
      </span>
      <Button size="sm" variant="quiet" onclick={add_point}><PlusIcon weight="bold" /> Add point</Button>
    {/if}
  </div>
  {#if error}<p class="text-2xs text-error">{error}</p>{/if}
  <div class="min-h-0 flex-1 rounded-lg bg-background ring-1 ring-hairline">
    <Stage {bounds} label="Points editor" role="group" class="h-full" pannable={(event) => !(event.target as Element).closest("[data-point]")}>
      {#snippet children(to_point)}
        <rect
          x="0"
          y="0"
          width={100 * S}
          height={100 * S}
          rx="8"
          class="fill-background-light/50 stroke-foreground/10"
          role="presentation"
          onpointerdown={(event) => (down_at = { x: event.clientX, y: event.clientY })}
          onclick={(event) => background_click(event, to_point)}
        />
        {#each points as point, index (index)}
          <g
            transform="translate({point.x * S} {point.y * S})"
            role="button"
            tabindex="0"
            aria-label="Point {point.x}, {point.y}"
            aria-pressed={selected === index}
            data-point
            class="group cursor-grab outline-none"
            onpointerdown={(event) => point_down(event, index)}
            onpointermove={(event) => point_move(event, to_point)}
            onpointerup={() => point_up(index)}
            onkeydown={(event) => point_key(event, index)}
            onkeyup={(event) => is_arrow(event.key) && settle()}
            onblur={settle}
          >
            <circle r="14" class="fill-transparent" />
            <circle r="12" fill="none" stroke-width="2" class="stroke-transparent group-focus-visible:stroke-cottontail" />
            <circle r={selected === index ? 8 : 6} class={selected === index ? "fill-primary" : "fill-foreground/70"} />
          </g>
        {/each}
      {/snippet}
    </Stage>
  </div>
</div>
