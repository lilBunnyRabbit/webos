<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { EmptyState, Spinner } from "$lib/core/components/ui";
  import { FilePdf as FilePdfIcon, Warning as WarningIcon } from "phosphor-svelte";

  const { path }: { path?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  /** `undefined` while loading, `null` when the path points at nothing. */
  let file = $state<File | null | undefined>(undefined);
  let error = $state<string | null>(null);
  let url = $state<string | null>(null);

  $effect(() => {
    if (!path) return;
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
  <EmptyState icon={FilePdfIcon} title="No PDF open" description="Open a PDF from File Explorer to read it here." />
{:else if error}
  <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the file" description={error} />
{:else if file === null}
  <EmptyState icon={WarningIcon} tone="error" title="File not found" description={path} />
{:else if !file || !url}
  <div class="grid h-full place-items-center"><Spinner label="Loading PDF" /></div>
{:else}
  <iframe src={url} title={file.name} class="block size-full border-0 bg-background-darker"></iframe>
{/if}
