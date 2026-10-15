import { Direction, type Sprite } from "./model";

export const PlayMode = { LOOP: "loop", PINGPONG: "pingpong", ONCE: "once" } as const;
export type PlayMode = (typeof PlayMode)[keyof typeof PlayMode];
export const PLAY_MODES = Object.values(PlayMode) as [PlayMode, ...PlayMode[]];

export interface FrameRange {
  from: number;
  to: number;
}

/** Ping-pong doesn't repeat its ends, so looping it never holds the first or last frame twice. */
export function frame_sequence({ from, to }: FrameRange, direction: Direction): number[] {
  const forward: number[] = [];
  for (let i = from; i <= to; i++) forward.push(i);
  if (direction === Direction.REVERSE) return forward.reverse();
  if (direction === Direction.PINGPONG) return [...forward, ...forward.slice(1, -1).reverse()];
  return forward;
}

export function full_range(sprite: Sprite): FrameRange {
  return { from: 0, to: sprite.frames.length - 1 };
}

export function clamp_range(range: FrameRange, frame_count: number): FrameRange {
  const last = Math.max(0, frame_count - 1);
  const from = Math.min(Math.max(0, range.from), last);
  return { from, to: Math.min(Math.max(from, range.to), last) };
}
