<script lang="ts">
  import kernel, { NotificationType, ShortcutCategory, type NotificationsService, type ShortcutsService } from "$lib/core/api";
  import { Button, IconButton, Separator, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Devices as DevicesIcon,
    DotsSixVertical as DotsSixVerticalIcon,
    FilePlus as FilePlusIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { base_name, parent_path } from "./naming";
  import { initial_pages, insert_blank, is_unchanged, move_page, move_to_slot, remove_page, rotate_page, type PageItem } from "./pages";
  import { organize_pdf } from "./pdf";
  import { PDF_ACCEPT, device_source, error_message, write_at, type SourceFile } from "./pdf-files";
  import PdfPlaceholder from "./pdf-placeholder.svelte";
  import { PdfSlot } from "./pdf-slot.svelte";
  import PdfThumb from "./pdf-thumb.svelte";
  import DropZone from "./drop-zone.svelte";
  import { ReorderHandler } from "./reorder.handler.svelte";
  import { ThumbCache } from "./thumbs.svelte";

  const { picker, initial_paths, active }: { picker: Snippet; initial_paths: string[]; active: boolean } = $props();

  const { app_id, window_id, window: win } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));

  const THUMB_WIDTH = 220;
  const slot = new PdfSlot();
  let pages = $state.raw<PageItem[]>([]);
  let selected = $state<string | null>(null);
  let saving = $state(false);
  let cache = $state.raw<ThumbCache | null>(null);
  let grid = $state<HTMLElement | null>(null);

  const loaded = $derived(slot.loaded);
  const dirty = $derived(!!loaded && !is_unchanged(pages, loaded.count));
  const selected_index = $derived(pages.findIndex((page) => page.id === selected));
  const can_save_in_place = $derived(!!loaded?.source.path);

  const reorder = new ReorderHandler("x", (from, slot_index) => {
    pages = move_to_slot(pages, from, slot_index);
  });

  $effect(() => {
    const current = loaded;
    if (!current) return;
    const next = new ThumbCache(current.document, THUMB_WIDTH, () => !win.is_visible);
    untrack(() => {
      cache = next;
      pages = initial_pages(current.count);
      selected = null;
    });
    return () => next.destroy();
  });

  $effect(() => {
    if (win.is_visible) void cache?.pump();
  });

  $effect(() => () => slot.close());

  const first = untrack(() => initial_paths[0]);
  if (first) void slot.open(first);

  async function discard_ok(): Promise<boolean> {
    if (!dirty) return true;
    return win.confirm(`Discard changes to “${loaded?.source.name}”?`, { detail: "The page changes you made haven't been saved.", confirm_label: "Discard", danger: true });
  }

  async function open(source: SourceFile | string) {
    if (!(await discard_ok())) return;
    await slot.open(source);
  }

  async function pick() {
    const path = await win.pick_file({ accept: PDF_ACCEPT, title: "Organize a PDF", start_path: loaded?.source.path ? parent_path(loaded.source.path) : undefined });
    if (path) await open(path);
  }

  async function pick_device() {
    const [file] = await pick_device_files({ accept: PDF_ACCEPT });
    if (file) await open(device_source(file));
  }

  async function write(path: string): Promise<boolean> {
    if (!loaded || saving) return false;
    saving = true;
    try {
      const bytes = await organize_pdf(loaded.bytes, pages, loaded.source.name);
      await write_at(path, bytes);
      const file = new File([bytes as BlobPart], base_name(path), { type: "application/pdf" });
      await slot.open({ name: base_name(path), path, file });
      return true;
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the PDF", message: error_message(error) });
      return false;
    } finally {
      saving = false;
    }
  }

  async function save_as(): Promise<boolean> {
    if (!loaded) return false;
    const path = await win.pick_save({
      name: loaded.source.name,
      accept: PDF_ACCEPT,
      start_path: loaded.source.path ? parent_path(loaded.source.path) : "/home",
    });
    return path ? write(path) : false;
  }

  function save(): Promise<boolean> {
    return loaded?.source.path ? write(loaded.source.path) : save_as();
  }

  $effect(() => win.set_dirty(dirty, { save }));
  $effect(() => win.set_title(active && loaded ? loaded.source.name : null));

  $effect(() => {
    if (!active) return;
    const scoped = (id: string, keys: string, label: string, run: () => void) =>
      shortcuts.register({ id: `pdf-tools.organize.${id}`, keys, label, category: ShortcutCategory.APP, window: window_id, run });
    const disposers = [scoped("save", "mod+s", "Save", () => void save()), scoped("save-as", "mod+shift+s", "Save as…", () => void save_as())];
    return () => disposers.forEach((dispose) => dispose());
  });

  function focus_page(index: number) {
    const page = pages[Math.max(0, Math.min(index, pages.length - 1))];
    if (!page) return;
    selected = page.id;
    queueMicrotask(() => grid?.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)?.focus());
  }

  function rotate(delta: number) {
    if (selected) pages = rotate_page(pages, selected, delta);
  }

  function remove() {
    if (!selected) return;
    const index = selected_index;
    pages = remove_page(pages, selected);
    selected = null;
    if (pages.length) focus_page(Math.min(index, pages.length - 1));
  }

  function add_blank() {
    const index = selected_index === -1 ? pages.length : selected_index + 1;
    pages = insert_blank(pages, index);
    focus_page(index);
  }

  function move(delta: number) {
    if (selected_index === -1) return;
    const to = Math.max(0, Math.min(pages.length - 1, selected_index + delta));
    pages = move_page(pages, selected_index, to);
    focus_page(to);
  }

  function columns(): number {
    const cards = grid?.querySelectorAll<HTMLElement>("[data-page-id]");
    if (!cards || cards.length < 2) return 1;
    const top = cards[0].offsetTop;
    let count = 0;
    for (const card of cards) {
      if (card.offsetTop !== top) break;
      count++;
    }
    return count;
  }

  function on_key(event: KeyboardEvent, index: number) {
    const mod = event.altKey || event.ctrlKey || event.metaKey;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns(), ArrowDown: columns() }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      if (mod) move(step);
      else focus_page(index + step);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focus_page(event.key === "Home" ? 0 : pages.length - 1);
    } else if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      rotate(event.shiftKey ? -90 : 90);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      remove();
    } else if (event.key === "b" || event.key === "B") {
      event.preventDefault();
      add_blank();
    }
  }

  const changes = $derived.by(() => {
    if (!loaded) return "";
    const removed = loaded.count - pages.filter((page) => page.source !== null).length;
    const blank = pages.filter((page) => page.source === null).length;
    const rotated = pages.filter((page) => page.rotation).length;
    return [removed && `${removed} removed`, blank && `${blank} blank`, rotated && `${rotated} rotated`].filter(Boolean).join(" · ");
  });
</script>

<DropZone label="Drop a PDF to organize it" class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={(sources) => void open(sources[0])}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
    {#if loaded}
      <span class="hidden min-w-0 flex-1 truncate px-1 text-ui font-medium @lg:block" title={loaded.source.path ?? loaded.source.name}>{loaded.source.name}</span>
      <span class="flex-1 @lg:hidden"></span>
      <IconButton label="Rotate left (Shift+R)" size="sm" disabled={!selected} onclick={() => rotate(-90)}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
      <IconButton label="Rotate right (R)" size="sm" disabled={!selected} onclick={() => rotate(90)}><ArrowClockwiseIcon weight="bold" /></IconButton>
      <IconButton label="Insert a blank page (B)" size="sm" onclick={add_blank}><FilePlusIcon weight="bold" /></IconButton>
      <IconButton label="Delete page (Delete)" size="sm" disabled={!selected} onclick={remove}><TrashIcon weight="bold" /></IconButton>
      <Separator vertical class="hidden @md:block" />
      {#if can_save_in_place}
        <Button size="sm" class="hidden @md:inline-flex" onclick={save_as} disabled={saving}>Save as…</Button>
      {/if}
      <Button variant="primary" size="sm" onclick={save} disabled={saving || (!dirty && can_save_in_place)}><FloppyDiskIcon weight="bold" /> {can_save_in_place ? "Save" : "Save as…"}</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto bg-background-darker">
    {#if !loaded}
      <PdfPlaceholder
        {slot}
        icon={SquaresFourIcon}
        title="No PDF open"
        description="Reorder, rotate and delete pages, or add blank ones. Drag pages to move them."
        onopen={pick}
        ondevice={pick_device}
      />
    {:else}
      <div
        bind:this={grid}
        {@attach reorder.attachment()}
        role="listbox"
        aria-label="Pages. Arrows move focus, Alt+arrows move the page, R rotates, Delete removes, B inserts a blank page."
        class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 p-3 @lg:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
      >
        {#each pages as page, index (page.id)}
          {@const is_selected = page.id === selected}
          <div
            data-page-id={page.id}
            data-reorder-index={index}
            role="option"
            aria-selected={is_selected}
            tabindex={is_selected || (!selected && index === 0) ? 0 : -1}
            class={cn(
              "group relative flex cursor-grab flex-col gap-1.5 rounded-lg p-2 outline-none select-none hover:bg-foreground/6 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
              is_selected && "bg-primary/14 hover:bg-primary/18",
              reorder.from === index && "opacity-40"
            )}
            onclick={() => (selected = page.id)}
            onfocus={() => (selected = page.id)}
            onkeydown={(event) => on_key(event, index)}
          >
            {#if reorder.from !== null && reorder.slot === index}
              <span class="absolute inset-y-2 -left-2 w-0.5 rounded-full bg-primary"></span>
            {/if}
            {#if reorder.from !== null && reorder.slot === pages.length && index === pages.length - 1}
              <span class="absolute inset-y-2 -right-2 w-0.5 rounded-full bg-primary"></span>
            {/if}
            <PdfThumb {cache} index={page.source} rotation={page.rotation} />
            <div class="flex items-center justify-between gap-1">
              <span class="font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
              <span class="truncate text-2xs text-foreground/65">{page.source === null ? "Blank" : page.source !== index ? `was ${page.source + 1}` : ""}</span>
              <span data-reorder-grip class="hidden size-9 shrink-0 touch-none place-items-center rounded-md text-foreground/65 pointer-coarse:grid" aria-hidden="true">
                <DotsSixVerticalIcon weight="bold" class="size-4" />
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if loaded}
      <span>{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
      {#if changes}<span>{changes}</span>{/if}
      {#if dirty}<span class="ml-auto hidden @md:block">unsaved</span>{/if}
    {:else}
      <span>No PDF</span>
    {/if}
  </StatusBar>
</DropZone>
