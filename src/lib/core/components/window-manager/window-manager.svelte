<script lang="ts">
  import { WM } from "$lib/core/stores";
  import { WINDOW_MANAGER_CONTAINER_ID, getElementBounds } from "$lib/core/utils/window";
  import type { SvelteHTMLElements } from "svelte/elements";
  import Window from "../window/window.svelte";
  import type { Attachment } from "svelte/attachments";

  let props: SvelteHTMLElements["div"] = $props();

  const resizeAttachment: Attachment<HTMLDivElement> = (element) => {
    const updateBounds = () => {
      WM.container.setBounds(getElementBounds(element));
    };

    updateBounds();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateBounds);

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
