<script lang="ts">
  import kernel, { NotificationType, type AppsService, type SystemNotification } from "$lib/core/api";
  import { cn, format_datetime, ov } from "$lib/core/utils";
  import {
    CircleNotch as CircleNotchIcon,
    Info as InfoIcon,
    Warning as WarningIcon,
    X as XIcon,
    XCircle as XCircleIcon,
  } from "phosphor-svelte";
  import { Button, IconButton } from "../ui";

  let {
    notification,
    source = false,
    ondismiss,
    class: class_name,
  }: {
    notification: SystemNotification;
    /** Shows the sending app and the time: the center needs them, a toast is happening now. */
    source?: boolean;
    /** The close button and every action end with this: a toast hides, a center entry goes away. */
    ondismiss: () => void;
    class?: string;
  } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const TYPE_ICON = {
    [NotificationType.INFO]: InfoIcon,
    [NotificationType.WARNING]: WarningIcon,
    [NotificationType.ERROR]: XCircleIcon,
    [NotificationType.PROGRESS]: CircleNotchIcon,
  };

  const Icon = $derived(notification.icon ?? TYPE_ICON[notification.type]);
  // System senders ("apps", "session") aren't apps.
  const sender = $derived(apps.get(notification.app_id)?.name ?? "System");
  const time = $derived(
    notification.created_at.toDateString() === new Date().toDateString()
      ? notification.created_at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      : format_datetime(notification.created_at)
  );
</script>

<div
  role={notification.type === NotificationType.ERROR ? "alert" : "status"}
  class={cn("grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-2 rounded-xl p-3", class_name)}
>
  <span
    class={cn(
      "grid size-8 place-items-center rounded-lg",
      ov(
        {
          info: "text-info bg-info/12",
          warning: "text-warning bg-warning/12",
          error: "text-error bg-error/12",
          progress: "text-primary bg-primary/12",
        },
        notification.type
      )
    )}
  >
    <Icon class={cn("size-4.5", notification.type === NotificationType.PROGRESS && "animate-spin")} weight="bold" />
  </span>

  <div class="min-w-0 pt-0.5">
    {#if source}
      <p class="truncate text-2xs text-foreground/65">{sender} · <time datetime={notification.created_at.toISOString()}>{time}</time></p>
    {/if}
    <p class="text-ui font-semibold">{notification.title}</p>
    {#if notification.message}
      <p class="text-ui break-words text-foreground/80">{notification.message}</p>
    {/if}
  </div>

  <IconButton label="Dismiss" size="sm" class="-mt-0.5 -mr-0.5" onclick={ondismiss}>
    <XIcon weight="bold" />
  </IconButton>

  {#if notification.progress != null}
    <div class="col-span-2 col-start-2 flex items-center gap-2">
      <div class="h-1 flex-1 overflow-hidden rounded-full bg-foreground/12">
        {#if notification.progress < 0}
          <div class="h-full w-1/3 animate-pulse rounded-full bg-primary"></div>
        {:else}
          <div class="h-full rounded-full bg-primary transition-[width] duration-300" style:width="{notification.progress * 100}%"></div>
        {/if}
      </div>
      {#if notification.progress >= 0}
        <span class="w-8 text-right text-2xs text-foreground/65 tabular-nums">{Math.round(notification.progress * 100)}%</span>
      {/if}
    </div>
  {/if}

  {#if notification.actions?.length}
    <div class="col-span-2 col-start-2 flex flex-wrap gap-1.5">
      {#each notification.actions as action, idx (idx)}
        <Button
          size="sm"
          variant={idx === 0 && notification.type !== NotificationType.PROGRESS ? "primary" : "secondary"}
          onclick={() => {
            action.on_click();
            ondismiss();
          }}
        >
          {action.label}
        </Button>
      {/each}
    </div>
  {/if}
</div>
