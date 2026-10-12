<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import FileIcon from "../files/file-icon.svelte";
  import ShortcutIcon from "../files/shortcut-icon.svelte";

  let { item }: { item: DesktopItem } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const missing_app = $derived(item.kind === "shortcut" && !apps.get(item.app_id));
  const label = $derived(item.kind === "shortcut" ? item.label : item.name);
</script>

<div
  class="grid size-11 shrink-0 place-items-center rounded-xl bg-background-light text-foreground shadow-raised ring-1 ring-foreground/10 transition-transform duration-150 group-hover:-translate-y-0.5"
>
  {#if item.kind === "shortcut"}
    <ShortcutIcon app_id={item.app_id} class="size-6" />
  {:else}
    <FileIcon name={item.name} kind={item.kind} mime_type={item.kind === "file" ? item.type : undefined} class="size-6" weight="duotone" />
  {/if}
</div>
<span class="line-clamp-2 max-w-full px-0.5 text-center text-2xs leading-tight font-medium break-words text-foreground/80" title={item.name}>
  {label}{#if missing_app}<span class="text-error"> · missing</span>{/if}
</span>
