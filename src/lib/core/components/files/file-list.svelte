<script lang="ts">
  import kernel, { type AppsService, type DialogsService, type MenuItem } from "$lib/core/api";
  import type { FileSystemItem } from "$lib/core/api/services/files";
  import { join_path } from "$lib/core/api/services/files/path";
  import { SYSTEM_DIRECTORIES } from "$lib/core/api/services/files/hierarchy";
  import type { Position } from "$lib/core/utils/type";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import { get_app_context } from "$lib/core/contexts/app";
  import { EmptyState } from "../ui";
  import { create_folder, delete_item, open_with, open_with_items, rename_item, show_properties, upload } from "./file-actions";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    AppWindow as AppWindowIcon,
    Info as InfoIcon,
    PencilSimple as PencilSimpleIcon,
    FolderOpen as FolderOpenIcon,
    FolderPlus as FolderPlusIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Trash as TrashIcon,
    UploadSimple as UploadSimpleIcon,
  } from "phosphor-svelte";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: DirectoryHandler) => void;
    search: string;
  }

  let { handler, search = $bindable(), onnavigate }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window } = get_app_context();

  const filtered_items = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return handler.items;
    return handler.items.filter((item) => item.name.toLowerCase().includes(query));
  });

  function is_delete_key(e: KeyboardEvent): boolean {
    return e.key === "Delete" || (e.key === "Backspace" && e.metaKey);
  }

  function is_menu_key(e: KeyboardEvent): boolean {
    return e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);
  }

  function row_anchor(element: HTMLElement): Position {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + 24, y: rect.bottom };
  }

  function open(item: FileSystemItem, anchor: Position) {
    if (item.kind === "directory") {
      handler
        .open_directory(item.name, item.handle)
        .then(onnavigate)
        .catch((error) => report_file_error(`Could not open "${item.name}"`, error));
      return;
    }

    apps
      .open(join_path(handler.segments, item.name), { anchor })
      .catch((error) => report_file_error(`Could not open "${item.name}"`, error));
  }

  async function item_menu(item: FileSystemItem, anchor: Position) {
    const with_apps = await open_with_items(item);
    const items: MenuItem[] = [
      { id: "open", label: "Open", icon: ArrowSquareOutIcon, shortcut: "↵" },
      ...(with_apps.length > 1 ? [{ label: "Open with", icon: AppWindowIcon, items: with_apps }] : []),
      { separator: true },
      { id: "rename", label: "Rename", icon: PencilSimpleIcon, shortcut: "F2" },
      { separator: true },
      { id: "delete", label: "Delete", icon: TrashIcon, shortcut: "Del", danger: true },
      { separator: true },
      { id: "properties", label: "Properties", icon: InfoIcon, shortcut: "Alt+↵" },
    ];

    const choice = await dialogs.menu(items, { anchor });
    if (choice === "open") open(item, anchor);
    else if (choice === "rename") rename_item(handler, window, item);
    else if (choice === "delete") delete_item(handler, window, item);
    else if (choice === "properties") show_properties(handler, window, item);
    else if (choice?.startsWith("open_with:")) open_with(handler, item, choice.slice("open_with:".length));
  }

  async function background_menu(anchor: Position) {
    const choice = await dialogs.menu(
      [
        { id: "new_folder", label: "New folder", icon: FolderPlusIcon },
        { id: "upload", label: "Upload files", icon: UploadSimpleIcon },
        { separator: true },
        { id: "reload", label: "Reload", icon: ArrowClockwiseIcon },
      ],
      { anchor }
    );
    if (choice === "new_folder") create_folder(handler, window);
    else if (choice === "upload") upload(handler);
    else if (choice === "reload") handler.reload();
  }
</script>

<!-- Right-click on empty space (or the list's padding) is the folder's own menu. -->
<div
  role="presentation"
  class="min-h-0 min-w-0 flex-1 overflow-y-auto"
  oncontextmenu={(event) => {
    if ((event.target as Element).closest("[role=row]")) return;
    event.preventDefault();
    background_menu({ x: event.clientX, y: event.clientY });
  }}
>
  {#if handler.loading && handler.items.length === 0}
    <div class="flex flex-col gap-1 p-2">
      {#each { length: 6 }, idx (idx)}
        <div class="h-8 animate-pulse rounded-md bg-foreground/5" style:opacity={1 - idx * 0.14}></div>
      {/each}
    </div>
  {:else if handler.items.length === 0}
    <EmptyState icon={FolderOpenIcon} title="This folder is empty" description="Upload files or create a folder, from the toolbar or a right-click." />
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
        <button
          role="row"
          class="col-span-4 grid h-8 grid-cols-subgrid items-center rounded-md px-2 text-left transition-colors duration-100 hover:bg-foreground/6 focus:bg-primary/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset"
          ondblclick={(event) => open(item, { x: event.clientX, y: event.clientY })}
          oncontextmenu={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            item_menu(item, { x: event.clientX, y: event.clientY });
          }}
          onkeydown={(event) => {
            if (event.key === "Enter" && event.altKey) show_properties(handler, window, item);
            else if (event.key === "Enter") open(item, row_anchor(event.currentTarget));
            else if (event.key === "F2") rename_item(handler, window, item);
            else if (is_delete_key(event)) delete_item(handler, window, item);
            else if (is_menu_key(event)) item_menu(item, row_anchor(event.currentTarget));
            else return;
            event.preventDefault();
          }}
        >
          {#if item.kind === "file"}
            <FileRow {item} />
          {:else}
            <DirectoryRow handle={item.handle} system={SYSTEM_DIRECTORIES.includes(join_path(handler.segments, item.name))} />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
