import { inside_convex } from "../../core/collision";
import { angle_between, bounds_of, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { swept, type Deck } from "./deck";
import type { Garden } from "./garden";

export const CELL = 0.15;

export const Ground = { NONE: 0, LAWN: 1, BED: 2 } as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export const Cut = { LONG: 0, LIGHT: 1, DARK: 2 } as const;
export type Cut = (typeof Cut)[keyof typeof Cut];

/** A cell cut again after the mower has gone this far since its first cut counts as overlap; less is the same pass. */
export const REPASS = 1.2;

export interface Grid {
  cols: number;
  rows: number;
  ground: Uint8Array;
  coverable: Uint8Array;
  cut: Uint8Array;
  first: Float32Array;
  overlapped: Uint8Array;
  trampled: Uint8Array;
  /** What the deck and the wheels went over, in order, for drawing only: the cells above are the score. */
  marks: Marks;
}

/** Steps cutting one stripe tone; the next tone starts a new run, so replaying runs in order repaints the lawn. */
export interface Stroke {
  shade: Cut;
  shapes: Polygon[];
  /** Where the last shape starts: it grows with each step until the deck has gone `CHUNK` or turned `CHUNK_TURN`. */
  from: Pose;
}

export interface Marks {
  cut: Stroke[];
  flat: Polygon[];
  revision: number;
}

// A long round is tens of thousands of steps; one shape per chunk keeps a full repaint quick. The hull of two poses
// this close is the true sweep to well under a cell.
export const CHUNK = 0.3;
export const CHUNK_TURN = 0.08;

export function mark_cut(marks: Marks, from: Pose, to: Pose, deck: Deck, shade: Cut) {
  const last = marks.cut[marks.cut.length - 1];
  marks.revision++;
  if (last?.shade === shade) {
    const start = last.from;
    const near = Math.hypot(to.x - start.x, to.y - start.y) <= CHUNK && angle_between(start.heading, to.heading) <= CHUNK_TURN;
    if (near) {
      last.shapes[last.shapes.length - 1] = swept(start, to, deck);
      return;
    }
    last.shapes.push(swept(from, to, deck));
    last.from = from;
    return;
  }
  marks.cut.push({ shade, shapes: [swept(from, to, deck)], from });
}

export interface Tally {
  coverable: number;
  mown: number;
  overlapped: number;
  trampled: number;
}

export function create_grid(garden: Pick<Garden, "width" | "height" | "lawn" | "beds" | "solids">): Grid {
  const cols = Math.ceil(garden.width / CELL);
  const rows = Math.ceil(garden.height / CELL);
  const size = cols * rows;
  const ground = new Uint8Array(size);
  const blocked = garden.solids.map((solid) => solid.shape);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const at = { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
      if (!garden.lawn.some((piece) => inside_convex(at, piece))) continue;
      if (blocked.some((shape) => inside_convex(at, shape))) continue;
      ground[row * cols + col] = garden.beds.some((bed) => inside_convex(at, bed)) ? Ground.BED : Ground.LAWN;
    }
  }
  return {
    cols,
    rows,
    ground,
    coverable: new Uint8Array(size),
    cut: new Uint8Array(size),
    first: new Float32Array(size),
    overlapped: new Uint8Array(size),
    trampled: new Uint8Array(size),
    marks: { cut: [], flat: [], revision: 0 },
  };
}

export function each_cell(grid: Pick<Grid, "cols" | "rows">, shape: Polygon, visit: (index: number) => void) {
  const box = bounds_of(shape);
  const c0 = Math.max(0, Math.floor(box.x0 / CELL));
  const c1 = Math.min(grid.cols - 1, Math.floor(box.x1 / CELL));
  const r0 = Math.max(0, Math.floor(box.y0 / CELL));
  const r1 = Math.min(grid.rows - 1, Math.floor(box.y1 / CELL));
  const at = { x: 0, y: 0 };
  for (let row = r0; row <= r1; row++) {
    at.y = (row + 0.5) * CELL;
    for (let col = c0; col <= c1; col++) {
      at.x = (col + 0.5) * CELL;
      if (inside_convex(at, shape)) visit(row * grid.cols + col);
    }
  }
}

/**
 * Stripes come from which way the grass is laid: the deck's way along whichever axis it mostly travels, east or
 * south light and west or north dark, so passes up and down a lawn alternate whichever way it's mown.
 */
export function stripe(motion: Vec): Cut {
  const along = Math.abs(motion.x) >= Math.abs(motion.y) ? motion.x : motion.y;
  return along >= 0 ? Cut.LIGHT : Cut.DARK;
}

export function mow(grid: Grid, shape: Polygon, motion: Vec, odometer: number, tally: Tally): Tally {
  const shade = stripe(motion);
  let { mown, overlapped } = tally;
  each_cell(grid, shape, (i) => {
    if (grid.ground[i] !== Ground.LAWN) return;
    if (grid.cut[i] === Cut.LONG) {
      grid.first[i] = odometer;
      if (grid.coverable[i]) mown++;
    } else if (!grid.overlapped[i] && odometer - grid.first[i] > REPASS) {
      grid.overlapped[i] = 1;
      if (grid.coverable[i]) overlapped++;
    }
    grid.cut[i] = shade;
  });
  return mown === tally.mown && overlapped === tally.overlapped ? tally : { ...tally, mown, overlapped };
}

/** Flowers under any part of the mower are flattened; each cell counts once. */
export function trample(grid: Grid, shapes: Polygon[], tally: Tally): Tally {
  let { trampled } = tally;
  for (const shape of shapes) {
    const before = trampled;
    each_cell(grid, shape, (i) => {
      if (grid.ground[i] !== Ground.BED || grid.trampled[i]) return;
      grid.trampled[i] = 1;
      trampled++;
    });
    if (trampled > before) {
      grid.marks.flat.push(shape);
      grid.marks.revision++;
    }
  }
  return trampled === tally.trampled ? tally : { ...tally, trampled };
}

export const BED_COST = 3;

/** The share of the coverable lawn mown, less the flowers run over, 0 to 1. */
export function coverage(tally: Tally): number {
  if (tally.coverable === 0) return 0;
  return Math.max(0, (tally.mown - tally.trampled * BED_COST) / tally.coverable);
}

export function overlap(tally: Tally): number {
  return tally.coverable === 0 ? 0 : tally.overlapped / tally.coverable;
}
