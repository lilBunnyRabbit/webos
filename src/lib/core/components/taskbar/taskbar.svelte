<script lang="ts">
  import { cn } from "$lib/core/utils/utils";
  import type { SvelteHTMLElements } from "svelte/elements";
  import kernel, { type AppId, type SettingsService, TaskbarPosition, TaskbarSize, WindowFlag, type WindowInstance, type WindowsService } from "$lib/core/api";
  import TaskbarItem from "./taskbar-item.svelte";
  import StartMenu from "./start-menu.svelte";
  import TaskbarTray from "./taskbar-tray.svelte";
  import BackgroundIndicator from "./background-indicator.svelte";
  import TasksIndicator from "./tasks-indicator.svelte";
  import TerminalButton from "./terminal-button.svelte";
  import ShowDesktopButton from "./show-desktop-button.svelte";
  import QuickLaunch from "./quick-launch.svelte";

  let { class: class_name, ...rest_props }: Pick<SvelteHTMLElements["div"], "class" | "style"> = $props();

  const taskbar = $derived(kernel.service<SettingsService>("settings").taskbar);
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const list = $derived(windows.sorted_list((a, b) => a[1].created_at.getTime() - b[1].created_at.getTime()));

  const groups = $derived.by(() => {
    const by_app = new Map<AppId, WindowInstance[]>();
    for (const [, instance] of list) {
      const group = by_app.get(instance.app.id);
      if (group) group.push(instance);
      else by_app.set(instance.app.id, [instance]);
    }
    return [...by_app.values()];
  });

  const ITEM_SIZE: Record<TaskbarSize, string> = {
    [TaskbarSize.SMALL]: "2rem",
    [TaskbarSize.MEDIUM]: "2.5rem",
    [TaskbarSize.LARGE]: "3rem",
  };

  // A maximized window would meet the floating dock's rounded corners with its square edge, so the dock joins it.
  // An auto-hidden bar overlays the window instead, so it stays a dock.
  const flush = $derived(!taskbar.auto_hide && list.some(([, w]) => w.flags.has(WindowFlag.MAXIMIZED) && !w.flags.has(WindowFlag.MINIMIZED)));

  const vertical = $derived(taskbar.position === TaskbarPosition.LEFT || taskbar.position === TaskbarPosition.RIGHT);

  let strip: HTMLElement | null = $state(null);
  /** A drag can't hover, so drag to pin reveals the auto-hidden bar this way. */
  let drag_over = $state(false);
</script>

<!-- A floating dock. The strip pads only the screen-edge sides: the side facing the windows gets its 8px from the
     window area itself (snap inset), so every gap around windows and the dock is the same 8px. With a maximized
     window it goes flush: an edge bar joined to the window. -->
<div
  bind:this={strip}
  class={cn(
    "flex",
    !flush && { bottom: "px-2 pb-2", top: "px-2 pt-2", left: "py-2 pl-2", right: "py-2 pr-2" }[taskbar.position],
    vertical ? "h-full" : "w-full",
    taskbar.auto_hide && cn("auto-hide fixed", { bottom: "inset-x-0 bottom-0", top: "inset-x-0 top-0", left: "inset-y-0 left-0", right: "inset-y-0 right-0" }[taskbar.position]),
    class_name
  )}
  data-position={taskbar.position}
  data-reveal={drag_over || undefined}
  ondragenter={() => (drag_over = true)}
  ondragleave={(event) => {
    if (!strip?.contains(event.relatedTarget as Node | null)) drag_over = false;
  }}
  ondrop={() => (drag_over = false)}
  ondragend={() => (drag_over = false)}
  {...rest_props}
>
  <!-- Named so going flush morphs inside the maximize/minimize view transition, together with the window. -->
  <nav
    aria-label="Taskbar"
    style:view-transition-name="taskbar-dock"
    style:--taskbar-item={ITEM_SIZE[taskbar.size]}
    class={cn(
      "relative flex items-center gap-1 bg-background-light/90 p-1.5 backdrop-blur-xl",
      flush
        ? { bottom: "border-t", top: "border-b", left: "border-r", right: "border-l" }[taskbar.position] + " border-foreground/8"
        : "rounded-2xl shadow-popover",
      vertical ? "h-full w-[calc(var(--taskbar-item)+0.75rem)] flex-col" : "h-[calc(var(--taskbar-item)+0.75rem)] w-full flex-row"
    )}
  >
    <!-- The popovers anchor here, so in flush mode they still keep 8px off the screen's corners. -->
    <div class={cn("taskbar-dock pointer-events-none absolute", flush ? (vertical ? "inset-x-0 inset-y-2" : "inset-x-2 inset-y-0") : "inset-0")}></div>

    <StartMenu />

    <div role="separator" class={cn("shrink-0 bg-foreground/12", vertical ? "mx-auto my-0.5 h-px w-[calc(var(--taskbar-item)*0.6)]" : "mx-0.5 h-[calc(var(--taskbar-item)*0.6)] w-px")}></div>

    <QuickLaunch {vertical} />

    <div class={cn("flex min-h-0 min-w-0 flex-1 gap-1", vertical ? "flex-col overflow-x-hidden overflow-y-auto px-1" : "flex-row overflow-x-auto overflow-y-hidden py-1")}>
      {#each groups as group (group[0].app.id)}
        <TaskbarItem {group} {vertical} position={taskbar.position} />
      {/each}
    </div>

    <TerminalButton />
    <BackgroundIndicator />
    <TasksIndicator />
    <TaskbarTray {vertical} />
    <ShowDesktopButton {vertical} />
  </nav>
</div>

<style>
  .taskbar-dock {
    anchor-name: --taskbar-dock;
  }

  /* Auto-hide (ADR-015): slid off its edge but for a 4px strip the pointer can reach. Reveals at once, hides 2s after
     the pointer, focus, an open popover or a drag leaves. `[data-reveal]` inside (a minimizing item) reveals without
     sliding, so the view transition captures the bar in place and the window lands on its button. */
  .auto-hide {
    transition: translate 200ms var(--ease-out) 2s;

    &[data-position="bottom"] {
      translate: 0 calc(100% - 4px);
    }
    &[data-position="top"] {
      translate: 0 calc(4px - 100%);
    }
    &[data-position="left"] {
      translate: calc(4px - 100%) 0;
    }
    &[data-position="right"] {
      translate: calc(100% - 4px) 0;
    }

    &:is(:hover, :focus-within, :has(:global(:popover-open)), [data-reveal], :has(:global([data-reveal]))) {
      translate: 0 0;
      transition-delay: 0s;
    }

    &:has(:global([data-reveal])) {
      transition-duration: 0s;
    }
  }
</style>
