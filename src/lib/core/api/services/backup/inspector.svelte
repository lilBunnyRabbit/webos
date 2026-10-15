<script lang="ts">
  import type { BackupService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { format_bytes } from "$lib/core/utils";
  import { BACKUP_AREAS, type BackupArea } from "./type";

  let { service, detailed }: InspectorProps<BackupService> = $props();

  let sizes = $state<Record<BackupArea, number> | null>(null);

  $effect(() => {
    if (!detailed) return;
    let cancelled = false;
    service.sizes().then((result) => {
      if (!cancelled) sizes = result;
    });
    return () => {
      cancelled = true;
    };
  });
</script>

<InspectorStats>
  <InspectorStat label="Activity" value={service.activity ?? "idle"} />
  <InspectorStat label="Last backup" value={service.last ? `${service.last.name} · ${format_bytes(service.last.size)}` : "—"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Area", "Folder", "Size"]}>
    {#each BACKUP_AREAS as { area, label, path } (area)}
      <tr>
        <td>{label}</td>
        <td>{path}</td>
        <td>{sizes ? format_bytes(sizes[area]) : "…"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
