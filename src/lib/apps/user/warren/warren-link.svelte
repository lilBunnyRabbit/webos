<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { ArrowSquareOut as ArrowSquareOutIcon } from "phosphor-svelte";
  import type { WarrenEditor } from "./editor.svelte";
  import { normalize_url } from "./model";

  interface Props {
    id: string;
    anchor: string;
    editor: WarrenEditor;
    placement: "anchor" | "center" | "sheet";
  }

  let { id, anchor, editor, placement }: Props = $props();

  let popover = $state<HTMLElement>();
  let value = $state("");
  let touched = $state(false);

  const url = $derived(normalize_url(value));
  const error = $derived(touched && value.trim() && !url ? "Type a web address or an email address." : "");

  function apply(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (!url) return;
    editor.set_link(url);
    close();
  }

  function remove() {
    editor.set_link(null);
    close();
  }

  function close() {
    popover?.hidePopover();
    editor.focus();
  }
</script>

<div
  bind:this={popover}
  {id}
  popover="auto"
  class={["link-popover m-0 rounded-xl bg-background-lighter p-3 text-foreground shadow-popover", placement]}
  style="position-anchor: {anchor}"
  ontoggle={(event) => {
    if (event.newState !== "open") return;
    value = editor.link ?? "";
    touched = false;
  }}
>
  <form class="flex flex-col gap-2" onsubmit={apply}>
    <div class="flex items-center justify-between gap-2">
      <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">{editor.link ? "Edit link" : "Add link"}</p>
      {#if editor.link}
        <IconButton label="Open link in a new tab" size="sm" onclick={() => window.open(editor.link!, "_blank", "noopener")}><ArrowSquareOutIcon weight="bold" /></IconButton>
      {/if}
    </div>
    <Input size="sm" type="text" inputmode="url" autocomplete="off" placeholder="example.com" aria-label="Link address" bind:value autofocus aria-invalid={!!error} />
    {#if error}<p class="text-2xs text-error">{error}</p>{/if}
    <div class="flex justify-end gap-1">
      {#if editor.link}<Button size="sm" variant="quiet" onclick={remove}>Remove</Button>{/if}
      <Button size="sm" variant="primary" type="submit" disabled={!value.trim()}>{editor.link ? "Update" : "Add"}</Button>
    </div>
  </form>
</div>

<style>
  .link-popover {
    width: min(20rem, calc(100vw - 2rem));
  }

  .link-popover.center {
    inset: 0;
    margin: auto;
    height: fit-content;
  }

  .link-popover.anchor {
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }

  .link-popover.sheet {
    inset: auto 0 0 0;
    width: 100%;
    max-width: none;
    border-radius: 1rem 1rem 0 0;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
  }
</style>
