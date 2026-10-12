<script lang="ts">
  import type { InspectorProps, MobileDesktopService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<MobileDesktopService> = $props();

  const dock = $derived(service.dock());
  const home = $derived(service.pages(0)[0]);
</script>

<InspectorStats>
  <InspectorStat label="Home" value={home.length} />
  <InspectorStat label="Dock" value={dock.length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Place", "Entry", "Kind"]} empty={home.length + dock.length === 0} empty_text="Desktop folder is empty.">
    {#each dock as item, index (item.name)}
      <tr>
        <td>dock {index + 1}</td>
        <td class="font-sans">{item.name}</td>
        <td>{item.kind}</td>
      </tr>
    {/each}
    {#each home as item, index (item.name)}
      <tr>
        <td>{index + 1}</td>
        <td class="font-sans">{item.name}</td>
        <td>{item.kind}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
