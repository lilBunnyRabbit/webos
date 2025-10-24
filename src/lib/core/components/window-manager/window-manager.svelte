<script lang="ts">
  import { SYS, WM } from "$lib/core/stores";
  import { WINDOW_MANAGER_CONTAINER_ID, getElementBounds } from "$lib/core/utils/window";
  import type { SvelteHTMLElements } from "svelte/elements";
  import Window from "../window/window.svelte";
  import type { Attachment } from "svelte/attachments";

  let props: SvelteHTMLElements["div"] = $props();

  const resizeAttachment: Attachment<HTMLDivElement> = (element) => {
    const updateBounds = () => {
      WM.container.setBounds(getElementBounds(element));
    };

    const resizeObserver = new ResizeObserver(() => {
      console.log("update bounds on resize");
      updateBounds();
    });

    $effect(() => {
      SYS.taskbar.position;
      requestAnimationFrame(() => {
        console.log("update bounds on taskbar position change");
        updateBounds();
      });
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  };
</script>

<div {@attach resizeAttachment} id={WINDOW_MANAGER_CONTAINER_ID} {...props}>
  <div class="absolute top-12 right-0">
    {@html JSON.stringify(WM.container.getBounds(), null, 2)}
  </div>

  {#each Object.keys(WM.windows.index) as windowId (windowId)}
    <Window {windowId} />
  {/each}
</div>
