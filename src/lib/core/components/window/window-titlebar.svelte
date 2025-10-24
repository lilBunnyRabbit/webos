<script lang="ts">
  import type { WindowId } from "$lib/core/stores";
  import { WM } from "$lib/core/stores";
  import { cn } from "$lib/core/utils";
  import { AppWindowIcon, Copy, Minus, Square, X, ZoomInIcon, ZoomOutIcon } from "@lucide/svelte";

  let { zoom = $bindable(), windowId }: { zoom: number; windowId: WindowId } = $props();

  // Reference the window instance
  const instance = $derived(WM.windows.get(windowId)!);

  // For maximize state
  const isMaximized = $derived(instance.flags.has(WM.WindowFlag.MAXIMIZED));
</script>

<!-- 
ondblclick={() => WM.windows.toggleMaximize(windowId)}
-->
<div class="flex items-center space-x-2">
  <div class="flex items-center justify-center w-4 h-4"><AppWindowIcon /></div>
  <span class="text-sm font-medium">{windowId}</span>
</div>

<div class="flex items-center space-x-1">
  <!-- Zoom controls -->
  <div class="flex items-center space-x-1 mr-2 pl-2 border-l border-background">
    <button
      data-window-button
      class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
      title="Zoom Out (Ctrl+-)"
      onclick={() => {
        zoom = Math.max(zoom - 0.25, 0.25);
      }}
    >
      <ZoomOutIcon class="w-3 h-3" />
    </button>
    <button
      data-window-button
      class="text-xs text-background min-w-8 text-center"
      title="Reset Zoom (Ctrl+0)"
      onclick={() => {
        zoom = 1;
      }}
    >
      {Math.round(zoom * 100)}%
    </button>
    <button
      data-window-button
      class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
      title="Zoom In (Ctrl++)"
      onclick={() => {
        zoom = Math.min(zoom + 0.25, 3);
      }}
    >
      <ZoomInIcon class="w-3 h-3" />
    </button>
  </div>

  <!-- Window Controls -->
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title="Minimize"
    onclick={() => {
      WM.windows.toggleMinimize(windowId);
    }}
  >
    <Minus class="w-3 h-3" />
  </button>
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title={isMaximized ? "Restore" : "Maximize"}
    onclick={() => {
      WM.windows.toggleMaximize(windowId);
    }}
  >
    {#if isMaximized}
      <Copy class="w-3 h-3" />
    {:else}
      <Square class="w-3 h-3" />
    {/if}
  </button>
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title="Close"
    onclick={() => {
      WM.windows.destroy(windowId);
    }}
  >
    <X class="w-3 h-3" />
  </button>
</div>
