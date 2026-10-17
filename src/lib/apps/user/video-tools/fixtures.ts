import { OPUS_RATE, WebmEncoder } from "./encode";

export const FIXTURE_FPS = 30;

/** A test video: frame `i` is filled with grey level `i * 8`, over a 440 Hz tone when `audio` is set. */
export async function make_video(
  seconds: number,
  options: { width?: number; height?: number; audio?: boolean } = {}
): Promise<Blob> {
  const width = options.width ?? 160;
  const height = options.height ?? 120;
  const encoder = await WebmEncoder.create({
    video: { width, height, bitrate: 500_000, framerate: FIXTURE_FPS },
    audio: options.audio ? { channels: 1 } : undefined,
  });
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  const count = Math.round(seconds * FIXTURE_FPS);
  for (let i = 0; i < count; i++) {
    const level = (i * 8) % 256;
    context.fillStyle = `rgb(${level}, ${level}, ${level})`;
    context.fillRect(0, 0, width, height);
    encoder.encode_frame(canvas, Math.round((i / FIXTURE_FPS) * 1e6));
    await encoder.drained();
  }
  if (options.audio) {
    const samples = Math.round(seconds * OPUS_RATE);
    const tone = new Float32Array(samples);
    for (let i = 0; i < samples; i++) tone[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / OPUS_RATE);
    for (let at = 0; at < samples; at += 960) {
      const data = tone.slice(at, at + 960);
      encoder.encode_audio(
        new AudioData({
          format: "f32-planar",
          sampleRate: OPUS_RATE,
          numberOfChannels: 1,
          numberOfFrames: data.length,
          timestamp: Math.round((at / OPUS_RATE) * 1e6),
          data,
        })
      );
    }
  }
  return encoder.finish(seconds * 1000);
}
