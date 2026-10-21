export const DISMISS_FRACTION = 0.25;
/** px per ms */
export const FLICK_VELOCITY = 0.5;
export const RUBBER_LIMIT = 56;
// Only the last stretch counts, so a pause before letting go reads as still.
export const VELOCITY_WINDOW_MS = 100;

export interface DragSample {
  y: number;
  t: number;
}

export interface SheetRelease {
  offset: number;
  height: number;
  velocity: number;
  dismissible: boolean;
}

export function rubber_band(distance: number, limit = RUBBER_LIMIT): number {
  if (distance === 0) return 0;
  const magnitude = Math.abs(distance);
  return Math.sign(distance) * limit * (1 - 1 / (magnitude / limit + 1));
}

export function sheet_offset(dy: number, dismissible: boolean): number {
  return dy > 0 && dismissible ? dy : rubber_band(dy);
}

export function claims_drag(move: { dx: number; dy: number; scrolled: boolean }): boolean {
  return !move.scrolled && move.dy > 0 && move.dy > Math.abs(move.dx);
}

export function release_velocity(samples: DragSample[], window_ms = VELOCITY_WINDOW_MS): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find((sample) => last.t - sample.t <= window_ms) ?? last;
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.y - first.y) / elapsed : 0;
}

export function should_dismiss(release: SheetRelease): boolean {
  if (!release.dismissible || release.offset <= 0) return false;
  if (release.velocity < -FLICK_VELOCITY) return false;
  return release.offset > release.height * DISMISS_FRACTION || release.velocity > FLICK_VELOCITY;
}
