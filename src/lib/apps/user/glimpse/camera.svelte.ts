import { untrack } from "svelte";
import { device_angle, photo_turn, type Turn } from "./orientation";

export const TorchMode = { OFF: "off", FLASH: "flash", ON: "on" } as const;
export type TorchMode = (typeof TorchMode)[keyof typeof TorchMode];

export const Facing = { USER: "user", ENVIRONMENT: "environment" } as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
}

interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: ZoomRange;
  focusMode?: string[];
}

interface CameraSettings extends MediaTrackSettings {
  zoom?: number;
}

interface CameraConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  zoom?: number;
  focusMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
}

interface SupportedCameraConstraints extends MediaTrackSupportedConstraints {
  pointsOfInterest?: boolean;
}

export interface CameraOptions {
  visible: () => boolean;
  onerror: (reason: unknown) => void;
}

// The torch needs a moment before the exposure settles on the lit scene.
const FLASH_SETTLE_MS = 350;

const stop_tracks = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Camera {
  stream = $state.raw<MediaStream | null>(null);
  starting = $state(false);
  facing = $state<Facing | null>(null);
  device_id = $state<string | null>(null);
  devices = $state.raw<MediaDeviceInfo[]>([]);
  has_torch = $state(false);
  zoom_range = $state.raw<ZoomRange | null>(null);
  has_focus = $state(false);
  zoom = $state(1);
  torch = $state<TorchMode>(TorchMode.OFF);
  turn = $state<Turn>(0);
  tilt = $state(0);

  private wanted = $state(false);
  private want_facing: Facing = Facing.ENVIRONMENT;
  private want_device: string | null = null;
  private destroyed = false;
  private zoom_frame = 0;
  private flashing = 0;

  constructor(private readonly options: CameraOptions) {
    $effect(() => {
      if (!this.wanted) return;
      if (!this.options.visible()) untrack(() => this.release());
      else if (!this.stream && !this.starting) untrack(() => void this.acquire());
    });
    $effect(() => () => {
      this.destroyed = true;
      cancelAnimationFrame(this.zoom_frame);
      this.release();
    });
    $effect(() => (this.stream ? this.hold_screen() : undefined));
    $effect(() => (this.stream ? this.follow_orientation() : undefined));
  }

  get active(): boolean {
    return this.wanted;
  }

  get mirrored(): boolean {
    // Laptop webcams report no facing; they face the user.
    return this.facing !== Facing.ENVIRONMENT;
  }

  get can_switch(): boolean {
    return this.devices.length > 1;
  }

  // Call straight from the tap: iOS spends the user activation on the first await.
  start(): Promise<void> {
    this.wanted = true;
    return this.acquire();
  }

  stop(): void {
    this.wanted = false;
    this.release();
  }

  switch_facing(): Promise<void> {
    this.want_facing = this.facing === Facing.USER ? Facing.ENVIRONMENT : Facing.USER;
    this.want_device = null;
    return this.restart();
  }

  pick_device(device_id: string): Promise<void> {
    this.want_device = device_id;
    return this.restart();
  }

  set_zoom(value: number): void {
    const range = this.zoom_range;
    if (!range) return;
    this.zoom = Math.min(range.max, Math.max(range.min, value));
    // Pinching fires faster than a camera reconfigures: one apply per frame, with the latest value.
    if (this.zoom_frame) return;
    this.zoom_frame = requestAnimationFrame(() => {
      this.zoom_frame = 0;
      void this.apply({ zoom: this.zoom });
    });
  }

  set_torch(mode: TorchMode): void {
    this.torch = mode;
    if (this.has_torch) void this.apply({ torch: mode === TorchMode.ON });
  }

  focus_at(x: number, y: number): void {
    if (!this.has_focus) return;
    const track = this.track();
    const modes = (track?.getCapabilities?.() as CameraCapabilities | undefined)?.focusMode ?? [];
    const focusMode = modes.includes("single-shot") ? "single-shot" : modes.includes("continuous") ? "continuous" : undefined;
    void this.apply({ pointsOfInterest: [{ x, y }], ...(focusMode ? { focusMode } : {}) });
  }

  async grab(video: HTMLVideoElement): Promise<ImageBitmap> {
    const flash = this.torch === TorchMode.FLASH && this.has_torch;
    if (flash) {
      // A burst shares one flash: the torch goes off only after the last shot in flight.
      if (this.flashing++ === 0) await this.apply({ torch: true });
      await wait(FLASH_SETTLE_MS);
    }
    try {
      return await createImageBitmap(video);
    } finally {
      if (flash && --this.flashing === 0) void this.apply({ torch: false });
    }
  }

  private track(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  private async apply(set: CameraConstraintSet): Promise<void> {
    try {
      await this.track()?.applyConstraints({ advanced: [set] });
    } catch (reason) {
      console.warn("[Glimpse] camera setting refused", set, reason);
    }
  }

  private async restart(): Promise<void> {
    // Phones can't open two cameras at once: the old one goes first.
    this.release();
    if (this.wanted) await this.acquire();
  }

  private async acquire(): Promise<void> {
    if (this.stream || this.starting) return;
    this.starting = true;
    try {
      const video: MediaTrackConstraints = {
        width: { ideal: 4096 },
        height: { ideal: 3072 },
        ...(this.want_device ? { deviceId: { exact: this.want_device } } : { facingMode: { ideal: this.want_facing } }),
      };
      const media = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (this.destroyed || !this.wanted || !this.options.visible()) return stop_tracks(media);
      this.stream = media;
      this.read_track();
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices.filter((device) => device.kind === "videoinput" && device.deviceId);
    } catch (reason) {
      this.wanted = false;
      // A picked lens that vanished (unplugged webcam) would fail every retry; Try again falls back to the facing.
      this.want_device = null;
      this.options.onerror(reason);
    } finally {
      this.starting = false;
    }
  }

  private read_track(): void {
    const track = this.track();
    if (!track) return;
    const settings = track.getSettings() as CameraSettings;
    const capabilities = (track.getCapabilities?.() ?? {}) as CameraCapabilities;
    const supported = navigator.mediaDevices.getSupportedConstraints() as SupportedCameraConstraints;
    this.facing = settings.facingMode === Facing.USER || settings.facingMode === Facing.ENVIRONMENT ? settings.facingMode : null;
    this.device_id = settings.deviceId ?? null;
    if (this.facing) this.want_facing = this.facing;
    this.has_torch = capabilities.torch === true;
    const zoom = capabilities.zoom;
    this.zoom_range = zoom && zoom.max > zoom.min ? { min: zoom.min, max: zoom.max, step: zoom.step || 0.1 } : null;
    this.zoom = settings.zoom ?? zoom?.min ?? 1;
    this.has_focus = !!supported.pointsOfInterest && (capabilities.focusMode?.length ?? 0) > 0;
    if (this.has_torch && this.torch === TorchMode.ON) void this.apply({ torch: true });
  }

  private release(): void {
    stop_tracks(this.stream);
    this.stream = null;
  }

  private hold_screen(): () => void {
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock || !("wakeLock" in navigator)) return;
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
  }

  private follow_orientation(): () => void {
    let device: number | null = null;
    const update = () => {
      const screen_angle = screen.orientation?.angle ?? 0;
      const held = device ?? screen_angle;
      this.turn = photo_turn(held, screen_angle);
      const tilt = (((held - screen_angle) % 360) + 360) % 360;
      this.tilt = tilt > 180 ? tilt - 360 : tilt;
    };
    const on_motion = (event: DeviceMotionEvent) => {
      const gravity = event.accelerationIncludingGravity;
      const angle = device_angle(gravity?.x ?? null, gravity?.y ?? null);
      if (angle === null || angle === device) return;
      device = angle;
      update();
    };
    update();
    window.addEventListener("devicemotion", on_motion);
    screen.orientation?.addEventListener("change", update);
    return () => {
      window.removeEventListener("devicemotion", on_motion);
      screen.orientation?.removeEventListener("change", update);
    };
  }
}

let audio: AudioContext | null = null;

// The AudioContext starts on the first shutter tap, inside its user activation.
export function shutter_feedback(): void {
  navigator.vibrate?.(25);
  try {
    audio ??= new AudioContext();
    const length = Math.round(audio.sampleRate * 0.03);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    gain.gain.value = 0.35;
    source.buffer = buffer;
    source.connect(gain).connect(audio.destination);
    source.start();
  } catch (reason) {
    console.warn("[Glimpse] shutter click failed", reason);
  }
}
