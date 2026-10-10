<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { Warning as WarningIcon } from "phosphor-svelte";

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

{#snippet message(text: string, tone: "muted" | "error" = "muted")}
  <div class={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", tone === "error" ? "text-error" : "text-foreground/60")}>
    {#if tone === "error"}<WarningIcon class="size-12" />{/if}
    <p>{text}</p>
  </div>
{/snippet}

{#if !path}
  {@render message("Open a PDF from File Explorer to view it here.")}
{:else if error}
  {@render message(`Could not read the file: ${error}`, "error")}
{:else if file === null}
  {@render message(`File not found: ${path}`, "error")}
{:else if !file || !url}
  {@render message("Loading…")}
{:else}
  <iframe src={url} title={file.name} class="block size-full border-0"></iframe>
{/if}
