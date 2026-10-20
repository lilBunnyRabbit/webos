import { WebmEncoder } from "$kit/utils/video/encode";
import { FIXTURE_FPS } from "$kit/utils/video/fixtures";
import { bird_frame, bird_scene } from "./bird-fixture";

export async function make_bird_video(scene = bird_scene()): Promise<Blob> {
  const { width, height, seconds } = scene;
  const encoder = await WebmEncoder.create({ video: { width, height, bitrate: 2_000_000, framerate: FIXTURE_FPS } });
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  const count = Math.round(seconds * FIXTURE_FPS);
  for (let i = 0; i < count; i++) {
    const time = i / FIXTURE_FPS;
    context.putImageData(new ImageData(bird_frame(scene, time), width, height), 0, 0);
    encoder.encode_frame(canvas, Math.round(time * 1e6));
    await encoder.drained();
  }
  return encoder.finish(seconds * 1000);
}

export interface SquareFixture {
  width: number;
  height: number;
  side: number;
  at: (time: number) => { x: number; y: number };
}

export function square_path(width: number, height: number, side: number): SquareFixture {
  return {
    width,
    height,
    side,
    at: (time) => ({
      x: (width - side) / 2 + ((width - side) / 2.5) * Math.sin(time * 1.7),
      y: (height - side) / 2 + ((height - side) / 3) * Math.sin(time * 2.3 + 0.6),
    }),
  };
}

/** A light, striped background with a dark square wandering over it; `at` gives the square's top-left; it's gone during `hidden`. */
export async function make_square_video(
  seconds: number,
  fixture = square_path(320, 180, 28),
  hidden?: { from: number; to: number }
): Promise<Blob> {
  const { width, height, side } = fixture;
  const encoder = await WebmEncoder.create({ video: { width, height, bitrate: 1_500_000, framerate: FIXTURE_FPS } });
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  const count = Math.round(seconds * FIXTURE_FPS);
  for (let i = 0; i < count; i++) {
    const time = i / FIXTURE_FPS;
    context.fillStyle = "rgb(225, 225, 215)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgb(190, 195, 185)";
    for (let line = 0; line < width; line += 40) context.fillRect(line, 0, 2, height);
    const { x, y } = fixture.at(time);
    if (hidden && time >= hidden.from && time < hidden.to) {
      encoder.encode_frame(canvas, Math.round(time * 1e6));
      await encoder.drained();
      continue;
    }
    context.fillStyle = "rgb(30, 30, 40)";
    context.fillRect(x, y, side, side);
    context.fillStyle = "rgb(200, 60, 40)";
    context.fillRect(x + side / 4, y + side / 4, side / 3, side / 3);
    encoder.encode_frame(canvas, Math.round(time * 1e6));
    await encoder.drained();
  }
  return encoder.finish(seconds * 1000);
}
