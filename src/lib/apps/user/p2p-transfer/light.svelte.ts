import { error_message, format_bytes } from "$lib/core/utils";
import {
  encode_light,
  estimate_frames,
  LightDecoder,
  LightResult,
  MAX_BYTES,
  type LightFile,
  type LightHeader,
  type LightStream,
} from "$kit/utils/light";

export const Speed = {
  STEADY: "steady",
  FAST: "fast",
} as const;
export type Speed = (typeof Speed)[keyof typeof Speed];

/** A slower, smaller code survives a shaky hand and a mid-range phone camera; Fast needs both phones steady. */
export const SPEEDS: Record<Speed, { label: string; fps: number; version: number }> = {
  [Speed.STEADY]: { label: "Steady", fps: 8, version: 15 },
  [Speed.FAST]: { label: "Fast", fps: 15, version: 20 },
};

export class LightSender {
  file = $state.raw<File | null>(null);
  speed = $state<Speed>(Speed.STEADY);
  stream = $state.raw<LightStream | null>(null);
  error = $state<string | null>(null);
  running = $state(false);
  shown = $state(0);
  private prepared = 0;

  get estimate_seconds(): number | null {
    return this.stream ? estimate_frames(this.stream.header.k) / SPEEDS[this.speed].fps : null;
  }

  async pick(file: File | undefined): Promise<void> {
    if (!file) return;
    this.stop();
    if (file.size > MAX_BYTES) {
      this.file = null;
      this.stream = null;
      this.error = `${file.name} (${format_bytes(file.size)}) is over the 2 MB limit for By light. Use Direct for bigger files`;
      return;
    }
    this.file = file;
    await this.prepare();
  }

  async set_speed(speed: Speed): Promise<void> {
    this.speed = speed;
    this.stop();
    await this.prepare();
  }

  private async prepare(): Promise<void> {
    const file = this.file;
    if (!file) return;
    const ticket = ++this.prepared;
    this.stream = null;
    this.error = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const stream = await encode_light({ name: file.name, type: file.type, bytes }, SPEEDS[this.speed].version);
      if (ticket === this.prepared) this.stream = stream;
    } catch (reason) {
      if (ticket === this.prepared) this.error = `Couldn't read ${file.name}: ${error_message(reason)}`;
    }
  }

  start(): void {
    if (!this.stream) return;
    this.shown = 0;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  clear(): void {
    this.stop();
    this.prepared++;
    this.file = null;
    this.stream = null;
    this.error = null;
  }
}

export const LightPhase = {
  SCANNING: "scanning",
  SAVING: "saving",
  DONE: "done",
} as const;
export type LightPhase = (typeof LightPhase)[keyof typeof LightPhase];

export class LightReceiver {
  phase = $state<LightPhase>(LightPhase.SCANNING);
  header = $state.raw<LightHeader | null>(null);
  progress = $state(0);
  frames = $state(0);
  rate = $state(0);
  error = $state<string | null>(null);
  saved_path = $state<string | null>(null);
  camera = $state(false);
  private decoder = new LightDecoder();
  private started_at = 0;

  /** Returns `true` once the file is saved, which stops the camera. */
  async take(code: string, save: (file: LightFile) => Promise<string>): Promise<boolean> {
    if (this.phase !== LightPhase.SCANNING) return this.phase === LightPhase.DONE;
    const result = this.decoder.add(code);
    if (result === LightResult.NOT_A_FRAME) return false;
    if (result === LightResult.FOREIGN) {
      this.error = "That's another file's code. Start over to receive it instead";
      return false;
    }
    const now = performance.now();
    if (this.decoder.frames === 1) this.started_at = now;
    this.header = this.decoder.header;
    this.progress = this.decoder.progress;
    this.frames = this.decoder.frames;
    const seconds = (now - this.started_at) / 1000;
    const block_size = this.header?.block_size ?? 0;
    this.rate = seconds > 0.5 ? (this.decoder.known * block_size) / seconds : 0;
    if (result !== LightResult.COMPLETE) return false;

    this.phase = LightPhase.SAVING;
    try {
      const file = await this.decoder.result();
      this.saved_path = await save(file);
      this.error = null;
      this.phase = LightPhase.DONE;
      return true;
    } catch (reason) {
      this.error = error_message(reason);
      this.reset_progress();
      return false;
    }
  }

  reset(): void {
    this.reset_progress();
    this.error = null;
    this.saved_path = null;
  }

  private reset_progress(): void {
    this.decoder.reset();
    this.phase = LightPhase.SCANNING;
    this.header = null;
    this.progress = 0;
    this.frames = 0;
    this.rate = 0;
  }
}
