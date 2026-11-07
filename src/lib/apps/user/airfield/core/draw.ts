import { resolve_token } from "$lib/core/utils";
import type { Insets } from "$kit/games/play2d/camera";
import { begin_frame, type View } from "$kit/games/play2d/canvas";
import type { Palette } from "$kit/games/play2d/palette";
import { hash } from "$kit/games/play2d/seed";
import type { Field } from "./field";
import { facing, type BodyPoint, type Coefficients, type Plane } from "./plane";

export interface Scenery {
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
    sky: token("color-mix(in oklch, var(--info) 10%, var(--background))"),
    cloud: token("color-mix(in oklch, var(--foreground) 9%, transparent)"),
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

function sky_and_ground(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { scenery, palette } = f;
  ctx.fillStyle = scenery.sky;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, Math.max(0, -box.y0));
  ctx.fillStyle = palette.grass;
  ctx.fillRect(box.x0, 0, box.x1 - box.x0, Math.max(0, box.y1));
  ctx.fillStyle = scenery.earth;
  ctx.fillRect(box.x0, 1.4, box.x1 - box.x0, Math.max(0, box.y1 - 1.4));
}

/**
 * Hills far off on the horizon, in screen pixels: at real scale a near hill would fill the view when zoomed in, so they
 * keep one size and slide past at `drift` pixels a metre flown.
 */
function hills(ctx: CanvasRenderingContext2D, f: Frame, drift: number, cell: number, height: number, colour: string, seed: number) {
  const { view } = f;
  const ground = view.height / 2 - view.y * view.scale;
  if (ground < 0) return;
  const base = Math.min(ground, view.height) + 1;
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
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

function clouds(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const cell = 420;
  const from = Math.floor(box.x0 / cell) - 1;
  const to = Math.ceil(box.x1 / cell) + 1;
  for (let i = from; i <= to; i++) {
    for (let layer = 0; layer < 2; layer++) {
      const h = hash(7 + layer, i);
      if (h % 3 === 0) continue;
      const x = i * cell + (h % cell);
      const y = -(220 + layer * 420 + ((h >> 10) % 260));
      const w = 50 + ((h >> 6) % 90);
      if (y - w > box.y1 || y + w < box.y0) continue;
      for (let k = 0; k < 4; k++) {
        const kh = hash(h, k);
        ellipse(ctx, x + (k - 1.5) * w * 0.35, y + ((kh % 100) / 100 - 0.5) * w * 0.15, w * (0.3 + (kh % 37) / 120), w * (0.16 + (kh % 23) / 200), f.scenery.cloud);
      }
    }
  }
}

function runway(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { field, palette, scenery, view } = f;
  const band = (x0: number, x1: number, depth: number) => {
    if (x1 < box.x0 || x0 > box.x1) return;
    ctx.fillStyle = scenery.runway;
    ctx.fillRect(x0, 0, x1 - x0, depth);
  };
  band(field.apron.x0, field.apron.x1, 0.9);
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
  ctx.fillStyle = palette.kerb;
  ctx.fillRect(Math.max(box.x0, field.apron.x0), -0.02, Math.min(box.x1, r.x1) - Math.max(box.x0, field.apron.x0), 0.05);
}

function trees(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const { palette } = f;
  for (const tree of f.field.trees) {
    if (tree.x + tree.r < box.x0 || tree.x - tree.r > box.x1) continue;
    ctx.fillStyle = palette.wood;
    ctx.fillRect(tree.x - 0.25, -tree.height * 0.55, 0.5, tree.height * 0.55);
    ellipse(ctx, tree.x, -tree.height + tree.r * 0.9, tree.r, tree.r * 1.15, palette.hedge_edge);
    ellipse(ctx, tree.x - tree.r * 0.35, -tree.height + tree.r * 1.2, tree.r * 0.6, tree.r * 0.6, palette.hedge_leaf);
  }
}

function hangar(ctx: CanvasRenderingContext2D, f: Frame) {
  const { field, palette, view } = f;
  const { x0, x1, height } = field.hangar;
  const w = x1 - x0;
  ctx.beginPath();
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, -height * 0.7);
  ctx.quadraticCurveTo(x0 + w / 2, -height * 1.25, x1, -height * 0.7);
  ctx.lineTo(x1, 0);
  ctx.closePath();
  ctx.fillStyle = palette.wall;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = hair(view, 1.5);
  ctx.stroke();
  ctx.fillStyle = palette.garage;
  ctx.fillRect(x0 + 1.5, -height * 0.62, w - 3, height * 0.62);
  ctx.strokeStyle = palette.kerb;
  ctx.lineWidth = hair(view);
  for (let x = x0 + 1.5 + 3.5; x < x1 - 1.5; x += 3.5) {
    ctx.beginPath();
    ctx.moveTo(x, -height * 0.62);
    ctx.lineTo(x, 0);
    ctx.stroke();
  }
  if (view.scale > 3) {
    ctx.font = `600 ${Math.max(1.1, 12 / view.scale)}px ${f.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.paint;
    ctx.fillText(f.hangar_label, x0 + w / 2, -height * 0.82);
  }
}

function windsock(ctx: CanvasRenderingContext2D, f: Frame) {
  const { palette, view } = f;
  const x = f.field.windsock;
  ctx.strokeStyle = palette.steel;
  ctx.lineWidth = Math.max(0.12, hair(view, 1.5));
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, -6);
  ctx.stroke();
  const sway = Math.sin(f.time * 0.8) * 0.15;
  for (let k = 0; k < 4; k++) {
    ctx.beginPath();
    const a = 0.6 + k * 0.45;
    const b = a + 0.45;
    ctx.moveTo(x + sway * a, -6 + a * 0.95);
    ctx.lineTo(x + sway * b, -6 + b * 0.95);
    ctx.lineWidth = 0.55 - k * 0.08;
    ctx.strokeStyle = k % 2 ? palette.paint : palette.warning;
    ctx.stroke();
  }
}

/** A body point on screen in world units: foreshortened by the heading, so the plane turns away and back through a turn. */
function project(plane: Plane, p: BodyPoint, lateral = 0): { x: number; y: number } {
  const cos = Math.cos(plane.pitch);
  const sin = Math.sin(plane.pitch);
  const s = p.x * cos - p.z * sin;
  const up = p.x * sin + p.z * cos;
  return {
    x: plane.x + s * Math.cos(plane.yaw) - lateral * Math.sin(plane.yaw) * Math.cos(plane.bank),
    y: -(plane.h + up - lateral * Math.sin(plane.bank)),
  };
}

function shape(ctx: CanvasRenderingContext2D, plane: Plane, points: readonly BodyPoint[]) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const at = project(plane, p);
    if (i === 0) ctx.moveTo(at.x, at.y);
    else ctx.lineTo(at.x, at.y);
  });
  ctx.closePath();
}

function line(ctx: CanvasRenderingContext2D, plane: Plane, a: BodyPoint, b: BodyPoint, width: number, colour: string) {
  const p = project(plane, a);
  const q = project(plane, b);
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

const FUSELAGE: BodyPoint[] = [
  { x: 2.0, z: 0.15 },
  { x: 1.95, z: 0.55 },
  { x: 1.2, z: 0.95 },
  { x: 0.5, z: 1.2 },
  { x: -0.9, z: 1.12 },
  { x: -4.3, z: 0.55 },
  { x: -4.75, z: 0.42 },
  { x: -4.7, z: 0.05 },
  { x: -1.0, z: -0.35 },
  { x: 0.9, z: -0.45 },
  { x: 1.9, z: -0.25 },
];
const WINDOW: BodyPoint[] = [
  { x: 1.12, z: 0.88 },
  { x: 0.5, z: 1.08 },
  { x: 0.45, z: 0.55 },
  { x: 1.05, z: 0.5 },
];
const FIN: BodyPoint[] = [
  { x: -3.85, z: 0.6 },
  { x: -4.45, z: 1.5 },
  { x: -4.9, z: 1.5 },
  { x: -4.8, z: 0.42 },
];

function draw_plane(ctx: CanvasRenderingContext2D, f: Frame) {
  const { plane, palette, view } = f;
  const paint = palette.player;
  const edge = hair(view, 1);
  const thick = Math.max(0.09, hair(view, 1.6));
  const side = Math.abs(Math.cos(plane.yaw));
  const span = f.c.spec.span / 2;
  const wing_far = Math.sin(plane.yaw) * Math.cos(plane.bank) >= 0 ? -1 : 1;
  const wing_bar = (sign: number) => {
    if (Math.abs(Math.sin(plane.yaw)) < 0.05 && Math.abs(Math.sin(plane.bank)) < 0.05) return;
    const root = project(plane, { x: -0.05, z: 1.25 });
    const tip = project(plane, { x: -0.05, z: 1.25 }, sign * span);
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineWidth = Math.max(0.18, 0.2 + 1.4 * (1 - side) * 0.3);
    ctx.lineCap = "round";
    ctx.strokeStyle = paint.roof;
    ctx.stroke();
  };
  wing_bar(wing_far);
  line(ctx, plane, { x: -3.8, z: 0.45 }, { x: -4.45, z: 0.45 }, thick, paint.roof);
  line(ctx, plane, { x: -4.45, z: 0.45 }, hinged({ x: -4.45, z: 0.45 }, 0.45, -plane.elevator * 0.45), thick, paint.roof);
  line(ctx, plane, { x: 0.4, z: -0.35 }, { x: 0.35, z: -0.7 }, thick, palette.ink);
  line(ctx, plane, { x: -4.35, z: 0.1 }, { x: -4.6, z: -0.1 }, thick * 0.8, palette.ink);
  shape(ctx, plane, FUSELAGE);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.lineWidth = edge;
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
  shape(ctx, plane, WINDOW);
  ctx.fillStyle = paint.glass;
  ctx.fill();
  shape(ctx, plane, FIN);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.stroke();
  line(ctx, plane, { x: 0.1, z: -0.32 }, { x: -0.35, z: 1.2 }, thick * 0.6, palette.edge);
  const flap = (Math.PI / 180) * 40 * plane.flaps;
  ctx.beginPath();
  const le = project(plane, { x: 0.75, z: 1.25 });
  const top = project(plane, { x: 0.3, z: 1.42 });
  const hinge = project(plane, { x: -0.45, z: 1.3 });
  const under = project(plane, { x: 0.3, z: 1.2 });
  ctx.moveTo(le.x, le.y);
  ctx.quadraticCurveTo(top.x, top.y, hinge.x, hinge.y);
  ctx.lineTo(under.x, under.y);
  ctx.closePath();
  ctx.fillStyle = paint.roof;
  ctx.fill();
  line(ctx, plane, { x: -0.45, z: 1.26 }, hinged({ x: -0.45, z: 1.26 }, 0.42, flap), thick * 0.9, paint.roof);
  const wheel = project(plane, { x: 0.35, z: -0.7 });
  ellipse(ctx, wheel.x, wheel.y, 0.3 * Math.max(side, 0.35), 0.3, palette.ink);
  ellipse(ctx, wheel.x, wheel.y, 0.11 * Math.max(side, 0.35), 0.11, palette.steel);
  const tail = project(plane, { x: -4.6, z: -0.1 });
  ellipse(ctx, tail.x, tail.y, 0.1 * Math.max(side, 0.35), 0.1, palette.ink);
  const hub = project(plane, { x: 2.08, z: 0.15 });
  const spin = plane.spool > 0.02;
  if (spin) {
    const tip = project(plane, { x: 2.1, z: 1.05 });
    const low = project(plane, { x: 2.1, z: -0.75 });
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(low.x, low.y);
    ctx.lineWidth = 0.14 + 0.5 * (1 - side);
    ctx.strokeStyle = palette.cars[3].glass;
    ctx.globalAlpha = 0.35 + plane.spool * 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ellipse(ctx, hub.x, hub.y, 0.16 * Math.max(side, 0.4), 0.16, palette.ink);
  wing_bar(-wing_far);
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
  const px = Math.max(x0 + 4, Math.min(x0 + w - 4, sx(plane.x)));
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
    hills(ctx, f, 0.08, 420, Math.min(110, f.view.height * 0.2), f.scenery.far_hill, 3);
    hills(ctx, f, 0.25, 180, Math.min(50, f.view.height * 0.09), f.scenery.hill, 4);
    clouds(ctx, f, box);
  }
  ctx.fillStyle = f.palette.grass;
  ctx.fillRect(box.x0, 0, box.x1 - box.x0, 0.02);
  trees(ctx, f, box);
  windsock(ctx, f);
  runway(ctx, f, box);
  hangar(ctx, f);
  shadow(ctx, f);
  draw_plane(ctx, f);
  puffs(ctx, f);
  if (f.profile) profile(ctx, f);
}
