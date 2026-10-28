<script lang="ts">
  import { getAllContexts, mount, untrack, unmount } from "svelte";
  import kernel, { type DialogsService, type ExtractService, type WindowsService, type WindowId, WindowFlag } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import WindowContent from "./window-content.svelte";
  import WindowTitlebar from "./window-titlebar.svelte";
  import WindowSheets from "./window-sheets.svelte";
  import WindowMini from "./window-mini.svelte";
  import { create_storage_handle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_window_handle } from "$lib/core/contexts/app/window-handle";
  import { create_achievements_handle } from "$lib/core/contexts/app/achievements-handle";
  import { RESIZE_EDGES, WindowGeometryHandler } from "./window.handler.svelte";
  import { cubicOut } from "svelte/easing";
  import { view_transition } from "$lib/core/utils/view-transition";
  import { transition_named } from "./window-transition.svelte";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { load_guide } from "./load-guide";

  /** Open and close (ADR-014 revision): a fade and a small scale. `scale`, not `transform`, so a drag can't fight it. */
  function pop(_: Element, { duration }: { duration: number }) {
    return { duration: motion_reduced() ? 0 : duration, easing: cubicOut, css: (t: number) => `opacity: ${t}; scale: ${0.96 + 0.04 * t};` };
  }

  let { id }: { id: WindowId } = $props();
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const instance = $derived(windows.get(id)!);

  const is_maximized = $derived(instance.flags.has(WindowFlag.MAXIMIZED));
  const is_minimized = $derived(instance.flags.has(WindowFlag.MINIMIZED));
  const is_focused = $derived(windows.is_focused(id));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const has_sheets = $derived(dialogs.for_window(id).length > 0);
  const has_guide = $derived(instance.flags.has(WindowFlag.GUIDE));
  const extract = $derived(kernel.services.has("extract") ? kernel.service<ExtractService>("extract") : null);
  const is_out = $derived(extract?.current === id);
  const snap_position = $derived(instance.snap_zone ? WindowGeometryHandler.get_snap_position(instance.snap_zone) : null);

  // The window manager keys windows by id, so it never changes for this instance.
  const geometry_handler = new WindowGeometryHandler(untrack(() => id));

  // Set here rather than in the app's content so the window's sheets (a file picker reusing File Explorer) get it too.
  // Set once: a window's id and app never change, and context can only be set during init.
  untrack(() => {
    const app_id = instance.app.id;
    set_app_context({
      window_id: id,
      app_id,
      window: create_window_handle(id),
      storage: create_storage_handle(app_id, instance.app.state),
      achievements: create_achievements_handle(app_id),
    });
  });
  const contexts = getAllContexts();

  // Internal state
  let zoom = $state(1);
  let element: HTMLElement | null = $state(null);

  // Popped out (ADR-043): the app remounts in the mini window, with this window's contexts, and the frame hides.
  $effect(() => {
    const target = is_out ? extract?.document : null;
    if (!target) return;
    const mini = mount(WindowMini, {
      target: target.body,
      props: {
        window_id: id,
        get zoom() {
          return zoom;
        },
      },
      context: contexts,
    });
    return () => void unmount(mini);
  });

  // A window that comes to the front takes the keyboard, unless focus is already inside it (a click on a field).
  $effect(() => {
    if (is_focused && !is_minimized && !is_out && element && !element.contains(document.activeElement)) {
      element.focus({ preventScroll: true });
    }
  });

  const rect = $derived.by(() => {
    const { move } = geometry_handler;
    if (move.active) return { left: `${move.start.left}px`, top: `${move.start.top}px`, width: `${move.width}px`, height: `${move.height}px` };
    if (is_maximized) return { left: "0px", top: "0px", width: "100%", height: "100%" };
    if (snap_position) return snap_position;
    const { x, y, width, height } = instance.bounds;
    return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` };
  });
  // Every named element is snapshotted on each transition: only the focused frame and the ones a transition acts on.
  const transition_name = $derived(!is_minimized && !is_out && (is_focused || transition_named(id)) ? `window-${id}` : undefined);
  const transform = $derived(geometry_handler.move.active ? `translate3d(${geometry_handler.move.dx}px, ${geometry_handler.move.dy}px, 0)` : "none");
</script>

{#if !is_maximized && !is_minimized && geometry_handler.snap_zone}
  {@const { left, top, width, height } = WindowGeometryHandler.get_snap_position(geometry_handler.snap_zone)}
  <div
    class="absolute pointer-events-none rounded-xl bg-primary/10 ring-1 ring-primary/60 backdrop-blur-[2px] transition-all duration-200 ease-out animate-pop-in"
    style:left
    style:top
    style:width
    style:height
    style:z-index={instance.order}
  ></div>
{/if}

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={element}
  in:pop|global={{ duration: 140 }}
  out:pop|global={{ duration: 100 }}
  onpointerdowncapture={() => windows.focus(id)}
  onfocusin={() => windows.focus(id)}
  data-window-id={id}
  class={cn(
    "absolute pointer-events-auto rounded-xl bg-background ring-1 transition-[box-shadow] duration-200",
    is_focused ? "shadow-window-focused ring-foreground/16" : "shadow-window ring-foreground/8",
    is_maximized && !geometry_handler.move.active && "rounded-none shadow-none ring-0",
    (is_minimized || is_out) && "hidden"
  )}
  style:left={rect.left}
  style:top={rect.top}
  style:width={rect.width}
  style:height={rect.height}
  style:transform
  style:z-index={instance.order}
  style:view-transition-name={transition_name}
  style:contain="size layout style"
  style:backface-visibility="hidden"
  tabindex={-1}
>
  <!-- Clips to the rounded corners; the resize handles sit outside it so the corners stay grabbable. -->
  <div class="grid size-full grid-cols-1 grid-rows-[2.5rem_1fr] overflow-hidden rounded-[inherit] [contain:paint]">
    <!-- Window titlebar. Double-click to maximize is a pointer shortcut; the maximize button is the accessible path. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      {@attach geometry_handler.drag_attachment()}
      ondblclick={(event) => {
        if (!(event.target as Element).closest("[data-window-button]")) view_transition(() => windows.toggle_maximize(id));
      }}
      class={cn(
        "group/titlebar flex items-center justify-between gap-2 border-b border-foreground/8 bg-background-light pr-1.5 pl-3 select-none touch-none",
        geometry_handler.move.active && "cursor-grabbing"
      )}
    >
      <WindowTitlebar bind:zoom window_id={id} focused={is_focused} />
    </div>

    <!-- Window content -->
    <div
      class="relative overflow-hidden bg-background [container-type:size] [content-visibility:auto]"
      style:contain-intrinsic-size={`${instance.bounds.width}px ${instance.bounds.height}px`}
    >
      <!-- An open sheet makes the app behind it inert: no clicks, no focus, no screen reader. -->
      {#if !is_out}
        <div class="contents" inert={has_sheets || has_guide}>
          <WindowContent window_id={id} {zoom}>
            <div class="flex flex-wrap gap-2 p-3 font-mono text-sm">
              <pre><span class="font-bold">bounds:</span> {JSON.stringify(instance.bounds, null, 2)}</pre>
              <pre><span class="font-bold">move:</span> {JSON.stringify(geometry_handler.move, null, 2)}</pre>
            </div>
          </WindowContent>
        </div>
        {#if has_guide}
          {#await load_guide(id) then WindowGuide}
            {#if WindowGuide}<div class="contents" inert={has_sheets}><WindowGuide window_id={id} /></div>{/if}
          {/await}
        {/if}
        <WindowSheets window_id={id} />
      {/if}
    </div>
  </div>

  <!-- Resize handles -->
  {#if !is_maximized && !is_minimized}
    {#each RESIZE_EDGES as edge (edge)}
      <div {@attach geometry_handler.resize_attachment(edge)} class="resize-handle {edge}" style:touch-action="none"></div>
    {/each}
  {/if}
</div>

<style>
  .resize-handle {
    position: absolute;
    z-index: 2;
  }
  .resize-handle.n {
    top: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.s {
    bottom: 0;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
  }
  .resize-handle.e {
    right: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .resize-handle.w {
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }
  .resize-handle.ne {
    top: 0;
    right: 0;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
  .resize-handle.nw {
    top: 0;
    left: 0;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.se {
    bottom: 0;
    right: 0;
    width: 12px;
    height: 12px;
    cursor: nwse-resize;
  }
  .resize-handle.sw {
    bottom: 0;
    left: 0;
    width: 12px;
    height: 12px;
    cursor: nesw-resize;
  }
</style>
