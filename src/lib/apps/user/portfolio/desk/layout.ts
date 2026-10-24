import { Win } from "./script";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Composition {
  slots: Record<string, Rect>;
  hero: boolean;
  free: Rect;
}

export const GAP = 20;
export const PAD = 24;
export const TITLE_BAR = 40;
export const MAX_DESK = 1640;
export const WHO_SHARE = 0.5;
/** Every principle title stays in view at this height; below it the story under the list scrolls, never the titles. */
export const HOW_MIN = 290;
export const WHO_MIN = 320;
/** The narrowest each column still reads at: below their sum the windows stack into one column instead of squeezing. */
export const COLUMN_MIN = { who: 288, work: 296, projects: 300 } as const;
/** Shorter than this, Who I am and How I build can't share a column, so the windows stack too. */
export const RAIL_MIN_HEIGHT = 600;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export const rail_width = (width: number) => Math.round(clamp(width * 0.22, 264, 360));

/** Whether the rail and three columns fit side by side; otherwise the terminal sits on top and the windows stack. */
export function fits_rail(width: number, height: number): boolean {
  const columns = COLUMN_MIN.who + COLUMN_MIN.work + COLUMN_MIN.projects + GAP * 2 + PAD * 2;
  return height >= RAIL_MIN_HEIGHT && width - rail_width(width) >= columns;
}

// Contact is no tile: it floats centred over the whole app. Every other window has one fixed slot, so a click never moves the others; only the opening hero is placed differently.
export function compose(width: number, height: number, open: string[], pad = PAD): Composition {
  const inner = { width: Math.max(1, Math.min(MAX_DESK, width - pad * 2)), height: Math.max(1, height - pad * 2) };
  const x0 = Math.round((width - inner.width) / 2);
  const has = (id: string) => open.includes(id);
  const slots: Record<string, Rect> = {};
  const free: Rect = { x: x0, y: pad, width: inner.width, height: inner.height };

  const room = inner.width - GAP * 2;
  const who = Math.round(clamp(room * 0.3, COLUMN_MIN.who, 380));
  const work = Math.round(clamp(room * 0.33, COLUMN_MIN.work, 460));
  const projects = room - who - work;
  const columns = has(Win.TIMELINE) || has(Win.PROJECTS) || has(Win.HOW);

  if (has(Win.IDENTITY) && !columns) {
    const hero_width = Math.min(inner.width, 760);
    const hero_height = Math.min(inner.height, Math.max(inner.height * 0.72, 440), 540);
    slots[Win.IDENTITY] = { x: x0 + (inner.width - hero_width) / 2, y: pad + (inner.height - hero_height) * 0.42, width: hero_width, height: hero_height };
  } else {
    const top = has(Win.HOW) && has(Win.IDENTITY) ? Math.round(clamp(inner.height * WHO_SHARE, WHO_MIN, inner.height - GAP - HOW_MIN)) : inner.height;
    if (has(Win.IDENTITY)) slots[Win.IDENTITY] = { x: x0, y: pad, width: who, height: top };
    if (has(Win.HOW)) {
      const y = has(Win.IDENTITY) ? pad + top + GAP : pad;
      slots[Win.HOW] = { x: x0, y, width: who, height: pad + inner.height - y };
    }
    if (has(Win.TIMELINE)) slots[Win.TIMELINE] = { x: x0 + who + GAP, y: pad, width: work, height: inner.height };
    if (has(Win.PROJECTS)) slots[Win.PROJECTS] = { x: x0 + who + work + GAP * 2, y: pad, width: projects, height: inner.height };
  }

  for (const rect of [...Object.values(slots), free]) {
    rect.x = Math.round(rect.x);
    rect.y = Math.round(rect.y);
    rect.width = Math.round(rect.width);
    rect.height = Math.round(rect.height);
  }
  return { slots, hero: has(Win.IDENTITY) && !columns, free };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function clamp_to(rect: Rect, width: number, height: number): Rect {
  return {
    ...rect,
    x: Math.round(Math.min(Math.max(0, rect.x), Math.max(0, width - rect.width))),
    y: Math.round(Math.min(Math.max(0, rect.y), Math.max(0, height - TITLE_BAR))),
  };
}
