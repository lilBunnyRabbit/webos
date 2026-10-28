import { resolve_token } from "$lib/core/utils";
import type { Insets } from "./camera";
import { against, dash_phase, darkest, lightest, tread, wound, type Tone } from "./draw-math";
import { spec_of, Status, type GameState } from "./game";
import type { Polygon, Pose, Vec } from "./geometry";
import { End, sensor_frame } from "./sensors";
import {
  body_centre,
  gear_direction,
  Gear,
  hitch_point,
  sweep,
  to_world,
  trailer_pose,
  trailer_sweep,
  trailer_wheels,
  Vehicle,
  wheels,
  type Car,
  type VehicleSpec,
} from "./vehicle";
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
  water: string;
  water_edge: string;
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
  const solid = (name: string, share: number) =>
    token(`color-mix(in oklch, var(--${name}) ${share}%, var(--background))`);
  const tone = (colour: string): Tone => ({
    colour,
    l: Number(/oklch\(\s*([\d.]+)/.exec(token(`oklch(from ${colour} l 0 0)`))?.[1] ?? 0),
  });
  const of = (name: string) => tone(token(`var(--${name})`));

  // Lamps, glass and tyres sit on bodies of any theme colour, the default's primary as light as its foreground, so
  // they take the theme's darkest and lightest tones: whichever the body is, one of the two stands off it.
  const ink = darkest([of("foreground"), of("background-darkest")]);
  const glow = lightest([of("foreground"), of("background-lightest"), of("cottontail")]);
  // Glass takes the plain light tone, not the accent a lamp may get, so a dark car's windows don't light up.
  const pale = lightest([of("foreground"), of("background-lightest")]);
  const dark_ground = glow.l - of("background").l > 0.35;
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
    water: solid("info", 34),
    water_edge: solid("info", 85),
    cars: [
      token("var(--secondary)"),
      token("var(--tertiary)"),
      solid("foreground", 70),
      solid("foreground", 38),
      token("var(--background-lightest)"),
    ].map(paint),
    player: paint(token("var(--primary)")),
    ink: ink.colour,
    edge: token(`color-mix(in oklch, ${ink.colour} 55%, transparent)`),
    shadow: token(`color-mix(in oklch, ${ink.colour} 30%, transparent)`),
    glow: glow.colour,
    glow_clear: token(`color-mix(in oklch, ${glow.colour} 0%, transparent)`),
    beams: dark_ground,
    tread: token(`color-mix(in oklch, ${glow.colour} 55%, transparent)`),
    brake: token("var(--error)"),
    brake_glow: mix("error", 35),
    target: token("var(--primary)"),
    target_fill: mix("primary", 14),
    free: mix("primary", 55),
    parked: token("var(--success)"),
    parked_fill: mix("success", 18),
    // Cottontail is a light tint on most themes; on a light ground the dashed guides take some foreground to show.
    guide: dark_ground ? token("var(--cottontail)") : token("color-mix(in oklch, var(--cottontail) 55%, var(--foreground))"),
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
  /** What sits over the board's edges (the HUD, sideways touch controls), the same strips the camera keeps clear of. */
  insets: Insets;
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
function lamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lens: string,
  palette: Palette,
  lit = 1
) {
  const rim = 0.035;
  pill(ctx, x - rim, y - rim, w + rim * 2, h + rim * 2, 0.07, palette.ink);
  ctx.globalAlpha = lit;
  pill(ctx, x, y, w, h, 0.05, lens);
  ctx.globalAlpha = 1;
}

const Style = { HATCH: "hatch", VAN: "van", PICKUP: "pickup", BUS: "bus" } as const;
type Style = (typeof Style)[keyof typeof Style];

function style_of(vehicle: Vehicle | undefined): Style {
  if (vehicle === Vehicle.VAN) return Style.VAN;
  if (vehicle === Vehicle.PICKUP) return Style.PICKUP;
  if (vehicle === Vehicle.BUS) return Style.BUS;
  return Style.HATCH;
}

interface Body {
  length: number;
  width: number;
  paint: Paint;
  style: Style;
}

const CORNERS: Record<Style, number[]> = {
  hatch: [0.35, 0.55, 0.55, 0.35],
  van: [0.2, 0.4, 0.4, 0.2],
  pickup: [0.2, 0.5, 0.5, 0.2],
  bus: [0.25, 0.4, 0.4, 0.25],
};

function body_shape(ctx: CanvasRenderingContext2D, l: number, half: number, style: Style) {
  ctx.beginPath();
  // Clockwise from the rear left: a rounder nose, a squarer tail, the same on both sides.
  ctx.roundRect(
    -l / 2,
    -half,
    l,
    half * 2,
    CORNERS[style].map((r) => Math.min(r, half))
  );
}

// The sun stands still in the world, so the shadow falls the same way whichever way the car points.
function shadow(
  ctx: CanvasRenderingContext2D,
  centre: Vec,
  heading: number,
  length: number,
  width: number,
  style: Style,
  palette: Palette
) {
  ctx.save();
  ctx.translate(centre.x + 0.1, centre.y + 0.16);
  ctx.rotate(heading);
  body_shape(ctx, length + 0.06, width / 2 + 0.03, style);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.restore();
}

// The glass runs from the roof's edge out to a wider base, the way a cabin tapers seen from above.
function pane(ctx: CanvasRenderingContext2D, from: number, to: number, roof: number, base: number) {
  ctx.beginPath();
  ctx.moveTo(from, -roof);
  ctx.lineTo(to, -base);
  ctx.lineTo(to, base);
  ctx.lineTo(from, roof);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function glass(ctx: CanvasRenderingContext2D, paint: Paint) {
  ctx.fillStyle = paint.glass;
  ctx.strokeStyle = paint.glass;
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.06;
}

function car_body(ctx: CanvasRenderingContext2D, body: Body, scale: number, palette: Palette) {
  const { length: l, width: w, paint, style } = body;
  const half = w / 2;
  body_shape(ctx, l, half, style);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  const roof = half - 0.22;
  if (style === Style.HATCH) {
    const back = -l * 0.2;
    const front = l * 0.1;
    pill(ctx, back, -roof, front - back, roof * 2, 0.14, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, l * 0.24, roof, half - 0.14);
    pane(ctx, back, -l * 0.3, roof, half - 0.16);
  } else if (style === Style.VAN) {
    const front = l / 2 - 1.15;
    pill(ctx, -l / 2 + 0.12, -roof, front + l / 2 - 0.12, roof * 2, 0.12, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, front + 0.42, roof, half - 0.12);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (const x of [-l * 0.18, l * 0.06]) {
      ctx.moveTo(x, -roof + 0.08);
      ctx.lineTo(x, roof - 0.08);
    }
    ctx.moveTo(-l / 2 + 0.03, 0);
    ctx.lineTo(-l / 2 + 0.3, 0);
    ctx.stroke();
  } else if (style === Style.PICKUP) {
    const cab_back = -l * 0.08;
    const cab_front = l * 0.12;
    const bed_front = cab_back - 0.32;
    pill(ctx, cab_back, -roof, cab_front - cab_back, roof * 2, 0.12, paint.roof);
    glass(ctx, paint);
    pane(ctx, cab_front, l * 0.25, roof, half - 0.14);
    pane(ctx, cab_back, cab_back - 0.18, roof, roof + 0.02);
    const rail = 0.12;
    pill(ctx, -l / 2 + rail, -half + rail, bed_front - (-l / 2 + rail), (half - rail) * 2, 0.06, paint.glass);
    ctx.globalAlpha = 0.55;
    pill(
      ctx,
      -l / 2 + rail + 0.05,
      -half + rail + 0.05,
      bed_front - (-l / 2 + rail) - 0.1,
      (half - rail - 0.05) * 2,
      0.04,
      paint.roof
    );
    ctx.globalAlpha = 1;
  } else {
    const front = l / 2 - 0.45;
    const back = -l / 2 + 0.35;
    pill(ctx, back, -roof - 0.08, front - back, (roof + 0.08) * 2, 0.16, paint.roof);
    glass(ctx, paint);
    pane(ctx, front - 0.05, l / 2 - 0.1, roof + 0.08, half - 0.1);
    // Side windows run in a strip along each flank; the doors are breaks in the right one, the kerb side.
    const strip = 0.2;
    const from = back + 0.3;
    const to = front - 0.5;
    for (const side of [-1, 1]) ctx.fillRect(from, side > 0 ? half - strip - 0.06 : -half + 0.06, to - from, strip);
    ctx.fillStyle = paint.body;
    for (const at of [front - 1.6, -0.6]) ctx.fillRect(at, half - strip - 0.08, 1.15, strip + 0.04);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (const at of [front - 1.6, -0.6]) {
      ctx.moveTo(at + 0.575, half - strip - 0.06);
      ctx.lineTo(at + 0.575, half - 0.06);
    }
    ctx.stroke();
    pill(ctx, -1.6, -0.55, 2.2, 1.1, 0.14, paint.glass);
    ctx.globalAlpha = 0.5;
    pill(ctx, -1.5, -0.45, 2, 0.9, 0.1, paint.body);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const y of [-0.5, -0.25, 0, 0.25, 0.5]) {
      ctx.moveTo(-l / 2 + 0.08, y);
      ctx.lineTo(-l / 2 + 0.32, y);
    }
    ctx.stroke();
  }
}

interface Lamps {
  braking: boolean;
  reversing: boolean;
  lit: number;
}

function head_lamps(ctx: CanvasRenderingContext2D, l: number, w: number, style: Style, palette: Palette, lit: number) {
  const big = style === Style.BUS ? 1.3 : 1;
  for (const side of [-1, 1])
    lamp(ctx, l - 0.14, side * (w - 0.36 * big) - 0.18 * big, 0.1, 0.36 * big, palette.glow, palette, lit);
}

function tail_lamps(ctx: CanvasRenderingContext2D, l: number, w: number, palette: Palette, lamps: Lamps) {
  for (const side of [-1, 1]) {
    if (lamps.braking) pill(ctx, -l - 0.12, side * (w - 0.28) - 0.26, 0.3, 0.52, 0.2, palette.brake_glow);
    lamp(ctx, -l + 0.05, side * (w - 0.28) - 0.15, 0.09, 0.3, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
    if (lamps.reversing) lamp(ctx, -l + 0.05, side * (w - 0.64) - 0.07, 0.09, 0.14, palette.glow, palette);
  }
}

function parked_car(ctx: CanvasRenderingContext2D, solid: Solid, scale: number, palette: Palette) {
  const car = solid.car!;
  const style = style_of(car.vehicle);
  const body = { length: car.length, width: car.width, paint: palette.cars[car.paint % palette.cars.length], style };
  shadow(ctx, car.pose, car.pose.heading, car.length, car.width, style, palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const l = car.length / 2;
  const w = car.width / 2;
  const axles = style === Style.BUS ? [l - 2.5, -l + 3.6] : [l - 0.85, -l + 0.75];
  const tyre = style === Style.BUS ? 1 : 0.6;
  for (const x of axles)
    for (const side of [-1, 1]) pill(ctx, x - tyre / 2, side * (w - 0.1) - 0.11, tyre, 0.22, 0.06, palette.ink);
  car_body(ctx, body, scale, palette);
  head_lamps(ctx, l, w, style, palette, 0.6);
  tail_lamps(ctx, l, w, palette, { braking: false, reversing: false, lit: 0.6 });
  ctx.restore();
}

const BEAM = 7;

function beams(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, palette: Palette) {
  const direction = gear_direction(car.gear);
  if (direction === 0) return;
  const t = direction < 0 ? spec.trailer : undefined;
  // Reversing with a trailer, the light comes off the trailer's tail.
  const frame: Pose = t
    ? {
        ...to_world(trailer_pose(car, t), { x: t.axle - t.drawbar - t.box_length / 2, y: 0 }),
        heading: trailer_pose(car, t).heading,
      }
    : { ...body_centre(car, spec), heading: car.heading };
  const l = (t ? t.box_length : spec.length) / 2;
  const width = t ? t.width : spec.width;
  const reach = direction > 0 ? BEAM : BEAM * 0.45;
  const from = direction * (l - 0.1);
  const to = from + direction * reach;
  const near = width / 2 - 0.25;
  const far = width / 2 + (direction > 0 ? 1.8 : 0.9);
  ctx.save();
  ctx.translate(frame.x, frame.y);
  ctx.rotate(frame.heading);
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

// Tyres are drawn over the body so the player sees where the front pair points; nudged out so they sit on its edge.
const TYRE_SHOW = 0.08;
const TREAD_PITCH = 0.11;

function tyre(
  ctx: CanvasRenderingContext2D,
  at: Vec,
  angle: number,
  roll: number,
  out: number,
  size: { length: number; width: number },
  blur: number,
  scale: number,
  palette: Palette
) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(angle);
  ctx.translate(0, out);
  ctx.beginPath();
  ctx.roundRect(-size.length / 2, -size.width / 2, size.length, size.width, 0.07);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = palette.tread;
  ctx.globalAlpha = blur;
  for (const x of tread(roll, TREAD_PITCH, size.length)) ctx.fillRect(x - 0.022, -size.width / 2, 0.044, size.width);
  ctx.restore();
  ctx.strokeStyle = palette.tread;
  ctx.lineWidth = 1.25 / scale;
  ctx.stroke();
  ctx.restore();
}

// Past parking speed the stripes would strobe at 60 Hz and read as the car shaking; they fade out the way a spinning wheel blurs.
function blur_of(car: Car): number {
  return Math.max(0, Math.min(1, 1 - (Math.abs(car.speed) - 1.2) / 1.8));
}

function tyres(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, scale: number, palette: Palette) {
  const size = { length: spec.wheel_diameter + 0.04, width: spec.wheel_width + 0.05 };
  const blur = blur_of(car);
  for (const [i, wheel] of wheels(car, spec).entries()) {
    tyre(
      ctx,
      wheel.at,
      car.heading + wheel.angle,
      car.roll[i],
      (i % 2 ? 1 : -1) * TYRE_SHOW,
      size,
      blur,
      scale,
      palette
    );
  }
}

function trailer(
  ctx: CanvasRenderingContext2D,
  car: Car,
  spec: VehicleSpec,
  lamps: Lamps,
  scale: number,
  palette: Palette
) {
  const t = spec.trailer;
  if (!t || !car.trailer) return;
  const pose = trailer_pose(car, t);
  const front = t.axle - t.drawbar;
  const centre = to_world(pose, { x: front - t.box_length / 2, y: 0 });
  const half = t.width / 2;
  const paint = palette.player;
  shadow(ctx, centre, pose.heading, t.box_length, t.width, Style.VAN, palette);

  const size = { length: t.wheel_diameter + 0.04, width: t.wheel_width + 0.05 };
  const blur = blur_of(car);
  trailer_wheels(car, t).forEach((at, i) =>
    tyre(ctx, at, pose.heading, car.trailer!.roll[i], (i ? 1 : -1) * 0.1, size, blur, scale, palette)
  );

  // The A-frame drawbar from the box's front corners to the coupling on the ball.
  const ball = hitch_point(car, t);
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  const left = to_world(pose, { x: front, y: -half + 0.25 });
  const right = to_world(pose, { x: front, y: half - 0.25 });
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(ball.x, ball.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(pose.heading);
  const l = t.box_length / 2;
  ctx.beginPath();
  ctx.roundRect(-l, -half, l * 2, half * 2, 0.12);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  // Seen from above an open box trailer is its floor inside a rim of side boards.
  pill(ctx, -l + 0.1, -half + 0.1, l * 2 - 0.2, half * 2 - 0.2, 0.06, paint.glass);
  ctx.globalAlpha = 0.6;
  pill(ctx, -l + 0.14, -half + 0.14, l * 2 - 0.28, half * 2 - 0.28, 0.05, paint.roof);
  ctx.globalAlpha = 1;
  tail_lamps(ctx, l, half, palette, lamps);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 0.11, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.strokeStyle = palette.tread;
  ctx.lineWidth = 1.25 / scale;
  ctx.stroke();
}

function player(
  ctx: CanvasRenderingContext2D,
  car: Car,
  vehicle: Vehicle,
  spec: VehicleSpec,
  braking: boolean,
  scale: number,
  palette: Palette
) {
  const lamps = { braking, reversing: car.gear === Gear.REVERSE, lit: 0.85 };
  trailer(ctx, car, spec, lamps, scale, palette);
  const style = style_of(vehicle);
  const centre = body_centre(car, spec);
  const body = { length: spec.length, width: spec.width, paint: palette.player, style };
  shadow(ctx, centre, car.heading, spec.length, spec.width, style, palette);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  car_body(ctx, body, scale, palette);
  const l = spec.length / 2;
  const w = spec.width / 2;
  head_lamps(ctx, l, w, style, palette, 1);
  // Towing, the trailer's lamps take over the car's at the back.
  tail_lamps(ctx, l, w, palette, spec.trailer ? { braking: false, reversing: false, lit: 0.6 } : lamps);
  ctx.restore();
  tyres(ctx, car, spec, scale, palette);
}

function guides(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, scale: number, palette: Palette) {
  const direction = gear_direction(car.gear) || Math.sign(car.speed);
  if (direction === 0) return;
  // Front corners going forwards, rear corners backwards: the corners that lead, where a reversing camera draws its lines.
  let leading: Vec[][];
  if (direction < 0 && spec.trailer) leading = trailer_sweep(car, -5, 40, spec);
  else {
    const paths = sweep(car, direction * 5, 40, spec);
    leading = direction > 0 ? [paths[0], paths[1]] : [paths[2], paths[3]];
  }
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

function sensor_arcs(
  ctx: CanvasRenderingContext2D,
  car: Car,
  spec: VehicleSpec,
  reading: Record<End, number | null>,
  scale: number,
  palette: Palette
) {
  for (const end of [End.FRONT, End.REAR] as const) {
    const distance = reading[end];
    if (distance === null) continue;
    const sign = end === End.FRONT ? 1 : -1;
    const frame = sensor_frame(car, end, spec);
    const bumper = sign * frame.bumper;
    const close = distance < 0.5;
    const bands = distance < 0.3 ? 3 : distance < 0.8 ? 2 : 1;
    ctx.save();
    ctx.translate(frame.pose.x, frame.pose.y);
    ctx.rotate(frame.pose.heading);
    ctx.strokeStyle = close ? palette.error : palette.warning;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.09, 2.5 / scale);
    for (let i = 0; i < bands; i++) {
      const reach = 0.25 + i * 0.22;
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.beginPath();
      ctx.ellipse(
        bumper + sign * 0.05,
        0,
        reach,
        frame.width * 0.55 + i * 0.12,
        0,
        sign > 0 ? -1.1 : Math.PI - 1.1,
        sign > 0 ? 1.1 : Math.PI + 1.1
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function bay_outline(
  ctx: CanvasRenderingContext2D,
  bay: Bay,
  colour: string,
  fill_colour: string | null,
  width: number
) {
  if (fill_colour) fill(ctx, bay.shape, fill_colour);
  path(ctx, bay.shape);
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.stroke();
}

function bay_arrow(ctx: CanvasRenderingContext2D, bay: Bay, colour: string) {
  const centre = bay.shape.reduce(
    (sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }),
    { x: 0, y: 0 }
  );
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
  outlined(ctx, of(SolidKind.WATER), palette.water, palette.water_edge, Math.max(0.12, 3 / scale));
  outlined(ctx, of(SolidKind.KERB), palette.pavement, palette.kerb, 4 / scale);
  outlined(ctx, of(SolidKind.WALL), palette.wall, palette.wall_edge, 3 / scale);
  outlined(ctx, of(SolidKind.SHELF), palette.shelf, palette.wall_edge, 2 / scale);
  outlined(ctx, [...of(SolidKind.PILLAR), ...of(SolidKind.POST)], palette.pillar, palette.wall_edge, 2 / scale);
  for (const solid of items) if (solid.kind === SolidKind.CAR && solid.car) parked_car(ctx, solid, scale, palette);
}

const SURFACES = [SurfaceKind.ASPHALT, SurfaceKind.FLOOR, SurfaceKind.PAVEMENT] as const;
const DASH = 1.2;

function ground(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const chunks = state.world.chunks;
  for (const kind of SURFACES) {
    const shapes = chunks.flatMap((chunk) =>
      chunk.surfaces.filter((surface) => surface.kind === kind).map((surface) => surface.shape)
    );
    if (shapes.length === 0) continue;
    const colour =
      kind === SurfaceKind.FLOOR ? palette.floor : kind === SurfaceKind.PAVEMENT ? palette.pavement : palette.asphalt;
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

// The bay is often out of frame while the camera follows the car: a marker on the edge of the clear part points the way.
const POINTER_MARGIN = 22;

function bay_pointer(ctx: CanvasRenderingContext2D, bay: Bay, view: View, insets: Insets, palette: Palette) {
  const centre = bay.shape.reduce(
    (sum, p) => ({ x: sum.x + p.x / bay.shape.length, y: sum.y + p.y / bay.shape.length }),
    { x: 0, y: 0 }
  );
  const x = view.width / 2 + (centre.x - view.x) * view.scale;
  const y = view.height / 2 + (centre.y - view.y) * view.scale;
  const x0 = insets.left;
  const x1 = view.width - insets.right;
  const y0 = insets.top;
  const y1 = view.height - insets.bottom;
  // The HUD's chips leave most of the top band clear, so a bay seen there needs no marker; the sideways controls hide theirs.
  if (x >= x0 && x <= x1 && y >= 0 && y <= y1) return;
  // From the middle of the clear part, where the camera puts the car, out to its edge less a margin.
  const ox = (x0 + x1) / 2;
  const oy = (y0 + y1) / 2;
  const dx = x - ox;
  const dy = y - oy;
  const right = Math.max(0, (x1 - x0) / 2 - POINTER_MARGIN);
  const down = Math.max(0, (y1 - y0) / 2 - POINTER_MARGIN);
  const t = Math.min(right / Math.max(1e-6, Math.abs(dx)), down / Math.max(1e-6, Math.abs(dy)));
  const angle = Math.atan2(dy, dx);
  ctx.setTransform(
    view.dpr,
    0,
    0,
    view.dpr,
    view.dpr * (ox + dx * t),
    view.dpr * (oy + dy * t)
  );
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

export function draw_scene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: View,
  palette: Palette,
  extras: Extras
) {
  const { width, height, dpr, scale } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  // Not snapped to whole pixels: the car moves continuously, so a snapped camera makes it jitter a pixel against the world.
  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    dpr * (width / 2 - view.x * scale),
    dpr * (height / 2 - view.y * scale)
  );

  const world = state.world;
  const spec = spec_of(state.round);
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

  if (palette.beams && state.status !== Status.CRASHED) beams(ctx, state.car, spec, palette);
  solids(ctx, world.solids, scale, palette);

  if (extras.guides && state.status === Status.DRIVING) guides(ctx, state.car, spec, scale, palette);
  player(
    ctx,
    state.car,
    state.round.vehicle,
    spec,
    state.car.brake > 0.05 && state.car.gear !== Gear.PARK,
    scale,
    palette
  );
  if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, spec, extras.sensors, scale, palette);

  if (!open && world.bays.length === 1 && state.status === Status.DRIVING) {
    ctx.save();
    bay_pointer(ctx, world.bays[0], view, extras.insets, palette);
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
