<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { Button, EmptyState, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import {
    FilePdf as FilePdfIcon,
    FolderOpen as FolderOpenIcon,
    PencilSimple as PencilSimpleIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import { untrack } from "svelte";
  import manifest from "./index";
  import { error_message } from "$lib/core/utils";

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let source = $state.raw<string | File | undefined>(untrack(() => initial_path));
  const path = $derived(typeof source === "string" ? source : undefined);
  const { window: win } = get_app_context();

  async function pick() {
    const chosen = await win.pick_file({ accept: manifest.associations, title: "Open in PDF Viewer" });
    if (chosen) source = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  void kernel.service<AppsService>("apps").catalogue();
  const PDF_TOOLS = "pdf-tools";

  /** `undefined` while loading, `null` when the path points at nothing. */
  let file = $state<File | null | undefined>(undefined);
  let error = $state<string | null>(null);
  let url = $state<string | null>(null);

  $effect(() => {
    if (!source) return;
    error = null;
    if (source instanceof File) {
      file = source;
      return;
    }
    file = undefined;
    let cancelled = false;
    files
      .get_file(source)
      .then((result) => {
        if (!cancelled) file = result;
      })
      .catch((reason) => {
        if (!cancelled) error = error_message(reason);
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

<div class="contents" {@attach paste_files({ win, accept: manifest.associations, onfiles: ([file]) => (source = file) })}>
  {#if !source}
    <EmptyState icon={FilePdfIcon} title="No PDF open" description="Pick or paste a PDF, or open one from File Explorer.">
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
        {#if path && apps.get(PDF_TOOLS)}
          <IconButton label="Edit in PDF Tools" size="sm" onclick={() => apps.launch(PDF_TOOLS, { path })}><PencilSimpleIcon weight="bold" /></IconButton>
        {/if}
      </Toolbar>
      <iframe src={url} title={file.name} class="block size-full border-0 bg-background-darker"></iframe>
    </div>
  {/if}
</div>
