<script lang="ts">
  import kernel, { type SettingsService, type WindowsService } from "$lib/core/api";
  import type { SvelteHTMLElements } from "svelte/elements";
  import Window from "../window/window.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const windows = $derived(kernel.service<WindowsService>("windows"));

  let props: SvelteHTMLElements["div"] = $props();
</script>

<div
  {@attach (element) => {
    const updateBounds = () => {
      windows.set_container(element);
    };

    const resizeObserver = new ResizeObserver(() => {
      console.log("update bounds on resize");
      updateBounds();
    });

    $effect(() => {
      // TODO: revisit
      settings.taskbar.position;
      requestAnimationFrame(() => {
        console.log("update bounds on taskbar position change");
        updateBounds();
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }}
  {...props}
>
  <div class="absolute top-12 right-0">
    {@html JSON.stringify(windows.container.bounds, null, 2)}
  </div>

  {#each windows.list() as id (id)}
    <Window id={id} />
  {/each}
</div>
