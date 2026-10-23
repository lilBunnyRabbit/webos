<script lang="ts">
  import kernel, { MountState, type FilesService } from "$lib/core/api";
  import { reconnect } from "./file-actions";
  import { PATHS, SYSTEM_DIRECTORIES } from "$lib/core/api/services/files/hierarchy";
  import { split_path } from "$lib/core/api/services/files/path";
  import { cn } from "$lib/core/utils";
  import type { IconComponent } from "../ui";
  import {
    Desktop as DesktopIcon,
    DownloadSimple as DownloadSimpleIcon,
    FileText as FileTextIcon,
    FolderSimple as FolderSimpleIcon,
    HardDrives as HardDrivesIcon,
    House as HouseIcon,
    LockSimple as LockSimpleIcon,
  } from "phosphor-svelte";

  let { current, onnavigatepath }: { current: string; onnavigatepath: (segments: string[]) => void } = $props();

  const PLACES: { path: string; label: string; icon: IconComponent }[] = [
    { path: PATHS.home, label: "Home", icon: HouseIcon },
    { path: PATHS.desktop, label: "Desktop", icon: DesktopIcon },
    { path: PATHS.documents, label: "Documents", icon: FileTextIcon },
    { path: PATHS.downloads, label: "Downloads", icon: DownloadSimpleIcon },
  ];

  const files = $derived(kernel.service<FilesService>("files"));

  // Reconnecting asks the browser, which needs this click; the folder opens once it's allowed.
  async function go(path: string, locked: boolean) {
    if (locked && !(await reconnect(path))) return;
    onnavigatepath(split_path(path));
  }
</script>

{#snippet place(path: string, label: string, Icon: IconComponent, locked = false)}
  {@const active = current === path}
  <button
    aria-current={active ? "page" : undefined}
    class={cn(
      "flex h-7 w-full items-center gap-2 rounded-md px-2 text-ui transition-colors duration-150",
      active ? "bg-foreground/10 font-medium text-foreground" : "text-foreground/80 hover:bg-foreground/6 hover:text-foreground"
    )}
    title={locked ? `${label} is locked: click to reconnect` : undefined}
    onclick={() => !active && go(path, locked)}
  >
    <Icon class={cn("size-4 shrink-0", active && "text-primary")} weight={active ? "fill" : "regular"} />
    <span class="truncate">{label}</span>
  </button>
{/snippet}

<!-- Only in roomy windows: the list matters more than shortcuts when space is tight. -->
<nav aria-label="Places" class="hidden w-44 shrink-0 flex-col gap-4 overflow-y-auto border-r border-hairline bg-background-light p-2 @3xl:flex">
  <div class="flex flex-col gap-0.5">
    <p class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase">Places</p>
    {#each PLACES as item (item.path)}
      {@render place(item.path, item.label, item.icon)}
    {/each}
  </div>
  <div class="flex flex-col gap-0.5">
    <p class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase">System</p>
    {#each SYSTEM_DIRECTORIES as path (path)}
      {@render place(path, path, FolderSimpleIcon)}
    {/each}
  </div>
  {#if files.mounts.length > 0}
    <div class="flex flex-col gap-0.5">
      <p class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase">On disk</p>
      {#each files.mounts as mount (mount.path)}
        {@const locked = mount.state === MountState.LOCKED}
        {@render place(mount.path, mount.name, locked ? LockSimpleIcon : HardDrivesIcon, locked)}
      {/each}
    </div>
  {/if}
</nav>
