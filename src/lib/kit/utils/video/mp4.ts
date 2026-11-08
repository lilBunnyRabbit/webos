import { OPUS_RATE, type VideoSetup } from "./encode";
import { avc_codec, avc_level, AVC_PROFILES } from "./plan";

const AAC = "mp4a.40.2";
const AAC_BITRATE = 128_000;
const KEYFRAME_EVERY_US = 2_000_000;
const MAX_QUEUE = 6;

interface Mp4Chunk {
  data: Uint8Array;
  key: boolean;
  timestamp_us: number;
  duration_us: number;
}

export interface Mp4EncoderSetup {
  video: VideoSetup;
  audio?: { channels: number };
}

export async function pick_avc_config(setup: VideoSetup): Promise<VideoEncoderConfig> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser can't encode video (no WebCodecs)");
  const level = avc_level(setup, setup.framerate);
  if (level !== null) {
    for (const profile of AVC_PROFILES) {
      const config: VideoEncoderConfig = {
        codec: avc_codec(profile, level),
        width: setup.width,
        height: setup.height,
        bitrate: setup.bitrate,
        framerate: setup.framerate,
        latencyMode: "realtime",
        avc: { format: "avc" },
      };
      if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
    }
  }
  throw new Error(`This browser can't encode H.264 video at ${setup.width} × ${setup.height}`);
}

function aac_config(channels: number): AudioEncoderConfig {
  return { codec: AAC, sampleRate: OPUS_RATE, numberOfChannels: channels, bitrate: AAC_BITRATE };
}

export async function can_encode_aac(channels = 2): Promise<boolean> {
  if (typeof AudioEncoder === "undefined") return false;
  return (await AudioEncoder.isConfigSupported(aac_config(channels)).catch(() => ({ supported: false }))).supported === true;
}

// mediabunny loads only when the file is written, so a WebM save never fetches it.
export class Mp4Encoder {
  private readonly video: Mp4Chunk[] = [];
  private readonly audio: Mp4Chunk[] = [];
  private video_config: VideoDecoderConfig | undefined;
  private audio_config: AudioDecoderConfig | undefined;
  private error: Error | null = null;
  private last_key = -Infinity;
  private video_encoder: VideoEncoder | null = null;
  private audio_encoder: AudioEncoder | null = null;
  private waiting: (() => void)[] = [];

  private constructor() {}

  static async create(setup: Mp4EncoderSetup): Promise<Mp4Encoder> {
    const out = new Mp4Encoder();
    const config = await pick_avc_config(setup.video);
    try {
      out.start(config, setup.audio);
    } catch (error) {
      out.close();
      throw error;
    }
    return out;
  }

  private start(config: VideoEncoderConfig, audio: Mp4EncoderSetup["audio"]) {
    this.video_encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        this.video_config ??= metadata?.decoderConfig;
        this.video.push(this.copy(chunk));
      },
      error: this.fail,
    });
    this.video_encoder.addEventListener("dequeue", () => {
      if (this.video_encoder!.encodeQueueSize < MAX_QUEUE) this.release();
    });
    this.video_encoder.configure(config);
    if (audio) {
      this.audio_encoder = new AudioEncoder({
        output: (chunk, metadata) => {
          this.audio_config ??= metadata?.decoderConfig;
          this.audio.push(this.copy(chunk));
        },
        error: this.fail,
      });
      this.audio_encoder.configure(aac_config(audio.channels));
    }
  }

  private fail = (error: DOMException) => {
    this.error ??= new Error(error.message || "The encoder failed");
    this.release();
  };

  private release() {
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private copy(chunk: EncodedVideoChunk | EncodedAudioChunk): Mp4Chunk {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    return { data, key: chunk.type === "key", timestamp_us: chunk.timestamp, duration_us: chunk.duration ?? 0 };
  }

  private check() {
    if (this.error) throw this.error;
  }

  encode_frame(source: CanvasImageSource | VideoFrame, timestamp: number): void {
    this.check();
    const frame = new VideoFrame(source, { timestamp });
    const key = timestamp - this.last_key >= KEYFRAME_EVERY_US;
    if (key) this.last_key = timestamp;
    try {
      this.video_encoder!.encode(frame, { keyFrame: key });
    } finally {
      frame.close();
    }
  }

  encode_audio(data: AudioData): void {
    this.check();
    try {
      this.audio_encoder!.encode(data);
    } finally {
      data.close();
    }
  }

  get busy(): boolean {
    return (this.video_encoder?.encodeQueueSize ?? 0) >= MAX_QUEUE;
  }

  drained(): Promise<void> {
    if (!this.busy || this.error) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  async finish(duration_ms: number, signal?: AbortSignal): Promise<Blob> {
    this.check();
    await Promise.all([this.video_encoder?.flush(), this.audio_encoder?.flush()]);
    this.check();
    this.close();
    // The muxer takes the chunks over: the encoder keeps no reference to them.
    const video = this.video.splice(0);
    const audio = this.audio.splice(0);
    return mux_mp4({
      video,
      video_config: this.video_config,
      audio: this.audio_config ? audio : [],
      audio_config: this.audio_config,
      end_us: duration_ms * 1000,
      signal,
    });
  }

  close(): void {
    for (const encoder of [this.video_encoder, this.audio_encoder])
      if (encoder && encoder.state !== "closed") encoder.close();
    this.release();
  }
}

interface Mp4Input {
  video: Mp4Chunk[];
  video_config: VideoDecoderConfig | undefined;
  audio: Mp4Chunk[];
  audio_config: AudioDecoderConfig | undefined;
  end_us: number;
  signal?: AbortSignal;
}

async function mux_mp4(input: Mp4Input): Promise<Blob> {
  if (!input.video.length || !input.video_config) throw new Error("No video frames were encoded");
  const media = await import("mediabunny");
  const file = new FileParts();
  const target = new media.StreamTarget(new WritableStream({ write: (chunk) => file.write(chunk.position, chunk.data) }));
  const output = new media.Output({ format: new media.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const video = new media.EncodedVideoPacketSource("avc");
  output.addVideoTrack(video);
  const audio = input.audio_config ? new media.EncodedAudioPacketSource("aac") : null;
  if (audio) output.addAudioTrack(audio);
  await output.start();

  // Realtime H.264 has no B-frames, so decode order is presentation order; each frame lasts until the next one.
  const frames = input.video.map((chunk, index) => {
    const next = input.video[index + 1]?.timestamp_us ?? Math.max(input.end_us, chunk.timestamp_us + 1);
    return { ...chunk, duration_us: next - chunk.timestamp_us };
  });
  const packets: ({ chunk: Mp4Chunk; track: "video" | "audio" } | null)[] = [
    ...frames.map((chunk) => ({ chunk, track: "video" as const })),
    ...input.audio.map((chunk) => ({ chunk, track: "audio" as const })),
  ].sort((a, b) => a.chunk.timestamp_us - b.chunk.timestamp_us);
  input.video.length = 0;
  input.audio.length = 0;

  let first_video = true;
  let first_audio = true;
  for (let index = 0; index < packets.length; index++) {
    if (input.signal?.aborted) {
      await output.cancel();
      input.signal.throwIfAborted();
    }
    const { chunk, track } = packets[index]!;
    packets[index] = null;
    const packet = new media.EncodedPacket(
      chunk.data,
      chunk.key ? "key" : "delta",
      chunk.timestamp_us / 1e6,
      chunk.duration_us / 1e6
    );
    if (track === "video") {
      await video.add(packet, first_video ? { decoderConfig: input.video_config } : undefined);
      first_video = false;
    } else {
      await audio!.add(packet, first_audio ? { decoderConfig: input.audio_config! } : undefined);
      first_audio = false;
    }
  }
  await output.finalize();
  return file.blob("video/mp4");
}

/** The file mediabunny writes, as the chunks it hands over; a write over earlier bytes patches them. */
class FileParts {
  private parts: { position: number; data: Uint8Array<ArrayBuffer> }[] = [];
  private end = 0;
  private patched = false;

  write(position: number, data: Uint8Array<ArrayBuffer>) {
    if (position !== this.end) this.patched = true;
    this.parts.push({ position, data });
    this.end = Math.max(this.end, position + data.byteLength);
  }

  blob(type: string): Blob {
    const { parts } = this;
    this.parts = [];
    if (!this.patched) return new Blob(parts.map((part) => part.data), { type });
    const whole = new Uint8Array(this.end);
    for (const part of parts) whole.set(part.data, part.position);
    return new Blob([whole], { type });
  }
}
