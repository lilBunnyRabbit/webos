import type { FilesService } from "$lib/core/api";
import {
  CaptureError,
  classify_error,
  clock_elapsed,
  clock_pause,
  clock_resume,
  clock_start,
  pick_mime,
  RECORDINGS_DIR,
  Source,
  take_name,
  TakeKind,
  type Clock,
  type PhotoFormat,
} from "./media";

export const Phase = {
  IDLE: "idle",
  STARTING: "starting",
  RECORDING: "recording",
  PAUSED: "paused",
  STOPPING: "stopping",
  REVIEW: "review",
  ERROR: "error",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export interface Take {
  blob: Blob;
  url: string;
  kind: TakeKind;
  source: Source;
  name: string;
  duration: number;
}

export interface SessionError {
  kind: CaptureError;
  source: Source;
  message: string;
}

const stop_tracks = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

export class RecorderSession {
  phase = $state<Phase>(Phase.IDLE);
  error = $state.raw<SessionError | null>(null);
  take = $state.raw<Take | null>(null);
  clock = $state.raw<Clock | null>(null);
  preview = $state.raw<MediaStream | null>(null);
  analyser = $state.raw<AnalyserNode | null>(null);
  cameras = $state.raw<MediaDeviceInfo[]>([]);
  camera_id = $state<string | null>(null);
  /** A webcam that reports no facing mode faces the user, so its preview mirrors too. */
  facing_user = $state(true);
  silent = $state(false);

  private camera: MediaStream | null = null;
  private camera_opening: Promise<void> | null = null;
  private captured: MediaStream[] = [];
  private audio_context: AudioContext | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private source: Source = Source.MIC;
  private stopped: (() => void) | null = null;
  private disposed = false;

  get busy(): boolean {
    return this.phase === Phase.STARTING || this.phase === Phase.RECORDING || this.phase === Phase.PAUSED || this.phase === Phase.STOPPING;
  }

  get unsaved(): boolean {
    return this.busy || this.take !== null;
  }

  elapsed(now: number): number {
    return this.clock ? clock_elapsed(this.clock, now) : 0;
  }

  /** Keeps the camera preview open only while it's wanted; a recording is never cut by this. */
  sync_camera(wanted: boolean): void {
    if (wanted) void this.open_camera();
    else if (!this.busy && this.camera) this.close_camera();
  }

  async switch_camera(): Promise<void> {
    if (this.busy || this.cameras.length < 2) return;
    const index = this.cameras.findIndex((device) => device.deviceId === this.camera_id);
    this.camera_id = this.cameras[(index + 1) % this.cameras.length].deviceId;
    this.close_camera();
    await this.open_camera();
  }

  retry(): void {
    this.error = null;
    this.phase = Phase.IDLE;
  }

  async start(source: Source, options: { mic_mix: boolean }): Promise<void> {
    if (this.busy || this.take) return;
    this.source = source;
    this.error = null;
    this.silent = false;
    this.phase = Phase.STARTING;
    try {
      const stream = await this.capture(source, options.mic_mix);
      if (this.disposed) return this.release();
      this.begin(stream);
    } catch (reason) {
      this.release();
      if (this.disposed) return;
      this.fail(source, reason);
    }
  }

  pause(): void {
    if (this.phase !== Phase.RECORDING || !this.recorder) return;
    this.recorder.pause();
    this.clock = this.clock && clock_pause(this.clock, Date.now());
    this.phase = Phase.PAUSED;
  }

  resume(): void {
    if (this.phase !== Phase.PAUSED || !this.recorder) return;
    this.recorder.resume();
    this.clock = this.clock && clock_resume(this.clock, Date.now());
    this.phase = Phase.RECORDING;
  }

  stop(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder || (this.phase !== Phase.RECORDING && this.phase !== Phase.PAUSED)) return Promise.resolve();
    this.clock = this.clock && clock_pause(this.clock, Date.now());
    this.phase = Phase.STOPPING;
    return new Promise((resolve) => {
      this.stopped = resolve;
      recorder.stop();
    });
  }

  async photo(video: HTMLVideoElement, format: PhotoFormat): Promise<void> {
    if (this.busy || this.take || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format, 0.92));
    if (!blob || this.disposed) return;
    this.close_camera();
    this.set_take(blob, TakeKind.PHOTO, Source.CAMERA, 0);
  }

  discard(): void {
    if (this.take) URL.revokeObjectURL(this.take.url);
    this.take = null;
    this.clock = null;
    this.phase = Phase.IDLE;
  }

  async save(files: FilesService): Promise<string | null> {
    const take = this.take;
    if (!take) return null;
    const directory =
      (await files.get_directory(RECORDINGS_DIR)) ?? (await files.create_directory(await files.get_directory("/home"), "Recordings"));
    const handle = await files.create_file(directory, take.name, { content: take.blob });
    if (this.take === take) this.discard();
    return `${RECORDINGS_DIR}/${handle.name}`;
  }

  leave_source(): void {
    if (this.busy) return;
    this.release();
    if (this.phase === Phase.ERROR) this.retry();
  }

  dispose(): void {
    this.disposed = true;
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.release();
    if (this.take) URL.revokeObjectURL(this.take.url);
  }

  private async open_camera(): Promise<void> {
    if (this.camera || this.camera_opening || this.busy || this.take || this.phase === Phase.ERROR) return;
    this.camera_opening = this.acquire_camera()
      .then(
        () => {},
        (reason) => {
          if (!this.disposed) this.fail(Source.CAMERA, reason);
        }
      )
      .finally(() => (this.camera_opening = null));
    await this.camera_opening;
  }

  private async acquire_camera(): Promise<MediaStream> {
    const video: MediaTrackConstraints = this.camera_id ? { deviceId: { exact: this.camera_id } } : { facingMode: "user" };
    const stream = await navigator.mediaDevices.getUserMedia({ video });
    if (this.disposed) {
      stop_tracks(stream);
      return stream;
    }
    this.camera = stream;
    this.preview = stream;
    const settings = stream.getVideoTracks()[0]?.getSettings();
    this.camera_id = settings?.deviceId ?? this.camera_id;
    this.facing_user = settings?.facingMode !== "environment";
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.cameras = devices.filter((device) => device.kind === "videoinput" && device.deviceId);
    return stream;
  }

  private close_camera(): void {
    stop_tracks(this.camera);
    if (this.preview === this.camera) this.preview = null;
    this.camera = null;
  }

  private async capture(source: Source, mic_mix: boolean): Promise<MediaStream> {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") throw Object.assign(new Error("No MediaRecorder"), { name: "NotSupportedError" });

    if (source === Source.MIC) {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.captured.push(mic);
      return mic;
    }

    if (source === Source.SCREEN) {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      this.captured.push(display);
      this.preview = display;
      display.getVideoTracks()[0]?.addEventListener("ended", () => void this.stop());
      const mic = mic_mix ? await this.optional_mic() : null;
      return new MediaStream([...display.getVideoTracks(), ...this.mix([display, mic])]);
    }

    if (this.camera_opening) await this.camera_opening;
    const camera = this.camera ?? (await this.acquire_camera());
    this.captured.push(camera);
    this.camera = null;
    const mic = await this.optional_mic();
    return new MediaStream([...camera.getVideoTracks(), ...(mic?.getAudioTracks() ?? [])]);
  }

  /** A missing or blocked microphone records a silent video instead of failing it. */
  private async optional_mic(): Promise<MediaStream | null> {
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.captured.push(mic);
      return mic;
    } catch (reason) {
      console.warn("[Recorder] recording without the microphone", reason);
      this.silent = true;
      return null;
    }
  }

  /** Screen audio and the microphone are separate tracks, and MediaRecorder records only one: mix them. */
  private mix(streams: (MediaStream | null)[]): MediaStreamTrack[] {
    const sources = streams.filter((stream): stream is MediaStream => !!stream && stream.getAudioTracks().length > 0);
    if (sources.length < 2) return sources[0]?.getAudioTracks() ?? [];
    const context = this.context();
    const destination = context.createMediaStreamDestination();
    for (const stream of sources) context.createMediaStreamSource(stream).connect(destination);
    return destination.stream.getAudioTracks();
  }

  private context(): AudioContext {
    this.audio_context ??= new AudioContext();
    return this.audio_context;
  }

  private begin(stream: MediaStream): void {
    const has_video = stream.getVideoTracks().length > 0;
    const mime = pick_mime(has_video ? "video" : "audio", (type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    recorder.onstop = () => this.finish(recorder, has_video ? TakeKind.VIDEO : TakeKind.AUDIO);
    this.recorder = recorder;

    if (stream.getAudioTracks().length > 0) {
      const context = this.context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(analyser);
      this.analyser = analyser;
    }

    recorder.start(1000);
    this.clock = clock_start(Date.now());
    this.phase = Phase.RECORDING;
  }

  private finish(recorder: MediaRecorder, kind: TakeKind): void {
    const blob = new Blob(this.chunks, { type: recorder.mimeType.split(";")[0] || (kind === TakeKind.AUDIO ? "audio/webm" : "video/webm") });
    this.chunks = [];
    this.recorder = null;
    this.release();
    this.set_take(blob, kind, this.source, this.clock ? clock_elapsed(this.clock, Date.now()) : 0);
    this.stopped?.();
    this.stopped = null;
  }

  private set_take(blob: Blob, kind: TakeKind, source: Source, duration: number): void {
    this.take = { blob, url: URL.createObjectURL(blob), kind, source, duration, name: take_name(source, kind, blob.type, new Date()) };
    this.phase = Phase.REVIEW;
  }

  private fail(source: Source, reason: unknown): void {
    const kind = classify_error(reason);
    if (kind === CaptureError.OTHER) console.error("[Recorder] capture failed", reason);
    this.error = { kind, source, message: reason instanceof Error ? reason.message : String(reason) };
    this.phase = Phase.ERROR;
  }

  private release(): void {
    for (const stream of this.captured) stop_tracks(stream);
    this.captured = [];
    this.close_camera();
    this.preview = null;
    this.analyser = null;
    void this.audio_context?.close().catch(() => {});
    this.audio_context = null;
  }
}
