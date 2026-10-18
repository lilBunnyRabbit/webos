<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DialogsService, type WindowId, type WindowsService } from "$lib/core/api";
  import { create_storage_handle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_window_handle } from "$lib/core/contexts/app/window-handle";
  import WindowContent from "../window/window-content.svelte";
  import WindowSheets from "../window/window-sheets.svelte";

  let { id }: { id: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const instance = $derived(windows.get(id)!);
  const has_sheets = $derived(dialogs.for_window(id).length > 0);

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

<div data-window-id={id} class="relative h-full w-full overflow-hidden bg-background [container-type:size]">
  <div class="contents" inert={has_sheets}>
    <WindowContent window_id={id} zoom={1} />
  </div>
  <WindowSheets window_id={id} />
</div>
