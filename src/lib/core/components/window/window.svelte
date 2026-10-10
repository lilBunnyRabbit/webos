<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type WindowsService, type WindowId, WindowFlag } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import WindowContent from "./window-content.svelte";
  import WindowTitlebar from "./window-titlebar.svelte";
  import { RESIZE_EDGES, WindowGeometryHandler } from "./window.handler.svelte";

  let { id }: { id: WindowId } = $props();
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(id)!);

  const is_maximized = $derived(instance.flags.has(WindowFlag.MAXIMIZED));
  const is_minimized = $derived(instance.flags.has(WindowFlag.MINIMIZED));
  const snap_position = $derived(instance.snap_zone ? WindowGeometryHandler.get_snap_position(instance.snap_zone) : null);

  // The window manager keys windows by id, so it never changes for this instance.
  const geometry_handler = new WindowGeometryHandler(untrack(() => id));

  // TODO: focus not triggered if the other window is resized
  
  // Internal state
  let zoom = $state(1);

  // TODO: is there a better way
  const left = $derived(
    geometry_handler.move.active
      ? `${geometry_handler.move.start.left}px`
      : is_maximized
        ? "0px"
        : snap_position
          ? snap_position.left
          : `${instance.bounds.x}px`
  );
  const top = $derived(
    geometry_handler.move.active
      ? `${geometry_handler.move.start.top}px`
      : is_maximized
        ? "0px"
        : snap_position
          ? snap_position.top
          : `${instance.bounds.y}px`
  );
  const width = $derived(
    geometry_handler.move.active
      ? `${geometry_handler.move.width}px`
      : is_maximized
        ? "100%"
        : snap_position
          ? snap_position.width
          : `${instance.bounds.width}px`
  );
  const height = $derived(
    geometry_handler.move.active
      ? `${geometry_handler.move.height}px`
      : is_maximized
        ? "100%"
        : snap_position
          ? snap_position.height
          : `${instance.bounds.height}px`
  );
  const transform = $derived(geometry_handler.move.active ? `translate3d(${geometry_handler.move.dx}px, ${geometry_handler.move.dy}px, 0)` : "none");
</script>

{#if !is_maximized && !is_minimized && geometry_handler.snap_zone}
  {@const { left, top, width, height } = WindowGeometryHandler.get_snap_position(geometry_handler.snap_zone)}
  <div
    class="absolute pointer-events-none bg-primary/30 border-2 border-primary rounded-lg transition-all duration-150"
    style:left
    style:top
    style:width
    style:height
    style:z-index={instance.order}
  ></div>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  onfocus={() => windows.focus(id)}
  data-window-id={id}
  class={cn(
    "absolute overflow-hidden pointer-events-auto",
    "bg-foreground shadow-window rounded-sm border-2 border-foreground grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
    is_maximized && !geometry_handler.move.active && "rounded-none border-none",
    snap_position && !is_maximized && !geometry_handler.move.active && "bg-primary border-primary",
    is_minimized && "hidden",
    // flags.has(WindowManagerFlag.PROFILER_ENABLED) && "bg-accent border-accent"
  )}
  style:left
  style:top
  style:width
  style:height
  style:transform
  style:z-index={instance.order}
  style:contain="size layout paint style"
  style:backface-visibility="hidden"
  tabindex={-1}
>
  <!-- Window titlebar -->
  <div
    {@attach geometry_handler.drag_attachment()}
    class={cn(
      "text-background px-4 py-2 flex items-center justify-between select-none cursor-grab touch-none",
      geometry_handler.move.active && "cursor-grabbing"
    )}
  >
    <WindowTitlebar bind:zoom window_id={id} />
  </div>

  <!-- Window content -->
  <div
    class={cn(
      "overflow-hidden bg-background rounded-t-sm [content-visibility:auto]",
      is_maximized && !geometry_handler.move.active && "rounded-none"
    )}
    style:contain-intrinsic-size={`${instance.bounds.width}px ${instance.bounds.height}px`}
  >
    <WindowContent window_id={id} {zoom}>
      <div class="flex flex-wrap gap-2 p-3 font-mono text-sm">
        <pre><span class="font-bold">bounds:</span> {JSON.stringify(instance.bounds, null, 2)}</pre>
        <pre><span class="font-bold">move:</span> {JSON.stringify(geometry_handler.move, null, 2)}</pre>
      </div>
    </WindowContent>
  </div>

  <!-- Resize handles -->
  {#if !is_maximized && !is_minimized}
    {#each RESIZE_EDGES as edge (edge)}
      <div {@attach geometry_handler.resize_attachment(edge)} class="resize-handle {edge}" style:touch-action="none"></div>
    {/each}
  {/if}
</div>

<style>
  .resize-handle {
    position: absolute;
    z-index: 2;
  }
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
