<script lang="ts">
  import type { FilesService, InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";
  import { error_message, format_bytes } from "$lib/core/utils";

  let { service, detailed }: InspectorProps<FilesService> = $props();

  // Read once per mount: OPFS has no change events to subscribe to.
  const estimate = $derived(service.get_storage_estimate());
  const persisted = navigator.storage.persisted();
  const root = $derived(detailed ? service.list(null, { include_metadata: true }) : null);
</script>

<InspectorStats>
  {#await estimate}
    <InspectorStat label="Usage" value="…" />
  {:then { usage, quota }}
    <InspectorStat label="Usage" value="{format_bytes(usage)} / {format_bytes(quota)}" />
  {/await}
  {#await persisted then is_persisted}
    <InspectorStat label="Storage" value={is_persisted ? "persistent" : "best effort"} />
  {/await}
</InspectorStats>

{#if root}
  {#await root}
    <p class="text-ui text-foreground/65">Reading root…</p>
  {:then items}
    <InspectorTable columns={["Name", "Kind", "Size"]} empty={items.length === 0} empty_text="Root is empty.">
      {#each items as item (item.name)}
        <tr>
          <td class="font-sans">{item.name}</td>
          <td>{item.kind}</td>
          <td>{item.kind === "file" && item.size !== undefined ? format_bytes(item.size) : "—"}</td>
        </tr>
      {/each}
    </InspectorTable>
  {:catch error}
    <p class="text-ui text-error">Could not read root: {error_message(error)}</p>
  {/await}
{/if}
