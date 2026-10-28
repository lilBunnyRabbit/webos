import { resolve_token } from "$lib/core/utils";
import { against, dash_phase, darkest, lightest, tread, wound, type Tone } from "./draw-math";
import { Status, type GameState } from "./game";
import type { Polygon, Vec } from "./geometry";
import { End } from "./sensors";
import { body_centre, gear_direction, Gear, HATCHBACK, sweep, wheels, type Car } from "./vehicle";
import { MarkKind, SolidKind, SurfaceKind, type Bay, type Solid } from "./world";

export interface Paint {
  body: string;
  glass: string;
  roof: string;
}

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
  cars: Paint[];
  player: Paint;
  ink: string;
  edge: string;
  shadow: string;
  glow: string;
  glow_clear: string;
  /** Headlights only throw light on ground darker than they are; on a light theme it reads as a grey smear. */
  beams: boolean;
  tread: string;
  brake: string;
  brake_glow: string;
  target: string;
  target_fill: string;
  free: string;
  parked: string;
  parked_fill: string;
  guide: string;
  warning: string;
  error: string;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  const mix = (name: string, share: number) => token(`color-mix(in oklch, var(--${name}) ${share}%, transparent)`);
  const solid = (name: string, share: number) => token(`color-mix(in oklch, var(--${name}) ${share}%, var(--background))`);
  const tone = (colour: string): Tone => ({ colour, l: Number(/oklch\(\s*([\d.]+)/.exec(token(`oklch(from ${colour} l 0 0)`))?.[1] ?? 0) });
  const of = (name: string) => tone(token(`var(--${name})`));

  // Lamps, glass and tyres sit on bodies of any theme colour, the default's primary as light as its foreground, so
  // they take the theme's darkest and lightest tones: whichever the body is, one of the two stands off it.
  const ink = darkest([of("foreground"), of("background-darkest")]);
  const glow = lightest([of("foreground"), of("background-lightest"), of("cottontail")]);
  // Glass takes the plain light tone, not the accent a lamp may get, so a dark car's windows don't light up.
  const pale = lightest([of("foreground"), of("background-lightest")]);
  const paint = (colour: string): Paint => {
    const body = tone(colour);
    const over = against(body.l, ink, pale);
    const share = over === ink ? 72 : 50;
    return {
      body: colour,
      glass: token(`color-mix(in oklch, ${over.colour} ${share}%, ${colour})`),
      roof: token(`color-mix(in oklch, ${over.colour} ${share / 4}%, ${colour})`),
    };
  };
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
    pillar: solid("foreground", 62),
    shelf: mix("foreground", 30),
    cars: [token("var(--secondary)"), token("var(--tertiary)"), solid("foreground", 70), solid("foreground", 38), token("var(--background-lightest)")].map(paint),
    player: paint(token("var(--primary)")),
    ink: ink.colour,
    edge: token(`color-mix(in oklch, ${ink.colour} 55%, transparent)`),
    shadow: token(`color-mix(in oklch, ${ink.colour} 30%, transparent)`),
    glow: glow.colour,
    glow_clear: token(`color-mix(in oklch, ${glow.colour} 0%, transparent)`),
    beams: glow.l - of("background").l > 0.35,
    tread: token(`color-mix(in oklch, ${glow.colour} 55%, transparent)`),
    brake: token("var(--error)"),
    brake_glow: mix("error", 35),
    target: token("var(--primary)"),
    target_fill: mix("primary", 14),
    free: mix("primary", 55),
    parked: token("var(--success)"),
    parked_fill: mix("success", 18),
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

function trace(ctx: CanvasRenderingContext2D, shape: Polygon) {
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function path(ctx: CanvasRenderingContext2D, shape: Polygon) {
  ctx.beginPath();
  trace(ctx, shape);
}

function fill(ctx: CanvasRenderingContext2D, shape: Polygon, colour: string) {
  path(ctx, shape);
  ctx.fillStyle = colour;
  ctx.fill();
}

// One path for many pieces: abutting pieces fill without anti-aliasing seams, and a translucent stroke never doubles
// up where two pieces meet.
function union(ctx: CanvasRenderingContext2D, shapes: Polygon[]) {
  ctx.beginPath();
  for (const shape of shapes) trace(ctx, wound(shape));
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
}

// A lamp is a lens in a dark housing: on a light body the housing shows, on a dark one the lens does.
function lamp(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lens: string, palette: Palette, lit = 1) {
  const rim = 0.035;
  pill(ctx, x - rim, y - rim, w + rim * 2, h + rim * 2, 0.07, palette.ink);
  ctx.globalAlpha = lit;
  pill(ctx, x, y, w, h, 0.05, lens);
  ctx.globalAlpha = 1;
}

interface Body {
  length: number;
  width: number;
  paint: Paint;
}

const CORNERS = [0.35, 0.55, 0.55, 0.35];

function body_shape(ctx: CanvasRenderingContext2D, l: number, half: number) {
  ctx.beginPath();
  // Clockwise from the rear left: a rounder nose, a squarer tail, the same on both sides.
  ctx.roundRect(-l / 2, -half, l, half * 2, CORNERS.map((r) => Math.min(r, half)));
}

// The sun stands still in the world, so the shadow falls the same way whichever way the car points.
function shadow(ctx: CanvasRenderingContext2D, centre: Vec, heading: number, body: Body, palette: Palette) {
  ctx.save();
  ctx.translate(centre.x + 0.1, centre.y + 0.16);
  ctx.rotate(heading);
  body_shape(ctx, body.length + 0.06, body.width / 2 + 0.03);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.restore();
}

function car_body(ctx: CanvasRenderingContext2D, body: Body, scale: number, palette: Palette) {
  const { length: l, width: w, paint } = body;
  const half = w / 2;
  body_shape(ctx, l, half);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  const roof_back = -l * 0.2;
  const roof_front = l * 0.1;
  const roof = half - 0.22;
  pill(ctx, roof_back, -roof, roof_front - roof_back, roof * 2, 0.14, paint.roof);
  // The glass runs from the roof's edge out to a wider base, the way a cabin tapers seen from above.
  const pane = (from: number, to: number, base: number) => {
    ctx.beginPath();
    ctx.moveTo(from, -roof);
    ctx.lineTo(to, -base);
    ctx.lineTo(to, base);
    ctx.lineTo(from, roof);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  ctx.fillStyle = paint.glass;
  ctx.strokeStyle = paint.glass;
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.06;
  pane(roof_front, l * 0.24, half - 0.14);
  pane(roof_back, -l * 0.3, half - 0.16);
}

function parked_car(ctx: CanvasRenderingContext2D, solid: Solid, scale: number, palette: Palette) {
  const car = solid.car!;
  const body = { length: car.length, width: car.width, paint: palette.cars[car.paint % palette.cars.length] };
  shadow(ctx, car.pose, car.pose.heading, body, palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const l = car.length / 2;
  const w = car.width / 2;
  for (const x of [l - 0.85, -l + 0.75]) for (const side of [-1, 1]) pill(ctx, x - 0.3, side * (w - 0.1) - 0.11, 0.6, 0.22, 0.06, palette.ink);
  car_body(ctx, body, scale, palette);
  for (const side of [-1, 1]) {
    lamp(ctx, l - 0.13, side * (w - 0.36) - 0.15, 0.08, 0.3, palette.glow, palette, 0.6);
    lamp(ctx, -l + 0.05, side * (w - 0.28) - 0.12, 0.08, 0.24, palette.brake, palette, 0.6);
  }
  ctx.restore();
}

const BEAM = 7;

function beams(ctx: CanvasRenderingContext2D, car: Car, palette: Palette) {
  const direction = gear_direction(car.gear);
  if (direction === 0) return;
  const spec = HATCHBACK;
  const l = spec.length / 2;
  const reach = direction > 0 ? BEAM : BEAM * 0.45;
  const from = direction * (l - 0.1);
  const to = from + direction * reach;
  const near = spec.width / 2 - 0.25;
  const far = spec.width / 2 + (direction > 0 ? 1.8 : 0.9);
  const centre = body_centre(car);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  const gradient = ctx.createLinearGradient(from, 0, to, 0);
  gradient.addColorStop(0, palette.glow);
  gradient.addColorStop(1, palette.glow_clear);
  ctx.fillStyle = gradient;
  ctx.globalAlpha = direction > 0 ? 0.2 : 0.14;
  ctx.beginPath();
  ctx.moveTo(from, -near);
  ctx.lineTo(to, -far);
  ctx.quadraticCurveTo(to + direction * 0.8, 0, to, far);
  ctx.lineTo(from, near);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const TYRE_LENGTH = 0.66;
const TYRE_WIDTH = 0.25;
// Tyres are drawn over the body so the player sees where the front pair points; nudged out so they sit on its edge.
const TYRE_SHOW = 0.08;
const TREAD_PITCH = 0.11;

function tyres(ctx: CanvasRenderingContext2D, car: Car, scale: number, palette: Palette) {
  // Past parking speed the stripes would strobe at 60 Hz and read as the car shaking; they fade out the way a spinning wheel blurs.
  const blur = Math.max(0, Math.min(1, 1 - (Math.abs(car.speed) - 1.2) / 1.8));
  for (const [i, wheel] of wheels(car).entries()) {
    ctx.save();
    ctx.translate(wheel.at.x, wheel.at.y);
    ctx.rotate(car.heading + wheel.angle);
    ctx.translate(0, (i % 2 ? 1 : -1) * TYRE_SHOW);
    ctx.beginPath();
    ctx.roundRect(-TYRE_LENGTH / 2, -TYRE_WIDTH / 2, TYRE_LENGTH, TYRE_WIDTH, 0.07);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.tread;
    ctx.globalAlpha = blur;
    for (const x of tread(car.roll[i], TREAD_PITCH, TYRE_LENGTH)) ctx.fillRect(x - 0.022, -TYRE_WIDTH / 2, 0.044, TYRE_WIDTH);
    ctx.restore();
    ctx.strokeStyle = palette.tread;
    ctx.lineWidth = 1.25 / scale;
    ctx.stroke();
    ctx.restore();
  }
}

function player(ctx: CanvasRenderingContext2D, car: Car, braking: boolean, scale: number, palette: Palette) {
  const centre = body_centre(car);
  const spec = HATCHBACK;
  const body = { length: spec.length, width: spec.width, paint: palette.player };
  shadow(ctx, centre, car.heading, body, palette);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  car_body(ctx, body, scale, palette);
  const l = spec.length / 2;
  const w = spec.width / 2;
  const reversing = car.gear === Gear.REVERSE;
  for (const side of [-1, 1]) {
    lamp(ctx, l - 0.14, side * (w - 0.36) - 0.18, 0.1, 0.36, palette.glow, palette);
    if (braking) pill(ctx, -l - 0.12, side * (w - 0.28) - 0.26, 0.3, 0.52, 0.2, palette.brake_glow);
    lamp(ctx, -l + 0.05, side * (w - 0.28) - 0.15, 0.09, 0.3, palette.brake, palette, braking ? 1 : 0.85);
    if (reversing) lamp(ctx, -l + 0.05, side * (w - 0.64) - 0.07, 0.09, 0.14, palette.glow, palette);
  }
  ctx.restore();
  tyres(ctx, car, scale, palette);
}

function guides(ctx: CanvasRenderingContext2D, car: Car, scale: number, palette: Palette) {
  const direction = gear_direction(car.gear) || Math.sign(car.speed);
  if (direction === 0) return;
  const paths = sweep(car, direction * 5, 40);
  // Front corners going forwards, rear corners backwards: the corners that lead, where a reversing camera draws its lines.
  const leading = direction > 0 ? [paths[0], paths[1]] : [paths[2], paths[3]];
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = 2 / scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([6 / scale, 6 / scale]);
  ctx.globalAlpha = 0.75;
  for (const line of leading) {
    ctx.beginPath();
    line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineCap = "butt";
  ctx.globalAlpha = 1;
}

function sensor_arcs(ctx: CanvasRenderingContext2D, car: Car, reading: Record<End, number | null>, scale: number, palette: Palette) {
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
    ctx.lineWidth = Math.max(0.09, 2.5 / scale);
    for (let i = 0; i < bands; i++) {
      const reach = 0.25 + i * 0.22;
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.beginPath();
      ctx.ellipse(bumper + sign * 0.05, 0, reach, spec.width * 0.55 + i * 0.12, 0, sign > 0 ? -1.1 : Math.PI - 1.1, sign > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function bay_outline(ctx: CanvasRenderingContext2D, bay: Bay, colour: string, fill_colour: string | null, width: number) {
  if (fill_colour) fill(ctx, bay.shape, fill_colour);
  path(ctx, bay.shape);
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.stroke();
}

function bay_arrow(ctx: CanvasRenderingContext2D, bay: Bay, colour: string) {
  const centre = bay.shape.reduce((sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }), { x: 0, y: 0 });
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(bay.heading);
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.12;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(0.85, 0);
  ctx.lineTo(0.15, -0.5);
  ctx.lineTo(0.15, -0.17);
  ctx.lineTo(-0.85, -0.17);
  ctx.lineTo(-0.85, 0.17);
  ctx.lineTo(0.15, 0.17);
  ctx.lineTo(0.15, 0.5);
  ctx.closePath();
  if (bay.either) {
    ctx.moveTo(-0.85, 0);
    ctx.lineTo(-0.35, -0.38);
    ctx.lineTo(-0.35, 0.38);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The outline is stroked before the fill: the fill then hides the inner half of the stroke and every edge two pieces
// share, so only the edge a kerb or a building shows to the street stays drawn. Round joins keep corners from spiking.
function outlined(ctx: CanvasRenderingContext2D, shapes: Polygon[], fill_colour: string, edge: string, width: number) {
  if (shapes.length === 0) return;
  union(ctx, shapes);
  ctx.strokeStyle = edge;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = fill_colour;
  ctx.fill();
}

function solids(ctx: CanvasRenderingContext2D, items: Solid[], scale: number, palette: Palette) {
  const of = (kind: SolidKind) => items.filter((solid) => solid.kind === kind).map((solid) => solid.shape);
  outlined(ctx, of(SolidKind.KERB), palette.pavement, palette.kerb, 4 / scale);
  outlined(ctx, of(SolidKind.WALL), palette.wall, palette.wall_edge, 3 / scale);
  outlined(ctx, of(SolidKind.SHELF), palette.shelf, palette.wall_edge, 2 / scale);
  outlined(ctx, of(SolidKind.PILLAR), palette.pillar, palette.wall_edge, 2 / scale);
  for (const solid of items) if (solid.kind === SolidKind.CAR && solid.car) parked_car(ctx, solid, scale, palette);
}

const SURFACES = [SurfaceKind.ASPHALT, SurfaceKind.FLOOR, SurfaceKind.PAVEMENT] as const;
const DASH = 1.2;

function ground(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const chunks = state.world.chunks;
  for (const kind of SURFACES) {
    const shapes = chunks.flatMap((chunk) => chunk.surfaces.filter((surface) => surface.kind === kind).map((surface) => surface.shape));
    if (shapes.length === 0) continue;
    const colour = kind === SurfaceKind.FLOOR ? palette.floor : kind === SurfaceKind.PAVEMENT ? palette.pavement : palette.asphalt;
    union(ctx, shapes);
    ctx.fillStyle = colour;
    ctx.fill();
    // Where two kinds of ground meet, a hairline of each closes the gap their anti-aliased edges leave.
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
  }

  const marks = chunks.flatMap((chunk) => chunk.marks);
  ctx.lineCap = "butt";
  for (const kind of [MarkKind.LINE, MarkKind.STOP] as const) {
    ctx.beginPath();
    for (const mark of marks) {
      if (mark.kind !== kind) continue;
      ctx.moveTo(mark.a.x, mark.a.y);
      ctx.lineTo(mark.b.x, mark.b.y);
    }
    ctx.strokeStyle = palette.paint;
    ctx.lineWidth = Math.max(kind === MarkKind.STOP ? 0.22 : 0.11, 1.25 / scale);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.11, 1.25 / scale);
  ctx.setLineDash([DASH, DASH]);
  for (const mark of marks) {
    if (mark.kind !== MarkKind.DASH) continue;
    ctx.lineDashOffset = dash_phase(mark.a, mark.b, DASH * 2);
    ctx.beginPath();
    ctx.moveTo(mark.a.x, mark.a.y);
    ctx.lineTo(mark.b.x, mark.b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

// The bay is often out of frame while the camera follows the car: a marker on the edge points the way.
const POINTER_MARGIN = 22;
// The gear strip, speed and sensor chips sit along the top of the board; the marker stays below them.
const POINTER_TOP = 44 + 16;

function bay_pointer(ctx: CanvasRenderingContext2D, bay: Bay, view: View, palette: Palette) {
  const centre = bay.shape.reduce((sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }), { x: 0, y: 0 });
  const dx = (centre.x - view.x) * view.scale;
  const dy = (centre.y - view.y) * view.scale;
  const x = view.width / 2 + dx;
  const y = view.height / 2 + dy;
  if (x >= 0 && x <= view.width && y >= 0 && y <= view.height) return;
  const right = view.width / 2 - POINTER_MARGIN;
  const down = view.height / 2 - POINTER_MARGIN;
  const up = Math.max(0, view.height / 2 - POINTER_TOP);
  const t = Math.min(right / Math.max(1e-6, Math.abs(dx)), (dy < 0 ? up : down) / Math.max(1e-6, Math.abs(dy)));
  const angle = Math.atan2(dy, dx);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, view.dpr * (view.width / 2 + dx * t), view.dpr * (view.height / 2 + dy * t));
  ctx.rotate(angle);
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
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { width, height, dpr, scale } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  // Not snapped to whole pixels: the car moves continuously, so a snapped camera makes it jitter a pixel against the world.
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (width / 2 - view.x * scale), dpr * (height / 2 - view.y * scale));

  const world = state.world;
  ground(ctx, state, scale, palette);

  const open = state.round.scenario === null;
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const line = Math.max(0.12, 2 / scale);
  for (const bay of world.bays) {
    const done = state.status === Status.PARKED && state.bay === bay;
    if (done) bay_outline(ctx, bay, palette.parked, palette.parked_fill, Math.max(0.16, 3 / scale));
    else if (open) bay_outline(ctx, bay, palette.free, null, line);
    else {
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      bay_outline(ctx, bay, palette.target, palette.target_fill, line);
      ctx.globalAlpha = 1;
      bay_arrow(ctx, bay, palette.target);
    }
  }

  if (palette.beams && state.status !== Status.CRASHED) beams(ctx, state.car, palette);
  solids(ctx, world.solids, scale, palette);

  if (extras.guides && state.status === Status.DRIVING) guides(ctx, state.car, scale, palette);
  player(ctx, state.car, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette);
  if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, extras.sensors, scale, palette);

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
