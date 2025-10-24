<script lang="ts">
  import type { WindowId } from "$lib/core/stores";
  import { WM } from "$lib/core/stores";
  import { RESIZE_EDGES, WindowGeometryHandler } from "./window-geometry.svelte";

  let { windowId }: { windowId: WindowId } = $props();
  const instance = $derived(WM.windows.get(windowId)!);
  const gh = new WindowGeometryHandler(windowId);

  const { drag: d, resize: r } = gh;
  const transform = $derived(
    (d.active ? `translate3d(${d.dx}px, ${d.dy}px, 0) ` : "") + (r.active ? `translate3d(${r.dx}px, ${r.dy}px, 0)` : "")
  );
</script>

<div
  onfocus={() => WM.windows.focus(windowId)}
  data-window-id={windowId}
  class="absolute overflow-hidden pointer-events-auto bg-background border border-foreground/20 rounded-xl shadow-lg"
  style:left={`${d.active ? d.startLeft : r.active ? r.startLeft : instance.bounds.x}px`}
  style:top={`${d.active ? d.startTop : r.active ? r.startTop : instance.bounds.y}px`}
  style:width={`${r.active ? r.width : instance.bounds.width}px`}
  style:height={`${r.active ? r.height : instance.bounds.height}px`}
  style:z-index={instance.zIndex}
  style:transform
  style:will-change={d.active || r.active ? "transform" : ""}
  style:contain="size layout paint style"
  style:backface-visibility="hidden"
>
  <!-- Titlebar -->
  <div
    {@attach gh.createMoveAttachment()}
    class="h-9 px-3 flex items-center gap-2 cursor-grab active:cursor-grabbing border-b border-foreground/10 bg-background/70 select-none"
    style:touch-action="none"
  >
    <div class="text-sm opacity-80 truncate">{`App – ${windowId}`}</div>
    <div class="ml-auto flex gap-2" style:touch-action="auto">
      <button class="size-6 rounded hover:bg-foreground/10">—</button>
      <button class="size-6 rounded hover:bg-foreground/10">▢</button>
      <button class="size-6 rounded hover:bg-foreground/10" onclick={() => WM.windows.destroy(windowId)}>✕</button>
    </div>
  </div>

  <!-- Content [content-visibility:auto] [contain-intrinsic-size:800px_600px] -->
  <div class="w-full h-full overflow-auto">
    <div class="p-3 font-mono text-sm">
      <pre>
<span class="font-bold">bounds:</span> {JSON.stringify(instance.bounds, null, 2)},
<span class="font-bold">drag:</span> {JSON.stringify(d, null, 2)},
<span class="font-bold">resize:</span> {JSON.stringify(r, null, 2)}
</pre>
    </div>
    {instance.tmp__content}
  </div>

  <!-- Resize handles -->
  {#each RESIZE_EDGES as edge (edge)}
    <div {@attach gh.createResizeAttachment(edge)} class="handle {edge}" style:touch-action="none"></div>
  {/each}
</div>

<style>
  .handle {
    position: absolute;
    z-index: 2;
  }

  /* Edge handles */
  .handle.n {
    top: -2px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .handle.s {
    bottom: -2px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .handle.e {
    right: -2px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .handle.w {
    left: -2px;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  /* Corner handles */
  .handle.ne {
    top: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
  .handle.nw {
    top: -2px;
    left: -2px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .handle.se {
    bottom: -2px;
    right: -2px;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .handle.sw {
    bottom: -2px;
    left: -2px;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
</style>
