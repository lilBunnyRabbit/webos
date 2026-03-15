<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import type { FilesService } from "$lib/core/api/services/files";
  import { format_bytes } from "$lib/core/utils";

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
    storage = await files.get_storage_estimate();
  }

  fetch_storage();

  $effect(() => {
    const interval = setInterval(fetch_storage, 30_000);
    return () => clearInterval(interval);
  });
</script>

<div class="border-t border-t-foreground/20 bg-background-dark px-3 py-1.5 text-xs text-foreground/60">
  <div class="flex items-center justify-between">
    <span>
      {handler.items.length} items
      {#if counts.folders > 0 || counts.files > 0}
        <span>
          ({#if counts.folders > 0}{counts.folders} folder{counts.folders !== 1 ? "s" : ""}{#if counts.files > 0}, {/if}{/if}{#if counts.files > 0}{counts.files} file{counts.files !== 1 ? "s" : ""}{/if})
        </span>
      {/if}
    </span>
    {#if storage}
      <span>
        Storage: {format_bytes(storage.usage)} / {format_bytes(storage.quota)}
        ({storage.quota > 0 ? ((storage.usage / storage.quota) * 100).toFixed(1) : "0.0"}%)
      </span>
    {/if}
  </div>
</div>
