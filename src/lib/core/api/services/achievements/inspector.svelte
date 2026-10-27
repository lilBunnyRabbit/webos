<script lang="ts">
  import type { InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { format_datetime } from "$lib/core/utils";
  import type { AchievementsService } from "./type";

  let { service, detailed }: InspectorProps<AchievementsService> = $props();

  const all = $derived(service.list());
  const declared = $derived(all.filter((entry) => !entry.builtin));
  const apps = $derived(new Set(declared.map((entry) => entry.app_id)).size);
</script>

<InspectorStats>
  <InspectorStat label="Apps declaring" value={apps} />
  <InspectorStat label="Declared" value={declared.length} />
  <InspectorStat label="Unlocked" value={declared.filter((entry) => entry.unlocked).length} />
  <InspectorStat label="Built-in unlocked" value={all.filter((entry) => entry.builtin && entry.unlocked).length} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["App", "Id", "Unlocked", "Progress"]} empty={declared.length === 0} empty_text="No app declares achievements.">
    {#each declared as entry (`${entry.app_id}/${entry.def.id}`)}
      <tr>
        <td>{entry.app_id}</td>
        <td>{entry.def.id}{entry.def.secret ? " (secret)" : ""}</td>
        <td>{entry.unlocked_at === null ? "—" : format_datetime(entry.unlocked_at)}</td>
        <td>{entry.progress_text ?? "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
