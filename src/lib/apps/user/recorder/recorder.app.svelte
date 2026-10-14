<script lang="ts">
  import kernel, { NotificationType, Platform, type AppsService, type FilesService, type NotificationsService } from "$lib/core/api";
  import type { FileSystemFileItem } from "$lib/core/api/services/files/type";
  import { Badge, Button, EmptyState, IconButton, Section, Segmented, Select, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_time } from "$lib/core/games";
  import { cn, format_bytes, format_datetime } from "$lib/core/utils";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    Camera as CameraIcon,
    CameraRotate as CameraRotateIcon,
    CameraSlash as CameraSlashIcon,
    FileAudio as FileAudioIcon,
    FileImage as FileImageIcon,
    FileVideo as FileVideoIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    Microphone as MicrophoneIcon,
    MicrophoneSlash as MicrophoneSlashIcon,
    Monitor as MonitorIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Record as RecordIcon,
    Stop as StopIcon,
    Trash as TrashIcon,
    VideoCamera as VideoCameraIcon,
    Waveform as WaveformIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { z } from "zod";
  import { error_copy, kind_of_file, PhotoFormat, RECORDINGS_DIR, Source, TakeKind } from "./media";
  import type { RecorderProps } from "./props";
  import { list_recordings } from "./recordings";
  import RecorderMeter from "./recorder-meter.svelte";
  import { Phase, RecorderSession } from "./session.svelte";

  const { source: initial_source }: RecorderProps = $props();
  const { window: win, storage, app_id } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const can_share_screen = kernel.platform !== Platform.MOBILE && typeof navigator.mediaDevices?.getDisplayMedia === "function";
  const SOURCES: { value: Source; label: string; icon: IconComponent }[] = [
    { value: Source.MIC, label: "Mic", icon: MicrophoneIcon },
    ...(can_share_screen ? [{ value: Source.SCREEN, label: "Screen", icon: MonitorIcon }] : []),
    { value: Source.CAMERA, label: "Camera", icon: VideoCameraIcon },
  ];
  const PHOTO_FORMATS = [
    { value: PhotoFormat.JPEG, label: "JPEG" },
    { value: PhotoFormat.PNG, label: "PNG" },
  ];
  const KIND_ICON: Record<TakeKind, IconComponent> = { audio: FileAudioIcon, video: FileVideoIcon, photo: FileImageIcon };
  const ERROR_ICON: Record<Source, IconComponent> = { mic: MicrophoneSlashIcon, screen: MonitorIcon, camera: CameraSlashIcon };

  // The prop only seeds a new window; a restored one keeps the source the user switched to.
  const stored_source = storage.window<Source>("source", untrack(() => initial_source) ?? Source.MIC, z.enum([Source.MIC, Source.SCREEN, Source.CAMERA]));
  if (!can_share_screen && stored_source.value === Source.SCREEN) stored_source.value = Source.MIC;
  const mic_mix = storage.persisted("screen_mic", true, z.boolean());
  const photo_format = storage.persisted<PhotoFormat>("photo_format", PhotoFormat.JPEG, z.enum([PhotoFormat.JPEG, PhotoFormat.PNG]));

  const session = new RecorderSession();
  $effect(() => () => session.dispose());

  let source = $state(stored_source.value);
  $effect(() => {
    if (source === stored_source.value) return;
    stored_source.value = source;
    session.leave_source();
  });

  const recording = $derived(session.phase === Phase.RECORDING);
  const live = $derived(session.phase === Phase.RECORDING || session.phase === Phase.PAUSED);
  const locked = $derived(session.busy || session.take !== null);
  const visible = $derived(win.is_visible);
  const visual = $derived(session.phase !== Phase.ERROR && (session.take ? session.take.kind !== TakeKind.AUDIO : source !== Source.MIC));

  $effect(() => session.sync_camera(source === Source.CAMERA && session.phase === Phase.IDLE && visible));

  let now = $state(Date.now());
  $effect(() => {
    if (!recording || !visible) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });
  const elapsed = $derived(session.take ? session.take.duration : session.elapsed(now));

  let camera_video: HTMLVideoElement | null = $state(null);

  const show_stream = (stream: MediaStream | null): Attachment<HTMLVideoElement> => (video) => {
    video.srcObject = stream;
    if (stream) video.play().catch((reason) => console.warn("[Recorder] preview didn't play", reason));
    return () => {
      video.srcObject = null;
    };
  };

  /** MediaRecorder's WebM has no duration in its header, so the player shows no length until it has seeked to the end once. */
  const fix_duration: Attachment<HTMLMediaElement> = (media) => {
    const on_metadata = () => {
      if (media.duration !== Infinity) return;
      media.addEventListener("durationchange", () => (media.currentTime = 0), { once: true });
      media.currentTime = Number.MAX_SAFE_INTEGER;
    };
    media.addEventListener("loadedmetadata", on_metadata);
    return () => media.removeEventListener("loadedmetadata", on_metadata);
  };

  function report(title: string, reason: unknown) {
    console.error(`[Recorder] ${title}`, reason);
    notifications.notify(app_id, { type: NotificationType.ERROR, title, message: reason instanceof Error ? reason.message : String(reason) });
  }

  async function start() {
    await session.start(source, { mic_mix: mic_mix.value });
  }

  async function save(): Promise<boolean> {
    try {
      const path = await session.save(files);
      if (!path) return false;
      notifications.notify(app_id, {
        type: NotificationType.INFO,
        title: "Saved to Recordings",
        message: path.slice(RECORDINGS_DIR.length + 1),
        actions: [{ label: "Open", on_click: () => void apps.open(path) }],
      });
      return true;
    } catch (reason) {
      report("Couldn't save the recording", reason);
      return false;
    }
  }

  async function discard() {
    const take = session.take;
    if (!take) return;
    const what = take.kind === TakeKind.PHOTO ? "photo" : "recording";
    const confirmed = await win.confirm(`Discard this ${what}?`, { detail: "It hasn't been saved and can't be brought back.", confirm_label: "Discard", danger: true });
    if (confirmed && session.take === take) session.discard();
  }

  $effect(() =>
    win.set_dirty(session.unsaved, {
      save: async () => {
        if (session.busy) await session.stop();
        return save();
      },
    })
  );
  $effect(() => win.set_title(session.take?.name ?? (live ? "Recording" : null)));

  let recent = $state.raw<FileSystemFileItem[] | null>(null);
  $effect(() => {
    files.revision(RECORDINGS_DIR);
    files.revision("/home");
    let current = true;
    void (async () => {
      try {
        const media = await list_recordings(files);
        if (current) recent = media;
      } catch (reason) {
        console.warn("[Recorder] couldn't list recordings", reason);
        if (current) recent = [];
      }
    })();
    return () => {
      current = false;
    };
  });

  const PHASE_LABEL: Record<Phase, string> = {
    idle: "Ready",
    starting: "Starting",
    recording: "Recording",
    paused: "Paused",
    stopping: "Finishing",
    review: "Not saved",
    error: "Not available",
  };
</script>

{#snippet record_controls()}
  {#if live}
    {#if session.phase === Phase.PAUSED}
      <Button size="lg" onclick={() => session.resume()}><PlayIcon weight="fill" /> Resume</Button>
    {:else}
      <Button size="lg" onclick={() => session.pause()}><PauseIcon weight="fill" /> Pause</Button>
    {/if}
    <Button size="lg" variant="primary" onclick={() => session.stop()}><StopIcon weight="fill" /> Stop</Button>
  {:else if session.phase === Phase.STARTING || session.phase === Phase.STOPPING}
    <Button size="lg" variant="primary" disabled><Spinner label={PHASE_LABEL[session.phase]} /> {PHASE_LABEL[session.phase]}…</Button>
  {:else if source === Source.CAMERA}
    <Button size="lg" disabled={!session.preview} onclick={() => camera_video && session.photo(camera_video, photo_format.value)}>
      <CameraIcon weight="bold" /> Take photo
    </Button>
    <Button size="lg" variant="primary" disabled={!session.preview} onclick={start}><RecordIcon weight="fill" /> Record video</Button>
  {:else}
    <Button size="lg" variant="primary" onclick={start}><RecordIcon weight="fill" /> {source === Source.SCREEN ? "Share and record" : "Record"}</Button>
  {/if}
{/snippet}

{#snippet timer(overlay: boolean)}
  <div class={cn("flex items-center gap-2 font-mono tabular-nums", overlay ? "rounded-md bg-background/80 px-2 py-1 text-ui backdrop-blur-sm" : "text-3xl font-medium")}>
    {#if live}
      <span class={cn("size-2.5 shrink-0 rounded-full", recording ? "animate-pulse bg-error" : "bg-foreground/45")}></span>
    {/if}
    <span>{format_time(elapsed)}</span>
  </div>
{/snippet}

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    <fieldset disabled={locked} class="min-w-0 disabled:opacity-50">
      <legend class="sr-only">Source</legend>
      <Segmented size="sm" label="Source" options={SOURCES} bind:value={source} />
    </fieldset>
    <div class="flex-1"></div>
    {#if source === Source.SCREEN}
      <label class="flex h-7 items-center gap-2 px-1 text-ui text-foreground/80 pointer-coarse:h-9">
        <Switch bind:checked={mic_mix.value} disabled={locked} />
        Include microphone
      </label>
    {:else if source === Source.CAMERA}
      {#if session.cameras.length > 1}
        <IconButton label="Switch camera" size="sm" disabled={locked} onclick={() => session.switch_camera()}><CameraRotateIcon weight="bold" /></IconButton>
      {/if}
      <Select size="sm" aria-label="Photo format" class="w-24" options={PHOTO_FORMATS} bind:value={photo_format.value} />
    {/if}
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto grid max-w-5xl gap-6 p-4 @md:p-6 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div class="flex min-w-0 flex-col gap-4">
        <div class={cn("relative grid min-h-64 place-items-center overflow-hidden rounded-xl", visual ? "aspect-video bg-background-darker" : "bg-background-light")}>
          {#if session.phase === Phase.ERROR && session.error}
            {@const copy = error_copy(session.error.kind, session.error.source)}
            <EmptyState icon={ERROR_ICON[session.error.source]} tone="error" title={copy.title} description={copy.description}>
              {#snippet actions()}
                <Button onclick={() => session.retry()}><ArrowClockwiseIcon weight="bold" /> Try again</Button>
              {/snippet}
            </EmptyState>
          {:else if session.take}
            {@const take = session.take}
            {#if take.kind === TakeKind.PHOTO}
              <img src={take.url} alt="Just taken" class="absolute inset-0 size-full object-contain" />
            {:else if take.kind === TakeKind.VIDEO}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video src={take.url} controls playsinline class="absolute inset-0 size-full object-contain" {@attach fix_duration}></video>
            {:else}
              <div class="flex w-full flex-col items-center gap-4 p-6">
                <div class="grid size-14 place-items-center rounded-xl bg-primary/15 text-primary"><WaveformIcon class="size-7" weight="duotone" /></div>
                <audio src={take.url} controls class="w-full max-w-md" {@attach fix_duration}></audio>
              </div>
            {/if}
          {:else if source === Source.MIC}
            <div class="flex w-full flex-col items-center gap-4 p-6">
              <RecorderMeter analyser={session.analyser} running={recording && visible} />
              {@render timer(false)}
              <p class="text-ui text-foreground/65" aria-live="polite">
                {#if recording}Recording from the microphone{:else if session.phase === Phase.PAUSED}Paused{:else}Press Record to start{/if}
              </p>
            </div>
          {:else if session.preview}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              muted
              playsinline
              class={cn("absolute inset-0 size-full object-contain", source === Source.CAMERA && session.facing_user && "-scale-x-100")}
              bind:this={camera_video}
              {@attach show_stream(session.preview)}
            ></video>
            {#if live}
              <div class="absolute top-3 left-3">{@render timer(true)}</div>
              {#if session.silent}
                <div class="absolute top-3 right-3"><Badge tone="warning"><MicrophoneSlashIcon weight="bold" /> No sound</Badge></div>
              {/if}
            {/if}
          {:else if source === Source.SCREEN}
            <EmptyState icon={MonitorIcon} title="Record a window, a tab or the whole screen" description="The browser asks what to share when you start." />
          {:else}
            <Spinner label="Starting the camera" />
          {/if}
        </div>

        <div class="flex flex-wrap items-center justify-center gap-2">
          {#if session.take}
            <Button size="lg" onclick={discard}><TrashIcon weight="bold" /> Discard</Button>
            <Button size="lg" variant="primary" onclick={save}><FloppyDiskIcon weight="bold" /> Save</Button>
          {:else if session.phase !== Phase.ERROR}
            {@render record_controls()}
          {/if}
        </div>
      </div>

      <Section title="Recent" description="Saved in Recordings.">
        {#snippet actions()}
          <IconButton label="Open the Recordings folder" size="sm" onclick={() => apps.launch("file-explorer", { path: RECORDINGS_DIR })}>
            <FolderOpenIcon weight="bold" />
          </IconButton>
        {/snippet}
        {#if recent === null}
          <div class="grid h-16 place-items-center"><Spinner label="Reading recordings" /></div>
        {:else if recent.length === 0}
          <p class="px-2 py-3 text-ui text-foreground/65">Nothing saved yet.</p>
        {:else}
          <ul class="flex max-h-96 flex-col overflow-auto p-1">
            {#each recent as item (item.name)}
              {@const Icon = KIND_ICON[kind_of_file(item.name)]}
              <li>
                <button
                  type="button"
                  class="flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cottontail focus-visible:ring-inset"
                  onclick={(event) => void apps.open(`${RECORDINGS_DIR}/${item.name}`, { anchor: { x: event.clientX, y: event.clientY } })}
                >
                  <Icon class="size-5 shrink-0 text-foreground/70" weight="duotone" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-ui">{item.name}</span>
                    <span class="block truncate font-mono text-2xs text-foreground/65 tabular-nums">
                      {item.last_modified ? format_datetime(item.last_modified) : ""} · {format_bytes(item.size ?? 0)}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>
    </div>
  </div>

  <StatusBar>
    <span>{PHASE_LABEL[session.phase]}</span>
    {#if live || (session.take && session.take.kind !== TakeKind.PHOTO)}<span>{format_time(elapsed)}</span>{/if}
    {#if session.take}
      <span class="hidden @sm:inline">{session.take.blob.type || "unknown type"}</span>
      <span>{format_bytes(session.take.blob.size)}</span>
    {/if}
    <span class="ml-auto hidden @md:inline">{RECORDINGS_DIR}</span>
  </StatusBar>
</div>
