import { untrack } from "svelte";
import kernel, { type AppsService, type BackgroundRun, type NotificationsService } from "$lib/core/api";
import { app_data_path, json_file } from "$lib/core/contexts/app";
import { report_error } from "$kit/utils/report-error";
import { LiveWatch } from "./live.svelte";
import { APP_ID, DEFAULT_SETTINGS, SettingsSchema, detect_config } from "./settings";
import { prune_days, save_clip } from "./storage";
import type { WatchApi, WatchEvent } from "./watch.worker";
import WatchWorker from "./watch.worker?worker";

const FINISH_MS = 4_000;

const ready = (file: { ready: boolean }, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const check = () => (signal.aborted ? reject(signal.reason) : file.ready ? resolve() : setTimeout(check, 20));
    check();
  });

/** Rejects as soon as `signal` aborts; a value that arrives after that goes to `discard` (a camera stream to stop). */
const abortable = <T>(promise: Promise<T>, signal: AbortSignal, discard: (value: T) => void = () => {}) =>
  new Promise<T>((resolve, reject) => {
    const on_abort = () => {
      promise.then(discard, () => {});
      reject(signal.reason);
    };
    if (signal.aborted) return on_abort();
    signal.addEventListener("abort", on_abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", on_abort));
  });

const stop_tracks = (stream: MediaStream | null | undefined) => {
  for (const track of stream?.getTracks() ?? []) track.stop();
};

const camera_constraints: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 15, max: 15 },
};

const run: BackgroundRun = async (context) => {
  const settings = json_file(app_data_path(APP_ID, "settings.json"), DEFAULT_SETTINGS, SettingsSchema);
  const live = new LiveWatch();
  const notifications = kernel.service<NotificationsService>("notifications");
  const { signal } = context;
  let stream: MediaStream | null = null;
  let stop_config: (() => void) | null = null;
  let saves: Promise<unknown> = Promise.resolve();
  context.share(live);

  const on_event = (event: WatchEvent) => {
    if (event.kind === "level") {
      live.level = event.level;
      live.motion = event.motion;
      live.lights = event.lights;
      if (live.recording !== event.recording) {
        live.recording = event.recording;
        context.status(event.recording ? "Recording" : "Watching");
      }
    } else if (event.kind === "motion") {
      live.last_motion = event.at;
      notifications.notify(APP_ID, {
        title: "Motion",
        message: `Seen at ${new Date(event.at).toLocaleTimeString([], { timeStyle: "short", hourCycle: "h23" })}. Recording a clip.`,
        system: true,
        actions: [{ label: "Open", on_click: () => kernel.service<AppsService>("apps").launch(APP_ID) }],
      });
    } else {
      saves = saves
        .then(() => save_clip(event.clip))
        .then((saved) => {
          live.saved++;
          live.last_saved = saved;
        })
        .catch((error: unknown) => report_error(APP_ID, "Couldn't save a motion clip", error));
    }
  };

  try {
    context.status("Starting the camera");
    if (typeof MediaStreamTrackProcessor === "undefined") throw new Error("This browser can't read camera frames off the page (Chrome only)");
    await ready(settings, signal);
    stream = await abortable(navigator.mediaDevices.getUserMedia({ video: camera_constraints, audio: false }), signal, stop_tracks);
    live.stream = stream;
    const [track] = stream.getVideoTracks();
    const processor = new MediaStreamTrackProcessor({ track });
    const worker = context.spawn<WatchApi, WatchEvent>(WatchWorker, { name: "Detector and encoder", on_event });
    void prune_days(settings.value.keep_days).catch((error: unknown) => console.warn("[motion-watch] Couldn't prune old days:", error));
    await abortable(context.resumable(), signal);

    stop_config = $effect.root(() => {
      $effect(() => {
        const config = detect_config(settings.value);
        untrack(() => void worker.call("configure", config).catch(() => {}));
      });
    });

    context.status("Watching");
    const watching = worker.call(
      "watch",
      { readable: processor.readable, config: detect_config(settings.value) },
      { transfer: [processor.readable] }
    );
    try {
      await abortable(watching, signal);
    } catch (error) {
      if (!signal.aborted) throw error;
      const timeout = new Promise((resolve) => setTimeout(resolve, FINISH_MS));
      await Promise.race([worker.call("finish", null).catch(() => {}), timeout]);
    }
  } finally {
    stop_config?.();
    stop_tracks(stream);
    live.stream = null;
    await saves;
    settings.release();
  }
};

export default run;
