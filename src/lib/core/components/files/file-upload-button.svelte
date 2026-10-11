<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { UploadSimple as UploadSimpleIcon } from "phosphor-svelte";
  import { IconButton } from "../ui";
  import { report_file_error } from "./file-explorer.errors";

  let { handler }: { handler: DirectoryHandler } = $props();

  let uploading = $state(false);

  async function handle_upload() {
    uploading = true;
    try {
      await handler.upload_files();
    } catch (error) {
      report_file_error("Upload failed", error);
    } finally {
      uploading = false;
    }
  }
</script>

<IconButton label="Upload files" size="sm" disabled={uploading} onclick={handle_upload}>
  <UploadSimpleIcon weight="bold" />
</IconButton>
