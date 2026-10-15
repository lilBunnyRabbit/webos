<script lang="ts">
  import kernel, { type ClipboardService, type DesktopItem as Item, type GridDesktopService, type SettingsService } from "$lib/core/api";
  import DesktopItem from "./desktop-item.svelte";
  import DesktopWidget from "./desktop-widget.svelte";
  import { grid_items } from "$lib/core/api/services/desktop/helper";
  import { DesktopHandler } from "./desktop.handler.svelte";
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

  const handler = new DesktopHandler(() => cells);
  const selection = $derived(handler.selection);

  let surface: HTMLElement | null = $state(null);

  const is_mod = (event: MouseEvent | KeyboardEvent) => event.ctrlKey || event.metaKey;

  const RESIZE_KEYS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

  function focused_item(): Item | undefined {
    const name = (document.activeElement as HTMLElement | null)?.dataset?.desktopName;
    return cells.find(({ item }) => item.name === name)?.item;
  }

  function on_key_down(event: KeyboardEvent) {
    // Keys typed inside a widget are the widget's (Mod+A in a sticky selects its text, not the desktop).
    if ((event.target as Element).closest("[data-widget-body]")) return;
    const key = event.key.toLowerCase();
    if (is_mod(event) && key === "a") {
      handler.select_all();
    } else if (event.key === "Escape" && handler.resizing) {
      handler.cancel_resize();
    } else if (event.key === "Escape" && selection.size > 0) {
      handler.clear();
    } else if (is_mod(event) && key === "v") {
      paste();
    } else {
      const item = focused_item();
      if (!item) return;
      const items = handler.targets(item);
      const rect = (document.activeElement as HTMLElement).getBoundingClientRect();
      const point = { x: rect.left + rect.width / 2, y: rect.bottom };
      if (event.key === "Enter" && event.altKey && items.length === 1) void show_properties(item);
      else if (event.key === "Enter") open_items(items, point);
      else if (event.key === "F2" && items.length === 1) rename_item(item);
      else if (is_mod(event) && key === "c") copy_items(items);
      else if (is_mod(event) && key === "x") cut_items(items);
      else if (event.key === "Delete" || (event.key === "Backspace" && event.metaKey)) remove_items(items);
      else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) item_menu(items, point);
      else if (event.shiftKey && !is_mod(event) && !event.altKey && event.key in RESIZE_KEYS && item.kind === "widget") {
        const [dw, dh] = RESIZE_KEYS[event.key];
        if (!handler.resize_by(item, dw, dh)) return;
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
  {@attach handler.pointer_attachment()}
  {@attach handler.drop_attachment()}
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
    {#each handler.drag_targets as target, idx (idx)}
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
          dimmed={(handler.drag?.names.includes(item.name) ?? false) || clipboard.is_cut(desktop_path(item))}
          onselect={(event) => handler.select(item.name, event)}
          onopen={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
          onmenu={(event) => {
            handler.ensure_selected(item);
            item_menu(handler.targets(item), { x: event.clientX, y: event.clientY });
          }}
          ondragstart={(event) => handler.drag_start(event, item)}
          ondragend={() => handler.drag_end()}
          resizing={handler.resizing?.name === item.name}
          onresizestart={(event) => handler.resize_start(event, item, surface)}
        />
      {:else}
      <DesktopItem
        {item}
        {x}
        {y}
        selected={selection.has(item.name)}
        dimmed={(handler.drag?.names.includes(item.name) ?? false) || clipboard.is_cut(desktop_path(item))}
        drop_target={handler.hover?.folder === item.name}
        onselect={(event) => handler.select(item.name, event)}
        onopen={(event) => desktop.open(item, { anchor: { x: event.clientX, y: event.clientY } })}
        onmenu={(event) => {
          handler.ensure_selected(item);
          item_menu(handler.targets(item), { x: event.clientX, y: event.clientY });
        }}
        ondragstart={(event) => handler.drag_start(event, item)}
        ondragend={() => handler.drag_end()}
      />
      {/if}
    {/each}

    {#if handler.resize_preview}
      {@const at = handler.cell_of.get(handler.resize_preview.name)}
      {@const { size, valid } = handler.resize_preview.target}
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

  {#if handler.marquee_rect}
    {@const marquee_rect = handler.marquee_rect}
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
