<script lang="ts">
  import { SYS, WM } from "$lib/core/stores";
  import { cn, ov } from "$lib/core/utils/utils";
  import Taskbar from "./taskbar/taskbar.svelte";
  import WindowManager from "./window/window-manager.svelte";

  const position = $derived(SYS.taskbar.position);
</script>

<div
  class={cn(
    "grid h-dvh w-full overflow-hidden bg-background-dark",
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
      "relative z-0 overflow-hidden p-4",
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
    <button class="bg-primary text-background p-2 rounded-md" onclick={() => WM.windows.create("Hello, world!")}>
      Open Window
    </button>
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
