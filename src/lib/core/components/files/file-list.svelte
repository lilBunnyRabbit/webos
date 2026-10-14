<script lang="ts">
  import kernel, { Platform, type AppsService, type ClipboardService, type DialogsService, type MenuItem } from "$lib/core/api";
  import { long_press } from "$lib/core/utils/long-press";
  import type { FileSystemItem } from "$lib/core/api/services/files";
  import { join_path } from "$lib/core/api/services/files/path";
  import { SYSTEM_DIRECTORIES, is_locked_path, is_system_path } from "$lib/core/api/services/files/hierarchy";
  import type { Position } from "$lib/core/utils/type";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileRow from "./file-row.svelte";
  import DirectoryRow from "./directory-row.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import { get_app_context } from "$lib/core/contexts/app";
  import { EmptyState } from "../ui";
  import { FileListHandler } from "./file-list.handler.svelte";
  import { untrack } from "svelte";
  import {
    copy_items,
    create_folder,
    cut_items,
    delete_items,
    open_with,
    open_with_items,
    paste,
    save_to_disk,
    set_wallpaper,
    is_image,
    rename_item,
    show_properties,
    upload,
    open_terminal,
    compress_items,
    extract_here,
    is_zip,
  } from "./file-actions";
  import { cn } from "$lib/core/utils";
  import { accepts, type PickerMode } from "./picker";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowSquareOut as ArrowSquareOutIcon,
    ClipboardText as ClipboardTextIcon,
    Copy as CopyIcon,
    FileZip as FileZipIcon,
    ArrowLineDown as ArrowLineDownIcon,
    Scissors as ScissorsIcon,
    AppWindow as AppWindowIcon,
    Info as InfoIcon,
    Image as ImageIcon,
    PencilSimple as PencilSimpleIcon,
    FolderOpen as FolderOpenIcon,
    HardDrives as HardDrivesIcon,
    FolderPlus as FolderPlusIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Trash as TrashIcon,
    TerminalWindow as TerminalWindowIcon,
    UploadSimple as UploadSimpleIcon,
  } from "phosphor-svelte";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: DirectoryHandler) => void;
    search: string;
    /**
     * Picker mode: clicks select, double-click or Enter chooses, no menus or edits (ADR-025). On mobile a tap on a folder
     * opens it and a tap on a file selects it.
     */
    picker?: PickerMode;
    selected?: string | null;
  }

  let { handler, search = $bindable(), selected = $bindable(null), picker, onnavigate }: Props = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));

  /** Touch has no double-click or right-click: a tap opens, a long press is the menu (ADR-016 apps pass). */
  const mobile = kernel.platform === Platform.MOBILE;

  // Cmd on macOS, Ctrl elsewhere: either counts.
  const mod = (event: KeyboardEvent | MouseEvent) => event.ctrlKey || event.metaKey;
  const { window } = get_app_context();

  const filtered_items = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return handler.items;
    return handler.items.filter((item) => item.name.toLowerCase().includes(query));
  });

  // System folders are read-only here as in every save dialog: the OS rewrites their files on its own.
  const read_only = $derived(is_system_path(handler.path));
  const locked = (entries: FileSystemItem[]) => entries.some((entry) => is_locked_path(join_path(handler.segments, entry.name)));

  // Multi-select (ADR-011 revision): this list's own UI state, desktop pointer only. The picker keeps its single
  // `selected`, and mobile keeps tap to open.
  const multi = $derived(!picker && !mobile);
  const list_handler = new FileListHandler({
    directory: () => handler,
    items: () => filtered_items,
    multi: () => multi,
    accepts_paths: () => multi,
    accepts_files: () => !picker,
  });
  const selection = $derived(list_handler.selection);
  const targets = (item: FileSystemItem) => list_handler.targets(item);

  // A new folder starts with nothing selected.
  $effect(() => {
    void handler.path;
    untrack(() => list_handler.clear());
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
    if (picker && item.kind === "file") {
      // Saving over a file goes through the footer, which asks before replacing.
      if (picker.kind === "save") selected = item.name;
      else if (accepts(picker, item)) picker.onchoose(join_path(handler.segments, item.name));
      return;
    }

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

  /** Menu for `entries` (the selection, or one row): Open with, Rename, Save to disk and Properties need exactly one. */
  async function item_menu(entries: FileSystemItem[], anchor: Position) {
    const [item] = entries;
    if (!item) return;
    const single = entries.length === 1;
    const fixed = locked(entries);
    const with_apps = single ? await open_with_items(item) : [];
    const items: MenuItem[] = [
      { id: "open", label: single ? "Open" : `Open ${entries.length} items`, icon: ArrowSquareOutIcon, shortcut: "↵" },
      ...(with_apps.length > 1 ? [{ label: "Open with", icon: AppWindowIcon, items: with_apps }] : []),
      { separator: true },
      { id: "cut", label: "Cut", icon: ScissorsIcon, shortcut: "Ctrl+X", disabled: fixed },
      { id: "copy", label: "Copy", icon: CopyIcon, shortcut: "Ctrl+C" },
      ...(single
        ? [
            { id: "rename", label: "Rename", icon: PencilSimpleIcon, shortcut: "F2", disabled: fixed },
            { id: "save_to_disk", label: "Save to disk…", icon: HardDrivesIcon },
          ]
        : []),
      ...(single && item.kind === "file" && is_image(item.type) ? [{ id: "wallpaper", label: "Set as wallpaper", icon: ImageIcon }] : []),
      { id: "compress", label: "Compress", icon: FileZipIcon, disabled: read_only },
      ...(single && is_zip(item) ? [{ id: "extract", label: "Extract here", icon: ArrowLineDownIcon, disabled: read_only }] : []),
      { separator: true },
      { id: "delete", label: single ? "Delete" : `Delete ${entries.length} items`, icon: TrashIcon, shortcut: "Del", danger: true, disabled: fixed },
      ...(single ? [{ separator: true } as const, { id: "properties", label: "Properties", icon: InfoIcon, shortcut: "Alt+↵" }] : []),
    ];

    const choice = await dialogs.menu(items, { anchor });
    if (choice === "open") open_all(entries, anchor);
    else if (choice === "rename") rename_item(handler, window, item);
    else if (choice === "copy") copy_items(handler, entries);
    else if (choice === "cut") cut_items(handler, entries);
    else if (choice === "delete") delete_items(handler, window, entries);
    else if (choice === "properties") show_properties(handler, window, item);
    else if (choice === "save_to_disk") save_to_disk(join_path(handler.segments, item.name));
    else if (choice === "wallpaper") set_wallpaper(join_path(handler.segments, item.name));
    else if (choice === "compress") compress_items(handler, entries);
    else if (choice === "extract") extract_here(handler, item);
    else if (choice?.startsWith("open_with:")) open_with(handler, item, choice.slice("open_with:".length));
  }

  /** Several entries: files open in their apps, the first folder is navigated to. */
  function open_all(entries: FileSystemItem[], anchor: Position) {
    if (entries.length === 1) return open(entries[0], anchor);
    for (const entry of entries.filter((entry) => entry.kind === "file")) open(entry, anchor);
    const folder = entries.find((entry) => entry.kind === "directory");
    if (folder) open(folder, anchor);
  }

  async function background_menu(anchor: Position) {
    const choice = await dialogs.menu(
      [
        { id: "new_folder", label: "New folder", icon: FolderPlusIcon, disabled: read_only },
        { id: "upload", label: "Upload files", icon: UploadSimpleIcon, disabled: read_only },
        { separator: true },
        { id: "paste", label: "Paste", icon: ClipboardTextIcon, shortcut: "Ctrl+V", disabled: read_only || !clipboard.content },
        { separator: true },
        { id: "reload", label: "Reload", icon: ArrowClockwiseIcon },
        ...(picker ? [] : [{ id: "terminal", label: "Open in Terminal", icon: TerminalWindowIcon }]),
      ],
      { anchor }
    );
    if (choice === "new_folder") create_folder(handler, window);
    else if (choice === "upload") upload(handler);
    else if (choice === "paste") paste(handler, window);
    else if (choice === "reload") handler.reload();
    else if (choice === "terminal") open_terminal(handler.path);
  }
</script>

<!-- Right-click (mobile: long press) on empty space, or the list's padding, is the folder's own menu. -->
<div
  role="presentation"
  {@attach mobile && !picker && long_press({ on_menu: background_menu, ignore: "[role=row]" })}
  class="relative min-h-0 min-w-0 flex-1 overflow-y-auto"
  onkeydown={(event) => {
    if (picker) return;
    if (mod(event) && event.key.toLowerCase() === "v" && clipboard.content && !read_only) {
      event.preventDefault();
      paste(handler, window);
    } else if (multi && mod(event) && event.key.toLowerCase() === "a" && !(event.target as Element).closest("input")) {
      event.preventDefault();
      list_handler.select_all();
    } else if (multi && event.key === "Escape" && selection.size > 0) {
      event.preventDefault();
      list_handler.clear();
    }
  }}
  {@attach list_handler.marquee_attachment()}
  {@attach list_handler.drop_attachment()}
  oncontextmenu={(event) => {
    if (picker || mobile) return event.preventDefault();
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
    <EmptyState
      icon={FolderOpenIcon}
      title="This folder is empty"
      description={read_only ? "System folders are read-only." : "Upload files or create a folder, from the toolbar or a right-click."}
    />
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
        {@const choosable = !picker || accepts(picker, item)}
        <!-- Own columns, not subgrid: content-visibility's layout containment turns subgrid off. The first track is the
             header's 1.25rem minus the row's padding, which a subgrid would have absorbed. -->
        <button
          data-entry-name={item.name}
          data-entry-kind={item.kind}
          draggable={multi && !locked([item])}
          aria-disabled={!choosable && item.kind === "file"}
          aria-selected={picker ? selected === item.name : multi ? selection.has(item.name) : undefined}
          onclick={(event) => {
            const anchor = { x: event.clientX, y: event.clientY };
            if (picker) {
              if (mobile && item.kind === "directory") open(item, anchor);
              else selected = choosable ? item.name : null;
            } else if (mobile) open(item, anchor);
            else list_handler.select(item.name, event);
          }}
          {@attach mobile && !picker && long_press({ on_menu: (point) => item_menu([item], point) })}
          role="row"
          class={cn(
            "col-span-4 grid h-8 pointer-coarse:h-11 grid-cols-[0.75rem_1fr_auto_auto] items-center gap-x-3 [contain-intrinsic-size:auto_2rem] [content-visibility:auto] pointer-coarse:[contain-intrinsic-size:auto_2.75rem] rounded-md px-2 text-left transition-[background-color,opacity] duration-100 hover:bg-foreground/6 focus:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
            !multi && "focus:bg-primary/12",
            clipboard.is_cut(join_path(handler.segments, item.name)) && "opacity-50",
            list_handler.dragging.has(item.name) && "opacity-40",
            !choosable && item.kind === "file" && "opacity-38",
            picker && selected === item.name && "bg-primary/15 hover:bg-primary/15",
            selection.has(item.name) && "bg-primary/14 hover:bg-primary/18",
            list_handler.drop_folder === item.name && "bg-primary/18 ring-2 ring-primary/70 ring-inset"
          )}
          ondblclick={(event) => open(item, { x: event.clientX, y: event.clientY })}
          oncontextmenu={(event) => {
            event.preventDefault();
            if (picker || mobile) return;
            event.currentTarget.focus();
            list_handler.ensure_selected(item);
            item_menu(targets(item), { x: event.clientX, y: event.clientY });
          }}
          ondragstart={(event) => list_handler.drag_start(event, item)}
          ondragend={() => list_handler.drag_end()}
          onkeydown={(event) => {
            if (picker) {
              if (event.key !== "Enter") return;
              event.preventDefault();
              return open(item, row_anchor(event.currentTarget));
            }
            const entries = targets(item);
            if (event.key === "Enter" && event.altKey) show_properties(handler, window, item);
            else if (event.key === "Enter") open_all(entries, row_anchor(event.currentTarget));
            else if (event.key === "F2") {
              if (!locked([item])) rename_item(handler, window, item);
            } else if (mod(event) && event.key.toLowerCase() === "c") copy_items(handler, entries);
            else if (mod(event) && event.key.toLowerCase() === "x") {
              if (!locked(entries)) cut_items(handler, entries);
            } else if (is_delete_key(event)) {
              if (!locked(entries)) delete_items(handler, window, entries);
            } else if (is_menu_key(event)) item_menu(entries, row_anchor(event.currentTarget));
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

  {#if list_handler.marquee_box}
    {@const box = list_handler.marquee_box}
    <div
      class="pointer-events-none absolute rounded-sm bg-primary/12 ring-1 ring-primary/60"
      style:left="{box.left}px"
      style:top="{box.top}px"
      style:width="{box.width}px"
      style:height="{box.height}px"
    ></div>
  {/if}
</div>
