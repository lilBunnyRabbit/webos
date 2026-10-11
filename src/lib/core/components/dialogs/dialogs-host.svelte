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

{#each dialogs.system as entry (entry.id)}
  <div
    class="fixed size-0 pointer-events-none"
    style:left="{entry.point.x}px"
    style:top="{entry.point.y}px"
    style:anchor-name="--dialog-{entry.id}"
  ></div>

  <dialog
    {@attach open_modal}
    closedby={entry.dismissible ? "any" : "none"}
    onclose={() => entry.resolve(null)}
    oncancel={(event) => {
      // closedby="none" still lets Esc fire cancel in some builds; a required answer ignores it.
      if (!entry.dismissible) event.preventDefault();
    }}
    class={[
      "m-0 p-0 inset-auto max-w-none max-h-none border-0 bg-transparent text-foreground overflow-visible outline-none",
      // Every dialog, anchored menu or centered question, sits on the shared scrim; questions also blur what's behind.
      "backdrop:bg-(--overlay)",
      !entry.anchored && "backdrop:backdrop-blur-[2px]",
    ]}
    style:position-anchor="--dialog-{entry.id}"
    style:position-area={entry.anchored ? "bottom span-right" : "center"}
    style:position-try-fallbacks={entry.anchored ? "flip-block, flip-inline, flip-block flip-inline" : undefined}
  >
    <entry.component {...entry.props} resolve={entry.resolve} />
  </dialog>
{/each}
