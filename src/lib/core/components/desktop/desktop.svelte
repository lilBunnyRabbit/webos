<script lang="ts">
  import kernel, { type DesktopService } from "$lib/core/api";
  import DesktopItem from "./desktop-item.svelte";

  const desktop = $derived(kernel.service<DesktopService>("desktop"));
</script>

<!-- TODO: remove padding -->
<div
  {@attach (element) => {
    const resizeObserver = new ResizeObserver(() => {
      desktop.set_container(element);
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }}
  class="grid w-full h-full overflow-hidden bg-background-dark place-items-center"
  style:grid-template-columns={`repeat(${desktop.container.grid.columns}, minmax(64px, 1fr))`}
  style:grid-template-rows={`repeat(${desktop.container.grid.rows}, minmax(64px, 1fr))`}
  style:grid-auto-flow="dense"
  style:padding={desktop.container.config.padding}
  style:background-image={desktop.container.cell.width > 0 && desktop.container.cell.height > 0
    ? `radial-gradient(circle at left top, var(--foreground) 1px, transparent 1px)`
    : undefined}
  style:background-size={desktop.container.cell.width > 0 && desktop.container.cell.height > 0
    ? `${desktop.container.cell.width}px ${desktop.container.cell.height}px`
    : undefined}
  style:background-position={`${desktop.container.config.padding}px ${desktop.container.config.padding}px`}
>
  {#each desktop.list() as row, rowIndex (rowIndex)}
    {#each row as id, index (index)}
      {#if id}
        <DesktopItem {id} x={index} y={rowIndex} />
      {/if}
    {/each}
  {/each}
</div>
