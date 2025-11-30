<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import FileExplorerNavigation from "./file-explorer-navigation.svelte";
  import FileList from "./file-list.svelte";

  const files = $derived(kernel.service<FilesService>("files"));

  let directory = $derived(files.get_directory(null));
  let search = $state("");
</script>

{#await directory}
  <div class="p-4 w-full h-full flex flex-col items-center justify-center opacity-0 animate-pulse">
    <div>Loading directory...</div>
  </div>
{:then handler}
  <div class="grid grid-cols-1 grid-rows-[auto_1fr] h-full overflow-hidden">
    <FileExplorerNavigation
      {handler}
      bind:search
      onnavigate={(handler) => {
        console.log("Navigating to", handler.name);
        directory = Promise.resolve(handler);
      }}
    />

    <FileList
      {handler}
      bind:search
      onnavigate={(handler) => {
        directory = handler;
      }}
    />
  </div>
{/await}
