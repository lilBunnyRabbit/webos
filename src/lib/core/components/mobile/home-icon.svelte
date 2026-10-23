<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import FileIcon from "../files/file-icon.svelte";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import AppBadge from "../apps/app-badge.svelte";

  let { item, label = true, class: class_name }: { item: DesktopItem; label?: boolean; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const missing_app = $derived((item.kind === "shortcut" || item.kind === "widget") && !apps.get(item.app_id));
  const text = $derived(item.kind === "shortcut" || item.kind === "widget" ? item.label : item.name);
</script>

<!-- Same rule as the desktop: apps on a tile, files and folders bare. -->
{#if item.kind === "shortcut" || item.kind === "widget"}
  <span
    class={cn(
      "relative grid size-14 shrink-0 place-items-center rounded-2xl bg-background-light text-foreground shadow-raised ring-1 ring-hairline transition-shadow duration-150 group-active/tile:shadow-pressed",
      class_name
    )}
  >
    <ShortcutIcon app_id={item.app_id} badge={false} class="size-7" />
    <AppBadge app_id={item.app_id} />
  </span>
{:else}
  <span class={cn("grid size-14 shrink-0 place-items-center", class_name)}>
    <FileIcon name={item.name} kind={item.kind} mime_type={item.kind === "file" ? item.type : undefined} class={cn("bare-glyph size-12", item.kind === "directory" ? "text-primary" : "text-foreground/85")} weight={item.kind === "directory" ? "fill" : "duotone"} />
  </span>
{/if}
{#if label}
  <span data-wallpaper-label class="line-clamp-2 max-w-full px-0.5 text-center text-xs leading-tight font-medium break-words">
    {text}{#if missing_app}<span class="text-error"> · missing</span>{/if}
  </span>
{:else}
  <span class="sr-only">{text}</span>
{/if}
