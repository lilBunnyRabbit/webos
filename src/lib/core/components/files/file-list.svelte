<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import type { FileSystemDirectoryItem, FileSystemFileItem, FileSystemItem } from "$lib/core/api/services/files";
  import { join_path } from "$lib/core/api/services/files/path";
  import type { Position } from "$lib/core/utils/type";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";
  import { report_file_error } from "./file-explorer.errors";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: DirectoryHandler) => void;
    search: string;
  }

  let { handler, search = $bindable(), onnavigate }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const filtered_items = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return handler.items;
    return handler.items.filter((item) => item.name.toLowerCase().includes(query));
  });

  function is_delete_key(e: KeyboardEvent): boolean {
    return e.key === "Delete" || (e.key === "Backspace" && e.metaKey);
  }

  function delete_item(item: FileSystemItem) {
    const recursive = item.kind === "directory";
    const message = recursive ? `Delete "${item.name}" and all its contents?` : `Delete "${item.name}"?`;
    if (!confirm(message)) return;

    handler
      .delete_entry(item.name, { recursive })
      .catch((error) => report_file_error(`Could not delete "${item.name}"`, error));
  }

  function open_file(item: FileSystemFileItem, anchor: Position) {
    apps
      .open(join_path(handler.segments, item.name), { anchor })
      .catch((error) => report_file_error(`Could not open "${item.name}"`, error));
  }

  function row_anchor(element: HTMLElement): Position {
    const rect = element.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }

  function open_directory(item: FileSystemDirectoryItem) {
    handler
      .open_directory(item.name, item.handle)
      .then(onnavigate)
      .catch((error) => report_file_error(`Could not open "${item.name}"`, error));
  }
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
          ondblclick={(e) => open_file(item, { x: e.clientX, y: e.clientY })}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              open_file(item, row_anchor(e.currentTarget));
            } else if (is_delete_key(e)) {
              delete_item(item);
            }
          }}
        >
          <FileRow {item} />
        </button>
      {:else if item.kind === "directory"}
        <button
          class="grid grid-cols-subgrid col-span-4 items-center focus:bg-foreground/5 hover:bg-foreground/5 px-4 py-2"
          ondblclick={() => open_directory(item)}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              open_directory(item);
            } else if (is_delete_key(e)) {
              delete_item(item);
            }
          }}
        >
          <DirectoryRow handle={item.handle} />
        </button>
      {/if}
    {/each}
  {/if}
</div>
