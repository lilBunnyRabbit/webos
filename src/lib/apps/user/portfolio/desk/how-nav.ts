export const Axis = { X: "x", Y: "y", BOTH: "both" } as const;

export type Axis = (typeof Axis)[keyof typeof Axis];

export function move_of(key: string, axis: Axis = Axis.BOTH): -1 | 0 | 1 {
  const x = axis !== Axis.Y;
  const y = axis !== Axis.X;
  if ((x && key === "ArrowRight") || (y && key === "ArrowDown")) return 1;
  if ((x && key === "ArrowLeft") || (y && key === "ArrowUp")) return -1;
  return 0;
}

export function step_index(at: number, move: number, length: number): number {
  if (length <= 0) return -1;
  if (at < 0) return move < 0 ? length - 1 : 0;
  return (((at + move) % length) + length) % length;
}

// Dragging left turns forward, like a page; a mostly vertical drag is a scroll, not a turn.
export function swipe_of(dx: number, dy: number, min = 40): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
