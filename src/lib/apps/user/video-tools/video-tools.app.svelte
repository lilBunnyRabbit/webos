<script lang="ts">
  import kernel, { type AppsService, type FilesService, type TaskJob } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Segmented, Select, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes } from "$lib/core/utils";
  import { has_files } from "$kit/utils/image";
  import { paste_files } from "$kit/utils/paste";
  import {
    ArrowLineLeft as ArrowLineLeftIcon,
    ArrowLineRight as ArrowLineRightIcon,
    BracketsSquare as BracketsSquareIcon,
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    FilmSlate as FilmSlateIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { probe_video, type VideoInfo } from "$kit/utils/video/capture";
  import { export_clip, type ClipResult, type ClipSettings, type ClipSource } from "./jobs";
  import { GIF_FPS, GIF_WIDTH, Quality, VIDEO_ACCEPT, is_video_name } from "./kinds";
  import {
    GIF_LARGE_BYTES,
    GIF_LONG_FRAMES,
    GIF_WIDTHS,
    Output,
    estimate_gif_bytes,
    format_time,
    gif_frame_count,
    gif_size,
  } from "$kit/utils/video/plan";
  import Scrubber from "./scrubber.svelte";

  /** Videos don't say their frame rate, so a step is one 30 fps frame. */
  const STEP = 1 / 30;

  const { path }: { path?: string } = $props();
  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  interface Loaded extends VideoInfo {
    source: ClipSource;
    url: string;
  }

  let loaded = $state.raw<Loaded | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let root = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();

  let time = $state(0);
  let playing = $state(false);
  let from = $state(0);
  let to = $state(0);

  let output = $state<Output>(Output.WEBM);
  let quality = $state<Quality>(Quality.MEDIUM);
  let keep_audio = $state(true);
  let fps = $state<number>(GIF_FPS.DEFAULT);
  let width_value = $state(String(GIF_WIDTH.DEFAULT));
  let dither = $state(true);

  let job = $state.raw<TaskJob | null>(null);
  let result = $state.raw<(ClipResult & { url: string; output: Output }) | null>(null);

  const OUTPUTS = [
    { value: Output.WEBM, label: "Clip" },
    { value: Output.GIF, label: "GIF" },
    { value: Output.AUDIO, label: "Sound" },
  ];
  const QUALITY_OPTIONS = [
    { value: Quality.LOW, label: "Low" },
    { value: Quality.MEDIUM, label: "Medium" },
    { value: Quality.HIGH, label: "High" },
  ];

  const length = $derived(Math.max(0, to - from));
  const width_options = $derived.by(() => {
    const full = loaded?.width ?? GIF_WIDTH.DEFAULT;
    const sizes = [...GIF_WIDTHS.filter((size) => size < full), full];
    return sizes.map((size) => ({ value: String(size), label: size === full ? `${size} px (full)` : `${size} px` }));
  });
  const gif = $derived.by(() => {
    if (!loaded) return null;
    const size = gif_size(loaded, Number(width_value));
    const frames = gif_frame_count({ from, to }, fps);
    const bytes = estimate_gif_bytes(size, frames, dither);
    const warnings = [
      frames > GIF_LONG_FRAMES && `${frames} frames is a long GIF; most sites cap them at a few seconds.`,
      bytes > GIF_LARGE_BYTES && `About ${format_bytes(bytes)}: lower the width or frame rate, or turn dithering off.`,
    ].filter((line) => typeof line === "string");
    return { size, frames, bytes, warnings };
  });
  const running = $derived(job !== null && job.status === "running");

  let request = 0;

  async function load(file: File, file_path: string | null) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const info = await probe_video(file);
      if (id !== request) return;
      release();
      loaded = {
        ...info,
        source: { name: file.name, path: file_path, file, size: { width: info.width, height: info.height } },
        url: URL.createObjectURL(file),
      };
      from = 0;
      to = info.duration;
      time = 0;
      playing = false;
      width_value = String(Math.min(GIF_WIDTH.DEFAULT, info.width));
      if (!width_options.some((option) => option.value === width_value)) width_value = String(info.width);
      clear_result();
      root?.focus({ preventScroll: true });
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  async function load_path(target: string) {
    const file = await files.get_file(target).catch(() => null);
    if (!file) {
      error = `File not found: ${target}`;
      return;
    }
    await load(file, target);
  }

  function release() {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }

  function clear_result() {
    if (result) URL.revokeObjectURL(result.url);
    result = null;
  }

  onDestroy(() => {
    release();
    clear_result();
  });

  const initial = untrack(() => path);
  if (initial) void load_path(initial);

  async function pick() {
    const start_path = loaded?.source.path ? parent_path(loaded.source.path) : undefined;
    const chosen = await win.pick_file({ accept: VIDEO_ACCEPT, start_path, title: "Open a video" });
    if (chosen) await load_path(chosen);
  }

  function take(list: File[]) {
    const file = list.find((item) => item.type.startsWith("video/") || is_video_name(item.name));
    if (file) void load(file, null);
    else if (list.length) error = `Not a video: ${list[0].name}`;
  }

  function seek(target: number) {
    if (!video || !loaded) return;
    const next = Math.min(Math.max(0, target), loaded.duration);
    video.currentTime = next;
    time = next;
  }

  function toggle() {
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= to - STEP / 2 || video.currentTime < from) seek(from);
      void video.play();
    } else video.pause();
  }

  function step(delta: number) {
    video?.pause();
    seek(time + delta);
  }

  function set_in() {
    from = Math.min(time, to - STEP);
  }

  function set_out() {
    to = Math.max(time, from + STEP);
  }

  function on_keydown(event: KeyboardEvent) {
    if (!loaded || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, select, textarea, [role=slider], [role=radiogroup]")) return;
    const actions: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      ArrowLeft: () => step(event.shiftKey ? -1 : -STEP),
      ArrowRight: () => step(event.shiftKey ? 1 : STEP),
      i: set_in,
      o: set_out,
      "[": () => seek(from),
      "]": () => seek(to),
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    if (event.key === " " && target.closest("button")) return;
    event.preventDefault();
    action();
  }

  function track_time(element: HTMLVideoElement) {
    let frame = 0;
    const tick = () => {
      time = element.currentTime;
      if (!element.paused && element.currentTime >= to) {
        element.pause();
        time = to;
      }
      frame = element.requestVideoFrameCallback(tick);
    };
    frame = element.requestVideoFrameCallback(tick);
    const sync = () => (time = element.currentTime);
    element.addEventListener("seeked", sync);
    element.addEventListener("timeupdate", sync);
    return () => {
      element.cancelVideoFrameCallback(frame);
      element.removeEventListener("seeked", sync);
      element.removeEventListener("timeupdate", sync);
    };
  }

  function settings(): ClipSettings {
    if (output === Output.GIF) return { output, fps, width: Number(width_value), dither };
    if (output === Output.AUDIO) return { output };
    return { output, quality, audio: keep_audio };
  }

  async function save() {
    if (!loaded || running) return;
    video?.pause();
    clear_result();
    const chosen = output;
    const outcome = await export_clip({
      app_id,
      source: loaded.source,
      range: { from, to },
      settings: settings(),
      on_job: (next) => (job = next),
    });
    if (!outcome.ok) return;
    const file = await files.get_file(outcome.result.path);
    if (file) result = { ...outcome.result, output: chosen, url: URL.createObjectURL(file) };
  }

  const open_result = () => result && kernel.service<AppsService>("apps").open(result.path);
  const show_result = () => result && kernel.service<AppsService>("apps").launch("file-explorer", { path: parent_path(result.path) });

  function on_dragover(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) dragging = false;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    take([...(event.dataTransfer?.files ?? [])]);
  }
</script>

{#snippet heading(text: string)}
  <h3 class="px-0.5 text-2xs font-semibold tracking-wide text-foreground/65 uppercase">{text}</h3>
{/snippet}

{#snippet row(label: string, value: string)}
  <div class="flex items-baseline justify-between gap-2 px-0.5 text-ui">
    <span class="text-foreground/80">{label}</span>
    <span class="font-mono text-2xs tabular-nums">{value}</span>
  </div>
{/snippet}

<div
  bind:this={root}
  {@attach paste_files({ win, accept: VIDEO_ACCEPT, onfiles: take })}
  class="relative grid h-full grid-rows-[auto_minmax(0,1fr)_auto] outline-none"
  role="presentation"
  tabindex="-1"
  onkeydown={on_keydown}
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <Toolbar>
    <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
    <span class="min-w-20 flex-1 truncate px-1 text-ui font-medium">{loaded?.source.name ?? ""}</span>
    {#if loaded}
      {#if running}
        <Button size="sm" onclick={() => job?.cancel()}><XIcon weight="bold" /> Cancel</Button>
      {:else}
        <Button variant="primary" size="sm" disabled={length < STEP} onclick={save}>
          <FloppyDiskIcon weight="bold" /> Save {output === Output.GIF ? "GIF" : output === Output.AUDIO ? "sound" : "clip"}
        </Button>
      {/if}
    {/if}
  </Toolbar>

  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading video" /></div>
  {:else if error && !loaded}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the video" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !loaded}
    <EmptyState
      icon={FilmSlateIcon}
      title="No video open"
      description="Trim a video to a WebM clip, turn part of it into a GIF, or save its sound. Open one, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a video…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(13rem,1fr)_minmax(0,18rem)] @2xl:grid-cols-[minmax(0,1fr)_17rem] @2xl:grid-rows-[minmax(0,1fr)]">
      <div class="stage grid min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-1 p-2 @xl:p-4">
        <div class="grid min-h-0 place-items-center [container-type:size]">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={video}
            src={loaded.url}
            class="block max-h-full max-w-full rounded-xs bg-background-darkest"
            style:aspect-ratio="{loaded.width} / {loaded.height}"
            style:width="min(100cqw, calc(100cqh * {loaded.width / loaded.height}))"
            playsinline
            preload="auto"
            onplay={() => (playing = true)}
            onpause={() => (playing = false)}
            onclick={toggle}
            {@attach track_time}
          ></video>
        </div>
        <Scrubber
          duration={loaded.duration}
          {time}
          {from}
          {to}
          step={STEP}
          disabled={running}
          onseek={(next) => {
            video?.pause();
            seek(next);
          }}
          onrange={(next_from, next_to) => {
            from = next_from;
            to = next_to;
          }}
        />
        <div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          <IconButton label="Go to in point ([)" size="sm" variant="quiet" onclick={() => seek(from)}><ArrowLineLeftIcon weight="bold" /></IconButton>
          <IconButton label="Previous frame (←)" size="sm" variant="quiet" onclick={() => step(-STEP)}><CaretLeftIcon weight="bold" /></IconButton>
          <IconButton label={playing ? "Pause (Space)" : "Play (Space)"} size="sm" onclick={toggle}>
            {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
          </IconButton>
          <IconButton label="Next frame (→)" size="sm" variant="quiet" onclick={() => step(STEP)}><CaretRightIcon weight="bold" /></IconButton>
          <IconButton label="Go to out point (])" size="sm" variant="quiet" onclick={() => seek(to)}><ArrowLineRightIcon weight="bold" /></IconButton>
          <span class="mx-1 font-mono text-2xs text-foreground/80 tabular-nums">{format_time(time)} / {format_time(loaded.duration)}</span>
          <Button size="sm" variant="quiet" title="Set the in point here (I)" onclick={set_in}><BracketsSquareIcon weight="bold" /> In</Button>
          <Button size="sm" variant="quiet" title="Set the out point here (O)" onclick={set_out}><BracketsSquareIcon weight="bold" /> Out</Button>
        </div>
      </div>

      <aside class="flex min-h-0 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:border-t-0 @2xl:border-l">
        <div class="flex flex-col gap-1">
          {@render heading("Part")}
          {@render row("In", format_time(from))}
          {@render row("Out", format_time(to))}
          {@render row("Length", format_time(length))}
        </div>

        <div class="flex flex-col gap-2">
          {@render heading("Save as")}
          <Segmented label="Save as" options={OUTPUTS} bind:value={output} class="w-full *:flex-1" />
          {#if output === Output.WEBM}
            <label class="flex items-center justify-between gap-2 text-ui">
              Quality
              <Segmented size="sm" label="Quality" options={QUALITY_OPTIONS} bind:value={quality} />
            </label>
            <label class="flex items-center justify-between gap-2 text-ui">
              Keep the sound
              <Switch bind:checked={keep_audio} />
            </label>
            <p class="px-0.5 text-2xs text-foreground/65">WebM with VP9 video{keep_audio ? " and Opus sound" : ""}. Saving plays the part through once, so it takes about as long as the part.</p>
          {:else if output === Output.GIF && gif}
            <label class="flex items-center gap-2 text-ui">
              <span class="w-16 shrink-0">Frames</span>
              <Slider size="sm" min={GIF_FPS.MIN} max={GIF_FPS.MAX} bind:value={fps} class="min-w-0 flex-1" aria-label="Frames per second" />
              <span class="w-12 text-right font-mono text-2xs text-foreground/80 tabular-nums">{fps} fps</span>
            </label>
            <label class="flex items-center justify-between gap-2 text-ui">
              Width
              <Select size="sm" class="w-auto" options={width_options} bind:value={width_value} aria-label="Width" />
            </label>
            <label class="flex items-center justify-between gap-2 text-ui" title="Mixes the 256 colours a GIF frame can hold into smoother gradients, at the cost of size">
              Dithering
              <Switch bind:checked={dither} />
            </label>
            {@render row(`${gif.frames} frames`, `${gif.size.width} × ${gif.size.height}`)}
            {@render row("Size", `about ${format_bytes(gif.bytes)}`)}
            {#each gif.warnings as warning (warning)}
              <p class="flex gap-1.5 px-0.5 text-2xs text-warning"><WarningIcon class="mt-px size-3.5 shrink-0" weight="bold" />{warning}</p>
            {/each}
          {:else}
            <p class="px-0.5 text-2xs text-foreground/65">The sound of the part as Opus in a WebM file. Videos without sound can't be saved this way.</p>
          {/if}
        </div>

        {#if running && job}
          <div class="flex flex-col gap-1.5">
            {@render heading("Saving")}
            <div class="h-1.5 overflow-hidden rounded-full bg-foreground/12">
              <div class="h-full bg-primary transition-[width]" style:width="{Math.round(job.progress * 100)}%"></div>
            </div>
            <p class="px-0.5 font-mono text-2xs text-foreground/80 tabular-nums">{job.message ?? "Starting"}</p>
          </div>
        {/if}

        {#if result}
          <div class="flex flex-col gap-2" {@attach (node) => node.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
            {@render heading("Saved")}
            {#if result.output === Output.GIF}
              <img src={result.url} alt="The saved GIF" class="checker max-h-48 w-full rounded-xs object-contain ring-1 ring-foreground/10" />
            {:else if result.output === Output.WEBM}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={result.url} controls class="max-h-48 w-full rounded-xs bg-background-darkest"></video>
            {:else}
              <audio src={result.url} controls class="w-full"></audio>
            {/if}
            <p class="truncate px-0.5 text-ui" title={result.path}>{base_name(result.path)} · <span class="font-mono text-2xs">{format_bytes(result.size)}</span></p>
            <div class="flex gap-2">
              <Button size="sm" onclick={open_result}>Open</Button>
              <Button size="sm" variant="quiet" onclick={show_result}>Show in folder</Button>
            </div>
          </div>
        {/if}
      </aside>
    </div>

    <StatusBar>
      <span>{loaded.width} × {loaded.height} px</span>
      <span>{format_bytes(loaded.source.file.size)}</span>
      {#if error}<span class="truncate text-error">{error}</span>{/if}
      <span class="ml-auto hidden truncate @xl:inline">Space plays · ← → step a frame · I and O set the part</span>
    </StatusBar>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to open</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }

  .checker {
    background: repeating-conic-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 0 25%, transparent 0 50%) 0 0 / 16px 16px;
  }
</style>
