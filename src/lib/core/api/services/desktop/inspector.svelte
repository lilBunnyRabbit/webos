<script lang="ts">
  import kernel, { type AppsService, type GridDesktopService, type InspectorProps } from "$lib/core/api";
  import { InspectorStat, InspectorStats, InspectorTable } from "$lib/core/components/inspector";

  let { service, detailed }: InspectorProps<GridDesktopService> = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const grid = $derived(service.container.grid);
  const items = $derived(
    service.list().flatMap((row, y) => (row ?? []).flatMap((item, x) => (item ? [{ ...item, x, y }] : [])))
  );
  const occupied = $derived(new Set(items.map(({ x, y }) => `${x},${y}`)));
</script>

<InspectorStats>
  <InspectorStat label="Grid" value="{grid.columns}×{grid.rows}" />
  <InspectorStat label="Icons" value={items.length} />
  <InspectorStat label="Cell" value="{Math.round(service.container.cell.width)}×{Math.round(service.container.cell.height)}" />
</InspectorStats>

{#if detailed}
  {#if grid.columns > 0 && grid.rows > 0}
    <div
      class="grid w-fit gap-px rounded-sm border border-hairline-strong bg-foreground/10 p-px"
      style:grid-template-columns="repeat({grid.columns}, 0.5rem)"
      aria-hidden="true"
    >
      {#each { length: grid.rows * grid.columns }, index (index)}
        <span class="size-2 {occupied.has(`${index % grid.columns},${Math.floor(index / grid.columns)}`) ? 'bg-primary' : 'bg-background'}"></span>
      {/each}
    </div>
  {/if}

  <InspectorTable columns={["Cell", "Entry", "Kind", "Target"]} empty={items.length === 0} empty_text="Desktop folder is empty.">
    {#each items as item (`${item.x},${item.y}`)}
      <tr>
        <td>{item.x},{item.y}</td>
        <td class="font-sans">{item.name}</td>
        <td>{item.kind}</td>
        <td class="font-sans">{item.kind === "shortcut" ? (apps.get(item.app_id)?.name ?? `${item.app_id} (missing)`) : "—"}</td>
      </tr>
    {/each}
  </InspectorTable>
{/if}
