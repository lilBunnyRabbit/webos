<script lang="ts">
  import kernel, { StoreStatus, type AppsService, type InspectorProps, type StoreService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<StoreService> = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const installed = $derived(apps.listings({ installed: true }));
  const saved = $derived(installed.filter((app) => service.status(app.id) === StoreStatus.SAVED).length);
  const downloading = $derived(installed.filter((app) => service.status(app.id) === StoreStatus.DOWNLOADING).length);
</script>

<InspectorStats>
  <InspectorStat label="Connection" value={service.online ? "Online" : "Offline"} />
  <InspectorStat label="Installed" value={installed.length} />
  <InspectorStat label="Saved this build" value="{saved} of {installed.length}" />
  <InspectorStat label="Sync" value={service.syncing ? "Running" : downloading > 0 ? `${downloading} downloading` : "Idle"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["App", "Status", "Progress"]} empty={installed.length === 0} empty_text="No app is installed.">
    {#each installed as app (app.id)}
      {@const progress = service.progress(app.id)}
      <tr>
        <td><span class="font-mono">{app.id}</span> {app.name}</td>
        <td>{service.status(app.id)}</td>
        <td class="font-mono tabular-nums">{progress === null ? "" : `${Math.round(progress * 100)}%`}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
