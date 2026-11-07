import { resolve_token } from "$lib/core/utils";
import type { Insets } from "$kit/games/play2d/camera";
import { begin_frame, type View } from "$kit/games/play2d/canvas";
import type { Palette } from "$kit/games/play2d/palette";
import { hash } from "$kit/games/play2d/seed";
import { field_copies, home_x, type Field } from "./field";
import { facing, point_at, type BodyPoint, type Coefficients, type Plane } from "./plane";

export interface Scenery {
  horizon: string;
  sky: string;
  cloud: string;
  hill: string;
  far_hill: string;
  earth: string;
  runway: string;
  shadow: string;
}

export function read_scenery(probe: HTMLElement): Scenery {
  const token = (value: string) => resolve_token(probe, value);
  return {
    horizon: token("color-mix(in oklch, var(--info) 8%, var(--background))"),
    sky: token("color-mix(in oklch, var(--info) 20%, var(--background-dark))"),
    cloud: token("color-mix(in oklch, var(--background-lightest) 50%, transparent)"),
    hill: token("color-mix(in oklch, var(--success) 9%, var(--background-light))"),
    far_hill: token("color-mix(in oklch, var(--info) 7%, var(--background-light))"),
    earth: token("color-mix(in oklch, var(--success) 6%, var(--background-darker))"),
    runway: token("var(--background-darker)"),
    shadow: token("color-mix(in oklch, var(--background-darkest) 45%, transparent)"),
  };
}

export interface Puff {
  x: number;
  age: number;
  size: number;
}

export const PUFF_LIFE = 1.6;

export interface Frame {
  plane: Plane;
  c: Coefficients;
  field: Field;
  view: View;
  palette: Palette;
  scenery: Scenery;
  time: number;
  font: string;
  insets: Insets;
  puffs: readonly Puff[];
  hangar_label: string;
  profile: boolean;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function visible(view: View): Box {
  const half_w = view.width / 2 / view.scale;
  const half_h = view.height / 2 / view.scale;
  return { x0: view.x - half_w, x1: view.x + half_w, y0: view.y - half_h, y1: view.y + half_h };
}

function hair(view: View, px = 1): number {
  return px / view.scale;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Height where the sky reaches its high colour: climbing out of the pale band at the horizon is a cue for height. */
const SKY_TOP = 700;

function sky_and_ground(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { scenery, palette } = f;
  const sky = ctx.createLinearGradient(0, 0, 0, -SKY_TOP);
  sky.addColorStop(0, scenery.horizon);
  sky.addColorStop(1, scenery.sky);
  ctx.fillStyle = sky;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, Math.max(0, -box.y0));
  ctx.fillStyle = palette.grass;
  ctx.fillRect(box.x0, 0, box.x1 - box.x0, Math.max(0, box.y1));
  ctx.fillStyle = scenery.earth;
  ctx.fillRect(box.x0, 1.2, box.x1 - box.x0, Math.max(0, box.y1 - 1.2));
}

/**
 * Hills far off on the horizon, in screen pixels: at real scale a near hill would fill the view when zoomed in, so they
 * keep one size and slide past at `drift` pixels a metre flown. With the ground below the view they sink `sink` pixels
 * for each pixel it is below the bottom edge, so a climb drops them out of sight.
 */
function hills(ctx: CanvasRenderingContext2D, f: Frame, drift: number, sink: number, cell: number, height: number, colour: string, seed: number) {
  const { view } = f;
  const ground = view.height / 2 - view.y * view.scale;
  if (ground < 0) return;
  const base = (ground > view.height ? view.height + (ground - view.height) * sink : ground) + 1;
  if (base - height > view.height) return;
  const shift = -view.x * drift;
  const from = Math.floor(-shift / cell) - 1;
  const to = Math.ceil((view.width - shift) / cell) + 1;
  const peak = (i: number) => height * (0.35 + (hash(seed, i) % 1000) / 1500);
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.beginPath();
  ctx.moveTo(from * cell + shift, base);
  for (let i = from; i <= to; i++) {
    const x = i * cell + shift;
    const mid = x + cell / 2;
    ctx.quadraticCurveTo(x + cell / 4, base - peak(i), mid, base - peak(i) * 0.8);
    ctx.quadraticCurveTo(mid + cell / 4, base - peak(i) * 0.6, x + cell, base - peak(i + 1) * 0.3);
  }
  ctx.lineTo(to * cell + shift, base);
  ctx.lineTo(to * cell + shift, view.height + 1);
  ctx.lineTo(from * cell + shift, view.height + 1);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

interface CloudLayer {
  /** Distance factor: 1 sits beside the plane and passes at its speed, 0.3 is far off, smaller and slower. */
  depth: number;
  cell: number;
  low: number;
  high: number;
  /** Share of cells drawn as a long flat wisp instead of a heap. */
  wisps: number;
  size: number;
  alpha: number;
  seed: number;
}

const FAR_CLOUDS: CloudLayer = { depth: 0.3, cell: 120, low: 80, high: 900, wisps: 0.3, size: 1, alpha: 0.55, seed: 11 };
const MID_CLOUDS: CloudLayer = { depth: 0.6, cell: 70, low: 50, high: 500, wisps: 0.5, size: 0.6, alpha: 0.75, seed: 12 };
const NEAR_WISPS: CloudLayer = { depth: 1, cell: 12, low: 35, high: 220, wisps: 0.9, size: 0.3, alpha: 1, seed: 13 };
const HIGH_CLOUDS: CloudLayer = { depth: 1, cell: 420, low: 220, high: 1000, wisps: 0, size: 1, alpha: 1, seed: 14 };

/** One layer of clouds, filled as one path so overlaps don't darken. A layer's camera moves `depth` as far as the real one. */
function clouds(ctx: CanvasRenderingContext2D, f: Frame, box: Box, layer: CloudLayer) {
  const { view } = f;
  const d = layer.depth;
  const to_layer = (w: number, at: number) => at * d + (w - at) / d;
  const x0 = to_layer(box.x0, view.x);
  const x1 = to_layer(box.x1, view.x);
  const y0 = to_layer(box.y0, view.y);
  const y1 = to_layer(box.y1, view.y);
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(d, d);
  ctx.translate(-view.x * d, -view.y * d);
  ctx.beginPath();
  for (let i = Math.floor(x0 / layer.cell) - 1; i <= Math.ceil(x1 / layer.cell) + 1; i++) {
    const h = hash(layer.seed, i);
    if (h % 5 < 2) continue;
    const x = i * layer.cell + (h % layer.cell);
    const y = -(layer.low + ((h >>> 10) % 1000) / 1000 * (layer.high - layer.low));
    const w = layer.size * (40 + ((h >>> 6) % 90));
    if (y - w > y1 || y + w < y0 || x + w < x0 || x - w > x1) continue;
    if ((h >>> 20) % 100 < layer.wisps * 100) {
      for (const [dx, dy, rx, ry] of [
        [0, 0, 0.6, 0.045],
        [0.12, -0.05, 0.32, 0.04],
        [-0.3, 0.025, 0.25, 0.03],
      ]) {
        ctx.moveTo(x + (dx + rx) * w, y + dy * w);
        ctx.ellipse(x + dx * w, y + dy * w, rx * w, ry * w, 0, 0, Math.PI * 2, true);
      }
      continue;
    }
    const base = y + w * 0.1;
    for (let k = 0; k < 4; k++) {
      const kh = hash(h, k);
      const r = w * (0.2 + (kh % 37) / 260) * (k === 1 || k === 2 ? 1.35 : 1);
      const cx = x + (k - 1.5) * w * 0.32;
      ctx.moveTo(cx + r, base);
      ctx.arc(cx, base, r, 0, Math.PI, true);
      ctx.closePath();
    }
  }
  ctx.globalAlpha = layer.alpha;
  ctx.fillStyle = f.scenery.cloud;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function runway(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { field, palette, scenery, view } = f;
  const band = (x0: number, x1: number, depth: number) => {
    if (x1 < box.x0 || x0 > box.x1) return;
    ctx.fillStyle = scenery.runway;
    ctx.fillRect(x0, 0, x1 - x0, depth);
  };
  band(field.apron.x0, field.apron.x1, 1.2);
  band(field.runway.x0, field.runway.x1, 1.2);
  ctx.fillStyle = palette.paint;
  const r = field.runway;
  for (let x = r.x0 + 45; x < r.x1 - 45; x += 50) {
    if (x + 30 < box.x0 || x > box.x1) continue;
    ctx.fillRect(x, 0.5, 30, 0.14);
  }
  for (const [x0, dir] of [
    [r.x0, 1],
    [r.x1, -1],
  ] as const) {
    for (let k = 0; k < 6; k++) ctx.fillRect(x0 + dir * (3 + k * 3.2) - (dir < 0 ? 2.2 : 0), 0.15, 2.2, 0.9);
  }
  ctx.font = `600 0.85px ${f.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.paint;
  if (view.scale > 6) {
    ctx.fillText("09", r.x0 + 26, 0.6);
    ctx.fillText("27", r.x1 - 26, 0.6);
  }
  const kerb_from = Math.max(box.x0, field.apron.x0);
  const kerb_to = Math.min(box.x1, r.x1);
  ctx.fillStyle = palette.kerb;
  if (kerb_to > kerb_from) ctx.fillRect(kerb_from, -0.02, kerb_to - kerb_from, 0.05);
}

function trees(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { palette, view } = f;
  const edge = Math.max(0.06, hair(view, 1.25));
  ctx.lineJoin = "round";
  for (const tree of f.field.trees) {
    if (tree.x + tree.r < box.x0 || tree.x - tree.r > box.x1) continue;
    const { x, height } = tree;
    const r = Math.min(tree.r, height * 0.32);
    const trunk = Math.max(0.4, height * 0.07);
    ctx.beginPath();
    ctx.roundRect(x - trunk / 2, -height * 0.5, trunk, height * 0.5, trunk * 0.3);
    solid(ctx, palette.wood, edge, palette.edge);
    ctx.beginPath();
    if (hash(5, Math.round(x)) % 3 === 0) {
      for (let k = 0; k < 3; k++) {
        const top = -height + k * height * 0.22;
        const half = r * (0.6 + k * 0.22);
        ctx.moveTo(x, top);
        ctx.lineTo(x + half, top + height * 0.36);
        ctx.lineTo(x - half, top + height * 0.36);
        ctx.closePath();
      }
    } else {
      for (const [dx, dy, k] of [
        [0, 1, 1],
        [-0.62, 1.62, 0.74],
        [0.6, 1.5, 0.8],
      ]) {
        ctx.moveTo(x + dx * r + k * r, -height + dy * r);
        ctx.arc(x + dx * r, -height + dy * r, k * r, 0, Math.PI * 2);
      }
    }
    solid(ctx, palette.hedge_edge, edge, palette.edge);
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(x + r * 0.5, -height + r * 2.2, r * 1.3, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.restore();
  }
}

function hangar(ctx: CanvasRenderingContext2D, f: Frame) {
  const { field, palette, view } = f;
  const { x0, x1, height } = field.hangar;
  const w = x1 - x0;
  const edge = Math.max(0.06, hair(view, 1.25));
  const door = height * 0.64;
  ctx.beginPath();
  ctx.rect(x0 - 7, -height * 0.42, 7.4, height * 0.42);
  solid(ctx, palette.pillar, edge, palette.edge);
  ctx.beginPath();
  ctx.roundRect(x0 - 5.6, -height * 0.3, 2.4, height * 0.14, 0.2);
  ctx.roundRect(x0 - 2.6, -height * 0.3, 1.6, height * 0.3, 0.2);
  ctx.fillStyle = palette.garage;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, -height * 0.7);
  ctx.quadraticCurveTo(x0 + w / 2, -height * 1.25, x1, -height * 0.7);
  ctx.lineTo(x1, 0);
  ctx.closePath();
  solid(ctx, palette.steel, edge, palette.edge);
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.edge;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(0.05, hair(view, 1));
  ctx.beginPath();
  for (let x = x0 + 1.2; x < x1; x += 1.2) {
    ctx.moveTo(x, -height * 1.1);
    ctx.lineTo(x, 0);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.beginPath();
  ctx.rect(x0 + 1.5, -door, w - 3, door);
  solid(ctx, palette.garage, edge, palette.edge);
  ctx.strokeStyle = palette.kerb;
  ctx.lineWidth = Math.max(0.05, hair(view, 1));
  ctx.beginPath();
  for (let x = x0 + 1.5 + 3.5; x < x1 - 1.5; x += 3.5) {
    ctx.moveTo(x, -door);
    ctx.lineTo(x, 0);
  }
  ctx.stroke();
  if (view.scale > 3) {
    ctx.font = `600 ${Math.max(1.1, 12 / view.scale)}px ${f.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.ink;
    ctx.fillText(f.hangar_label, x0 + w / 2, -height * 0.83);
  }
}

function windsock(ctx: CanvasRenderingContext2D, f: Frame) {
  const { palette, view } = f;
  const x = f.field.windsock;
  const edge = Math.max(0.04, hair(view, 1.25));
  ctx.beginPath();
  ctx.roundRect(x - 0.09, -6.2, 0.18, 6.2, 0.09);
  solid(ctx, palette.steel, edge, palette.edge);
  const sway = Math.sin(f.time * 0.8) * 0.15;
  const dx = 0.45 + sway;
  const length = Math.hypot(dx, 1);
  const along = { x: dx / length, y: 1 / length };
  const across = { x: along.y, y: -along.x };
  const at = (t: number, side: number) => {
    const r = 0.34 - t * 0.07;
    return { x: x + 0.1 + along.x * t * 0.62 + across.x * r * side, y: -5.9 + along.y * t * 0.62 + across.y * r * side };
  };
  for (let k = 0; k < 4; k++) {
    const corners = [at(k, -1), at(k + 1, -1), at(k + 1, 1), at(k, 1)];
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = k % 2 ? palette.glow : palette.warning;
    ctx.fill();
  }
  ctx.beginPath();
  for (const p of [at(0, -1), at(4, -1), at(4, 1), at(0, 1)]) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = edge;
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
}

interface Point {
  x: number;
  y: number;
}

interface Station extends BodyPoint {
  w?: number;
}

/** A body point on screen in world units: foreshortened by the heading, so the plane turns away and back through a turn. */
function project(plane: Plane, p: BodyPoint, lateral = 0): Point {
  const cos = Math.cos(plane.pitch);
  const sin = Math.sin(plane.pitch);
  const s = p.x * cos - p.z * sin;
  const up = p.x * sin + p.z * cos;
  return {
    x: plane.x + s * Math.cos(plane.yaw) - lateral * Math.sin(plane.yaw),
    y: -(plane.h + up),
  };
}

function rounded(points: readonly Station[], rounds = 2): Station[] {
  let at: Station[] = [...points];
  for (let r = 0; r < rounds; r++) {
    const next: Station[] = [];
    at.forEach((p, i) => {
      const q = at[(i + 1) % at.length];
      const mix = (t: number): Station => ({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, w: (p.w ?? 1) + ((q.w ?? 1) - (p.w ?? 1)) * t });
      next.push(mix(0.25), mix(0.75));
    });
    at = next;
  }
  return at;
}

function disc(centre: BodyPoint, r: number, n = 16): BodyPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: centre.x + r * Math.cos((i / n) * Math.PI * 2), z: centre.z + r * Math.sin((i / n) * Math.PI * 2) }));
}

function subpath(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  let area = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    area += p.x * q.y - q.x * p.y;
  });
  const order = area < 0 ? [...points].reverse() : points;
  order.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/**
 * An outline swept across from `from` to `to` metres of lateral offset, added to the current path: the outline at both
 * ends and the band between each pair of edges, all wound one way so a nonzero fill paints their union. Side on, the two
 * ends land on each other; turned through the ground pivot, the fuselage shows its width and the wing its span.
 */
function swept(ctx: CanvasRenderingContext2D, plane: Plane, outline: readonly Station[], from: number, to = from) {
  const a = outline.map((p) => project(plane, p, from * (p.w ?? 1)));
  subpath(ctx, a);
  if (from === to) return;
  const b = outline.map((p) => project(plane, p, to * (p.w ?? 1)));
  if (Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y))) < 0.01) return;
  subpath(ctx, b);
  a.forEach((p, i) => {
    const j = (i + 1) % a.length;
    subpath(ctx, [p, a[j], b[j], b[i]]);
  });
}

/** Fills the current path with an outline round its outside only, so overlapping swept parts read as one body. */
function solid(ctx: CanvasRenderingContext2D, colour: string, edge: number, edge_colour: string) {
  ctx.lineJoin = "round";
  ctx.lineWidth = edge * 2;
  ctx.strokeStyle = edge_colour;
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fill();
}

function rod(ctx: CanvasRenderingContext2D, plane: Plane, a: BodyPoint, a_side: number, b: BodyPoint, b_side: number, width: number, colour: string) {
  const p = project(plane, a, a_side);
  const q = project(plane, b, b_side);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = colour;
  ctx.stroke();
}

function hinged(from: BodyPoint, length: number, angle: number): BodyPoint {
  return { x: from.x - length * Math.cos(angle), z: from.z - length * Math.sin(angle) };
}

const FUSELAGE = rounded([
  { x: 2.0, z: 0.5, w: 0.36 },
  { x: 1.55, z: 0.68, w: 0.4 },
  { x: 1.12, z: 0.74, w: 0.42 },
  { x: 0.55, z: 1.34, w: 0.4 },
  { x: -0.7, z: 1.34, w: 0.38 },
  { x: -1.5, z: 0.98, w: 0.32 },
  { x: -4.4, z: 0.52, w: 0.1 },
  { x: -4.85, z: 0.46, w: 0.06 },
  { x: -4.88, z: 0.12, w: 0.06 },
  { x: -3.5, z: -0.04, w: 0.14 },
  { x: -1.0, z: -0.32, w: 0.34 },
  { x: 0.6, z: -0.44, w: 0.4 },
  { x: 1.65, z: -0.34, w: 0.38 },
  { x: 2.02, z: -0.14, w: 0.34 },
]);
const FIN = rounded(
  [
    { x: -3.6, z: 0.66 },
    { x: -4.3, z: 1.32 },
    { x: -4.55, z: 1.58 },
    { x: -4.82, z: 1.58 },
    { x: -4.98, z: 1.3 },
    { x: -4.9, z: 0.4 },
  ],
  1
);
const WINDOWS: BodyPoint[] = [
  { x: 1.08, z: 0.8 },
  { x: 0.55, z: 1.13 },
  { x: -0.55, z: 1.13 },
  { x: -0.55, z: 0.6 },
  { x: 0.9, z: 0.6 },
];
const COWL: Station[] = [
  { x: 1.3, z: -1 },
  { x: 2.4, z: -1 },
  { x: 2.4, z: 1 },
  { x: 1.3, z: 1 },
];
const STRIPE: Station[] = [
  { x: 1.3, z: 0.4 },
  { x: -1.5, z: 0.4 },
  { x: -4.9, z: 0.34 },
  { x: -4.9, z: 0.24 },
  { x: -1.5, z: 0.26 },
  { x: 1.3, z: 0.26 },
];
const BELLY: Station[] = [
  { x: 2.4, z: -0.12 },
  { x: -5, z: 0.06 },
  { x: -5, z: -1 },
  { x: 2.4, z: -1 },
];
const SPINNER = rounded(
  [
    { x: 1.98, z: 0.42 },
    { x: 2.36, z: 0.15 },
    { x: 1.98, z: -0.12 },
  ],
  1
);
const WING = rounded(
  [
    { x: 0.82, z: 1.3 },
    { x: 0.55, z: 1.46 },
    { x: 0.05, z: 1.5 },
    { x: -0.44, z: 1.42 },
    { x: -0.44, z: 1.27 },
    { x: 0.55, z: 1.24 },
  ],
  1
);
const TAILPLANE: BodyPoint[] = [
  { x: -3.7, z: 0.48 },
  { x: -3.9, z: 0.55 },
  { x: -4.42, z: 0.54 },
  { x: -4.42, z: 0.42 },
  { x: -3.9, z: 0.41 },
];
const FLAP_HINGE: BodyPoint = { x: -0.44, z: 1.345 };
const ELEVATOR_HINGE: BodyPoint = { x: -4.42, z: 0.48 };
const MAIN_AXLE: BodyPoint = { x: 0.35, z: -0.7 };
const TYRE = disc(MAIN_AXLE, 0.3);
const HUB = disc(MAIN_AXLE, 0.12, 10);
const TAIL_AXLE: BodyPoint = { x: -4.6, z: -0.1 };
const TAIL_TYRE = disc(TAIL_AXLE, 0.1, 10);
const PROP_HUB: BodyPoint = { x: 2.12, z: 0.15 };
const TRACK = 0.9;
const TYRE_HALF = 0.12;
const FLAP_SPAN = [0.45, 2.9];
const STRUT_FOOT: BodyPoint = { x: 0.2, z: -0.2 };

function draw_plane(ctx: CanvasRenderingContext2D, f: Frame) {
  const { plane, palette, view } = f;
  const paint = palette.player;
  const edge = Math.max(0.035, hair(view, 1.25));
  const span = f.c.spec.span / 2;
  const near = Math.sin(plane.yaw) >= 0 ? 1 : -1;
  // Drawn longer than the real 0.42 m chord when zoomed out and dark once lowered (the body is the accent colour), so the setting reads at circuit height.
  const flap_length = Math.max(0.42, hair(view, 7));
  const flap_tip = hinged(FLAP_HINGE, flap_length, (Math.PI / 180) * 40 * plane.flaps);
  const flap_down = plane.flaps > 0.02;
  const elevator_tip = hinged(ELEVATOR_HINGE, 0.48, -plane.elevator * 0.45);
  const rod_width = Math.max(0.07, hair(view, 1.5));
  // The springs let a contact point sink below the ground; the tyre is drawn lifted back onto it and the leg shortened.
  const lift = (contact: BodyPoint) => {
    const sunk = Math.max(0, -point_at(plane, contact).height);
    return (p: BodyPoint): BodyPoint => ({ x: p.x + sunk * Math.sin(plane.pitch), z: p.z + sunk * Math.cos(plane.pitch) });
  };
  const main_up = lift(f.c.spec.gear.main);
  const tail_up = lift(f.c.spec.gear.tail);
  const axle = main_up(MAIN_AXLE);
  const tyre = TYRE.map(main_up);
  const hub_disc = HUB.map(main_up);

  const half = (sign: number) => {
    const first = sign !== near;
    const tailplane = () => {
      ctx.beginPath();
      swept(ctx, plane, TAILPLANE, 0, sign * 1.6);
      solid(ctx, paint.body, edge, palette.edge);
      ctx.beginPath();
      swept(ctx, plane, [{ x: -4.42, z: 0.53 }, elevator_tip, { x: -4.42, z: 0.43 }], sign * 0.05, sign * 1.6);
      solid(ctx, paint.roof, edge, palette.edge);
    };
    const gear = () => {
      rod(ctx, plane, { x: 0.8, z: -0.38 }, sign * 0.3, axle, sign * TRACK, rod_width, palette.ink);
      rod(ctx, plane, { x: -0.1, z: -0.34 }, sign * 0.3, axle, sign * TRACK, rod_width, palette.ink);
      ctx.beginPath();
      swept(ctx, plane, tyre, sign * (TRACK - TYRE_HALF), sign * (TRACK + TYRE_HALF));
      solid(ctx, palette.ink, edge, palette.edge);
      if (!first) {
        ctx.beginPath();
        swept(ctx, plane, hub_disc, sign * (TRACK + TYRE_HALF));
        ctx.fillStyle = palette.steel;
        ctx.fill();
      }
    };
    const wing = () => {
      for (const x of [0.5, -0.15]) rod(ctx, plane, STRUT_FOOT, sign * 0.38, { x, z: 1.25 }, sign * 2.9, rod_width, paint.roof);
      ctx.beginPath();
      swept(ctx, plane, WING, sign * 0.3, sign * span);
      solid(ctx, paint.body, edge, palette.edge);
      ctx.beginPath();
      swept(ctx, plane, [{ x: -0.44, z: 1.41 }, flap_tip, { x: -0.44, z: 1.28 }], sign * FLAP_SPAN[0], sign * FLAP_SPAN[1]);
      solid(ctx, flap_down ? palette.ink : paint.body, edge, palette.edge);
    };
    if (first) {
      wing();
      gear();
      tailplane();
    } else {
      tailplane();
      gear();
      wing();
    }
  };

  half(-near);
  rod(ctx, plane, { x: -4.25, z: 0.08 }, 0, tail_up(TAIL_AXLE), 0, rod_width, palette.ink);
  ctx.beginPath();
  swept(ctx, plane, TAIL_TYRE.map(tail_up), -0.05, 0.05);
  solid(ctx, palette.ink, edge, palette.edge);

  ctx.beginPath();
  swept(ctx, plane, FUSELAGE, -1, 1);
  swept(ctx, plane, FIN, -0.05, 0.05);
  solid(ctx, paint.body, edge, palette.edge);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  swept(ctx, plane, BELLY, -0.45, 0.45);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.beginPath();
  swept(ctx, plane, STRIPE, -0.45, 0.45);
  swept(ctx, plane, COWL, -0.45, 0.45);
  ctx.fillStyle = paint.roof;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  swept(ctx, plane, WINDOWS, near * 0.41);
  ctx.fillStyle = paint.glass;
  ctx.fill();
  rod(ctx, plane, { x: 0.02, z: 1.13 }, near * 0.41, { x: 0.02, z: 0.6 }, near * 0.41, Math.max(0.05, hair(view, 1)), paint.body);

  half(near);

  ctx.beginPath();
  swept(ctx, plane, SPINNER, -0.16, 0.16);
  solid(ctx, paint.roof, edge, palette.edge);
  const hub = project(plane, PROP_HUB);
  const r = f.c.spec.prop_radius;
  const up = project(plane, { x: PROP_HUB.x, z: PROP_HUB.z + r });
  const across = project(plane, PROP_HUB, r);
  const u = { x: up.x - hub.x, y: up.y - hub.y };
  const v = { x: across.x - hub.x, y: across.y - hub.y };
  ctx.lineCap = "round";
  if (plane.spool > 0.02) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const x = hub.x + u.x * Math.cos(t) + v.x * Math.sin(t);
      const y = hub.y + u.y * Math.cos(t) + v.y * Math.sin(t);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.25 + plane.spool * 0.25;
    ctx.fillStyle = palette.cars[3].glass;
    ctx.fill();
    ctx.lineWidth = Math.max(0.1, hair(view, 2.5));
    ctx.strokeStyle = palette.cars[3].glass;
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    ctx.beginPath();
    ctx.moveTo(hub.x + u.x, hub.y + u.y);
    ctx.lineTo(hub.x - u.x, hub.y - u.y);
    ctx.lineWidth = Math.max(0.12, hair(view, 2.5));
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }
}

function shadow(ctx: CanvasRenderingContext2D, f: Frame) {
  const { plane, c } = f;
  const fade = Math.max(0, 1 - plane.h / 120);
  if (fade <= 0) return;
  const side = Math.abs(Math.cos(plane.yaw));
  const width = (c.spec.length * side + c.spec.span * (1 - side)) * 0.5;
  ctx.globalAlpha = fade;
  ellipse(ctx, plane.x, 0.05, width * (0.7 + 0.3 * fade), 0.18, f.scenery.shadow);
  ctx.globalAlpha = 1;
}

function puffs(ctx: CanvasRenderingContext2D, f: Frame) {
  for (const puff of f.puffs) {
    const t = puff.age / PUFF_LIFE;
    ctx.globalAlpha = Math.max(0, 0.5 * (1 - t));
    ellipse(ctx, puff.x - t * 2, -0.4 - t * 0.8, 0.5 + t * 2.4 * puff.size, 0.3 + t * 1.1 * puff.size, f.palette.glow);
  }
  ctx.globalAlpha = 1;
}

/** The approach profile, top right: the field from 3 km out each side, height stretched, the 3° glidepaths and the plane. */
function profile(ctx: CanvasRenderingContext2D, f: Frame) {
  const { view, palette, field, plane } = f;
  const w = Math.min(190, view.width * 0.42);
  const h = w * 0.36;
  const x0 = view.width - w - 8 - f.insets.right;
  const y0 = 8 + f.insets.top;
  const reach = 3000;
  const top = 300;
  const left = field.runway.x0 - reach;
  const right = field.runway.x1 + reach;
  const sx = (x: number) => x0 + ((x - left) / (right - left)) * w;
  const sy = (alt: number) => y0 + h - 5 - (Math.min(alt, top) / top) * (h - 10);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = palette.floor;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.kerb;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.faint;
  ctx.beginPath();
  ctx.moveTo(x0, sy(0));
  ctx.lineTo(x0 + w, sy(0));
  ctx.stroke();
  const slope = Math.tan((3 * Math.PI) / 180);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = palette.guide;
  for (const [x, dir] of [
    [field.runway.x0 + 120, -1],
    [field.runway.x1 - 120, 1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx(x), sy(0));
    ctx.lineTo(sx(x + dir * (top / slope)), sy(top));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = palette.paint;
  ctx.beginPath();
  ctx.moveTo(sx(field.runway.x0), sy(0));
  ctx.lineTo(sx(field.runway.x1), sy(0));
  ctx.stroke();
  const px = Math.max(x0 + 4, Math.min(x0 + w - 4, sx(home_x(field, plane.x))));
  const py = Math.max(y0 + 4, sy(plane.h));
  const face = facing(plane);
  ctx.beginPath();
  ctx.moveTo(px + face * 5, py);
  ctx.lineTo(px - face * 4, py - 3.5);
  ctx.lineTo(px - face * 4, py + 3.5);
  ctx.closePath();
  ctx.fillStyle = palette.target;
  ctx.fill();
  ctx.restore();
}

export function draw_frame(ctx: CanvasRenderingContext2D, f: Frame) {
  begin_frame(ctx, f.view, f.palette);
  const box = visible(f.view);
  sky_and_ground(ctx, f, box);
  if (box.y0 < 0) {
    clouds(ctx, f, box, FAR_CLOUDS);
    hills(ctx, f, 0.08, 0.06, 420, Math.min(110, f.view.height * 0.2), f.scenery.far_hill, 3);
    clouds(ctx, f, box, MID_CLOUDS);
    hills(ctx, f, 0.25, 0.12, 180, Math.min(50, f.view.height * 0.09), f.scenery.hill, 4);
    clouds(ctx, f, box, HIGH_CLOUDS);
    clouds(ctx, f, box, NEAR_WISPS);
  }
  ctx.fillStyle = f.palette.grass;
  ctx.fillRect(box.x0, 0, box.x1 - box.x0, 0.02);
  for (const offset of field_copies(f.field, box.x0, box.x1)) {
    const near = { ...box, x0: box.x0 - offset, x1: box.x1 - offset };
    ctx.save();
    ctx.translate(offset, 0);
    trees(ctx, f, near);
    windsock(ctx, f);
    runway(ctx, f, near);
    hangar(ctx, f);
    ctx.restore();
  }
  shadow(ctx, f);
  draw_plane(ctx, f);
  puffs(ctx, f);
  if (f.profile) profile(ctx, f);
}
