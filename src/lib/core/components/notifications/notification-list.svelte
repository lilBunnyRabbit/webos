<script lang="ts">
  import kernel, { type NotificationsService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { BellSimple as BellIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { Button, EmptyState } from "../ui";
  import NotificationItem from "./notification-item.svelte";

  let { item_class, class: class_name }: { item_class?: string; class?: string } = $props();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  // Mounted means looked at: everything here counts as read, and toasts would only repeat the list (ADR-006 revision).
  $effect(() => {
    if (notifications.unread_count === 0 && notifications.toasts.length === 0) return;
    untrack(() => {
      notifications.mark_all_read();
      for (const toast of notifications.toasts) notifications.hide_toast(toast.id);
    });
  });

  function clear_all() {
    for (const notification of notifications.all) notifications.dismiss(notification.id);
  }
</script>

<section aria-label="Notifications" class={cn("flex min-h-0 flex-col", class_name)}>
  <header class="flex h-10 shrink-0 items-center justify-between gap-2 px-1">
    <h2 class="text-ui font-semibold">Notifications</h2>
    {#if notifications.all.length > 0}
      <Button size="sm" variant="quiet" onclick={clear_all}>Clear all</Button>
    {/if}
  </header>

  {#if notifications.all.length === 0}
    <EmptyState icon={BellIcon} title="No notifications" description="Messages from apps and the system show up here." />
  {:else}
    <ul class="flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain">
      {#each notifications.all as notification (notification.id)}
        <li animate:flip={{ duration: 150 }}>
          <NotificationItem {notification} source class={item_class} ondismiss={() => notifications.dismiss(notification.id)} />
        </li>
      {/each}
    </ul>
  {/if}
</section>
