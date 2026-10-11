<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { cn, format_bytes, format_datetime } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    CornersOut as CornersOutIcon,
    HardDrives as HardDrivesIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    MusicNote as MusicNoteIcon,
    Warning as WarningIcon,
    FileImage as FileImageIcon,
    FolderOpen as FolderOpenIcon,
  } from "phosphor-svelte";
  import { Button, EmptyState, IconButton, Separator, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { save_to_disk } from "$lib/core/components/files/file-actions";
  import { untrack } from "svelte";
  import manifest from "./index";

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.25;

  const { path: initial_path }: { path?: string } = $props();

  // Starts at the launched file; "Open…" swaps it in place.
  let path = $state(untrack(() => initial_path));
  const { window } = get_app_context();

  async function pick() {
    const chosen = await window.pick_file({ accept: manifest.associations, title: "Open in Media Preview" });
    if (chosen) path = chosen;
  }

  const files = $derived(kernel.service<FilesService>("files"));

  /** `undefined` while loading, `null` when the path points at nothing. */
  let file = $state<File | null | undefined>(undefined);
  let error = $state<string | null>(null);
  let url = $state<string | null>(null);

  let zoom = $state(1);
  let rotation = $state(0);
  let fit = $state(true);

  const kind = $derived.by(() => {
    const type = file?.type ?? "";
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    return "unsupported";
  });

  $effect(() => {
    if (!path) return;
    file = undefined;
    error = null;
    reset_view();
    let cancelled = false;
    files
      .get_file(path)
      .then((result) => {
        if (!cancelled) file = result;
      })
      .catch((reason) => {
        if (!cancelled) error = reason instanceof Error ? reason.message : String(reason);
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!file) return;
    const object_url = URL.createObjectURL(file);
    url = object_url;
    return () => {
      URL.revokeObjectURL(object_url);
      url = null;
    };
  });

  function zoom_by(delta: number) {
    fit = false;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
  }

  function reset_view() {
    fit = true;
    zoom = 1;
    rotation = 0;
  }

  function on_wheel(event: WheelEvent) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom_by(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }

</script>

{#if !path}
  <EmptyState icon={FileImageIcon} title="Nothing to preview" description="Pick an image, video or audio file, or open one from File Explorer.">
    {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button>{/snippet}
  </EmptyState>
{:else if error}
  <EmptyState icon={WarningIcon} tone="error" title="Couldn't read the file" description={error} />
{:else if file === undefined}
  <div class="grid h-full place-items-center"><Spinner label="Loading file" /></div>
{:else if file === null}
  <EmptyState icon={WarningIcon} tone="error" title="File not found" description={path} />
{:else}
  <div class="grid h-full grid-rows-[auto_1fr_auto]">
    <Toolbar>
      <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
      <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{file.name}</span>

      {#if kind === "image"}
        <IconButton label="Zoom out" size="sm" disabled={zoom <= MIN_ZOOM} onclick={() => zoom_by(-ZOOM_STEP)}>
          <MagnifyingGlassMinusIcon weight="bold" />
        </IconButton>
        <span class="min-w-11 text-center font-mono text-2xs text-foreground/80 tabular-nums">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <IconButton label="Zoom in" size="sm" disabled={zoom >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)}>
          <MagnifyingGlassPlusIcon weight="bold" />
        </IconButton>
        <IconButton label="Rotate" size="sm" onclick={() => (rotation = (rotation + 90) % 360)}>
          <ArrowClockwiseIcon weight="bold" />
        </IconButton>
        <IconButton label="Fit to window" size="sm" onclick={reset_view}>
          <CornersOutIcon weight="bold" />
        </IconButton>
        <Separator vertical />
      {/if}

      <IconButton label="Save to disk…" size="sm" onclick={() => path && save_to_disk(path)}>
        <HardDrivesIcon weight="bold" />
      </IconButton>
    </Toolbar>

    <div class="stage min-h-0 overflow-auto">
      {#if !url}
        <div class="grid h-full place-items-center"><Spinner /></div>
      {:else if kind === "image"}
        <!-- minmax(0,1fr) gives the cell a definite size, so max-h-full on the image can actually fit it. -->
        <div class="grid h-full w-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-6" onwheel={on_wheel}>
          <img
            src={url}
            alt={file.name}
            draggable="false"
            class={cn("rounded-sm transition-transform duration-200 ease-out", fit && "size-full object-contain")}
            style:transform="scale({fit ? 1 : zoom}) rotate({rotation}deg)"
          />
        </div>
      {:else if kind === "video"}
        <div class="grid h-full place-items-center p-6">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={url} controls class="max-h-full max-w-full rounded-lg shadow-window"></video>
        </div>
      {:else if kind === "audio"}
        <div class="flex h-full flex-col items-center justify-center gap-5 p-8">
          <div class="grid size-28 place-items-center rounded-2xl bg-background-light shadow-raised ring-1 ring-foreground/10">
            <MusicNoteIcon class="size-12 text-primary" weight="duotone" />
          </div>
          <p class="max-w-full truncate text-sm font-medium">{file.name}</p>
          <audio src={url} controls class="w-full max-w-md"></audio>
        </div>
      {:else}
        <EmptyState icon={WarningIcon} title="Can't preview this file" description={file.type || "Unknown type"} />
      {/if}
    </div>

    <StatusBar>
      <span>{file.type || "unknown type"}</span>
      <span>{format_bytes(file.size)}</span>
      <span class="ml-auto">{format_datetime(file.lastModified)}</span>
    </StatusBar>
  </div>
{/if}

<style>
  /* Media sits on the darker shade so images with transparency and dark video edges still read as a frame. */
  .stage {
    background: var(--background-darker);
  }
</style>
