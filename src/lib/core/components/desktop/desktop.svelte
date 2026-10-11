<script lang="ts">
  import kernel, { type DesktopService } from "$lib/core/api";
  import DesktopItem from "./desktop-item.svelte";
  import { background_menu, paste } from "./desktop-actions";

  const desktop = $derived(kernel.service<DesktopService>("desktop"));
</script>

<div
  {@attach (element) => {
    const resize_observer = new ResizeObserver(() => {
      desktop.set_container(element);
    });

    resize_observer.observe(element);
    return () => resize_observer.disconnect();
  }}
  role="presentation"
  onkeydown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      paste();
    }
  }}
  oncontextmenu={(event) => {
    if ((event.target as Element).closest("button")) return;
    event.preventDefault();
    background_menu({ x: event.clientX, y: event.clientY });
  }}
  class="desktop-surface grid size-full place-items-center overflow-hidden"
  style:grid-template-columns={`repeat(${desktop.container.grid.columns}, minmax(64px, 1fr))`}
  style:grid-template-rows={`repeat(${desktop.container.grid.rows}, minmax(64px, 1fr))`}
  style:grid-auto-flow="dense"
  style:padding={`${desktop.container.config.padding}px`}
  style:--cell-width="{desktop.container.cell.width || 88}px"
  style:--cell-height="{desktop.container.cell.height || 88}px"
  style:--grid-offset="{desktop.container.config.padding}px"
>
  {#if desktop.container.grid.columns > 0 && desktop.container.grid.rows > 0}
    {#each desktop.list() as row, row_index (row_index)}
      {#each row as item, index (index)}
        {#if item}
          <DesktopItem item={item} x={index} y={row_index} />
        {/if}
      {/each}
    {/each}
  {/if}
</div>

<style>
  /* The dot grid marks the icon cells; a soft glow from the top keeps the darkest shade from reading as a void.
     Both are shades of the same surface (gradients between shades are allowed by the brand). */
  .desktop-surface {
    background-color: var(--background-darkest);
    background-image:
      radial-gradient(circle at center, color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1.5px),
      radial-gradient(ellipse 90% 70% at 50% -10%, var(--background-dark), transparent 70%);
    background-size:
      var(--cell-width) var(--cell-height),
      100% 100%;
    background-position:
      calc(var(--grid-offset) - var(--cell-width) / 2) calc(var(--grid-offset) - var(--cell-height) / 2),
      0 0;
  }
</style>
