<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import FileExplorerNavigation from "./file-explorer-navigation.svelte";
  import FileList from "./file-list.svelte";
  import FileExplorerStatusBar from "./file-explorer-status-bar.svelte";

  const files = $derived(kernel.service<FilesService>("files"));

  let handler: DirectoryHandler | null = $state(null);
  let path_stack: DirectoryHandler[] = $state([]);
  let search = $state("");
  let initializing = $state(true);

  $effect(() => {
    files.get_root().then((root) => {
      handler = files.directory([], root);
      handler.reload();
      initializing = false;
    });
  });

  function navigate_to(dir_handler: DirectoryHandler) {
    if (handler) path_stack = [...path_stack, handler];
    handler = dir_handler;
    handler.reload();
  }

  function navigate_back() {
    if (path_stack.length === 0) return;
    handler = path_stack[path_stack.length - 1];
    path_stack = path_stack.slice(0, -1);
  }

  function navigate_to_index(i: number) {
    handler = path_stack[i];
    path_stack = path_stack.slice(0, i);
  }
</script>

{#if initializing || !handler}
  <div class="p-4 w-full h-full flex flex-col items-center justify-center opacity-0 animate-pulse">
    <div>Loading directory...</div>
  </div>
{:else}
  <div class="grid grid-cols-1 grid-rows-[auto_1fr_auto] h-full overflow-hidden">
    <FileExplorerNavigation
      {handler}
      {path_stack}
      bind:search
      on_navigate_back={navigate_back}
      on_navigate_to_index={navigate_to_index}
    />

    <FileList
      {handler}
      bind:search
      on_navigate={navigate_to}
    />

    <FileExplorerStatusBar {handler} {files} />
  </div>
{/if}
