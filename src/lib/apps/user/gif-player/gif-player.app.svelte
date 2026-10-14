<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { Button, EmptyState, IconButton, Select, Separator, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import {
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    FilmStrip as FilmStripIcon,
    FolderOpen as FolderOpenIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SkipBack as SkipBackIcon,
    SkipForward as SkipForwardIcon,
    Trash as TrashIcon,
    Warning as WarningIcon,
    Devices as DevicesIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { GifDecoder, type WarmupProgress } from "./gif-decoder";
  import { ACCEPT, SPEED_OPTIONS, VIDEO_FPS, format_ms, is_gif_file, is_media_file, is_video_file, load_video_meta, type VideoMeta } from "./media";

  interface GifMedia {
    kind: "gif";
    name: string;
    decoder: GifDecoder;
  }

  interface VideoMedia extends VideoMeta {
    kind: "video";
    name: string;
    url: string;
  }

  type Media = GifMedia | VideoMedia;

  const { path }: { path?: string } = $props();
  const { window } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  let media = $state.raw<Media | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let index = $state(0);
  let playing = $state(false);
  let speed_value = $state("1");
  const speed = $derived(Number(speed_value));
  const speed_options = SPEED_OPTIONS.map((value) => ({ value: String(value), label: `${value}×` }));

  let delays = $state.raw<number[]>([]);
  let warmup = $state.raw<WarmupProgress | null>(null);

  let root: HTMLDivElement | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let video: HTMLVideoElement | null = $state(null);
  let dragging = $state(false);

  const width = $derived(media ? (media.kind === "gif" ? media.decoder.width : media.width) : 0);
  const height = $derived(media ? (media.kind === "gif" ? media.decoder.height : media.height) : 0);
  const frame_count = $derived(media ? (media.kind === "gif" ? media.decoder.frame_count : media.frame_count) : 0);
  const timing = $derived.by(() => {
    if (media?.kind === "video") {
      return { current: (index / VIDEO_FPS) * 1000, total: media.duration_ms, delay: 1000 / VIDEO_FPS };
    }
    let current = 0;
    for (let i = 0; i < index; i++) current += delays[i] ?? 0;
    return { current, total: delays.reduce((sum, delay) => sum + delay, 0), delay: delays[index] ?? 0 };
  });

  let load_token = 0;

  async function load(file: File) {
    const token = ++load_token;
    loading = true;
    error = null;
    playing = false;
    try {
      let next: Media;
      if (is_video_file(file)) {
        const url = URL.createObjectURL(file);
        try {
          next = { kind: "video", name: file.name, url, ...(await load_video_meta(url)) };
        } catch (reason) {
          URL.revokeObjectURL(url);
          throw reason;
        }
      } else if (is_gif_file(file)) {
        next = { kind: "gif", name: file.name, decoder: await GifDecoder.open(file) };
      } else if (file.type.startsWith("image/")) {
        throw new Error(`Not a GIF (${file.type}). "Copy image" usually converts to PNG and loses the animation, so open the .gif file itself.`);
      } else {
        throw new Error(`Not a GIF or video (${file.type || file.name}).`);
      }

      if (token !== load_token) return dispose(next);
      index = 0;
      media = next;
      playing = true;
      root?.focus({ preventScroll: true });
    } catch (reason) {
      if (token !== load_token) return;
      console.error("[GifPlayer] load failed", reason);
      media = null;
      error = error_message(reason);
    } finally {
      if (token === load_token) loading = false;
    }
  }

  function dispose(target: Media) {
    if (target.kind === "gif") target.decoder.close();
    else URL.revokeObjectURL(target.url);
  }

  async function open_path(target: string) {
    try {
      const file = await files.get_file(target);
      if (file) return load(file);
      media = null;
      error = `File not found: ${target}`;
    } catch (reason) {
      media = null;
      error = error_message(reason);
    }
  }

  async function pick() {
    const chosen = await window.pick_file({ accept: ACCEPT, title: "Open in GIF Player" });
    if (chosen) await open_path(chosen);
  }

  const pick_device = async () => load_first(await pick_device_files({ accept: ACCEPT }));

  function load_first(list: File[]) {
    const file = list.find(is_media_file) ?? list[0];
    if (file) void load(file);
  }

  function clear() {
    load_token++;
    loading = false;
    playing = false;
    media = null;
    error = null;
    index = 0;
  }

  const initial_path = untrack(() => path);
  if (initial_path) void open_path(initial_path);

  $effect(() => {
    const current = media;
    if (!current) return;
    if (current.kind === "gif") {
      delays = current.decoder.delays.slice();
      warmup = null;
      void current.decoder.warmup((progress) => {
        warmup = progress;
        delays = current.decoder.delays.slice();
      });
    }
    return () => dispose(current);
  });

  $effect(() => {
    if (media?.kind !== "gif" || !canvas) return;
    const decoder = media.decoder;
    const context = canvas.getContext("2d");
    if (!context) return;
    const target = index;
    decoder
      .draw(target, context)
      .then(() => {
        if (untrack(() => delays[target]) !== decoder.delays[target]) delays = decoder.delays.slice();
      })
      .catch((reason) => console.warn(`[GifPlayer] frame ${target} failed to draw`, reason));
  });

  $effect(() => {
    if (!playing || media?.kind !== "gif") return;
    const { decoder } = media;
    const delay = Math.max(20, decoder.delays[index]) / speed;
    const timer = setTimeout(() => (index = (index + 1) % decoder.frame_count), delay);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (media?.kind !== "video" || !video) return;
    const element = video;
    const last = media.frame_count - 1;
    element.playbackRate = speed;
    if (!playing) {
      element.pause();
      return;
    }
    element.play().catch((reason) => console.warn("[GifPlayer] video play failed", reason));
    let handle = 0;
    const on_frame: VideoFrameRequestCallback = (_now, frame) => {
      index = Math.min(last, Math.floor(frame.mediaTime * VIDEO_FPS));
      handle = element.requestVideoFrameCallback(on_frame);
    };
    handle = element.requestVideoFrameCallback(on_frame);
    return () => element.cancelVideoFrameCallback(handle);
  });

  function seek(target: number) {
    if (!frame_count) return;
    playing = false;
    index = Math.max(0, Math.min(target, frame_count - 1));
    if (media?.kind === "video" && video) video.currentTime = index / VIDEO_FPS;
  }

  const next = () => seek((index + 1) % frame_count);
  const prev = () => seek((index - 1 + frame_count) % frame_count);

  function on_keydown(event: KeyboardEvent) {
    if (!media || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const action = { " ": () => (playing = !playing), ArrowRight: next, ArrowLeft: prev, Home: () => seek(0), End: () => seek(frame_count - 1) }[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  function on_paste(event: ClipboardEvent) {
    const pasted = [...(event.clipboardData?.files ?? [])];
    if (!pasted.length) return;
    event.preventDefault();
    load_first(pasted);
  }

  function on_drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    load_first([...(event.dataTransfer?.files ?? [])]);
  }

  function on_dragover(event: DragEvent) {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }
</script>

<div
  bind:this={root}
  role="presentation"
  tabindex="-1"
  class={cn("relative h-full outline-none", dragging && "ring-2 ring-primary ring-inset")}
  onkeydown={on_keydown}
  onpaste={on_paste}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the file" description={error}>
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
    </EmptyState>
  {:else if !media}
    {#if !loading}
      <EmptyState icon={FilmStripIcon} title="No media loaded" description="Open a GIF or video to step through it frame by frame. You can also drop or paste one here.">
        {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a file…</Button><Button onclick={pick_device}><DevicesIcon weight="bold" /> From device…</Button>{/snippet}
      </EmptyState>
    {/if}
  {:else}
    <div class="grid h-full grid-rows-[auto_1fr_auto_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <IconButton label="Open from device…" size="sm" onclick={pick_device}><DevicesIcon weight="bold" /></IconButton>
        <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">{media.name}</span>
        <Select size="sm" class="w-20" aria-label="Speed" options={speed_options} bind:value={speed_value} />
        <Separator vertical />
        <IconButton label="Clear" size="sm" onclick={clear}><TrashIcon weight="bold" /></IconButton>
      </Toolbar>

      <div class="stage grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center p-6">
        {#if media.kind === "gif"}
          <canvas bind:this={canvas} {width} {height} class="pixelated max-h-full max-w-full rounded-sm object-contain"></canvas>
        {:else}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={video}
            src={media.url}
            muted
            playsinline
            class="max-h-full max-w-full rounded-sm object-contain"
            onended={() => (playing = false)}
          ></video>
        {/if}
      </div>

      <div class="flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 py-2">
        <div class="flex items-center justify-between font-mono text-2xs text-foreground/80 tabular-nums">
          <span>Frame {index + 1} / {frame_count}</span>
          <span>{format_ms(timing.current)} / {format_ms(timing.total)}</span>
        </div>

        {#if frame_count > 1}
          <div class="flex flex-col gap-0.5">
            <Slider
              aria-label="Frame"
              min={0}
              max={frame_count - 1}
              step={1}
              value={index}
              size="sm"
              class="w-full"
              oninput={(event) => seek(Number(event.currentTarget.value))}
            />
            <div class="h-0.5 overflow-hidden rounded-full bg-foreground/8" title={warmup ? `Decoded ${warmup.done} of ${warmup.total} frames` : undefined}>
              {#if media.kind === "gif" && warmup}
                <div class="h-full bg-primary/50 transition-[width] duration-150" style:width="{(warmup.done / warmup.total) * 100}%"></div>
              {/if}
            </div>
          </div>
        {/if}

        <div class="flex items-center justify-center gap-1.5">
          <IconButton label="Jump to start (Home)" onclick={() => seek(0)}><SkipBackIcon weight="bold" /></IconButton>
          <IconButton label="Previous frame (←)" onclick={prev}><CaretLeftIcon weight="bold" /></IconButton>
          <IconButton label={playing ? "Pause (Space)" : "Play (Space)"} variant={playing ? "secondary" : "primary"} onclick={() => (playing = !playing)}>
            {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
          </IconButton>
          <IconButton label="Next frame (→)" onclick={next}><CaretRightIcon weight="bold" /></IconButton>
          <IconButton label="Jump to end (End)" onclick={() => seek(frame_count - 1)}><SkipForwardIcon weight="bold" /></IconButton>
        </div>
      </div>

      <StatusBar>
        <span>{media.kind === "gif" ? "GIF" : "Video"}</span>
        <span>{width} × {height}</span>
        {#if media.kind === "gif"}
          <span>{frame_count} frames</span>
          <span class="hidden @md:block">delay {format_ms(timing.delay)}</span>
        {:else}
          <span>step ~{Math.round(timing.delay)}ms ({VIDEO_FPS} fps)</span>
        {/if}
        <span class="ml-auto">{format_ms(timing.total)}</span>
      </StatusBar>
    </div>
  {/if}

  {#if loading}
    <div class="absolute inset-0 grid place-items-center bg-background"><Spinner label="Loading media" /></div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .pixelated {
    image-rendering: pixelated;
  }
</style>
