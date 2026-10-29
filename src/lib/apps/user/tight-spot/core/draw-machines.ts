import type { Palette } from "./draw";
import { tread } from "./draw-math";
import { beacon, blur_of, flashes, lamp, pill, tyre, TYRE_SHOW, type Lamps } from "./draw-vehicles";
import type { Pose, Vec } from "./geometry";
import {
  axles,
  DriveKind,
  frame_ends,
  front_frame,
  Gear,
  to_world,
  Vehicle,
  wheels,
  type Car,
  type VehicleSpec,
} from "./vehicle";

interface Machine {
  ctx: CanvasRenderingContext2D;
  car: Car;
  spec: VehicleSpec;
  lamps: Lamps;
  scale: number;
  palette: Palette;
  time: number;
  line: number;
}

type MachineDraw = (m: Machine) => void;

function at(m: Machine, pose: Pose, x: number, paint: () => void) {
  const { ctx } = m;
  const origin = to_world(pose, { x, y: 0 });
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(pose.heading);
  paint();
  ctx.restore();
}

// The sun stands still in the world, so the shadow is offset before the body turns.
function shade(m: Machine, pose: Pose, x: number, height: number, shape: () => void) {
  const { ctx, palette } = m;
  const origin = to_world(pose, { x, y: 0 });
  ctx.save();
  ctx.translate(origin.x + 0.1 * height, origin.y + 0.16 * height);
  ctx.rotate(pose.heading);
  shape();
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.restore();
}

function edged(m: Machine, fill: string) {
  const { ctx, palette, line } = m;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = line;
  ctx.stroke();
}

function rounded(m: Machine, x0: number, y0: number, x1: number, y1: number, r: number | number[], fill: string) {
  m.ctx.beginPath();
  m.ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  edged(m, fill);
}

function lines(m: Machine, segments: [number, number, number, number][], colour: string, width: number, alpha = 1) {
  const { ctx } = m;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of segments) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function grille(m: Machine, x0: number, x1: number, y0: number, y1: number, pitch = 0.12) {
  const bars: [number, number, number, number][] = [];
  for (let x = x0 + pitch / 2; x < x1; x += pitch) bars.push([x, y0, x, y1]);
  lines(m, bars, m.palette.ink, 0.04, 0.55);
}

function tyre_at(m: Machine, at_point: Vec, heading: number, roll: number, out: number, size = tyre_size(m.spec)) {
  tyre(m.ctx, at_point, heading, roll, out, size, blur_of(m.car), m.scale, m.palette);
}

function tyre_size(spec: VehicleSpec) {
  return { length: spec.wheel_diameter + 0.04, width: spec.wheel_width + 0.05 };
}

function four(m: Machine, out = TYRE_SHOW) {
  const { car, spec } = m;
  for (const [i, wheel] of wheels(car, spec).entries()) tyre_at(m, wheel.at, car.heading + wheel.angle, car.roll[i], (i % 2 ? 1 : -1) * out);
}

function tails(m: Machine, x: number, half: number, size: number, inset: number) {
  const { ctx, palette, lamps } = m;
  for (const side of [-1, 1]) {
    const y = side * (half - inset) - size / 2;
    if (lamps.braking) pill(ctx, x - 0.12, y - 0.06, 0.24, size + 0.12, 0.12, palette.brake_glow);
    lamp(ctx, x + 0.03, y, 0.07, size, palette.brake, palette, lamps.braking ? 1 : lamps.lit);
    if (lamps.reversing) lamp(ctx, x + 0.03, side * (half - inset - size / 2 - 0.12) - 0.05, 0.07, 0.1, palette.glow, palette);
  }
}

function heads(m: Machine, x: number, half: number, size: number, inset: number) {
  for (const side of [-1, 1]) lamp(m.ctx, x - 0.1, side * (half - inset) - size / 2, 0.08, size, m.palette.glow, m.palette, m.lamps.lit);
}

function amber(m: Machine, x: number, y: number) {
  const on = m.car.gear === Gear.PARK ? 0.35 : Math.floor(m.time * 3) % 2 ? 1 : 0.4;
  beacon(m.ctx, x, y, m.palette.warning, m.palette.warning_glow, on, m.palette);
}

function middle(spec: VehicleSpec): number {
  return axles(spec).rear - spec.rear_overhang + spec.length / 2;
}

const bobcat: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const l = spec.length / 2;
  const half = spec.width / 2;
  const mid = middle(spec);
  shade(m, car, mid, 1.3, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half + 0.2, l * 2 - 0.6, half * 2 - 0.4, 0.2);
    ctx.rect(l - 0.62, -half, 0.62, half * 2);
  });
  four(m, 0);
  at(m, car, mid, () => {
    rounded(m, -l, -0.48, l - 0.55, 0.48, [0.25, 0.08, 0.08, 0.25], paint.body);
    rounded(m, -l + 0.04, -0.4, -0.78, 0.4, 0.14, paint.roof);
    grille(m, -l + 0.12, -0.9, -0.3, 0.3);
    rounded(m, -0.78, -0.42, 0.42, 0.42, 0.12, paint.glass);
    lines(
      m,
      [
        [-0.78, -0.42, 0.42, 0.42],
        [-0.78, 0.42, 0.42, -0.42],
      ],
      palette.ink,
      0.05,
      0.6
    );
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.06;
    ctx.strokeRect(-0.74, -0.38, 1.12, 0.76);
    for (const side of [-1, 1]) rounded(m, -1.25, side * 0.56 - 0.07, l - 0.6, side * 0.56 + 0.07, 0.05, paint.body);
    ctx.beginPath();
    ctx.roundRect(l - 0.62, -half, 0.6, half * 2, [0.08, 0.02, 0.02, 0.08]);
    edged(m, palette.steel);
    lines(m, [[l - 0.5, -half + 0.08, l - 0.5, half - 0.08]], palette.ink, 0.05, 0.5);
    ctx.fillStyle = palette.ink;
    for (let y = -half + 0.12; y < half - 0.05; y += 0.2) {
      ctx.beginPath();
      ctx.moveTo(l - 0.02, y - 0.05);
      ctx.lineTo(l + 0.06, y);
      ctx.lineTo(l - 0.02, y + 0.05);
      ctx.fill();
    }
    heads(m, 0.42, 0.36, 0.12, 0);
    tails(m, -l, 0.48, 0.16, 0.12);
  });
};

const mower: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const l = spec.length / 2;
  const half = spec.width / 2;
  const mid = middle(spec);
  shade(m, car, mid, 0.8, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -0.5, l * 2 - 0.1, 1, 0.2);
    ctx.roundRect(-0.25, -half, 0.9, half * 2, 0.3);
  });
  const [, , rl, rr] = wheels(car, spec);
  tyre_at(m, rl.at, car.heading, car.roll[2], -0.02);
  tyre_at(m, rr.at, car.heading, car.roll[3], 0.02);
  at(m, car, mid, () => {
    for (const side of [-1, 1]) rounded(m, -0.4, side * 0.5 - 0.04, 0.9, side * 0.5 + 0.04, 0.03, palette.ink);
  });
  const caster = { length: 0.3, width: 0.12 };
  const drive = spec.drive;
  const track = drive.kind === DriveKind.SKID ? drive.track : spec.track;
  const forward = 1 - Math.abs(car.steer);
  const turn = (2 * car.steer) / track;
  // A caster trails into the way its corner moves: ahead when driving straight, round the drive axle when pivoting.
  for (const side of [-1, 1]) {
    const local = { x: mid + 0.82, y: side * 0.5 };
    const along = forward - turn * local.y;
    const across = turn * local.x;
    const angle = Math.hypot(along, across) < 1e-6 ? 0 : Math.atan2(across, along);
    tyre_at(m, to_world(car, local), car.heading + angle, car.roll[side < 0 ? 0 : 1] * 2.5, 0, caster);
  }
  at(m, car, mid, () => {
    ctx.beginPath();
    ctx.roundRect(-0.25, -half, 0.85, half * 2, [0.2, 0.35, 0.35, 0.2]);
    edged(m, paint.body);
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.04;
    for (const y of [-0.48, 0, 0.48]) {
      ctx.beginPath();
      ctx.arc(0.18, y, 0.24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    rounded(m, -l, -0.4, -0.62, 0.4, [0.2, 0.08, 0.08, 0.2], paint.body);
    grille(m, -l + 0.08, -0.7, -0.28, 0.28, 0.09);
    rounded(m, -0.62, -0.3, -0.18, 0.3, [0.16, 0.08, 0.08, 0.16], paint.roof);
    pill(ctx, -0.58, -0.24, 0.12, 0.48, 0.05, paint.glass);
    for (const side of [-1, 1]) {
      lines(m, [[-0.2, side * 0.36, 0.05, side * 0.36]], palette.ink, 0.05);
      lines(m, [[0.05, side * 0.36, 0.05, side * 0.18]], palette.ink, 0.07);
    }
    tails(m, -l, 0.4, 0.12, 0.1);
  });
};

const tank: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const l = spec.length / 2;
  const half = spec.width / 2;
  const mid = middle(spec);
  const hull = l - 1;
  shade(m, car, mid, 1.6, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half, hull + l, half * 2, 0.3);
    ctx.rect(0, -0.1, l, 0.2);
  });
  const blur = blur_of(car);
  const centre = spec.track / 2;
  const band = spec.wheel_width;
  const run = hull + l - 0.3;
  at(m, car, mid, () => {
    for (const side of [-1, 1]) {
      const y = side * centre;
      const x0 = -l + 0.15;
      ctx.beginPath();
      ctx.roundRect(x0, y - band / 2, run, band, band / 2);
      ctx.fillStyle = palette.ink;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.translate(x0 + run / 2, 0);
      ctx.fillStyle = palette.tread;
      ctx.globalAlpha = blur;
      // Each track scrolls with its own side's roll, so they run against each other as it pivots.
      for (const x of tread(car.roll[side < 0 ? 0 : 1], 0.18, run)) ctx.fillRect(x - 0.03, y - band / 2, 0.06, band);
      ctx.restore();
      ctx.strokeStyle = palette.tread;
      ctx.lineWidth = m.line;
      ctx.stroke();
    }
    const deck = centre - band / 2 + 0.06;
    ctx.beginPath();
    ctx.moveTo(-l + 0.05, -deck);
    ctx.lineTo(hull - 0.7, -deck);
    ctx.lineTo(hull, -deck + 0.35);
    ctx.lineTo(hull, deck - 0.35);
    ctx.lineTo(hull - 0.7, deck);
    ctx.lineTo(-l + 0.05, deck);
    ctx.closePath();
    edged(m, paint.body);
    for (const side of [-1, 1]) pill(ctx, -l + 0.1, side * (centre + band / 2 - 0.02) - (side > 0 ? 0.08 : 0), hull + l - 0.2, 0.08, 0.03, paint.roof);
    grille(m, -l + 0.3, -l + 1.4, -deck + 0.2, deck - 0.2, 0.16);
    rounded(m, hull - 0.75, -0.55, hull - 0.2, 0.55, 0.12, paint.roof);
    ctx.beginPath();
    ctx.moveTo(0.35, -0.08);
    ctx.lineTo(l - 0.25, -0.08);
    ctx.lineTo(l - 0.25, 0.08);
    ctx.lineTo(0.35, 0.08);
    ctx.closePath();
    edged(m, paint.roof);
    rounded(m, l - 0.3, -0.14, l, 0.14, 0.04, palette.ink);
    ctx.beginPath();
    ctx.moveTo(0.75, -0.62);
    ctx.lineTo(0.75, 0.62);
    ctx.lineTo(-0.2, 0.98);
    ctx.lineTo(-1.25, 0.9);
    ctx.lineTo(-1.45, 0);
    ctx.lineTo(-1.25, -0.9);
    ctx.lineTo(-0.2, -0.98);
    ctx.closePath();
    edged(m, paint.roof);
    ctx.beginPath();
    ctx.arc(-0.6, 0.45, 0.26, 0, Math.PI * 2);
    edged(m, paint.glass);
    ctx.beginPath();
    ctx.arc(-0.55, -0.42, 0.2, 0, Math.PI * 2);
    edged(m, paint.body);
    pill(ctx, 0.3, -0.5, 0.2, 0.14, 0.04, paint.glass);
    for (const side of [-1, 1]) lamp(ctx, hull - 0.16, side * (deck - 0.25) - 0.08, 0.08, 0.16, palette.glow, palette, m.lamps.lit);
    tails(m, -l + 0.02, deck, 0.16, 0.2);
  });
};

function joint(m: Machine, rear: Pose, x: number, radius: number) {
  const { ctx, palette } = m;
  const at_point = to_world(rear, { x, y: 0 });
  ctx.beginPath();
  ctx.arc(at_point.x, at_point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = palette.ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at_point.x, at_point.y, radius * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = palette.steel;
  ctx.fill();
}

function frames(m: Machine): { front: Pose; rear: Pose; ends: ReturnType<typeof frame_ends>; pivot: number } {
  const { car, spec } = m;
  const pivot = spec.drive.kind === DriveKind.FRAME ? spec.drive.pivot : spec.wheelbase / 2;
  return { front: front_frame(car, spec), rear: car, ends: frame_ends(spec), pivot };
}

const loader: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const half = spec.width / 2;
  const { front, rear, ends, pivot } = frames(m);
  const behind = spec.wheelbase - pivot;
  const rear_mid = (ends.rear.front + ends.rear.rear) / 2;
  const front_mid = (ends.front.front + ends.front.rear) / 2;
  const rl = (ends.rear.front - ends.rear.rear) / 2;
  const fl = (ends.front.front - ends.front.rear) / 2;
  shade(m, rear, rear_mid, 1.8, () => {
    ctx.beginPath();
    ctx.roundRect(-rl, -half + 0.1, rl * 2, half * 2 - 0.2, 0.25);
  });
  shade(m, front, front_mid, 1.2, () => {
    ctx.beginPath();
    ctx.roundRect(-fl, -half + 0.3, fl * 2, half * 2 - 0.6, 0.2);
    ctx.rect(fl - 0.85, -half, 0.85, half * 2);
  });
  four(m, 0);
  at(m, rear, rear_mid, () => {
    rounded(m, -rl, -0.62, rl + 0.15, 0.62, [0.3, 0.1, 0.1, 0.3], paint.body);
    rounded(m, -rl, -0.62, -rl + 0.28, 0.62, [0.3, 0, 0, 0.3], palette.ink);
    rounded(m, -rl + 0.32, -0.5, 0.1, 0.5, 0.12, paint.roof);
    grille(m, -rl + 0.4, -rl + 1.0, -0.36, 0.36);
    for (const side of [-1, 1]) rounded(m, -0.45, side * 0.95 - 0.2, 0.55, side * 0.95 + 0.2, 0.15, paint.body);
    rounded(m, rl - 1.15, -0.62, rl - 0.05, 0.62, 0.14, paint.glass);
    pill(ctx, rl - 1.0, -0.48, 0.8, 0.96, 0.1, paint.roof);
    amber(m, rl - 0.6, 0);
    tails(m, -rl, 0.62, 0.18, 0.12);
  });
  at(m, front, front_mid, () => {
    rounded(m, -fl, -0.45, fl - 0.7, 0.45, [0.2, 0.1, 0.1, 0.2], paint.body);
    for (const side of [-1, 1]) rounded(m, -fl + 0.25, side * 0.6 - 0.09, fl - 0.75, side * 0.6 + 0.09, 0.05, paint.body);
    lines(m, [[fl - 1.3, -0.6, fl - 1.3, 0.6]], palette.ink, 0.08, 0.7);
    for (const side of [-1, 1]) lamp(ctx, fl - 1.0, side * 0.6 - 0.07, 0.1, 0.14, palette.glow, palette, m.lamps.lit);
    ctx.beginPath();
    ctx.roundRect(fl - 0.82, -half, 0.82, half * 2, [0.1, 0.03, 0.03, 0.1]);
    edged(m, palette.steel);
    lines(m, [[fl - 0.62, -half + 0.1, fl - 0.62, half - 0.1]], palette.ink, 0.05, 0.45);
    ctx.fillStyle = palette.ink;
    for (let y = -half + 0.14; y < half - 0.05; y += 0.28) {
      ctx.beginPath();
      ctx.moveTo(fl - 0.02, y - 0.06);
      ctx.lineTo(fl + 0.08, y);
      ctx.lineTo(fl - 0.02, y + 0.06);
      ctx.fill();
    }
  });
  joint(m, rear, behind, 0.24);
};

const dumper: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const half = spec.width / 2;
  const { front, rear, ends, pivot } = frames(m);
  const behind = spec.wheelbase - pivot;
  const rear_mid = (ends.rear.front + ends.rear.rear) / 2;
  const front_mid = (ends.front.front + ends.front.rear) / 2;
  const rl = (ends.rear.front - ends.rear.rear) / 2;
  const fl = (ends.front.front - ends.front.rear) / 2;
  const tub = half - 0.32;
  shade(m, rear, rear_mid, 2, () => {
    ctx.beginPath();
    ctx.roundRect(-rl, -tub, rl * 2, tub * 2, 0.3);
  });
  shade(m, front, front_mid, 1.9, () => {
    ctx.beginPath();
    ctx.roundRect(-fl, -half + 0.1, fl * 2, half * 2 - 0.2, 0.3);
  });
  const [fl_wheel, fr_wheel, rl_wheel, rr_wheel] = wheels(car, spec);
  tyre_at(m, fl_wheel.at, car.heading + fl_wheel.angle, car.roll[0], 0);
  tyre_at(m, fr_wheel.at, car.heading + fr_wheel.angle, car.roll[1], 0);
  for (const shift of [-0.85, 0.85]) {
    const along = { x: Math.cos(car.heading) * shift, y: Math.sin(car.heading) * shift };
    tyre_at(m, { x: rl_wheel.at.x + along.x, y: rl_wheel.at.y + along.y }, car.heading, car.roll[2], 0);
    tyre_at(m, { x: rr_wheel.at.x + along.x, y: rr_wheel.at.y + along.y }, car.heading, car.roll[3], 0);
  }
  at(m, front, front_mid, () => {
    rounded(m, -fl, -0.6, fl - 0.1, 0.6, [0.2, 0.3, 0.3, 0.2], paint.body);
    rounded(m, -0.2, -0.75, fl - 0.05, 0.75, [0.1, 0.3, 0.3, 0.1], paint.body);
    grille(m, fl - 0.45, fl - 0.1, -0.55, 0.55, 0.1);
    for (const side of [-1, 1]) rounded(m, -0.55, side * 1.12 - 0.22, 0.55, side * 1.12 + 0.22, 0.18, paint.roof);
    rounded(m, -fl + 0.15, -half + 0.12, 0.05, -0.05, 0.16, paint.glass);
    pill(ctx, -fl + 0.3, -half + 0.26, 1.0, 0.95, 0.12, paint.roof);
    amber(m, -fl + 0.75, -half + 0.72);
    heads(m, fl - 0.05, 0.75, 0.2, 0.15);
  });
  at(m, rear, rear_mid, () => {
    ctx.beginPath();
    ctx.roundRect(-rl, -tub, rl * 2 - 0.3, tub * 2, [0.25, 0.15, 0.15, 0.25]);
    edged(m, paint.body);
    ctx.beginPath();
    ctx.roundRect(-rl + 0.25, -tub + 0.2, rl * 2 - 0.85, tub * 2 - 0.4, 0.2);
    edged(m, paint.roof);
    const ribs: [number, number, number, number][] = [];
    for (let x = -rl + 0.9; x < rl - 0.7; x += 0.9) ribs.push([x, -tub + 0.22, x, tub - 0.22]);
    lines(m, ribs, palette.ink, 0.04, 0.35);
    rounded(m, rl - 0.45, -tub + 0.3, rl + 0.05, tub - 0.3, 0.12, paint.body);
    tails(m, -rl, tub, 0.24, 0.2);
  });
  joint(m, rear, behind, 0.26);
};

const ladder: MachineDraw = (m) => {
  const { ctx, car, spec, palette, time } = m;
  const paint = palette.player;
  const l = spec.length / 2;
  const half = spec.width / 2;
  const mid = middle(spec);
  shade(m, car, mid, 1.9, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half, l * 2, half * 2, 0.3);
  });
  four(m);
  at(m, car, mid, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half, l * 2, half * 2, [0.2, 0.35, 0.35, 0.2]);
    edged(m, paint.body);
    rounded(m, l - 2.1, -half + 0.12, l - 0.2, half - 0.12, [0.1, 0.3, 0.3, 0.1], paint.roof);
    pill(ctx, l - 0.6, -half + 0.2, 0.3, half * 2 - 0.4, 0.08, paint.glass);
    const lockers: [number, number, number, number][] = [];
    for (let x = -l + 1.8; x < l - 2.3; x += 1.1) for (const side of [-1, 1]) lockers.push([x, side * (half - 0.05), x, side * (half - 0.32)]);
    lines(m, lockers, palette.ink, 0.04, 0.4);
    const table = -l + 3.2;
    ctx.beginPath();
    ctx.arc(table, 0, 0.85, 0, Math.PI * 2);
    edged(m, palette.steel);
    const tip = l - 0.35;
    for (const side of [-1, 1]) rounded(m, table - 0.4, side * 0.42 - 0.07, tip, side * 0.42 + 0.07, 0.03, palette.steel);
    const rungs: [number, number, number, number][] = [];
    for (let x = table + 0.2; x < tip; x += 0.32) rungs.push([x, -0.36, x, 0.36]);
    lines(m, rungs, palette.ink, 0.04, 0.55);
    rounded(m, table - 0.6, -0.5, table + 0.3, 0.5, 0.12, paint.body);
    rounded(m, -l + 0.12, -0.75, -l + 1.35, 0.75, 0.16, paint.glass);
    pill(ctx, -l + 0.3, -0.6, 0.9, 1.2, 0.12, paint.roof);
    pill(ctx, l - 1.62, -0.85, 0.24, 1.7, 0.08, palette.ink);
    const lights = flashes(time, car.gear !== Gear.PARK);
    beacon(ctx, l - 1.5, -0.5, palette.error, palette.brake_glow, lights[0], palette);
    beacon(ctx, l - 1.5, 0.5, palette.info, palette.info_glow, lights[1], palette);
    heads(m, l, half, 0.32, 0.3);
    tails(m, -l, half, 0.28, 0.2);
  });
};

const telehandler: MachineDraw = (m) => {
  const { ctx, car, spec, palette } = m;
  const paint = palette.player;
  const l = spec.length / 2;
  const half = spec.width / 2;
  const mid = middle(spec);
  shade(m, car, mid, 1.6, () => {
    ctx.beginPath();
    ctx.roundRect(-l, -half + 0.2, l * 2 - 0.6, half * 2 - 0.4, 0.25);
  });
  four(m, 0);
  at(m, car, mid, () => {
    rounded(m, -l, -0.6, l - 1.1, 0.6, [0.25, 0.1, 0.1, 0.25], paint.body);
    rounded(m, -l, -0.6, -l + 0.25, 0.6, [0.25, 0, 0, 0.25], palette.ink);
    for (const side of [-1, 1]) {
      rounded(m, -1.55, side * 0.95 - 0.22, -0.65, side * 0.95 + 0.22, 0.16, paint.body);
      rounded(m, 0.45, side * 0.95 - 0.22, 1.35, side * 0.95 + 0.22, 0.16, paint.body);
    }
    rounded(m, -1.25, -half + 0.12, 0.8, -0.18, 0.16, paint.glass);
    pill(ctx, -1.05, -half + 0.24, 1.6, 0.66, 0.12, paint.roof);
    rounded(m, -l + 0.3, 0.3, -0.5, 0.95, 0.14, paint.body);
    grille(m, -l + 0.4, -1.2, 0.42, 0.85, 0.12);
    rounded(m, -l + 0.4, -0.12, l - 0.85, 0.3, 0.06, paint.roof);
    rounded(m, 0.5, -0.04, l - 0.6, 0.22, 0.05, palette.steel);
    rounded(m, l - 0.68, -0.7, l - 0.52, 0.7, 0.04, palette.ink);
    for (const side of [-1, 1]) {
      const y = side * 0.45;
      ctx.beginPath();
      ctx.moveTo(l - 0.52, y - 0.06);
      ctx.lineTo(l - 0.06, y - 0.06);
      ctx.lineTo(l, y);
      ctx.lineTo(l - 0.06, y + 0.06);
      ctx.lineTo(l - 0.52, y + 0.06);
      ctx.closePath();
      edged(m, palette.steel);
    }
    amber(m, -0.6, -half + 0.58);
    for (const side of [-1, 1]) lamp(ctx, 0.75, side * (half - 0.45) - 0.07, 0.08, 0.14, palette.glow, palette, m.lamps.lit);
    tails(m, -l + 0.25, 0.6, 0.16, 0.1);
  });
};

const MACHINES: Partial<Record<Vehicle, MachineDraw>> = {
  [Vehicle.BOBCAT]: bobcat,
  [Vehicle.MOWER]: mower,
  [Vehicle.TANK]: tank,
  [Vehicle.LOADER]: loader,
  [Vehicle.DUMPER]: dumper,
  [Vehicle.LADDER]: ladder,
  [Vehicle.TELEHANDLER]: telehandler,
};

export function machine(
  ctx: CanvasRenderingContext2D,
  car: Car,
  vehicle: Vehicle,
  spec: VehicleSpec,
  lamps: Lamps,
  scale: number,
  palette: Palette,
  time: number
): boolean {
  const draw = MACHINES[vehicle];
  if (!draw) return false;
  draw({ ctx, car, spec, lamps, scale, palette, time, line: 1 / scale });
  return true;
}
