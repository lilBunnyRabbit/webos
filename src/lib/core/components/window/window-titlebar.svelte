<script lang="ts">
  import {
    Copy as CopyIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    Minus as MinusIcon,
    Square as SquareIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import kernel, { type WindowsService, WindowFlag, type WindowId } from "$lib/core/api";

  let { zoom = $bindable(), window_id }: { zoom: number; window_id: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(window_id)!);

  // For maximize state
  const is_maximized = $derived(instance.flags.has(WindowFlag.MAXIMIZED));
</script>

<!-- 
ondblclick={() => windows.toggle_maximize(window_id)}
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
      <MagnifyingGlassMinusIcon class="w-3 h-3" />
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
      <MagnifyingGlassPlusIcon class="w-3 h-3" />
    </button>
  </div>

  <!-- Window Controls -->
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title="Minimize"
    onclick={() => {
      windows.toggle_minimize(window_id);
    }}
  >
    <MinusIcon class="w-3 h-3" />
  </button>
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title={is_maximized ? "Restore" : "Maximize"}
    onclick={() => {
      windows.toggle_maximize(window_id);
    }}
  >
    {#if is_maximized}
      <CopyIcon class="w-3 h-3" />
    {:else}
      <SquareIcon class="w-3 h-3" />
    {/if}
  </button>
  <button
    data-window-button
    class="w-6 h-6 flex items-center justify-center hover:bg-background hover:text-secondary rounded transition-colors touch-auto"
    title="Close"
    onclick={() => {
      windows.destroy(window_id);
    }}
  >
    <XIcon class="w-3 h-3" />
  </button>
</div>
