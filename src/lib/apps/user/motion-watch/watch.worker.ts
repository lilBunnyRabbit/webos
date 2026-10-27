import { serve } from "$kit/utils/worker/serve";
import { WebmEncoder } from "$kit/utils/video/encode";
import { mux_webm } from "$kit/utils/video/webm";
import { even_size } from "$kit/utils/video/plan";
import { to_gray } from "../birdseye/ncc";
import { MotionDetector } from "./detect";
import { ClipRecorder, type FinishedClip } from "./recorder";
import { DETECT, type DetectConfig } from "./settings";

const ENCODE_LONG_SIDE = 640;
const BITRATE = 1_000_000;
const LEVEL_EVERY_MS = 150;

export interface Clip {
  blob: Blob;
  at: number;
  end: number;
  peak: number;
  cells: number[];
}

export type WatchEvent =
  | { kind: "level"; level: number; motion: boolean; lights: boolean; recording: boolean }
  | { kind: "motion"; at: number }
  | { kind: "clip"; clip: Clip };

export interface WatchApi {
  configure(config: DetectConfig): null;
  /** Reads frames until the stream ends (the camera stopped) or `finish` is called. */
  watch(input: { readable: ReadableStream<VideoFrame>; config: DetectConfig }): null;
  /** Ends watching and hands over the clip in progress, if any. */
  finish(input: null): null;
}

let detector: MotionDetector | null = null;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let stopping = false;

const recorder = new ClipRecorder();
const small = new OffscreenCanvas(DETECT.WIDTH, DETECT.HEIGHT);
const small_context = small.getContext("2d", { willReadFrequently: true })!;
let big: OffscreenCanvas | null = null;
let big_context: OffscreenCanvasRenderingContext2D | null = null;
let encoder: WebmEncoder | null = null;
let encoder_failed = false;
let first_timestamp: number | null = null;
let last_level = 0;

function encode_size(frame: VideoFrame) {
  const width = frame.displayWidth;
  const height = frame.displayHeight;
  const scale = Math.min(1, ENCODE_LONG_SIDE / Math.max(width, height));
  return even_size({ width: Math.round(width * scale), height: Math.round(height * scale) });
}

async function start_encoder(frame: VideoFrame) {
  const size = encode_size(frame);
  if (size.width !== frame.displayWidth || size.height !== frame.displayHeight) {
    big = new OffscreenCanvas(size.width, size.height);
    big_context = big.getContext("2d")!;
  }
  encoder = await WebmEncoder.create({
    video: { ...size, bitrate: BITRATE, framerate: 15 },
    on_chunk: (chunk) => recorder.chunk(chunk),
  });
}

function send(clip: FinishedClip | null) {
  if (!clip || !encoder) return;
  const blob = mux_webm({ video: encoder.tracks.video, duration_ms: clip.duration_ms, chunks: clip.chunks });
  served.emit({ kind: "clip", clip: { blob, at: clip.at, end: clip.end, peak: clip.peak, cells: clip.cells } });
}

async function handle(frame: VideoFrame) {
  first_timestamp ??= frame.timestamp;
  const time = frame.timestamp - first_timestamp;
  if (!encoder && !encoder_failed) await start_encoder(frame).catch(() => (encoder_failed = true));
  // A live camera can't wait for the encoder: a busy one skips the frame, detection still sees it.
  if (encoder && !encoder.busy) {
    if (big && big_context) {
      big_context.drawImage(frame, 0, 0, big.width, big.height);
      encoder.encode_frame(big, time);
    } else encoder.encode_frame(frame, time);
  }

  small_context.drawImage(frame, 0, 0, DETECT.WIDTH, DETECT.HEIGHT);
  const pixels = small_context.getImageData(0, 0, DETECT.WIDTH, DETECT.HEIGHT).data;
  const seen = detector!.step(to_gray(pixels, DETECT.WIDTH, DETECT.HEIGHT).data);
  const wall = Date.now();
  const was_recording = recorder.active;
  send(recorder.step({ time, wall, motion: seen.motion, level: seen.level, cells: seen.cells }));
  if (!was_recording && recorder.active) served.emit({ kind: "motion", at: wall });
  if (wall - last_level >= LEVEL_EVERY_MS || seen.motion) {
    last_level = wall;
    served.emit({ kind: "level", level: seen.level, motion: seen.motion, lights: seen.lights, recording: recorder.active });
  }
}

const served = serve<WatchApi, WatchEvent>({
  configure: (config) => {
    detector?.configure(config);
    return null;
  },
  watch: async ({ readable, config }) => {
    detector = new MotionDetector(config);
    reader = readable.getReader();
    try {
      while (!stopping) {
        const { value: frame, done } = await reader.read();
        if (done) break;
        try {
          await handle(frame);
        } finally {
          frame.close();
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!stopping) {
      send(recorder.finish());
      throw new Error("The camera stopped");
    }
    return null;
  },
  finish: async () => {
    stopping = true;
    await reader?.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    send(recorder.finish());
    encoder?.close();
    return null;
  },
});
