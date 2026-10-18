import type { Point } from "./engine/step";

const DIRECTIONS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export const is_arrow = (key: string) => key in DIRECTIONS;

export function nudge(point: Point, key: string, far: boolean): Point {
  const direction = DIRECTIONS[key];
  if (!direction) return point;
  const step = far ? 10 : 1;
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return { x: clamp(point.x + direction.x * step), y: clamp(point.y + direction.y * step) };
}

export function free_spot(taken: Point[], gap = 10): Point {
  for (let ring = 0; ring <= 5; ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const spot = { x: 50 + dx * gap, y: 50 + dy * gap };
        if (taken.every((point) => Math.hypot(point.x - spot.x, point.y - spot.y) >= gap)) return spot;
      }
  return { x: 50, y: 50 };
}
