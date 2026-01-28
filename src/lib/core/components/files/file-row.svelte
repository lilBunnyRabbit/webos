<script lang="ts">
  import { format_bytes } from "$lib/core/utils";
  import FileIconHandler from "./file-icon.svelte";

  interface Props {
    handle: FileSystemFileHandle;
  }

  let { handle: entry }: Props = $props();

  const file_promise = $derived(entry.getFile());
</script>

{#await file_promise}
  <FileIconHandler name={entry.name} kind="file" weight="bold" className="fill-primary" />
  <div class="text-left truncate">{entry.name}</div>
  <div class="font-mono text-foreground/50">-</div>
  <div class="font-mono text-foreground/50">-</div>
{:then file}
  <FileIconHandler name={entry.name} mime_type={file.type} kind="file" weight="bold" className="fill-primary" />
  <div class="text-left truncate">{entry.name}</div>
  <div class="font-mono text-sm">{format_bytes(file.size)}</div>
  <div class="font-mono text-sm">{file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}</div>
{/await}
