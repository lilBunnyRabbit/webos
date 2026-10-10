<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { cn, format_bytes } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    CornersOut as CornersOutIcon,
    DownloadSimple as DownloadSimpleIcon,
    MagnifyingGlassMinus as MagnifyingGlassMinusIcon,
    MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
    MusicNote as MusicNoteIcon,
    Warning as WarningIcon,
  } from "phosphor-svelte";

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.25;

  const { path }: { path?: string } = $props();

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

  function download() {
    if (!url || !file) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
  }
</script>

{#snippet message(text: string, tone: "muted" | "error" = "muted")}
  <div class={cn("flex h-full flex-col items-center justify-center gap-3 p-8 text-center", tone === "error" ? "text-error" : "text-foreground/60")}>
    {#if tone === "error"}<WarningIcon class="size-12" />{/if}
    <p>{text}</p>
  </div>
{/snippet}

{#if !path}
  {@render message("Open an image, video or audio file from File Explorer to preview it here.")}
{:else if error}
  {@render message(`Could not read the file: ${error}`, "error")}
{:else if file === undefined}
  {@render message("Loading…")}
{:else if file === null}
  {@render message(`File not found: ${path}`, "error")}
{:else}
  <div class="grid h-full grid-rows-[auto_1fr_auto]">
    <div class="flex items-center gap-1 border-b border-b-foreground/20 px-2 py-1">
      <span class="flex-1 truncate px-2 text-sm">{file.name}</span>

      {#if kind === "image"}
        <button class="rounded p-1.5 hover:bg-foreground/10 disabled:opacity-40" title="Zoom out" disabled={zoom <= MIN_ZOOM} onclick={() => zoom_by(-ZOOM_STEP)}>
          <MagnifyingGlassMinusIcon class="size-4" />
        </button>
        <span class="min-w-12 text-center font-mono text-xs text-foreground/60">{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <button class="rounded p-1.5 hover:bg-foreground/10 disabled:opacity-40" title="Zoom in" disabled={zoom >= MAX_ZOOM} onclick={() => zoom_by(ZOOM_STEP)}>
          <MagnifyingGlassPlusIcon class="size-4" />
        </button>
        <button class="rounded p-1.5 hover:bg-foreground/10" title="Rotate" onclick={() => (rotation = (rotation + 90) % 360)}>
          <ArrowClockwiseIcon class="size-4" />
        </button>
        <button class="rounded p-1.5 hover:bg-foreground/10" title="Fit to window" onclick={reset_view}>
          <CornersOutIcon class="size-4" />
        </button>
        <div class="mx-1 h-5 w-px bg-foreground/20"></div>
      {/if}

      <button class="rounded p-1.5 hover:bg-foreground/10" title="Download" onclick={download}>
        <DownloadSimpleIcon class="size-4" />
      </button>
    </div>

    <div class="min-h-0 overflow-auto">
      {#if !url}
        {@render message("Loading…")}
      {:else if kind === "image"}
        <div class="grid h-full w-full place-items-center p-4" onwheel={on_wheel}>
          <img
            src={url}
            alt={file.name}
            draggable="false"
            class={cn("transition-transform", fit && "max-h-full max-w-full object-contain")}
            style:transform="scale({fit ? 1 : zoom}) rotate({rotation}deg)"
          />
        </div>
      {:else if kind === "video"}
        <div class="grid h-full place-items-center p-4">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={url} controls class="max-h-full max-w-full"></video>
        </div>
      {:else if kind === "audio"}
        <div class="flex h-full flex-col items-center justify-center gap-4 p-8">
          <MusicNoteIcon class="size-20 text-foreground/40" />
          <audio src={url} controls class="w-full max-w-md"></audio>
        </div>
      {:else}
        {@render message(`Cannot preview ${file.type || "this file type"}.`)}
      {/if}
    </div>

    <div class="flex gap-4 border-t border-t-foreground/20 px-3 py-1.5 font-mono text-xs text-foreground/60">
      <span>{file.type || "unknown type"}</span>
      <span>{format_bytes(file.size)}</span>
      <span>{new Date(file.lastModified).toLocaleString()}</span>
    </div>
  </div>
{/if}
