import type { Paint, Palette } from "./draw";
import { tread } from "./draw-math";
import { wrap_angle, type Vec } from "./geometry";
import type { Solid } from "./scene";
import {
  body_centre,
  CARAVAN_TRAILER,
  Gear,
  hitch_point,
  to_world,
  TRACTOR,
  trailer_pose,
  trailer_wheels,
  Vehicle,
  wheels,
  type Car,
  type VehicleSpec,
} from "./vehicle";

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
} as const;
type Style = (typeof Style)[keyof typeof Style];

const Livery = { TAXI: "taxi", POLICE: "police", AMBULANCE: "ambulance" } as const;
type Livery = (typeof Livery)[keyof typeof Livery];

const Load = { BOX: "box", HORSE: "horse", FARM: "farm", BOAT: "boat", CARAVAN: "caravan", BUS: "bus" } as const;
type Load = (typeof Load)[keyof typeof Load];

interface Look {
  style: Style;
  livery?: Livery;
  load?: Load;
}

const LOOKS: Record<Vehicle, Look> = {
  hatch: { style: Style.HATCH },
  van: { style: Style.VAN },
  pickup: { style: Style.PICKUP },
  bus: { style: Style.BUS },
  towing: { style: Style.HATCH, load: Load.BOX },
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
  artic: { style: Style.ARTIC, load: Load.BUS },
  "horse-box": { style: Style.SUV, load: Load.HORSE },
  tractor: { style: Style.TRACTOR, load: Load.FARM },
  quad: { style: Style.QUAD, load: Load.BOX },
  boat: { style: Style.PICKUP, load: Load.BOAT },
  caravan: { style: Style.HATCH, load: Load.CARAVAN },
  forklift: { style: Style.FORKLIFT },
};

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
  box: 0.5,
  horse: 1.4,
  farm: 0.9,
  boat: 0.9,
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
  const corners = CORNERS[style].map((r) => Math.min(r, half));
  ctx.roundRect(-l / 2, -half, l, half * 2, corners);
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
  forklift: () => {},
};

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
function beacon(ctx: CanvasRenderingContext2D, x: number, y: number, lens: string, halo: string, on: number, palette: Palette) {
  if (on > 0.5) pill(ctx, x - 0.18, y - 0.26, 0.36, 0.52, 0.2, halo);
  lamp(ctx, x - 0.07, y - 0.15, 0.14, 0.3, lens, palette, on);
}

function flashes(time: number, active: boolean): [number, number] {
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

interface Lamps {
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
  const { style } = look_of(car.vehicle);
  const paint = palette.cars[car.paint % palette.cars.length];
  shadow(ctx, car.pose, car.pose.heading, car.length, car.width, style, HEIGHT[style], palette);
  ctx.save();
  ctx.translate(car.pose.x, car.pose.y);
  ctx.rotate(car.pose.heading);
  const l = car.length / 2;
  const w = car.width / 2;
  const big = car.length > 9;
  const axles = big ? [l - 2.5, -l + 3.6] : [l - 0.85, -l + 0.75];
  const tyre = big ? 1 : 0.6;
  for (const x of axles)
    for (const side of [-1, 1]) pill(ctx, x - tyre / 2, side * (w - 0.1) - 0.11, tyre, 0.22, 0.06, palette.ink);
  body(ctx, style, car.length, car.width, paint, scale, palette);
  head_lamps(ctx, l, w, style, palette, 0.6);
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
const TREAD_PITCH = 0.11;
// A coach's drive and tag axles straddle the pose, which sits between them.
const TAG_SPREAD = 0.7;

interface TyreSize {
  length: number;
  width: number;
}

function tyre(
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
function blur_of(car: Car): number {
  return Math.max(0, Math.min(1, 1 - (Math.abs(car.speed) - 1.2) / 1.8));
}

function tyres(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, style: Style, scale: number, palette: Palette, tread = true) {
  const size = { length: spec.wheel_diameter + 0.04, width: spec.wheel_width + 0.05 };
  const front = style === Style.TRACTOR ? { length: 0.9, width: 0.32 } : size;
  const blur = tread ? blur_of(car) : 0;
  for (const [i, wheel] of wheels(car, spec).entries()) {
    const out = (i % 2 ? 1 : -1) * TYRE_SHOW;
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
  load: Load,
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
  const style = load === Load.CARAVAN ? Style.CARAVAN : load === Load.BUS ? Style.ARTIC : Style.VAN;
  shadow(ctx, centre, pose.heading, t.box_length, t.width, style, HEIGHT[load], palette);

  const size = { length: t.wheel_diameter + 0.04, width: t.wheel_width + 0.05 };
  const blur = blur_of(car);
  // A bus section shows its tyres like the front one does; a caravan's sit under its body.
  const out = load === Load.BUS ? TYRE_SHOW : load === Load.CARAVAN ? 0.04 : 0.1;
  const wheels_of = () =>
    trailer_wheels(car, t).forEach((at, i) =>
      tyre(ctx, at, pose.heading, car.trailer!.roll[i], (i ? 1 : -1) * out, size, blur, scale, palette)
    );
  if (load !== Load.BUS) wheels_of();

  const ball = hitch_point(car, t);
  if (load !== Load.BUS) {
    const spread = load === Load.BOAT ? 0.35 : Math.min(half - 0.25, 0.75);
    a_frame(ctx, to_world(pose, { x: front, y: -spread }), to_world(pose, { x: front, y: spread }), ball, palette);
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
    } else outline(ctx, t.box_length, half, load === Load.BOX || load === Load.FARM ? Style.VAN : style);
    ctx.fillStyle = paint.body;
    ctx.fill();
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    load_top(ctx, load, { l: t.box_length, half, roof: half - 0.22, paint, scale, palette });
  }
  tail_lamps(ctx, l, half, palette, lamps, load === Load.BOAT || half < 0.6);
  ctx.restore();

  if (load === Load.BUS) {
    bellows(ctx, ball, pose.heading + wrap_angle(car.heading - pose.heading) / 2, t.width, scale, palette);
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
  if (look.load) trailer(ctx, car, spec, look.load, lamps, scale, palette);
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
  // Towing, the trailer's lamps take over at the back; an articulated bus's front section has none of its own.
  const dim = { braking: false, reversing: false, lit: 0.6 };
  if (style !== Style.ARTIC) tail_lamps(ctx, l, w, palette, spec.trailer ? dim : lamps, style === Style.TRACTOR || style === Style.QUAD);
  ctx.restore();
  tyres(ctx, car, spec, style, scale, palette);
}

