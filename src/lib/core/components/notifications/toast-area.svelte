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
  import { Button, IconButton } from "../ui";

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
        info: "text-info bg-info/12",
        warning: "text-warning bg-warning/12",
        error: "text-error bg-error/12",
        progress: "text-primary bg-primary/12",
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
      class="pointer-events-auto grid w-80 max-w-full grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 rounded-xl bg-background-lighter p-3 shadow-popover"
      transition:fly={{ x: 24, duration: 180 }}
    >
      <span class={cn("grid size-8 place-items-center rounded-lg", type_color(notification))}>
        <Icon class={cn("size-4.5", notification.type === NotificationType.PROGRESS && "animate-spin")} weight="bold" />
      </span>

      <div class="min-w-0 pt-0.5">
        <p class="text-ui font-semibold">{notification.title}</p>
        {#if notification.message}
          <p class="text-ui break-words text-foreground/80">{notification.message}</p>
        {/if}
      </div>

      <IconButton label="Dismiss" size="sm" class="-mt-0.5 -mr-0.5" onclick={() => notifications.hide_toast(notification.id)}>
        <XIcon weight="bold" />
      </IconButton>

      {#if notification.progress != null}
        <div class="col-span-3 h-1 overflow-hidden rounded-full bg-foreground/12">
          {#if notification.progress < 0}
            <div class="h-full w-1/3 animate-pulse rounded-full bg-primary"></div>
          {:else}
            <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{notification.progress * 100}%"></div>
          {/if}
        </div>
      {/if}

      {#if notification.actions?.length}
        <div class="col-span-2 col-start-2 flex flex-wrap gap-1.5">
          {#each notification.actions as action, idx (idx)}
            <Button
              size="sm"
              variant={idx === 0 ? "primary" : "secondary"}
              onclick={() => {
                action.on_click();
                notifications.hide_toast(notification.id);
              }}
            >
              {action.label}
            </Button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
