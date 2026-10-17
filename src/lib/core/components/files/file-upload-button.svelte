<script lang="ts">
  import kernel, { type DialogsService, type FilesService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { split_path } from "$lib/core/api/services/files/path";
  import { FilePlus as FilePlusIcon, FolderPlus as FolderPlusIcon, HardDrives as HardDrivesIcon, UploadSimple as UploadSimpleIcon } from "phosphor-svelte";
  import { IconButton } from "../ui";
  import { mount_folder, upload, upload_folder_into } from "./file-actions";

  let { handler, disabled = false, onnavigatepath }: { handler: DirectoryHandler; disabled?: boolean; onnavigatepath: (segments: string[]) => void } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const files = $derived(kernel.service<FilesService>("files"));

  async function open_menu(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const choice = await dialogs.menu(
      [
        { id: "files", label: "Upload files…", icon: FilePlusIcon, disabled },
        { id: "folder", label: "Upload a folder…", icon: FolderPlusIcon, disabled },
        ...(files.can_mount ? [{ separator: true } as const, { id: "mount", label: "Mount a folder (no copy)…", icon: HardDrivesIcon }] : []),
      ],
      { anchor: { x: box.left, y: box.bottom + 4 } }
    );
    if (choice === "files") await upload(handler);
    else if (choice === "folder") await upload_folder_into(handler);
    else if (choice === "mount") {
      const path = await mount_folder();
      if (path) onnavigatepath(split_path(path));
    }
  }
</script>

<IconButton label="Upload" size="sm" onclick={open_menu}>
  <UploadSimpleIcon weight="bold" />
</IconButton>
