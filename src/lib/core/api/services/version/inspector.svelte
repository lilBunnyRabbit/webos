<script lang="ts">
  import type { InspectorProps, VersionService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<VersionService> = $props();

  const status = $derived(
    service.is_checking ? "checking…" : service.update_available ? `update: ${service.update_available.commit}` : "up to date"
  );
</script>

<InspectorStats>
  <InspectorStat label="Version" value="v{service.info.version}" />
  <InspectorStat label="Commit" value={service.info.commit} />
  <InspectorStat label="Status" value={status} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Field", "Running", "Available"]}>
    {#each ["version", "commit", "branch", "buildTime"] as const as field (field)}
      <tr>
        <td class="font-sans">{field}</td>
        <td>{service.info[field]}</td>
        <td>{service.update_available?.[field] ?? "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
