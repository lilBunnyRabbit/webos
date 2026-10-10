<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type FilesService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { split_path } from "$lib/core/api/services/files/path";
  import FileExplorerNavigation from "./file-explorer-navigation.svelte";
  import FileList from "./file-list.svelte";
  import FileExplorerStatusBar from "./file-explorer-status-bar.svelte";
  import { report_file_error } from "./file-explorer.errors";

  let { path = PATHS.home }: { path?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  let handler: DirectoryHandler | null = $state(null);
  let path_stack: DirectoryHandler[] = $state([]);
  let search = $state("");

  // Opens with / behind the start folder, so "back" and the breadcrumb reach the system folders.
  async function init(start: string) {
    const segments = split_path(start);
    if (segments.length > 0) path_stack = [await files.directory([])];
    handler = await files.directory(segments);
  }

  // The start folder is read once; navigating afterwards is the explorer's own state.
  const init_promise = init(untrack(() => path));

  function navigate_to(dir_handler: DirectoryHandler) {
    if (handler) path_stack = [...path_stack, handler];
    handler = dir_handler;
  }

  // Handlers on the stack aren't watched; their contents may have changed since we left them.
  function show(dir_handler: DirectoryHandler) {
    handler = dir_handler;
    dir_handler.reload().catch((error) => report_file_error(`Could not open ${dir_handler.path}`, error));
  }

  function navigate_back() {
    if (path_stack.length === 0) return;
    show(path_stack[path_stack.length - 1]);
    path_stack = path_stack.slice(0, -1);
  }

  function navigate_to_index(i: number) {
    show(path_stack[i]);
    path_stack = path_stack.slice(0, i);
  }
</script>

{#await init_promise}
  <div class="p-4 w-full h-full flex flex-col items-center justify-center opacity-0 animate-pulse">
    <div>Loading directory...</div>
  </div>
{:then}
  {#if handler}
    <div class="grid grid-cols-1 grid-rows-[auto_1fr_auto] h-full overflow-hidden">
      <FileExplorerNavigation
        {handler}
        {path_stack}
        bind:search
        onnavigateback={navigate_back}
        onnavigatetoindex={navigate_to_index}
      />

      <FileList
        {handler}
        bind:search
        onnavigate={navigate_to}
      />

      <FileExplorerStatusBar {handler} {files} />
    </div>
  {/if}
{:catch error}
  <div class="p-4 w-full h-full flex flex-col items-center justify-center text-error">
    <div>Failed to load filesystem</div>
    <div class="text-xs mt-1 text-foreground/50">{error?.message ?? "Unknown error"}</div>
  </div>
{/await}
