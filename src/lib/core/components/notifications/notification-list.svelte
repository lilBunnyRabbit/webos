<script lang="ts">
  import kernel, { type AppsService, type NotificationsService, type TasksService, type UiService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { BellSimple as BellIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { Button, EmptyState } from "../ui";
  import NotificationItem from "./notification-item.svelte";

  /** `tasks`: a line for running background tasks, where there's no taskbar to show them (mobile). */
  let { item_class, class: class_name, tasks: show_tasks = false }: { item_class?: string; class?: string; tasks?: boolean } = $props();

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const tasks = $derived(kernel.service<TasksService>("tasks"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const ui = $derived(kernel.service<UiService>("ui"));
  const running = $derived(show_tasks ? tasks.active_count : 0);

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

  {#if running > 0}
    <button class="mb-1.5 flex h-8 shrink-0 items-center justify-between gap-2 rounded-lg px-2 text-ui text-foreground/80 hover:bg-foreground/8" onclick={() => (apps.launch("activity-monitor", { section: "tasks" }), ui.close())}>
      <span>{running} {running === 1 ? "task" : "tasks"} running</span>
      <span class="text-primary">Show</span>
    </button>
  {/if}

  {#if notifications.all.length === 0}
    <EmptyState icon={BellIcon} title="No notifications" description="Messages from apps and the system show up here." />
  {:else}
    <ul class="flex min-h-0 flex-col gap-1.5 overflow-y-auto overscroll-contain">
      {#each notifications.all as notification (notification.id)}
        <li animate:flip={{ duration: 150 }}>
          <NotificationItem {notification} source class={item_class} ondismiss={() => notifications.dismiss(notification.id)} onaction={() => ui.close()} />
        </li>
      {/each}
    </ul>
  {/if}
</section>
