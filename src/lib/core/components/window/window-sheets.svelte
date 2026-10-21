<script lang="ts">
  import kernel, { Platform, type DialogsService, type WindowId } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import type { Attachment } from "svelte/attachments";
  import { Grabber } from "../ui";

  let { window_id }: { window_id: WindowId } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const sheets = $derived(dialogs.for_window(window_id));
  /** On a phone a sheet rises from the bottom of the window, where the thumb is, and swipes back down. */
  const docked = kernel.platform === Platform.MOBILE;

  // Native <dialog> would go to the top layer and escape the window, so a sheet is a plain element: focus moves into it
  // on open, the app behind it is made inert by the window, and Esc is handled here.
  const focus_first: Attachment<HTMLElement> = (element) => {
    // Two lookups: a selector list would return whichever matches first in document order, not [autofocus] first.
    const target = element.querySelector<HTMLElement>("[autofocus]") ?? element.querySelector<HTMLElement>("input, button") ?? element;
    target.focus();
  };
</script>

{#each sheets as entry, index (entry.id)}
  {@const top = index === sheets.length - 1}
  <div
    class={cn(
      "absolute inset-0 z-30 grid bg-(--overlay) backdrop-blur-[2px]",
      docked ? "items-end justify-items-center p-2" : "place-items-center p-4"
    )}
    inert={!top}
    role="presentation"
    onkeydown={(event) => {
      if (event.key === "Escape" && entry.dismissible) {
        event.stopPropagation();
        entry.resolve(null);
      }
    }}
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      class={cn("relative max-h-full max-w-full outline-none", docked ? "animate-sheet-in" : "animate-pop-in")}
      {@attach focus_first}
      {@attach docked && swipe_dismiss({ on_dismiss: () => entry.resolve(null), dismissible: entry.dismissible })}
    >
      <entry.component {...entry.props} resolve={entry.resolve} />
      {#if docked && entry.dismissible}<Grabber class="absolute inset-x-0 top-1.5" />{/if}
    </div>
  </div>
{/each}
