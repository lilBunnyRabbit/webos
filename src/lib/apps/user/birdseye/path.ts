import { TRACK, type TrackPoint } from "./tracker";

export const FrameStatus = { GOOD: "good", WEAK: "weak", SHAPE: "shape", LOST: "lost" } as const;
export type FrameStatus = (typeof FrameStatus)[keyof typeof FrameStatus];

export const SMOOTH = { POSITION: 0.5, SCALE: 0.04 } as const;

export function status_of({ conf, shape }: Pick<TrackPoint, "conf" | "shape">): FrameStatus {
  if (shape) return FrameStatus.SHAPE;
  if (conf < TRACK.LOST) return FrameStatus.LOST;
  return conf < TRACK.WEAK ? FrameStatus.WEAK : FrameStatus.GOOD;
}

export interface Run {
  from: number;
  to: number;
  status: FrameStatus;
}

export function status_runs(track: TrackPoint[]): Run[] {
  const runs: Run[] = [];
  const gaps = track
    .slice(1)
    .map((point, i) => point.t - track[i].t)
    .sort((a, b) => a - b);
  const frame = gaps.length ? gaps[gaps.length >> 1] : 1 / 30;
  track.forEach((point, i) => {
    const status = status_of(point);
    const to = track[i + 1]?.t ?? point.t + frame;
    const last = runs[runs.length - 1];
    if (last && last.status === status && Math.abs(last.to - point.t) < 1e-9) last.to = to;
    else runs.push({ from: point.t, to, status });
  });
  return runs;
}

export function next_lost(track: TrackPoint[], time: number): number | null {
  const starts = status_runs(track)
    .filter((run) => run.status === FrameStatus.LOST)
    .map((run) => run.from);
  if (!starts.length) return null;
  return starts.find((start) => start > time + 1e-6) ?? starts[0];
}

export function sample_at(track: TrackPoint[], time: number): TrackPoint | null {
  let low = 0;
  let high = track.length - 1;
  if (high < 0 || time < track[0].t - 1e-6) return null;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (track[mid].t <= time + 1e-6) low = mid;
    else high = mid - 1;
  }
  return track[low];
}

export function splice_track(track: TrackPoint[], from: number, next: TrackPoint[]): TrackPoint[] {
  return [...track.filter((point) => point.t < from - 1e-6), ...next];
}

export function fill_gaps(track: TrackPoint[]): TrackPoint[] | null {
  const is_good = track.map((point) => status_of(point) !== FrameStatus.LOST);
  if (!is_good.includes(true)) return null;
  const next_good: number[] = new Array(track.length);
  for (let i = track.length - 1, next = -1; i >= 0; i--) {
    if (is_good[i]) next = i;
    next_good[i] = next;
  }
  let before: TrackPoint | null = null;
  return track.map((point, i) => {
    if (is_good[i]) {
      before = point;
      return { ...point };
    }
    const after = next_good[i] >= 0 ? track[next_good[i]] : null;
    if (!before || !after) {
      const near = (before ?? after)!;
      return { ...point, cx: near.cx, cy: near.cy, scale: near.scale };
    }
    const share = (point.t - before.t) / (after.t - before.t || 1);
    return {
      ...point,
      cx: before.cx + (after.cx - before.cx) * share,
      cy: before.cy + (after.cy - before.cy) * share,
      scale: before.scale + (after.scale - before.scale) * share,
    };
  });
}

// Forward then backward over the result: the two phase shifts cancel, so the camera doesn't lag the subject.
export function smooth(values: ArrayLike<number>, alpha: number): Float64Array {
  const n = values.length;
  if (n < 2) return Float64Array.from(values);
  // Odd reflection past both ends, so each pass starts settled and the ends don't lag.
  const pad = Math.min(n - 1, Math.ceil(3 / alpha));
  const out = new Float64Array(n + pad * 2);
  for (let i = 0; i < pad; i++) {
    out[pad - 1 - i] = 2 * values[0] - values[i + 1];
    out[pad + n + i] = 2 * values[n - 1] - values[n - 2 - i];
  }
  for (let i = 0; i < n; i++) out[pad + i] = values[i];
  for (let i = 1; i < out.length; i++) out[i] = out[i - 1] + alpha * (out[i] - out[i - 1]);
  for (let i = out.length - 2; i >= 0; i--) out[i] = out[i + 1] + alpha * (out[i] - out[i + 1]);
  return out.slice(pad, pad + n);
}

export interface CameraPath {
  t: Float64Array;
  cx: Float64Array;
  cy: Float64Array;
  scale: Float64Array;
}

export function build_path(track: TrackPoint[]): CameraPath | null {
  const filled = fill_gaps(track);
  if (!filled) return null;
  return {
    t: Float64Array.from(filled, (point) => point.t),
    cx: smooth(
      filled.map((point) => point.cx),
      SMOOTH.POSITION
    ),
    cy: smooth(
      filled.map((point) => point.cy),
      SMOOTH.POSITION
    ),
    // Smoothed in log space, so growing and shrinking by the same factor move the zoom alike.
    scale: smooth(
      filled.map((point) => Math.log(point.scale)),
      SMOOTH.SCALE
    ).map(Math.exp),
  };
}

export interface CameraAt {
  cx: number;
  cy: number;
  scale: number;
}

// A paused video shows the last frame whose timestamp is at or before currentTime, and samples are frame timestamps,
// so the camera holds the sample at or before `time` instead of blending toward the next frame's.
export function path_at(path: CameraPath, time: number): CameraAt {
  const { t } = path;
  let low = 0;
  let high = t.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (t[mid] <= time + 1e-9) low = mid;
    else high = mid - 1;
  }
  return { cx: path.cx[low], cy: path.cy[low], scale: path.scale[low] };
}

export function strip_gradient(
  runs: Run[],
  duration: number,
  colors: Record<FrameStatus, string>,
  empty: string
): string {
  if (duration <= 0 || !runs.length) return empty;
  const percent = (time: number) => `${((Math.min(Math.max(time, 0), duration) / duration) * 100).toFixed(3)}%`;
  const stops: string[] = [];
  let at = 0;
  for (const run of runs) {
    if (run.from > at + 1e-6) stops.push(`${empty} ${percent(at)} ${percent(run.from)}`);
    stops.push(`${colors[run.status]} ${percent(run.from)} ${percent(run.to)}`);
    at = run.to;
  }
  if (at < duration) stops.push(`${empty} ${percent(at)} 100%`);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}
