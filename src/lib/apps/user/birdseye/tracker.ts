import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import { BLOB, busy_edge, find_blob, measure_subject, to_planes, type Subject } from "./blob";
import {
  best_match,
  downsample,
  integral,
  prepare_template,
  sample_patch,
  type Gray,
  type Integral,
} from "./ncc";

export const TRACK = {
  SEARCH: [3, 5, 8],
  BLEND: 0.08,
  SHAPE_BLEND: 0.5,
  /** How far one shape frame moves the expected blob area (and the scale, with Follow size) toward what it found. */
  SHAPE_SIZE: 0.25,
  /** Below this NCC the frame is lost: the position holds and the template isn't touched. */
  LOST: 0.55,
  WEAK: 0.75,
  /** Bigger boxes track on a scaled-down frame, which caps the NCC cost per frame. */
  WORK_SIDE: 48,
  MIN_SIDE: 8,
  COARSE_SIDE: 6,
  SCALE_STEP: 0.05,
  REFINE: 2,
} as const;

export interface TrackPoint {
  t: number;
  cx: number;
  cy: number;
  scale: number;
  conf: number;
  /** Found by the blob fallback, not by the template; `conf` is then the blob's. */
  shape?: boolean;
}

export interface TrackerSetup {
  box: Bounds;
  frame: Dimensions;
  follow_size: boolean;
  /** Scale of `box` against the track's first box, so a re-box carries on where the size was. */
  scale?: number;
}

interface Hit {
  x: number;
  y: number;
  score: number;
  relative: number;
}

interface Pyramid {
  images: Gray[];
  tables: Integral[];
}

function pyramid(region: Gray, levels: number): Pyramid {
  const images = [region];
  for (let level = 1; level <= levels; level++) images.push(downsample(images[level - 1]));
  return { images, tables: images.map(integral) };
}

export function work_factor(box: Dimensions): number {
  return Math.min(1, TRACK.WORK_SIDE / Math.max(box.width, box.height, 1));
}

export class Tracker {
  readonly factor: number;
  readonly work: Dimensions;
  private readonly follow_size: boolean;
  private readonly base_scale: number;
  private readonly width: number;
  private readonly height: number;
  private original: Gray | null = null;
  private appearance: Gray | null = null;
  private subject: Subject | null = null;
  private area = 1;
  private cx: number;
  private cy: number;
  private vx = 0;
  private vy = 0;
  private relative = 1;
  private missed = 0;

  constructor(setup: TrackerSetup) {
    this.factor = work_factor(setup.box);
    this.work = {
      width: Math.max(1, Math.round(setup.frame.width * this.factor)),
      height: Math.max(1, Math.round(setup.frame.height * this.factor)),
    };
    this.width = Math.max(TRACK.MIN_SIDE, Math.round(setup.box.width * this.factor));
    this.height = Math.max(TRACK.MIN_SIDE, Math.round(setup.box.height * this.factor));
    this.cx = (setup.box.x + setup.box.width / 2) * this.factor;
    this.cy = (setup.box.y + setup.box.height / 2) * this.factor;
    this.follow_size = setup.follow_size;
    this.base_scale = setup.scale ?? 1;
  }

  get search(): number {
    return TRACK.SEARCH[Math.min(this.missed, TRACK.SEARCH.length - 1)];
  }

  private predicted(): Position {
    const ahead = this.missed + 1;
    return { x: this.cx + this.vx * ahead, y: this.cy + this.vy * ahead };
  }

  region(): Bounds {
    const width = Math.ceil(this.width * this.relative * this.search * 1.05) + TRACK.REFINE * 2;
    const height = Math.ceil(this.height * this.relative * this.search * 1.05) + TRACK.REFINE * 2;
    const centre = this.predicted();
    const x = Math.round(centre.x - width / 2);
    const y = Math.round(centre.y - height / 2);
    const left = Math.max(0, Math.min(x, this.work.width - width));
    const top = Math.max(0, Math.min(y, this.work.height - height));
    return {
      x: left,
      y: top,
      width: Math.max(1, Math.min(width, this.work.width - left)),
      height: Math.max(1, Math.min(height, this.work.height - top)),
    };
  }

  start(region: Gray, origin: Position, rgba?: ArrayLike<number>): void {
    const x = this.cx - origin.x;
    const y = this.cy - origin.y;
    this.appearance = sample_patch(region, x, y, this.width, this.height, this.width, this.height);
    this.original = sample_patch(region, x, y, this.width, this.height, this.width, this.height);
    this.subject = rgba
      ? measure_subject(to_planes(rgba, region.width, region.height), { x, y }, this.width, this.height)
      : null;
    if (this.subject) this.area = this.subject.area;
  }

  private point(t: number, conf: number, shape = false): TrackPoint {
    const point: TrackPoint = {
      t,
      cx: this.cx / this.factor,
      cy: this.cy / this.factor,
      scale: this.base_scale * this.relative,
      conf,
    };
    if (shape) point.shape = true;
    return point;
  }

  first(t: number): TrackPoint {
    return this.point(t, 1);
  }

  private sized(base: Gray, relative: number): Gray {
    if (relative === 1) return base;
    const width = Math.max(TRACK.MIN_SIDE, Math.round(this.width * relative));
    const height = Math.max(TRACK.MIN_SIDE, Math.round(this.height * relative));
    return sample_patch(base, this.width / 2, this.height / 2, this.width, this.height, width, height);
  }

  private levels(): number {
    if (this.missed === 0) return 1;
    let levels = 2;
    const side = Math.min(this.width, this.height) * this.relative;
    while (levels > 1 && side / 2 ** levels < TRACK.COARSE_SIDE) levels--;
    return levels;
  }

  // Exhaustive at the coarsest level, then ±REFINE at each finer one; only level 0 tries the Follow size scales.
  private locate(frames: Pyramid, base: Gray, candidates: number[]): Hit | null {
    const top = frames.images.length - 1;
    const patches = [this.sized(base, this.relative)];
    for (let level = 1; level <= top; level++) patches.push(downsample(patches[level - 1]));
    const coarse_template = prepare_template(patches[top]);
    const coarse = best_match(frames.images[top], frames.tables[top], coarse_template, 0, 0, Infinity, Infinity);
    if (!coarse) return null;
    let x = Math.round(coarse.x) + coarse_template.width / 2;
    let y = Math.round(coarse.y) + coarse_template.height / 2;
    for (let level = top - 1; level >= 1; level--) {
      const template = prepare_template(patches[level]);
      const left = x * 2 - template.width / 2;
      const upper = y * 2 - template.height / 2;
      const match = best_match(
        frames.images[level],
        frames.tables[level],
        template,
        left - TRACK.REFINE,
        upper - TRACK.REFINE,
        left + TRACK.REFINE,
        upper + TRACK.REFINE
      );
      x = match ? Math.round(match.x) + template.width / 2 : x * 2;
      y = match ? Math.round(match.y) + template.height / 2 : y * 2;
    }
    x *= 2;
    y *= 2;

    let best: Hit | null = null;
    for (const relative of candidates) {
      const template = prepare_template(relative === this.relative ? patches[0] : this.sized(base, relative));
      const left = x - template.width / 2;
      const upper = y - template.height / 2;
      const match = best_match(
        frames.images[0],
        frames.tables[0],
        template,
        left - TRACK.REFINE,
        upper - TRACK.REFINE,
        left + TRACK.REFINE,
        upper + TRACK.REFINE
      );
      if (match && (!best || match.score > best.score))
        best = { x: match.x + template.width / 2, y: match.y + template.height / 2, score: match.score, relative };
    }
    return best;
  }

  private moved(origin: Position, x: number, y: number): void {
    const next_x = origin.x + x;
    const next_y = origin.y + y;
    const frames = this.missed + 1;
    this.vx = (this.vx + (next_x - this.cx) / frames) / 2;
    this.vy = (this.vy + (next_y - this.cy) / frames) / 2;
    this.cx = next_x;
    this.cy = next_y;
    this.missed = 0;
  }

  private learn(region: Gray, x: number, y: number, rate: number): void {
    const seen = sample_patch(
      region,
      x,
      y,
      this.width * this.relative,
      this.height * this.relative,
      this.width,
      this.height
    );
    const data = this.appearance!.data;
    for (let i = 0; i < data.length; i++) data[i] += (seen.data[i] - data[i]) * rate;
  }

  step(region: Gray, origin: Position, t: number, rgba?: ArrayLike<number>): TrackPoint {
    if (!this.appearance || !this.original) throw new Error("Tracker.start must run first");
    const candidates = this.follow_size
      ? [this.relative, this.relative * (1 - TRACK.SCALE_STEP), this.relative * (1 + TRACK.SCALE_STEP)]
      : [this.relative];
    const frames = pyramid(region, this.levels());

    let best = this.locate(frames, this.appearance, candidates);
    if (!best || best.score < TRACK.WEAK) {
      const boxed = this.locate(frames, this.original, candidates);
      if (boxed && (!best || boxed.score > best.score)) best = boxed;
    }

    // Against texture such as leaves a weak NCC peak is as likely the texture as the subject, and learning from it is
    // how the template drifts onto the trees: there only a strong match counts, and nothing is learned.
    const busy = busy_edge(region);
    const strong = best !== null && best.score >= TRACK.WEAK;
    const blob = strong ? null : this.shape(region, origin, rgba);
    // A weak peak the shape puts somewhere else is the template matching one wing, not the bird.
    const tolerance = Math.max(3, (Math.min(this.width, this.height) * this.relative) / 4);
    if (
      best &&
      best.score >= (busy ? TRACK.WEAK : TRACK.LOST) &&
      (!blob || Math.hypot(blob.x - best.x, blob.y - best.y) <= tolerance)
    ) {
      this.moved(origin, best.x, best.y);
      this.relative = best.relative;
      if (strong && !busy) this.learn(region, best.x, best.y, TRACK.BLEND);
      return this.point(t, best.score);
    }

    if (blob) {
      this.moved(origin, blob.x, blob.y);
      this.area *= (blob.area / this.area) ** TRACK.SHAPE_SIZE;
      if (this.follow_size && this.subject)
        this.relative += (Math.sqrt(this.area / this.subject.area) - this.relative) * TRACK.SHAPE_SIZE;
      if (blob.conf >= BLOB.LEARN) this.learn(region, blob.x, blob.y, TRACK.SHAPE_BLEND);
      return this.point(t, blob.conf, true);
    }

    this.missed++;
    return this.point(t, Math.min(best?.score ?? -1, TRACK.LOST - 0.01));
  }

  private shape(region: Gray, origin: Position, rgba?: ArrayLike<number>): (Position & { area: number; conf: number }) | null {
    if (!rgba || !this.subject) return null;
    const grown = Math.sqrt(this.area / this.subject.area);
    const dx = this.subject.dx * grown;
    const dy = this.subject.dy * grown;
    const centre = this.predicted();
    const blob = find_blob(
      to_planes(rgba, region.width, region.height),
      { x: centre.x - origin.x + dx, y: centre.y - origin.y + dy },
      this.area
    );
    if (!blob || blob.conf < BLOB.ACCEPT) return null;
    return { x: blob.cx - dx, y: blob.cy - dy, area: blob.area, conf: blob.conf };
  }
}
