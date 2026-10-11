<script lang="ts">
  import kernel, { type DialogsService, type WindowId } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";

  let { window_id }: { window_id: WindowId } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const sheets = $derived(dialogs.for_window(window_id));

  // Native <dialog> would go to the top layer and escape the window, so a sheet is a plain element: focus moves into it
  // on open, the app behind it is made inert by the window, and Esc is handled here.
  const focus_first: Attachment<HTMLElement> = (element) => {
    const target = element.querySelector<HTMLElement>("[autofocus], input, button") ?? element;
    target.focus();
  };
</script>

{#each sheets as entry, index (entry.id)}
  {@const top = index === sheets.length - 1}
  <div
    class="absolute inset-0 z-30 grid place-items-center bg-(--overlay) p-4 backdrop-blur-[2px]"
    inert={!top}
    role="presentation"
    onkeydown={(event) => {
      if (event.key === "Escape" && entry.dismissible) {
        event.stopPropagation();
        entry.resolve(null);
      }
    }}
  >
    <div role="dialog" aria-modal="true" tabindex="-1" class="max-h-full max-w-full animate-pop-in outline-none" {@attach focus_first}>
      <entry.component {...entry.props} resolve={entry.resolve} />
    </div>
  </div>
{/each}
