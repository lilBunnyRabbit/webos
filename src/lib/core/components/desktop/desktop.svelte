<script lang="ts">
  import kernel, { type ClipboardService, type DesktopItem as Item, type GridDesktopService } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { click_select, intersects, rect_from_points, type Rect } from "$lib/core/utils/selection";
  import type { Position } from "$lib/core/utils/type";
  import { drop_paths, has_drag_paths, read_drag_paths, set_drag_paths } from "../files/drag";
  import DesktopItem from "./desktop-item.svelte";
  import {
    background_menu,
    copy_items,
    cut_items,
    desktop_path,
    item_menu,
    open_items,
    paste,
    remove_items,
    rename_item,
    show_properties,
  } from "./desktop-actions";

  const desktop = $derived(kernel.service<GridDesktopService>("desktop"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  /** Every visible item with its cell, in reading order: rows top to bottom, cells left to right. */
  const cells = $derived.by(() => {
    const result: { item: Item; x: number; y: number }[] = [];
    desktop.list().forEach((row, y) => row?.forEach((item, x) => item && result.push({ item, x, y })));
    return result;
  });
  const order = $derived(cells.map(({ item }) => item.name));
  const cell_of = $derived(new Map(cells.map(({ item, x, y }) => [item.name, { x, y }])));

  // Selection is this surface's own UI state (ADR-011 revision). Entries deleted or renamed elsewhere drop out.
  let chosen = $state.raw<Set<string>>(new Set());
  let anchor = $state<string | null>(null);
  const selection = $derived(new Set(order.filter((name) => chosen.has(name))));
  const selected_items = $derived(cells.filter(({ item }) => selection.has(item.name)).map(({ item }) => item));

  const is_mod = (event: MouseEvent | KeyboardEvent) => event.ctrlKey || event.metaKey;

  function select(name: string, event: MouseEvent) {
    ({ selection: chosen, anchor } = click_select({ selection, anchor }, name, { toggle: is_mod(event), range: event.shiftKey }, order));
  }

  /** Selects only `item` unless it's already part of the selection. */
  function ensure_selected(item: Item) {
    if (selection.has(item.name)) return;
    chosen = new Set([item.name]);
    anchor = item.name;
  }

  /** What an action on `item` applies to: the whole selection when it's in it, else just it. */
  const targets = (item: Item): Item[] => (selection.has(item.name) ? selected_items : [item]);

  let surface: HTMLElement | null = $state(null);

  function cell_rect(x: number, y: number): Rect {
    const { bounds, cell } = desktop.container;
    const left = bounds.x + x * cell.width;
    const top = bounds.y + y * cell.height;
    return { left, top, right: left + cell.width, bottom: top + cell.height };
  }

  function cell_at(client_x: number, client_y: number): Position {
    const { bounds, cell, grid } = desktop.container;
    return {
      x: Math.max(0, Math.min(grid.columns - 1, Math.floor((client_x - bounds.x) / cell.width))),
      y: Math.max(0, Math.min(grid.rows - 1, Math.floor((client_y - bounds.y) / cell.height))),
    };
  }

  // Marquee: drag on empty desktop. Hit-testing is cell math, no DOM reads.
  let marquee = $state<{ pointer: number; start: Position; current: Position; base: Set<string> } | null>(null);
  const marquee_rect = $derived(marquee && rect_from_points(marquee.start, marquee.current));

  function on_pointer_down(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    surface?.focus({ preventScroll: true });
    const base = is_mod(event) ? selection : new Set<string>();
    if (!is_mod(event)) chosen = new Set();
    marquee = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, current: { x: event.clientX, y: event.clientY }, base };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function on_pointer_move(event: PointerEvent) {
    if (!marquee || event.pointerId !== marquee.pointer) return;
    marquee.current = { x: event.clientX, y: event.clientY };
    const rect = rect_from_points(marquee.start, marquee.current);
    const hits = cells.filter(({ x, y }) => intersects(cell_rect(x, y), rect)).map(({ item }) => item.name);
    chosen = new Set([...marquee.base, ...hits]);
  }

  // Native drag and drop (ADR-011 revision). `drag` is only set for drags that started here; drags from Explorer
  // windows carry their paths in the data transfer.
  let drag = $state<{ names: string[]; grab: Position } | null>(null);
  let hover = $state<{ cell: Position; folder: string | null } | null>(null);

  const drag_targets = $derived.by(() => {
    if (!drag || !hover || hover.folder) return [];
    const { grab } = drag;
    const { cell } = hover;
    return drag.names.flatMap((name) => {
      const from = cell_of.get(name);
      return from ? [{ x: from.x - grab.x + cell.x, y: from.y - grab.y + cell.y }] : [];
    });
  });

  function on_item_drag_start(event: DragEvent, item: Item) {
    ensure_selected(item);
    const items = targets(item);
    set_drag_paths(event, items.map(desktop_path));
    drag = { names: items.map(({ name }) => name), grab: cell_of.get(item.name) ?? { x: 0, y: 0 } };
  }

  /** A folder under the pointer that isn't part of the drag. */
  function folder_under(event: DragEvent): string | null {
    const name = (event.target as Element).closest<HTMLElement>("[data-desktop-name]")?.dataset.desktopName;
    if (!name || drag?.names.includes(name)) return null;
    return cells.find(({ item }) => item.name === name)?.item.kind === "directory" ? name : null;
  }

  function on_drag_over(event: DragEvent) {
    if (!drag && !has_drag_paths(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    hover = { cell: cell_at(event.clientX, event.clientY), folder: folder_under(event) };
  }

  async function on_drop(event: DragEvent) {
    event.preventDefault();
    const local = drag;
    const folder = folder_under(event);
    const cell = cell_at(event.clientX, event.clientY);
    hover = null;
    drag = null;

    if (folder) {
      const paths = local ? local.names.map((name) => `${PATHS.desktop}/${name}`) : read_drag_paths(event);
      await drop_paths(paths, `${PATHS.desktop}/${folder}`);
      return;
    }

    if (local) {
      desktop.move_items(
        local.names.flatMap((name) => {
          const from = cell_of.get(name);
          return from ? [{ name, to: { x: from.x - local.grab.x + cell.x, y: from.y - local.grab.y + cell.y } }] : [];
        })
      );
      return;
    }

    // From an Explorer window: into /home/Desktop, then onto the cell it was dropped on.
    const moved = await drop_paths(read_drag_paths(event), PATHS.desktop);
    desktop.move_items(moved.map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), to: cell })));
  }

  function focused_item(): Item | undefined {
    const name = (document.activeElement as HTMLElement | null)?.dataset?.desktopName;
    return cells.find(({ item }) => item.name === name)?.item;
  }

  function on_key_down(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (is_mod(event) && key === "a") {
      chosen = new Set(order);
    } else if (event.key === "Escape" && selection.size > 0) {
      chosen = new Set();
    } else if (is_mod(event) && key === "v") {
      paste();
    } else {
      const item = focused_item();
      if (!item) return;
      const items = targets(item);
      const rect = (document.activeElement as HTMLElement).getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.bottom };
      if (event.key === "Enter" && event.altKey && items.length === 1) show_properties(item);
      else if (event.key === "Enter") open_items(items, point);
      else if (event.key === "F2" && items.length === 1) rename_item(item);
      else if (is_mod(event) && key === "c") copy_items(items);
      else if (is_mod(event) && key === "x") cut_items(items);
      else if (event.key === "Delete" || (event.key === "Backspace" && event.metaKey)) remove_items(items);
      else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) item_menu(items, point);
      else return;
    }
    event.preventDefault();
  }
</script>

<div
  bind:this={surface}
  {@attach (element) => {
    const resize_observer = new ResizeObserver(() => {
      desktop.set_container(element);
    });

    resize_observer.observe(element);
    return () => resize_observer.disconnect();
  }}
  role="presentation"
  tabindex="-1"
  onkeydown={on_key_down}
  onpointerdown={on_pointer_down}
  onpointermove={on_pointer_move}
  onlostpointercapture={() => (marquee = null)}
  ondragover={on_drag_over}
  ondragleave={(event) => {
    if (!surface?.contains(event.relatedTarget as Node | null)) hover = null;
  }}
  ondrop={on_drop}
  oncontextmenu={(event) => {
    if ((event.target as Element).closest("button")) return;
    event.preventDefault();
    background_menu({ x: event.clientX, y: event.clientY });
  }}
  class="desktop-surface relative grid size-full place-items-center overflow-hidden outline-none"
  style:grid-template-columns={`repeat(${desktop.container.grid.columns}, minmax(64px, 1fr))`}
  style:grid-template-rows={`repeat(${desktop.container.grid.rows}, minmax(64px, 1fr))`}
  style:grid-auto-flow="dense"
  style:padding={`${desktop.container.config.padding}px`}
  style:--cell-width="{desktop.container.cell.width || 88}px"
  style:--cell-height="{desktop.container.cell.height || 88}px"
  style:--grid-offset="{desktop.container.config.padding}px"
>
  {#if desktop.container.grid.columns > 0 && desktop.container.grid.rows > 0}
    {#each drag_targets as target, idx (idx)}
      {#if target.x >= 0 && target.y >= 0 && target.x < desktop.container.grid.columns && target.y < desktop.container.grid.rows}
        <div
          class="pointer-events-none size-full rounded-xl bg-foreground/6 ring-1 ring-foreground/20 ring-inset"
          style:grid-column={target.x + 1}
          style:grid-row={target.y + 1}
        ></div>
      {/if}
    {/each}

    {#each cells as { item, x, y } (item.name)}
      <DesktopItem
        {item}
        {x}
        {y}
        selected={selection.has(item.name)}
        dimmed={(drag?.names.includes(item.name) ?? false) || clipboard.is_cut(desktop_path(item))}
        drop_target={hover?.folder === item.name}
        onselect={(event) => select(item.name, event)}
        onopen={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
        onmenu={(event) => {
          ensure_selected(item);
          item_menu(targets(item), { x: event.clientX, y: event.clientY });
        }}
        ondragstart={(event) => on_item_drag_start(event, item)}
        ondragend={() => {
          drag = null;
          hover = null;
        }}
      />
    {/each}
  {/if}

  {#if marquee_rect && surface}
    {@const origin = { x: desktop.container.bounds.x - desktop.container.config.padding, y: desktop.container.bounds.y - desktop.container.config.padding }}
    <div
      class="pointer-events-none absolute rounded-sm bg-primary/12 ring-1 ring-primary/60"
      style:left="{marquee_rect.left - origin.x}px"
      style:top="{marquee_rect.top - origin.y}px"
      style:width="{marquee_rect.right - marquee_rect.left}px"
      style:height="{marquee_rect.bottom - marquee_rect.top}px"
    ></div>
  {/if}
</div>

<style>
  /* The dot grid marks the icon cells; a soft glow from the top keeps the darkest shade from reading as a void.
     Both are shades of the same surface (gradients between shades are allowed by the brand). */
  .desktop-surface {
    background-color: var(--background-darkest);
    background-image:
      radial-gradient(circle at center, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1.5px),
      radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
    background-size:
      var(--cell-width) var(--cell-height),
      100% 100%;
    background-position:
      calc(var(--grid-offset) - var(--cell-width) / 2) calc(var(--grid-offset) - var(--cell-height) / 2),
      0 0;
  }
</style>
