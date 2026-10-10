<script lang="ts">
  import type { InspectorProps, NotificationsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  const RECENT = 10;

  let { service, detailed }: InspectorProps<NotificationsService> = $props();

  const recent = $derived(service.all.slice(0, RECENT));
</script>

<InspectorStats>
  <InspectorStat label="Total" value={service.all.length} />
  <InspectorStat label="Unread" value={service.unread_count} />
  <InspectorStat label="Toasts" value={service.toasts.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Time", "Type", "App", "Title"]} empty={recent.length === 0} empty_text="No notifications.">
    {#each recent as notification (notification.id)}
      <tr class={notification.read ? "text-foreground/50" : undefined}>
        <td>{notification.created_at.toLocaleTimeString()}</td>
        <td>{notification.type}</td>
        <td>{notification.app_id}</td>
        <td class="font-sans">{notification.title}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
