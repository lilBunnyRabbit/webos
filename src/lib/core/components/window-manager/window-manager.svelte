<script lang="ts">
  import kernel, { type DesktopWindowsService, type SettingsService } from "$lib/core/api";
  import type { SvelteHTMLElements } from "svelte/elements";
  import Window from "../window/window.svelte";

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const windows = $derived(kernel.service<DesktopWindowsService>("windows"));

  const list = $derived(windows.list());

  let props: SvelteHTMLElements["div"] = $props();
</script>

<div
  {@attach (element) => {
    const update_bounds = () => {
      windows.set_container(element);
    };

    const resize_observer = new ResizeObserver(() => {
      update_bounds();
    });

    $effect(() => {
      // TODO: revisit
      settings.taskbar.position;
      settings.taskbar.size;
      settings.taskbar.auto_hide;
      requestAnimationFrame(() => {
        update_bounds();
      });
    });

    resize_observer.observe(element);
    return () => resize_observer.disconnect();
  }}
  {...props}
>
  {#each list as id (id)}
    <Window id={id} />
  {/each}
</div>
