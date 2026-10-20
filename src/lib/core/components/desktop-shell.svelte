<script lang="ts">
  import { cn, ov } from "$lib/core/utils/utils";
  import Taskbar from "./taskbar/taskbar.svelte";
  import WindowManager from "./window-manager/window-manager.svelte";
  import kernel, { type SettingsService } from "$lib/core/api";
  import Desktop from "./desktop/desktop.svelte";
  import ToastArea from "./notifications/toast-area.svelte";
  import DialogsHost from "./dialogs/dialogs-host.svelte";
  import { LIVE_WALLPAPERS } from "./desktop/live/registry";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const position = $derived(settings.taskbar.position);
  // An auto-hidden taskbar overlays the screen (ADR-015), so the windows and the desktop get all of it.
  const area = $derived(settings.taskbar.auto_hide ? "overlay" : position);
  const live = $derived(settings.wallpaper.kind === "live" && LIVE_WALLPAPERS[settings.wallpaper.id]?.overlay ? settings.wallpaper.id : null);
  const stage = $derived(
    ov(
      {
        top: "[grid-area:2/1]",
        bottom: "[grid-area:1/1]",
        left: "[grid-area:1/2]",
        right: "[grid-area:1/1]",
        overlay: "[grid-area:1/1]",
      },
      area
    )
  );
</script>

<div
  class={cn(
    "grid h-dvh w-full overflow-hidden bg-background-darkest",
    ov(
      {
        top: "grid-cols-1 grid-rows-[auto_1fr]",
        bottom: "grid-cols-1 grid-rows-[1fr_auto]",
        left: "grid-cols-[auto_1fr] grid-rows-1",
        right: "grid-cols-[1fr_auto] grid-rows-1",
        overlay: "grid-cols-1 grid-rows-1",
      },
      area
    )
  )}
>
  <div class={cn("relative z-0 overflow-hidden", stage)}>
    <Desktop />
  </div>

  <WindowManager class={cn("relative z-0 pointer-events-none", stage)} />

  <!-- The live wallpaper's overlay (ADR-057): above windows, below toasts, the taskbar and dialogs; never takes the pointer. -->
  {#if live}
    {@const id = live}
    <div class={cn("pointer-events-none relative z-0", stage)}>
      {#await import("./desktop/live/live-layer.svelte") then { default: LiveLayer }}
        <LiveLayer {id} layer="overlay" />
      {/await}
    </div>
  {/if}

  <!-- Toasts gather in the corner nearest the tray (ADR-006 revision). -->
  <ToastArea
    from={position === "left" ? "left" : "right"}
    class={cn(
      "relative z-1",
      ov(
        {
          top: "[grid-area:2/1] items-end justify-start",
          bottom: "[grid-area:1/1] items-end justify-end-safe",
          left: "[grid-area:1/2] items-start justify-end-safe",
          right: "[grid-area:1/1] items-end justify-end-safe",
        },
        position
      ),
      settings.taskbar.auto_hide && "[grid-area:1/1]"
    )}
  />

  <Taskbar
    class={cn(
      "z-1",
      ov(
        {
          top: "[grid-area:1/1]",
          bottom: "[grid-area:2/1]",
          left: "[grid-area:1/1]",
          right: "[grid-area:1/2]",
        },
        position
      )
    )}
  />
</div>

<DialogsHost />
