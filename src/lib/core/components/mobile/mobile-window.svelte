<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DialogsService, type MobileWindowsService, type WindowId } from "$lib/core/api";
  import { create_storage_handle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_window_handle } from "$lib/core/contexts/app/window-handle";
  import WindowContent from "../window/window-content.svelte";
  import WindowSheets from "../window/window-sheets.svelte";

  let { id }: { id: WindowId } = $props();

  const windows = $derived(kernel.service<MobileWindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const instance = $derived(windows.get(id)!);
  const has_sheets = $derived(dialogs.for_window(id).length > 0);

  // Same as the desktop window: set once, here, so the window's sheets get the context too.
  untrack(() => {
    const app_id = instance.app.id;
    set_app_context({
      window_id: id,
      app_id,
      window: create_window_handle(id),
      storage: create_storage_handle(app_id, instance.app.state),
    });
  });
</script>

<!-- No chrome: the app fills the screen below the device's own status bar. -->
<div class="flex h-full w-full flex-col bg-background pt-[env(safe-area-inset-top)]">
  <div class="relative min-h-0 flex-1 overflow-hidden [container-type:size]">
    <div class="contents" inert={has_sheets}>
      <WindowContent window_id={id} zoom={1} />
    </div>
    <WindowSheets window_id={id} />
  </div>
</div>
