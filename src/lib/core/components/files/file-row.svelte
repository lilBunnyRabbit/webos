<script lang="ts">
  import type { FileSystemFileItem } from "$lib/core/api/services/files";
  import { format_bytes } from "$lib/core/utils";
  import FileIconHandler from "./file-icon.svelte";

  interface Props {
    item: FileSystemFileItem;
  }

  let { item }: Props = $props();
</script>

<FileIconHandler name={item.name} mime_type={item.type} kind="file" weight="bold" className="fill-primary" />
<div class="text-left truncate">{item.name}</div>
<div class="font-mono text-sm">{item.size != null ? format_bytes(item.size) : "-"}</div>
<div class="font-mono text-sm">{item.last_modified ? new Date(item.last_modified).toLocaleDateString() : "-"}</div>
