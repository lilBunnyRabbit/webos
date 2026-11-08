import type { Palette } from "$kit/games/play2d/palette";
import { Paint, type Bell, type Part, type ShipArt } from "./art";
import type { BodyPoint } from "./lander";

export interface ShipLook {
  palette: Palette;
  foil: string;
  flame: string;
  flame_glow: string;
  edge: number;
  time: number;
}

export interface ShipPose {
  stroke: readonly number[];
  flames: readonly number[];
  /** RCS firing, −1 to 1, signed like `Ship.turning`. */
  rcs: number;
  crew: boolean;
}

function path(ctx: CanvasRenderingContext2D, points: readonly BodyPoint[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.z) : ctx.lineTo(p.x, p.z)));
  ctx.closePath();
}

function solid(ctx: CanvasRenderingContext2D, colour: string, look: ShipLook) {
  ctx.lineJoin = "round";
  ctx.lineWidth = look.edge * 2;
  ctx.strokeStyle = look.palette.edge;
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fill();
}

function fills(look: ShipLook): Record<Paint, string> {
  const { palette } = look;
  return {
    [Paint.BODY]: palette.player.body,
    [Paint.ROOF]: palette.player.roof,
    [Paint.GLASS]: palette.player.glass,
    [Paint.STEEL]: palette.steel,
    [Paint.INK]: palette.ink,
    [Paint.FOIL]: look.foil,
  };
}

function part(ctx: CanvasRenderingContext2D, p: Part, look: ShipLook, colours: Record<Paint, string>) {
  path(ctx, p.shape);
  solid(ctx, colours[p.paint], look);
  if (!p.trim && !p.shade && !p.sheen && !p.seams) return;
  ctx.save();
  path(ctx, p.shape);
  ctx.clip();
  for (const t of p.trim ?? []) {
    path(ctx, t.shape);
    ctx.fillStyle = colours[t.paint];
    ctx.fill();
    ctx.lineWidth = look.edge * 1.2;
    ctx.strokeStyle = look.palette.edge;
    ctx.stroke();
  }
  if (p.shade) {
    path(ctx, p.shade);
    ctx.fillStyle = look.palette.shadow;
    ctx.fill();
  }
  if (p.sheen) {
    path(ctx, p.sheen);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = look.palette.glow;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (p.seams) {
    ctx.beginPath();
    for (const [a, b] of p.seams) {
      ctx.moveTo(a.x, a.z);
      ctx.lineTo(b.x, b.z);
    }
    ctx.lineCap = "round";
    ctx.lineWidth = look.edge * 1.2;
    ctx.strokeStyle = look.palette.edge;
    ctx.stroke();
  }
  ctx.restore();
  path(ctx, p.shape);
  ctx.lineWidth = look.edge;
  ctx.strokeStyle = look.palette.edge;
  ctx.stroke();
}

function rod(ctx: CanvasRenderingContext2D, a: BodyPoint, b: BodyPoint, width: number, colour: string, look: ShipLook) {
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.z);
  ctx.lineTo(b.x, b.z);
  ctx.lineWidth = width + look.edge * 2;
  ctx.strokeStyle = look.palette.edge;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.stroke();
}

function flame(ctx: CanvasRenderingContext2D, bell: Bell, length: number, look: ShipLook, i: number) {
  if (length < 0.05) return;
  const { palette, time } = look;
  const flicker = 1 + 0.1 * Math.sin(time * 47 + i * 2.1) + 0.05 * Math.sin(time * 91 + i);
  const l = length * flicker;
  const w = bell.width;
  const { x, z } = bell.at;
  const plume = (width: number, len: number, colour: string, alpha: number) => {
    ctx.beginPath();
    ctx.moveTo(x - width / 2, z + 0.02);
    ctx.bezierCurveTo(x - width * 0.62, z - len * 0.3, x - width * 0.2, z - len * 0.8, x, z - len);
    ctx.bezierCurveTo(x + width * 0.2, z - len * 0.8, x + width * 0.62, z - len * 0.3, x + width / 2, z + 0.02);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.fill();
  };
  plume(w * 1.15, l, look.flame_glow, 1);
  plume(w * 0.85, l * 0.72, look.flame, 0.9);
  plume(w * 0.5, l * 0.42, palette.glow, 1);
  ctx.globalAlpha = 1;
}

function puff(ctx: CanvasRenderingContext2D, at: BodyPoint, dir: number, strength: number, look: ShipLook) {
  const l = 0.35 + 0.75 * strength;
  const w = 0.16 + 0.22 * strength;
  ctx.beginPath();
  ctx.moveTo(at.x - w * 0.35, at.z);
  ctx.quadraticCurveTo(at.x - w, at.z + dir * l * 0.55, at.x, at.z + dir * l);
  ctx.quadraticCurveTo(at.x + w, at.z + dir * l * 0.55, at.x + w * 0.35, at.z);
  ctx.closePath();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = look.palette.glow;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function leg(ctx: CanvasRenderingContext2D, art: ShipArt, i: number, sunk: number, look: ShipLook, colours: Record<Paint, string>) {
  const l = art.legs[i];
  const foot = { x: l.foot.x, z: l.foot.z + sunk };
  const ankle = { x: foot.x, z: foot.z + art.pad_height };
  const dx = ankle.x - l.hip.x;
  const dz = ankle.z - l.hip.z;
  const len = Math.hypot(dx, dz);
  const reach = Math.hypot(l.foot.x - l.hip.x, l.foot.z + art.pad_height - l.hip.z);
  // The sleeve keeps its length; the piston shows less of itself as the foot presses in.
  const sleeve = Math.min(len * 0.98, reach * 0.55);
  const knee = { x: l.hip.x + (dx / len) * sleeve, z: l.hip.z + (dz / len) * sleeve };
  rod(ctx, l.brace, { x: l.hip.x + dx * 0.42, z: l.hip.z + dz * 0.42 }, art.leg_width * 0.5, colours[Paint.STEEL], look);
  rod(ctx, knee, ankle, art.leg_width * 0.55, colours[Paint.STEEL], look);
  rod(ctx, l.hip, knee, art.leg_width, colours[Paint.ROOF], look);
  const w = art.pad;
  const h = art.pad_height;
  ctx.beginPath();
  ctx.moveTo(foot.x - w, foot.z);
  ctx.lineTo(foot.x + w, foot.z);
  ctx.quadraticCurveTo(foot.x + w * 0.85, foot.z + h * 0.9, foot.x + w * 0.35, foot.z + h);
  ctx.lineTo(foot.x - w * 0.35, foot.z + h);
  ctx.quadraticCurveTo(foot.x - w * 0.85, foot.z + h * 0.9, foot.x - w, foot.z);
  ctx.closePath();
  solid(ctx, colours[Paint.STEEL], look);
  ctx.beginPath();
  ctx.arc(ankle.x, ankle.z, art.leg_width * 0.42, 0, Math.PI * 2);
  solid(ctx, colours[Paint.INK], look);
}

function quad(ctx: CanvasRenderingContext2D, q: { at: BodyPoint; size: number }, look: ShipLook, colours: Record<Paint, string>) {
  const s = q.size;
  const { x, z } = q.at;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, z + dir * s * 0.4);
    ctx.lineTo(x + s * 0.18, z + dir * s * 0.4);
    ctx.lineTo(x + s * 0.3, z + dir * s * 0.85);
    ctx.lineTo(x - s * 0.3, z + dir * s * 0.85);
    ctx.closePath();
    solid(ctx, colours[Paint.INK], look);
  }
  ctx.beginPath();
  ctx.roundRect(x - s / 2, z - s / 2, s, s, s * 0.22);
  solid(ctx, colours[Paint.STEEL], look);
}

function crew(ctx: CanvasRenderingContext2D, art: ShipArt, look: ShipLook) {
  ctx.save();
  ctx.beginPath();
  for (const p of art.parts) {
    if (p.paint !== Paint.GLASS) continue;
    p.shape.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.z) : ctx.lineTo(q.x, q.z)));
    ctx.closePath();
  }
  ctx.clip();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = look.palette.glow;
  for (const at of art.crew) {
    ctx.beginPath();
    ctx.arc(at.x, at.z + 0.12, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(at.x - 0.32, at.z - 0.55, 0.64, 0.5, [0.24, 0.24, 0, 0]);
    ctx.fill();
  }
  ctx.restore();
}

/** Draws a ship in its own frame: the caller has put the origin at the centre of mass with z up. */
export function paint_ship(ctx: CanvasRenderingContext2D, art: ShipArt, look: ShipLook, pose: ShipPose) {
  const colours = fills(look);
  art.bells.forEach(({ bell }, i) => flame(ctx, bell, pose.flames[i] ?? 0, look, i));
  if (Math.abs(pose.rcs) > 0.1) {
    for (const q of art.rcs) {
      const dir = Math.sign(q.at.x) === Math.sign(pose.rcs) ? -1 : 1;
      puff(ctx, { x: q.at.x, z: q.at.z + dir * q.size * 0.85 }, dir, Math.abs(pose.rcs), look);
    }
  }
  art.legs.forEach((_, i) => leg(ctx, art, i, pose.stroke[i] ?? 0, look, colours));
  for (const n of art.bells) {
    path(ctx, n.shape);
    solid(ctx, colours[Paint.STEEL], look);
    ctx.save();
    path(ctx, n.shape);
    ctx.clip();
    const { at, width } = n.bell;
    ctx.fillStyle = look.palette.shadow;
    ctx.fillRect(at.x + width * 0.12, at.z - 1, width, 10);
    ctx.fillStyle = colours[Paint.INK];
    ctx.fillRect(at.x - width, at.z - 1, width * 2, 1 + Math.max(look.edge * 2.4, 0.08));
    ctx.restore();
    path(ctx, n.collar);
    solid(ctx, colours[Paint.ROOF], look);
  }
  for (const p of art.parts) part(ctx, p, look, colours);
  if (pose.crew) crew(ctx, art, look);
  for (const q of art.rcs) quad(ctx, q, look, colours);
}
