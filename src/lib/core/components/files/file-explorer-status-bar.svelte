<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import type { FilesService } from "$lib/core/api/services/files";
  import { format_bytes } from "$lib/core/api/services/files";

  interface Props {
    handler: DirectoryHandler;
    files: FilesService;
  }

  let { handler, files }: Props = $props();

  const folder_count = $derived(handler.items.filter((i) => i.kind === "directory").length);
  const file_count = $derived(handler.items.filter((i) => i.kind === "file").length);

  let storage = $state<{ usage: number; quota: number } | null>(null);

  $effect(() => {
    files.get_storage_estimate().then((s) => (storage = s));

    const interval = setInterval(() => {
      files.get_storage_estimate().then((s) => (storage = s));
    }, 30_000);

    return () => clearInterval(interval);
  });
</script>

<div class="border-t border-t-foreground/20 bg-background-dark px-3 py-1.5 text-xs text-foreground/60">
  <div class="flex items-center justify-between">
    <span>
      {handler.items.length} items
      {#if folder_count > 0 || file_count > 0}
        <span>
          ({#if folder_count > 0}{folder_count} folder{folder_count !== 1 ? "s" : ""}{#if file_count > 0}, {/if}{/if}{#if file_count > 0}{file_count} file{file_count !== 1 ? "s" : ""}{/if})
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
