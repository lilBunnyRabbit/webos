<script lang="ts">
  import type { AiService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { AiAvailability } from "./type";

  let { service, detailed }: InspectorProps<AiService> = $props();

  const ready = $derived(Object.values(service.features).filter((state) => state === AiAvailability.READY).length);
  const any = $derived(Object.values(service.features).some((state) => state !== AiAvailability.NO));
</script>

<InspectorStats>
  <InspectorStat label="Features" value={any ? `${ready} of 4 ready` : "not on this device"} />
  <InspectorStat label="Downloading" value={service.downloads.length} />
  <InspectorStat label="Sessions" value={service.sessions.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Feature", "State"]}>
    {#each Object.entries(service.features) as [feature, state] (feature)}
      <tr><td>{feature}</td><td>{state}</td></tr>
    {/each}
  </InspectorTable>

  <InspectorTable columns={["Download", "Progress"]} empty={service.downloads.length === 0} empty_text="No model is downloading.">
    {#each service.downloads as job (job.id)}
      <tr><td>{job.title}</td><td>{Math.round(job.progress * 100)}%</td></tr>
    {/each}
  </InspectorTable>

  <InspectorTable columns={["Session", "Feature"]} empty={service.sessions.length === 0} empty_text="No sessions kept.">
    {#each service.sessions as session, index (index)}
      <tr><td>{session.label}</td><td>{session.feature}</td></tr>
    {/each}
  </InspectorTable>
{/if}
