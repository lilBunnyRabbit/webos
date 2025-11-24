<script lang="ts">
  import { cn } from "$lib/core/utils/utils";
  import { LayoutGrid } from "@lucide/svelte";
  import type { SvelteHTMLElements } from "svelte/elements";
  import kernel, { type SettingsService, TaskbarPosition } from "$lib/core/api";

  let { class: className, ...restProps }: Pick<SvelteHTMLElements["div"], "class" | "style"> = $props();

  const taskbar = $derived(kernel.service<SettingsService>("settings").taskbar);

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
    className
  )}
  {...restProps}
>
  <div class={cn("border-foreground/20", orientation === "vertical" ? "border-b py-2 px-1.5" : "border-r py-1.5 px-2")}>
    <!-- <StartMenu>
      <TaskbarItem title="Start">
        <LayoutGrid class="text-primary" />
      </TaskbarItem>
    </StartMenu> -->
    <LayoutGrid class="text-primary" />
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
    <button
      onclick={() => {
        taskbar.position = TaskbarPosition.TOP;
      }}
      title="Top"
    >
      Top
    </button>
    <button
      onclick={() => {
        taskbar.position = TaskbarPosition.BOTTOM;
      }}
      title="Bottom"
    >
      Bottom
    </button>
    <button
      onclick={() => {
        taskbar.position = TaskbarPosition.LEFT;
      }}
      title="Left"
    >
      Left
    </button>
    <button
      onclick={() => {
        taskbar.position = TaskbarPosition.RIGHT;
      }}
      title="Right"
    >
      Right
    </button>
    <!-- {#each Object.entries(index).sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime()) as [windowId, instance]}
      {#if instance}
        <TaskbarItem
          title={instance.app.name}
          isFocused={order.isFocused(windowId)}
          isMinimized={instance.flags.has(WindowFlag.MINIMIZED)}
          on:click={() => {
            if (order.isFocused(windowId)) {
              dispatch({ type: "TOGGLE_WINDOW", windowId });
            } else {
              dispatch({ type: "FOCUS_WINDOW", windowId });
            }
          }}
        >
          <svelte:component this={instance.app.icon} />
        </TaskbarItem>
      {/if}
    {/each} -->
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
