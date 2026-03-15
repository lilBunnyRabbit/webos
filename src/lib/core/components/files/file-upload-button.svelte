<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { UploadSimple as UploadSimpleIcon } from "phosphor-svelte";

  interface Props {
    handler: DirectoryHandler;
  }

  let { handler }: Props = $props();

  let uploading = $state(false);

  async function handle_upload() {
    uploading = true;
    try {
      await handler.upload_files();
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
  <UploadSimpleIcon className="size-4" weight="bold" />
</button>
