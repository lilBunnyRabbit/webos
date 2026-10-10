<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  // Native modal dialog: closedby="any" gives Esc, outside-click dismissal, focus trap/return and stacking (ADR-019).
  const open_modal: Attachment<HTMLDialogElement> = (element) => {
    element.showModal();
    return () => {
      if (element.open) element.close();
    };
  };
</script>

{#each dialogs.stack as entry (entry.id)}
  <div
    class="fixed size-0 pointer-events-none"
    style:left="{entry.point.x}px"
    style:top="{entry.point.y}px"
    style:anchor-name="--dialog-{entry.id}"
  ></div>

  <dialog
    {@attach open_modal}
    closedby="any"
    onclose={() => entry.resolve(null)}
    class="m-0 p-0 inset-auto max-w-none max-h-none border-0 bg-transparent text-foreground overflow-visible outline-none backdrop:bg-transparent"
    style:position-anchor="--dialog-{entry.id}"
    style:position-area={entry.anchored ? "bottom span-right" : "center"}
    style:position-try-fallbacks={entry.anchored ? "flip-block, flip-inline, flip-block flip-inline" : undefined}
  >
    <entry.component {...entry.props} resolve={entry.resolve} />
  </dialog>
{/each}
