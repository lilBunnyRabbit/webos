<script lang="ts">
  import { cn } from "$lib/core/utils/utils";
  import type { SvelteHTMLElements } from "svelte/elements";
  import kernel, { type SettingsService, TaskbarPosition, WindowFlag, type WindowsService } from "$lib/core/api";
  import TaskbarItem from "./taskbar-item.svelte";
  import StartMenu from "./start-menu.svelte";
  import TaskbarTray from "./taskbar-tray.svelte";
  import TerminalButton from "./terminal-button.svelte";

  let { class: class_name, ...rest_props }: Pick<SvelteHTMLElements["div"], "class" | "style"> = $props();

  const taskbar = $derived(kernel.service<SettingsService>("settings").taskbar);
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const list = $derived(windows.sorted_list((a, b) => a[1].created_at.getTime() - b[1].created_at.getTime()));

  // A maximized window would meet the floating dock's rounded corners with its square edge, so the dock joins it.
  const flush = $derived(list.some(([, w]) => w.flags.has(WindowFlag.MAXIMIZED) && !w.flags.has(WindowFlag.MINIMIZED)));

  const vertical = $derived(taskbar.position === TaskbarPosition.LEFT || taskbar.position === TaskbarPosition.RIGHT);
</script>

<!-- A floating dock. The strip pads only the screen-edge sides: the side facing the windows gets its 8px from the
     window area itself (snap inset), so every gap around windows and the dock is the same 8px. With a maximized
     window it goes flush: an edge bar joined to the window. -->
<div
  class={cn(
    "flex",
    !flush && { bottom: "px-2 pb-2", top: "px-2 pt-2", left: "py-2 pl-2", right: "py-2 pr-2" }[taskbar.position],
    vertical ? "h-full" : "w-full",
    class_name
  )}
  {...rest_props}
>
  <!-- Named so going flush morphs inside the maximize/minimize view transition, together with the window. -->
  <nav
    aria-label="Taskbar"
    style:view-transition-name="taskbar-dock"
    class={cn(
      "relative flex items-center gap-1 bg-background-light/90 p-1.5 backdrop-blur-xl",
      flush
        ? { bottom: "border-t", top: "border-b", left: "border-r", right: "border-l" }[taskbar.position] + " border-foreground/8"
        : "rounded-2xl shadow-popover",
      vertical ? "h-full w-13 flex-col" : "h-13 w-full flex-row"
    )}
  >
    <!-- The popovers anchor here, so in flush mode they still keep 8px off the screen's corners. -->
    <div class={cn("taskbar-dock pointer-events-none absolute", flush ? (vertical ? "inset-x-0 inset-y-2" : "inset-x-2 inset-y-0") : "inset-0")}></div>

    <StartMenu />

    <div role="separator" class={cn("shrink-0 bg-foreground/12", vertical ? "mx-auto my-0.5 h-px w-6" : "mx-0.5 h-6 w-px")}></div>

    <div class={cn("flex min-h-0 min-w-0 flex-1 gap-1", vertical ? "flex-col overflow-x-hidden overflow-y-auto px-1" : "flex-row overflow-x-auto overflow-y-hidden py-1")}>
      {#each list as [id, instance] (id)}
        <TaskbarItem {instance} {vertical} />
      {/each}
    </div>

    <TerminalButton />
    <TaskbarTray {vertical} />
  </nav>
</div>

<style>
  .taskbar-dock {
    anchor-name: --taskbar-dock;
  }
</style>
