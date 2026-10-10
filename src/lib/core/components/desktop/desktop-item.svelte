<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DesktopGridItem, type DesktopService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { ItemHandler } from "./desktop-item.handle.svelte";
  import DesktopItemFace from "./desktop-item-face.svelte";

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
    "group w-full h-full flex flex-col items-center pt-2 px-1 gap-y-1 overflow-hidden hover:bg-foreground/10 rounded hover:overflow-visible cursor-grab",
    item_handler.move_state?.type === "move" && "opacity-50",
    (!item_handler.move_state || item_handler.move_state.type === "start") &&
      "focus:outline-2 focus:outline-accent focus:bg-accent/10 focus:text-accent"
  )}
  style:grid-column={x + 1}
  style:grid-row={y + 1}
  ondblclick={open}
  onkeyup={(e) => {
    if (document.activeElement !== e.currentTarget) return;
    if (e.key === "Enter") open(e);
    if (e.key === "Delete") {
      desktop.remove_item({ x, y }).catch((error) => console.error(`[Desktop] Failed to remove ${item.name}`, error));
    }
  }}
  {@attach item_handler.drag_attachment.bind(item_handler)}
>
  <DesktopItemFace {item} />
</button>

{#if item_handler.move_state?.type === "move"}
  {#if x !== item_handler.move_state.new_position.x || y !== item_handler.move_state.new_position.y}
    <div
      class={cn(
        "w-full h-full bg-foreground/30 transition-all rounded-xl border-2 border-foreground/30",
        item_handler.is_blocked && "bg-error/30 border-error/30"
      )}
      style:grid-column={item_handler.move_state.new_position.x + 1}
      style:grid-row={item_handler.move_state.new_position.y + 1}
    ></div>
  {/if}

  <div
    bind:this={item_handler.preview_element}
    class="fixed flex flex-col items-center pt-2 px-1 gap-y-1 overflow-hidden cursor-grabbing -left-16 -top-16"
    style:width="{desktop.container.cell.width}px"
    style:height="{desktop.container.cell.height}px"
  >
    <DesktopItemFace {item} />
  </div>
{/if}
