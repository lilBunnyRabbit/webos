import { begin_frame, path, type View } from "$kit/games/play2d/canvas";
import type { Insets } from "$kit/games/play2d/camera";
import { bounds_of, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import type { Paint, Palette } from "$kit/games/play2d/palette";
import { hash } from "$kit/games/play2d/seed";
import { body_velocity, Drive, hull_shape, speed, steer_angle, to_world, type Boat, type Coefficients, type HullSize } from "./boat";
import { Grade, type Touch } from "./contact";
import type { Gate, Hub } from "./hub";
import { BerthKind, SolidKind, type Berth, type Scene, type Solid } from "./world";

export interface WakePoint {
  x: number;
  y: number;
  /** Seconds since it was laid. */
  age: number;
  /** Unit vector across the hull at the stern, and the boat's speed then. */
  ax: number;
  ay: number;
  speed: number;
}

export const WAKE_LIFE = 3.2;

export interface Frame {
  scene: Scene;
  boat: Boat;
  c: Coefficients;
  view: View;
  palette: Palette;
  time: number;
  wake: readonly WakePoint[];
  insets: Insets;
  font: string;
  /** 0 to 1 while the docked conditions hold, and the lines' progress once they go on. */
  held: number;
  lines: number | null;
  squash: number;
  touch: { touch: Touch; age: number } | null;
  hub?: { hub: Hub; stars: (gate: Gate) => number | null; shed_label: string };
  hitboxes?: boolean;
}

function hair(view: View, px = 1): number {
  return px / view.scale;
}

function screen(view: View, p: Vec): Vec {
  return { x: view.width / 2 + (p.x - view.x) * view.scale, y: view.height / 2 + (p.y - view.y) * view.scale };
}

function water(ctx: CanvasRenderingContext2D, f: Frame) {
  const { scene, view, palette, time } = f;
  const b = scene.bounds;
  ctx.fillStyle = palette.water;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  const cell = 5;
  const half_w = view.width / 2 / view.scale;
  const half_h = view.height / 2 / view.scale;
  const x0 = Math.floor((view.x - half_w) / cell) - 1;
  const x1 = Math.ceil((view.x + half_w) / cell) + 1;
  const y0 = Math.floor((view.y - half_h) / cell) - 1;
  const y1 = Math.ceil((view.y + half_h) / cell) + 1;
  if ((x1 - x0) * (y1 - y0) > 2500) return;
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = Math.max(0.04, hair(view, 1.2));
  ctx.lineCap = "round";
  for (let i = x0; i <= x1; i++) {
    for (let j = y0; j <= y1; j++) {
      const h = hash(0x5eed, i, j);
      if (h % 3 !== 0) continue;
      const phase = ((h >>> 8) % 1000) / 1000;
      const drift = ((time * 0.08 + phase) % 1) * cell;
      const x = i * cell + ((h >>> 4) % 50) / 10 + drift * 0.4;
      const y = j * cell + ((h >>> 12) % 50) / 10;
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.9 + phase * 6.28);
      ctx.globalAlpha = 0.05 + pulse * 0.07;
      const w = 0.6 + ((h >>> 16) % 10) / 10;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x - w / 2, y - 0.18, x, y);
      ctx.quadraticCurveTo(x + w / 2, y + 0.18, x + w, y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function quay(ctx: CanvasRenderingContext2D, solid: Solid, f: Frame) {
  const { palette, view } = f;
  path(ctx, solid.shape);
  ctx.fillStyle = palette.pavement;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.12, hair(view, 2.5));
  ctx.stroke();
}

function pontoon(ctx: CanvasRenderingContext2D, solid: Solid, f: Frame) {
  const { palette, view } = f;
  const box = bounds_of(solid.shape);
  const across = box.x1 - box.x0 >= box.y1 - box.y0;
  ctx.save();
  path(ctx, solid.shape);
  ctx.fillStyle = palette.shadow;
  ctx.translate(0.12, 0.18);
  ctx.fill();
  ctx.restore();
  path(ctx, solid.shape);
  ctx.fillStyle = palette.wood;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(0.025, hair(view, 0.8));
  ctx.beginPath();
  const plank = 0.55;
  if (across) for (let x = box.x0 + plank; x < box.x1; x += plank) (ctx.moveTo(x, box.y0), ctx.lineTo(x, box.y1));
  else for (let y = box.y0 + plank; y < box.y1; y += plank) (ctx.moveTo(box.x0, y), ctx.lineTo(box.x1, y));
  ctx.stroke();
  ctx.restore();
  path(ctx, solid.shape);
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(0.1, hair(view, 2));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function pile(ctx: CanvasRenderingContext2D, solid: Solid, f: Frame) {
  const box = bounds_of(solid.shape);
  const r = (box.x1 - box.x0) / 2;
  ctx.beginPath();
  ctx.arc((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = f.palette.wood;
  ctx.fill();
  ctx.strokeStyle = f.palette.ink;
  ctx.lineWidth = Math.max(0.05, hair(f.view, 1.5));
  ctx.stroke();
}

function buoy(ctx: CanvasRenderingContext2D, solid: Solid, f: Frame) {
  const box = bounds_of(solid.shape);
  const x = (box.x0 + box.x1) / 2;
  const y = (box.y0 + box.y1) / 2;
  const k = (box.x1 - box.x0) / 0.9;
  const bob = Math.sin(f.time * 1.6 + x) * 0.04;
  ctx.beginPath();
  ctx.arc(x, y, (0.75 + bob) * k, 0, Math.PI * 2);
  ctx.fillStyle = f.palette.glow;
  ctx.globalAlpha = 0.18;
  ctx.fill();
  ctx.globalAlpha = 1;
  const colour = solid.side === "port" ? f.palette.error : f.palette.success;
  ctx.beginPath();
  if (solid.side === "port") ctx.rect(x - 0.4 * k, y - 0.4 * k, 0.8 * k, 0.8 * k);
  else ctx.arc(x, y, 0.45 * k, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.strokeStyle = f.palette.ink;
  ctx.lineWidth = Math.max(0.05, hair(f.view, 1.5));
  ctx.stroke();
}

function shape_path(ctx: CanvasRenderingContext2D, points: readonly Vec[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function scaled(points: readonly Vec[], sx: number, sy: number, dx = 0): Vec[] {
  return points.map((p) => ({ x: p.x * sx + dx, y: p.y * sy }));
}

/** A coaster from above: the rudder, the hull, hatches down the hold, the thruster tunnels, the bridge and funnel aft. */
function coaster_body(ctx: CanvasRenderingContext2D, shape: readonly Vec[], L: number, B: number, paint: Paint, f: Frame, angle: number, lean: number) {
  const { palette, view } = f;
  const line = Math.max(0.05, hair(view, 1.2));
  ctx.save();
  ctx.translate(-L / 2 + 0.4, 0);
  ctx.rotate(-angle);
  ctx.beginPath();
  ctx.roundRect(-2.4, -0.3, 2.6, 0.6, 0.3);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.restore();
  shape_path(ctx, shape);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.translate(0, lean);
  shape_path(ctx, scaled(shape, 0.95, 0.84, -0.01 * L));
  ctx.fillStyle = palette.shadow;
  ctx.globalAlpha = 0.45;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(0.12, hair(view, 2));
  for (const x of [0.45, -0.45]) {
    ctx.beginPath();
    ctx.moveTo(x * L, -0.42 * B);
    ctx.lineTo(x * L, 0.42 * B);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const hatches = 3;
  const from = 0.3;
  const to = -0.2;
  const step = (from - to) / hatches;
  for (let i = 0; i < hatches; i++) {
    const x0 = (from - i * step - step * 0.9) * L;
    ctx.beginPath();
    ctx.roundRect(x0, -0.34 * B, step * 0.84 * L, 0.68 * B, 0.3);
    ctx.fillStyle = paint.roof;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (let k = 1; k < 4; k++) (ctx.moveTo(x0 + (step * 0.84 * L * k) / 4, -0.34 * B), ctx.lineTo(x0 + (step * 0.84 * L * k) / 4, 0.34 * B));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.roundRect(-0.4 * L, -0.42 * B, 0.14 * L, 0.84 * B, 0.4);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-0.275 * L, -0.38 * B, 0.012 * L, 0.76 * B, 0.1);
  ctx.fillStyle = paint.glass;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-0.37 * L, -0.12 * B, 0.05 * L, 0.24 * B, 0.3);
  ctx.fillStyle = palette.ink;
  ctx.fill();
}

/** A boat from above in its own frame (x forward, y to starboard): hull, deck and the details its drive has. */
function boat_body(ctx: CanvasRenderingContext2D, pose: Pose, size: HullSize, paint: Paint, f: Frame, angle = 0, squash = 0, heel = 0) {
  const { palette, view } = f;
  const L = size.length;
  const B = size.beam;
  const shape = hull_shape(size);
  const scale = Math.max(1, B / 3.3);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  // Heel is drawn, not simulated: the shadow slides out of the turn and the deck leans into it.
  const shadow = { x: 0.15 * scale, y: 0.22 * scale - heel * 0.14 * B };
  shape_path(ctx, scaled(shape, 1.02, 1.04, -0.12 * scale));
  ctx.fillStyle = palette.shadow;
  ctx.translate(shadow.x, shadow.y);
  ctx.fill();
  ctx.translate(-shadow.x, -shadow.y);
  const line = Math.max(0.03, hair(view, 1.2));
  const lean = heel * 0.05 * B;
  if (size.cargo) coaster_body(ctx, shape, L, B, paint, f, angle, lean);
  else if (size.drive === Drive.OUTBOARD) {
    shape_path(ctx, shape);
    ctx.fillStyle = paint.body;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.translate(0, lean);
    shape_path(ctx, scaled(shape, 0.78, 0.6, -0.05 * L));
    ctx.fillStyle = paint.glass;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.roundRect(-0.1 * L, -0.18 * B, 0.16 * L, 0.36 * B, 0.08);
    ctx.fillStyle = paint.roof;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(0.02 * L, -0.15 * B, 0.03 * L, 0.3 * B, 0.03);
    ctx.fillStyle = paint.glass;
    ctx.fill();
    ctx.translate(0, -lean);
    ctx.save();
    ctx.translate(-L / 2 + 0.15, 0);
    ctx.rotate(-angle);
    ctx.strokeStyle = palette.ink;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.1, hair(view, 2.5));
    ctx.beginPath();
    ctx.moveTo(-0.3, 0);
    ctx.lineTo(-0.95, 0);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.05, hair(view, 1.5));
    ctx.beginPath();
    ctx.moveTo(-0.95, -0.24);
    ctx.lineTo(-0.95, 0.24);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-0.55, -0.24, 0.62, 0.48, 0.16);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(-L / 2 + 0.05, 0);
    ctx.rotate(-angle);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(0.1, hair(view, 2.5));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-0.7, 0);
    ctx.stroke();
    ctx.restore();
    shape_path(ctx, shape);
    ctx.fillStyle = paint.body;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.translate(0, lean);
    shape_path(ctx, scaled(shape, 0.88, 0.8, -0.02 * L));
    ctx.fillStyle = paint.roof;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-0.14 * L, -0.27 * B, 0.36 * L, 0.54 * B, 0.25);
    ctx.fillStyle = paint.body;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.stroke();
    ctx.fillStyle = paint.glass;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.roundRect(-0.08 * L, side * 0.22 * B - 0.05, 0.24 * L, 0.1, 0.05);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.roundRect(-0.46 * L, -0.28 * B, 0.28 * L, 0.56 * B, 0.15);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(0.04, hair(view, 1.4));
    ctx.beginPath();
    ctx.moveTo(0.14 * L, 0);
    ctx.lineTo(-0.3 * L, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.14 * L, 0, Math.max(0.09, hair(view, 2.5)), 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
  }
  if (squash >= 0) {
    const fenders = size.drive === Drive.OUTBOARD ? [-0.2, 0.15] : [-0.32, -0.05, 0.22];
    const s = Math.min(0.5, squash * 2.5);
    for (const x of fenders) {
      for (const side of [-1, 1]) {
        const at = shape.reduce((best, p) => (Math.abs(p.x / L - x) < Math.abs(best.x / L - x) && Math.sign(p.y) === side ? p : best), { x: 0, y: (side * B) / 2 });
        const y = side * (Math.abs(at.y) + 0.06 * scale - s * 0.06 * scale);
        ctx.beginPath();
        ctx.ellipse(x * L, y, (0.26 + s * 0.08) * scale, 0.12 * scale * (1 - s * 0.6), 0, 0, Math.PI * 2);
        ctx.fillStyle = palette.glow;
        ctx.fill();
        ctx.strokeStyle = palette.edge;
        ctx.lineWidth = line;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function moored(ctx: CanvasRenderingContext2D, solid: Solid, f: Frame) {
  const boat = solid.boat!;
  boat_body(ctx, boat.pose, boat, f.palette.cars[boat.paint % f.palette.cars.length], f, 0, -1);
}

function wake(ctx: CanvasRenderingContext2D, f: Frame) {
  const { wake: points, palette, view, c } = f;
  if (points.length < 2) return;
  const scale = Math.max(1, c.spec.beam / 3.3);
  const full = c.spec.top_speed * 0.45;
  ctx.strokeStyle = palette.glow;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const fade = 1 - b.age / WAKE_LIFE;
      const strength = Math.min(1, b.speed / full);
      if (fade <= 0 || strength < 0.04) continue;
      const spread = (p: WakePoint) => (0.5 + p.age * (0.35 + p.speed * 0.4)) * scale;
      ctx.globalAlpha = 0.38 * fade * strength;
      ctx.lineWidth = Math.max(0.06 * scale, hair(view, 2)) * (1 + b.age * 0.6);
      ctx.beginPath();
      ctx.moveTo(a.x + a.ax * side * spread(a), a.y + a.ay * side * spread(a));
      ctx.lineTo(b.x + b.ax * side * spread(b), b.y + b.ay * side * spread(b));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function wash(ctx: CanvasRenderingContext2D, f: Frame) {
  const { boat, c, palette, view, time } = f;
  const power = boat.power * boat.gear;
  if (Math.abs(power) < 0.05) return;
  const L = c.spec.length;
  const scale = Math.max(1, c.spec.beam / 3.3);
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.heading);
  if (c.spec.drive === Drive.OUTBOARD) {
    ctx.translate(-L / 2 + 0.15, 0);
    ctx.rotate(-steer_angle(boat.rudder, c));
    ctx.translate(L / 2 - 0.15, 0);
  }
  ctx.strokeStyle = palette.glow;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.05 * scale, hair(view, 1.6));
  const streaks = 6;
  for (let i = 0; i < streaks; i++) {
    const phase = (time * 2.4 + i / streaks) % 1;
    const y = (((i * 37) % 11) / 10 - 0.5) * c.spec.beam * 0.35;
    ctx.globalAlpha = 0.5 * Math.abs(power) * (1 - phase);
    ctx.beginPath();
    if (power > 0) {
      const x = -L / 2 - 0.3 * scale - phase * (1 + power * 3) * scale;
      ctx.moveTo(x, y * (1 + phase));
      ctx.lineTo(x - 0.5 * scale, y * (1 + phase * 1.4));
    } else {
      const x = -L / 2 + 0.2 * scale + phase * (0.5 - power * 2.5) * scale;
      const edge = (c.spec.beam / 2 + (0.2 + phase * 0.3) * scale) * (i % 2 ? 1 : -1);
      ctx.moveTo(x, edge);
      ctx.lineTo(x + 0.45 * scale, edge);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function bow_wave(ctx: CanvasRenderingContext2D, f: Frame) {
  const { boat, c, palette, view, time } = f;
  const u = body_velocity(boat).u;
  const share = Math.min(1, Math.max(0, u) / (c.spec.top_speed * 0.8));
  if (share < 0.08) return;
  const L = c.spec.length;
  const B = c.spec.beam;
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.heading);
  ctx.strokeStyle = palette.glow;
  ctx.lineCap = "round";
  const pulse = 0.85 + 0.15 * Math.sin(time * 5);
  for (const side of [-1, 1]) {
    for (const [k, alpha] of [[1, 0.55], [1.5, 0.3]] as const) {
      ctx.globalAlpha = alpha * share * pulse;
      ctx.lineWidth = Math.max(0.05 * Math.max(1, B / 3.3), hair(view, 1.8));
      ctx.beginPath();
      ctx.moveTo(L / 2 + 0.05, 0);
      ctx.quadraticCurveTo(L * 0.42, side * B * 0.62 * k, L * (0.42 - 0.22 * share * k), side * B * (0.55 + 0.45 * share) * k);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function thruster_wash(ctx: CanvasRenderingContext2D, f: Frame) {
  const { boat, c, palette, view, time } = f;
  if (!c.thruster) return;
  const L = c.spec.length;
  const B = c.spec.beam;
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.heading);
  ctx.strokeStyle = palette.glow;
  ctx.lineCap = "round";
  const k = Math.max(1, B / 3.3);
  ctx.lineWidth = Math.max(0.25 * k, hair(view, 2.5));
  for (const [x, push] of [[0.45 * L, boat.bow], [-0.45 * L, boat.stern]] as const) {
    if (Math.abs(push) < 0.05) continue;
    const out = -Math.sign(push);
    for (let i = 0; i < 5; i++) {
      const phase = (time * 1.8 + i / 5) % 1;
      const reach = B / 2 + 0.4 * k + phase * (1.5 + Math.abs(push) * 5) * k;
      const wobble = ((i * 7) % 5) / 4 - 0.5;
      ctx.globalAlpha = 0.6 * Math.abs(push) * (1 - phase);
      ctx.beginPath();
      ctx.moveTo(x + wobble * (0.6 + phase * 2) * k, out * reach);
      ctx.lineTo(x + wobble * (0.6 + phase * 2.4) * k, out * (reach + 1.2 * k));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** How far the drawing leans into the turn, −1 to 1, from the sideways acceleration. */
function heel(boat: Boat): number {
  const turning = body_velocity(boat).u * boat.r;
  return speed(boat) < 0.1 ? 0 : Math.max(-1, Math.min(1, turning / 0.5));
}


function berth_mark(ctx: CanvasRenderingContext2D, berth: Berth, f: Frame) {
  const { palette, view, time } = f;
  const docked = f.lines !== null;
  path(ctx, berth.bay.shape);
  ctx.fillStyle = docked ? palette.parked_fill : palette.target_fill;
  ctx.fill();
  if (f.held > 0 && !docked) {
    ctx.globalAlpha = f.held * 0.6;
    ctx.fillStyle = palette.parked_fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = docked ? palette.parked : palette.target;
  ctx.lineWidth = Math.max(0.06, hair(view, 2));
  ctx.setLineDash([0.6, 0.4]);
  ctx.lineDashOffset = -time * 0.6;
  ctx.stroke();
  ctx.setLineDash([]);
  const centre = berth.bay.shape.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  const heading = berth.bay.heading;
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(heading);
  ctx.fillStyle = docked ? palette.parked : palette.target;
  ctx.globalAlpha = 0.55;
  const s = berth.kind === BerthKind.BOX ? 0.7 : 0.45;
  for (const dir of berth.bay.either ? [1, -1] : [1]) {
    ctx.beginPath();
    ctx.moveTo(dir * (s + 0.6), 0);
    ctx.lineTo(dir * 0.6, -s * 0.8);
    ctx.lineTo(dir * 0.6, s * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.ink;
  for (const cleat of berth.cleats) {
    ctx.beginPath();
    ctx.arc(cleat.x, cleat.y, Math.max(0.1, hair(view, 2.5)), 0, Math.PI * 2);
    ctx.fill();
  }
}

function mooring_lines(ctx: CanvasRenderingContext2D, berth: Berth, f: Frame) {
  if (f.lines === null) return;
  const { boat, c, palette, view } = f;
  const L = c.spec.length;
  const B = c.spec.beam;
  const ends = [to_world(boat, { x: L * 0.36, y: 0 }), to_world(boat, { x: -L * 0.42, y: 0 })];
  const side = (p: Vec) => {
    let best = berth.cleats[0];
    for (const cleat of berth.cleats) if (Math.hypot(cleat.x - p.x, cleat.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = cleat;
    return best;
  };
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.05, hair(view, 1.8));
  ctx.lineCap = "round";
  ends.forEach((from, i) => {
    const progress = Math.max(0, Math.min(1, f.lines! * 2 - i * 0.6));
    if (progress <= 0) return;
    const to = side(from);
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + B * 0.04 };
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(mid.x, mid.y, from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
    ctx.stroke();
  });
}

function rings(ctx: CanvasRenderingContext2D, f: Frame) {
  if (!f.touch || f.touch.touch.grade === Grade.KISS || f.touch.age > 1.2) return;
  const { touch, age } = f.touch;
  const colour = touch.grade === Grade.HARD ? f.palette.error : f.palette.warning;
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(0.06, hair(f.view, 2.5));
  for (const r of [0.3, 0.6]) {
    ctx.globalAlpha = Math.max(0, 1 - age / 1.2);
    ctx.beginPath();
    ctx.arc(touch.at.x, touch.at.y, r + age * 0.8, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function shed(ctx: CanvasRenderingContext2D, hub: Hub, f: Frame) {
  const { palette, view } = f;
  path(ctx, hub.shed.roof);
  ctx.fillStyle = palette.floor;
  ctx.globalAlpha = 0.72;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(0.05, hair(view, 1));
  const box = bounds_of(hub.shed.roof);
  ctx.beginPath();
  for (let x = box.x0; x < box.x1; x += 0.9) (ctx.moveTo(x, box.y0), ctx.lineTo(x, box.y1));
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.1, hair(view, 2));
  path(ctx, hub.shed.roof);
  ctx.stroke();
}

function gate_lines(ctx: CanvasRenderingContext2D, hub: Hub, f: Frame) {
  const { palette, view, time } = f;
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = Math.max(0.05, hair(view, 1.5));
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([0.5, 0.5]);
  ctx.lineDashOffset = -time * 0.5;
  for (const gate of hub.gates) {
    ctx.beginPath();
    ctx.moveTo(gate.port.x + 0.6, gate.port.y);
    ctx.lineTo(gate.starboard.x - 0.6, gate.starboard.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function labels(ctx: CanvasRenderingContext2D, f: Frame) {
  const hub = f.hub;
  if (!hub) return;
  const { view, palette, font } = f;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const px = Math.max(11, Math.min(17, view.scale * 1.05));
  for (const gate of hub.hub.gates) {
    const at = screen(view, gate.sign);
    if (at.x < -60 || at.y < -60 || at.x > view.width + 60 || at.y > view.height + 60) continue;
    ctx.font = `700 ${px}px ${font}`;
    const width = Math.max(px * 1.9, ctx.measureText(gate.label).width + px * 0.9);
    const height = px * 2.5;
    ctx.beginPath();
    ctx.roundRect(at.x - width / 2, at.y - height / 2, width, height, 5);
    ctx.fillStyle = palette.void;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = palette.paint;
    ctx.fillText(gate.label, at.x, at.y - px * 0.45);
    const stars = hub.stars(gate);
    const star = px * 0.42;
    for (let i = 0; i < 3; i++) {
      const cx = at.x + (i - 1) * star * 2.3;
      const cy = at.y + px * 0.62;
      star_path(ctx, cx, cy, star);
      if (stars !== null && i < stars) {
        ctx.fillStyle = palette.warning;
        ctx.fill();
      } else {
        ctx.strokeStyle = palette.faint;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  const door = screen(view, { x: hub.hub.shed.door.x, y: hub.hub.shed.door.y - 3 });
  ctx.font = `600 ${px * 0.9}px ${font}`;
  const text = hub.shed_label;
  const width = ctx.measureText(text).width + px;
  ctx.beginPath();
  ctx.roundRect(door.x - width / 2, door.y - px * 0.8, width, px * 1.6, 5);
  ctx.fillStyle = palette.void;
  ctx.globalAlpha = 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.paint;
  ctx.fillText(text, door.x, door.y);
  ctx.restore();
}

function star_path(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const POINTER_MARGIN = 24;

function berth_pointer(ctx: CanvasRenderingContext2D, berth: Berth, f: Frame) {
  const { view, insets, palette } = f;
  const centre = berth.bay.shape.reduce((s, p) => ({ x: s.x + p.x / 4, y: s.y + p.y / 4 }), { x: 0, y: 0 });
  const at = screen(view, centre);
  const x0 = insets.left;
  const x1 = view.width - insets.right;
  const y0 = insets.top;
  const y1 = view.height - insets.bottom;
  if (at.x >= x0 && at.x <= x1 && at.y >= y0 && at.y <= y1) return;
  const ox = (x0 + x1) / 2;
  const oy = (y0 + y1) / 2;
  const dx = at.x - ox;
  const dy = at.y - oy;
  const t = Math.min(Math.max(0, (x1 - x0) / 2 - POINTER_MARGIN) / Math.max(1e-6, Math.abs(dx)), Math.max(0, (y1 - y0) / 2 - POINTER_MARGIN) / Math.max(1e-6, Math.abs(dy)));
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, view.dpr * (ox + dx * t), view.dpr * (oy + dy * t));
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = palette.target;
  ctx.strokeStyle = palette.target;
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function draw_frame(ctx: CanvasRenderingContext2D, f: Frame) {
  const { scene, palette, boat, c } = f;
  begin_frame(ctx, f.view, palette);
  water(ctx, f);
  if (scene.berth) berth_mark(ctx, scene.berth, f);
  if (f.hub) gate_lines(ctx, f.hub.hub, f);
  wake(ctx, f);
  for (const solid of scene.solids) {
    if (solid.kind === SolidKind.QUAY) quay(ctx, solid, f);
    else if (solid.kind === SolidKind.PONTOON) pontoon(ctx, solid, f);
  }
  for (const solid of scene.solids) {
    if (solid.kind === SolidKind.MOORED) moored(ctx, solid, f);
    else if (solid.kind === SolidKind.PILE) pile(ctx, solid, f);
    else if (solid.kind === SolidKind.BUOY) buoy(ctx, solid, f);
  }
  wash(ctx, f);
  thruster_wash(ctx, f);
  bow_wave(ctx, f);
  boat_body(ctx, boat, c.spec, palette.player, f, steer_angle(boat.rudder, c), f.squash, heel(boat));
  if (scene.berth) mooring_lines(ctx, scene.berth, f);
  rings(ctx, f);
  if (f.hub) shed(ctx, f.hub.hub, f);
  if (f.hitboxes) {
    ctx.strokeStyle = palette.info;
    ctx.lineWidth = hair(f.view, 1.5);
    for (const shape of [...scene.solids.map((s) => s.shape), hull_shape(c.spec).map((p) => to_world(boat, p)) as Polygon]) {
      path(ctx, shape);
      ctx.stroke();
    }
  }
  labels(ctx, f);
  if (scene.berth && f.lines === null) berth_pointer(ctx, scene.berth, f);
}
