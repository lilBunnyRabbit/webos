<script lang="ts">
  import { cn, ov } from "$lib/core/utils/utils";
  import Taskbar from "./taskbar/taskbar.svelte";
  import WindowManager from "./window-manager/window-manager.svelte";
  import kernel, { type SettingsService } from "$lib/core/api";
  import Desktop from "./desktop/desktop.svelte";
  import ToastArea from "./notifications/toast-area.svelte";
  import DialogsHost from "./dialogs/dialogs-host.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const position = $derived(settings.taskbar.position);
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
      },
      position
    )
  )}
>
  <div
    class={cn(
      "relative z-0 overflow-hidden",
      ov(
        {
          top: "[grid-area:2/1]",
          bottom: "[grid-area:1/1]",
          left: "[grid-area:1/2]",
          right: "[grid-area:1/1]",
        },
        position
      )
    )}
  >
    <Desktop />
  </div>

  <WindowManager
    class={cn(
      "relative z-0 pointer-events-none",
      ov(
        {
          top: "[grid-area:2/1]",
          bottom: "[grid-area:1/1]",
          left: "[grid-area:1/2]",
          right: "[grid-area:1/1]",
        },
        position
      )
    )}
  />

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
      )
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
