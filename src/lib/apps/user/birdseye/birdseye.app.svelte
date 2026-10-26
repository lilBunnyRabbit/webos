<script lang="ts">
  import kernel, { type AppsService, type FilesService, type TaskJob } from "$lib/core/api";
  import { base_name, parent_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, IconButton, Segmented, Select, Slider, Spinner, StatusBar, Switch, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message, format_bytes } from "$lib/core/utils";
  import type { Bounds } from "$lib/core/utils/type";
  import { CropFrame } from "$kit/components/crop-frame";
  import { has_files } from "$kit/utils/image";
  import { paste_files } from "$kit/utils/paste";
  import { probe_video, type VideoInfo } from "$kit/utils/video/capture";
  import { format_time } from "$kit/utils/video/plan";
  import { VIDEO_ACCEPT, is_video_name } from "$kit/utils/video/files";
  import {
    CaretLeft as CaretLeftIcon,
    CaretRight as CaretRightIcon,
    Crosshair as CrosshairIcon,
    FloppyDisk as FloppyDiskIcon,
    FolderOpen as FolderOpenIcon,
    FrameCorners as FrameCornersIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    SkipForward as SkipForwardIcon,
    Warning as WarningIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, untrack } from "svelte";
  import { export_locked, run_track, type ExportResult } from "./jobs";
  import { build_path, FrameStatus, next_lost, path_at, sample_at, splice_track, status_of, status_runs } from "./path";
  import { centre_camera, draw_locked, EdgeFill, read_token, THEME_COLORS, ZOOM, type ThemeColor } from "./render";
  import Timeline from "./timeline.svelte";
  import type { TrackPoint } from "./tracker";

  /** Videos don't say their frame rate, so a step is one 30 fps frame. */
  const STEP = 1 / 30;
  const PREVIEW_MAX = 1280;
  const MIN_BOX = 8;

  const { path }: { path?: string } = $props();
  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));

  interface Loaded extends VideoInfo {
    name: string;
    path: string | null;
    file: File;
    url: string;
  }

  const View = { SOURCE: "source", LOCKED: "locked" } as const;
  type View = (typeof View)[keyof typeof View];

  let loaded = $state.raw<Loaded | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let dragging = $state(false);
  let root = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();
  let canvas = $state<HTMLCanvasElement>();
  let stage = $state<HTMLElement>();

  let time = $state(0);
  let presented = $state(0);
  let playing = $state(false);
  let view = $state<View>(View.SOURCE);

  let boxing = $state(false);
  let box = $state<Bounds>({ x: 0, y: 0, width: 0, height: 0 });
  let first_area = $state<number | null>(null);
  let last_size = $state.raw<{ width: number; height: number } | null>(null);
  let track = $state.raw<TrackPoint[]>([]);

  let follow_size = $state(false);
  let zoom = $state<number>(ZOOM.DEFAULT);
  let fill = $state<EdgeFill>(EdgeFill.BLUR);
  let color = $state<ThemeColor>("background-darkest");

  let job = $state.raw<TaskJob | null>(null);
  let result = $state.raw<ExportResult | null>(null);

  const VIEWS = [
    { value: View.SOURCE, label: "Source" },
    { value: View.LOCKED, label: "Locked" },
  ];
  const FILLS = [
    { value: EdgeFill.BLUR, label: "Blur" },
    { value: EdgeFill.BLACK, label: "Black" },
    { value: EdgeFill.THEME, label: "Colour" },
  ];
  const COLOR_OPTIONS = THEME_COLORS.map((option) => ({ value: option.value as ThemeColor, label: option.label }));

  const running = $derived(job !== null && job.status === "running");
  const camera_path = $derived(track.length ? build_path(track) : null);
  const runs = $derived(status_runs(track));
  const lost_count = $derived(track.reduce((count, point) => count + (status_of(point) === FrameStatus.LOST ? 1 : 0), 0));
  const shape_count = $derived(track.reduce((count, point) => count + (point.shape ? 1 : 0), 0));
  const here = $derived(sample_at(track, time));
  const here_lost = $derived(here !== null && status_of(here) === FrameStatus.LOST);
  const preview = $derived.by(() => {
    if (!loaded) return { width: 1, height: 1 };
    const width = Math.min(loaded.width, PREVIEW_MAX);
    return { width, height: Math.max(1, Math.round((width * loaded.height) / loaded.width)) };
  });

  let request = 0;

  async function load(file: File, file_path: string | null) {
    const id = ++request;
    loading = true;
    error = null;
    try {
      const info = await probe_video(file);
      if (id !== request) return;
      release();
      loaded = { ...info, name: file.name, path: file_path, file, url: URL.createObjectURL(file) };
      time = 0;
      playing = false;
      track = [];
      first_area = null;
      last_size = null;
      boxing = false;
      view = View.SOURCE;
      result = null;
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

  onDestroy(release);

  const initial = untrack(() => path);
  if (initial) void load_path(initial);

  async function pick() {
    const start_path = loaded?.path ? parent_path(loaded.path) : undefined;
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
    if (!video || boxing || running) return;
    if (video.paused) {
      if (loaded && video.currentTime >= loaded.duration - STEP / 2) seek(0);
      void video.play();
    } else video.pause();
  }

  function step(delta: number) {
    video?.pause();
    seek(time + delta);
  }

  const EMPTY_BOX: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  const box_ready = $derived(box.width >= MIN_BOX && box.height >= MIN_BOX);

  function estimated_box(): Bounds {
    if (!loaded || !camera_path || !last_size) return EMPTY_BOX;
    const at = path_at(camera_path, time);
    const width = Math.min(last_size.width, loaded.width);
    const height = Math.min(last_size.height, loaded.height);
    return {
      x: Math.min(Math.max(0, at.cx - width / 2), loaded.width - width),
      y: Math.min(Math.max(0, at.cy - height / 2), loaded.height - height),
      width,
      height,
    };
  }

  function start_box() {
    if (!loaded || running) return;
    video?.pause();
    view = View.SOURCE;
    box = estimated_box();
    boxing = true;
  }

  async function start_track() {
    if (!loaded || running || !box_ready) return;
    video?.pause();
    const from = time;
    const fresh = !track.length || from <= track[0].t + 1e-6;
    const area = box.width * box.height;
    const reference = fresh ? area : (first_area ?? area);
    const outcome = await run_track({
      app_id,
      name: loaded.name,
      file: loaded.file,
      frame: loaded,
      duration: loaded.duration,
      box: { ...box },
      from,
      follow_size,
      scale: Math.sqrt(area / reference),
      on_job: (next) => (job = next),
    });
    if (!outcome.ok) return;
    track = splice_track(fresh ? [] : track, from, outcome.points);
    first_area = reference;
    last_size = { width: box.width, height: box.height };
    boxing = false;
    view = View.LOCKED;
    result = null;
  }

  function goto_lost() {
    const target = next_lost(track, time);
    if (target === null) return;
    video?.pause();
    seek(target);
  }

  async function save() {
    if (!loaded || running) return;
    video?.pause();
    result = null;
    result = await export_locked({
      app_id,
      name: loaded.name,
      path: loaded.path,
      file: loaded.file,
      frame: loaded,
      duration: loaded.duration,
      camera: camera_path,
      settings: { zoom, follow_size, fill, color: read_token(color) },
      on_job: (next) => (job = next),
    });
  }

  const open_result = () => result && kernel.service<AppsService>("apps").open(result.path);
  const show_result = () => result && kernel.service<AppsService>("apps").launch("file-explorer", { path: parent_path(result.path) });

  function track_time(element: HTMLVideoElement) {
    let frame = 0;
    const tick = () => {
      time = element.currentTime;
      presented++;
      frame = element.requestVideoFrameCallback(tick);
    };
    frame = element.requestVideoFrameCallback(tick);
    const sync = () => {
      time = element.currentTime;
      presented++;
    };
    element.addEventListener("seeked", sync);
    element.addEventListener("loadeddata", sync);
    return () => {
      element.cancelVideoFrameCallback(frame);
      element.removeEventListener("seeked", sync);
      element.removeEventListener("loadeddata", sync);
    };
  }

  $effect(() => {
    void presented;
    if (view !== View.LOCKED || !canvas || !video || !loaded) return;
    const context = canvas.getContext("2d");
    if (!context || video.readyState < 2) return;
    const camera = camera_path ? path_at(camera_path, video.currentTime) : centre_camera(loaded);
    draw_locked(context, video, loaded, preview, camera, {
      zoom,
      follow_size,
      fill,
      color: fill === EdgeFill.THEME ? read_token(color) : "",
    });
  });

  let drawing: { pointer_id: number; x: number; y: number } | null = null;
  let drawing_now = $state(false);

  function to_source(event: PointerEvent): { x: number; y: number } {
    const rect = stage!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(0, ((event.clientX - rect.left) / rect.width) * loaded!.width), loaded!.width),
      y: Math.min(Math.max(0, ((event.clientY - rect.top) / rect.height) * loaded!.height), loaded!.height),
    };
  }

  function draw_start(event: PointerEvent) {
    if (!boxing || !loaded || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = to_source(event);
    drawing = { pointer_id: event.pointerId, ...point };
    drawing_now = true;
    box = { ...point, width: 0, height: 0 };
  }

  function draw_move(event: PointerEvent) {
    if (!drawing || event.pointerId !== drawing.pointer_id) return;
    const point = to_source(event);
    box = {
      x: Math.min(drawing.x, point.x),
      y: Math.min(drawing.y, point.y),
      width: Math.abs(point.x - drawing.x),
      height: Math.abs(point.y - drawing.y),
    };
  }

  function draw_end(event: PointerEvent) {
    if (drawing?.pointer_id !== event.pointerId) return;
    drawing = null;
    drawing_now = false;
    if (!box_ready) box = estimated_box();
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
      b: start_box,
      n: goto_lost,
      Enter: () => boxing && void start_track(),
      Escape: () => (boxing = false),
    };
    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    if ((event.key === " " || event.key === "Enter") && target.closest("button")) return;
    event.preventDefault();
    action();
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

{#snippet progress(title: string, current: TaskJob)}
  <div class="flex flex-col gap-1.5">
    {@render heading(title)}
    <div class="h-1.5 overflow-hidden rounded-full bg-foreground/12">
      <div class="h-full bg-primary transition-[width]" style:width="{Math.round(current.progress * 100)}%"></div>
    </div>
    <p class="px-0.5 font-mono text-2xs text-foreground/80 tabular-nums">{current.message ?? "Starting"}</p>
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
    <span class="min-w-16 flex-1 truncate px-1 text-ui font-medium">{loaded?.name ?? ""}</span>
    {#if loaded}
      {#if running}
        <Button size="sm" onclick={() => job?.cancel()}><XIcon weight="bold" /> Cancel</Button>
      {:else if boxing}
        <Button size="sm" variant="quiet" onclick={() => (boxing = false)}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!box_ready} onclick={start_track}><CrosshairIcon weight="bold" /> Track</Button>
      {:else}
        <Button size="sm" onclick={start_box} title="Draw a box around the subject on this frame (B)"><CrosshairIcon weight="bold" /> Box</Button>
        <Button variant="primary" size="sm" disabled={!track.length} onclick={save}><FloppyDiskIcon weight="bold" /> Save</Button>
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
      icon={FrameCornersIcon}
      title="No video open"
      description="Box a moving subject and Birdseye keeps it still in the middle while the world moves around it. Open a video, drop it here or paste it."
    >
      {#snippet actions()}<Button variant="primary" onclick={pick}><FolderOpenIcon weight="bold" /> Open a video…</Button>{/snippet}
    </EmptyState>
  {:else}
    <div class="grid min-h-0 grid-rows-[minmax(13rem,1fr)_minmax(0,17rem)] @2xl:grid-cols-[minmax(0,1fr)_17rem] @2xl:grid-rows-[minmax(0,1fr)]">
      <div class="stage grid min-h-0 grid-rows-[minmax(0,1fr)_auto_auto_auto] gap-1 p-2 @xl:p-4">
        <div class="grid min-h-0 place-items-center [container-type:size]">
          <div
            bind:this={stage}
            class="relative max-h-full max-w-full overflow-hidden rounded-xs bg-background-darkest"
            style:aspect-ratio="{loaded.width} / {loaded.height}"
            style:width="min(100cqw, calc(100cqh * {loaded.width / loaded.height}))"
          >
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={video}
              src={loaded.url}
              class="absolute inset-0 block size-full"
              playsinline
              preload="auto"
              onplay={() => (playing = true)}
              onpause={() => (playing = false)}
              onclick={toggle}
              {@attach track_time}
            ></video>
            {#if view === View.LOCKED}
              <canvas
                bind:this={canvas}
                width={preview.width}
                height={preview.height}
                class="absolute inset-0 block size-full"
                aria-label="The video, locked on the subject"
                onclick={toggle}
              ></canvas>
            {/if}
            {#if boxing}
              <div
                class="absolute inset-0 cursor-crosshair touch-none"
                role="presentation"
                onpointerdown={draw_start}
                onpointermove={draw_move}
                onlostpointercapture={draw_end}
              ></div>
              {#if box_ready || drawing_now}
                <CropFrame bind:rect={box} bounds={loaded} label="Subject" />
              {/if}
            {/if}
          </div>
        </div>
        <Timeline
          duration={loaded.duration}
          {time}
          {runs}
          step={STEP}
          disabled={running}
          onseek={(next) => {
            video?.pause();
            seek(next);
          }}
        />
        <div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
          <IconButton label="Previous frame (←)" size="sm" variant="quiet" disabled={running} onclick={() => step(-STEP)}><CaretLeftIcon weight="bold" /></IconButton>
          <IconButton label={playing ? "Pause (Space)" : "Play (Space)"} size="sm" disabled={running || boxing} onclick={toggle}>
            {#if playing}<PauseIcon weight="fill" />{:else}<PlayIcon weight="fill" />{/if}
          </IconButton>
          <IconButton label="Next frame (→)" size="sm" variant="quiet" disabled={running} onclick={() => step(STEP)}><CaretRightIcon weight="bold" /></IconButton>
          <span class="mx-1 font-mono text-2xs text-foreground/80 tabular-nums">{format_time(time)} / {format_time(loaded.duration)}</span>
          {#if lost_count}
            <Button size="sm" variant="quiet" title="Go to the next lost frame (N)" disabled={running} onclick={goto_lost}><SkipForwardIcon weight="bold" /> Next lost</Button>
          {/if}
        </div>
        <div class="min-h-5">
          {#if boxing}
            <p class="px-1 text-center text-2xs text-foreground/65">Drag over the subject to draw a box, then Track. It follows from this frame to the end.</p>
          {:else if here_lost && !running}
            <p class="flex items-center justify-center gap-1.5 px-1 text-center text-2xs text-error">
              <WarningIcon class="size-3.5 shrink-0" weight="bold" /> Lost here.
              <button type="button" class="underline underline-offset-2 hover:opacity-85" onclick={start_box}>Box it again</button>
            </p>
          {/if}
        </div>
      </div>

      <aside class="flex min-h-0 flex-col gap-4 overflow-auto border-t border-foreground/8 bg-background-light p-3 @2xl:border-t-0 @2xl:border-l">
        <div class="flex flex-col gap-2">
          {@render heading("Track")}
          {#if track.length}
            {@render row("Frames", String(track.length))}
            {@render row("Lost", String(lost_count))}
            {#if shape_count}{@render row("By shape", String(shape_count))}{/if}
          {:else}
            <p class="px-0.5 text-2xs text-foreground/65">Pause on a frame where the subject is clear, press Box and draw around it, then Track.</p>
          {/if}
          <label class="flex items-center justify-between gap-2 text-ui" title="Also follows the subject getting bigger or smaller, and zooms to hold its size. Applies to the next Track.">
            Follow size
            <Switch bind:checked={follow_size} disabled={running} />
          </label>
        </div>

        <div class="flex flex-col gap-2">
          {@render heading("View")}
          <Segmented label="View" options={VIEWS} bind:value={view} class="w-full *:flex-1" />
          <label class="flex items-center gap-2 text-ui">
            <span class="w-12 shrink-0">Zoom</span>
            <Slider size="sm" min={ZOOM.MIN} max={ZOOM.MAX} step={0.05} bind:value={zoom} class="min-w-0 flex-1" aria-label="Zoom" />
            <span class="w-10 text-right font-mono text-2xs text-foreground/80 tabular-nums">{zoom.toFixed(2)}×</span>
          </label>
          <div class="flex items-center justify-between gap-2 text-ui">
            Edges
            <Segmented size="sm" label="Edges" options={FILLS} bind:value={fill} />
          </div>
          {#if fill === EdgeFill.THEME}
            <label class="flex items-center justify-between gap-2 text-ui">
              Colour
              <Select size="sm" class="w-auto" options={COLOR_OPTIONS} bind:value={color} aria-label="Edge colour" />
            </label>
          {/if}
        </div>

        {#if running && job}
          {@render progress(job.title.startsWith("Tracking") ? "Tracking" : "Saving", job)}
        {/if}

        {#if result}
          <div class="flex flex-col gap-2" {@attach (node) => node.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
            {@render heading("Saved")}
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
      <span>{format_bytes(loaded.file.size)}</span>
      {#if error}<span class="truncate text-error">{error}</span>{/if}
      <span class="ml-auto hidden truncate @xl:inline">Space plays · ← → step a frame · B boxes · N next lost</span>
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
</style>
