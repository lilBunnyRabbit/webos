<script lang="ts">
  import kernel, { NotificationType, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Segmented, Separator, Slider, Spinner, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { format_bytes, error_message } from "$lib/core/utils";
  import { has_files } from "$lib/core/utils/image";
  import {
    ChartBar as ChartBarIcon,
    Circle as CircleIcon,
    CornersIn as CornersInIcon,
    CornersOut as CornersOutIcon,
    Equalizer as EqualizerIcon,
    FolderOpen as FolderOpenIcon,
    Microphone as MicrophoneIcon,
    MicrophoneSlash as MicrophoneSlashIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SpeakerHigh as SpeakerHighIcon,
    SpeakerX as SpeakerXIcon,
    Warning as WarningIcon,
    Waveform as WaveformIcon,
  } from "phosphor-svelte";
  import { onDestroy, tick, untrack } from "svelte";
  import { z } from "zod";
  import { AudioGraph } from "./audio-graph";
  import { format_time, VisualizerMode } from "./spectrum";
  import Visualizer from "./visualizer.svelte";
  import { parent_path } from "$lib/core/api/services/files/path";

  const ACCEPT = ["audio/*"];
  const MODE_OPTIONS = [
    { value: VisualizerMode.BARS, label: "Bars", icon: ChartBarIcon },
    { value: VisualizerMode.WAVE, label: "Wave", icon: WaveformIcon },
    { value: VisualizerMode.RADIAL, label: "Radial", icon: CircleIcon },
  ];

  const { path: initial_path }: { path?: string } = $props();
  const { app_id, window: win, storage } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const mode = storage.persisted<VisualizerMode>("mode", VisualizerMode.BARS, z.enum(VisualizerMode));
  const volume = storage.persisted("volume", 0.8, z.number().min(0).max(1));
  const smoothing = storage.persisted("smoothing", 0.7, z.number().min(0).max(1));
  const sensitivity = storage.persisted("sensitivity", 1.2, z.number().min(0.5).max(3));

  let root = $state<HTMLDivElement>();
  let stage = $state<HTMLDivElement>();
  let audio = $state<HTMLAudioElement>();
  let graph = $state.raw<AudioGraph | null>(null);

  let file = $state.raw<File | null>(null);
  let path = $state<string | null>(null);
  let url = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let mic = $state(false);

  let paused = $state(true);
  let current_time = $state(0);
  let duration = $state(0);
  let fullscreen = $state(false);
  let dragging = $state(false);

  const running = $derived((mic || !paused) && win.is_visible);
  const title = $derived(mic ? "Microphone" : (file?.name ?? ""));

  $effect(() => {
    if (!file) return;
    const object_url = URL.createObjectURL(file);
    url = object_url;
    return () => {
      URL.revokeObjectURL(object_url);
      url = null;
    };
  });

  $effect(() => {
    if (graph) graph.volume = volume.value;
  });

  $effect(() => {
    if (graph) graph.smoothing = smoothing.value;
  });

  onDestroy(() => graph?.close());

  function report(heading: string, reason: unknown) {
    console.error(`[MusicVisualizer] ${heading}`, reason);
    notifications.notify(app_id, { type: NotificationType.ERROR, title: heading, message: error_message(reason) });
  }

  // Built on first play: an AudioContext made without a user gesture starts suspended.
  function ensure_graph(): AudioGraph | null {
    if (!graph && audio) graph = new AudioGraph(audio);
    return graph;
  }

  function stop_mic() {
    graph?.stop_mic();
    mic = false;
  }

  async function play() {
    const current = ensure_graph();
    if (!current || !audio || !url) return;
    stop_mic();
    current.resume().catch((reason) => console.warn("[MusicVisualizer] resume failed", reason));
    try {
      await audio.play();
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "NotAllowedError")) report("Couldn't play the file", reason);
    }
  }

  function toggle_play() {
    if (paused) void play();
    else audio?.pause();
  }

  async function toggle_mic() {
    if (mic) return stop_mic();
    const current = ensure_graph();
    if (!current) return;
    audio?.pause();
    try {
      await current.start_mic();
      mic = true;
      error = null;
    } catch (reason) {
      report("Couldn't use the microphone", reason);
    }
  }

  let request = 0;

  async function load(task: () => Promise<{ file: File; path: string | null }>) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const result = await task();
      if (id !== request) return;
      stop_mic();
      file = result.file;
      path = result.path;
      await tick();
      void play();
    } catch (reason) {
      if (id === request) error = error_message(reason);
    } finally {
      if (id === request) loading = false;
    }
  }

  function open_path(target: string) {
    return load(async () => {
      const found = await files.get_file(target);
      if (!found) throw new Error(`File not found: ${target}`);
      return { file: found, path: target };
    });
  }

  const initial = untrack(() => initial_path);
  if (initial) void open_path(initial);

  async function pick() {
    const chosen = await win.pick_file({ accept: ACCEPT, start_path: path ? parent_path(path) : undefined, title: "Open in Music Visualizer" });
    if (chosen) await open_path(chosen);
  }

  function seek(event: Event & { currentTarget: HTMLInputElement }) {
    if (audio) audio.currentTime = Number(event.currentTarget.value);
  }

  function toggle_fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else stage?.requestFullscreen().catch((reason) => report("Couldn't go full screen", reason));
  }

  function on_audio_error() {
    if (!url) return;
    error = "This file can't be played. It may be damaged or in a format the browser doesn't support.";
  }

  function on_keydown(event: KeyboardEvent) {
    if (event.key !== " " || event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return;
    if (!file && !mic) return;
    event.preventDefault();
    if (mic) stop_mic();
    else toggle_play();
  }

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
    const dropped = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("audio/"));
    if (dropped) void load(async () => ({ file: dropped, path: null }));
    else notifications.notify(app_id, { type: NotificationType.WARNING, title: "That isn't an audio file", message: "Drop a song to play it." });
  }
</script>

<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === stage && !!stage)} />

<!-- Outside every branch: the audio graph holds this element for the window's whole life. -->
<audio
  bind:this={audio}
  src={url ?? undefined}
  bind:paused
  bind:currentTime={current_time}
  bind:duration
  onerror={on_audio_error}
  class="hidden"
></audio>

<div
  bind:this={root}
  role="presentation"
  tabindex="-1"
  class="relative h-full outline-none"
  onkeydown={on_keydown}
  ondragenter={on_dragover}
  ondragover={on_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  {#if loading}
    <div class="grid h-full place-items-center"><Spinner label="Loading audio" /></div>
  {:else if error}
    <EmptyState icon={WarningIcon} tone="error" title="Couldn't open the audio" description={error}>
      {#snippet actions()}<Button onclick={pick}><FolderOpenIcon weight="bold" /> Open another…</Button>{/snippet}
    </EmptyState>
  {:else if !file && !mic}
    <EmptyState icon={EqualizerIcon} title="Nothing playing" description="Open a song to see it as bars, a waveform or a circle. You can also drop one here or listen to the microphone.">
      {#snippet actions()}
        <Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open audio…</Button>
        <Button onclick={toggle_mic}><MicrophoneIcon weight="bold" /> Use microphone</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="grid h-full grid-rows-[auto_minmax(0,1fr)_auto_auto]">
      <Toolbar>
        <IconButton label="Open…" size="sm" onclick={pick}><FolderOpenIcon weight="bold" /></IconButton>
        <span class="order-first min-w-0 basis-full truncate px-1 text-ui font-medium @lg:order-none @lg:flex-1 @lg:basis-auto">{title}</span>
        <Segmented size="sm" label="Visualization" options={MODE_OPTIONS} bind:value={mode.value} />
        <Separator vertical class="hidden @md:block" />
        <IconButton label={mic ? "Stop microphone" : "Use microphone"} size="sm" variant={mic ? "secondary" : "quiet"} onclick={toggle_mic}>
          {#if mic}<MicrophoneSlashIcon weight="bold" />{:else}<MicrophoneIcon weight="bold" />{/if}
        </IconButton>
        <IconButton label="Full screen" size="sm" onclick={toggle_fullscreen}><CornersOutIcon weight="bold" /></IconButton>
      </Toolbar>

      <div bind:this={stage} role="presentation" class="stage relative min-h-0" ondblclick={toggle_fullscreen}>
        <Visualizer analyser={graph?.analyser ?? null} mode={mode.value} sensitivity={sensitivity.value} {running} />
        {#if fullscreen}
          <IconButton label="Exit full screen" size="sm" class="absolute top-3 right-3" onclick={toggle_fullscreen}>
            <CornersInIcon weight="bold" />
          </IconButton>
        {/if}
      </div>

      <div class="flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 py-2">
        <div class="flex items-center gap-2 font-mono text-2xs text-foreground/80 tabular-nums">
          <span class="w-10 text-right">{mic ? "live" : format_time(current_time)}</span>
          <Slider
            aria-label="Position"
            min={0}
            max={duration || 0}
            step="any"
            value={current_time}
            disabled={mic || !duration}
            size="sm"
            class="flex-1"
            oninput={seek}
          />
          <span class="w-10">{mic ? "" : format_time(duration)}</span>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <IconButton label={paused ? "Play (Space)" : "Pause (Space)"} variant={paused ? "primary" : "secondary"} disabled={mic} onclick={toggle_play}>
            {#if paused}<PlayIcon weight="fill" />{:else}<PauseIcon weight="fill" />{/if}
          </IconButton>

          <label class="flex min-w-32 flex-1 items-center gap-2 text-ui text-foreground/80">
            <span class="sr-only">Volume</span>
            {#if volume.value === 0}<SpeakerXIcon class="size-4 shrink-0" weight="bold" />{:else}<SpeakerHighIcon class="size-4 shrink-0" weight="bold" />{/if}
            <Slider min={0} max={1} step={0.01} bind:value={volume.value} size="sm" class="flex-1" />
          </label>

          <label class="flex min-w-32 flex-1 items-center gap-2 text-ui text-foreground/80" title="How slowly the picture reacts to changes">
            Smoothing
            <Slider min={0} max={1} step={0.05} bind:value={smoothing.value} size="sm" class="flex-1" />
          </label>

          <label class="flex min-w-32 flex-1 items-center gap-2 text-ui text-foreground/80" title="How strongly quiet sound moves the picture">
            Sensitivity
            <Slider min={0.5} max={3} step={0.1} bind:value={sensitivity.value} size="sm" class="flex-1" />
          </label>
        </div>
      </div>

      <StatusBar>
        {#if mic}
          <span>Microphone input</span>
        {:else if file}
          <span class="truncate">{file.type || "unknown type"}</span>
          <span>{format_bytes(file.size)}</span>
        {/if}
        <span class="ml-auto hidden @sm:block">{MODE_OPTIONS.find((option) => option.value === mode.value)?.label}</span>
      </StatusBar>
    </div>
  {/if}

  {#if dragging}
    <div class="pointer-events-none absolute inset-2 grid place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/60 animate-pop-in">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">Drop to play</span>
    </div>
  {/if}
</div>

<style>
  .stage {
    background: var(--background-darker);
  }
</style>
