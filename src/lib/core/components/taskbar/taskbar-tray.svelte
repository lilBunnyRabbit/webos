<script lang="ts">
  import kernel, { type NotificationsService, type SettingsService, TaskbarPosition, UiOverlay, type UiService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { BellSimple as BellIcon } from "phosphor-svelte";
  import NotificationList from "../notifications/notification-list.svelte";
  import TaskbarClock from "./taskbar-clock.svelte";

  let { vertical }: { vertical: boolean } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const ui = $derived(kernel.service<UiService>("ui"));

  // Same mirror as the start menu: the popover owns light dismiss and Esc, `ui` lets a shortcut open it (ADR-028).
  let popover: HTMLElement | null = $state(null);
  let open = $state(false);
  const wanted = $derived(ui.overlay === UiOverlay.NOTIFICATIONS);

  $effect(() => {
    if (!popover) return;
    if (wanted && !open) popover.showPopover();
    else if (!wanted && open) popover.hidePopover();
  });

  // Opens away from the dock's screen edge, flush with its far end, where the tray sits.
  const placement = $derived(
    {
      [TaskbarPosition.BOTTOM]: { area: "top span-left", gap: "mb-2" },
      [TaskbarPosition.TOP]: { area: "bottom span-left", gap: "mt-2" },
      [TaskbarPosition.LEFT]: { area: "right span-top", gap: "ml-2" },
      [TaskbarPosition.RIGHT]: { area: "left span-top", gap: "mr-2" },
    }[settings.taskbar.position]
  );

  const unread = $derived(notifications.unread_count);
  const label = $derived(unread > 0 ? `Notifications, ${unread} unread` : "Notifications");
</script>

<button
  aria-label={label}
  title={label}
  popovertarget="notification-center-popover"
  popovertargetaction="toggle"
  class={cn(
    "flex shrink-0 items-center rounded-xl transition-colors duration-150 hover:bg-foreground/10",
    vertical ? "flex-col gap-1 pt-2" : "gap-0.5 pl-2.5",
    open && "bg-foreground/10"
  )}
>
  <span class="relative grid size-[calc(var(--taskbar-item)*0.5)] place-items-center">
    <BellIcon class="size-[calc(var(--taskbar-item)*0.45)]" weight={unread > 0 ? "fill" : "bold"} />
    {#if unread > 0}
      <span
        class="absolute -top-1.5 -right-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-background"
        aria-hidden="true">{unread > 99 ? "99+" : unread}</span
      >
    {/if}
  </span>
  <TaskbarClock {vertical} />
</button>

<div
  bind:this={popover}
  id="notification-center-popover"
  popover
  class={cn("notification-center m-0 rounded-2xl bg-background-lighter p-2 text-foreground shadow-popover", placement.gap)}
  style:position-area={placement.area}
  ontoggle={(event) => {
    open = event.newState === "open";
    if (open) ui.open(UiOverlay.NOTIFICATIONS);
    else if (ui.overlay === UiOverlay.NOTIFICATIONS) ui.close();
  }}
>
  {#if open}
    <NotificationList class="max-h-full" item_class="hover:bg-foreground/4" />
  {/if}
</div>

<style>
  .notification-center {
    position-anchor: --taskbar-dock;
    position-try-fallbacks: flip-block, flip-inline;
    inset: auto;
    width: min(24rem, calc(100vw - 1rem));
    max-height: min(34rem, calc(100dvh - 5rem));
    border: none;

    &:popover-open {
      display: flex;
      flex-direction: column;
      animation: var(--animate-pop-in);
    }

    &::backdrop {
      background: var(--overlay);
    }
  }
</style>
