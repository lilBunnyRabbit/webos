<script lang="ts">
  import FileIconHandler from "./file-icon.svelte";

  interface Props {
    handle: FileSystemFileHandle;
  }

  let { handle: entry }: Props = $props();

  const file_promise = $derived(entry.getFile());

  function format_bytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
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
