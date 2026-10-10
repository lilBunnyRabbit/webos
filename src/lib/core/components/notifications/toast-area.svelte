<script lang="ts">
  import kernel, { NotificationType, type NotificationsService, type SystemNotification } from "$lib/core/api";
  import { cn, ov } from "$lib/core/utils";
  import {
    CircleNotch as CircleNotchIcon,
    Info as InfoIcon,
    Warning as WarningIcon,
    X as XIcon,
    XCircle as XCircleIcon,
  } from "phosphor-svelte";
  import { fly } from "svelte/transition";

  let { class: class_name }: { class?: string } = $props();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const TYPE_ICON = {
    [NotificationType.INFO]: InfoIcon,
    [NotificationType.WARNING]: WarningIcon,
    [NotificationType.ERROR]: XCircleIcon,
    [NotificationType.PROGRESS]: CircleNotchIcon,
  };

  function type_color(notification: SystemNotification) {
    return ov(
      {
        info: "text-info border-info",
        warning: "text-warning border-warning",
        error: "text-error border-error",
        progress: "text-primary border-primary",
      },
      notification.type
    );
  }
</script>

<div class={cn("pointer-events-none flex flex-col items-end justify-end gap-2 p-4", class_name)}>
  {#each notifications.toasts as notification (notification.id)}
    {@const Icon = notification.icon ?? TYPE_ICON[notification.type]}
    <div
      role={notification.type === NotificationType.ERROR ? "alert" : "status"}
      class={cn(
        "pointer-events-auto w-80 max-w-full grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 items-start",
        "bg-background border-2 rounded-md shadow-window p-3",
        type_color(notification)
      )}
      transition:fly={{ x: 24, duration: 150 }}
    >
      <Icon
        class={cn("size-5 mt-0.5", notification.type === NotificationType.PROGRESS && "animate-spin")}
        weight="bold"
      />

      <div class="min-w-0 text-foreground">
        <p class="font-medium text-sm">{notification.title}</p>
        {#if notification.message}
          <p class="text-sm break-words">{notification.message}</p>
        {/if}
      </div>

      <button
        class="rounded p-0.5 text-foreground hover:opacity-85 active:opacity-70"
        title="Close"
        onclick={() => notifications.hide_toast(notification.id)}
      >
        <XIcon class="size-4" weight="bold" />
      </button>

      {#if notification.progress != null}
        <div class="col-span-3 h-1 rounded-full bg-foreground/20 overflow-hidden">
          {#if notification.progress < 0}
            <div class="h-full w-full bg-current animate-pulse"></div>
          {:else}
            <div class="h-full bg-current transition-[width]" style:width="{notification.progress * 100}%"></div>
          {/if}
        </div>
      {/if}

      {#if notification.actions?.length}
        <div class="col-start-2 col-span-2 flex flex-wrap gap-2 pt-1">
          {#each notification.actions as action, idx (idx)}
            <button
              class="text-sm font-medium underline-offset-2 hover:underline"
              onclick={() => {
                action.on_click();
                notifications.hide_toast(notification.id);
              }}
            >
              {action.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
