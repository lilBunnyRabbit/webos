<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DesktopGridItem, type DesktopService, type AppsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { ItemHandler } from "./desktop-item.handle.svelte";

  let { item, x, y }: { item: DesktopGridItem; x: number; y: number } = $props();
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const manifest = $derived(apps.get(item.app_id));

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
  ondblclick={() => {
    if (manifest) {
      apps.launch(item.app_id, item.props);
    }
  }}
  onkeyup={(e) => {
    if (e.key === "Delete" && document.activeElement === e.currentTarget) {
      desktop.remove_item({ x, y });
    }
  }}
  {@attach item_handler.drag_attachment.bind(item_handler)}
>
  {#if manifest}
    <div class="h-8 w-8 overflow-hidden shrink-0">
      <manifest.icon class="h-full w-auto" />
    </div>
    <span class="text-xs text-foreground/70 max-w-full px-1 line-clamp-1">{manifest.name}</span>
  {:else}
    <span class="text-xs text-foreground/70 max-w-full px-1 line-clamp-4">Unknown ({item.app_id})</span>
  {/if}
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
    {#if manifest}
      <div class="h-8 w-8 overflow-hidden shrink-0">
        <manifest.icon class="h-full w-auto" />
      </div>

      <span class="text-xs text-foreground/70 max-w-full px-1 line-clamp-1">{manifest.name}</span>
    {:else}
      <span class="text-xs text-foreground/70 max-w-full px-1 line-clamp-4">Unknown ({item.app_id})</span>
    {/if}
  </div>
{/if}
