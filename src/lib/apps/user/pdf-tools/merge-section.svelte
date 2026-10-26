<script lang="ts">
  import kernel, { type AppsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, format_bytes, error_message } from "$lib/core/utils";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowUp as ArrowUpIcon,
    DotsSixVertical as DotsSixVerticalIcon,
    FilePdf as FilePdfIcon,
    FilePlus as FilePlusIcon,
    Stack as StackIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import DropZone from "./drop-zone.svelte";
  import { run_job } from "./job";
  import { merged_name } from "./naming";
  import { PdfWriter, page_count } from "./pdf";
  import { PDF_ACCEPT, is_pdf, read_bytes, source_at, write_at, type SourceFile } from "./pdf-files";
  import { ReorderHandler } from "./reorder.handler.svelte";
  import { parent_path } from "$lib/core/api/services/files/path";

  const { picker, initial_paths, active }: { picker: Snippet; initial_paths: string[]; active: boolean } = $props();
  const { app_id, window: win } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));

  interface MergeItem {
    id: string;
    source: SourceFile;
    pages: number | null;
    error: string | null;
  }

  let items = $state<MergeItem[]>([]);
  let busy = $state(false);

  const ready = $derived(items.filter((item) => item.pages !== null));
  const total_pages = $derived(ready.reduce((sum, item) => sum + (item.pages ?? 0), 0));
  const start_path = $derived(items.find((item) => item.source.path)?.source.path);

  const reorder = new ReorderHandler("y", (from, slot) => move_to(from, slot > from ? slot - 1 : slot));

  function move_to(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    items = next;
  }

  function add(sources: SourceFile[]) {
    for (const source of sources) {
      if (!is_pdf(source)) continue;
      const item: MergeItem = { id: crypto.randomUUID(), source, pages: null, error: null };
      items.push(item);
      void read_bytes(source)
        .then((bytes) => page_count(bytes, source.name))
        .then((count) => set(item.id, { pages: count }))
        .catch((error) => set(item.id, { error: error_message(error) }));
    }
  }

  function set(id: string, patch: Partial<MergeItem>) {
    const item = items.find((entry) => entry.id === id);
    if (item) Object.assign(item, patch);
  }

  async function add_paths(paths: string[]) {
    const sources = await Promise.all(paths.map((path) => source_at(path).catch(() => null)));
    add(sources.filter((source) => source !== null));
  }

  const initial = untrack(() => initial_paths);
  if (initial.length) void add_paths(initial);

  async function pick() {
    const paths = await win.pick_file({
      accept: PDF_ACCEPT,
      title: "Add PDFs to merge",
      start_path: start_path ? parent_path(start_path) : undefined,
      multiple: true,
    });
    if (paths.length) await add_paths(paths);
  }

  async function merge() {
    if (ready.length < 2 || busy) return;
    const path = await win.pick_save({
      name: merged_name(ready.map((item) => item.source.name)),
      accept: PDF_ACCEPT,
      start_path: start_path ? parent_path(start_path) : "/home",
      title: "Save merged PDF as",
    });
    if (!path) return;
    const list = ready.map((item) => item.source);
    busy = true;
    await run_job(
      app_id,
      `Merging ${list.length} PDFs`,
      () => {
        const writer = new PdfWriter();
        return [
          ...list.map((source) => ({
            name: source.name,
            async run() {
              const pages = await writer.append(await read_bytes(source), source.name);
              return `Added ${pages} ${pages === 1 ? "page" : "pages"}`;
            },
          })),
          { name: "Write PDF", run: async () => write_at(path, await writer.finish()) },
        ];
      },
      () => ({ title: "PDFs merged", message: `${path} · ${total_pages} pages`, actions: [{ label: "Open", on_click: () => apps.open(path) }] })
    );
    busy = false;
  }

  function on_key(event: KeyboardEvent, index: number) {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const to = index + (event.key === "ArrowUp" ? -1 : 1);
    move_to(index, to);
    queueMicrotask(() => document.querySelector<HTMLElement>(`[data-merge-id="${items[to]?.id}"]`)?.focus());
  }
</script>

<DropZone label="Drop PDFs to add them" accept={PDF_ACCEPT} multiple {active} class="grid h-full grid-rows-[auto_1fr_auto]" ondrop={add}>
  <Toolbar>
    {@render picker()}
    <IconButton label="Add PDFs…" size="sm" onclick={pick} disabled={busy}><FilePlusIcon weight="bold" /></IconButton>
    <span class="flex-1"></span>
    {#if items.length}
      <IconButton label="Remove all" size="sm" onclick={() => (items = [])} disabled={busy}><TrashIcon weight="bold" /></IconButton>
    {/if}
    <Button variant="primary" size="sm" onclick={merge} disabled={ready.length < 2 || busy}><StackIcon weight="bold" /> Merge…</Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !items.length}
      <EmptyState icon={StackIcon} title="Nothing to merge yet" description="Add two or more PDFs, put them in order, then merge them into one file.">
        {#snippet actions()}
          <Button variant="primary" onclick={pick}><FilePlusIcon weight="bold" /> Add PDFs…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <ol {@attach reorder.attachment()} role="listbox" class="flex flex-col gap-0.5 p-2" aria-label="PDFs in merge order. Alt+Up and Alt+Down move the focused file.">
        {#each items as item, index (item.id)}
          <li
            data-merge-id={item.id}
            role="option"
            aria-selected="false"
            data-reorder-index={index}
            tabindex="0"
            onkeydown={(event) => on_key(event, index)}
            class={cn(
              "relative flex h-10 cursor-grab items-center gap-2 rounded-md pl-1 outline-none select-none hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset pointer-coarse:h-12",
              reorder.from === index && "opacity-40"
            )}
          >
            {#if reorder.from !== null && (reorder.slot === index || (reorder.slot === items.length && index === items.length - 1))}
              <span class={cn("absolute inset-x-2 h-0.5 rounded-full bg-primary", reorder.slot === index ? "-top-px" : "-bottom-px")}></span>
            {/if}
            <span data-reorder-grip class="grid size-7 shrink-0 touch-none place-items-center text-foreground/45 pointer-coarse:size-9" aria-hidden="true">
              <DotsSixVerticalIcon weight="bold" class="size-4" />
            </span>
            <span class="w-5 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
            {#if item.error}
              <WarningIcon weight="fill" class="size-4 shrink-0 text-error" />
            {:else}
              <FilePdfIcon weight="duotone" class="size-4 shrink-0 text-foreground/70" />
            {/if}
            <span class="min-w-0 flex-1 truncate text-ui" title={item.error ?? item.source.path ?? item.source.name}>
              {item.source.name}
              {#if item.error}<span class="block truncate text-2xs text-error">{item.error}</span>{/if}
            </span>
            <span class="hidden w-16 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums @md:block">{format_bytes(item.source.file.size)}</span>
            <span class="w-16 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">
              {item.pages === null ? (item.error ? "" : "…") : `${item.pages} ${item.pages === 1 ? "page" : "pages"}`}
            </span>
            <span class="hidden shrink-0 @sm:flex">
              <IconButton label="Move up" size="sm" disabled={index === 0 || busy} onclick={() => move_to(index, index - 1)}><ArrowUpIcon weight="bold" /></IconButton>
              <IconButton label="Move down" size="sm" disabled={index === items.length - 1 || busy} onclick={() => move_to(index, index + 1)}><ArrowDownIcon weight="bold" /></IconButton>
            </span>
            <IconButton label="Remove {item.source.name}" size="sm" disabled={busy} onclick={() => (items = items.filter((entry) => entry.id !== item.id))}><XIcon weight="bold" /></IconButton>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  <StatusBar>
    <span>{items.length} {items.length === 1 ? "file" : "files"}</span>
    <span>{total_pages} {total_pages === 1 ? "page" : "pages"}</span>
    {#if items.length && items.length !== ready.length}<span>{items.length - ready.length} can't be merged</span>{/if}
  </StatusBar>
</DropZone>
