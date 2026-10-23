<script lang="ts">
  import kernel, { type DesktopWindowsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { window_transition } from "$lib/core/components/window/window-transition.svelte";

  let { vertical }: { vertical: boolean } = $props();

  const windows = $derived(kernel.service<DesktopWindowsService>("windows"));
</script>

<!-- Windows 11's sliver: a thin strip at the far end, so the whole dock end is a target without taking a slot. -->
<button
  aria-label="Show desktop"
  aria-pressed={windows.showing_desktop}
  title="Show desktop (Alt+Shift+D)"
  class={cn(
    "group grid shrink-0 place-items-center rounded-md transition-[background-color,box-shadow] duration-150 hover:bg-background-lighter hover:text-foreground hover:shadow-control active:shadow-pressed",
    vertical ? "h-[calc(var(--taskbar-item)*0.3)] w-full" : "h-full w-[calc(var(--taskbar-item)*0.3)]"
  )}
  onclick={() => window_transition(windows.list(), () => windows.toggle_desktop())}
>
  <span
    class={cn(
      "rounded-full transition-colors duration-150",
      windows.showing_desktop ? "bg-primary" : "bg-foreground/20 group-hover:bg-foreground/45",
      vertical ? "h-px w-[calc(var(--taskbar-item)*0.5)]" : "h-[calc(var(--taskbar-item)*0.5)] w-px"
    )}
  ></span>
</button>
