<script lang="ts">
  import type { InspectorProps, TasksService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<TasksService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Running" value={service.active_count} />
  <InspectorStat label="In the list" value={service.jobs.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Task", "App", "Status", "Progress"]} empty={service.jobs.length === 0} empty_text="No tasks yet.">
    {#each service.jobs as job (job.id)}
      <tr>
        <td>{job.title}</td>
        <td>{job.app_id}</td>
        <td>{job.status}</td>
        <td>{Math.round(job.progress * 100)}%</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
