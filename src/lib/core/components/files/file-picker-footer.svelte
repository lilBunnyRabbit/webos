<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { join_path, split_path } from "$lib/core/api/services/files/path";
  import { is_read_only_path, PATHS } from "$lib/core/api/services/files/hierarchy";
  import { Devices as DevicesIcon, HardDrives as HardDrivesIcon } from "phosphor-svelte";
  import { Button, Input } from "../ui";
  import { import_device_files, type PickerMode } from "./picker";
  import { mount_folder } from "./file-actions";
  import { report_file_error } from "./file-explorer.errors";

  interface Props {
    handler: DirectoryHandler;
    picker: PickerMode;
    selected: string | null;
    onnavigatepath: (segments: string[]) => void;
  }

  let { handler, picker, selected, onnavigatepath }: Props = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  // Places is hidden below 48rem, which the picker sheet always is, so the other two sources live here.
  async function from_device() {
    try {
      const [path] = await import_device_files(picker.accept);
      if (path) picker.onchoose(path);
    } catch (error) {
      report_file_error("Couldn't read the file", error);
    }
  }

  async function from_disk() {
    const path = await mount_folder();
    if (path) onnavigatepath(split_path(path));
  }

  // A directory picker can take the open folder itself when nothing inside it is selected.
  const choice = $derived(
    selected ? join_path(handler.segments, selected) : picker.kind === "directory" ? handler.path : null
  );

  // Clicking a file takes its name; typing overrides it until the next click.
  let name = $derived(selected ?? picker.name ?? "");
  const trimmed = $derived(name.trim());
  const existing = $derived(handler.items.find((item) => item.name === trimmed));
  const invalid = $derived(!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/"));
  // OS folders are read-only to apps: their files belong to the OS, which rewrites them on its own.
  const system = $derived(is_read_only_path(handler.path));
  const save_path = $derived(system || invalid || existing?.kind === "directory" ? null : join_path(handler.segments, trimmed));
</script>

{#snippet sources()}
  {#if picker.kind === "file"}
    <Button variant="quiet" size="sm" onclick={from_device}><DevicesIcon weight="bold" /> This device…</Button>
  {/if}
  {#if files.can_mount}
    <Button variant="quiet" size="sm" onclick={from_disk}><HardDrivesIcon weight="bold" /> Folder on disk…</Button>
  {/if}
{/snippet}

{#if picker.kind === "save"}
  <form
    class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-foreground/8 bg-background-light px-3 py-2.5"
    onsubmit={(event) => {
      event.preventDefault();
      if (save_path) picker.onchoose(save_path);
    }}
  >
    {#if files.can_mount}<div class="flex w-full items-center gap-1">{@render sources()}</div>{/if}
    <Input bind:value={name} aria-label="File name" placeholder="File name" class="min-w-48 flex-1" autofocus />
    {#if system}
      <span class="shrink-0 text-2xs text-error">{handler.path === PATHS.mnt ? "Open a mounted folder first" : "System folders are read-only"}</span>
    {:else if existing?.kind === "directory"}
      <span class="shrink-0 text-2xs text-error">A folder has this name</span>
    {:else if existing}
      <span class="shrink-0 text-2xs text-foreground/80">Replaces the existing file</span>
    {/if}
    <Button type="button" variant="quiet" onclick={picker.oncancel}>Cancel</Button>
    <Button type="submit" variant={existing && !system ? "danger" : "primary"} disabled={!save_path}>{existing && !system ? "Replace" : "Save"}</Button>
  </form>
{:else}
  <div class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-foreground/8 bg-background-light px-3 py-2.5">
    {#if picker.kind === "file" || files.can_mount}<div class="flex w-full items-center gap-1">{@render sources()}</div>{/if}
    <span class="min-w-0 flex-1 truncate font-mono text-2xs text-foreground/80" title={choice ?? undefined}>
      {choice ?? (picker.kind === "file" ? "Choose a file" : "Choose a folder")}
    </span>
    <Button variant="quiet" onclick={picker.oncancel}>Cancel</Button>
    <Button variant="primary" disabled={!choice} onclick={() => choice && picker.onchoose(choice)}>
      {picker.kind === "file" ? "Open" : "Select folder"}
    </Button>
  </div>
{/if}
