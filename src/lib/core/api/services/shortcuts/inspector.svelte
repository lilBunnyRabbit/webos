<script lang="ts">
  import { format_keys, type InspectorProps, type ShortcutsService } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<ShortcutsService> = $props();

  const shortcuts = $derived(service.list());
  const window_scoped = $derived(shortcuts.filter((shortcut) => shortcut.window).length);
</script>

<InspectorStats>
  <InspectorStat label="Registered" value={shortcuts.length} />
  <InspectorStat label="Window" value={window_scoped} />
  <InspectorStat label="Keys" value={service.mac ? "macOS" : "PC"} />
</InspectorStats>

{#if detailed}
  <InspectorTable columns={["Keys", "Id", "Scope"]} empty={shortcuts.length === 0} empty_text="Nothing registered.">
    {#each shortcuts as shortcut (shortcut)}
      <tr>
        <td>{format_keys(shortcut.keys, service.mac).join(" ")}</td>
        <td>{shortcut.id}</td>
        <td title={shortcut.window}>{shortcut.window ? `window ${shortcut.window.slice(0, 8)}` : "global"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
