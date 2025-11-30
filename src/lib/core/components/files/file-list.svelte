<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: Promise<DirectoryHandler>) => void;
    search: string;
  }

  let { handler, search = $bindable(), onnavigate }: Props = $props();

  const items_promise = $derived(
    handler
      .values()
      .then((values) =>
        values
          .sort((a, b) => {
            if (a.type === "directory" && b.type === "file") return -1;
            if (a.type === "file" && b.type === "directory") return 1;
            return 0;
          })
          .filter((item) => {
            if (!search) return true;
            return new RegExp(search, "i").test(item.handle.name);
          })
      )
      .catch((error) => {
        console.error(error);
        return [];
      })
  );
</script>

<div class="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 overflow-y-auto max-h-full h-fit">
  <div class="grid grid-cols-subgrid col-span-4 px-4 py-2 sticky top-0 bg-background border-b border-b-foreground">
    <div class="col-span-2 font-medium text-sm">Name</div>
    <div class="font-medium text-sm">Size</div>
    <div class="font-medium text-sm">Date</div>
  </div>

  {#await items_promise}
    {#each { length: 5 }, idx (idx)}
      <div class="bg-foreground/10 animate-pulse h-10 col-span-4"></div>
    {/each}
  {:then items}
    {#if items.length === 0}
      <div class="col-span-4 px-4 py-2 h-full text-accent">No files found</div>
    {/if}

    {#each items as item (item.handle.name)}
      {#if item.type === "file"}
        <button
          class="grid grid-cols-subgrid col-span-4 items-center focus:bg-foreground/5 hover:bg-foreground/5 px-4 py-2"
          ondblclick={() => {}}
          onkeydown={(e) => {
            if (e.key === "Delete") {
              handler.remove_file(item.handle);
            }
          }}
        >
          <FileRow handle={item.handle} />
        </button>
      {:else if item.type === "directory"}
        <button
          class="grid grid-cols-subgrid col-span-4 items-center focus:bg-foreground/5 hover:bg-foreground/5 px-4 py-2"
          ondblclick={() => {
            onnavigate(handler.open_directory(item.handle));
          }}
          onkeydown={(e) => {
            if (e.key === "Delete") {
              handler.remove_directory(item.handle);
            }
          }}
        >
          <DirectoryRow handle={item.handle} />
        </button>
      {/if}
    {/each}
  {/await}
</div>
