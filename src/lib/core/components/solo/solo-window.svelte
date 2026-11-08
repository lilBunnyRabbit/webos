<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type DialogsService, WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import { create_storage_handle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_window_handle } from "$lib/core/contexts/app/window-handle";
  import { create_achievements_handle } from "$lib/core/contexts/app/achievements-handle";
  import WindowContent from "../window/window-content.svelte";
  import WindowSheets from "../window/window-sheets.svelte";
  import { load_guide } from "../window/load-guide";
  import WindowImmersiveExit from "../window/window-immersive-exit.svelte";
  import { immersive_insets } from "../window/window-immersive";
  import { cn } from "$lib/core/utils";

  let { id }: { id: WindowId } = $props();

  const windows = $derived(kernel.service<WindowsService>("windows"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const instance = $derived(windows.get(id)!);
  const has_sheets = $derived(dialogs.for_window(id).length > 0);
  const has_guide = $derived(instance.flags.has(WindowFlag.GUIDE));
  const is_immersive = $derived(instance.flags.has(WindowFlag.IMMERSIVE));

  untrack(() => {
    const app_id = instance.app.id;
    set_app_context({
      window_id: id,
      app_id,
      window: create_window_handle(id),
      storage: create_storage_handle(app_id, instance.app.state),
      achievements: create_achievements_handle(app_id),
    });
  });
</script>

<div data-window-id={id} class={cn("relative h-full w-full overflow-hidden bg-background [container-type:size]", immersive_insets(is_immersive))}>
  <div class="contents" inert={has_sheets || has_guide}>
    <WindowContent window_id={id} zoom={1} />
  </div>
  {#if has_guide}
    {#await load_guide(id) then WindowGuide}
      {#if WindowGuide}<div class="contents" inert={has_sheets}><WindowGuide window_id={id} /></div>{/if}
    {/await}
  {/if}
  {#if is_immersive}<WindowImmersiveExit window_id={id} />{/if}
  <WindowSheets window_id={id} />
</div>
