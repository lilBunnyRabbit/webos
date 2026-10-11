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
  const is_focused = $derived(windows.is_focused(id));
  const snap_position = $derived(instance.snap_zone ? WindowGeometryHandler.get_snap_position(instance.snap_zone) : null);

  // The window manager keys windows by id, so it never changes for this instance.
  const geometry_handler = new WindowGeometryHandler(untrack(() => id));

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
    class="absolute pointer-events-none rounded-xl bg-primary/10 ring-1 ring-primary/60 backdrop-blur-[2px] transition-all duration-200 ease-out animate-pop-in"
    style:left
    style:top
    style:width
    style:height
    style:z-index={instance.order}
  ></div>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  onpointerdowncapture={() => windows.focus(id)}
  onfocusin={() => windows.focus(id)}
  data-window-id={id}
  class={cn(
    "absolute overflow-hidden pointer-events-auto grid grid-cols-1 grid-rows-[2.5rem_1fr]",
    "rounded-xl bg-background ring-1 transition-[box-shadow] duration-200",
    is_focused ? "shadow-window-focused ring-foreground/16" : "shadow-window ring-foreground/8",
    is_maximized && !geometry_handler.move.active && "rounded-none shadow-none ring-0",
    is_minimized && "hidden"
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
  <!-- Window titlebar. Double-click to maximize is a pointer shortcut; the maximize button is the accessible path. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    {@attach geometry_handler.drag_attachment()}
    ondblclick={(event) => {
      if (!(event.target as Element).closest("[data-window-button]")) windows.toggle_maximize(id);
    }}
    class={cn(
      "group/titlebar flex items-center justify-between gap-2 border-b border-foreground/8 bg-background-light pr-1.5 pl-3 select-none touch-none",
      geometry_handler.move.active && "cursor-grabbing"
    )}
  >
    <WindowTitlebar bind:zoom window_id={id} focused={is_focused} />
  </div>

  <!-- Window content -->
  <div
    class="overflow-hidden bg-background [content-visibility:auto]"
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
    top: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.s {
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.e {
    right: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .resize-handle.w {
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .resize-handle.ne {
    top: 0;
    right: 0;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
  .resize-handle.nw {
    top: 0;
    left: 0;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.se {
    bottom: 0;
    right: 0;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.sw {
    bottom: 0;
    left: 0;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
</style>
