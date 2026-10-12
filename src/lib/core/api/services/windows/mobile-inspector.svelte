<script lang="ts">
  import type { InspectorProps, MobileWindowsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<MobileWindowsService> = $props();

  const recent = $derived(service.recent());
  const focused_id = $derived(service.get_focused());
  const focused = $derived(focused_id ? service.get(focused_id) : null);
</script>

<InspectorStats>
  <InspectorStat label="Running" value={recent.length} />
  <InspectorStat label="On screen" value={focused?.app.manifest.name ?? "home"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Recent", "App", "Id", "Flags"]} empty={recent.length === 0} empty_text="No running apps.">
    {#each recent as id, index (id)}
      {@const instance = service.get(id)}
      {#if instance}
        <tr class={id === focused_id ? "text-primary" : undefined}>
          <td>{index + 1}</td>
          <td class="font-sans">{instance.app.manifest.name}</td>
          <td title={id}>{id.slice(0, 8)}</td>
          <td>{[...instance.flags].join(", ") || "—"}</td>
        </tr>
      {/if}
    {/each}
  </InspectorTable>
{/if}
