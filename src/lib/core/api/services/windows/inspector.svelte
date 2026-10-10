<script lang="ts">
  import type { InspectorProps, WindowsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<WindowsService> = $props();

  const windows = $derived(service.sorted_list(([, a], [, b]) => b.order - a.order));
  const focused_id = $derived(service.get_focused());
  const focused = $derived(focused_id ? service.get(focused_id) : null);
  const container = $derived(service.container.bounds);
</script>

<InspectorStats>
  <InspectorStat label="Open" value={windows.length} />
  <InspectorStat label="Focused" value={focused?.app.manifest.name ?? "none"} />
  <InspectorStat label="Container" value="{Math.round(container.width)}×{Math.round(container.height)}" />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Order", "App", "Id", "Bounds", "State"]} empty={windows.length === 0} empty_text="No open windows.">
    {#each windows as [id, instance] (id)}
      <tr class={id === focused_id ? "text-primary" : undefined}>
        <td>{instance.order}</td>
        <td class="font-sans">{instance.app.manifest.name}</td>
        <td title={id}>{id.slice(0, 8)}</td>
        <td>{instance.bounds.x},{instance.bounds.y} {instance.bounds.width}×{instance.bounds.height}</td>
        <td>{[...instance.flags, instance.snap_zone && `snap ${instance.snap_zone}`].filter(Boolean).join(", ") || "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
