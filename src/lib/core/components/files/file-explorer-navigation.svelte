<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import {
    X as XIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowClockwise as ArrowClockwiseIcon,
  } from "phosphor-svelte";

  interface Props {
    handler: DirectoryHandler;
    onnavigate: (handler: DirectoryHandler) => void;
    search: string;
  }

  let { handler, onnavigate, search = $bindable() }: Props = $props();
</script>

<!-- TODO: upload files (drop) -->

<div
  class="grid grid-cols-[min-content_3fr_1fr_min-content] grid-rows-1 items-center bg-background-dark border-b border-b-foreground/20 py-2 gap-x-2 px-2"
>
  <div class="flex items-center gap-1">
    <button
      class="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
      title="Go back"
      disabled={!handler.path.length}
      onclick={() => onnavigate(handler.path[handler.path.length - 1])}
    >
      <ArrowLeftIcon className="size-4" weight="bold" />
    </button>

    <button
      class="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
      title="Reload"
      onclick={() => handler.reload()}
    >
      <ArrowClockwiseIcon className="size-4" weight="bold" />
    </button>
  </div>

  <nav class="flex items-center gap-1 px-2 text-sm bg-background h-6 rounded-sm">
    {#each handler.path as dir, idx (idx)}
      <button class="hover:underline hover:bg-foreground/10" onclick={() => onnavigate(dir)}>
        {dir.name}
      </button>
      <span class="mx-0.5 pointer-events-none">/</span>
    {/each}

    <button class="hover:underline text-accent-foreground cursor-default" disabled>
      {handler.name}
    </button>
    <span class="mx-0.5 pointer-events-none">/</span>
  </nav>
  <div class="relative flex items-center pr-2 gap-y-1 text-sm bg-background h-6 rounded-sm">
    <input
      type="text"
      class="w-full bg-transparent text-sm placeholder:text-foreground/20 px-2 focus:outline-none h-full caret-primary"
      placeholder="Search..."
      bind:value={search}
    />

    {#if search}
      <button onclick={() => (search = "")} class="cursor-pointer">
        <XIcon className="size-4" weight="bold" />
      </button>
    {:else}
      <MagnifyingGlassIcon className="size-4" weight="bold" />
    {/if}
  </div>

  <div class="flex items-center gap-1">
    <!-- <button
    className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
    title="New folder"
    onClick={() => {
      const name = prompt("Enter folder name:");
      if (!name) return;

      createDirectory(name);
    }}
  >
    {isPending ? <LoaderIcon className="size-4 animate-spin" /> : <FolderPlusIcon className="size-4" weight="bold" />}
  </button>

  <button
  className="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
  title="Upload files"
  disabled={isPending}
  onClick={() => inputRef.current?.click()}
>
  {isPending ? (
    <LoaderIcon className="size-4 animate-spin" />
  ) : (
    <UploadSimpleIcon className="size-4" weight="bold" />
  )}
</button>

<input
  type="file"
  className="hidden"
  multiple
  ref={inputRef}
  onChange={(e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    uploadFiles(files);
  }}
/> -->
  </div>
</div>
