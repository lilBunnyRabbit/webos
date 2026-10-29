import { resolve_token } from "$lib/core/utils";
import type { Insets } from "../../core/camera";
import { bay_pointer, begin_frame, contact_rings, fill, guides, path, player, solids, union, type Palette, type View } from "../../core/draw";
import type { Polygon, Vec } from "../../core/geometry";
import { SolidKind } from "../../core/scene";
import { hash } from "../../core/seed";
import { Gear } from "../../core/vehicle";
import { CELL, Cut, type Grid } from "./coverage";
import { SPEC, Status, VEHICLE, type GameState } from "./game";
import type { Garden } from "./garden";

export interface Lawn {
  long: string;
  tuft: string;
  light: string;
  dark: string;
  soil: string;
  flattened: string;
  flowers: string[];
  trunk: string;
  crown: string;
  crown_edge: string;
}

/**
 * Every lawn tone is one green (`--success` into the background) moved in lightness, so cut grass is lighter than the
 * long grass on both themes and the two stripes sit a fixed step apart instead of one of them sinking into the
 * background.
 */
export function read_lawn(probe: HTMLElement): Lawn {
  const token = (value: string) => resolve_token(probe, value);
  const green = (share: number) => token(`color-mix(in oklch, var(--success) ${share}%, var(--background))`);
  const grass = (lightness: number, chroma = 1) => token(`oklch(from color-mix(in oklch, var(--success) 52%, var(--background)) calc(l + ${lightness}) calc(c * ${chroma}) h)`);
  return {
    long: grass(-0.03),
    tuft: grass(-0.043),
    light: grass(0.08, 1.15),
    dark: grass(0.045, 1.05),
    soil: token("color-mix(in oklab, color-mix(in oklab, var(--warning) 35%, var(--foreground)) 38%, var(--background))"),
    flattened: token("color-mix(in oklab, color-mix(in oklab, var(--warning) 35%, var(--foreground)) 60%, var(--background))"),
    flowers: ["--primary", "--secondary", "--tertiary", "--warning", "--error", "--info", "--cottontail"].map((name) => token(`var(${name})`)),
    trunk: token("color-mix(in oklab, var(--warning) 40%, var(--foreground))"),
    crown: green(55),
    crown_edge: green(75),
  };
}

const MAX_SIDE = 4096;
const MAX_PIXELS = 8_000_000;
const TUFTS_FROM = 36;
const CHEAP = 400;

/** Pixels per metre for a view, in steps of √2 rounded up, so a zoom repaints only when it crosses a step. */
export function layer_resolution(wanted: number, width: number, height: number): number {
  const stepped = 2 ** (Math.ceil(Math.log2(Math.max(1, wanted)) * 2) / 2);
  return Math.min(stepped, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
}

function trace(target: CanvasRenderingContext2D | Path2D, shape: Polygon) {
  shape.forEach((p, i) => (i === 0 ? target.moveTo(p.x, p.y) : target.lineTo(p.x, p.y)));
  target.closePath();
}

/**
 * The lawn as vectors on an offscreen canvas at about the screen's resolution: the long grass, then the deck's swept
 * shapes in the order they were cut, so stripes have the straight edges a mower leaves. The grid is only the score.
 * A step paints just the shapes added since; a new round, a theme or a zoom past a resolution step repaints the lot.
 */
export class LawnLayer {
  readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d")!;
  private grid: Grid | null = null;
  private lawn: Lawn | null = null;
  private ppm = 0;
  private revision = -1;
  private run = 0;
  private painted = 0;
  private flats = 0;
  private off_beds = new Path2D();
  private on_beds = new Path2D();

  get width(): number {
    return this.canvas.width / this.ppm;
  }

  get height(): number {
    return this.canvas.height / this.ppm;
  }

  /** `settled` is false while the camera eases to a new zoom: the old layer, scaled, stands in until it lands. */
  sync(grid: Grid, garden: Garden, lawn: Lawn, wanted: number, settled: boolean) {
    const width = grid.cols * CELL;
    const height = grid.rows * CELL;
    const ppm = layer_resolution(wanted, width, height);
    const cheap = grid.marks.cut.reduce((sum, run) => sum + run.shapes.length, 0) < CHEAP;
    if (grid !== this.grid || lawn !== this.lawn || (ppm !== this.ppm && (settled || cheap))) {
      this.grid = grid;
      this.lawn = lawn;
      this.ppm = ppm;
      this.repaint(grid, garden, lawn, width, height);
    }
    this.paint_marks(grid, lawn);
  }

  private repaint(grid: Grid, garden: Garden, lawn: Lawn, width: number, height: number) {
    const ctx = this.context;
    this.canvas.width = Math.ceil(width * this.ppm);
    this.canvas.height = Math.ceil(height * this.ppm);
    ctx.setTransform(this.ppm, 0, 0, this.ppm, 0, 0);
    this.off_beds = new Path2D();
    this.off_beds.rect(0, 0, width, height);
    this.on_beds = new Path2D();
    for (const bed of garden.beds) {
      trace(this.off_beds, bed);
      trace(this.on_beds, bed);
    }
    this.revision = -1;
    this.run = 0;
    this.painted = 0;
    this.flats = 0;

    ctx.save();
    ctx.clip(this.off_beds, "evenodd");
    union(ctx, garden.lawn);
    ctx.fillStyle = lawn.long;
    ctx.fill();
    if (this.ppm >= TUFTS_FROM) this.tufts(grid, lawn, width, height);
    ctx.restore();
  }

  // One short blade every 0.16 m or so, its place and lean from a hash of the spot: a grain with no pattern to it.
  private tufts(grid: Grid, lawn: Lawn, width: number, height: number) {
    const ctx = this.context;
    const step = 0.16;
    ctx.strokeStyle = lawn.tuft;
    ctx.lineWidth = 0.022;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let row = 0; row * step < height; row++) {
      for (let col = 0; col * step < width; col++) {
        const h = hash(grid.cols, col, row);
        const x = (col + 0.5) * step + ((h & 0xff) / 255 - 0.5) * step;
        const y = (row + 0.5) * step + (((h >> 8) & 0xff) / 255 - 0.5) * step;
        const angle = (((h >> 16) & 0xff) / 255) * Math.PI;
        const blade = 0.05 + ((h >>> 24) / 255) * 0.04;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * blade, y + Math.sin(angle) * blade);
      }
    }
    ctx.stroke();
  }

  private paint_marks(grid: Grid, lawn: Lawn) {
    const ctx = this.context;
    const { cut, flat, revision } = grid.marks;
    if (revision === this.revision) return;
    this.revision = revision;
    if (cut.length > 0) {
      ctx.save();
      ctx.clip(this.off_beds, "evenodd");
      for (let run = this.run; run < cut.length; run++) {
        const { shade, shapes } = cut[run];
        ctx.fillStyle = shade === Cut.DARK ? lawn.dark : lawn.light;
        ctx.beginPath();
        for (let i = run === this.run ? this.painted : 0; i < shapes.length; i++) trace(ctx, shapes[i]);
        ctx.fill();
      }
      ctx.restore();
      // The last shape keeps growing with the next steps, so it's painted again until a newer one starts.
      this.run = cut.length - 1;
      this.painted = cut[this.run].shapes.length - 1;
    }
    if (flat.length > this.flats) {
      ctx.save();
      ctx.clip(this.on_beds);
      ctx.fillStyle = lawn.flattened;
      ctx.beginPath();
      for (let i = this.flats; i < flat.length; i++) trace(ctx, flat[i]);
      ctx.fill();
      ctx.restore();
      this.flats = flat.length;
    }
  }
}

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  layer: LawnLayer;
  lawn: Lawn;
  uncut: Vec | null;
  settled: boolean;
}

function patio(ctx: CanvasRenderingContext2D, garden: Garden, scale: number, palette: Palette) {
  fill(ctx, garden.patio, palette.pavement);
  const [a, , c] = garden.patio;
  ctx.strokeStyle = palette.kerb;
  ctx.lineWidth = Math.max(0.02, 1 / scale);
  ctx.beginPath();
  for (let x = a.x + 0.6; x < c.x - 1e-6; x += 0.6) {
    ctx.moveTo(x, a.y);
    ctx.lineTo(x, c.y);
  }
  for (let y = a.y + 0.6; y < c.y - 1e-6; y += 0.6) {
    ctx.moveTo(a.x, y);
    ctx.lineTo(c.x, y);
  }
  ctx.stroke();
}

function beds(ctx: CanvasRenderingContext2D, garden: Garden, scale: number, lawn: Lawn) {
  for (const [b, bed] of garden.beds.entries()) {
    fill(ctx, bed, lawn.soil);
    if (scale < 6) continue;
    ctx.save();
    path(ctx, bed);
    ctx.clip();
    const xs = bed.map((p) => p.x);
    const ys = bed.map((p) => p.y);
    const r = 0.11;
    for (let x = Math.min(...xs) + 0.2; x < Math.max(...xs); x += 0.34) {
      for (let y = Math.min(...ys) + 0.2; y < Math.max(...ys); y += 0.34) {
        const h = hash(b + 1, Math.round(x * 100), Math.round(y * 100));
        const cx = x + ((h & 0xff) / 255 - 0.5) * 0.16;
        const cy = y + (((h >> 8) & 0xff) / 255 - 0.5) * 0.16;
        ctx.fillStyle = lawn.long;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lawn.flowers[(h >> 16) % lawn.flowers.length];
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// A pitched wooden roof seen from above: boards down each slope, the ridge across the middle, the doors' sill in front.
function shed(ctx: CanvasRenderingContext2D, garden: Garden, scale: number, palette: Palette) {
  const [a, , c] = garden.shed;
  const ridge = (a.y + c.y) / 2;
  fill(ctx, garden.shed, palette.wood);
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = Math.max(0.02, 1 / scale);
  ctx.beginPath();
  for (let x = a.x + 0.25; x < c.x - 1e-6; x += 0.25) {
    ctx.moveTo(x, a.y);
    ctx.lineTo(x, c.y);
  }
  ctx.stroke();
  ctx.fillStyle = palette.shadow;
  ctx.fillRect(a.x, ridge, c.x - a.x, c.y - ridge);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.06, 2 / scale);
  ctx.beginPath();
  ctx.moveTo(a.x, ridge);
  ctx.lineTo(c.x, ridge);
  ctx.stroke();
  path(ctx, garden.shed);
  ctx.lineWidth = Math.max(0.04, 1.5 / scale);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.fillRect(garden.door.x - 0.8, garden.door.y - 0.08, 1.6, 0.16);
}

function trunks(ctx: CanvasRenderingContext2D, garden: Garden, lawn: Lawn) {
  ctx.fillStyle = lawn.trunk;
  for (const tree of garden.trees) {
    ctx.beginPath();
    ctx.arc(tree.at.x, tree.at.y, tree.trunk, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Crowns are over the mower: it drives under the branches, and the trunk it can hit shows through.
function crowns(ctx: CanvasRenderingContext2D, garden: Garden, scale: number, lawn: Lawn) {
  const lobes = 7;
  const blob = (at: Vec, size: number, turn: number) => {
    ctx.beginPath();
    ctx.moveTo(at.x + size * 0.62, at.y);
    ctx.arc(at.x, at.y, size * 0.62, 0, Math.PI * 2);
    for (let i = 0; i < lobes; i++) {
      const angle = (i / lobes) * Math.PI * 2 + turn;
      const r = size * (0.36 + 0.06 * Math.sin(i * 2.3 + turn));
      const cx = at.x + Math.cos(angle) * (size - r);
      const cy = at.y + Math.sin(angle) * (size - r);
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
  };
  for (const tree of garden.trees) {
    const { at, crown } = tree;
    blob(at, crown, at.x);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = lawn.crown;
    ctx.fill();
    if (scale > 8) {
      blob({ x: at.x - crown * 0.12, y: at.y - crown * 0.12 }, crown * 0.62, at.y);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = lawn.crown_edge;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = lawn.trunk;
    ctx.beginPath();
    ctx.arc(at.x, at.y, tree.trunk * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { garden, grid } = state;
  const { lawn, layer } = extras;
  begin_frame(ctx, view, palette);
  fill(ctx, [
    { x: garden.bounds.x0, y: garden.bounds.y0 },
    { x: garden.bounds.x1, y: garden.bounds.y0 },
    { x: garden.bounds.x1, y: garden.bounds.y1 },
    { x: garden.bounds.x0, y: garden.bounds.y1 },
  ], palette.grass);
  patio(ctx, garden, scale, palette);
  beds(ctx, garden, scale, lawn);

  layer.sync(grid, garden, lawn, scale * view.dpr, extras.settled);
  ctx.save();
  union(ctx, garden.lawn as Polygon[]);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, 0, 0, layer.width, layer.height);
  ctx.restore();

  solids(ctx, garden.solids.filter((solid) => solid.kind === SolidKind.HEDGE || solid.kind === SolidKind.WATER), scale, palette);
  shed(ctx, garden, scale, palette);
  trunks(ctx, garden, lawn);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, SPEC, scale, palette);
  player(ctx, state.car, VEHICLE, SPEC, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
  crowns(ctx, garden, scale, lawn);
  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);

  if (extras.uncut && state.status === Status.DRIVING) {
    const { x, y } = extras.uncut;
    ctx.save();
    bay_pointer(ctx, { shape: [{ x: x - 0.3, y: y - 0.3 }, { x: x + 0.3, y: y - 0.3 }, { x: x + 0.3, y: y + 0.3 }, { x: x - 0.3, y: y + 0.3 }], heading: 0, either: true }, view, extras.insets, palette);
    ctx.restore();
  }
}
