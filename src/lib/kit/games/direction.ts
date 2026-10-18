export const Direction = { UP: "up", DOWN: "down", LEFT: "left", RIGHT: "right" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: Direction.UP,
  ArrowDown: Direction.DOWN,
  ArrowLeft: Direction.LEFT,
  ArrowRight: Direction.RIGHT,
  KeyW: Direction.UP,
  KeyS: Direction.DOWN,
  KeyA: Direction.LEFT,
  KeyD: Direction.RIGHT,
};

/** By `KeyboardEvent.code`, so WASD sits in the same place on every layout. */
export function key_direction(code: string): Direction | null {
  return KEY_DIRECTIONS[code] ?? null;
}

export function swipe_direction(dx: number, dy: number, threshold: number): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? Direction.RIGHT : Direction.LEFT;
  return dy > 0 ? Direction.DOWN : Direction.UP;
}
