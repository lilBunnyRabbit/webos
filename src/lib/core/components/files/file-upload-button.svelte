<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { UploadSimple as UploadSimpleIcon } from "phosphor-svelte";
  import { report_file_error } from "./file-explorer.errors";

  interface Props {
    handler: DirectoryHandler;
  }

  let { handler }: Props = $props();

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

<button
  class="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
  title="Upload files"
  disabled={uploading}
  onclick={handle_upload}
>
  <UploadSimpleIcon class="size-4" weight="bold" />
</button>
