<script lang="ts">
  import kernel, { StoreStatus, type AppsService, type InspectorProps, type StoreService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<StoreService> = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const user_apps = $derived(apps.listings().filter((app) => !app.system));
  const saved = $derived(user_apps.filter((app) => service.status(app.id) === StoreStatus.SAVED).length);
  const downloading = $derived(user_apps.filter((app) => service.status(app.id) === StoreStatus.DOWNLOADING).length);
  const tracked = $derived(user_apps.filter((app) => service.is_picked(app.id) || service.status(app.id) !== StoreStatus.NOT_SAVED));
</script>

<InspectorStats>
  <InspectorStat label="Connection" value={service.online ? "Online" : "Offline"} />
  <InspectorStat label="Picked" value={service.picked.size} />
  <InspectorStat label="Saved this build" value="{saved} of {user_apps.length}" />
  <InspectorStat label="Sync" value={service.syncing ? "Running" : downloading > 0 ? `${downloading} downloading` : "Idle"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["App", "Picked", "Status"]} empty={tracked.length === 0} empty_text="No user app is picked or saved.">
    {#each tracked as app (app.id)}
      <tr>
        <td><span class="font-mono">{app.id}</span> {app.name}</td>
        <td>{service.is_picked(app.id) ? "yes" : ""}</td>
        <td>{service.status(app.id)}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
