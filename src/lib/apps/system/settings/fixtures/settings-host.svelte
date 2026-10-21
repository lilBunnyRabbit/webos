<script lang="ts">
  import { untrack } from "svelte";
  import type { AppContext, WindowHandle } from "$lib/core/contexts/app";
  import { set_app_context } from "$lib/core/contexts/app/context";
  import { create_storage_handle } from "$lib/core/contexts/app/storage-handle.svelte";
  import Settings from "../settings.app.svelte";
  import type { SectionId } from "../ids";

  let { section, setting }: { section?: SectionId; setting?: string } = $props();

  const window_state = $state<Record<string, unknown>>({});

  const handle: Partial<WindowHandle> = {
    id: "test",
    is_focused: true,
    is_visible: true,
    on_back: () => () => {},
    confirm: async () => false,
    pick_file: (async () => null) as WindowHandle["pick_file"],
  };

  set_app_context({
    window_id: "test",
    app_id: "settings",
    window: handle as WindowHandle,
    storage: create_storage_handle("settings", window_state),
  } satisfies AppContext);

  const initial = untrack(() => ({ section, setting }));
</script>

<Settings {...initial} />
