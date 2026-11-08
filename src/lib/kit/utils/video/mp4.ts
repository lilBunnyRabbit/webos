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
    out.video_encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        out.video_config ??= metadata?.decoderConfig;
        out.video.push(out.copy(chunk));
      },
      error: out.fail,
    });
    out.video_encoder.addEventListener("dequeue", () => {
      if (out.video_encoder!.encodeQueueSize < MAX_QUEUE) out.release();
    });
    out.video_encoder.configure(config);
    if (setup.audio) {
      out.audio_encoder = new AudioEncoder({
        output: (chunk, metadata) => {
          out.audio_config ??= metadata?.decoderConfig;
          out.audio.push(out.copy(chunk));
        },
        error: out.fail,
      });
      out.audio_encoder.configure(aac_config(setup.audio.channels));
    }
    return out;
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

  async finish(duration_ms: number): Promise<Blob> {
    this.check();
    await Promise.all([this.video_encoder?.flush(), this.audio_encoder?.flush()]);
    this.check();
    this.close();
    return mux_mp4({
      video: this.video,
      video_config: this.video_config,
      audio: this.audio_config ? this.audio : [],
      audio_config: this.audio_config,
      end_us: duration_ms * 1000,
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
}

async function mux_mp4(input: Mp4Input): Promise<Blob> {
  if (!input.video.length || !input.video_config) throw new Error("No video frames were encoded");
  const media = await import("mediabunny");
  const target = new media.BufferTarget();
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
  const packets = [
    ...frames.map((chunk) => ({ chunk, track: "video" as const })),
    ...input.audio.map((chunk) => ({ chunk, track: "audio" as const })),
  ].sort((a, b) => a.chunk.timestamp_us - b.chunk.timestamp_us);

  let first_video = true;
  let first_audio = true;
  for (const { chunk, track } of packets) {
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
  return new Blob([target.buffer!], { type: "video/mp4" });
}
