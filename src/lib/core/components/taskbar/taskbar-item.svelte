<script lang="ts">
  import kernel, { type WindowsService, WindowFlag, type WindowInstance } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { view_transition } from "$lib/core/utils/view-transition";

  let { instance, vertical }: { instance: WindowInstance; vertical: boolean } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));

  const is_focused = $derived(windows.is_focused(instance.id));
  const is_minimized = $derived(instance.flags.has(WindowFlag.MINIMIZED));
</script>

<button
  aria-label={instance.app.manifest.name}
  aria-pressed={is_focused && !is_minimized}
  title={instance.app.manifest.name}
  class={cn(
    "relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10",
    is_focused && !is_minimized && "bg-foreground/10",
    is_minimized && "text-foreground/65"
  )}
  style:view-transition-name={is_minimized ? `window-${instance.id}` : undefined}
  onclick={() => {
    // Minimizing flies the window into this button and restoring flies it back out: while minimized it carries the
    // window's view-transition name (ADR-014 revision).
    if (is_minimized || is_focused) {
      view_transition(() => windows.toggle_minimize(instance.id));
    } else {
      windows.focus(instance.id);
    }
  }}
>
  <instance.app.manifest.icon class="size-5.5" weight={is_focused && !is_minimized ? "fill" : "duotone"} />
  <!-- Running indicator: a short bar for the focused window, a dot for the rest. -->
  <span
    class={cn(
      "absolute rounded-full transition-all duration-200",
      vertical ? "top-1/2 -left-0.5 w-0.5 -translate-y-1/2" : "-bottom-0.5 left-1/2 h-0.5 -translate-x-1/2",
      is_focused && !is_minimized
        ? cn("bg-primary", vertical ? "h-4" : "w-4")
        : cn("bg-foreground/45", vertical ? "h-1" : "w-1")
    )}
  ></span>
</button>
