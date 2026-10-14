<script lang="ts">
  import kernel, { NotificationType, type AppsService, type NotificationsService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Segmented, Separator, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_bytes } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import {
    Devices as DevicesIcon,
    File as FileIcon,
    FilePlus as FilePlusIcon,
    FileZip as FileZipIcon,
    Folder as FolderIcon,
    FolderPlus as FolderPlusIcon,
    Stop as StopIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack, type Snippet } from "svelte";
  import { z } from "zod";
  import { device_item, item_at, write_at } from "./archive-files";
  import { all_sources, archive_name, parent_path, rename_sources, unique_name, type CreateItem } from "./create";
  import { ArchiveJob, error_message } from "./job.svelte";
  import { Method } from "./zip-format";
  import { write_zip } from "./zip-write";

  const { tabs, initial_paths }: { tabs: Snippet; initial_paths: string[] } = $props();

  const { app_id, window: win, storage } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const METHODS = [
    { value: "deflate", label: "Deflate" },
    { value: "store", label: "Store" },
  ];
  const method = storage.persisted<"deflate" | "store">("method", "deflate", z.enum(["deflate", "store"]));

  let items = $state.raw<CreateItem[]>([]);
  let adding = $state(0);
  let job = $state<ArchiveJob | null>(null);

  const total = $derived(items.reduce((sum, item) => sum + item.size, 0));
  const file_count = $derived(items.reduce((sum, item) => sum + item.files, 0));
  const start_path = $derived(items.find((item) => item.path)?.path);

  function add(item: CreateItem) {
    const name = unique_name(item.name, new Set(items.map((existing) => existing.name)));
    items = [...items, name === item.name ? item : { ...item, name, sources: rename_sources(item.sources, item.name, name) }];
  }

  async function add_paths(paths: string[]) {
    adding++;
    try {
      for (const path of paths) {
        const item = await item_at(path);
        if (item) add(item);
        else notifications.notify(app_id, { type: NotificationType.WARNING, title: "Nothing to add", message: `${path} no longer exists.` });
      }
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't add that", message: error_message(error) });
    } finally {
      adding--;
    }
  }

  const initial = untrack(() => initial_paths);
  if (initial.length) add_paths(initial);

  async function pick_files() {
    const chosen = await win.pick_file({ title: "Add to the archive", start_path: start_path ? parent_path(start_path) : undefined });
    if (chosen) add_paths([chosen]);
  }

  async function pick_folder() {
    const chosen = await win.pick_directory({ title: "Add a folder to the archive", start_path: start_path ? parent_path(start_path) : undefined });
    if (chosen) add_paths([chosen]);
  }

  async function pick_device() {
    for (const file of await pick_device_files({ multiple: true })) add(device_item(file));
  }

  function remove(id: string) {
    items = items.filter((item) => item.id !== id);
  }

  async function save() {
    if (!items.length || job) return;
    const path = await win.pick_save({ name: archive_name(items), accept: [".zip"], start_path: start_path ? parent_path(start_path) : "/home", title: "Save archive as" });
    if (!path) return;

    const sources = all_sources(items);
    const zip_method = method.value === "store" ? Method.STORE : Method.DEFLATE;
    const name = path.slice(path.lastIndexOf("/") + 1);
    job = new ArchiveJob(app_id, { title: `Compressing ${name}`, cancelled: "Compression cancelled", failed: "Couldn't create the archive" }, total);
    await job.run(async (options) => {
      const zip = await write_zip(sources, { method: zip_method, ...options });
      await write_at(path, zip);
      return {
        title: "Archive saved",
        message: `${path} · ${format_bytes(zip.size)}`,
        actions: [{ label: "Open", on_click: () => apps.open(path) }],
      };
    });
    job = null;
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {@render tabs()}
    <span class="min-w-0 flex-1"></span>
    <IconButton label="Add a file…" size="sm" onclick={pick_files} disabled={!!job}><FilePlusIcon weight="bold" /></IconButton>
    <IconButton label="Add a folder…" size="sm" onclick={pick_folder} disabled={!!job}><FolderPlusIcon weight="bold" /></IconButton>
    <IconButton label="Add from device…" size="sm" onclick={pick_device} disabled={!!job}><DevicesIcon weight="bold" /></IconButton>
    <Separator vertical class="hidden @lg:block" />
    <Segmented size="sm" label="Compression" options={METHODS} bind:value={method.value} />
    {#if job}
      <Button size="sm" onclick={() => job?.cancel()}><StopIcon weight="fill" /> Cancel</Button>
    {:else}
      <Button variant="primary" size="sm" onclick={save} disabled={!items.length}><FileZipIcon weight="bold" /> Save…</Button>
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    {#if !items.length && !adding}
      <EmptyState icon={FileZipIcon} title="Nothing to compress yet" description="Add files and folders, then save them as one zip. Deflate makes it smaller; Store only bundles.">
        {#snippet actions()}
          <Button variant="primary" onclick={pick_files}><FilePlusIcon weight="bold" /> Add a file…</Button>
          <Button onclick={pick_folder}><FolderPlusIcon weight="bold" /> Add a folder…</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <div class="flex flex-col p-2">
        <div class="flex h-8 items-center justify-between border-b border-foreground/8 px-2">
          <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">In the archive</h3>
          <IconButton label="Remove all" size="sm" onclick={() => (items = [])} disabled={!!job}><TrashIcon weight="bold" /></IconButton>
        </div>
        <ul class="flex flex-col gap-0.5 pt-1">
          {#each items as item (item.id)}
            <li class="flex h-8 items-center gap-2 rounded-md pl-2 hover:bg-foreground/6 pointer-coarse:h-10">
              {#if item.directory}
                <FolderIcon weight="fill" class="size-4 shrink-0 text-primary" />
              {:else}
                <FileIcon weight="duotone" class="size-4 shrink-0 text-foreground/70" />
              {/if}
              <span class="min-w-0 flex-1 truncate text-ui" title={item.path ?? item.name}>{item.name}</span>
              <span class="mr-2 hidden max-w-48 shrink truncate font-mono text-2xs text-foreground/65 @lg:block">{item.path ? parent_path(item.path) : "from device"}</span>
              {#if item.directory}
                <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{item.files} {item.files === 1 ? "file" : "files"}</span>
              {/if}
              <span class="w-16 shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">{format_bytes(item.size)}</span>
              <IconButton label="Remove {item.name}" size="sm" onclick={() => remove(item.id)} disabled={!!job}><XIcon weight="bold" /></IconButton>
            </li>
          {/each}
          {#if adding}
            <li class="flex h-8 items-center gap-2 pl-2 text-ui text-foreground/65">
              <span class="size-4 animate-pulse rounded-sm bg-foreground/10"></span> Adding…
            </li>
          {/if}
        </ul>
      </div>
    {/if}
  </div>

  <StatusBar>
    {#if job}
      <span class="flex items-center gap-2">
        <span class="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-foreground/10">
          <span class="block h-full rounded-full bg-primary transition-[width] duration-200" style:width="{job.fraction * 100}%"></span>
        </span>
        Compressing · {job.message}
      </span>
    {:else}
      <span>{file_count} {file_count === 1 ? "file" : "files"} · {format_bytes(total)}</span>
      <span class="ml-auto">{method.value === "store" ? "store, no compression" : "deflate"}</span>
    {/if}
  </StatusBar>
</div>
