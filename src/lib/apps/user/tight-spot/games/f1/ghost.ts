import { z } from "zod";
import { wrap_angle, type Pose } from "../../core/geometry";

export const GHOST_HZ = 10;
const FRAME_MS = 1000 / GHOST_HZ;

// Centimetres and milliradians as whole numbers, three per frame: a minute's lap is about 15 kB of JSON.
export function quantise(pose: Pose): [number, number, number] {
  return [Math.round(pose.x * 100), Math.round(pose.y * 100), Math.round(wrap_angle(pose.heading) * 1000)];
}

export const ghost_schema = z.object({
  ms: z.number().positive(),
  splits: z.array(z.number().nonnegative()).length(2),
  frames: z.array(z.number().int()).refine((frames) => frames.length % 3 === 0 && frames.length > 0),
});
export type Ghost = z.infer<typeof ghost_schema>;

export function record_frame(frames: number[], lap_ms: number, pose: Pose) {
  if (lap_ms < (frames.length / 3) * FRAME_MS) return;
  frames.push(...quantise(pose));
}

export function ghost_pose(frames: readonly number[], lap_ms: number): Pose | null {
  const count = frames.length / 3;
  if (count === 0) return null;
  const at = Math.max(0, Math.min(count - 1, lap_ms / FRAME_MS));
  const i = Math.floor(at);
  const j = Math.min(count - 1, i + 1);
  const t = at - i;
  const a = (k: number) => frames[k * 3];
  const b = (k: number) => frames[k * 3 + 1];
  const h = (k: number) => frames[k * 3 + 2] / 1000;
  return {
    x: (a(i) + (a(j) - a(i)) * t) / 100,
    y: (b(i) + (b(j) - b(i)) * t) / 100,
    heading: h(i) + wrap_angle(h(j) - h(i)) * t,
  };
}
