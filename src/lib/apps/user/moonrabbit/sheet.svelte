<script lang="ts">
  import type { Snippet } from "svelte";
  import { Grabber, IconButton } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { X as XIcon } from "phosphor-svelte";

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let { title, onclose, children, footer }: Props = $props();
</script>

<div class="absolute inset-0 z-30 flex flex-col justify-end @2xl:items-center @2xl:justify-center @2xl:p-6">
  <button type="button" tabindex="-1" aria-label="Close" class="absolute inset-0 bg-(--overlay)" onclick={onclose}></button>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    class="relative mx-auto flex max-h-[92%] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-background shadow-raised ring-1 ring-hairline outline-none motion-safe:animate-sheet-in @2xl:rounded-2xl"
    {@attach (element) => element.focus({ preventScroll: true })}
    {@attach swipe_dismiss({ on_dismiss: onclose })}
    onfocusout={(event) => {
      const dialog = event.currentTarget;
      if (!event.relatedTarget) queueMicrotask(() => document.activeElement === document.body && dialog.focus({ preventScroll: true }));
    }}
    onkeydown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onclose();
    }}
  >
    <Grabber class="mt-2 @2xl:hidden" />
    <header class="flex items-center gap-2 px-4 pt-2 pb-1 @2xl:pt-4">
      <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
      <IconButton label="Close" size="sm" onclick={onclose}><XIcon weight="bold" /></IconButton>
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-4 pt-2 pb-4">
      {@render children()}
    </div>
    {#if footer}
      <div class="flex flex-wrap justify-end gap-2 border-t border-hairline bg-background-light p-3">{@render footer()}</div>
    {/if}
  </div>
</div>
