<script lang="ts">
  import type { WindowId } from "$lib/core/stores";
  import { WM } from "$lib/core/stores";
  import { RESIZE_EDGES, WindowGeometryHandler } from "./window.handler.svelte";
  import WindowTitlebar from "./window-titlebar.svelte";
  import WindowContent from "./window-content.svelte";
  import { cn } from "$lib/core/utils";

  let { windowId }: { windowId: WindowId } = $props();
  const instance = $derived(WM.windows.get(windowId)!);
  const isMaximized = $derived(instance.flags.has(WM.WindowFlag.MAXIMIZED));
  const geometryHandler = new WindowGeometryHandler(windowId);
  let zoom = $state(1);

  const left = $derived(
    isMaximized ? "0px" : geometryHandler.move.active ? `${geometryHandler.move.startLeft}px` : `${instance.bounds.x}px`
  );
  const top = $derived(
    isMaximized ? "0px" : geometryHandler.move.active ? `${geometryHandler.move.startTop}px` : `${instance.bounds.y}px`
  );
  const width = $derived(
    isMaximized ? "100%" : geometryHandler.move.active ? `${geometryHandler.move.width}px` : `${instance.bounds.width}px`
  );
  const height = $derived(
    isMaximized ? "100%" : geometryHandler.move.active ? `${geometryHandler.move.height}px` : `${instance.bounds.height}px`
  );
  const transform = $derived(
    isMaximized
      ? "none"
      : geometryHandler.move.active
        ? `translate3d(${geometryHandler.move.dx}px, ${geometryHandler.move.dy}px, 0)`
        : "none"
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  onfocus={() => WM.windows.focus(windowId)}
  data-window-id={windowId}
  class={cn(
    "absolute overflow-hidden pointer-events-auto",
    "bg-foreground shadow-window rounded-sm border-2 border-foreground grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
    isMaximized && "rounded-none border-none"
    // instance.snapZone && !isMaximized && "bg-primary border-primary",
    // flags.has(WindowManagerFlag.PROFILER_ENABLED) && "bg-accent border-accent"
  )}
  style:left
  style:top
  style:width
  style:height
  style:transform
  style:z-index={instance.zIndex}
  style:contain="size layout paint style"
  style:backface-visibility="hidden"
  tabindex={-1}
>
  <div
    {@attach geometryHandler.dragAttachment()}
    class={cn(
      "text-background px-4 py-2 flex items-center justify-between select-none cursor-grab touch-none",
      geometryHandler.move.active && "cursor-grabbing"
    )}
  >
    <WindowTitlebar bind:zoom {windowId} />
  </div>

  <div
    class={cn("overflow-hidden bg-background rounded-t-sm [content-visibility:auto]", isMaximized && "rounded-none")}
    style:contain-intrinsic-size={`${instance.bounds.width}px ${instance.bounds.height}px`}
  >
    <WindowContent {windowId} {zoom}>
      <div class="flex flex-wrap gap-2 p-3 font-mono text-sm">
        <pre><span class="font-bold">bounds:</span> {JSON.stringify(instance.bounds, null, 2)}</pre>
        <pre><span class="font-bold">move:</span> {JSON.stringify(geometryHandler.move, null, 2)}</pre>
      </div>
    </WindowContent>
  </div>

  <!-- Resize handles -->
  {#each RESIZE_EDGES as edge (edge)}
    <div
      {@attach geometryHandler.resizeAttachment(edge)}
      class="resize-handle {edge}"
      style:touch-action="none"
    ></div>
  {/each}
</div>

<style>
  .resize-handle {
    position: absolute;
    z-index: 2;
  }

  /* Edge handles */
  .resize-handle.n {
    top: -2px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.s {
    bottom: -2px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.e {
    right: -2px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .resize-handle.w {
    left: -2px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  /* Corner handles */
  .resize-handle.ne {
    top: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
  .resize-handle.nw {
    top: -2px;
    left: -2px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.se {
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.sw {
    bottom: -2px;
    left: -2px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
</style>
