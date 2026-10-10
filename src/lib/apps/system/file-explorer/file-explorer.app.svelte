<script lang="ts">
  import FileExplorer from "$lib/core/components/files/file-explorer.svelte";

  const { path }: { path?: string } = $props();
</script>

<FileExplorer {path} />
