<script lang="ts">
  import { AppWindowIcon, Copy, Minus, Square, X, ZoomInIcon, ZoomOutIcon } from "@lucide/svelte";
  import kernel, { type WindowsService, WindowFlag, type WindowId } from "$lib/core/api";

  let { zoom = $bindable(), windowId }: { zoom: number; windowId: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(windowId)!);

  // For maximize state
  const is_maximized = $derived(instance.flags.has(WindowFlag.MAXIMIZED));
</script>

<!-- 
ondblclick={() => WM.windows.toggleMaximize(windowId)}
-->
<div class="flex items-center space-x-2">
  <div class="flex items-center justify-center w-4 h-4"><instance.app.manifest.icon class="w-4 h-4" /></div>
  <span class="text-sm font-medium">{instance.app.manifest.name}</span>
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
      windows.toggle_minimize(windowId);
    }}
  >
    <Minus class="w-3 h-3" />
  </button>
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title={is_maximized ? "Restore" : "Maximize"}
    onclick={() => {
      windows.toggle_maximize(windowId);
    }}
  >
    {#if is_maximized}
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
      windows.destroy(windowId);
    }}
  >
    <X class="w-3 h-3" />
  </button>
</div>
