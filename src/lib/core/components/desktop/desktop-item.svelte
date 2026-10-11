<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DesktopGridItem, type DesktopService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { ItemHandler } from "./desktop-item.handle.svelte";
  import DesktopItemFace from "./desktop-item-face.svelte";
  import { item_menu, remove_item } from "./desktop-actions";

  let { item, x, y }: { item: DesktopGridItem; x: number; y: number } = $props();
  const desktop = $derived(kernel.service<DesktopService>("desktop"));

  function open(event: MouseEvent | KeyboardEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const anchor = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom };
    desktop.open(item, { anchor });
  }

  // The desktop keys items by cell, so x and y never change for this instance.
  const item_handler = new ItemHandler(untrack(() => ({ x, y })), (position) => {
    desktop.move_item({ x, y }, position);
  });
</script>

<button
  class={cn(
    "group flex size-full flex-col items-center gap-1.5 rounded-xl px-1 pt-2 transition-colors duration-150 select-none",
    "hover:bg-foreground/6 focus:bg-foreground/8",
    item_handler.move_state?.type === "move" && "opacity-40"
  )}
  style:grid-column={x + 1}
  style:grid-row={y + 1}
  ondblclick={open}
  oncontextmenu={(event) => {
    event.preventDefault();
    event.currentTarget.focus();
    item_menu(item, { x, y }, { x: event.clientX, y: event.clientY });
  }}
  onkeydown={(event) => {
    if (document.activeElement !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.key === "Enter") open(event);
    else if (event.key === "Delete") remove_item(item, { x, y });
    else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      item_menu(item, { x, y }, { x: rect.left + rect.width / 2, y: rect.bottom });
    } else return;
    event.preventDefault();
  }}
  {@attach item_handler.drag_attachment.bind(item_handler)}
>
  <DesktopItemFace {item} />
</button>

{#if item_handler.move_state?.type === "move"}
  {#if x !== item_handler.move_state.new_position.x || y !== item_handler.move_state.new_position.y}
    <div
      class={cn(
        "size-full rounded-xl bg-foreground/6 ring-1 ring-foreground/20 ring-inset transition-all duration-150",
        item_handler.is_blocked && "bg-error/10 ring-error/50"
      )}
      style:grid-column={item_handler.move_state.new_position.x + 1}
      style:grid-row={item_handler.move_state.new_position.y + 1}
    ></div>
  {/if}

  <div
    bind:this={item_handler.preview_element}
    class="pointer-events-none fixed -top-24 -left-24 z-50 flex flex-col items-center gap-1.5 px-1 pt-2 cursor-grabbing"
    style:width="{desktop.container.cell.width}px"
    style:height="{desktop.container.cell.height}px"
  >
    <DesktopItemFace {item} />
  </div>
{/if}
