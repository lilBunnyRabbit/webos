import { resolve_token } from "$lib/core/utils";
import { Status, type GameState } from "./game";
import type { Polygon, Vec } from "./geometry";
import { End } from "./sensors";
import { body_centre, gear_direction, Gear, HATCHBACK, sweep, wheels, type Car } from "./vehicle";
import { MarkKind, SolidKind, SurfaceKind, type Bay, type Solid } from "./world";

export interface Palette {
  void: string;
  asphalt: string;
  floor: string;
  pavement: string;
  kerb: string;
  paint: string;
  faint: string;
  wall: string;
  wall_edge: string;
  pillar: string;
  shelf: string;
  cars: string[];
  glass: string;
  shade: string;
  player: string;
  tyre: string;
  lamp: string;
  brake: string;
  target: string;
  target_fill: string;
  free: string;
  parked: string;
  guide: string;
  warning: string;
  error: string;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  const mix = (name: string, share: number) => token(`color-mix(in oklch, var(--${name}) ${share}%, transparent)`);
  return {
    void: token("var(--background-darker)"),
    asphalt: token("var(--background)"),
    floor: token("var(--background-light)"),
    pavement: token("var(--background-lighter)"),
    kerb: mix("foreground", 28),
    paint: mix("foreground", 78),
    faint: mix("foreground", 40),
    wall: mix("foreground", 50),
    wall_edge: mix("foreground", 70),
    pillar: mix("foreground", 62),
    shelf: mix("foreground", 30),
    cars: [token("var(--secondary)"), token("var(--tertiary)"), mix("foreground", 72), mix("foreground", 42), token("var(--background-lightest)")],
    glass: mix("background-darkest", 62),
    shade: mix("background-darkest", 22),
    player: token("var(--primary)"),
    tyre: token("light-dark(var(--foreground), var(--background-darkest))"),
    lamp: mix("foreground", 88),
    brake: token("var(--error)"),
    target: token("var(--primary)"),
    target_fill: mix("primary", 14),
    free: mix("primary", 55),
    parked: token("var(--success)"),
    guide: token("var(--cottontail)"),
    warning: token("var(--warning)"),
    error: token("var(--error)"),
  };
}

export interface View {
  x: number;
  y: number;
  /** CSS pixels per metre. */
  scale: number;
  width: number;
  height: number;
  dpr: number;
}

export interface Extras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
}

function path(ctx: CanvasRenderingContext2D, shape: Polygon) {
  ctx.beginPath();
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function fill(ctx: CanvasRenderingContext2D, shape: Polygon, colour: string) {
  path(ctx, shape);
  ctx.fillStyle = colour;
  ctx.fill();
}

function segment(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

interface Body {
  length: number;
  width: number;
  colour: string;
}

function car_body(ctx: CanvasRenderingContext2D, body: Body, palette: Palette) {
  const { length: l, width: w } = body;
  const half = w / 2;
  ctx.fillStyle = body.colour;
  ctx.beginPath();
  // Clockwise from the rear left: a rounder nose, a squarer tail, the same on both sides.
  ctx.roundRect(-l / 2, -half, l, w, [0.35, 0.55, 0.55, 0.35].map((r) => Math.min(r, half)));
  ctx.fill();
  const roof_back = -l * 0.2;
  const roof_front = l * 0.1;
  const roof = half - 0.22;
  ctx.fillStyle = palette.shade;
  ctx.beginPath();
  ctx.roundRect(roof_back, -roof, roof_front - roof_back, roof * 2, 0.14);
  ctx.fill();
  // The glass runs from the roof's edge out to a wider base, the way a cabin tapers seen from above.
  const pane = (from: number, to: number, base: number) => {
    ctx.beginPath();
    ctx.moveTo(from, -roof);
    ctx.lineTo(to, -base);
    ctx.lineTo(to, base);
    ctx.lineTo(from, roof);
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = palette.glass;
  pane(roof_front, l * 0.24, half - 0.14);
  pane(roof_back, -l * 0.3, half - 0.16);
}

function parked_car(ctx: CanvasRenderingContext2D, solid: Solid, palette: Palette) {
  const car = solid.car!;
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  car_body(ctx, { length: car.length, width: car.width, colour: palette.cars[car.paint % palette.cars.length] }, palette);
  ctx.restore();
}

// Tyres are drawn over the body so the player sees where the front pair points; nudged out so they sit on its edge.
const TYRE_SHOW = 0.09;

function player(ctx: CanvasRenderingContext2D, car: Car, braking: boolean, palette: Palette) {
  const centre = body_centre(car);
  const spec = HATCHBACK;
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  car_body(ctx, { length: spec.length, width: spec.width, colour: palette.player }, palette);
  const l = spec.length / 2;
  const w = spec.width / 2;
  ctx.fillStyle = palette.lamp;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(l - 0.12, side * (w - 0.38) - 0.17, 0.1, 0.34, 0.05);
    ctx.fill();
  }
  const reversing = car.gear === Gear.REVERSE;
  for (const side of [-1, 1]) {
    ctx.fillStyle = palette.brake;
    ctx.globalAlpha = braking ? 1 : 0.45;
    ctx.beginPath();
    ctx.roundRect(-l + 0.02, side * (w - 0.3) - 0.14, 0.1, 0.28, 0.04);
    ctx.fill();
    if (reversing) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = palette.lamp;
      ctx.beginPath();
      ctx.roundRect(-l + 0.02, side * (w - 0.62) - 0.07, 0.1, 0.14, 0.03);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.fillStyle = palette.tyre;
  for (const [i, wheel] of wheels(car).entries()) {
    ctx.save();
    ctx.translate(wheel.at.x, wheel.at.y);
    ctx.rotate(car.heading + wheel.angle);
    ctx.translate(0, (i % 2 ? 1 : -1) * TYRE_SHOW);
    ctx.beginPath();
    ctx.roundRect(-spec.wheel_diameter / 2, -spec.wheel_width / 2, spec.wheel_diameter, spec.wheel_width, 0.06);
    ctx.fill();
    ctx.restore();
  }
}

function guides(ctx: CanvasRenderingContext2D, car: Car, scale: number, palette: Palette) {
  const direction = gear_direction(car.gear) || Math.sign(car.speed);
  if (direction === 0) return;
  const paths = sweep(car, direction * 5, 24);
  // Front corners going forwards, rear corners backwards: the corners that lead, where a reversing camera draws its lines.
  const leading = direction > 0 ? [paths[0], paths[1]] : [paths[2], paths[3]];
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([6 / scale, 5 / scale]);
  ctx.globalAlpha = 0.75;
  for (const line of leading) {
    ctx.beginPath();
    line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function sensor_arcs(ctx: CanvasRenderingContext2D, car: Car, reading: Record<End, number | null>, palette: Palette) {
  const spec = HATCHBACK;
  for (const end of [End.FRONT, End.REAR] as const) {
    const distance = reading[end];
    if (distance === null) continue;
    const sign = end === End.FRONT ? 1 : -1;
    const bumper = end === End.FRONT ? spec.length - spec.rear_overhang : -spec.rear_overhang;
    const close = distance < 0.5;
    const bands = distance < 0.3 ? 3 : distance < 0.8 ? 2 : 1;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
    ctx.strokeStyle = close ? palette.error : palette.warning;
    ctx.lineCap = "round";
    for (let i = 0; i < bands; i++) {
      const reach = 0.25 + i * 0.22;
      ctx.lineWidth = 0.09;
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.beginPath();
      ctx.ellipse(bumper + sign * 0.05, 0, reach, spec.width * 0.55 + i * 0.12, 0, sign > 0 ? -1.1 : Math.PI - 1.1, sign > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function bay_outline(ctx: CanvasRenderingContext2D, bay: Bay, colour: string, fill_colour: string | null, scale: number) {
  if (fill_colour) fill(ctx, bay.shape, fill_colour);
  path(ctx, bay.shape);
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(0.12, 2 / scale);
  ctx.stroke();
}

function bay_arrow(ctx: CanvasRenderingContext2D, bay: Bay, colour: string) {
  const centre = bay.shape.reduce((sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }), { x: 0, y: 0 });
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(bay.heading);
  ctx.fillStyle = colour;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(0.9, 0);
  ctx.lineTo(0.1, -0.55);
  ctx.lineTo(0.1, -0.2);
  ctx.lineTo(-0.9, -0.2);
  ctx.lineTo(-0.9, 0.2);
  ctx.lineTo(0.1, 0.2);
  ctx.lineTo(0.1, 0.55);
  ctx.closePath();
  ctx.fill();
  if (bay.either) {
    ctx.beginPath();
    ctx.moveTo(-0.9, 0);
    ctx.lineTo(-0.35, -0.4);
    ctx.lineTo(-0.35, 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Every outline is stroked before any fill: the fill then hides the inner half of each stroke and every edge two
// pieces share, so only the edge a kerb or a building shows to the street stays drawn.
function outlined(ctx: CanvasRenderingContext2D, shapes: Polygon[], fill_colour: string, edge: string, width: number) {
  ctx.strokeStyle = edge;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  for (const shape of shapes) {
    path(ctx, shape);
    ctx.stroke();
  }
  // A hairline of the fill colour closes the anti-aliasing seams where two pieces meet.
  ctx.strokeStyle = fill_colour;
  ctx.lineWidth = width / 4;
  for (const shape of shapes) {
    fill(ctx, shape, fill_colour);
    ctx.stroke();
  }
}

function solids(ctx: CanvasRenderingContext2D, items: Solid[], scale: number, palette: Palette) {
  const of = (kind: SolidKind) => items.filter((solid) => solid.kind === kind).map((solid) => solid.shape);
  outlined(ctx, of(SolidKind.KERB), palette.pavement, palette.kerb, 4 / scale);
  outlined(ctx, of(SolidKind.WALL), palette.wall, palette.wall_edge, 3 / scale);
  for (const shape of of(SolidKind.PILLAR)) fill(ctx, shape, palette.pillar);
  for (const shape of of(SolidKind.SHELF)) fill(ctx, shape, palette.shelf);
  for (const solid of items) if (solid.kind === SolidKind.CAR && solid.car) parked_car(ctx, solid, palette);
}

// The bay is often out of frame while the camera follows the car: a marker on the edge points the way.
function bay_pointer(ctx: CanvasRenderingContext2D, bay: Bay, view: View, palette: Palette) {
  const centre = bay.shape.reduce((sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }), { x: 0, y: 0 });
  const dx = (centre.x - view.x) * view.scale;
  const dy = (centre.y - view.y) * view.scale;
  const margin = 22;
  const hw = view.width / 2 - margin;
  const hh = view.height / 2 - margin;
  if (Math.abs(dx) <= hw + margin && Math.abs(dy) <= hh + margin) return;
  const t = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
  const angle = Math.atan2(dy, dx);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, view.dpr * (view.width / 2 + dx * t), view.dpr * (view.height / 2 + dy * t));
  ctx.rotate(angle);
  ctx.fillStyle = palette.target;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.fill();
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { width, height, dpr, scale } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (width / 2 - view.x * scale), dpr * (height / 2 - view.y * scale));

  const world = state.world;
  for (const chunk of world.chunks) {
    for (const surface of chunk.surfaces) {
      const colour = surface.kind === SurfaceKind.FLOOR ? palette.floor : surface.kind === SurfaceKind.PAVEMENT ? palette.pavement : palette.asphalt;
      fill(ctx, surface.shape, colour);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1 / scale;
      ctx.stroke();
    }
  }
  for (const chunk of world.chunks) {
    for (const mark of chunk.marks) {
      ctx.strokeStyle = mark.kind === MarkKind.DASH ? palette.faint : palette.paint;
      ctx.lineWidth = mark.kind === MarkKind.STOP ? 0.22 : 0.11;
      ctx.setLineDash(mark.kind === MarkKind.DASH ? [1.2, 1.2] : []);
      segment(ctx, mark.a, mark.b);
    }
  }
  ctx.setLineDash([]);

  const open = state.round.scenario === null;
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  for (const bay of world.bays) {
    const done = state.status === Status.PARKED && state.bay === bay;
    if (done) bay_outline(ctx, bay, palette.parked, palette.target_fill, scale);
    else if (open) bay_outline(ctx, bay, palette.free, null, scale);
    else {
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      bay_outline(ctx, bay, palette.target, palette.target_fill, scale);
      ctx.globalAlpha = 1;
      bay_arrow(ctx, bay, palette.target);
    }
  }

  solids(ctx, world.solids, scale, palette);

  if (extras.guides && state.status === Status.DRIVING) guides(ctx, state.car, scale, palette);
  player(ctx, state.car, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, palette);
  if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, extras.sensors, palette);

  if (!open && world.bays.length === 1 && state.status === Status.DRIVING) {
    ctx.save();
    bay_pointer(ctx, world.bays[0], view, palette);
    ctx.restore();
  }

  if (state.status === Status.CRASHED && state.contact) {
    const at = state.contact;
    ctx.strokeStyle = palette.error;
    ctx.fillStyle = palette.error;
    ctx.lineWidth = 3 / scale;
    for (const radius of [0.35, 0.7 + pulse * 0.25]) {
      ctx.globalAlpha = radius < 0.5 ? 1 : 0.5 + pulse * 0.3;
      ctx.beginPath();
      ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(at.x, at.y, 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}
