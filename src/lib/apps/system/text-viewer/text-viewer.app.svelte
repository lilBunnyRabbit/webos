<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";

  const { path }: { path?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const content = $derived(path ? files.get_file(path).then((file) => file?.text() ?? null) : null);
</script>

<div class="grid grid-rows-[auto_1fr] h-full">
  <div class="px-4 py-2 border-b border-b-foreground/20 font-mono text-sm text-foreground/60 truncate">
    {path ?? "No file"}
  </div>

  <div class="overflow-auto">
    {#if !content}
      <p class="p-4 text-foreground/60">Open a text file from File Explorer to view it here.</p>
    {:else}
      {#await content}
        <p class="p-4 text-foreground/60">Loading…</p>
      {:then text}
        {#if text === null}
          <p class="p-4 text-error">File not found.</p>
        {:else}
          <pre class="p-4 font-mono text-sm whitespace-pre-wrap break-words">{text}</pre>
        {/if}
      {:catch error}
        <p class="p-4 text-error">Could not read the file: {error instanceof Error ? error.message : String(error)}</p>
      {/await}
    {/if}
  </div>
</div>
