<script lang="ts">
  import type { FileSystemFileItem } from "$lib/core/api/services/files";
  import { format_bytes } from "$lib/core/utils";
  import { file_extension, parse_shortcut, SHORTCUT_EXTENSION } from "$lib/core/api";
  import FileIconHandler from "./file-icon.svelte";
  import ShortcutIcon from "./shortcut-icon.svelte";

  interface Props {
    item: FileSystemFileItem;
  }

  let { item }: Props = $props();

  const is_shortcut = $derived(file_extension(item.name) === SHORTCUT_EXTENSION);
  const shortcut = $derived(is_shortcut ? item.handle.getFile().then(async (file) => parse_shortcut(await file.text())) : null);
</script>

{#if shortcut}
  {#await shortcut}
    <ShortcutIcon app_id={null} class="size-4" />
  {:then target}
    <ShortcutIcon app_id={target?.app_id ?? null} class="size-4" />
  {:catch}
    <ShortcutIcon app_id={null} class="size-4" />
  {/await}
{:else}
  <FileIconHandler name={item.name} mime_type={item.type} kind="file" weight="bold" class="fill-primary" />
{/if}
<div class="text-left truncate">{item.name}</div>
<div class="font-mono text-sm">{item.size != null ? format_bytes(item.size) : "-"}</div>
<div class="font-mono text-sm">{item.last_modified ? new Date(item.last_modified).toLocaleDateString() : "-"}</div>
