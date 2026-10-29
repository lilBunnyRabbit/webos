import { resolve_token } from "$lib/core/utils";
import type { Insets } from "./camera";
import { against, dash_phase, darkest, lightest, wound, type Tone } from "./draw-math";
import { machine } from "./draw-machines";
import { parked_vehicle, player as vehicle_player } from "./draw-vehicles";
import type { Polygon, Pose, Vec } from "./geometry";
import { End, sensor_frame } from "./sensors";
import {
  body_centre,
  DriveKind,
  frame_ends,
  front_frame,
  Gear,
  gear_direction,
  hangs_ahead,
  sweep,
  to_world,
  trailer_pose,
  trailer_sweep,
  type Car,
  type Vehicle,
  type VehicleSpec,
} from "./vehicle";

import { MarkKind, SolidKind, SurfaceKind, type Bay, type Mark, type Solid, type Surface } from "./scene";

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
  warning_glow: string;
  error: string;
  info: string;
  info_glow: string;
  success: string;
  grass: string;
  hedge: string;
  hedge_edge: string;
  hedge_leaf: string;
  /** Steel: forks, and a rack's beams take `beam`, its uprights `upright`. */
  steel: string;
  beam: string;
  upright: string;
  /** A pallet's deck boards, a job's cardboard boxes (`load_edge` their seams and tape), the shrink-wrapped stock around it. */
  wood: string;
  load: string;
  load_edge: string;
  stock: string;
  beacon: string;
  beacon_clear: string;
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
    warning_glow: mix("warning", 35),
    error: token("var(--error)"),
    info: token("var(--info)"),
    info_glow: mix("info", 35),
    success: token("var(--success)"),
    grass: solid("success", 10),
    hedge: solid("success", 20),
    hedge_edge: solid("success", 34),
    hedge_leaf: solid("success", 27),
    steel: solid("foreground", 55),
    beam: solid("warning", 80),
    upright: solid("info", 72),
    // Mixed in oklab: an oklch mix of an amber and a blue-grey ground turns green on the way round the hue circle.
    wood: token("color-mix(in oklab, var(--warning) 40%, var(--foreground))"),
    load: token("color-mix(in oklab, var(--warning) 68%, var(--background))"),
    load_edge: token(`color-mix(in oklab, var(--warning) 45%, ${ink.colour})`),
    stock: solid("foreground", 42),
    beacon: token("var(--warning)"),
    beacon_clear: mix("warning", 0),
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

function trace(ctx: CanvasRenderingContext2D, shape: Polygon) {
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export function path(ctx: CanvasRenderingContext2D, shape: Polygon) {
  ctx.beginPath();
  trace(ctx, shape);
}

export function fill(ctx: CanvasRenderingContext2D, shape: Polygon, colour: string) {
  path(ctx, shape);
  ctx.fillStyle = colour;
  ctx.fill();
}

// One path for many pieces: abutting pieces fill without anti-aliasing seams, and a translucent stroke never doubles
// up where two pieces meet.
export function union(ctx: CanvasRenderingContext2D, shapes: Polygon[]) {
  ctx.beginPath();
  for (const shape of shapes) trace(ctx, wound(shape));
}

/**
 * A pallet seen from above, `pose` its centre heading the way the forks go in: the deck boards round a load. A job's
 * load is cardboard with a taped seam, stock is shrink-wrapped.
 */
export const PalletLoad = { BOXES: "boxes", WRAPPED: "wrapped" } as const;
export type PalletLoad = (typeof PalletLoad)[keyof typeof PalletLoad];

/**
 * A loaded pallet from above: deck boards across the forks' way, their ends showing round the load. The job's are
 * cardboard boxes, the warehouse's stock a shrink-wrapped block, so neither reads as an empty slot.
 */
export function pallet(ctx: CanvasRenderingContext2D, pose: Pose, length: number, width: number, load: PalletLoad, scale: number, palette: Palette) {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  const l = length / 2;
  const w = width / 2;
  const hair = Math.max(0.015, 1 / scale);
  ctx.beginPath();
  ctx.rect(-l + 0.08, -w + 0.1, length, width);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  const boards = 5;
  const gap = 0.05;
  const board = (length - gap * (boards - 1)) / boards;
  ctx.fillStyle = palette.wood;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = hair;
  for (let i = 0; i < boards; i++) {
    ctx.beginPath();
    ctx.rect(-l + i * (board + gap), -w, board, width);
    ctx.fill();
    ctx.stroke();
  }
  const inset = 0.1;
  const lw = length - inset * 2;
  const ww = width - inset * 2;
  const x0 = -l + inset;
  const y0 = -w + inset;
  if (load === PalletLoad.BOXES) {
    for (const [bx, by] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x = x0 + (bx * lw) / 2 + 0.015;
      const y = y0 + (by * ww) / 2 + 0.015;
      const bw = lw / 2 - 0.03;
      const bh = ww / 2 - 0.03;
      ctx.beginPath();
      ctx.rect(x, y, bw, bh);
      ctx.fillStyle = palette.load;
      ctx.fill();
      ctx.strokeStyle = palette.load_edge;
      ctx.lineWidth = Math.max(0.025, 1.5 / scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + bh / 2);
      ctx.lineTo(x + bw, y + bh / 2);
      ctx.strokeStyle = palette.load_edge;
      ctx.lineWidth = Math.max(0.04, 2 / scale);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.rect(x0, y0, lw, ww);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = hair;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.roundRect(x0, y0, lw, ww, 0.1);
    ctx.fillStyle = palette.stock;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Wrap catching the light: a few pale streaks across the block.
    ctx.strokeStyle = palette.glow;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let k = -0.6; k < 1.2; k += 0.3) {
      ctx.moveTo(x0 + k, y0);
      ctx.lineTo(x0 + k + ww * 0.6, y0 + ww);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.shadow;
    ctx.fillRect(x0, y0 + ww - 0.12, lw, 0.12);
    ctx.restore();
    ctx.beginPath();
    ctx.roundRect(x0, y0, lw, ww, 0.1);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = hair;
    ctx.stroke();
  }
  ctx.restore();
}

const BEAM = 7;

export function beams(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, palette: Palette) {
  const direction = gear_direction(car.gear);
  if (direction === 0 || spec.unlit) return;
  const last = spec.hitches.length - 1;
  const t = direction < 0 && last >= 0 && !hangs_ahead(spec) ? spec.hitches[last] : undefined;
  // Reversing with a trailer, the light comes off the last trailer's tail.
  const frame: Pose = t
    ? {
        ...to_world(trailer_pose(car, spec, last), { x: t.axle - t.drawbar - t.box_length / 2, y: 0 }),
        heading: trailer_pose(car, spec, last).heading,
      }
    : direction > 0 && spec.drive.kind === DriveKind.FRAME
      ? { ...to_world(front_frame(car, spec), { x: frame_ends(spec).front.front - spec.length / 2, y: 0 }), heading: front_frame(car, spec).heading }
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

export function guides(ctx: CanvasRenderingContext2D, car: Car, spec: VehicleSpec, scale: number, palette: Palette) {
  const direction = gear_direction(car.gear) || Math.sign(car.speed);
  if (direction === 0) return;
  // Front corners going forwards, rear corners backwards: the corners that lead, where a reversing camera draws its lines.
  let leading: Vec[][];
  if (spec.hitches.length > 0 && (direction < 0) !== hangs_ahead(spec)) leading = trailer_sweep(car, direction * 5, 40, spec);
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

export function sensor_arcs(
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

export function bay_outline(
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

export function bay_arrow(ctx: CanvasRenderingContext2D, bay: Bay, colour: string) {
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
export function outlined(ctx: CanvasRenderingContext2D, shapes: Polygon[], fill_colour: string, edge: string, width: number) {
  if (shapes.length === 0) return;
  union(ctx, shapes);
  ctx.strokeStyle = edge;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = fill_colour;
  ctx.fill();
}

export function solids(ctx: CanvasRenderingContext2D, items: Solid[], scale: number, palette: Palette) {
  const of = (kind: SolidKind) => items.filter((solid) => solid.kind === kind).map((solid) => solid.shape);
  outlined(ctx, of(SolidKind.WATER), palette.water, palette.water_edge, Math.max(0.12, 3 / scale));
  outlined(ctx, of(SolidKind.KERB), palette.pavement, palette.kerb, 4 / scale);
  outlined(ctx, of(SolidKind.WALL), palette.wall, palette.wall_edge, 3 / scale);
  outlined(ctx, of(SolidKind.SHELF), palette.shelf, palette.wall_edge, 2 / scale);
  outlined(ctx, [...of(SolidKind.PILLAR), ...of(SolidKind.POST)], palette.pillar, palette.wall_edge, 2 / scale);
  hedges(ctx, of(SolidKind.HEDGE), scale, palette);
  for (const solid of items) if (solid.kind === SolidKind.CAR && solid.car) parked_vehicle(ctx, solid, scale, palette);
}

const LEAF = 0.42;

function visible(ctx: CanvasRenderingContext2D): { x0: number; y0: number; x1: number; y1: number } {
  const inverse = ctx.getTransform().inverse();
  const { width, height } = ctx.canvas;
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].map(([x, y]) => inverse.transformPoint({ x, y }));
  return {
    x0: Math.min(...corners.map((p) => p.x)),
    y0: Math.min(...corners.map((p) => p.y)),
    x1: Math.max(...corners.map((p) => p.x)),
    y1: Math.max(...corners.map((p) => p.y)),
  };
}

// Clumps on a grid, nudged by where they sit, so a hedge reads as foliage and stays the same every frame.
function hedges(ctx: CanvasRenderingContext2D, shapes: Polygon[], scale: number, palette: Palette) {
  if (shapes.length === 0) return;
  ctx.lineJoin = "round";
  union(ctx, shapes);
  ctx.strokeStyle = palette.hedge_edge;
  ctx.lineWidth = Math.max(0.18, 3 / scale);
  ctx.stroke();
  ctx.fillStyle = palette.hedge;
  ctx.fill();
  // Far out the clumps are a pixel or two and only cost; close in, only the ones on screen are built.
  if (LEAF * scale < 4) return;
  const view = visible(ctx);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = palette.hedge_leaf;
  ctx.beginPath();
  for (const shape of shapes) {
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const from_x = x0 + LEAF / 2 + Math.max(0, Math.ceil((view.x0 - x0 - LEAF) / LEAF)) * LEAF;
    const from_y = y0 + LEAF / 2 + Math.max(0, Math.ceil((view.y0 - y0 - LEAF) / LEAF)) * LEAF;
    const to_x = Math.min(Math.max(...xs), view.x1 + LEAF);
    const to_y = Math.min(Math.max(...ys), view.y1 + LEAF);
    for (let x = from_x; x < to_x; x += LEAF)
      for (let y = from_y; y < to_y; y += LEAF) {
        const jitter = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const nudge = jitter - Math.floor(jitter);
        const r = LEAF * (0.3 + nudge * 0.22);
        const cx = x + (nudge - 0.5) * 0.14;
        const cy = y + (0.5 - nudge) * 0.1;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
  }
  ctx.fill();
  ctx.restore();
}

const SURFACES = [SurfaceKind.GRASS, SurfaceKind.ASPHALT, SurfaceKind.FLOOR, SurfaceKind.PAVEMENT] as const;
const GROUND: Record<SurfaceKind, "grass" | "asphalt" | "floor" | "pavement"> = { grass: "grass", asphalt: "asphalt", floor: "floor", pavement: "pavement" };
const DASH = 1.2;

export function ground(ctx: CanvasRenderingContext2D, surfaces: Surface[], marks: Mark[], scale: number, palette: Palette) {
  for (const kind of SURFACES) {
    const shapes = surfaces.filter((surface) => surface.kind === kind).map((surface) => surface.shape);
    if (shapes.length === 0) continue;
    const colour = palette[GROUND[kind]];
    union(ctx, shapes);
    ctx.fillStyle = colour;
    ctx.fill();
    // Where two kinds of ground meet, a hairline of each closes the gap their anti-aliased edges leave.
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
  }

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

export function bay_pointer(ctx: CanvasRenderingContext2D, bay: Bay, view: View, insets: Insets, palette: Palette) {
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

export function begin_frame(ctx: CanvasRenderingContext2D, view: View, palette: Palette) {
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
}

export function contact_rings(ctx: CanvasRenderingContext2D, at: Vec, pulse: number, scale: number, palette: Palette) {
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
  const lamps = { braking, reversing: car.gear === Gear.REVERSE, lit: 0.85 };
  if (!machine(ctx, car, vehicle, spec, lamps, scale, palette, time)) vehicle_player(ctx, car, vehicle, spec, braking, scale, palette, time);
}
