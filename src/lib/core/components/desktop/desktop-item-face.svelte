<script lang="ts">
  import kernel, { type AppsService, type DesktopGridItem } from "$lib/core/api";
  import FileIcon from "../files/file-icon.svelte";
  import ShortcutIcon from "../files/shortcut-icon.svelte";

  let { item }: { item: DesktopGridItem } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const manifest = $derived(item.kind === "shortcut" ? apps.get(item.app_id) : undefined);
  const label = $derived(item.kind === "shortcut" ? item.label : item.name);
</script>

<div class="h-8 w-8 shrink-0 overflow-hidden">
  {#if item.kind === "shortcut"}
    <ShortcutIcon app_id={item.app_id} class="size-full" />
  {:else}
    <FileIcon name={item.name} kind={item.kind} mime_type={item.kind === "file" ? item.type : undefined} class="h-full w-auto" />
  {/if}
</div>
<span class="line-clamp-1 max-w-full px-1 text-xs text-foreground/70" title={item.name}>
  {label}{#if item.kind === "shortcut" && !manifest}<span class="text-error"> (missing app)</span>{/if}
</span>
