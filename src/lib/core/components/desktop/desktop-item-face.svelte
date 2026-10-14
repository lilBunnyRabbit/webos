<script lang="ts">
  import kernel, { type AppsService, type DesktopItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import FileIcon from "../files/file-icon.svelte";
  import ShortcutIcon from "../files/shortcut-icon.svelte";
  import AppBadge from "../apps/app-badge.svelte";

  let { item }: { item: DesktopItem } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const missing_app = $derived((item.kind === "shortcut" || item.kind === "widget") && !apps.get(item.app_id));
  const label = $derived(item.kind === "shortcut" || item.kind === "widget" ? item.label : item.name);
</script>

<!-- Apps sit on a raised tile, files and folders are bare glyphs, so a program never reads as a document. -->
{#if item.kind === "shortcut" || item.kind === "widget"}
  <div
    class="relative grid size-11 shrink-0 place-items-center rounded-xl bg-background-light text-foreground shadow-raised ring-1 ring-foreground/10 transition-transform duration-150 group-hover:-translate-y-0.5"
  >
    <ShortcutIcon app_id={item.app_id} badge={false} class="size-6" />
    <AppBadge app_id={item.app_id} />
  </div>
{:else}
  <div class="grid size-11 shrink-0 place-items-center transition-transform duration-150 group-hover:-translate-y-0.5">
    <FileIcon name={item.name} kind={item.kind} mime_type={item.kind === "file" ? item.type : undefined} class={cn("bare-glyph size-10", item.kind === "directory" ? "text-primary" : "text-foreground/85")} weight={item.kind === "directory" ? "fill" : "duotone"} />
  </div>
{/if}
<span data-wallpaper-label class="line-clamp-2 max-w-full px-0.5 text-center text-2xs leading-tight font-medium break-words text-foreground/80" title={item.name}>
  {label}{#if missing_app}<span class="text-error"> · missing</span>{/if}
</span>
