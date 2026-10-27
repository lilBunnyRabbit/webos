<script lang="ts">
  import { untrack } from "svelte";
  import type { AchievementsHandle, AppContext, WindowHandle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_storage_handle } from "$lib/core/contexts/app/storage-handle.svelte";
  import SpeedReader from "../speed-reader.app.svelte";

  let { achievements }: { achievements: AchievementsHandle } = $props();

  const handle: Partial<WindowHandle> = { id: "test", is_focused: true, is_visible: true, on_back: () => () => {} };

  set_app_context({
    window_id: "test",
    app_id: "speed-reader",
    window: handle as WindowHandle,
    storage: create_storage_handle("speed-reader", {}),
    achievements: untrack(() => achievements),
  } satisfies AppContext);
</script>

<SpeedReader />
