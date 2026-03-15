<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import {
    X as XIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    ArrowLeft as ArrowLeftIcon,
    ArrowClockwise as ArrowClockwiseIcon,
    FolderPlus as FolderPlusIcon,
  } from "phosphor-svelte";
  import FileUploadButton from "./file-upload-button.svelte";

  interface Props {
    handler: DirectoryHandler;
    path_stack: DirectoryHandler[];
    onnavigateback: () => void;
    onnavigatetoindex: (index: number) => void;
    search: string;
  }

  let { handler, path_stack, onnavigateback, onnavigatetoindex, search = $bindable() }: Props = $props();

  let creating_folder = $state(false);

  async function handle_create_folder() {
    const name = prompt("Enter folder name:");
    if (!name) return;

    creating_folder = true;
    try {
      await handler.create_directory(name);
    } finally {
      creating_folder = false;
    }
  }
</script>

<div
  class="grid grid-cols-[min-content_3fr_1fr_min-content] grid-rows-1 items-center bg-background-dark border-b border-b-foreground/20 py-2 gap-x-2 px-2"
>
  <div class="flex items-center gap-1">
    <button
      class="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
      title="Go back"
      disabled={path_stack.length === 0}
      onclick={onnavigateback}
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
    {#each path_stack as dir, idx (dir.path)}
      <button class="hover:underline hover:bg-foreground/10" onclick={() => onnavigatetoindex(idx)}>
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
    <button
      class="rounded p-1 hover:bg-background h-6 w-6 disabled:opacity-50 disabled:pointer-events-none active:bg-primary active:text-background"
      title="New folder"
      disabled={creating_folder}
      onclick={handle_create_folder}
    >
      <FolderPlusIcon className="size-4" weight="bold" />
    </button>

    <FileUploadButton {handler} />
  </div>
</div>
