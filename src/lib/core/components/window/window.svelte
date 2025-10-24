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

  const styles = $derived.by(() => {
    if (isMaximized) {
      return {
        inset: "0px",
      };
    }

    if (geometryHandler.drag.active) {
      return {
        left: `${geometryHandler.drag.startLeft}px`,
        top: `${geometryHandler.drag.startTop}px`,
        width: `${instance.bounds.width}px`,
        height: `${instance.bounds.height}px`,
        transform: `translate3d(${geometryHandler.drag.dx}px, ${geometryHandler.drag.dy}px, 0)`,
        // willChange: "transform",
      };
    }

    if (geometryHandler.resize.active) {
      return {
        left: `${geometryHandler.resize.startLeft}px`,
        top: `${geometryHandler.resize.startTop}px`,
        width: `${geometryHandler.resize.width}px`,
        height: `${geometryHandler.resize.height}px`,
        transform: `translate3d(${geometryHandler.resize.dx}px, ${geometryHandler.resize.dy}px, 0)`,
        // willChange: "transform, width, height",
      };
    }

    return {
      left: `${instance.bounds.x}px`,
      top: `${instance.bounds.y}px`,
      width: `${instance.bounds.width}px`,
      height: `${instance.bounds.height}px`,
    };
  });
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
  style:left={styles.left}
  style:top={styles.top}
  style:width={styles.width}
  style:height={styles.height}
  style:inset={styles.inset}
  style:transform={styles.transform}
  style:z-index={instance.zIndex}
  style:contain="size layout paint style"
  style:backface-visibility="hidden"
  tabindex={-1}
>
  <div
    {@attach geometryHandler.createMoveAttachment()}
    class={cn(
      "text-background px-4 py-2 flex items-center justify-between select-none cursor-grab touch-none",
      geometryHandler.drag.active && "cursor-grabbing"
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
        <pre><span class="font-bold">drag:</span> {JSON.stringify(geometryHandler.drag, null, 2)}</pre>
        <pre><span class="font-bold">resize:</span> {JSON.stringify(geometryHandler.resize, null, 2)}</pre>
      </div>
    </WindowContent>
  </div>

  <!-- Resize handles -->
  {#each RESIZE_EDGES as edge (edge)}
    <div
      {@attach geometryHandler.createResizeAttachment(edge)}
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
