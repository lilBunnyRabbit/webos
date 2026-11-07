import { resolve_token } from "$lib/core/utils";
import type { Insets } from "$kit/games/play2d/camera";
import { begin_frame, type View } from "$kit/games/play2d/canvas";
import type { Palette } from "$kit/games/play2d/palette";
import { hash } from "$kit/games/play2d/seed";
import type { PlaneArt, Station } from "./art";
import { field_copies, home_x, type Field } from "./field";
import { clearance, facing, point_at, type BodyPoint, type Coefficients, type Env, type Plane } from "./plane";
import type { Weather } from "./weather";

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
  art: PlaneArt;
  env: Env;
  weather: Weather;
  wrap: number;
  /** The wind at the windsock, m/s along +x. */
  sock_wind: number;
  /** A glider on the winch: the drum's place along the world, and whether the cable is on. */
  winch: { drum: number; on: boolean } | null;
  /** The approach profile's reach either side of the runway and its height, metres. */
  profile_size: { reach: number; top: number };
  ground_at: (x: number) => number;
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
  // Clouds drift with the wind aloft, so a head or tail wind shows before the windsock is in sight.
  const drift = f.weather.wind * f.time * 0.8;
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(d, d);
  ctx.translate(-view.x * d, -view.y * d);
  ctx.beginPath();
  for (let i = Math.floor((x0 - drift) / layer.cell) - 1; i <= Math.ceil((x1 - drift) / layer.cell) + 1; i++) {
    const h = hash(layer.seed, i);
    if (h % 5 < 2) continue;
    const x = i * layer.cell + (h % layer.cell) + drift;
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
  // Calm, the sock hangs; by 7 m/s it streams out flat downwind, and flaps harder in a gust.
  const strength = Math.min(1, Math.abs(f.sock_wind) / 7);
  const sway = Math.sin(f.time * (0.8 + strength * 3)) * (0.15 + strength * 0.25);
  const dx = (f.sock_wind < 0 ? -1 : 1) * (0.15 + strength * 3) + sway;
  const length = Math.hypot(dx, 1);
  const along = { x: dx / length, y: 1 / length };
  const across = { x: along.y, y: -along.x };
  const at = (t: number, side: number) => {
    const r = 0.34 - t * 0.07;
    return { x: x + 0.1 * Math.sign(dx) + along.x * t * 0.62 + across.x * r * side, y: -5.9 + along.y * t * 0.62 + across.y * r * side };
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

function draw_plane(ctx: CanvasRenderingContext2D, f: Frame) {
  const { plane, palette, view, art } = f;
  const paint = palette.player;
  const edge = Math.max(0.035, hair(view, 1.25));
  const span = f.c.spec.span / 2;
  const near = Math.sin(plane.yaw) >= 0 ? 1 : -1;
  const body = art.width * Math.max(...art.fuselage.map((p) => p.w ?? 1)) * 1.07;
  const rod_width = Math.max(0.07 * Math.sqrt(art.width), hair(view, 1.5));
  // Drawn longer than the real chord when zoomed out and dark once lowered (the body is the accent colour), so the setting reads at circuit height.
  const flap = art.flap;
  const flap_tip = flap ? hinged(flap.hinge, Math.max(flap.chord, hair(view, 7)), flap.travel * plane.flaps) : null;
  const flap_down = plane.flaps > 0.02;
  const elevator_tip = hinged(art.elevator.hinge, art.elevator.chord, -plane.elevator * art.elevator.travel);
  // The springs let a contact point sink below the ground; the tyre is drawn lifted back onto it and the leg shortened.
  const lift = (contact: BodyPoint) => {
    const sunk = Math.max(0, -clearance(plane, contact, f.env).height);
    return (p: BodyPoint): BodyPoint => ({ x: p.x + sunk * Math.sin(plane.pitch), z: p.z + sunk * Math.cos(plane.pitch) });
  };
  const main_up = lift(f.c.spec.gear.main);
  const aux_up = lift(f.c.spec.gear.aux);
  const axle = main_up(art.main.axle);
  const tyre = disc(art.main.axle, art.main.tyre).map(main_up);
  const hub_disc = disc(art.main.axle, art.main.hub, 10).map(main_up);

  const main_wheel = (side: number, show_hub: boolean) => {
    for (const leg of art.main.legs) rod(ctx, plane, leg.from, Math.sign(side) * leg.side, axle, side, rod_width, palette.ink);
    ctx.beginPath();
    swept(ctx, plane, tyre, side - art.main.half, side + art.main.half);
    solid(ctx, palette.ink, edge, palette.edge);
    if (!show_hub) return;
    ctx.beginPath();
    swept(ctx, plane, hub_disc, side + Math.sign(side || 1) * art.main.half);
    ctx.fillStyle = palette.steel;
    ctx.fill();
  };

  const half = (sign: number) => {
    const first = sign !== near;
    const tailplane = () => {
      ctx.beginPath();
      swept(ctx, plane, art.tailplane, sign * art.tail_root, sign * art.tail_span);
      solid(ctx, paint.body, edge, palette.edge);
      const e = art.elevator;
      ctx.beginPath();
      swept(ctx, plane, [e.upper, elevator_tip, e.lower], sign * e.span[0], sign * e.span[1]);
      solid(ctx, paint.roof, edge, palette.edge);
    };
    const gear = () => {
      if (art.main.track > 0) main_wheel(sign * art.main.track, !first);
    };
    const pod = () => {
      const p = art.pods;
      if (!p) return;
      rod(ctx, plane, p.pylon[0], sign * p.side, p.pylon[1], sign * p.side, Math.max(0.25, hair(view, 2)), paint.body);
      ctx.beginPath();
      swept(ctx, plane, p.outline, sign * (p.side - p.half), sign * (p.side + p.half));
      solid(ctx, paint.body, edge, palette.edge);
      ctx.beginPath();
      swept(ctx, plane, p.outline.filter((q) => q.x > p.pylon[0].x + 1.2), sign * (p.side + p.half));
      ctx.fillStyle = paint.roof;
      ctx.fill();
    };
    const wing = () => {
      const st = art.struts;
      if (st) for (const top of st.tops) rod(ctx, plane, st.foot, sign * st.foot_side, top, sign * st.top_side, rod_width, paint.roof);
      ctx.beginPath();
      swept(ctx, plane, art.wing, sign * art.wing_root, sign * span);
      solid(ctx, paint.body, edge, palette.edge);
      if (flap && flap_tip) {
        ctx.beginPath();
        swept(ctx, plane, [flap.upper, flap_tip, flap.lower], sign * flap.span[0], sign * flap.span[1]);
        solid(ctx, flap_down ? palette.ink : paint.body, edge, palette.edge);
      }
      const sp = art.spoiler;
      if (sp && plane.spoilers > 0.02) {
        const tip = hinged(sp.at, sp.chord, -plane.spoilers * 0.9);
        ctx.beginPath();
        swept(ctx, plane, [sp.at, tip, { x: sp.at.x, z: sp.at.z - 0.02 }], sign * sp.span[0], sign * sp.span[1]);
        solid(ctx, palette.ink, edge, palette.edge);
      }
    };
    if (first) {
      wing();
      pod();
      gear();
      tailplane();
    } else {
      tailplane();
      gear();
      wing();
      pod();
    }
  };

  half(-near);
  rod(ctx, plane, art.aux.leg, 0, aux_up(art.aux.axle), 0, rod_width, palette.ink);
  ctx.beginPath();
  const aux_half = Math.max(0.05, art.aux.tyre * 0.5);
  swept(ctx, plane, disc(art.aux.axle, art.aux.tyre, 10).map(aux_up), -aux_half, aux_half);
  solid(ctx, palette.ink, edge, palette.edge);
  if (art.main.track === 0) main_wheel(0, false);

  ctx.beginPath();
  swept(ctx, plane, art.fuselage, -art.width, art.width);
  swept(ctx, plane, art.fin, -0.05 * art.width, 0.05 * art.width);
  solid(ctx, paint.body, edge, palette.edge);
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  swept(ctx, plane, art.belly, -body, body);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.beginPath();
  for (const part of art.trim) swept(ctx, plane, part, -body, body);
  ctx.fillStyle = paint.roof;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  for (const window of art.windows) swept(ctx, plane, window, near * art.window_side);
  ctx.fillStyle = paint.glass;
  ctx.fill();
  for (const [a, b] of art.posts) rod(ctx, plane, a, near * art.window_side, b, near * art.window_side, Math.max(0.05, hair(view, 1)), paint.body);

  half(near);

  if (!art.prop_hub) return;
  if (art.spinner) {
    ctx.beginPath();
    swept(ctx, plane, art.spinner, -0.16, 0.16);
    solid(ctx, paint.roof, edge, palette.edge);
  }
  const hub = project(plane, art.prop_hub);
  const r = f.c.spec.prop_radius;
  const up = project(plane, { x: art.prop_hub.x, z: art.prop_hub.z + r });
  const across = project(plane, art.prop_hub, r);
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
  const { reach, top } = f.profile_size;
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

/** A heap of cumulus over each thermal's top, and a faint shimmer over the ground where it rises: the glider pilot's cues. */
function thermal_cues(ctx: CanvasRenderingContext2D, f: Frame, box: Box, part: "clouds" | "shimmer") {
  const { scenery, view } = f;
  for (const t of f.weather.thermals) {
    if (t.strength <= 0) continue;
    const k0 = Math.ceil((box.x0 - t.x - t.radius * 2) / f.wrap);
    const k1 = Math.floor((box.x1 - t.x + t.radius * 2) / f.wrap);
    for (let k = k0; k <= k1; k++) {
      const x = t.x + k * f.wrap;
      if (part === "clouds") {
        const base = -(t.top + 30);
        const w = t.radius * 1.4 * Math.min(1.3, 0.6 + t.strength / 4);
        if (base - w > box.y1 || base + w * 0.2 < box.y0) continue;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const h = hash(Math.round(t.x), i);
          const r = w * (0.22 + (h % 30) / 200) * (i === 2 || i === 3 ? 1.4 : 1);
          const cx = x + (i - 2.5) * w * 0.3;
          ctx.moveTo(cx + r, base);
          ctx.arc(cx, base, r, 0, Math.PI, true);
          ctx.closePath();
        }
        ctx.rect(x - w * 0.95, base, w * 1.9, w * 0.06);
        ctx.fillStyle = scenery.cloud;
        ctx.fill();
        continue;
      }
      if (box.y1 < -40) continue;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = scenery.cloud;
      ctx.lineWidth = Math.max(0.15, hair(view, 1.5));
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const sx = x + (i - 2) * t.radius * 0.25;
        for (let y = 0; y <= 30; y += 2) {
          const wobble = Math.sin(y * 0.5 + f.time * 3 + i) * 0.8;
          if (y === 0) ctx.moveTo(sx + wobble, -y - f.ground_at(sx));
          else ctx.lineTo(sx + wobble, -y - f.ground_at(sx));
        }
      }
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** The winch truck at the drum and, while it pulls, the cable up to the glider's hook. */
function winch(ctx: CanvasRenderingContext2D, f: Frame) {
  if (!f.winch) return;
  const { palette, view, plane } = f;
  const x = f.winch.drum;
  const ground = f.ground_at(x);
  const edge = Math.max(0.04, hair(view, 1.25));
  ctx.beginPath();
  ctx.roundRect(x - 2.2, -ground - 2.4, 4.4, 1.9, 0.3);
  ctx.roundRect(x + 1.2, -ground - 3.2, 1.6, 1.2, 0.25);
  solid(ctx, palette.steel, edge, palette.edge);
  for (const wx of [x - 1.4, x + 1.5]) ellipse(ctx, wx, -ground - 0.45, 0.45, 0.45, palette.ink);
  if (!f.winch.on) return;
  const hook = project(plane, f.art.main.axle);
  ctx.beginPath();
  ctx.moveTo(hook.x, hook.y);
  ctx.lineTo(x - 1.6, -ground - 1.9);
  ctx.lineWidth = Math.max(0.03, hair(view, 1));
  ctx.strokeStyle = palette.ink;
  ctx.stroke();
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
    thermal_cues(ctx, f, box, "clouds");
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
  thermal_cues(ctx, f, box, "shimmer");
  winch(ctx, f);
  shadow(ctx, f);
  draw_plane(ctx, f);
  puffs(ctx, f);
  if (f.profile) profile(ctx, f);
}
