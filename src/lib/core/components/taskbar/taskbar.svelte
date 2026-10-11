<script lang="ts">
  import { cn } from "$lib/core/utils/utils";
  import type { SvelteHTMLElements } from "svelte/elements";
  import kernel, { type SettingsService, TaskbarPosition, type WindowsService } from "$lib/core/api";
  import TaskbarItem from "./taskbar-item.svelte";
  import StartMenu from "./start-menu.svelte";
  import TaskbarClock from "./taskbar-clock.svelte";

  let { class: class_name, ...rest_props }: Pick<SvelteHTMLElements["div"], "class" | "style"> = $props();

  const taskbar = $derived(kernel.service<SettingsService>("settings").taskbar);
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const list = $derived(windows.sorted_list((a, b) => a[1].created_at.getTime() - b[1].created_at.getTime()));

  const vertical = $derived(taskbar.position === TaskbarPosition.LEFT || taskbar.position === TaskbarPosition.RIGHT);
</script>

<!-- A floating dock. The strip pads only the screen-edge sides: the side facing the windows gets its 8px from the
     window area itself (snap inset), so every gap around windows and the dock is the same 8px. -->
<div
  class={cn(
    "flex",
    { bottom: "px-2 pb-2", top: "px-2 pt-2", left: "py-2 pl-2", right: "py-2 pr-2" }[taskbar.position],
    vertical ? "h-full" : "w-full",
    class_name
  )}
  {...rest_props}
>
  <nav
    aria-label="Taskbar"
    class={cn(
      "taskbar-dock",
      "flex items-center gap-1 rounded-2xl bg-background-light/90 p-1.5 shadow-popover backdrop-blur-xl",
      vertical ? "h-full w-13 flex-col" : "h-13 w-full flex-row"
    )}
  >
    <StartMenu />

    <div role="separator" class={cn("shrink-0 bg-foreground/12", vertical ? "mx-auto my-0.5 h-px w-6" : "mx-0.5 h-6 w-px")}></div>

    <div class={cn("flex min-h-0 min-w-0 flex-1 gap-1", vertical ? "flex-col overflow-x-hidden overflow-y-auto px-1" : "flex-row overflow-x-auto overflow-y-hidden py-1")}>
      {#each list as [id, instance] (id)}
        <TaskbarItem {instance} {vertical} />
      {/each}
    </div>

    <TaskbarClock {vertical} />
  </nav>
</div>

<style>
  .taskbar-dock {
    anchor-name: --taskbar-dock;
  }
</style>
