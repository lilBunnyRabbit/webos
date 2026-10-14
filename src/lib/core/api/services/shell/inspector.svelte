<script lang="ts">
  import type { InspectorProps, ShellService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<ShellService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Commands" value={service.commands.length} />
  <InspectorStat label="History" value={service.history.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Command", "Description"]} empty={service.commands.length === 0} empty_text="No commands.">
    {#each service.commands as command (command.id)}
      <tr>
        <td>{command.id}</td>
        <td>{command.description}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
