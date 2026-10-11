<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { join_path } from "$lib/core/api/services/files/path";
  import { Button } from "../ui";
  import type { PickerMode } from "./picker";

  let { handler, picker, selected }: { handler: DirectoryHandler; picker: PickerMode; selected: string | null } = $props();

  // A directory picker can take the open folder itself when nothing inside it is selected.
  const choice = $derived(
    selected ? join_path(handler.segments, selected) : picker.kind === "directory" ? handler.path : null
  );
</script>

<div class="flex shrink-0 items-center gap-3 border-t border-foreground/8 bg-background-light px-3 py-2.5">
  <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={choice ?? undefined}>
    {choice ?? (picker.kind === "file" ? "Choose a file" : "Choose a folder")}
  </span>
  <Button variant="quiet" onclick={picker.oncancel}>Cancel</Button>
  <Button variant="primary" disabled={!choice} onclick={() => choice && picker.onchoose(choice)}>
    {picker.kind === "file" ? "Open" : "Select folder"}
  </Button>
</div>
