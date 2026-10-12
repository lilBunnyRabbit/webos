<script lang="ts">
  import kernel, { type NotificationsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { fly } from "svelte/transition";
  import NotificationItem from "./notification-item.svelte";

  let { from = "right", class: class_name }: { from?: "left" | "right" | "top"; class?: string } = $props();

  const motion = $derived({ left: { x: -24 }, right: { x: 24 }, top: { y: -24 } }[from]);

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
</script>

<div class={cn("pointer-events-none flex flex-col gap-2 p-4", class_name)}>
  {#each notifications.toasts as notification (notification.id)}
    <div class="pointer-events-auto w-80 max-w-full" transition:fly={{ ...motion, duration: 180 }}>
      <NotificationItem
        {notification}
        class="bg-background-lighter shadow-popover"
        ondismiss={() => notifications.hide_toast(notification.id)}
      />
    </div>
  {/each}
</div>
