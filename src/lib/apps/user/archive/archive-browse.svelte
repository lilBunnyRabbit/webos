<script lang="ts">
  import kernel, { type FilesService, type TaskJob } from "$lib/core/api";
  import { Button, Checkbox, EmptyState, IconButton, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message, format_bytes } from "$lib/core/utils";
  import {
    ArrowLineDown as ArrowLineDownIcon,
    CaretRight as CaretRightIcon,
    File as FileIcon,
    FileZip as FileZipIcon,
    Folder as FolderIcon,
    FolderOpen as FolderOpenIcon,
    Lock as LockIcon,
    Stop as StopIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import ArchivePreview from "./archive-preview.svelte";
  import { parent_path } from "$lib/core/utils/zip/create";
  import { extract_blob } from "$lib/core/utils/zip/operations";
  import { build_tree, entries_to_extract, folder_keys, format_ratio, is_covered, visible_rows, type TreeNode } from "./tree";
  import { read_zip, readable, type ZipArchive } from "$lib/core/utils/zip/read";

  interface Opened {
    blob: Blob;
    name: string;
    path: string | null;
    archive: ZipArchive;
    tree: TreeNode;
  }

  const AUTO_EXPAND_LIMIT = 200;

  const {
    tabs,
    initial_path,
    on_analyze,
  }: { tabs: Snippet; initial_path?: string; on_analyze: (text: string, name: string) => void } = $props();

  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let opened = $state.raw<Opened | null>(null);
  let loading = $state(false);
  let failure = $state<string | null>(null);
  let active = $state.raw<TreeNode | null>(null);
  let job = $state<TaskJob | null>(null);
  const expanded = new SvelteSet<string>();
  const checked = new SvelteSet<string>();

  const rows = $derived(opened ? visible_rows(opened.tree, expanded) : []);
  const folder_count = $derived(opened?.archive.entries.filter((entry) => entry.directory).length ?? 0);
  const selected = $derived(opened && checked.size ? entries_to_extract(opened.archive.entries, checked) : []);
  const selected_files = $derived(selected.filter((entry) => !entry.directory).length);

  $effect(() => win.set_title(opened?.name ?? null));

  async function open(load: () => Promise<{ blob: Blob; name: string; path: string | null } | null>) {
    loading = true;
    failure = null;
    try {
      const source = await load();
      if (!source) return;
      const archive = await read_zip(source.blob);
      const tree = build_tree(archive.entries);
      expanded.clear();
      checked.clear();
      active = null;
      if (archive.entries.length <= AUTO_EXPAND_LIMIT) for (const key of folder_keys(tree)) expanded.add(key);
      opened = { ...source, archive, tree };
    } catch (error) {
      opened = null;
      failure = error_message(error);
    } finally {
      loading = false;
    }
  }

  function open_path(path: string) {
    open(async () => {
      const file = await files.get_file(path);
      if (!file) throw new Error(`${path} no longer exists.`);
      return { blob: file, name: path.slice(path.lastIndexOf("/") + 1), path };
    });
  }

  const initial = untrack(() => initial_path);
  if (initial) open_path(initial);

  async function pick() {
    const chosen = await win.pick_file({ accept: [".zip"], start_path: opened?.path ? parent_path(opened.path) : undefined, title: "Open a zip" });
    if (chosen) open_path(chosen);
  }

  function toggle_folder(node: TreeNode) {
    if (expanded.has(node.key)) expanded.delete(node.key);
    else expanded.add(node.key);
  }

  function toggle_checked(node: TreeNode) {
    if (checked.has(node.key)) checked.delete(node.key);
    else checked.add(node.key);
  }

  async function extract() {
    if (!opened || job) return;
    const source = opened;
    const selection = checked.size ? new Set(checked) : undefined;
    const folder = await win.pick_directory({ title: "Extract to…", start_path: source.path ? parent_path(source.path) : "/home" });
    if (!folder) return;

    const entries = entries_to_extract(source.archive.entries, selection);
    await extract_blob(source.blob, source.name, entries, folder, { app_id, on_job: (next) => (job = next) });
  }
</script>

<div class="relative grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {@render tabs()}
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium" title={opened?.path ?? opened?.name}>{opened?.name ?? ""}</span>
    <IconButton label="Open a zip…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    {#if opened}
      <Separator vertical class="hidden @lg:block" />
      {#if job}
        <Button size="sm" onclick={() => job?.cancel()}><StopIcon weight="fill" /> Cancel</Button>
      {:else}
        <Button variant="primary" size="sm" onclick={extract} disabled={checked.size > 0 && !selected.length}>
          <ArrowLineDownIcon weight="bold" />
          {checked.size ? `Extract ${selected_files} ${selected_files === 1 ? "file" : "files"}…` : "Extract all…"}
        </Button>
      {/if}
    {/if}
  </Toolbar>

  <div class="relative min-h-0">
    {#if loading}
      <div class="grid h-full place-items-center"><Spinner label="Reading the archive" /></div>
    {:else if failure}
      <EmptyState icon={FileZipIcon} tone="error" title="Couldn't open the archive" description={failure}>
        {#snippet actions()}<Button onclick={pick}>Open another…</Button>{/snippet}
      </EmptyState>
    {:else if !opened}
      <EmptyState icon={FileZipIcon} title="No archive open" description="Open a zip to see what's inside, preview files and extract them. Or make a new one in Create.">
        {#snippet actions()}
          <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a zip…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="grid h-full grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="min-h-0 overflow-auto px-2 pb-2">
          <div class="sticky top-0 z-10 grid h-8 grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] items-center border-b border-hairline bg-background text-2xs font-medium tracking-wide text-foreground/65 uppercase @md:grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem]">
            <span></span>
            <span class="px-1">Name</span>
            <span class="text-right">Size</span>
            <span class="hidden text-right @md:block">Packed</span>
            <span class="hidden pr-2 text-right @md:block">Saved</span>
          </div>
          {#if !rows.length}
            <p class="p-6 text-center text-ui text-foreground/65">This archive is empty.</p>
          {/if}
          <ul aria-label="Archive contents">
          {#each rows as { node, depth } (node.key)}
            {@const covered = is_covered(node.key, checked)}
            {@const locked = node.entry !== null && !node.directory && !readable(node.entry)}
            <li
              class={cn(
                "grid h-8 grid-cols-[2.25rem_minmax(0,1fr)_4.5rem] items-center rounded-md pointer-coarse:h-10 @md:grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem]",
                covered && "bg-primary/14 hover:bg-primary/18",
                active?.key === node.key && "ring-1 ring-primary/60 ring-inset"
              )}
            >
              <label class="grid h-full cursor-pointer place-items-center" title={covered ? "Deselect" : "Select for extraction"}>
                <Checkbox checked={covered} disabled={covered && !checked.has(node.key)} onchange={() => toggle_checked(node)} aria-label="Select {node.name}" />
              </label>
              <button
                type="button"
                aria-expanded={node.directory ? expanded.has(node.key) : undefined}
                class="flex h-full min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-ui outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                style:padding-left="{depth * 1.125 + 0.25}rem"
                onclick={() => (node.directory ? toggle_folder(node) : (active = node))}
              >
                {#if node.directory}
                  <CaretRightIcon weight="bold" class={cn("size-3 shrink-0 text-foreground/65 transition-transform duration-150", expanded.has(node.key) && "rotate-90")} />
                  <FolderIcon weight="fill" class="size-4 shrink-0 text-primary" />
                {:else}
                  <span class="w-3 shrink-0"></span>
                  {#if locked}
                    <LockIcon weight="duotone" class="size-4 shrink-0 text-foreground/70" />
                  {:else}
                    <FileIcon weight="duotone" class="size-4 shrink-0 text-foreground/70" />
                  {/if}
                {/if}
                <span class="truncate">{node.name}</span>
                {#if node.directory}<span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{node.files}</span>{/if}
              </button>
              <span class="text-right font-mono text-2xs text-foreground/65 tabular-nums">{format_bytes(node.size)}</span>
              <span class="hidden text-right font-mono text-2xs text-foreground/65 tabular-nums @md:block">{format_bytes(node.compressed_size)}</span>
              <span class="hidden pr-2 text-right font-mono text-2xs text-foreground/65 tabular-nums @md:block">{format_ratio(node.size, node.compressed_size)}</span>
            </li>
          {/each}
          </ul>
        </div>

        {#if active?.entry}
          <aside class="absolute inset-0 z-20 bg-background @3xl:static @3xl:z-auto @3xl:border-l @3xl:border-hairline @3xl:bg-background-light">
            <ArchivePreview
              blob={opened.blob}
              entry={active.entry}
              on_close={() => (active = null)}
              on_analyze={(text) => active?.entry && on_analyze(text, active.name)}
            />
          </aside>
        {:else}
          <aside class="hidden flex-col items-center justify-center gap-2 border-l border-hairline bg-background-light p-6 text-center text-ui text-foreground/65 @3xl:flex">
            <FileIcon weight="duotone" class="size-6" />
            Select a file to preview it.
          </aside>
        {/if}
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if job}
      <span class="flex items-center gap-2">
        <span class="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-field shadow-track">
          <span class="block h-full rounded-full bg-primary transition-[width] duration-200" style:width="{job.progress * 100}%"></span>
        </span>
        Extracting · {job.message ?? ""}
      </span>
    {:else if opened}
      <span>{opened.tree.files} {opened.tree.files === 1 ? "file" : "files"}{folder_count ? ` · ${folder_count} folders` : ""}</span>
      <span class="hidden @sm:block">{format_bytes(opened.tree.size)} → {format_bytes(opened.blob.size)}</span>
      <span class="hidden @md:block">saved {format_ratio(opened.tree.size, opened.tree.compressed_size)}</span>
      {#if opened.archive.zip64}<span class="hidden @md:block">ZIP64</span>{/if}
      {#if opened.path}<span class="ml-auto hidden min-w-0 @lg:block" title={opened.path}>{opened.path}</span>{/if}
    {:else}
      <span>No archive</span>
    {/if}
  </StatusBar>
</div>
