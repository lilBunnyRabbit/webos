<script lang="ts">
  import kernel, { type DesktopWindowsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { view_transition } from "$lib/core/utils/view-transition";

  let { vertical }: { vertical: boolean } = $props();

  const windows = $derived(kernel.service<DesktopWindowsService>("windows"));
</script>

<!-- Windows 11's sliver: a thin strip at the far end, so the whole dock end is a target without taking a slot. -->
<button
  aria-label="Show desktop"
  aria-pressed={windows.showing_desktop}
  title="Show desktop (Alt+Shift+D)"
  class={cn(
    "group grid shrink-0 place-items-center rounded-md transition-colors duration-150 hover:bg-foreground/10",
    vertical ? "h-3 w-full" : "h-full w-3"
  )}
  onclick={() => view_transition(() => windows.toggle_desktop())}
>
  <span
    class={cn(
      "rounded-full transition-colors duration-150",
      windows.showing_desktop ? "bg-primary" : "bg-foreground/20 group-hover:bg-foreground/45",
      vertical ? "h-px w-5" : "h-5 w-px"
    )}
  ></span>
</button>
