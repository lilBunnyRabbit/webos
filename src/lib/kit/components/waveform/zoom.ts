export interface Viewport {
  /** 1 shows the whole sound; 4 makes the drawing four viewports wide. */
  zoom: number;
  scroll: number;
  width: number;
  duration: number;
}

export interface ZoomState {
  zoom: number;
  scroll: number;
}

export interface TimeSpan {
  start: number;
  end: number;
}

export const ZOOM_STEP = 2;
/** Chrome lays out up to about 33.5 million px; half of that leaves room. */
const MAX_CONTENT_PX = 16_000_000;
const NICE_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function px_per_second(view: Viewport): number {
  return view.duration > 0 ? (view.width * view.zoom) / view.duration : 0;
}

/** As far in as one pixel per sample, and never wider than the browser can lay out. */
export function max_zoom(duration: number, width: number, sample_rate: number): number {
  if (width <= 0 || duration <= 0) return 1;
  return Math.max(1, Math.min((duration * sample_rate) / width, MAX_CONTENT_PX / width));
}

export function clamp_scroll(scroll: number, width: number, zoom: number): number {
  return clamp(scroll, 0, Math.max(0, width * zoom - width));
}

export function visible_span(view: Viewport): TimeSpan {
  const pps = px_per_second(view);
  if (!pps) return { start: 0, end: view.duration };
  return { start: clamp(view.scroll / pps, 0, view.duration), end: clamp((view.scroll + view.width) / pps, 0, view.duration) };
}

/** Zooms to `zoom` keeping the moment under `anchor` (px from the viewport's left edge) where it is. */
export function zoom_at(view: Viewport, zoom: number, anchor: number, limit: number): ZoomState {
  const next = clamp(zoom, 1, Math.max(1, limit));
  const pps = px_per_second(view);
  if (!pps) return { zoom: next, scroll: 0 };
  const time = (view.scroll + anchor) / pps;
  const next_pps = px_per_second({ ...view, zoom: next });
  return { zoom: next, scroll: clamp_scroll(time * next_pps - anchor, view.width, next) };
}

export function zoom_to(span: TimeSpan, width: number, duration: number, limit: number): ZoomState {
  const length = span.end - span.start;
  if (length <= 0 || duration <= 0) return { zoom: 1, scroll: 0 };
  const zoom = clamp(duration / length, 1, Math.max(1, limit));
  const pps = (width * zoom) / duration;
  return { zoom, scroll: clamp_scroll(span.start * pps, width, zoom) };
}

export interface Pinch {
  zoom: number;
  scroll: number;
  mid: number;
  distance: number;
}

/** Two fingers: the moment that was between them stays between them, and the spread scales the zoom. */
export function pinch_zoom(from: Pinch, mid: number, distance: number, width: number, duration: number, limit: number): ZoomState {
  const zoom = clamp(from.zoom * (distance / Math.max(1, from.distance)), 1, Math.max(1, limit));
  if (duration <= 0 || width <= 0) return { zoom, scroll: 0 };
  const time = ((from.scroll + from.mid) * duration) / (width * from.zoom);
  const pps = (width * zoom) / duration;
  return { zoom, scroll: clamp_scroll(time * pps - mid, width, zoom) };
}

export function tick_step(pps: number, min_px: number): number {
  if (pps <= 0) return NICE_STEPS[NICE_STEPS.length - 1];
  return NICE_STEPS.find((step) => step * pps >= min_px) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

export function ticks(span: TimeSpan, step: number): number[] {
  const out: number[] = [];
  const first = Math.ceil(span.start / step - 1e-9);
  const last = Math.floor(span.end / step + 1e-9);
  for (let index = first; index <= last; index++) out.push(Number((index * step).toFixed(6)));
  return out;
}

export function tick_label(time: number, step: number, minutes: boolean): string {
  const decimals = step >= 1 ? 0 : clamp(Math.ceil(-Math.log10(step) - 1e-9), 0, 3);
  if (!minutes) return time.toFixed(decimals);
  const whole = Math.floor(time / 60);
  const rest = (time - whole * 60).toFixed(decimals);
  return `${whole}:${rest.padStart(decimals ? decimals + 3 : 2, "0")}`;
}

export function edge_speed(x: number, width: number, edge: number, max = 16): number {
  if (x < edge) return -max * clamp((edge - x) / edge, 0, 1);
  if (x > width - edge) return max * clamp((x - (width - edge)) / edge, 0, 1);
  return 0;
}

/** Where to scroll so `time` is on screen: a page turn that puts it near the left edge; `null` when it already shows. */
export function follow(view: Viewport, time: number): number | null {
  const span = visible_span(view);
  if (time >= span.start && time <= span.end) return null;
  return clamp_scroll(time * px_per_second(view) - view.width * 0.05, view.width, view.zoom);
}

export function nudge_step(visible: number): number {
  let best = NICE_STEPS[0];
  for (const step of NICE_STEPS) if (step <= visible / 50) best = step;
  return best;
}

/** A marker dragged by its tab moves by the finger's travel (plus what auto-scroll moved under it), not to the finger. */
export function dragged_time(origin: number, moved_px: number, content_px: number, duration: number): number {
  return content_px > 0 ? origin + (moved_px / content_px) * duration : origin;
}
