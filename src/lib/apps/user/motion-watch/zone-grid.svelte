<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { CELLS, GRID, paint_zones } from "./settings";

  interface Props {
    zones: string;
    editing: boolean;
    /** Cells that saw motion in the event being looked at, outlined. */
    marked?: number[];
    onchange: (zones: string) => void;
  }

  let { zones, editing, marked = [], onchange }: Props = $props();

  let drag = $state<{ pointer: number; from: number; on: boolean; start: string } | null>(null);
  const marked_set = $derived(new Set(marked));

  function cell_at(grid: HTMLElement, event: PointerEvent): number {
    const box = grid.getBoundingClientRect();
    const column = Math.min(GRID.COLUMNS - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * GRID.COLUMNS)));
    const row = Math.min(GRID.ROWS - 1, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * GRID.ROWS)));
    return row * GRID.COLUMNS + column;
  }

  function on_pointer_down(event: PointerEvent) {
    if (!editing || !event.isPrimary || event.button !== 0) return;
    const grid = event.currentTarget as HTMLElement;
    grid.setPointerCapture(event.pointerId);
    const from = cell_at(grid, event);
    drag = { pointer: event.pointerId, from, on: zones[from] === "0", start: zones };
    onchange(paint_zones(zones, from, from, drag.on));
    event.preventDefault();
  }

  function on_pointer_move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointer) return;
    onchange(paint_zones(drag.start, drag.from, cell_at(event.currentTarget as HTMLElement, event), drag.on));
  }

  function toggle_key(event: KeyboardEvent, cell: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onchange(paint_zones(zones, cell, cell, zones[cell] === "0"));
  }
</script>

<div
  class={cn("absolute inset-0 grid grid-cols-16 grid-rows-12", editing ? "cursor-crosshair touch-none" : "pointer-events-none")}
  role={editing ? "grid" : undefined}
  aria-label={editing ? "Zones: drag across cells to switch them off or on" : undefined}
  onpointerdown={on_pointer_down}
  onpointermove={on_pointer_move}
  onlostpointercapture={() => (drag = null)}
>
  {#each { length: CELLS }, cell (cell)}
    {@const off = zones[cell] === "0"}
    {#if editing}
      <div
        role="gridcell"
        tabindex="0"
        aria-selected={!off}
        aria-label="Cell {Math.floor(cell / GRID.COLUMNS) + 1}, {(cell % GRID.COLUMNS) + 1}: {off ? 'ignored' : 'watched'}"
        class={cn("border-[0.5px] border-foreground/20 focus-visible:outline-2 focus-visible:outline-cottontail", off && "bg-background-darkest/70")}
        onkeydown={(event) => toggle_key(event, cell)}
      ></div>
    {:else}
      <div class={cn(off && "bg-background-darkest/55", marked_set.has(cell) && "ring-1 ring-inset ring-primary")}></div>
    {/if}
  {/each}
</div>
