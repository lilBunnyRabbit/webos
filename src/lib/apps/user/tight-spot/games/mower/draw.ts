import { resolve_token } from "$lib/core/utils";
import type { Insets } from "../../core/camera";
import { bay_pointer, begin_frame, contact_rings, fill, guides, path, player, solids, union, type Palette, type View } from "../../core/draw";
import type { Polygon, Vec } from "../../core/geometry";
import { SolidKind } from "../../core/scene";
import { hash } from "../../core/seed";
import { Gear } from "../../core/vehicle";
import { CELL, Cut, Ground, type Grid } from "./coverage";
import { SPEC, Status, VEHICLE, type GameState } from "./game";
import type { Garden } from "./garden";

export interface Lawn {
  /** Uncut grass in two tones, so long grass reads as tufts. */
  long: [string, string];
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
 * The cut lawn takes less of the success hue than the long grass, so cut reads as paler on a light theme and duller
 * on a dark one; the two stripes differ by the same step either way, which keeps them readable on both.
 */
export function read_lawn(probe: HTMLElement): Lawn {
  const token = (value: string) => resolve_token(probe, value);
  const green = (share: number) => token(`color-mix(in oklch, var(--success) ${share}%, var(--background))`);
  return {
    long: [green(54), green(47)],
    light: green(7),
    dark: green(32),
    soil: token("color-mix(in oklab, color-mix(in oklab, var(--warning) 35%, var(--foreground)) 38%, var(--background))"),
    flattened: token("color-mix(in oklab, color-mix(in oklab, var(--warning) 35%, var(--foreground)) 60%, var(--background))"),
    flowers: ["--primary", "--secondary", "--tertiary", "--warning", "--error", "--info", "--cottontail"].map((name) => token(`var(${name})`)),
    trunk: token("color-mix(in oklab, var(--warning) 40%, var(--foreground))"),
    crown: green(55),
    crown_edge: green(75),
  };
}

function rgba(colour: string, scratch: CanvasRenderingContext2D): [number, number, number, number] {
  scratch.clearRect(0, 0, 1, 1);
  scratch.fillStyle = colour;
  scratch.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = scratch.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}

/**
 * The coverage grid as an image, one pixel a cell, drawn scaled and smoothed under the lawn's outline. Only the cells a
 * step changed are written back; a new grid or new colours repaint the lot.
 */
export class LawnLayer {
  readonly canvas = document.createElement("canvas");
  private readonly context = this.canvas.getContext("2d", { willReadFrequently: true })!;
  private image: ImageData | null = null;
  private grid: Grid | null = null;
  private lawn: Lawn | null = null;
  private colours: Record<string, [number, number, number, number]> = {};

  sync(grid: Grid, lawn: Lawn) {
    if (grid !== this.grid || lawn !== this.lawn) {
      this.grid = grid;
      this.lawn = lawn;
      this.repaint(grid, lawn);
      return;
    }
    if (grid.dirty.length === 0 || !this.image) return;
    let c0 = grid.cols;
    let r0 = grid.rows;
    let c1 = -1;
    let r1 = -1;
    for (const i of grid.dirty) {
      this.paint(grid, i);
      const col = i % grid.cols;
      const row = (i - col) / grid.cols;
      c0 = Math.min(c0, col);
      c1 = Math.max(c1, col);
      r0 = Math.min(r0, row);
      r1 = Math.max(r1, row);
    }
    grid.dirty.length = 0;
    this.context.putImageData(this.image, 0, 0, c0, r0, c1 - c0 + 1, r1 - r0 + 1);
  }

  private repaint(grid: Grid, lawn: Lawn) {
    this.canvas.width = grid.cols;
    this.canvas.height = grid.rows;
    const scratch = this.context;
    this.colours = {
      long0: rgba(lawn.long[0], scratch),
      long1: rgba(lawn.long[1], scratch),
      light: rgba(lawn.light, scratch),
      dark: rgba(lawn.dark, scratch),
      flattened: rgba(lawn.flattened, scratch),
    };
    this.image = scratch.createImageData(grid.cols, grid.rows);
    for (let i = 0; i < grid.ground.length; i++) this.paint(grid, i);
    grid.dirty.length = 0;
    scratch.putImageData(this.image, 0, 0);
  }

  private paint(grid: Grid, i: number) {
    const data = this.image!.data;
    let colour: [number, number, number, number] | null = null;
    if (grid.ground[i] === Ground.LAWN) {
      const cut = grid.cut[i];
      colour = cut === Cut.LIGHT ? this.colours.light : cut === Cut.DARK ? this.colours.dark : hash(i, 3) & 1 ? this.colours.long0 : this.colours.long1;
    } else if (grid.ground[i] === Ground.BED && grid.trampled[i]) colour = this.colours.flattened;
    const at = i * 4;
    if (!colour) {
      data[at + 3] = 0;
      return;
    }
    data[at] = colour[0];
    data[at + 1] = colour[1];
    data[at + 2] = colour[2];
    data[at + 3] = colour[3];
  }
}

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  layer: LawnLayer;
  lawn: Lawn;
  uncut: Vec | null;
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
        ctx.fillStyle = lawn.long[0];
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

  layer.sync(grid, lawn);
  ctx.save();
  union(ctx, garden.lawn as Polygon[]);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, 0, 0, grid.cols * CELL, grid.rows * CELL);
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
