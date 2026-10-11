<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import type { FilesService } from "$lib/core/api/services/files";
  import { format_bytes } from "$lib/core/utils";
  import { StatusBar } from "../ui";

  interface Props {
    handler: DirectoryHandler;
    files: FilesService;
  }

  let { handler, files }: Props = $props();

  const counts = $derived(
    handler.items.reduce(
      (acc, i) => {
        if (i.kind === "directory") acc.folders++;
        else acc.files++;
        return acc;
      },
      { folders: 0, files: 0 }
    )
  );

  let storage = $state<{ usage: number; quota: number } | null>(null);

  async function fetch_storage() {
    try {
      storage = await files.get_storage_estimate();
    } catch (error) {
      console.error("[FileExplorer] Failed to read storage estimate", error);
    }
  }

  $effect(() => {
    void handler.items;
    fetch_storage();
    const interval = setInterval(fetch_storage, 30_000);
    return () => clearInterval(interval);
  });
</script>

<StatusBar>
  <span>
    {handler.items.length} {handler.items.length === 1 ? "item" : "items"}
    {#if counts.folders > 0 && counts.files > 0}<span class="hidden @sm:inline">· {counts.folders} folders, {counts.files} files</span>{/if}
  </span>
  {#if storage}
    {@const used = storage.quota > 0 ? storage.usage / storage.quota : 0}
    <span class="ml-auto hidden items-center gap-2 @md:flex" title="{(used * 100).toFixed(1)}% of this device's storage quota">
      <span class="h-1 w-16 overflow-hidden rounded-full bg-foreground/12">
        <span class="block h-full rounded-full bg-primary" style:width="{Math.max(used * 100, 2)}%"></span>
      </span>
      {format_bytes(storage.usage)} of {format_bytes(storage.quota)}
    </span>
  {/if}
</StatusBar>
