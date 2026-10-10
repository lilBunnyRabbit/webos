<script lang="ts">
  import type { DialogsService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<DialogsService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Open" value={service.stack.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Id", "Component", "Point", "Placement"]} empty={service.stack.length === 0} empty_text="No open dialogs.">
    {#each service.stack as entry (entry.id)}
      <tr>
        <td title={entry.id}>{entry.id.slice(0, 8)}</td>
        <td>{entry.component.name || "anonymous"}</td>
        <td>{Math.round(entry.point.x)},{Math.round(entry.point.y)}</td>
        <td class="font-sans">{entry.anchored ? "anchored" : "centered"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
