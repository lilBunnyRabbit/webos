<script lang="ts">
  import { cn } from "$lib/core/utils/utils";
  import type { SvelteHTMLElements } from "svelte/elements";
  import kernel, {
    type SettingsService,
    TaskbarPosition,
    type WindowsService,
  } from "$lib/core/api";
  import TaskbarItem from "./taskbar-item.svelte";
  import StartMenu from "./start-menu.svelte";
  let { class: class_name, ...rest_props }: Pick<SvelteHTMLElements["div"], "class" | "style"> = $props();

  const taskbar = $derived(kernel.service<SettingsService>("settings").taskbar);
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const list = $derived(windows.sorted_list((a, b) => a[1].created_at.getTime() - b[1].created_at.getTime()));

  const orientation = $derived(
    taskbar.position === TaskbarPosition.LEFT || taskbar.position === TaskbarPosition.RIGHT ? "vertical" : "horizontal"
  );
</script>

<div
  class={cn(
    "grid shrink-0",
    orientation === "vertical"
      ? "grid-cols-1 grid-rows-[auto_1fr_auto] items-end overflow-y-hidden"
      : "grid-cols-[auto_1fr_auto] grid-rows-1 items-end overflow-x-hidden",
    {
      bottom: "border-t",
      left: "border-r",
      right: "border-l",
      top: "border-b",
    }[taskbar.position],
    "bg-background/40 backdrop-blur-xl shadow-2xl border-foreground/20",
    class_name
  )}
  {...rest_props}
>
  <div class={cn("border-foreground/20", orientation === "vertical" ? "border-b py-2 px-1.5" : "border-r py-1.5 px-2")}>
    <StartMenu />
  </div>

  <div
    class={cn(
      "flex gap-1.5",
      {
        bottom: "flex-row w-full items-end overflow-x-auto py-1.5 px-2",
        left: "flex-col h-full items-start overflow-y-auto py-2 px-1.5",
        right: "flex-col h-full items-end overflow-y-auto py-2 px-1.5",
        top: "flex-row w-full items-start overflow-x-auto py-1.5 px-2",
      }[taskbar.position]
    )}
  >
    {#each list as [id, instance] (id)}
      <TaskbarItem {instance} />
    {/each}
  </div>

  <div
    class={cn(
      "border-foreground/20 h-full flex items-center justify-center",
      orientation === "vertical" ? "border-t py-4 px-1.5" : "border-l py-1.5 px-4"
    )}
  >
    <!-- <DateTime /> -->
  </div>
</div>
