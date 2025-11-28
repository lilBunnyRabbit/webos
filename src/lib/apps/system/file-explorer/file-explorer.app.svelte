<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  const files = $derived(kernel.service<FilesService>("files"));
  let directory = $derived(files.get_directory(null));
</script>

{#await directory}
  <div class="p-4">
    <h1>File Explorer</h1>
    <p>Loading...</p>
  </div>
{:then handler}
  <button
    onclick={() =>
      handler
        .create_file(new File([], `${Date.now()}.txt`))
        .then(() => {
          console.log("File uploaded2");
          // directory = files.get_directory(null);
        })
        .catch((error) => {
          console.error(error);
        })}>Upload File</button
  >

  <div class="p-4 flex flex-col gap-2">
    {#await handler.values()}
      <div class="p-4">
        <h1>File Explorer</h1>
        <p>Loading...</p>
      </div>
    {:then values}
      {#each values as entry}
        <button
          class="flex items-center gap-2 hover:bg-foreground/10 p-2 rounded-md"
          onclick={() => {
            if (entry.kind === "file") {
              handler.remove_file(entry as FileSystemFileHandle);
            } else if (entry.kind === "directory") {
              directory = files.get_directory(entry as FileSystemDirectoryHandle);
            }
          }}
        >
          {#if entry.kind === "file"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="lucide lucide-file w-5 h-5 inline mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              ><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline
                points="14 2 14 8 20 8"
              /></svg
            >
          {:else if entry.kind === "directory"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="lucide lucide-folder w-5 h-5 inline mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              ><path
                d="M3 7a2 2 0 0 1 2-2h3.17a2 2 0 0 1 1.41.59l2.83 2.82A2 2 0 0 0 14.83 9H19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
              /></svg
            >
          {/if}
          <p>{entry.name}</p>
        </button>
      {/each}
    {/await}
  </div>
{/await}
