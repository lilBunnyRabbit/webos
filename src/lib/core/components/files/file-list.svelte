<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import type { FileSystemDirectoryItem, FileSystemFileItem, FileSystemItem } from "$lib/core/api/services/files";
  import { join_path } from "$lib/core/api/services/files/path";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";
  import type { Position } from "$lib/core/utils/type";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import { EmptyState } from "../ui";
  import { FolderOpen as FolderOpenIcon, MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";

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

<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
  {#if handler.loading && handler.items.length === 0}
    <div class="flex flex-col gap-1 p-2">
      {#each { length: 6 }, idx (idx)}
        <div class="h-8 animate-pulse rounded-md bg-foreground/5" style:opacity={1 - idx * 0.14}></div>
      {/each}
    </div>
  {:else if handler.items.length === 0}
    <EmptyState icon={FolderOpenIcon} title="This folder is empty" description="Upload files or create a folder from the toolbar." />
  {:else if filtered_items.length === 0}
    <EmptyState icon={MagnifyingGlassIcon} title="No matches" description={`Nothing here is called "${search}".`} />
  {:else}
    <div role="grid" aria-label="Folder contents" class="grid grid-cols-[1.25rem_1fr_auto_auto] gap-x-3 px-2 pb-2">
      <div role="row" class="sticky top-0 z-10 col-span-4 grid grid-cols-subgrid border-b border-foreground/8 bg-background px-2 pt-2 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">
        <div role="columnheader" class="col-span-2">Name</div>
        <div role="columnheader" class="w-16 text-right">Size</div>
        <div role="columnheader" class="hidden w-24 @md:block">Modified</div>
      </div>

      {#each filtered_items as item (item.name)}
        {@const row = "col-span-4 grid h-8 grid-cols-subgrid items-center rounded-md px-2 text-left transition-colors duration-100 hover:bg-foreground/6 focus:bg-primary/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset"}
        {#if item.kind === "file"}
          <button
            role="row"
            class={row}
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
            role="row"
            class={row}
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
            <DirectoryRow handle={item.handle} system={is_system_path(join_path(handler.segments, item.name))} />
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>
