import type { Paint, Palette } from "./draw";
import { tread } from "./draw-math";
import { centroid, wrap_angle, type Polygon, type Pose, type Vec } from "./geometry";
import type { Solid } from "./scene";
import { Signal } from "./signal";
import {
  body_centre,
  CARAVAN_TRAILER,
  Gear,
  hangs_ahead,
  hitch_point,
  MOTORCYCLE,
  outline as rig_outline,
  to_world,
  TRACTOR,
  trailer_corners,
  trailer_pose,
  trailer_wheels,
  Vehicle,
  wheels,
  type Car,
  type TrailerSpec,
  type VehicleSpec,
} from "./vehicle";

export function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
}

// A lamp is a lens in a dark housing: on a light body the housing shows, on a dark one the lens does.
export function lamp(
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

const Style = {
  HATCH: "hatch",
  VAN: "van",
  PICKUP: "pickup",
  BUS: "bus",
  CITY: "city",
  SUV: "suv",
  LIMO: "limo",
  CAMPER: "camper",
  GARBAGE: "garbage",
  FIRE: "fire",
  COACH: "coach",
  DECKER: "decker",
  ARTIC: "artic",
  TRACTOR: "tractor",
  QUAD: "quad",
  FORKLIFT: "forklift",
  CARAVAN: "caravan",
  TUK_TUK: "tuk-tuk",
  GOLF_CART: "golf-cart",
  RESURFACER: "resurfacer",
  TROLLEY: "trolley",
  F1: "f1",
  GT: "gt",
  MOTORCYCLE: "motorcycle",
  CAB: "cab",
  BOX_TRUCK: "box-truck",
  TUG: "tug",
  MACHINE: "machine",
} as const;
type Style = (typeof Style)[keyof typeof Style];

const Livery = { TAXI: "taxi", POLICE: "police", AMBULANCE: "ambulance" } as const;
type Livery = (typeof Livery)[keyof typeof Livery];

const Load = {
  BOX: "box",
  HORSE: "horse",
  FARM: "farm",
  BOAT: "boat",
  CARAVAN: "caravan",
  BUS: "bus",
  SEMI: "semi",
  DOLLY: "dolly",
  BODY: "body",
  CART: "cart",
} as const;
type Load = (typeof Load)[keyof typeof Load];

interface Look {
  style: Style;
  livery?: Livery;
  /** One per hitch, down the chain. */
  loads?: Load[];
}

const LOOKS: Record<Vehicle, Look> = {
  hatch: { style: Style.HATCH },
  van: { style: Style.VAN },
  pickup: { style: Style.PICKUP },
  bus: { style: Style.BUS },
  towing: { style: Style.HATCH, loads: [Load.BOX] },
  city: { style: Style.CITY },
  suv: { style: Style.SUV },
  limo: { style: Style.LIMO },
  camper: { style: Style.CAMPER },
  taxi: { style: Style.HATCH, livery: Livery.TAXI },
  police: { style: Style.SUV, livery: Livery.POLICE },
  ambulance: { style: Style.VAN, livery: Livery.AMBULANCE },
  garbage: { style: Style.GARBAGE },
  fire: { style: Style.FIRE },
  coach: { style: Style.COACH },
  decker: { style: Style.DECKER },
  artic: { style: Style.ARTIC, loads: [Load.BUS] },
  "horse-box": { style: Style.SUV, loads: [Load.HORSE] },
  tractor: { style: Style.TRACTOR, loads: [Load.FARM] },
  quad: { style: Style.QUAD, loads: [Load.BOX] },
  boat: { style: Style.PICKUP, loads: [Load.BOAT] },
  caravan: { style: Style.HATCH, loads: [Load.CARAVAN] },
  forklift: { style: Style.FORKLIFT },
  "tuk-tuk": { style: Style.TUK_TUK },
  "golf-cart": { style: Style.GOLF_CART },
  resurfacer: { style: Style.RESURFACER },
  trolley: { style: Style.TROLLEY },
  f1: { style: Style.F1 },
  gt: { style: Style.GT },
  motorcycle: { style: Style.MOTORCYCLE },
  semi: { style: Style.CAB, loads: [Load.SEMI] },
  "box-truck": { style: Style.BOX_TRUCK },
  drawbar: { style: Style.BOX_TRUCK, loads: [Load.DOLLY, Load.BODY] },
  "road-train": { style: Style.CAB, loads: [Load.SEMI, Load.DOLLY, Load.SEMI] },
  baggage: { style: Style.TUG, loads: [Load.CART, Load.CART, Load.CART] },
  "tractor-two": { style: Style.TRACTOR, loads: [Load.FARM, Load.FARM] },
  bobcat: { style: Style.MACHINE },
  mower: { style: Style.MACHINE },
  tank: { style: Style.MACHINE },
  loader: { style: Style.MACHINE },
  dumper: { style: Style.MACHINE },
  ladder: { style: Style.MACHINE },
  telehandler: { style: Style.MACHINE },
};

/** A semi-trailer sits on a fifth wheel and a drawbar trailer's body on its dolly: drawn over what they ride on. */
function rides(load: Load): boolean {
  return load === Load.SEMI || load === Load.BODY;
}

/** Back to front, each riding link straight after the body it rides on; −1 is the vehicle itself. */
function draw_order(loads: readonly Load[]): number[] {
  const order: number[] = [];
  for (let i = loads.length - 1; i >= -1; i--) {
    if (i >= 0 && rides(loads[i])) continue;
    order.push(i);
    for (let j = i + 1; j < loads.length && rides(loads[j]); j++) order.push(j);
  }
  return order;
}

function look_of(vehicle: Vehicle | undefined): Look {
  return vehicle ? LOOKS[vehicle] : LOOKS.hatch;
}

/** Rear corners, then front, as `roundRect` takes them from the rear left. */
const CORNERS: Record<Style, number[]> = {
  hatch: [0.35, 0.55, 0.55, 0.35],
  van: [0.2, 0.4, 0.4, 0.2],
  pickup: [0.2, 0.5, 0.5, 0.2],
  bus: [0.25, 0.4, 0.4, 0.25],
  city: [0.45, 0.6, 0.6, 0.45],
  suv: [0.3, 0.42, 0.42, 0.3],
  limo: [0.3, 0.55, 0.55, 0.3],
  camper: [0.3, 0.45, 0.45, 0.3],
  garbage: [0.12, 0.35, 0.35, 0.12],
  fire: [0.15, 0.35, 0.35, 0.15],
  coach: [0.35, 0.55, 0.55, 0.35],
  decker: [0.3, 0.5, 0.5, 0.3],
  artic: [0.08, 0.4, 0.4, 0.08],
  tractor: [0.2, 0.3, 0.3, 0.2],
  quad: [0.3, 0.3, 0.3, 0.3],
  forklift: [0.5, 0.08, 0.08, 0.5],
  caravan: [0.3, 0.9, 0.9, 0.3],
  "tuk-tuk": [0.2, 0.6, 0.6, 0.2],
  "golf-cart": [0.18, 0.4, 0.4, 0.18],
  resurfacer: [0.12, 0.35, 0.35, 0.12],
  trolley: [0.04, 0.04, 0.04, 0.04],
  f1: [0.2, 0.3, 0.3, 0.2],
  gt: [0.4, 0.6, 0.6, 0.4],
  motorcycle: [0.1, 0.1, 0.1, 0.1],
  cab: [0.1, 0.35, 0.35, 0.1],
  "box-truck": [0.1, 0.35, 0.35, 0.1],
  tug: [0.2, 0.25, 0.25, 0.2],
  machine: [0.2, 0.2, 0.2, 0.2],
};

// Taller vehicles throw a longer shadow: the sun is fixed, so the offset only grows with the roof.
const HEIGHT: Record<Style | Load, number> = {
  hatch: 1,
  van: 1.3,
  pickup: 1.1,
  bus: 1.6,
  city: 0.95,
  suv: 1.2,
  limo: 0.95,
  camper: 1.5,
  garbage: 1.8,
  fire: 1.7,
  coach: 1.75,
  decker: 2.6,
  artic: 1.6,
  tractor: 1.5,
  quad: 0.6,
  forklift: 0.9,
  caravan: 1.4,
  "tuk-tuk": 1.2,
  "golf-cart": 1.1,
  resurfacer: 1.4,
  trolley: 0.5,
  f1: 0.4,
  gt: 0.8,
  motorcycle: 1.3,
  cab: 2,
  "box-truck": 1.9,
  tug: 0.8,
  machine: 1.5,
  box: 0.5,
  horse: 1.4,
  farm: 0.9,
  boat: 0.9,
  semi: 2,
  dolly: 0.5,
  body: 1.9,
  cart: 0.7,
};

// A tractor and a quad are narrower than their wheels: the body is the bonnet and cab, or the frame under the seat.
function outline(ctx: CanvasRenderingContext2D, l: number, half: number, style: Style) {
  ctx.beginPath();
  if (style === Style.TRACTOR) {
    ctx.roundRect(-0.3, -0.45, l / 2 + 0.3, 0.9, [0.1, 0.25, 0.25, 0.1]);
    ctx.roundRect(-l / 2, -0.8, 1.75, 1.6, 0.18);
    return;
  }
  if (style === Style.QUAD) {
    ctx.roundRect(-l / 2, -0.4, l, 0.8, 0.3);
    return;
  }
  // A tractor unit is its cab and the chassis behind it, the mudguards over the drive axle the widest part.
  if (style === Style.CAB) {
    ctx.roundRect(l / 2 - CAB_DEPTH, -half, CAB_DEPTH, half * 2, [0.1, 0.35, 0.35, 0.1]);
    ctx.roundRect(-l / 2, -0.55, l - CAB_DEPTH + 0.1, 1.1, 0.08);
    ctx.roundRect(-l / 2 + 0.15, -half + 0.08, 1.3, half * 2 - 0.16, 0.2);
    return;
  }
  if (style === Style.GT) {
    gt_outline(ctx, l, half);
    return;
  }
  const corners = CORNERS[style].map((r) => Math.min(r, half));
  ctx.roundRect(-l / 2, -half, l, half * 2, corners);
}

// Wide over the rear wheels, pinched at the doors, the front wings full again and the nose rounding off.
function gt_outline(ctx: CanvasRenderingContext2D, l: number, h: number) {
  const back = -l / 2;
  const nose = l / 2;
  ctx.moveTo(back + 0.4, -h);
  ctx.lineTo(-0.5, -h);
  ctx.bezierCurveTo(-0.15, -h + 0.1, 0.45, -h + 0.1, 0.8, -h + 0.02);
  ctx.lineTo(nose - 0.55, -h + 0.02);
  ctx.quadraticCurveTo(nose, -h + 0.06, nose, -h + 0.5);
  ctx.lineTo(nose, h - 0.5);
  ctx.quadraticCurveTo(nose, h - 0.06, nose - 0.55, h - 0.02);
  ctx.lineTo(0.8, h - 0.02);
  ctx.bezierCurveTo(0.45, h - 0.1, -0.15, h - 0.1, -0.5, h);
  ctx.lineTo(back + 0.4, h);
  ctx.quadraticCurveTo(back, h, back, h - 0.4);
  ctx.lineTo(back, -h + 0.4);
  ctx.quadraticCurveTo(back, -h, back + 0.4, -h);
  ctx.closePath();
}

function shadow(
  ctx: CanvasRenderingContext2D,
  centre: Vec,
  heading: number,
  length: number,
  width: number,
  style: Style,
  height: number,
  palette: Palette
) {
  ctx.save();
  ctx.translate(centre.x + 0.1 * height, centre.y + 0.16 * height);
  ctx.rotate(heading);
  outline(ctx, length + 0.06, width / 2 + 0.03, style);
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

function seams(ctx: CanvasRenderingContext2D, lines: [number, number, number, number][], scale: number, palette: Palette) {
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of lines) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

interface Frame {
  l: number;
  half: number;
  roof: number;
  paint: Paint;
  scale: number;
  palette: Palette;
}

// Window strips run along both flanks; `doors` are breaks in the right one, the kerb side.
function bus_flanks(ctx: CanvasRenderingContext2D, f: Frame, from: number, to: number, doors: number[], strip = 0.2) {
  const { half, paint } = f;
  glass(ctx, paint);
  for (const side of [-1, 1]) ctx.fillRect(from, side > 0 ? half - strip - 0.06 : -half + 0.06, to - from, strip);
  ctx.fillStyle = paint.body;
  for (const at of doors) ctx.fillRect(at, half - strip - 0.08, 1.15, strip + 0.04);
  seams(
    ctx,
    doors.map((at) => [at + 0.575, half - strip - 0.06, at + 0.575, half - 0.06]),
    f.scale,
    f.palette
  );
}

function grille(ctx: CanvasRenderingContext2D, f: Frame) {
  seams(
    ctx,
    [-0.5, -0.25, 0, 0.25, 0.5].map((y) => [-f.l / 2 + 0.08, y, -f.l / 2 + 0.32, y]),
    f.scale,
    f.palette
  );
}

function air_pod(ctx: CanvasRenderingContext2D, f: Frame, at: number) {
  pill(ctx, at - 1.1, -0.55, 2.2, 1.1, 0.14, f.paint.glass);
  ctx.globalAlpha = 0.5;
  pill(ctx, at - 1, -0.45, 2, 0.9, 0.1, f.paint.body);
  ctx.globalAlpha = 1;
}

function hatch(ctx: CanvasRenderingContext2D, f: Frame, back: number, front: number, rear: number, windscreen: number) {
  const { roof, half, paint } = f;
  pill(ctx, back, -roof, front - back, roof * 2, 0.14, paint.roof);
  glass(ctx, paint);
  pane(ctx, front, windscreen, roof, half - 0.14);
  pane(ctx, back, rear, roof, half - 0.16);
}

const PAINTERS: Record<Style, (ctx: CanvasRenderingContext2D, f: Frame) => void> = {
  hatch: (ctx, f) => hatch(ctx, f, -f.l * 0.2, f.l * 0.1, -f.l * 0.3, f.l * 0.24),
  city: (ctx, f) => {
    hatch(ctx, f, -f.l * 0.22, f.l * 0.1, -f.l * 0.33, f.l * 0.25);
    ctx.globalAlpha = 0.45;
    pill(ctx, -f.l * 0.2, -f.roof + 0.06, f.l * 0.28, (f.roof - 0.06) * 2, 0.12, f.paint.glass);
    ctx.globalAlpha = 1;
  },
  suv: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const back = -l * 0.38;
    const front = l * 0.12;
    pill(ctx, back, -roof, front - back, roof * 2, 0.12, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, l * 0.25, roof, half - 0.13);
    pane(ctx, back, -l * 0.43, roof, half - 0.16);
    ctx.strokeStyle = f.palette.ink;
    ctx.lineWidth = 0.05;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(back + 0.2, side * (roof - 0.08));
      ctx.lineTo(front - 0.2, side * (roof - 0.08));
    }
    ctx.stroke();
    ctx.lineCap = "butt";
    pill(ctx, -l / 2 - 0.07, -0.32, 0.16, 0.64, 0.08, f.palette.ink);
  },
  limo: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const back = -l * 0.36;
    const front = l * 0.24;
    pill(ctx, back, -roof, front - back, roof * 2, 0.14, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, front + 0.65, roof, half - 0.13);
    pane(ctx, back, back - 0.5, roof, half - 0.16);
    for (const side of [-1, 1]) ctx.fillRect(back + 0.35, side > 0 ? roof - 0.16 : -roof + 0.02, front - back - 0.7, 0.14);
    pill(ctx, -0.9, -0.32, 1.5, 0.64, 0.18, paint.glass);
    seams(ctx, [[-l * 0.06, -roof, -l * 0.06, roof]], f.scale, f.palette);
  },
  van: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const front = l / 2 - 1.15;
    pill(ctx, -l / 2 + 0.12, -roof, front + l / 2 - 0.12, roof * 2, 0.12, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, front + 0.42, roof, half - 0.12);
    seams(
      ctx,
      [
        [-l * 0.18, -roof + 0.08, -l * 0.18, roof - 0.08],
        [l * 0.06, -roof + 0.08, l * 0.06, roof - 0.08],
        [-l / 2 + 0.03, 0, -l / 2 + 0.3, 0],
      ],
      f.scale,
      f.palette
    );
  },
  camper: (ctx, f) => {
    const { l, roof, half, paint, palette } = f;
    const front = l / 2 - 1.2;
    pill(ctx, -l / 2 + 0.12, -roof, front + l / 2 - 0.12, roof * 2, 0.14, paint.roof);
    glass(ctx, paint);
    pane(ctx, front, front + 0.45, roof, half - 0.12);
    pill(ctx, -0.5, -0.32, 0.75, 0.64, 0.12, paint.glass);
    pill(ctx, -l / 2 + 0.5, -0.25, 0.55, 0.5, 0.1, paint.glass);
    pill(ctx, 0.45, -0.42, 1.1, 0.84, 0.05, palette.ink);
    seams(ctx, [[1, -0.42, 1, 0.42], [0.45, 0, 1.55, 0]], f.scale, palette);
    pill(ctx, -l / 2 + 0.4, half - 0.2, l - 2.2, 0.16, 0.08, palette.glow);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / f.scale;
    ctx.stroke();
  },
  pickup: (ctx, f) => {
    const { l, roof, half, paint } = f;
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
    pill(ctx, -l / 2 + rail + 0.05, -half + rail + 0.05, bed_front - (-l / 2 + rail) - 0.1, (half - rail - 0.05) * 2, 0.04, paint.roof);
    ctx.globalAlpha = 1;
  },
  bus: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const front = l / 2 - 0.45;
    const back = -l / 2 + 0.35;
    pill(ctx, back, -roof - 0.08, front - back, (roof + 0.08) * 2, 0.16, paint.roof);
    glass(ctx, paint);
    pane(ctx, front - 0.05, l / 2 - 0.1, roof + 0.08, half - 0.1);
    bus_flanks(ctx, f, back + 0.3, front - 0.5, [front - 1.6, -0.6]);
    air_pod(ctx, f, -0.5);
    grille(ctx, f);
  },
  artic: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const front = l / 2 - 0.45;
    const back = -l / 2 + 0.15;
    pill(ctx, back, -roof - 0.08, front - back, (roof + 0.08) * 2, 0.16, paint.roof);
    glass(ctx, paint);
    pane(ctx, front - 0.05, l / 2 - 0.1, roof + 0.08, half - 0.1);
    bus_flanks(ctx, f, back + 0.2, front - 0.5, [front - 1.6, -l / 2 + 1.4]);
    air_pod(ctx, f, 0.2);
  },
  coach: (ctx, f) => {
    const { l, roof, half, paint } = f;
    const front = l / 2 - 0.7;
    const back = -l / 2 + 0.35;
    pill(ctx, back, -roof - 0.1, front - back, (roof + 0.1) * 2, 0.3, paint.roof);
    glass(ctx, paint);
    pane(ctx, front - 0.05, l / 2 - 0.08, roof + 0.1, half - 0.08);
    bus_flanks(ctx, f, back + 0.25, front - 0.1, [front - 1.3], 0.26);
    ctx.globalAlpha = 0.2;
    pill(ctx, -l / 2 + 1.3, -0.5, l - 3, 1, 0.5, f.palette.glow);
    ctx.globalAlpha = 1;
    for (const at of [1.8, -0.6, -3]) pill(ctx, at - 0.45, -0.28, 0.9, 0.56, 0.14, paint.glass);
    grille(ctx, f);
  },
  decker: (ctx, f) => {
    const { l, half, paint, palette } = f;
    pill(ctx, -l / 2 + 0.08, -half + 0.08, l - 0.16, (half - 0.08) * 2, 0.42, paint.glass);
    pill(ctx, -l / 2 + 0.38, -half + 0.34, l - 1, (half - 0.34) * 2, 0.2, paint.roof);
    ctx.fillStyle = paint.body;
    ctx.fillRect(l / 2 - 0.62, -0.05, 0.56, 0.1);
    const frames: [number, number, number, number][] = [];
    for (let x = -l / 2 + 1.2; x < l / 2 - 1; x += 1.15) for (const side of [-1, 1]) frames.push([x, side * (half - 0.08), x, side * (half - 0.34)]);
    seams(ctx, frames, f.scale, palette);
    for (const at of [1.6, -2.4]) pill(ctx, at - 0.35, -0.3, 0.7, 0.6, 0.1, paint.glass);
  },
  garbage: (ctx, f) => {
    const { l, roof, half, paint, palette } = f;
    const cab = l / 2 - 1.95;
    pill(ctx, cab, -roof, 1.55, roof * 2, 0.14, paint.roof);
    glass(ctx, paint);
    pane(ctx, l / 2 - 0.4, l / 2 - 0.1, roof, half - 0.1);
    const body_back = -l / 2 + 1.15;
    pill(ctx, body_back, -roof - 0.08, cab - 0.15 - body_back, (roof + 0.08) * 2, 0.1, paint.roof);
    const ribs: [number, number, number, number][] = [];
    for (let x = body_back + 0.55; x < cab - 0.3; x += 0.7) ribs.push([x, -roof - 0.08, x, roof + 0.08]);
    seams(ctx, ribs, f.scale, palette);
    pill(ctx, -l / 2 + 0.05, -half + 0.1, 1.05, (half - 0.1) * 2, 0.08, palette.ink);
    ctx.globalAlpha = 0.6;
    pill(ctx, -l / 2 + 0.2, -half + 0.25, 0.75, (half - 0.25) * 2, 0.06, paint.glass);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? palette.ink : palette.warning;
      ctx.fillRect(-l / 2 + 0.02, -half + 0.12 + i * ((half * 2 - 0.24) / 6), 0.16, (half * 2 - 0.24) / 6);
    }
  },
  fire: (ctx, f) => {
    const { l, roof, half, paint, palette } = f;
    const cab = l / 2 - 2.1;
    pill(ctx, cab, -roof, 1.7, roof * 2, 0.14, paint.roof);
    glass(ctx, paint);
    pane(ctx, l / 2 - 0.4, l / 2 - 0.1, roof, half - 0.1);
    const body_back = -l / 2 + 0.1;
    const lockers: [number, number, number, number][] = [];
    for (let x = body_back + 1.1; x < cab - 0.2; x += 1.1)
      for (const side of [-1, 1]) lockers.push([x, side * (half - 0.03), x, side * (roof + 0.05)]);
    seams(ctx, lockers, f.scale, palette);
    for (const side of [-1, 1]) pill(ctx, body_back + 0.2, side > 0 ? half - 0.14 : -half + 0.06, cab - body_back - 0.4, 0.08, 0.04, palette.glow);
    ctx.beginPath();
    ctx.arc(-l / 2 + 1.1, 0, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let x = -l / 2 + 0.9; x < cab + 1.1; x += 0.32) {
      ctx.moveTo(x, -0.32);
      ctx.lineTo(x, 0.32);
    }
    ctx.stroke();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(-l / 2 + 0.7, side * 0.36);
      ctx.lineTo(cab + 1.2, side * 0.36);
    }
    ctx.stroke();
  },
  tractor: (ctx, f) => {
    const { l, paint, palette } = f;
    pill(ctx, l / 2 - 0.22, -0.4, 0.2, 0.8, 0.06, palette.ink);
    seams(ctx, [[-0.1, 0, l / 2 - 0.3, 0]], f.scale, palette);
    const axle = l / 2 - (TRACTOR.length - TRACTOR.rear_overhang - TRACTOR.wheelbase);
    pill(ctx, axle - 0.07, -TRACTOR.track / 2, 0.14, TRACTOR.track, 0.05, palette.ink);
    pill(ctx, -l / 2 + 0.05, -0.75, 1.65, 1.5, 0.16, paint.glass);
    pill(ctx, -l / 2 + 0.2, -0.6, 1.35, 1.2, 0.12, paint.roof);
    for (const side of [-1, 1]) pill(ctx, -l / 2 + 0.05, side > 0 ? 0.62 : -1.12, 1.6, 0.5, 0.2, paint.body);
    ctx.beginPath();
    ctx.arc(0.05, -0.32, 0.09, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
  },
  quad: (ctx, f) => {
    const { l, paint, palette } = f;
    for (const x of [l / 2 - 0.42, -l / 2 + 0.42]) pill(ctx, x - 0.4, -0.58, 0.8, 1.16, 0.25, paint.body);
    pill(ctx, -0.55, -0.2, 0.75, 0.4, 0.16, paint.roof);
    ctx.strokeStyle = palette.ink;
    ctx.lineCap = "round";
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(0.42, -0.45);
    ctx.lineTo(0.48, 0);
    ctx.lineTo(0.42, 0.45);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.arc(0.05, 0, 0.19, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.05, 0, 0.13, -0.9, 0.9);
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = 0.05;
    ctx.stroke();
  },
  caravan: (ctx, f) => caravan_top(ctx, f),
  cab: (ctx, f) => {
    const { l, half, roof, paint, palette } = f;
    const back = l / 2 - CAB_DEPTH;
    pill(ctx, back + 0.12, -roof, CAB_DEPTH - 0.55, roof * 2, 0.2, paint.roof);
    // The air deflector over the cab roof.
    pill(ctx, back + 0.55, -roof + 0.18, 1.1, (roof - 0.18) * 2, 0.45, paint.glass);
    glass(ctx, paint);
    pane(ctx, l / 2 - 0.42, l / 2 - 0.1, roof, half - 0.1);
    for (const side of [-1, 1]) pill(ctx, back - 0.32, side * 0.68 - 0.09, 0.18, 0.18, 0.09, palette.ink);
    seams(ctx, [[back + 0.05, -half + 0.1, back + 0.05, half - 0.1]], f.scale, palette);
    // The fifth wheel: a plate with the slot the kingpin drops into.
    ctx.beginPath();
    ctx.arc(-l / 2 + 1.25, 0, 0.6, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
    pill(ctx, -l / 2 + 0.6, -0.08, 0.65, 0.16, 0.06, paint.roof);
    for (const side of [-1, 1]) pill(ctx, -l / 2 + 2.1, side * 0.82 - 0.2, 1.1, 0.4, 0.15, paint.glass);
  },
  "box-truck": (ctx, f) => {
    const { l, half, roof, paint, palette } = f;
    const cab = l / 2 - 1.85;
    pill(ctx, cab + 0.1, -roof, 1.3, roof * 2, 0.16, paint.roof);
    glass(ctx, paint);
    pane(ctx, l / 2 - 0.42, l / 2 - 0.1, roof, half - 0.1);
    box_roof(ctx, f, -l / 2 + 0.06, cab - 0.12);
    pill(ctx, -l / 2 + 0.02, -0.25, 0.14, 0.5, 0.05, palette.ink);
  },
  tug: (ctx, f) => {
    const { l, half, paint, palette } = f;
    pill(ctx, -l / 2 + 0.25, -half + 0.12, 1.3, (half - 0.12) * 2, 0.12, paint.roof);
    pill(ctx, -l / 2 + 0.45, -0.32, 0.55, 0.64, 0.12, paint.glass);
    ctx.beginPath();
    ctx.arc(0.2, -0.12, 0.13, 0, Math.PI * 2);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.05;
    ctx.stroke();
    pill(ctx, l / 2 - 0.16, -half + 0.05, 0.14, half * 2 - 0.1, 0.05, palette.ink);
    pill(ctx, -l / 2 + 0.02, -half + 0.05, 0.12, half * 2 - 0.1, 0.05, palette.ink);
    seams(ctx, [[0.55, -half + 0.12, 0.55, half - 0.12]], f.scale, palette);
  },
  forklift: () => {},
  "tuk-tuk": () => {},
  "golf-cart": () => {},
  resurfacer: () => {},
  trolley: () => {},
  f1: () => {},
  gt: gt_top,
  motorcycle: () => {},
  machine: () => {},
};

const CAB_DEPTH = 2.3;

// A long bonnet with its power bulge and vents, a low cabin swept back into a fastback, twin stripes and a wing on the tail.
function gt_top(ctx: CanvasRenderingContext2D, f: Frame) {
  const { l, half, paint, palette } = f;
  const cabin = f.roof - 0.16;
  const back = -0.95;
  const front = -0.15;
  const screen = 0.45;
  const fastback = back - 0.85;
  const tail = -l / 2;
  ctx.globalAlpha = 0.7;
  for (const side of [-1, 1]) {
    pill(ctx, screen + 0.05, side * 0.17 - 0.06, l / 2 - screen - 0.12, 0.12, 0.04, paint.roof);
    pill(ctx, tail + 0.1, side * 0.17 - 0.06, fastback - tail - 0.1, 0.12, 0.04, paint.roof);
  }
  ctx.globalAlpha = 1;
  seams(
    ctx,
    [
      [screen + 0.25, -0.42, l / 2 - 0.4, -0.34],
      [screen + 0.25, 0.42, l / 2 - 0.4, 0.34],
    ],
    f.scale,
    palette
  );
  for (const side of [-1, 1]) pill(ctx, 1.15, side * 0.58 - 0.05, 0.45, 0.1, 0.05, palette.ink);
  pill(ctx, back, -cabin, front - back, cabin * 2, 0.2, paint.roof);
  glass(ctx, paint);
  pane(ctx, front, screen, cabin, half - 0.22);
  pane(ctx, back, fastback, cabin - 0.02, cabin - 0.26);
  for (const side of [-1, 1]) pill(ctx, front + 0.3, side > 0 ? half - 0.1 : -half - 0.08, 0.16, 0.18, 0.06, paint.roof);
  for (const side of [-1, 1]) pill(ctx, tail + 0.36, side * 0.5 - 0.05, 0.16, 0.1, 0.03, palette.ink);
  pill(ctx, tail + 0.2, -half + 0.06, 0.26, half * 2 - 0.12, 0.08, palette.ink);
  pill(ctx, tail + 0.24, -half + 0.12, 0.14, half * 2 - 0.24, 0.05, paint.body);
}

// A box body's roof: a lighter panel inside the rim, ribbed across, with a rub rail down each side.
function box_roof(ctx: CanvasRenderingContext2D, f: Frame, from: number, to: number) {
  const { half, paint, palette } = f;
  pill(ctx, from + 0.08, -half + 0.1, to - from - 0.16, (half - 0.1) * 2, 0.08, paint.roof);
  const ribs: [number, number, number, number][] = [];
  for (let x = from + 0.6; x < to - 0.3; x += 0.6) ribs.push([x, -half + 0.16, x, half - 0.16]);
  seams(ctx, ribs, f.scale, palette);
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(from + 0.1, side * (half - 0.05));
    ctx.lineTo(to - 0.1, side * (half - 0.05));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function caravan_top(ctx: CanvasRenderingContext2D, f: Frame) {
  const { l, roof, half, paint } = f;
  pill(ctx, -l / 2 + 0.14, -half + 0.14, l - 0.5, (half - 0.14) * 2, 0.35, paint.roof);
  pill(ctx, l / 2 - 0.6, -half + 0.32, 0.38, (half - 0.32) * 2, 0.16, paint.glass);
  for (const side of [-1, 1]) pill(ctx, -l / 2 + 0.3, side > 0 ? half - 0.13 : -half + 0.06, l - 1.1, 0.07, 0.03, paint.glass);
  for (const at of [0.5, -1.3]) pill(ctx, at - 0.3, -0.3, 0.6, 0.6, 0.1, paint.glass);
  pill(ctx, -l / 2 + 0.45, -0.17, 0.34, 0.34, 0.05, f.palette.ink);
}

function body(ctx: CanvasRenderingContext2D, style: Style, length: number, width: number, paint: Paint, scale: number, palette: Palette) {
  const half = width / 2;
  outline(ctx, length, half, style);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  PAINTERS[style](ctx, { l: length, half, roof: half - 0.22, paint, scale, palette });
}

/** Emergency lamps take turns while the vehicle is in gear; in P they glow steady and dim. */
export function beacon(ctx: CanvasRenderingContext2D, x: number, y: number, lens: string, halo: string, on: number, palette: Palette) {
  if (on > 0.5) pill(ctx, x - 0.18, y - 0.26, 0.36, 0.52, 0.2, halo);
  lamp(ctx, x - 0.07, y - 0.15, 0.14, 0.3, lens, palette, on);
}

export function flashes(time: number, active: boolean): [number, number] {
  if (!active) return [0.35, 0.35];
  return Math.floor(time * 5) % 2 ? [1, 0.25] : [0.25, 1];
}

function checks(ctx: CanvasRenderingContext2D, from: number, to: number, y: number, size: number, colours: string[]) {
  for (let x = from, i = 0; x < to - 1e-6; x += size, i++) {
    ctx.fillStyle = colours[i % colours.length];
    ctx.fillRect(x, y, Math.min(size, to - x), size);
  }
}

function livery(ctx: CanvasRenderingContext2D, kind: Livery, l: number, half: number, lights: [number, number], palette: Palette) {
  if (kind === Livery.TAXI) {
    for (const side of [-1, 1]) {
      const y = side > 0 ? half - 0.2 : -half + 0.08;
      checks(ctx, -l * 0.28, l * 0.22, y, 0.12, [palette.ink, palette.warning]);
    }
    lamp(ctx, -0.22, -0.36, 0.3, 0.72, palette.warning, palette, 0.95);
    return;
  }
  if (kind === Livery.POLICE) {
    for (const side of [-1, 1]) {
      const y = side > 0 ? half - 0.22 : -half + 0.08;
      checks(ctx, -l / 2 + 0.3, l / 2 - 0.4, y, 0.14, [palette.info, palette.glow]);
    }
    pill(ctx, -0.25, -0.62, 0.3, 1.24, 0.08, palette.ink);
    beacon(ctx, -0.1, -0.32, palette.info, palette.info_glow, lights[0], palette);
    beacon(ctx, -0.1, 0.32, palette.error, palette.brake_glow, lights[1], palette);
    return;
  }
  for (const side of [-1, 1]) {
    const y = side > 0 ? half - 0.28 : -half + 0.06;
    checks(ctx, -l / 2 + 0.25, l / 2 - 1.2, y, 0.22, [palette.success, palette.warning]);
  }
  ctx.fillStyle = palette.error;
  ctx.fillRect(-0.9, -0.09, 0.7, 0.18);
  ctx.fillRect(-0.64, -0.35, 0.18, 0.7);
  pill(ctx, l / 2 - 1.42, -0.7, 0.26, 1.4, 0.08, palette.ink);
  beacon(ctx, l / 2 - 1.29, -0.42, palette.info, palette.info_glow, lights[0], palette);
  beacon(ctx, l / 2 - 1.29, 0.42, palette.info, palette.info_glow, lights[1], palette);
}

export interface Lamps {
  braking: boolean;
  reversing: boolean;
  lit: number;
}

function head_lamps(ctx: CanvasRenderingContext2D, l: number, w: number, style: Style, palette: Palette, lit: number) {
  if (style === Style.CARAVAN) return;
  if (style === Style.QUAD) {
    lamp(ctx, l - 0.12, -0.12, 0.08, 0.24, palette.glow, palette, lit);
    return;
  }
  if (style === Style.TRACTOR) {
    for (const side of [-1, 1]) lamp(ctx, l - 0.12, side * 0.3 - 0.08, 0.08, 0.16, palette.glow, palette, lit);
    return;
  }
  const big = w > 1.2 ? 1.3 : 1;
  for (const side of [-1, 1]) lamp(ctx, l - 0.14, side * (w - 0.36 * big) - 0.18 * big, 0.1, 0.36 * big, palette.glow, palette, lit);
}

function tail_lamps(ctx: CanvasRenderingContext2D, l: number, w: number, palette: Palette, lamps: Lamps, narrow = false) {
  const out = narrow ? 0.4 : w;
  for (const side of [-1, 1]) {
    if (lamps.braking) pill(ctx, -l - 0.12, side * (out - 0.28) - 0.26, 0.3, 0.52, 0.2, palette.brake_glow);
    lamp(ctx, -l + 0.05, side * (out - 0.28) - 0.15, 0.09, 0.3, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
    if (lamps.reversing && !narrow) lamp(ctx, -l + 0.05, side * (w - 0.64) - 0.07, 0.09, 0.14, palette.glow, palette);
  }
}

const BELLOWS = 1.1;

function bellows(ctx: CanvasRenderingContext2D, at: Vec, heading: number, width: number, scale: number, palette: Palette) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(heading);
  pill(ctx, -BELLOWS / 2, -width / 2 + 0.12, BELLOWS, width - 0.24, 0.12, palette.ink);
  ctx.strokeStyle = palette.tread;
  ctx.lineWidth = 1.25 / scale;
  ctx.beginPath();
  for (let x = -BELLOWS / 2 + 0.14; x < BELLOWS / 2; x += 0.14) {
    ctx.moveTo(x, -width / 2 + 0.2);
    ctx.lineTo(x, width / 2 - 0.2);
  }
  ctx.stroke();
  ctx.restore();
}

export function parked_vehicle(ctx: CanvasRenderingContext2D, solid: Solid, scale: number, palette: Palette) {
  const car = solid.car!;
  if (car.vehicle === Vehicle.CARAVAN) return parked_caravan(ctx, solid, scale, palette);
  if (car.vehicle === Vehicle.SEMI) return parked_trailer(ctx, solid, scale, palette);
  const { style } = look_of(car.vehicle);
  const paint = palette.cars[car.paint % palette.cars.length];
  if (car.vehicle === Vehicle.MOTORCYCLE) return parked_motorcycle(ctx, solid, paint, scale, palette);
  shadow(ctx, car.pose, car.pose.heading, car.length, car.width, style, HEIGHT[style], palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const l = car.length / 2;
  const w = car.width / 2;
  const big = car.length > 6.5;
  const axles = car.length > 9 ? [l - 2.5, -l + 3.6] : big ? [l - 1.45, -l + 1.9] : [l - 0.85, -l + 0.75];
  const tyre = car.length > 9 ? 1 : big ? 0.95 : 0.6;
  for (const x of axles)
    for (const side of [-1, 1]) pill(ctx, x - tyre / 2, side * (w - 0.1) - 0.11, tyre, 0.22, 0.06, palette.ink);
  body(ctx, style, car.length, car.width, paint, scale, palette);
  head_lamps(ctx, l, w, style, palette, 0.6);
  tail_lamps(ctx, l, w, palette, { braking: false, reversing: false, lit: 0.6 });
  ctx.restore();
}

// A semi-trailer left at a dock door without its tractor: the box on its tri-axle, the landing legs down at the front.
function parked_trailer(ctx: CanvasRenderingContext2D, solid: Solid, scale: number, palette: Palette) {
  const car = solid.car!;
  const paint = palette.cars[car.paint % palette.cars.length];
  shadow(ctx, car.pose, car.pose.heading, car.length, car.width, Style.VAN, HEIGHT.semi, palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const l = car.length / 2;
  const w = car.width / 2;
  for (const x of [-l + 3, -l + 4.3, -l + 5.6])
    for (const side of [-1, 1]) pill(ctx, x - 0.45, side * (w - 0.12) - 0.15, 0.9, 0.3, 0.06, palette.ink);
  for (const side of [-1, 1]) pill(ctx, l - 2.6, side * (w - 0.35) - 0.1, 0.2, 0.2, 0.04, palette.ink);
  outline(ctx, car.length, w, Style.VAN);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / scale;
  ctx.stroke();
  box_roof(ctx, { l: car.length, half: w, roof: w - 0.22, paint, scale, palette }, -l, l);
  tail_lamps(ctx, l, w, palette, { braking: false, reversing: false, lit: 0.6 });
  ctx.restore();
}

function parked_caravan(ctx: CanvasRenderingContext2D, solid: Solid, scale: number, palette: Palette) {
  const car = solid.car!;
  const t = CARAVAN_TRAILER;
  const paint = palette.cars[car.paint % palette.cars.length];
  const back = -car.length / 2;
  const box_centre = to_world(car.pose, { x: back + t.box_length / 2, y: 0 });
  shadow(ctx, box_centre, car.pose.heading, t.box_length, car.width, Style.CARAVAN, HEIGHT.caravan, palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const nose = car.length / 2;
  const front = back + t.box_length;
  a_frame(ctx, { x: front, y: -car.width / 2 + 0.45 }, { x: front, y: car.width / 2 - 0.45 }, { x: nose - 0.1, y: 0 }, palette);
  pill(ctx, front + 0.05, -0.4, 0.42, 0.8, 0.1, paint.roof);
  ctx.beginPath();
  ctx.arc(nose - 0.35, 0, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.translate(back + t.box_length / 2, 0);
  body(ctx, Style.CARAVAN, t.box_length, car.width, paint, scale, palette);
  tail_lamps(ctx, t.box_length / 2, car.width / 2, palette, { braking: false, reversing: false, lit: 0.6 });
  ctx.restore();
}

function a_frame(ctx: CanvasRenderingContext2D, left: Vec, right: Vec, ball: Vec, palette: Palette) {
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(ball.x, ball.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  ctx.lineCap = "butt";
}

// Tyres are drawn over the body so the player sees where the front pair points; nudged out so they sit on its edge.
const TYRE_SHOW = 0.08;
// A body as wide as the track would hide its tyres, so they move out until this much shows past the side.
const TYRE_POKE = 0.11;

export function tyre_out(track: number, tyre_width: number, body_width: number): number {
  return Math.max(TYRE_SHOW, body_width / 2 + TYRE_POKE - track / 2 - tyre_width / 2);
}
const TREAD_PITCH = 0.11;
// A coach's drive and tag axles straddle the pose, which sits between them.
const TAG_SPREAD = 0.7;

interface TyreSize {
  length: number;
  width: number;
}

export function tyre(
  ctx: CanvasRenderingContext2D,
  at: Vec,
  angle: number,
  roll: number,
  out: number,
  size: TyreSize,
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
export function blur_of(car: Car): number {
  return Math.max(0, Math.min(1, 1 - (Math.abs(car.speed) - 1.2) / 1.8));
}

function tyres(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, style: Style, scale: number, palette: Palette, tread = true) {
  const size = { length: spec.wheel_diameter + 0.04, width: spec.wheel_width + 0.05 };
  const front = style === Style.TRACTOR ? { length: 0.9, width: 0.32 } : style === Style.GT ? { ...size, width: size.width - 0.08 } : size;
  const blur = tread ? blur_of(car) : 0;
  const show = tyre_out(spec.track, size.width, spec.width);
  for (const [i, wheel] of wheels(car, spec).entries()) {
    const out = (i % 2 ? 1 : -1) * show;
    const angle = car.heading + wheel.angle;
    if (i >= 2 && style === Style.COACH) {
      for (const shift of [-TAG_SPREAD, TAG_SPREAD]) {
        const at = { x: wheel.at.x + Math.cos(car.heading) * shift, y: wheel.at.y + Math.sin(car.heading) * shift };
        tyre(ctx, at, angle, car.roll[i], out, size, blur, scale, palette);
      }
      continue;
    }
    tyre(ctx, wheel.at, angle, car.roll[i], out, i < 2 ? front : size, blur, scale, palette);
  }
}

function load_top(ctx: CanvasRenderingContext2D, load: Load, f: Frame) {
  const { l, half, paint, palette } = f;
  const x0 = -l / 2;
  if (load === Load.HORSE) {
    pill(ctx, x0 + 0.15, -half + 0.15, l - 0.45, (half - 0.15) * 2, 0.4, paint.roof);
    for (const at of [0.7, -0.6]) pill(ctx, at - 0.25, -0.22, 0.5, 0.44, 0.08, paint.glass);
    seams(ctx, [[x0 + 0.18, -half + 0.12, x0 + 0.18, half - 0.12]], f.scale, palette);
    return;
  }
  if (load === Load.CARAVAN) return caravan_top(ctx, f);
  if (load === Load.SEMI || load === Load.BODY) return box_roof(ctx, f, x0, l / 2);
  if (load === Load.CART) {
    pill(ctx, x0 + 0.08, -half + 0.08, l - 0.16, (half - 0.08) * 2, 0.05, paint.glass);
    const bags: [number, number, number, number][] = [
      [x0 + 0.2, -half + 0.18, 0.9, 0.6],
      [x0 + 0.25, 0.08, 0.7, 0.5],
      [x0 + 1.25, -half + 0.2, 0.6, 0.55],
      [x0 + 1.2, 0.02, 1.05, 0.52],
      [x0 + 2, -half + 0.16, 0.6, 0.62],
    ];
    bags.forEach(([x, y, w, h], i) => pill(ctx, x, y, w, h, 0.08, i % 2 ? paint.roof : paint.body));
    seams(ctx, bags.map(([x, y, w, h]) => [x, y + h / 2, x + w, y + h / 2]), f.scale, palette);
    return;
  }
  if (load === Load.BUS) {
    pill(ctx, x0 + 0.3, -f.roof - 0.08, l - 0.5, (f.roof + 0.08) * 2, 0.16, paint.roof);
    bus_flanks(ctx, f, x0 + 0.5, l / 2 - 0.4, [l / 2 - 2.6]);
    air_pod(ctx, f, 0.6);
    grille(ctx, f);
    return;
  }
  // Seen from above an open trailer is its floor inside a rim of side boards.
  const rim = load === Load.FARM ? 0.14 : 0.1;
  pill(ctx, x0 + rim, -half + rim, l - rim * 2, (half - rim) * 2, 0.06, paint.glass);
  ctx.globalAlpha = 0.6;
  pill(ctx, x0 + rim + 0.04, -half + rim + 0.04, l - rim * 2 - 0.08, (half - rim - 0.04) * 2, 0.05, paint.roof);
  ctx.globalAlpha = 1;
  if (load === Load.FARM) {
    const boards: [number, number, number, number][] = [];
    for (let x = x0 + 1.1; x < l / 2 - 0.5; x += 1.1) boards.push([x, -half + rim, x, half - rim]);
    seams(ctx, boards, f.scale, palette);
  }
}

function boat(ctx: CanvasRenderingContext2D, f: Frame) {
  const { l, half, paint, palette } = f;
  const stern = -l / 2 + 0.35;
  const bow = l / 2;
  const hull = (inset: number) => {
    const w = half - inset;
    ctx.beginPath();
    ctx.moveTo(stern + inset, -w);
    ctx.lineTo(bow - 2.2, -w);
    ctx.quadraticCurveTo(bow - 0.6, -w, bow - inset * 1.6, 0);
    ctx.quadraticCurveTo(bow - 0.6, w, bow - 2.2, w);
    ctx.lineTo(stern + inset, w);
    ctx.closePath();
  };
  hull(0);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1 / f.scale;
  ctx.stroke();
  hull(0.14);
  ctx.fillStyle = paint.roof;
  ctx.fill();
  pill(ctx, stern + 0.3, -half + 0.32, 2.2, (half - 0.32) * 2, 0.25, paint.glass);
  glass(ctx, paint);
  ctx.beginPath();
  ctx.moveTo(stern + 2.7, -half + 0.3);
  ctx.quadraticCurveTo(stern + 3.05, 0, stern + 2.7, half - 0.3);
  ctx.lineWidth = 0.1;
  ctx.stroke();
  pill(ctx, -l / 2 + 0.02, -0.2, 0.42, 0.4, 0.1, palette.ink);
}

function trailer(
  ctx: CanvasRenderingContext2D,
  car: Car,
  spec: VehicleSpec,
  index: number,
  load: Load,
  lamps: Lamps,
  scale: number,
  palette: Palette
) {
  const t = spec.hitches[index];
  const towed = car.trailers?.[index];
  if (!t || !towed) return;
  const pose = trailer_pose(car, spec, index);
  const front = t.axle - t.drawbar;
  const centre = to_world(pose, { x: front - t.box_length / 2, y: 0 });
  const half = t.width / 2;
  const paint = palette.player;
  const style = load === Load.CARAVAN ? Style.CARAVAN : load === Load.BUS ? Style.ARTIC : Style.VAN;
  if (load !== Load.DOLLY) shadow(ctx, centre, pose.heading, t.box_length, t.width, style, HEIGHT[load], palette);

  const size = { length: t.wheel_diameter + 0.04, width: t.wheel_width + 0.05 };
  const blur = blur_of(car);
  const out = tyre_out(t.track, size.width, t.width);
  const wheels_of = () => {
    for (const shift of AXLE_SETS[load] ?? [0]) {
      const along = { x: Math.cos(pose.heading) * shift, y: Math.sin(pose.heading) * shift };
      trailer_wheels(car, spec, index).forEach((at, i) =>
        tyre(ctx, { x: at.x + along.x, y: at.y + along.y }, pose.heading, towed.roll[i], (i ? 1 : -1) * out, size, blur, scale, palette)
      );
    }
  };
  if (load !== Load.BUS) wheels_of();

  const ball = hitch_point(car, spec, index);
  const ahead = index === 0 ? car.heading : car.trailers![index - 1].heading;
  if (load === Load.DOLLY) return dolly(ctx, pose, t, ball, scale, palette);
  if (load !== Load.BUS && !rides(load)) {
    const spread = load === Load.BOAT ? 0.35 : Math.min(half - 0.25, 0.75);
    const bar = load === Load.CART ? 0.08 : spread;
    a_frame(ctx, to_world(pose, { x: front, y: -bar }), to_world(pose, { x: front, y: bar }), ball, palette);
    if (load === Load.BOAT) a_frame(ctx, to_world(pose, { x: 0.3, y: -0.35 }), to_world(pose, { x: 0.3, y: 0.35 }), to_world(pose, { x: front, y: 0 }), palette);
    if (load === Load.CARAVAN) {
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.heading);
      pill(ctx, front + 0.05, -0.4, 0.42, 0.8, 0.1, paint.roof);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(pose.heading);
  const l = t.box_length / 2;
  if (load === Load.BOAT) boat(ctx, { l: t.box_length, half, roof: half - 0.22, paint, scale, palette });
  else {
    if (load === Load.HORSE) {
      ctx.beginPath();
      ctx.roundRect(-l, -half, l * 2, half * 2, [0.15, 0.7, 0.7, 0.15]);
    } else if (load === Load.CART) {
      ctx.beginPath();
      ctx.roundRect(-l, -half, l * 2, half * 2, 0.08);
    } else outline(ctx, t.box_length, half, load === Load.BOX || load === Load.FARM || rides(load) ? Style.VAN : style);
    ctx.fillStyle = paint.body;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    load_top(ctx, load, { l: t.box_length, half, roof: half - 0.22, paint, scale, palette });
  }
  tail_lamps(ctx, l, half, palette, lamps, load === Load.BOAT || half < 0.6);
  ctx.restore();

  if (rides(load)) return;
  if (load === Load.BUS) {
    bellows(ctx, ball, pose.heading + wrap_angle(ahead - pose.heading) / 2, t.width, scale, palette);
    return wheels_of();
  }
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 0.11, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.strokeStyle = palette.tread;
  ctx.lineWidth = 1.25 / scale;
  ctx.stroke();
}

// A semi-trailer's tri-axle group and a drawbar body's tandem straddle the axle the model turns them about.
const AXLE_SETS: Partial<Record<Load, number[]>> = { semi: [-1.3, 0, 1.3], body: [-0.65, 0.65] };

// Seen from above a dolly is its drawbar out to the coupling, a short frame over its axle and the turntable on top.
function dolly(ctx: CanvasRenderingContext2D, pose: Pose, t: TrailerSpec, ball: Vec, scale: number, palette: Palette) {
  const front = t.axle - t.drawbar;
  a_frame(ctx, to_world(pose, { x: front, y: -0.45 }), to_world(pose, { x: front, y: 0.45 }), ball, palette);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  pill(ctx, front - t.box_length, -t.width / 2 + 0.25, t.box_length, t.width - 0.5, 0.1, palette.ink);
  ctx.beginPath();
  ctx.arc(0, 0, 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = palette.tread;
  ctx.lineWidth = 1.5 / scale;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 0.11, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
}

const BEACON_TURN = 5;

// Seen from above a counterbalance forklift is its counterweight, the overhead guard over the seat, the mast across the
// front and the two tines; the amber beacon on the guard turns while it works.
function forklift(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, lamps: Lamps, scale: number, palette: Palette, time: number) {
  const forks = spec.forks;
  const centre = body_centre(car, spec);
  const l = spec.length / 2;
  const half = spec.width / 2;
  const paint = palette.player;
  shadow(ctx, centre, car.heading, spec.length, spec.width, Style.FORKLIFT, HEIGHT.forklift, palette);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  const line = 1 / scale;
  if (forks) {
    const tine = 0.13;
    for (const side of [-1, 1]) {
      const y = side * (forks.width / 2 - tine / 2);
      ctx.beginPath();
      ctx.moveTo(l, y - tine / 2);
      ctx.lineTo(l + forks.length - 0.08, y - tine / 2);
      ctx.lineTo(l + forks.length, y);
      ctx.lineTo(l + forks.length - 0.08, y + tine / 2);
      ctx.lineTo(l, y + tine / 2);
      ctx.closePath();
      ctx.fillStyle = palette.steel;
      ctx.fill();
      ctx.strokeStyle = palette.ink;
      ctx.lineWidth = Math.max(0.02, line);
      ctx.stroke();
    }
  }
  outline(ctx, spec.length, half, Style.FORKLIFT);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = line;
  ctx.stroke();
  // The counterweight: a heavy rounded block at the tail, darker than the paint.
  ctx.beginPath();
  ctx.roundRect(-l, -half, 0.6, half * 2, [0.5, 0, 0, 0.5]);
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.4;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.edge;
  ctx.beginPath();
  for (const x of [-l + 0.22, -l + 0.4]) {
    ctx.moveTo(x, -half + 0.16);
    ctx.lineTo(x, half - 0.16);
  }
  ctx.stroke();
  // The seat and the wheel under the guard.
  pill(ctx, -0.45, -0.25, 0.42, 0.5, 0.12, paint.glass);
  ctx.beginPath();
  ctx.arc(0.22, 0, 0.13, 0, Math.PI * 2);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  // The overhead guard: a frame with crossbars, so the seat shows through.
  const g0 = -0.62;
  const g1 = 0.62;
  const gw = half - 0.08;
  ctx.strokeStyle = palette.ink;
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.075;
  ctx.strokeRect(g0, -gw, g1 - g0, gw * 2);
  ctx.lineWidth = 0.045;
  ctx.beginPath();
  for (const x of [-0.2, 0.2]) {
    ctx.moveTo(x, -gw);
    ctx.lineTo(x, gw);
  }
  ctx.stroke();
  // The mast across the front, the carriage plate the tines hang from.
  pill(ctx, l - 0.18, -0.55, 0.18, 1.1, 0.04, palette.ink);
  if (forks) {
    pill(ctx, l - 0.02, -forks.width / 2 - 0.05, 0.08, forks.width + 0.1, 0.02, palette.steel);
  }
  for (const side of [-1, 1]) lamp(ctx, l - 0.16, side * 0.5 - 0.06, 0.08, 0.12, palette.glow, palette, lamps.lit);
  for (const side of [-1, 1]) {
    if (lamps.braking) pill(ctx, -l - 0.1, side * (half - 0.2) - 0.18, 0.24, 0.36, 0.16, palette.brake_glow);
    lamp(ctx, -l + 0.06, side * (half - 0.2) - 0.1, 0.07, 0.2, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
    if (lamps.reversing) lamp(ctx, -l + 0.06, side * (half - 0.42) - 0.05, 0.07, 0.1, palette.glow, palette);
  }
  // The beacon: an amber dome on the back of the guard with a beam sweeping round it.
  const beacon = { x: g0 + 0.02, y: 0 };
  const turn = time * BEACON_TURN;
  const sweep = ctx.createRadialGradient(beacon.x, beacon.y, 0.05, beacon.x, beacon.y, 1.3);
  sweep.addColorStop(0, palette.beacon);
  sweep.addColorStop(1, palette.beacon_clear);
  ctx.fillStyle = sweep;
  ctx.globalAlpha = palette.beams ? 0.45 : 0.22;
  for (const offset of [0, Math.PI]) {
    ctx.beginPath();
    ctx.moveTo(beacon.x, beacon.y);
    ctx.arc(beacon.x, beacon.y, 1.3, turn + offset - 0.32, turn + offset + 0.32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(beacon.x, beacon.y, 0.11, 0, Math.PI * 2);
  ctx.fillStyle = palette.beacon;
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.025, line);
  ctx.stroke();
  ctx.restore();
}

interface Rig {
  ctx: CanvasRenderingContext2D;
  car: Car;
  spec: VehicleSpec;
  lamps: Lamps;
  scale: number;
  palette: Palette;
  l: number;
  half: number;
  line: number;
  /** Shadow offset, as `HEIGHT` gives the body styles. */
  height: number;
}

type RigDraw = (rig: Rig) => void;

function rig_tyre(rig: Rig, at: Vec, angle: number, roll: number, out: number) {
  const { ctx, car, spec, scale, palette } = rig;
  const size = { length: spec.wheel_diameter + 0.04, width: spec.wheel_width + 0.05 };
  tyre(ctx, at, car.heading + angle, roll, out, size, blur_of(car), scale, palette);
}

function four_tyres(rig: Rig, out = tyre_out(rig.spec.track, rig.spec.wheel_width + 0.05, rig.spec.width)) {
  for (const [i, wheel] of wheels(rig.car, rig.spec).entries()) {
    rig_tyre(rig, wheel.at, wheel.angle, rig.car.roll[i], (i % 2 ? 1 : -1) * out);
  }
}

// The sun stands still in the world, so the shadow is offset before the body turns, as `shadow()` does.
function rig_shadow(rig: Rig, shape: () => void) {
  const { ctx, car, spec, palette, height } = rig;
  const centre = body_centre(car, spec);
  ctx.save();
  ctx.translate(centre.x + 0.1 * height, centre.y + 0.16 * height);
  ctx.rotate(car.heading);
  shape();
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.restore();
}

function in_body(rig: Rig, paint: () => void) {
  const { ctx, car, spec } = rig;
  const centre = body_centre(car, spec);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  paint();
  ctx.restore();
}

function fill_edge(rig: Rig, fill: string) {
  const { ctx, palette, line } = rig;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = line;
  ctx.stroke();
}

function rig_tail_lamps(rig: Rig, size: number, inset: number) {
  const { ctx, l, half, palette, lamps } = rig;
  for (const side of [-1, 1]) {
    const y = side * (half - inset) - size / 2;
    if (lamps.braking) pill(ctx, -l - 0.08, y - 0.06, 0.22, size + 0.12, 0.12, palette.brake_glow);
    lamp(ctx, -l + 0.04, y, 0.07, size, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
    if (lamps.reversing) lamp(ctx, -l + 0.04, side * (half - inset - size / 2 - 0.1) - 0.04, 0.07, 0.08, palette.glow, palette);
  }
}

function tuk_shape(rig: Rig) {
  const { ctx, l, half } = rig;
  const cab = l - 0.95;
  const nose = 0.2;
  ctx.beginPath();
  ctx.moveTo(-l + 0.18, -half);
  ctx.lineTo(cab, -half);
  ctx.quadraticCurveTo(l - 0.25, -half + 0.05, l - 0.04, -nose);
  ctx.quadraticCurveTo(l + 0.02, 0, l - 0.04, nose);
  ctx.quadraticCurveTo(l - 0.25, half - 0.05, cab, half);
  ctx.lineTo(-l + 0.18, half);
  ctx.quadraticCurveTo(-l, half, -l, half - 0.18);
  ctx.lineTo(-l, -half + 0.18);
  ctx.quadraticCurveTo(-l, -half, -l + 0.18, -half);
  ctx.closePath();
}

// An auto rickshaw from above: a canvas hood with ribs over the bench and the rider, a windscreen, and the nose
// tapering to its one front wheel and one headlamp.
const tuk_tuk: RigDraw = (rig) => {
  const { ctx, car, palette, l, half, line } = rig;
  const paint = palette.player;
  const [fl, fr, rl, rr] = wheels(car, rig.spec);
  const front = { x: (fl.at.x + fr.at.x) / 2, y: (fl.at.y + fr.at.y) / 2 };
  rig_shadow(rig, () => tuk_shape(rig));
  rig_tyre(rig, rl.at, rl.angle, car.roll[2], -TYRE_SHOW);
  rig_tyre(rig, rr.at, rr.angle, car.roll[3], TYRE_SHOW);
  in_body(rig, () => {
    tuk_shape(rig);
    fill_edge(rig, paint.body);
    const back = -l + 0.08;
    const brow = l - 0.95;
    pill(ctx, back, -half + 0.05, brow - back, half * 2 - 0.1, 0.22, paint.roof);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = line;
    ctx.beginPath();
    for (const x of [back + 0.4, back + 0.8, back + 1.2]) {
      ctx.moveTo(x, -half + 0.1);
      ctx.lineTo(x, half - 0.1);
    }
    ctx.stroke();
    ctx.fillStyle = paint.glass;
    ctx.strokeStyle = paint.glass;
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(brow, -half + 0.1);
    ctx.lineTo(brow + 0.24, -half + 0.2);
    ctx.lineTo(brow + 0.24, half - 0.2);
    ctx.lineTo(brow, half - 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    rig_tail_lamps(rig, 0.2, 0.16);
  });
  rig_tyre(rig, front, car.steer, (car.roll[0] + car.roll[1]) / 2, 0);
  in_body(rig, () => {
    pill(ctx, l - 0.62, -0.3, 0.06, 0.6, 0.03, palette.ink);
    lamp(ctx, l - 0.18, -0.11, 0.09, 0.22, palette.glow, palette, rig.lamps.lit);
  });
};

// A golf cart from above: a light canopy on its posts over the seats, a short cowl in front, two bags in the rack
// at the back with their club heads showing.
const golf_cart: RigDraw = (rig) => {
  const { ctx, palette, l, half, line } = rig;
  const paint = palette.player;
  const shape = () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half, l * 2, half * 2, [0.18, 0.4, 0.4, 0.18]);
  };
  rig_shadow(rig, shape);
  in_body(rig, () => {
    shape();
    fill_edge(rig, paint.body);
    const deck = -l + 0.55;
    pill(ctx, -l + 0.06, -half + 0.08, deck - (-l + 0.06), half * 2 - 0.16, 0.08, paint.glass);
    for (const side of [-1, 1]) {
      const bag = { x: -l + 0.3, y: side * 0.24 };
      ctx.beginPath();
      ctx.arc(bag.x, bag.y, 0.16, 0, Math.PI * 2);
      ctx.fillStyle = palette.ink;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = line;
      ctx.stroke();
      ctx.fillStyle = palette.steel;
      for (const [dx, dy] of [
        [-0.05, -0.05],
        [0.06, -0.02],
        [-0.01, 0.07],
      ]) {
        ctx.beginPath();
        ctx.arc(bag.x + dx, bag.y + dy, 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const top = deck + 0.05;
    const brow = l - 0.48;
    ctx.beginPath();
    ctx.roundRect(top, -half + 0.03, brow - top, half * 2 - 0.06, 0.12);
    fill_edge(rig, paint.roof);
    ctx.beginPath();
    ctx.roundRect(top + 0.1, -half + 0.13, brow - top - 0.2, half * 2 - 0.26, 0.08);
    ctx.strokeStyle = palette.edge;
    ctx.stroke();
    pill(ctx, brow, -half + 0.08, 0.07, half * 2 - 0.16, 0.03, paint.glass);
    for (const side of [-1, 1]) lamp(ctx, l - 0.12, side * (half - 0.22) - 0.07, 0.08, 0.14, palette.glow, palette, rig.lamps.lit);
    rig_tail_lamps(rig, 0.16, 0.12);
  });
  four_tyres(rig);
};

// A resurfacer from above: the big snow tank filling most of the top, the driver's seat and wheel up front on the left,
// the conditioner across the back, and while it drives forward the film of water it lays behind it.
const resurfacer: RigDraw = (rig) => {
  const { ctx, car, palette, l, half, line } = rig;
  const paint = palette.player;
  const shape = () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half, l * 2, half * 2, [0.12, 0.35, 0.35, 0.12]);
  };
  rig_shadow(rig, shape);
  if (car.speed > 0.05) {
    in_body(rig, () => {
      ctx.globalAlpha = Math.min(1, car.speed / 1.5) * 0.8;
      pill(ctx, -l - 0.5, -half + 0.08, 0.6, half * 2 - 0.16, 0.12, palette.water);
      ctx.globalAlpha = 1;
    });
  }
  in_body(rig, () => {
    shape();
    fill_edge(rig, paint.body);
    const tank_back = -l + 0.55;
    const tank_front = l - 1.05;
    ctx.beginPath();
    ctx.roundRect(tank_back, -half + 0.12, tank_front - tank_back, half * 2 - 0.24, 0.18);
    fill_edge(rig, paint.glass);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = palette.glow;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.roundRect(tank_back + 0.15, -half + 0.3, tank_front - tank_back - 0.3, half * 2 - 0.6, 0.3);
    ctx.fill();
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (const [x, y, r] of [
      [tank_front - 0.4, -0.35, 0.32],
      [tank_front - 0.55, 0.3, 0.36],
      [tank_front - 1.0, -0.05, 0.3],
    ]) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    pill(ctx, -l + 0.02, -half + 0.04, 0.32, half * 2 - 0.08, 0.06, palette.steel);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(0.02, line);
    ctx.beginPath();
    ctx.moveTo(-l + 0.18, -half + 0.1);
    ctx.lineTo(-l + 0.18, half - 0.1);
    ctx.stroke();
    const seat = { x: l - 0.7, y: -half + 0.42 };
    pill(ctx, seat.x - 0.22, seat.y - 0.22, 0.42, 0.44, 0.12, paint.glass);
    ctx.beginPath();
    ctx.arc(seat.x + 0.38, seat.y, 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.05;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(l - 0.55, half - 0.45, 0.14, 0, Math.PI * 2);
    fill_edge(rig, paint.roof);
    for (const side of [-1, 1]) lamp(ctx, l - 0.14, side * (half - 0.3) - 0.12, 0.1, 0.24, palette.glow, palette, rig.lamps.lit);
    rig_tail_lamps(rig, 0.22, 0.42);
  });
  four_tyres(rig, 0);
};

// A shopping trolley from above: a wire basket, narrower at the front, the plastic handle and the folding child seat
// at the back, and four little casters showing through the mesh.
const trolley: RigDraw = (rig) => {
  const { ctx, palette, l, half, scale } = rig;
  const paint = palette.player;
  const nose = half * 0.78;
  const basket = () => {
    ctx.beginPath();
    ctx.moveTo(-l + 0.05, -half);
    ctx.lineTo(l, -nose);
    ctx.lineTo(l, nose);
    ctx.lineTo(-l + 0.05, half);
    ctx.closePath();
  };
  rig_shadow(rig, basket);
  four_tyres(rig, 0);
  in_body(rig, () => {
    basket();
    ctx.fillStyle = palette.steel;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = palette.steel;
    ctx.lineWidth = Math.max(0.01, 0.7 / scale);
    ctx.beginPath();
    for (let y = -half + 0.07; y < half; y += 0.07) {
      ctx.moveTo(-l, y);
      ctx.lineTo(l, y);
    }
    for (let x = -l + 0.12; x < l; x += 0.09) {
      ctx.moveTo(x, -half);
      ctx.lineTo(x, half);
    }
    ctx.stroke();
    ctx.restore();
    basket();
    ctx.strokeStyle = palette.ink;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.025, 1.5 / scale);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    pill(ctx, -l + 0.08, -half * 0.62, 0.22, half * 1.24, 0.04, paint.roof);
    ctx.globalAlpha = 1;
    pill(ctx, -l - 0.02, -half - 0.03, 0.07, half * 2 + 0.06, 0.035, paint.body);
  });
};

function f1_shape(rig: Rig) {
  const { ctx, l } = rig;
  ctx.beginPath();
  ctx.moveTo(-l + 0.3, -0.3);
  ctx.lineTo(-1.5, -0.42);
  ctx.quadraticCurveTo(-0.9, -0.72, -0.2, -0.72);
  ctx.quadraticCurveTo(0.6, -0.7, 1.0, -0.3);
  ctx.lineTo(l - 0.3, -0.13);
  ctx.quadraticCurveTo(l - 0.12, 0, l - 0.3, 0.13);
  ctx.lineTo(1.0, 0.3);
  ctx.quadraticCurveTo(0.6, 0.7, -0.2, 0.72);
  ctx.quadraticCurveTo(-0.9, 0.72, -1.5, 0.42);
  ctx.lineTo(-l + 0.3, 0.3);
  ctx.closePath();
}

// A racing car from above: open wheels out past a slim body with its sidepods, the nose out to the front wing, the
// driver's helmet under the halo, the rear wing over the gearbox, and one rain light. It sits low, so its shadow is tight.
const f1: RigDraw = (rig) => {
  const { ctx, palette, l, half, line, lamps } = rig;
  const paint = palette.player;
  rig_shadow(rig, () => {
    f1_shape(rig);
    ctx.rect(l - 0.4, -half, 0.36, half * 2);
    ctx.rect(-l, -0.55, 0.42, 1.1);
  });
  four_tyres(rig, 0);
  in_body(rig, () => {
    f1_shape(rig);
    fill_edge(rig, paint.body);
    ctx.beginPath();
    ctx.moveTo(-1.4, 0);
    ctx.lineTo(l - 0.35, 0);
    ctx.strokeStyle = paint.glass;
    ctx.lineWidth = 0.12;
    ctx.stroke();
    pill(ctx, -1.6, -0.17, 1.55, 0.34, 0.12, paint.roof);
    for (const side of [-1, 1]) pill(ctx, -0.55, side * 0.55 - 0.08, 0.5, 0.16, 0.06, paint.glass);
    ctx.beginPath();
    ctx.ellipse(0.35, 0, 0.42, 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = paint.glass;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0.22, 0, 0.13, 0, Math.PI * 2);
    ctx.fillStyle = palette.glow;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(0.02, line);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.3, 0, 0.3, 0.26, 0, -Math.PI / 2, Math.PI / 2);
    ctx.moveTo(0.6, 0);
    ctx.lineTo(0.78, 0);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.06;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.roundRect(l - 0.4, -half + 0.02, 0.34, half * 2 - 0.04, 0.08);
    fill_edge(rig, paint.body);
    pill(ctx, l - 0.34, -half + 0.12, 0.08, half * 2 - 0.24, 0.03, paint.glass);
    ctx.beginPath();
    ctx.roundRect(-l, -0.55, 0.42, 1.1, 0.05);
    fill_edge(rig, paint.body);
    pill(ctx, -l + 0.08, -0.47, 0.1, 0.94, 0.03, paint.glass);
    if (lamps.braking) pill(ctx, -l - 0.1, -0.16, 0.24, 0.32, 0.12, palette.brake_glow);
    lamp(ctx, -l + 0.22, -0.07, 0.08, 0.14, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
  });
};

const BIKE_BAR = 0.48;

function bike_shape(ctx: CanvasRenderingContext2D, l: number, rider: boolean) {
  ctx.beginPath();
  ctx.roundRect(-l, -0.12, l * 2, 0.24, 0.1);
  if (rider) ctx.ellipse(-0.28, 0, 0.2, 0.28, 0, 0, Math.PI * 2);
}

interface Bike {
  l: number;
  half: number;
  paint: Paint;
  palette: Palette;
  line: number;
  steer: number;
  rider: boolean;
  lamps: Lamps;
}

// A motorcycle from above, in the body's frame: the tail and its lamp, the exhaust down the right, the seat, the
// teardrop tank, and the bars, mirrors, headlamp and front mudguard turning with the fork. Ridden, a rider in a
// helmet leans over the tank with their arms out to the grips.
function bike_top(ctx: CanvasRenderingContext2D, b: Bike) {
  const { l, half, paint, palette, line, lamps } = b;
  const edge = Math.max(0.015, line);
  pill(ctx, -l + 0.22, 0.12, 0.7, 0.08, 0.04, palette.steel);
  ctx.beginPath();
  ctx.roundRect(-l + 0.12, -0.06, 0.5, 0.12, 0.06);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = edge;
  ctx.stroke();
  if (lamps.braking) pill(ctx, -l - 0.02, -0.12, 0.22, 0.24, 0.12, palette.brake_glow);
  lamp(ctx, -l + 0.1, -0.05, 0.05, 0.1, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
  pill(ctx, -0.12, -0.3, 0.07, 0.6, 0.03, palette.ink);
  pill(ctx, -0.72, -0.13, 0.7, 0.26, 0.12, palette.ink);
  ctx.beginPath();
  ctx.moveTo(-0.06, 0);
  ctx.bezierCurveTo(-0.06, -0.24, 0.42, -0.16, 0.44, 0);
  ctx.bezierCurveTo(0.42, 0.16, -0.06, 0.24, -0.06, 0);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.stroke();
  pill(ctx, 0.04, -0.03, 0.3, 0.06, 0.03, paint.glass);

  const turn = (x: number, y: number): Vec => ({
    x: BIKE_BAR + Math.cos(b.steer) * (x - BIKE_BAR) - Math.sin(b.steer) * y,
    y: Math.sin(b.steer) * (x - BIKE_BAR) + Math.cos(b.steer) * y,
  });
  const grips = [turn(BIKE_BAR - 0.02, -0.31), turn(BIKE_BAR - 0.02, 0.31)];
  ctx.save();
  ctx.translate(BIKE_BAR, 0);
  ctx.rotate(b.steer);
  pill(ctx, 0.14, -0.05, 0.3, 0.1, 0.05, paint.body);
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(0, side * 0.24);
    ctx.lineTo(0.07, side * (half - 0.06));
  }
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-0.02, -0.33);
  ctx.quadraticCurveTo(0.05, 0, -0.02, 0.33);
  ctx.stroke();
  ctx.lineCap = "butt";
  for (const side of [-1, 1]) pill(ctx, 0.03, side * (half - 0.06) - 0.05, 0.08, 0.1, 0.04, palette.ink);
  ctx.beginPath();
  ctx.arc(0.13, 0, 0.09, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.globalAlpha = lamps.lit;
  ctx.beginPath();
  ctx.arc(0.14, 0, 0.06, 0, Math.PI * 2);
  ctx.fillStyle = palette.glow;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
  if (!b.rider) return;

  ctx.lineCap = "round";
  for (const [width, colour] of [
    [0.13, palette.ink],
    [0.08, paint.roof],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [i, side] of [-1, 1].entries()) {
      ctx.moveTo(-0.26, side * 0.2);
      ctx.quadraticCurveTo(0.12, side * 0.3, grips[i].x, grips[i].y);
    }
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.ellipse(-0.32, 0, 0.17, 0.26, 0, 0, Math.PI * 2);
  ctx.fillStyle = paint.roof;
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.02, line);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-0.17, 0, 0.14, 0, Math.PI * 2);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-0.17, 0, 0.1, -1.05, 1.05);
  ctx.strokeStyle = paint.glass;
  ctx.lineWidth = 0.06;
  ctx.stroke();
}

const motorcycle: RigDraw = (rig) => {
  const { ctx, car, spec, palette, l, half, line, lamps } = rig;
  const [front, , rear] = wheels(car, spec);
  rig_shadow(rig, () => bike_shape(ctx, l, true));
  rig_tyre(rig, rear.at, rear.angle, car.roll[2], 0);
  rig_tyre(rig, front.at, front.angle, car.roll[0], 0);
  in_body(rig, () => bike_top(ctx, { l, half, paint: palette.player, palette, line, steer: car.steer, rider: true, lamps }));
};

// Left on a deck or in a bay it stands with nobody on it.
function parked_motorcycle(ctx: CanvasRenderingContext2D, solid: Solid, paint: Paint, scale: number, palette: Palette) {
  const car = solid.car!;
  const l = car.length / 2;
  ctx.save();
  ctx.translate(car.pose.x + 0.1 * HEIGHT.motorcycle, car.pose.y + 0.16 * HEIGHT.motorcycle);
  ctx.rotate(car.pose.heading);
  bike_shape(ctx, l, false);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const tyre = 0.66;
  for (const x of [-l + MOTORCYCLE.rear_overhang, -l + MOTORCYCLE.rear_overhang + MOTORCYCLE.wheelbase]) pill(ctx, x - tyre / 2, -0.1, tyre, 0.2, 0.07, palette.ink);
  bike_top(ctx, { l, half: car.width / 2, paint, palette, line: 1 / scale, steer: 0, rider: false, lamps: { braking: false, reversing: false, lit: 0.6 } });
  ctx.restore();
}

const FUN: Partial<Record<Vehicle, RigDraw>> = {
  [Vehicle.MOTORCYCLE]: motorcycle,
  [Vehicle.F1]: f1,
  [Vehicle.TUK_TUK]: tuk_tuk,
  [Vehicle.GOLF_CART]: golf_cart,
  [Vehicle.RESURFACER]: resurfacer,
  [Vehicle.TROLLEY]: trolley,
};

export function player(
  ctx: CanvasRenderingContext2D,
  car: Car,
  vehicle: Vehicle,
  spec: VehicleSpec,
  braking: boolean,
  scale: number,
  palette: Palette,
  time = 0
) {
  const look = look_of(vehicle);
  const lamps = { braking, reversing: car.gear === Gear.REVERSE, lit: 0.85 };
  if (vehicle === Vehicle.FORKLIFT) {
    tyres(ctx, car, spec, look.style, scale, palette, false);
    forklift(ctx, car, spec, lamps, scale, palette, time);
    return;
  }
  const fun = FUN[vehicle];
  if (fun) {
    fun({ ctx, car, spec, lamps, scale, palette, l: spec.length / 2, half: spec.width / 2, line: 1 / scale, height: HEIGHT[look.style] });
    return;
  }
  const loads = look.loads ?? [];
  const dim = { braking: false, reversing: false, lit: 0.6 };
  for (const i of draw_order(loads)) {
    if (i >= spec.hitches.length) continue;
    if (i >= 0) trailer(ctx, car, spec, i, loads[i], i === loads.length - 1 ? lamps : dim, scale, palette);
    else vehicle_body(ctx, car, spec, look, lamps, dim, scale, palette, time);
  }
}

const BLINKER_INSET = 0.18;

function toward(point: Vec, shape: Polygon, by: number): Vec {
  const middle = centroid(shape);
  const length = Math.hypot(middle.x - point.x, middle.y - point.y) || 1;
  return { x: point.x + ((middle.x - point.x) / length) * by, y: point.y + ((middle.y - point.y) / length) * by };
}

/** Lit blinkers on the signalled side, front and rear corners, over any vehicle; a chain's rear ones sit on its last link. */
export function blinkers(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, side: Signal, scale: number, palette: Palette) {
  if (side === Signal.NONE) return;
  const front = rig_outline(car, spec);
  const links = spec.hitches.length;
  const rear = links > 0 && !hangs_ahead(spec) ? trailer_corners(car, spec, links - 1) : front;
  const left = side === Signal.LEFT;
  const lamps = [toward(left ? front[0] : front[1], front, BLINKER_INSET), toward(left ? rear[3] : rear[2], rear, BLINKER_INSET)];
  const halo = Math.max(0.5, 7 / scale);
  const lens = Math.max(0.14, 2.5 / scale);
  for (const at of lamps) {
    ctx.fillStyle = palette.warning_glow;
    ctx.beginPath();
    ctx.arc(at.x, at.y, halo, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.arc(at.x, at.y, lens + Math.max(0.03, 0.8 / scale), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.warning;
    ctx.beginPath();
    ctx.arc(at.x, at.y, lens, 0, Math.PI * 2);
    ctx.fill();
  }
}

function vehicle_body(
  ctx: CanvasRenderingContext2D,
  car: Car,
  spec: VehicleSpec,
  look: Look,
  lamps: Lamps,
  dim: Lamps,
  scale: number,
  palette: Palette,
  time: number
) {
  const style = look.style;
  const centre = body_centre(car, spec);
  shadow(ctx, centre, car.heading, spec.length, spec.width, style, HEIGHT[style], palette);
  ctx.save();
  ctx.translate(centre.x, centre.y);
  ctx.rotate(car.heading);
  body(ctx, style, spec.length, spec.width, palette.player, scale, palette);
  const l = spec.length / 2;
  const w = spec.width / 2;
  const lights = flashes(time, car.gear !== Gear.PARK);
  if (look.livery) livery(ctx, look.livery, spec.length, w, lights, palette);
  if (style === Style.FIRE) {
    pill(ctx, l - 2.05, -0.75, 0.26, 1.5, 0.08, palette.ink);
    beacon(ctx, l - 1.92, -0.45, palette.error, palette.brake_glow, lights[0], palette);
    beacon(ctx, l - 1.92, 0.45, palette.info, palette.info_glow, lights[1], palette);
  }
  if (style === Style.GARBAGE) beacon(ctx, l - 1.85, 0, palette.warning, palette.warning_glow, Math.max(lights[0], 0.35), palette);
  head_lamps(ctx, l, w, style, palette, 1);
  // Towing, the last trailer's lamps take over at the back; an articulated bus's front section has none of its own.
  if (style !== Style.ARTIC) tail_lamps(ctx, l, w, palette, spec.hitches.length > 0 && !hangs_ahead(spec) ? dim : lamps, style === Style.TRACTOR || style === Style.QUAD);
  ctx.restore();
  tyres(ctx, car, spec, style, scale, palette);
}

