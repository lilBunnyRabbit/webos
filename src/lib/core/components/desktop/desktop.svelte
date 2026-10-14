<script lang="ts">
  import kernel, { type ClipboardService, type DesktopItem as Item, type GridDesktopService, type SettingsService } from "$lib/core/api";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { click_select, intersects, rect_from_points, type Rect } from "$lib/core/utils/selection";
  import type { Position } from "$lib/core/utils/type";
  import { drop_paths, has_drag_paths, has_os_files, import_dropped, read_drag_paths, read_os_entries, set_drag_paths } from "../files/drag";
  import DesktopItem from "./desktop-item.svelte";
  import DesktopWidget from "./desktop-widget.svelte";
  import { grid_items, item_span, snap_cells, type ResizeTarget } from "$lib/core/api/services/desktop/helper";
  import type { WidgetSize } from "$lib/core/api/services/apps/type";
  import { cn } from "$lib/core/utils";
  import Wallpaper from "./wallpaper.svelte";
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
  const settings = $derived(kernel.service<SettingsService>("settings"));

  /** Every visible item with its cell, in reading order: rows top to bottom, cells left to right. */
  const cells = $derived(grid_items(desktop.list()));
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

  function cell_rect(x: number, y: number, span = { w: 1, h: 1 }): Rect {
    const { bounds, cell } = desktop.container;
    const left = bounds.x + x * cell.width;
    const top = bounds.y + y * cell.height;
    return { left, top, right: left + cell.width * span.w, bottom: top + cell.height * span.h };
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
    if (event.button !== 0 || (event.target as Element).closest("button, [data-widget-body]")) return;
    surface?.focus({ preventScroll: true });
    const base = is_mod(event) ? selection : new Set<string>();
    if (!is_mod(event)) chosen = new Set();
    marquee = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, current: { x: event.clientX, y: event.clientY }, base };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  let resizing = $state<{ name: string; pointer: number; start: Position; from: WidgetSize; target: ResizeTarget } | null>(null);
  // A refused keyboard resize flashes its outline, so Shift+arrow against a neighbour isn't silent.
  let refused = $state<{ name: string; target: ResizeTarget } | null>(null);
  let refused_timer: ReturnType<typeof setTimeout> | undefined;
  const resize_preview = $derived(resizing ?? refused);

  function on_resize_start(event: PointerEvent, item: Extract<Item, { kind: "widget" }>) {
    if (event.button !== 0) return;
    const target = desktop.resize_target(item.name, item.size);
    if (!target) return;
    event.preventDefault();
    surface?.focus({ preventScroll: true });
    chosen = new Set([item.name]);
    anchor = item.name;
    resizing = { name: item.name, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, from: item.size, target };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function finish_resize(event: PointerEvent) {
    if (!resizing || event.pointerId !== resizing.pointer) return;
    const { name, from, target } = resizing;
    resizing = null;
    if (target.valid && (target.size.w !== from.w || target.size.h !== from.h)) void desktop.resize_widget(name, target.size);
  }

  function resize_by(item: Extract<Item, { kind: "widget" }>, dw: number, dh: number): boolean {
    const target = desktop.resize_target(item.name, { w: item.size.w + dw, h: item.size.h + dh });
    if (!target) return false;
    if (target.valid) {
      if (target.size.w !== item.size.w || target.size.h !== item.size.h) void desktop.resize_widget(item.name, target.size);
      return true;
    }
    clearTimeout(refused_timer);
    refused = { name: item.name, target };
    refused_timer = setTimeout(() => (refused = null), 600);
    return true;
  }

  const RESIZE_KEYS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

  function on_pointer_move(event: PointerEvent) {
    if (resizing && event.pointerId === resizing.pointer) {
      const { cell } = desktop.container;
      const size = {
        w: resizing.from.w + snap_cells(event.clientX - resizing.start.x, cell.width),
        h: resizing.from.h + snap_cells(event.clientY - resizing.start.y, cell.height),
      };
      resizing.target = desktop.resize_target(resizing.name, size) ?? resizing.target;
      return;
    }
    if (!marquee || event.pointerId !== marquee.pointer) return;
    marquee.current = { x: event.clientX, y: event.clientY };
    const rect = rect_from_points(marquee.start, marquee.current);
    const hits = cells.filter(({ item, x, y }) => intersects(cell_rect(x, y, item_span(item)), rect)).map(({ item }) => item.name);
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
      const item = cells.find((entry) => entry.item.name === name)?.item;
      return from && item ? [{ x: from.x - grab.x + cell.x, y: from.y - grab.y + cell.y, ...item_span(item) }] : [];
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
    const os = !drag && !has_drag_paths(event) && has_os_files(event);
    if (!drag && !has_drag_paths(event) && !os) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = os ? "copy" : "move";
    hover = { cell: cell_at(event.clientX, event.clientY), folder: folder_under(event) };
  }

  async function on_drop(event: DragEvent) {
    event.preventDefault();
    const local = drag;
    const folder = folder_under(event);
    const cell = cell_at(event.clientX, event.clientY);
    hover = null;
    drag = null;

    // Real files from the OS: imported, not moved (ADR-005 revision).
    if (!local && !has_drag_paths(event) && has_os_files(event)) {
      const imported = await import_dropped(read_os_entries(event), folder ? `${PATHS.desktop}/${folder}` : PATHS.desktop);
      if (!folder) desktop.move_items(imported.map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), to: cell })));
      return;
    }

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
    // Keys typed inside a widget are the widget's (Mod+A in a sticky selects its text, not the desktop).
    if ((event.target as Element).closest("[data-widget-body]")) return;
    const key = event.key.toLowerCase();
    if (is_mod(event) && key === "a") {
      chosen = new Set(order);
    } else if (event.key === "Escape" && resizing) {
      resizing = null;
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
      else if (event.shiftKey && !is_mod(event) && !event.altKey && event.key in RESIZE_KEYS && item.kind === "widget") {
        const [dw, dh] = RESIZE_KEYS[event.key];
        if (!resize_by(item, dw, dh)) return;
      } else return;
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
  onlostpointercapture={(event) => {
    marquee = null;
    finish_resize(event);
  }}
  ondragover={on_drag_over}
  ondragleave={(event) => {
    if (!surface?.contains(event.relatedTarget as Node | null)) hover = null;
  }}
  ondrop={on_drop}
  oncontextmenu={(event) => {
    if ((event.target as Element).closest("button, [data-widget-body]")) return;
    event.preventDefault();
    background_menu({ x: event.clientX, y: event.clientY });
  }}
  class="desktop-surface relative isolate grid size-full place-items-center overflow-hidden outline-none"
  style:grid-template-columns={`repeat(${desktop.container.grid.columns}, minmax(64px, 1fr))`}
  style:grid-template-rows={`repeat(${desktop.container.grid.rows}, minmax(64px, 1fr))`}
  style:grid-auto-flow="dense"
  style:padding={`${desktop.container.config.padding}px`}
  style:--cell-width="{desktop.container.cell.width || 88}px"
  style:--cell-height="{desktop.container.cell.height || 88}px"
  style:--grid-offset="{desktop.container.config.padding}px"
  data-dots={settings.wallpaper.kind === "preset" && settings.wallpaper.preset === "grid" ? "" : undefined}
  data-wallpaper-image={settings.wallpaper.kind === "image" ? "" : undefined}
>
  <Wallpaper />
  {#if desktop.container.grid.columns > 0 && desktop.container.grid.rows > 0}
    {#each drag_targets as target, idx (idx)}
      {#if target.x >= 0 && target.y >= 0 && target.x < desktop.container.grid.columns && target.y < desktop.container.grid.rows}
        <div
          class="pointer-events-none size-full rounded-xl bg-foreground/6 ring-1 ring-foreground/20 ring-inset"
          style:grid-column="{target.x + 1} / span {target.w}"
          style:grid-row="{target.y + 1} / span {target.h}"
        ></div>
      {/if}
    {/each}

    {#each cells as { item, x, y } (item.name)}
      {#if item.kind === "widget"}
        <DesktopWidget
          {item}
          {x}
          {y}
          selected={selection.has(item.name)}
          dimmed={(drag?.names.includes(item.name) ?? false) || clipboard.is_cut(desktop_path(item))}
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
          resizing={resizing?.name === item.name}
          onresizestart={(event) => on_resize_start(event, item)}
        />
      {:else}
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
      {/if}
    {/each}

    {#if resize_preview}
      {@const at = cell_of.get(resize_preview.name)}
      {@const { size, valid } = resize_preview.target}
      {#if at}
        <div
          class={cn(
            "pointer-events-none relative z-10 m-1 self-stretch justify-self-stretch rounded-xl ring-2 ring-inset",
            valid ? "bg-foreground/6 ring-foreground/30" : "bg-error/10 ring-error/60"
          )}
          style:grid-column="{at.x + 1} / span {size.w}"
          style:grid-row="{at.y + 1} / span {size.h}"
        >
          <span
            class={cn(
              "absolute right-2 bottom-2 rounded-md px-1.5 py-0.5 font-mono text-2xs font-medium tabular-nums shadow-raised",
              valid ? "bg-background-light text-foreground/85" : "bg-error text-background"
            )}>{size.w} × {size.h}</span
          >
        </div>
      {/if}
    {/if}
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
  /* The grid wallpaper's dots mark the icon cells; they're drawn here because only the desktop knows the cell size. */
  .desktop-surface[data-dots]::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image: radial-gradient(circle at center, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1.5px);
    background-size: var(--cell-width) var(--cell-height);
    background-position: calc(var(--grid-offset) - var(--cell-width) / 2) calc(var(--grid-offset) - var(--cell-height) / 2);
  }

</style>
