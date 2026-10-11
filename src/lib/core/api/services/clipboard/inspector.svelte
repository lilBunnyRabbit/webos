<script lang="ts">
  import type { ClipboardService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<ClipboardService> = $props();
</script>

<InspectorStats>
  <InspectorStat label="Holds" value={service.content ? `${service.content.paths.length} ${service.content.paths.length === 1 ? "entry" : "entries"}` : "nothing"} />
  <InspectorStat label="Mode" value={service.content?.mode ?? "—"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Path"]} empty={!service.content} empty_text="The clipboard is empty.">
    {#each service.content?.paths ?? [] as path (path)}
      <tr><td>{path}</td></tr>
    {/each}
  </InspectorTable>
{/if}
