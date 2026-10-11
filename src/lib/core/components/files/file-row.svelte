<script lang="ts">
  import type { FileSystemFileItem } from "$lib/core/api/services/files";
  import { file_extension, parse_shortcut, SHORTCUT_EXTENSION } from "$lib/core/api";
  import { format_bytes, format_date, format_datetime } from "$lib/core/utils";
  import FileIconHandler from "./file-icon.svelte";
  import ShortcutIcon from "./shortcut-icon.svelte";

  let { item }: { item: FileSystemFileItem } = $props();

  const is_shortcut = $derived(file_extension(item.name) === SHORTCUT_EXTENSION);
  const shortcut = $derived(is_shortcut ? item.handle.getFile().then(async (file) => parse_shortcut(await file.text())) : null);
  const modified = $derived(item.last_modified ? new Date(item.last_modified) : null);
</script>

<span class="grid place-items-center text-foreground/80">
  {#if shortcut}
    {#await shortcut}
      <ShortcutIcon app_id={null} class="size-4" />
    {:then target}
      <ShortcutIcon app_id={target?.app_id ?? null} class="size-4" />
    {:catch}
      <ShortcutIcon app_id={null} class="size-4" />
    {/await}
  {:else}
    <FileIconHandler name={item.name} mime_type={item.type} kind="file" weight="duotone" class="size-4" />
  {/if}
</span>
<span role="gridcell" class="truncate text-ui">{item.name}</span>
<span role="gridcell" class="w-16 text-right font-mono text-2xs text-foreground/80 tabular-nums">{item.size != null ? format_bytes(item.size) : "—"}</span>
<span role="gridcell" class="hidden w-24 font-mono text-2xs text-foreground/80 tabular-nums @md:block" title={modified ? format_datetime(modified) : undefined}>
  {modified ? format_date(modified) : "—"}
</span>
