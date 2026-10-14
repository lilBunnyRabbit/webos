<script lang="ts">
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { cn } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowLeft as ArrowLeftIcon,
    CaretRight as CaretRightIcon,
    FolderPlus as FolderPlusIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { IconButton, Input, Separator, Toolbar } from "../ui";
  import FileUploadButton from "./file-upload-button.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import { get_app_context } from "$lib/core/contexts/app";
  import { create_folder } from "./file-actions";
  import { is_system_path } from "$lib/core/api/services/files/hierarchy";

  interface Props {
    handler: DirectoryHandler;
    can_go_back: boolean;
    onback: () => void;
    onnavigatepath: (segments: string[]) => void;
    search: string;
  }

  let { handler, can_go_back, onback, onnavigatepath, search = $bindable() }: Props = $props();

  let creating_folder = $state(false);
  const read_only = $derived(is_system_path(handler.path));

  const crumbs = $derived([{ label: "/", segments: [] as string[] }, ...handler.segments.map((name, index) => ({ label: name, segments: handler.segments.slice(0, index + 1) }))]);

  const { window } = get_app_context();

  async function handle_create_folder() {
    creating_folder = true;
    await create_folder(handler, window);
    creating_folder = false;
  }
</script>

<Toolbar>
  <IconButton label="Back" size="sm" disabled={!can_go_back} onclick={onback}>
    <ArrowLeftIcon weight="bold" />
  </IconButton>
  <IconButton label="Reload" size="sm" onclick={() => handler.reload()}>
    <ArrowClockwiseIcon weight="bold" />
  </IconButton>

  <nav aria-label="Path" class="flex min-w-32 flex-1 items-center overflow-x-auto px-1">
    {#each crumbs as crumb, index (crumb.segments.join("/"))}
      {@const last = index === crumbs.length - 1}
      {#if index > 1}<CaretRightIcon class="size-3 shrink-0 text-foreground/65" weight="bold" />{/if}
      <button
        aria-current={last ? "location" : undefined}
        disabled={last}
        class={cn(
          "h-7 pointer-coarse:h-9 shrink-0 rounded-md px-1.5 text-ui transition-colors duration-150",
          last ? "font-medium text-foreground" : "text-foreground/80 hover:bg-foreground/8 hover:text-foreground",
          index === 0 && "font-mono"
        )}
        onclick={() => onnavigatepath(crumb.segments)}
      >
        {crumb.label}
      </button>
    {/each}
  </nav>

  <Input bind:value={search} size="sm" placeholder="Filter" aria-label="Filter this folder" class="min-w-28 flex-1 @md:w-28 @md:flex-none @lg:w-40">
    {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
    {#snippet trailing()}
      {#if search}
        <button class="grid size-5 place-items-center rounded-sm text-foreground/65 hover:text-foreground" aria-label="Clear filter" onclick={() => (search = "")}>
          <XIcon class="size-3" weight="bold" />
        </button>
      {/if}
    {/snippet}
  </Input>

  <!-- One group, so a wrapping toolbar keeps the two together. -->
  <div class="flex shrink-0 items-center gap-1.5">
    <Separator vertical class="hidden @md:block" />
    <IconButton label="New folder" size="sm" disabled={creating_folder || read_only} onclick={handle_create_folder}>
      <FolderPlusIcon weight="bold" />
    </IconButton>
    <FileUploadButton {handler} disabled={read_only} />
  </div>
</Toolbar>
