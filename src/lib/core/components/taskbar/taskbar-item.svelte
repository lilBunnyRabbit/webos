<script lang="ts">
  import kernel, { type WindowsService, type WindowId, WindowFlag, type WindowInstance } from "$lib/core/api";
  import { cn } from "$lib/core/utils";

  let { instance }: { instance: WindowInstance } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));

  const is_focused = $derived(windows.is_focused(instance.id));
  const is_minimized = $derived(instance.flags.has(WindowFlag.MINIMIZED));
</script>

<button
  class={cn(
    "group relative flex justify-center items-center rounded-sm transition-all duration-150 min-w-0 shrink-0 w-10 h-10 hover:bg-foreground/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-6 data-[state=open]:bg-primary/10",
    is_focused && !is_minimized && "text-primary",
    !is_minimized && "bg-primary/10"
  )}
  onclick={() => {
    if (is_minimized || is_focused) {
      windows.toggle_minimize(instance.id);
    } else {
      windows.focus(instance.id);
    }
  }}
>
  <instance.app.manifest.icon />
</button>
