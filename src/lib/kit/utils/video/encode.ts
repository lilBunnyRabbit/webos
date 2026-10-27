import {
  mux_webm,
  opus_head,
  opus_pre_skip,
  TrackKind,
  WebmCodec,
  type WebmAudioTrack,
  type WebmChunk,
  type WebmVideoTrack,
} from "./webm";

export const OPUS_RATE = 48_000;
const OPUS_BITRATE = 128_000;
const AUDIO_SLICE = 960;
const KEYFRAME_EVERY_US = 2_000_000;
/** Frames queued in the encoder before capture pauses; held frames keep the video decoder's buffers busy. */
const MAX_QUEUE = 6;

const VIDEO_CODECS = [
  { codec: "vp09.00.10.08", webm: WebmCodec.VP9 },
  { codec: "vp8", webm: WebmCodec.VP8 },
] as const;

export interface VideoSetup {
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
}

export async function pick_video_codec(
  setup: VideoSetup
): Promise<{ config: VideoEncoderConfig; webm: WebmVideoTrack["codec"] }> {
  if (typeof VideoEncoder === "undefined") throw new Error("This browser can't encode video (no WebCodecs)");
  for (const candidate of VIDEO_CODECS) {
    const config: VideoEncoderConfig = {
      codec: candidate.codec,
      width: setup.width,
      height: setup.height,
      bitrate: setup.bitrate,
      framerate: setup.framerate,
      latencyMode: "realtime",
    };
    const { supported } = await VideoEncoder.isConfigSupported(config);
    if (supported) return { config, webm: candidate.webm };
  }
  throw new Error(`This browser can't encode VP9 or VP8 at ${setup.width} × ${setup.height}`);
}

/** Video containers work too: Chrome skips the video track. `null` when there's no audio to decode. */
export async function decode_audio(file: Blob): Promise<AudioBuffer | null> {
  const context = new OfflineAudioContext(1, 1, OPUS_RATE);
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export function* audio_slices(buffer: AudioBuffer, from: number, to: number): Generator<AudioData> {
  const channels = Math.min(2, buffer.numberOfChannels);
  const start = Math.max(0, Math.round(from * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.round(to * buffer.sampleRate));
  const planes = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let at = start; at < end; at += AUDIO_SLICE) {
    const frames = Math.min(AUDIO_SLICE, end - at);
    const data = new Float32Array(frames * channels);
    planes.forEach((plane, channel) => data.set(plane.subarray(at, at + frames), channel * frames));
    yield new AudioData({
      format: "f32-planar",
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round(((at - start) / buffer.sampleRate) * 1e6),
      data,
    });
  }
}

export interface WebmEncoderSetup {
  video?: VideoSetup;
  audio?: { channels: number };
  /** Each chunk goes here instead of being kept: for a caller that keeps its own (a pre-roll ring) and muxes with `tracks`. */
  on_chunk?: (chunk: WebmChunk) => void;
}

export class WebmEncoder {
  private readonly chunks: WebmChunk[] = [];
  private error: Error | null = null;
  private last_key = -Infinity;
  private video_encoder: VideoEncoder | null = null;
  private audio_encoder: AudioEncoder | null = null;
  private video_track: WebmVideoTrack | undefined;
  private audio_track: WebmAudioTrack | undefined;
  private waiting: (() => void)[] = [];
  private on_chunk: ((chunk: WebmChunk) => void) | undefined;

  private constructor() {}

  static async create(setup: WebmEncoderSetup): Promise<WebmEncoder> {
    const out = new WebmEncoder();
    out.on_chunk = setup.on_chunk;
    if (setup.video) await out.start_video(setup.video);
    if (setup.audio) await out.start_audio(setup.audio.channels);
    return out;
  }

  private fail = (error: DOMException) => {
    this.error ??= new Error(error.message || "The encoder failed");
    this.release();
  };

  private release() {
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private async start_video(setup: VideoSetup) {
    const { config, webm } = await pick_video_codec(setup);
    this.video_track = { codec: webm, width: setup.width, height: setup.height };
    this.video_encoder = new VideoEncoder({
      output: (chunk) => this.keep(TrackKind.VIDEO, chunk),
      error: this.fail,
    });
    this.video_encoder.addEventListener("dequeue", () => {
      if (this.video_encoder!.encodeQueueSize < MAX_QUEUE) this.release();
    });
    this.video_encoder.configure(config);
  }

  private async start_audio(channels: number) {
    if (typeof AudioEncoder === "undefined") throw new Error("This browser can't encode audio (no WebCodecs)");
    const config: AudioEncoderConfig = {
      codec: "opus",
      sampleRate: OPUS_RATE,
      numberOfChannels: channels,
      bitrate: OPUS_BITRATE,
    };
    if (!(await AudioEncoder.isConfigSupported(config)).supported)
      throw new Error("This browser can't encode Opus audio");
    this.audio_encoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const description = metadata?.decoderConfig?.description;
        if (description && this.audio_track) {
          const head = new Uint8Array(
            ArrayBuffer.isView(description)
              ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength)
              : description
          );
          if (opus_pre_skip(head))
            this.audio_track = { ...this.audio_track, private: head, pre_skip: opus_pre_skip(head) };
        }
        this.keep(TrackKind.AUDIO, chunk);
      },
      error: this.fail,
    });
    this.audio_encoder.configure(config);
    // Chrome's libopus default; replaced by the encoder's own OpusHead when it sends one.
    const pre_skip = 312;
    this.audio_track = {
      codec: WebmCodec.OPUS,
      sample_rate: OPUS_RATE,
      channels,
      private: opus_head(channels, OPUS_RATE, pre_skip),
      pre_skip,
    };
  }

  private keep(track: TrackKind, chunk: EncodedVideoChunk | EncodedAudioChunk) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const kept: WebmChunk = { track, timestamp: chunk.timestamp, key: chunk.type === "key", data };
    if (this.on_chunk) this.on_chunk(kept);
    else this.chunks.push(kept);
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

  get tracks(): { video?: WebmVideoTrack; audio?: WebmAudioTrack } {
    return { video: this.video_track, audio: this.audio_track };
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
    return mux_webm({ video: this.video_track, audio: this.audio_track, duration_ms, chunks: this.chunks });
  }

  close(): void {
    for (const encoder of [this.video_encoder, this.audio_encoder])
      if (encoder && encoder.state !== "closed") encoder.close();
    this.release();
  }
}
