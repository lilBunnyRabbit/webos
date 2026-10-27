<script lang="ts">
  import kernel, { Platform, type BackgroundService, type FilesService, type NotificationsService } from "$lib/core/api";
  import { app_data_path, get_app_context, json_file } from "$lib/core/contexts/app";
  import { Button, EmptyState, Select, Slider } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { report_error } from "$kit/utils/report-error";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    GridFour as GridFourIcon,
    Moon as MoonIcon,
    Play as PlayIcon,
    VideoCamera as VideoCameraIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { day_of, MOTION_DIR, type MotionEvent } from "./events";
  import { as_live } from "./live.svelte";
  import { ALL_ZONES, APP_ID, DEFAULT_SETTINGS, KEEP_DAYS, SettingsSchema, watched_count } from "./settings";
  import { clip_path, day_path, list_days, read_day } from "./storage";
  import ZoneGrid from "./zone-grid.svelte";

  const { window: win } = get_app_context();
  const background = $derived(kernel.service<BackgroundService>("background"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const mobile = kernel.platform === Platform.MOBILE;
  const supported = typeof MediaStreamTrackProcessor !== "undefined";

  const settings = json_file(app_data_path(APP_ID, "settings.json"), DEFAULT_SETTINGS, SettingsSchema);
  $effect(() => () => settings.release());

  const job = $derived(background.get(APP_ID));
  const live = $derived(job?.here ? as_live(job.view) : null);
  const elsewhere = $derived(job !== undefined && !job.here);
  let busy = $state(false);
  let editing = $state(false);
  let dimmed = $state(false);

  let days = $state<string[]>([]);
  let day = $state(day_of(Date.now()));
  let events = $state.raw<MotionEvent[]>([]);
  let playing = $state.raw<{ event: MotionEvent; url: string } | null>(null);

  $effect(() => {
    files.revision(MOTION_DIR);
    let stale = false;
    list_days()
      .then((found) => {
        if (stale) return;
        const today = day_of(Date.now());
        days = found.includes(today) ? found : [...found, today];
      })
      .catch((error: unknown) => report_error(APP_ID, "Couldn't read the clips", error));
    return () => (stale = true);
  });

  $effect(() => {
    files.revision(day_path(day));
    void live?.saved;
    let stale = false;
    read_day(day)
      .then((found) => {
        if (!stale) events = found;
      })
      .catch((error: unknown) => report_error(APP_ID, "Couldn't read the day's events", error));
    return () => (stale = true);
  });

  const day_options = $derived(
    [...days].reverse().map((value) => ({
      value,
      label: value === day_of(Date.now()) ? "Today" : new Date(`${value}T12:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }),
    }))
  );
  const newest_first = $derived([...events].reverse());
  const day_start = $derived(new Date(`${day}T00:00`).getTime());

  const time_of = (wall: number) => new Date(wall).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const seconds = (event: MotionEvent) => Math.max(1, Math.round((event.end - event.at) / 1000));

  async function arm() {
    busy = true;
    void notifications.request_system();
    try {
      const here = await background.start(APP_ID);
      if (!here) notifications.notify(APP_ID, { title: "Already watching in another tab", message: "Disarm it there, or stop it from Activity Monitor." });
    } catch (error) {
      report_error(APP_ID, "Couldn't start watching", error);
    } finally {
      busy = false;
    }
  }

  async function disarm() {
    busy = true;
    dimmed = false;
    try {
      await background.stop(APP_ID);
    } catch (error) {
      report_error(APP_ID, "Couldn't stop watching", error);
    } finally {
      busy = false;
    }
  }

  async function play(event: MotionEvent) {
    try {
      const file = await files.get_file(clip_path(day, event.clip));
      if (!file) throw new Error(`${event.clip} is gone`);
      close_player();
      playing = { event, url: URL.createObjectURL(file) };
    } catch (error) {
      report_error(APP_ID, "Couldn't play the clip", error);
    }
  }

  function close_player() {
    if (playing) URL.revokeObjectURL(playing.url);
    playing = null;
  }
  $effect(() => () => close_player());

  $effect(() => {
    if (!playing && !dimmed && !editing) return;
    return win.on_back(() => {
      if (playing) close_player();
      else if (dimmed) dimmed = false;
      else editing = false;
      return true;
    });
  });

  // A phone stops the camera with the screen: keep it on while this window watches.
  $effect(() => {
    if (!mobile || !live || !win.is_visible) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (!alive) return void sentinel.release();
        lock = sentinel;
        sentinel.addEventListener("release", () => (lock = null));
      } catch {
        lock = null;
      }
    };
    document.addEventListener("visibilitychange", acquire);
    void acquire();
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  });

  const show_stream = (stream: MediaStream | null) => (video: HTMLVideoElement) => {
    video.srcObject = stream;
    return () => (video.srcObject = null);
  };
</script>

<div class="@container flex h-full min-h-0 flex-col bg-background">
  {#if !supported}
    <EmptyState
      class="m-auto"
      icon={VideoCameraIcon}
      title="Needs Chrome"
      description="Motion Watch reads camera frames off the page, which only Chrome and Edge can do so far."
    />
  {:else}
    <div class="flex min-h-0 flex-1 flex-col @2xl:flex-row">
      <section class="relative flex min-h-0 min-w-0 shrink-0 items-center justify-center bg-background-darker p-2 @2xl:flex-1 @2xl:shrink @2xl:p-4" aria-label="Camera">
        <div class="relative aspect-[4/3] max-h-full w-full max-w-full overflow-hidden rounded-xl bg-background-darkest @2xl:w-auto @2xl:h-full">
          {#if playing}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video src={playing.url} controls autoplay playsinline class="size-full object-contain"></video>
            <div class="absolute top-2 right-2 left-2 flex items-center gap-2">
              <span class="rounded-md bg-background/80 px-2 py-1 font-mono text-2xs backdrop-blur">{time_of(playing.event.at)} · {seconds(playing.event)} s</span>
              <Button size="sm" class="ml-auto" onclick={close_player}><XIcon weight="bold" />Live</Button>
            </div>
          {:else if live?.stream}
            <video {@attach show_stream(live.stream)} autoplay muted playsinline class="size-full object-cover"></video>
            <ZoneGrid zones={settings.value.zones} {editing} onchange={(zones) => (settings.value.zones = zones)} />
            <div class="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-2xs font-medium backdrop-blur">
              <span class={cn("size-2 rounded-full", live.recording ? "animate-pulse bg-error" : "bg-success")}></span>
              {live.recording ? "Recording" : live.lights ? "Light changed, ignored" : "Watching"}
            </div>
          {:else}
            <div class="absolute inset-0 grid place-items-center p-4 text-center">
              <div class="flex flex-col items-center gap-2 text-foreground/65">
                <VideoCameraIcon class="size-10" weight="duotone" />
                <p class="text-ui">{elsewhere ? "Watching in another tab" : job ? "Starting the camera…" : "Disarmed"}</p>
                {#if elsewhere}<p class="text-2xs">{job?.status}</p>{/if}
              </div>
            </div>
            <ZoneGrid zones={settings.value.zones} {editing} onchange={(zones) => (settings.value.zones = zones)} />
          {/if}
          {#if live && !playing}
            <div class="absolute right-0 bottom-0 left-0 h-1.5 bg-background/60" role="meter" aria-label="Motion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(live.level * 100)}>
              <div class={cn("h-full transition-[width] duration-150", live.motion ? "bg-primary" : "bg-foreground/60")} style:width="{Math.min(100, live.level * 400)}%"></div>
            </div>
          {/if}
        </div>
      </section>

      <aside class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-t-2xl bg-background-light p-4 @2xl:w-80 @2xl:flex-none @2xl:rounded-none" aria-label="Controls">
        <div class="flex items-center gap-2">
          {#if job}
            <Button size="lg" class="flex-1" disabled={busy} onclick={disarm}>Disarm</Button>
            {#if mobile && live}
              <Button size="lg" variant="quiet" onclick={() => (dimmed = true)}><MoonIcon />Dim</Button>
            {/if}
          {:else}
            <Button size="lg" variant="primary" class="flex-1" disabled={busy} onclick={arm}><VideoCameraIcon />Arm</Button>
          {/if}
        </div>
        {#if live}
          <p class="-mt-2 text-2xs text-foreground/65">
            {live.saved} {live.saved === 1 ? "clip" : "clips"} since armed{live.last_motion ? ` · last motion ${time_of(live.last_motion)}` : ""}. Closing the window keeps it watching.
          </p>
        {/if}

        <label class="flex flex-col gap-1">
          <span class="flex justify-between text-ui"><span>Sensitivity</span><span class="font-mono text-2xs text-foreground/65">{settings.value.sensitivity}</span></span>
          <Slider min={0} max={100} step={5} bind:value={settings.value.sensitivity} aria-label="Sensitivity" />
        </label>

        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" pressed={editing} onclick={() => (editing = !editing)}><GridFourIcon />{editing ? "Done" : "Zones"}</Button>
          <span class="text-2xs text-foreground/65">{watched_count(settings.value.zones)} of {settings.value.zones.length} cells watched</span>
          {#if settings.value.zones !== ALL_ZONES}
            <Button size="sm" variant="quiet" onclick={() => (settings.value.zones = ALL_ZONES)}><ArrowCounterClockwiseIcon />Watch all</Button>
          {/if}
        </div>
        {#if editing}<p class="-mt-2 text-2xs text-foreground/65">Drag across the picture to switch cells off or on. Ignored cells are dark.</p>{/if}

        <label class="flex items-center justify-between gap-2 text-ui">
          <span>Keep clips for</span>
          <Select
            size="sm"
            class="w-28"
            value={String(settings.value.keep_days)}
            options={KEEP_DAYS.map((days) => ({ value: String(days), label: days === 1 ? "1 day" : `${days} days` }))}
            onchange={(event) => (settings.value.keep_days = Number(event.currentTarget.value))}
          />
        </label>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-ui font-semibold">Events</h2>
            <Select size="sm" class="w-36" bind:value={day} options={day_options} aria-label="Day" />
          </div>
          <div class="relative h-8 rounded-md bg-background-darker" aria-label="Day timeline">
            {#each [6, 12, 18] as hour (hour)}
              <span class="absolute top-0 bottom-0 w-px bg-foreground/12" style:left="{(hour / 24) * 100}%"></span>
            {/each}
            {#each events as event (event.at)}
              <button
                class="absolute top-1 bottom-1 min-w-1.5 rounded-sm bg-primary hover:opacity-85"
                style:left="{((event.at - day_start) / 86_400_000) * 100}%"
                style:width="{((event.end - event.at) / 86_400_000) * 100}%"
                aria-label="Play {time_of(event.at)}"
                title={time_of(event.at)}
                onclick={() => play(event)}
              ></button>
            {/each}
          </div>
          <div class="flex justify-between font-mono text-2xs text-foreground/65"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>

          {#if newest_first.length === 0}
            <p class="py-4 text-center text-2xs text-foreground/65">Nothing moved{day === day_of(Date.now()) ? " yet today" : " that day"}.</p>
          {:else}
            <ul class="flex flex-col">
              {#each newest_first as event (event.at)}
                <li>
                  <button
                    class={cn(
                      "flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-ui hover:bg-foreground/8",
                      playing?.event === event && "bg-primary/12"
                    )}
                    onclick={() => play(event)}
                  >
                    <PlayIcon class="size-4 shrink-0 text-foreground/65" weight="fill" />
                    <span class="font-mono tabular-nums">{time_of(event.at)}</span>
                    <span class="text-2xs text-foreground/65">{seconds(event)} s</span>
                    <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{Math.round(event.peak * 100)}%</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        {#if mobile}
          <p class="text-2xs text-foreground/65">
            Phones stop the camera when the screen turns off or the browser goes to the background. Leave Motion Watch open on a charger and use Dim.
          </p>
        {/if}
      </aside>
    </div>
  {/if}

  {#if dimmed}
    <button class="absolute inset-0 z-20 grid place-items-center bg-background-darkest text-2xs text-foreground/40" onclick={() => (dimmed = false)}>
      Watching · tap to wake
    </button>
  {/if}
</div>
