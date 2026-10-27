<script lang="ts">
  import type { BackgroundService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { format_since } from "./format";

  let { service, detailed }: InspectorProps<BackgroundService> = $props();

  const jobs = $derived(service.list());
  const here = $derived(jobs.filter((job) => job.here).length);
  const now = Date.now();
</script>

<InspectorStats>
  <InspectorStat label="This tab" value={here} />
  <InspectorStat label="Other tabs" value={jobs.length - here} />
  <InspectorStat label="Workers" value={jobs.reduce((sum, job) => sum + job.workers.length, 0)} />
  <InspectorStat label="Tab id" value={service.tab} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["App", "Status", "Since", "Tab", "Workers"]} empty={jobs.length === 0} empty_text="Nothing runs in the background.">
    {#each jobs as job (job.app_id)}
      <tr>
        <td>{job.app_id}</td>
        <td>{job.status || "—"}</td>
        <td>{format_since(job.since, now)}</td>
        <td>{job.here ? "this" : job.tab}{job.solo ? " (solo)" : ""}</td>
        <td>{job.workers.map((worker) => `${worker.name} · ${format_since(worker.since, now)}`).join(", ") || "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
