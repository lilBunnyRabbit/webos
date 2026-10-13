<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import FileIcon from "../files/file-icon.svelte";
  import ShortcutIcon from "../files/shortcut-icon.svelte";

  let { item, label = true, class: class_name }: { item: DesktopItem; label?: boolean; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const missing_app = $derived(item.kind === "shortcut" && !apps.get(item.app_id));
  const text = $derived(item.kind === "shortcut" ? item.label : item.name);
</script>

<span
  class={cn(
    "grid size-14 shrink-0 place-items-center rounded-2xl bg-background-light text-foreground shadow-raised ring-1 ring-foreground/10",
    class_name
  )}
>
  {#if item.kind === "shortcut"}
    <ShortcutIcon app_id={item.app_id} class="size-7" />
  {:else}
    <FileIcon name={item.name} kind={item.kind} mime_type={item.kind === "file" ? item.type : undefined} class="size-7" weight="duotone" />
  {/if}
</span>
{#if label}
  <span data-wallpaper-label class="line-clamp-2 max-w-full px-0.5 text-center text-xs leading-tight font-medium break-words">
    {text}{#if missing_app}<span class="text-error"> · missing</span>{/if}
  </span>
{:else}
  <span class="sr-only">{text}</span>
{/if}
