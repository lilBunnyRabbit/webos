<script lang="ts">
  import kernel, { type DialogsService, type WindowId, type WindowsService } from "$lib/core/api";
  import WindowContent from "./window-content.svelte";
  import WindowSheets from "./window-sheets.svelte";
  import DialogsHost from "../dialogs/dialogs-host.svelte";

  /** A popped-out window's app inside its mini window (ADR-043), mounted there by `window.svelte`. */
  let { window_id, zoom }: { window_id: WindowId; zoom: number } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const has_sheets = $derived(dialogs.for_window(window_id).length > 0);

  let element = $state<HTMLElement | null>(null);
  const view = $derived(element?.ownerDocument.defaultView ?? null);
</script>

<div
  bind:this={element}
  class="relative h-dvh w-dvw overflow-hidden bg-background text-foreground [container-type:size]"
  onpointerdowncapture={() => windows.focus(window_id)}
  onfocusin={() => windows.focus(window_id)}
>
  <div class="contents" inert={has_sheets}>
    <WindowContent {window_id} {zoom} />
  </div>
  <WindowSheets {window_id} />
</div>

{#if view}
  <DialogsHost origin={window_id} {view} />
{/if}
