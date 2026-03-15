<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: DirectoryHandler) => void;
    search: string;
  }

  let { handler, search = $bindable(), onnavigate }: Props = $props();

  const filtered_items = $derived(
    handler.items.filter((item) => {
      if (!search) return true;
      try {
        return new RegExp(search, "i").test(item.name);
      } catch {
        return item.name.toLowerCase().includes(search.toLowerCase());
      }
    })
  );
</script>

<div class="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 overflow-y-auto max-h-full h-fit">
  <div class="grid grid-cols-subgrid col-span-4 px-4 py-2 sticky top-0 bg-background border-b border-b-foreground">
    <div class="col-span-2 font-medium text-sm">Name</div>
    <div class="font-medium text-sm">Size</div>
    <div class="font-medium text-sm">Date</div>
  </div>

  {#if handler.loading}
    {#each { length: 5 }, idx (idx)}
      <div class="bg-foreground/10 animate-pulse h-10 col-span-4"></div>
    {/each}
  {:else if filtered_items.length === 0}
    <div class="col-span-4 px-4 py-2 h-full text-accent">No files found</div>
  {:else}
    {#each filtered_items as item (item.name)}
      {#if item.kind === "file"}
        <button
          class="grid grid-cols-subgrid col-span-4 items-center focus:bg-foreground/5 hover:bg-foreground/5 px-4 py-2"
          ondblclick={() => {}}
          onkeydown={(e) => {
            if (e.key === "Delete") {
              handler.delete_entry(item.name);
            }
          }}
        >
          <FileRow handle={item.handle as FileSystemFileHandle} />
        </button>
      {:else if item.kind === "directory"}
        <button
          class="grid grid-cols-subgrid col-span-4 items-center focus:bg-foreground/5 hover:bg-foreground/5 px-4 py-2"
          ondblclick={async () => {
            onnavigate(await handler.open_directory(item.name, item.handle as FileSystemDirectoryHandle));
          }}
          onkeydown={(e) => {
            if (e.key === "Delete") {
              handler.delete_entry(item.name, { recursive: true });
            }
          }}
        >
          <DirectoryRow handle={item.handle as FileSystemDirectoryHandle} />
        </button>
      {/if}
    {/each}
  {/if}
</div>
