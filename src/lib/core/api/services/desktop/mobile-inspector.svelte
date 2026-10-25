<script lang="ts">
  import type { InspectorProps, MobileDesktopService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<MobileDesktopService> = $props();

  const home = $derived(service.home());
</script>

<InspectorStats>
  <InspectorStat label="Home" value={home.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Place", "Entry", "Kind"]} empty={home.length === 0} empty_text="Desktop folder is empty.">
    {#each home as item, index (item.name)}
      <tr>
        <td>{index + 1}</td>
        <td class="font-sans">{item.name}</td>
        <td>{item.kind}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
