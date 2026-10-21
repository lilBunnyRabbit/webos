<script lang="ts">
  import { format_repeat, type InspectorProps, type SchedulerService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { format_datetime } from "$lib/core/utils";

  let { service, detailed }: InspectorProps<SchedulerService> = $props();

  const armed = $derived(service.jobs.filter((job) => job.armed).length);
  const upcoming = $derived(
    service.jobs
      .map((job) => service.next(job.id))
      .filter((due): due is number => due !== null)
      .sort((a, b) => a - b)[0] ?? null
  );
</script>

<InspectorStats>
  <InspectorStat label="This tab" value={service.is_leader ? "Leader" : "Follower"} />
  <InspectorStat label="Armed" value="{armed} of {service.jobs.length}" />
  <InspectorStat label="Next" value={upcoming === null ? "None" : format_datetime(upcoming)} />
  <InspectorStat label="Closed-tab triggers" value={service.triggers ? "Available" : "Not in this browser"} />
</InspectorStats>

{#if detailed}
  <InspectorStats>
    <InspectorStat label="Missed this session" value={service.missed.length} />
    <InspectorStat label="Last sleep or clock jump" value={service.last_jump === null ? "None seen" : format_datetime(service.last_jump)} />
  </InspectorStats>
  <InspectorTable columns={["Job", "Kind", "Next", "Repeat", "Last fired"]} empty={service.jobs.length === 0} empty_text="Nothing scheduled.">
    {#each service.jobs as job (job.id)}
      {@const next = service.next(job.id)}
      <tr>
        <td><span class="font-mono">{job.id}</span> {job.title}</td>
        <td>{job.kind}</td>
        <td>{next === null ? (job.armed ? "never" : "off") : format_datetime(next)}</td>
        <td>{format_repeat(job.repeat)}</td>
        <td>{job.last_fired === undefined ? "" : format_datetime(job.last_fired)}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
