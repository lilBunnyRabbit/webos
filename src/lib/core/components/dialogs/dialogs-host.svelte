<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import type { Attachment } from "svelte/attachments";

  /** `sheet`: anchored dialogs (menus, Open with) rise from the bottom of the screen instead (the mobile shell). */
  let { anchored = "dropdown" }: { anchored?: "dropdown" | "sheet" } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  /** A button is held: a right-click's `contextmenu` fires mid-press. */
  let pressed = false;

  $effect(() => {
    const down = () => (pressed = true);
    const up = () => (pressed = false);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  });

  // Native modal dialog: closedby="any" gives Esc, outside-click dismissal, focus trap/return and stacking (ADR-019).
  // Opened mid-press, it waits for the release: a menu that flips above the pointer (the taskbar's) would otherwise
  // get that release outside itself and light-dismiss at once.
  const open_modal: Attachment<HTMLDialogElement> = (element) => {
    const show = () => {
      if (element.isConnected && !element.open) element.showModal();
    };
    const release = () => setTimeout(show);
    if (pressed) {
      window.addEventListener("pointerup", release, { once: true });
      window.addEventListener("pointercancel", release, { once: true });
    } else show();
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      if (element.open) element.close();
    };
  };
</script>

{#each dialogs.system as entry (entry.id)}
  {@const sheet = entry.anchored && anchored === "sheet"}
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
      "m-0 p-0 max-w-none max-h-none border-0 bg-transparent text-foreground overflow-visible outline-none",
      sheet ? "inset-x-0 top-auto bottom-0 w-full animate-sheet-in" : "inset-auto",
      // Every dialog, anchored menu or centered question, sits on the shared scrim; questions also blur what's behind.
      "backdrop:bg-(--overlay)",
      !entry.anchored && "backdrop:backdrop-blur-[2px]",
    ]}
    style:position-anchor={sheet ? undefined : `--dialog-${entry.id}`}
    style:position-area={sheet ? undefined : entry.anchored ? "bottom span-right" : "center"}
    style:position-try-fallbacks={!sheet && entry.anchored ? "flip-block, flip-inline, flip-block flip-inline" : undefined}
  >
    <entry.component {...entry.props} {...sheet && { sheet: true }} resolve={entry.resolve} />
  </dialog>
{/each}
