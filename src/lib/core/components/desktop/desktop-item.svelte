<script lang="ts">
  import kernel, { type AppId, type DesktopService, type AppsService } from "$lib/core/api";
  import type { Position } from "$lib/core/utils/type";
  import { cn } from "$lib/core/utils";
  import { ItemHandler } from "./desktop-item.handle.svelte";
  import { PiIcon } from "@lucide/svelte";

  let { id, x, y }: { id: AppId; x: number; y: number } = $props();
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  const item_handler = new ItemHandler({ x, y }, (position) => {
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
  ondblclick={() => apps.launch(id)}
  onkeyup={(e) => {
    if (e.key === "Delete" && document.activeElement === e.currentTarget) {
      desktop.remove_item({ x, y });
    }
  }}
  {@attach item_handler.drag_attachment.bind(item_handler)}
>
  <div class="h-8 w-8 overflow-hidden shrink-0">
    <PiIcon class="h-full w-auto" />
  </div>
  <span
    class="text-xs text-foreground/70 max-w-full px-1 line-clamp-1 group-hover:line-clamp-none group-focus:text-accent/70"
  >
    {id}
  </span>
</button>

{#if item_handler.move_state?.type === "move"}
  {#if x !== item_handler.move_state.new_position.x || y !== item_handler.move_state.new_position.y}
    <div
      class={cn(
        "w-full h-full bg-foreground/30 transition-all rounded-xl border-2 border-foreground/30",
        item_handler.is_blocked && "bg-red-500/30 border-red-500/30"
      )}
      style:grid-column={item_handler.move_state.new_position.x + 1}
      style:grid-row={item_handler.move_state.new_position.y + 1}
    ></div>
  {/if}

  <div
    bind:this={item_handler.preview_element}
    class="fixed flex flex-col items-center pt-2 px-1 gap-y-1 overflow-hidden cursor-grabbing -left-16 -top-16"
    style:width={desktop.container.cell.width}
    style:height={desktop.container.cell.height}
  >
    <div class="h-8 w-8 overflow-hidden shrink-0">
      <PiIcon class="h-full w-auto" />
    </div>

    <span class="text-xs text-foreground/70 max-w-full px-1 line-clamp-1">{id}</span>
  </div>
{/if}
