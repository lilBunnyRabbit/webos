<script lang="ts">
  import kernel, { type SettingsService, TaskbarPosition } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import LogoMark from "../brand/logo-mark.svelte";
  import StartMenuPopover from "./start-menu-popover.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));

  let open = $state(false);

  // The panel opens away from the screen edge the taskbar sits on, flush with the dock's start edge, 8px off the dock
  // (the same gap windows keep).
  const placement = $derived(
    {
      [TaskbarPosition.BOTTOM]: { area: "top span-right", gap: "mb-2" },
      [TaskbarPosition.TOP]: { area: "bottom span-right", gap: "mt-2" },
      [TaskbarPosition.LEFT]: { area: "right span-bottom", gap: "ml-2" },
      [TaskbarPosition.RIGHT]: { area: "left span-bottom", gap: "mr-2" },
    }[settings.taskbar.position]
  );
</script>

<button
  aria-label="Start"
  title="Start"
  popovertarget="start-menu-popover"
  popovertargetaction="toggle"
  class={cn(
    "grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10",
    open && "bg-foreground/10"
  )}
>
  <LogoMark class="size-6 text-primary" />
</button>

<div
  id="start-menu-popover"
  popover
  class={cn("start-menu m-0 overflow-hidden rounded-2xl bg-background-lighter p-0 text-foreground shadow-popover", placement.gap)}
  style:position-area={placement.area}
  ontoggle={(event) => (open = event.newState === "open")}
>
  {#if open}
    <StartMenuPopover />
  {/if}
</div>

<style>
  .start-menu {
    position-anchor: --taskbar-dock;
    position-try-fallbacks: flip-block, flip-inline;
    inset: auto;
    width: min(26rem, calc(100vw - 1rem));
    max-height: min(34rem, calc(100dvh - 5rem));
    border: none;

    &:popover-open {
      display: flex;
      flex-direction: column;
      animation: var(--animate-pop-in);
    }

    /* The shared scrim, so the launcher reads as the layer on top even over a window of the same shade family. */
    &::backdrop {
      background: var(--overlay);
    }
  }
</style>
