<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { FilePdf as FilePdfIcon, FolderOpen as FolderOpenIcon, Warning as WarningIcon } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { untrack } from "svelte";
  import manifest from "./index";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let path = $state(untrack(() => initial_path));
  const { window } = get_app_context();

  async function pick() {
    const chosen = await window.pick_file({ accept: manifest.associations, title: "Open in PDF Viewer" });
    if (chosen) path = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));

  /** `undefined` while loading, `null` when the path points at nothing. */
  let file = $state<File | null | undefined>(undefined);
  let error = $state<string | null>(null);
  let url = $state<string | null>(null);

  $effect(() => {
    if (!path) return;
    file = undefined;
    error = null;
    let cancelled = false;
    files
      .get_file(path)
      .then((result) => {
        if (!cancelled) file = result;
      })
      .catch((reason) => {
        if (!cancelled) error = reason instanceof Error ? reason.message : String(reason);
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!file) return;
    // Chrome only hands a blob to its PDF viewer when the blob says application/pdf; a .pdf with an empty type would download instead.
    const object_url = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
    url = object_url;
    return () => {
      URL.revokeObjectURL(object_url);
      url = null;
    };
  });
</script>

{#if !path}
  <EmptyState icon={FilePdfIcon} title="No PDF open" description="Pick a PDF, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a PDF…</Button>{/snippet}
  </EmptyState>
{:else if error}
  <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the file" description={error} />
{:else if file === null}
  <EmptyState icon={WarningIcon} tone="error" title="File not found" description={path} />
{:else if !file || !url}
  <div class="grid h-full place-items-center"><Spinner label="Loading PDF" /></div>
{:else}
  <div class="grid h-full grid-rows-[auto_1fr]">
    <Toolbar>
      <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
      <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{file.name}</span>
    </Toolbar>
    <iframe src={url} title={file.name} class="block size-full border-0 bg-background-darker"></iframe>
  </div>
{/if}
