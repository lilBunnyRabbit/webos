export const ease_out = (x: number) => 1 - (1 - x) ** 3;

export function progress(t: number, start: number, length: number): number {
  return Math.min(1, Math.max(0, (t - start) / length));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const lerp_rect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), width: lerp(a.width, b.width, p), height: lerp(a.height, b.height, p) });

export const WEBOS_DURATION = 3000;
export const WEBOS = {
  open: [150, 750],
  open_ms: 300,
  windows: [
    { from: { x: 12, y: 10, width: 44, height: 58 }, snap: { at: 1450, to: { x: 2, y: 4, width: 47, height: 78 } } },
    { from: { x: 42, y: 20, width: 44, height: 58 }, snap: { at: 2150, to: { x: 51, y: 4, width: 47, height: 78 } } },
  ],
  snap_ms: 420,
} as const;

export interface WebosFrame {
  shown: [number, number];
  rects: [Rect, Rect];
  front: number;
  previews: [number, number];
}

export function webos_frame(t: number): WebosFrame {
  const { open, open_ms, windows, snap_ms } = WEBOS;
  const shown: [number, number] = [ease_out(progress(t, open[0], open_ms)), ease_out(progress(t, open[1], open_ms))];
  const rects = windows.map((win) => lerp_rect(win.from, win.snap.to, ease_out(progress(t, win.snap.at, snap_ms)))) as [Rect, Rect];
  const previews = windows.map((win) => Math.min(progress(t, win.snap.at - 200, 160), 1 - progress(t, win.snap.at + snap_ms - 120, 200))) as [number, number];
  const front = t >= windows[1].snap.at - 250 ? 1 : t >= windows[0].snap.at - 250 ? 0 : t >= open[1] ? 1 : t >= open[0] ? 0 : -1;
  return { shown, rects, front, previews };
}

export const PALETTE_DURATION = 2500;
/** Lightness of each swatch the script resolves into, at the primary colour's own chroma and hue. */
export const SWATCHES = [0.3, 0.45, 0.6, 0.745, 0.88];
export const PALETTE = { type: { at: 200, length: 600 }, swatches: { at: 900, every: 90, length: 260 }, tint: { at: 1650, length: 450 } } as const;

export interface PaletteFrame {
  typed: number;
  line: number;
  swatches: number[];
  tint: number;
}

export function palette_frame(t: number): PaletteFrame {
  const { type, swatches, tint } = PALETTE;
  return {
    typed: progress(t, type.at, type.length),
    line: 1 - progress(t, swatches.at - 60, 200),
    swatches: SWATCHES.map((_, index) => ease_out(progress(t, swatches.at + index * swatches.every, swatches.length))),
    tint: ease_out(progress(t, tint.at, tint.length)),
  };
}

export const TASKS_DURATION = 2300;
export const TASKS = [
  { name: "fetch", start: 0, length: 700 },
  { name: "resize", start: 700, length: 1000 },
  { name: "compress", start: 700, length: 1500 },
];

export const SessionStatus = { IDLE: "idle", BUSY: "busy", INPUT: "input", DONE: "done" } as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const SESSIONS_DURATION = 2200;
export const SESSIONS: { name: string; steps: [number, SessionStatus][] }[] = [
  { name: "web-app", steps: [[0, SessionStatus.BUSY], [1100, SessionStatus.DONE]] },
  { name: "api", steps: [[0, SessionStatus.IDLE], [500, SessionStatus.BUSY], [1700, SessionStatus.INPUT]] },
  { name: "docs", steps: [[0, SessionStatus.BUSY]] },
];

export const TRACE_DURATION = 2000;
export const TRACE = { ghost: 300, from: 300, length: 1500 };

export const SEASONS_DURATION = 2000;
export const SEASONS = [
  { name: "S1", episodes: 8, watched: 8 },
  { name: "S2", episodes: 8, watched: 5 },
];
export const EPISODE_STEP = 110;

export function watched_at(t: number, start = 200): number {
  const total = SEASONS.reduce((sum, season) => sum + season.watched, 0);
  return Math.min(total, Math.max(0, Math.floor((t - start) / EPISODE_STEP) + 1));
}

export function status_at(steps: [number, SessionStatus][], t: number): SessionStatus {
  let status = steps[0][1];
  for (const [at, next] of steps) if (t >= at) status = next;
  return status;
}
