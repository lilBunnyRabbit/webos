import { outlined, solids, type Palette } from "../core/draw";
import type { Polygon, Vec } from "../core/geometry";
import { SolidKind } from "../core/scene";
import { Building } from "../games/define";
import { blueprint, box, DOOR_HALF, RECESS, type Blueprint } from "./blueprints";
import { to_town, type House, type Plot } from "./yard";

interface Pen {
  ctx: CanvasRenderingContext2D;
  palette: Palette;
  scale: number;
  line: number;
  plan: Blueprint;
}

function fill_box(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.min(u0, u1), Math.min(v0, v1), Math.abs(u1 - u0), Math.abs(v1 - v0));
}

function stroke_box(ctx: CanvasRenderingContext2D, u0: number, v0: number, u1: number, v1: number, colour: string, width: number) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.strokeRect(Math.min(u0, u1), Math.min(v0, v1), Math.abs(u1 - u0), Math.abs(v1 - v0));
}

function circle(ctx: CanvasRenderingContext2D, u: number, v: number, r: number) {
  ctx.beginPath();
  ctx.arc(u, v, r, 0, Math.PI * 2);
}

function shapes(plan: Blueprint): Polygon[] {
  return plan.pieces.map((piece) => piece.shape);
}

// The plan's own frame flips the world (front toward the court on every side), so text and icons undo it to read upright.
function upright(ctx: CanvasRenderingContext2D, u: number, v: number, draw: () => void) {
  const m = ctx.getTransform();
  ctx.save();
  ctx.translate(u, v);
  const s = Math.hypot(m.a, m.b);
  const now = ctx.getTransform();
  ctx.setTransform(s, 0, 0, s, now.e, now.f);
  draw();
  ctx.restore();
}

// The default roof is a translucent tint laid on an opaque base, so the district's ground never shows through it.
function roof(pen: Pen, colour?: string) {
  outlined(pen.ctx, shapes(pen.plan), colour ?? pen.palette.pavement, pen.palette.wall_edge, Math.max(0.12, 2.5 / pen.scale));
  if (colour) return;
  pen.ctx.fillStyle = pen.palette.shelf;
  pen.ctx.fill();
}

function small_car(ctx: CanvasRenderingContext2D, u: number, v: number, along: boolean, paint: Palette["player"], line: number, edge: string) {
  const [w, l] = along ? [1.7, 3.9] : [3.9, 1.7];
  ctx.beginPath();
  ctx.roundRect(u - w / 2, v - l / 2, w, l, 0.45);
  ctx.fillStyle = paint.body;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.fillStyle = paint.glass;
  if (along) ctx.fillRect(u - w / 2 + 0.25, v - 0.9, w - 0.5, 1.6);
  else ctx.fillRect(u - 0.9, v - l / 2 + 0.25, 1.6, l - 0.5);
}

function car_park(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen);
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(line, 0.08);
  ctx.beginPath();
  for (let u = -6.2; u <= 6.21; u += 2.48) {
    ctx.moveTo(u, -8.7);
    ctx.lineTo(u, -6.2);
  }
  for (const [a, b] of [
    [-6.2, -3.3],
    [3.3, 6.2],
  ]) {
    for (let u = a; u <= b + 0.01; u += (b - a) / 1) {
      ctx.moveTo(u, -3.7);
      ctx.lineTo(u, -1.2);
    }
  }
  ctx.moveTo(-6.2, -8.7);
  ctx.lineTo(6.2, -8.7);
  ctx.stroke();
  const cars = palette.cars;
  small_car(ctx, -4.96, -7.45, true, cars[0], line, palette.edge);
  small_car(ctx, 0, -7.45, true, cars[2], line, palette.edge);
  small_car(ctx, -4.75, -2.45, true, cars[1], line, palette.edge);
  circle(ctx, 4.9, -9.1, 2.3);
  ctx.fillStyle = palette.floor;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.1, 2 / pen.scale);
  ctx.stroke();
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(line, 0.08);
  ctx.beginPath();
  ctx.arc(4.9, -9.1, 1.5, 0.3, Math.PI * 1.7);
  ctx.moveTo(4.9 + 0.8, -9.1);
  ctx.arc(4.9, -9.1, 0.8, 0, Math.PI * 1.4);
  ctx.stroke();
  upright(ctx, 4.9, -9.1, () => {
    ctx.beginPath();
    ctx.roundRect(-0.75, -0.75, 1.5, 1.5, 0.3);
    ctx.fillStyle = palette.info;
    ctx.fill();
    ctx.fillStyle = palette.glow;
    ctx.font = "700 1.2px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("P", 0, 0.08);
  });
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const a = -2.6 + (i * 4.4) / stripes;
    fill_box(ctx, a, -0.55, a + 4.4 / stripes, -0.25, i % 2 ? palette.ink : palette.warning);
  }
  circle(ctx, -2.75, -0.4, 0.28);
  ctx.fillStyle = palette.pillar;
  ctx.fill();
}

function warehouse(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = line;
  ctx.beginPath();
  for (let u = -7; u < 7.1; u += 0.55) {
    if (Math.abs(u) < DOOR_HALF + 0.1) {
      ctx.moveTo(u, -7.7);
      ctx.lineTo(u, -RECESS - 0.2);
      continue;
    }
    ctx.moveTo(u, -7.7);
    ctx.lineTo(u, -1.3);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  for (const u of [-5.8, -1.1, 3.6]) fill_box(ctx, u, -6.9, u + 2.2, -5.4, palette.info);
  ctx.globalAlpha = 1;
  for (const u of [-5.4, 5.4]) {
    fill_box(ctx, u - 1.4, -1.2, u + 1.4, 0, palette.steel);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.beginPath();
    for (let v = -1.05; v < 0; v += 0.3) {
      ctx.moveTo(u - 1.4, v);
      ctx.lineTo(u + 1.4, v);
    }
    ctx.stroke();
    fill_box(ctx, u - 1.6, -0.25, u - 1.4, 0.25, palette.warning);
    fill_box(ctx, u + 1.4, -0.25, u + 1.6, 0.25, palette.warning);
    ctx.save();
    ctx.beginPath();
    ctx.rect(u - 1.4, 0.15, 2.8, 1.5);
    ctx.clip();
    ctx.strokeStyle = palette.warning;
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    for (let d = -3; d < 3; d += 0.6) {
      ctx.moveTo(u + d, 1.65);
      ctx.lineTo(u + d + 1.5, 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }
  for (const [u, v] of [
    [-3.8, -2.6],
    [3.8, -2.6],
    [-6.6, -2.6],
    [6.6, -2.6],
  ]) {
    fill_box(ctx, u - 0.55, v - 0.55, u + 0.55, v + 0.55, palette.load);
    stroke_box(ctx, u - 0.55, v - 0.55, u + 0.55, v + 0.55, palette.load_edge, line);
    ctx.beginPath();
    ctx.moveTo(u, v - 0.55);
    ctx.lineTo(u, v + 0.55);
    ctx.stroke();
  }
}

function track(pen: Pen) {
  const { ctx, palette, line } = pen;
  const stadium = (r: number) => {
    ctx.beginPath();
    ctx.arc(-3.6, -3.8, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.arc(3.6, -3.8, r, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8, -8, 16, 8);
  ctx.rect(DOOR_HALF, -RECESS, -DOOR_HALF * 2, RECESS);
  ctx.clip();
  stadium(3.8);
  ctx.fillStyle = palette.grass;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.12, 2.5 / pen.scale);
  ctx.stroke();
  stadium(2.75);
  ctx.strokeStyle = palette.asphalt;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  for (const [r, offset] of [
    [3.55, 0],
    [1.95, 0.5],
  ]) {
    stadium(r);
    ctx.lineWidth = 0.22;
    ctx.setLineDash([0.5, 0.5]);
    ctx.lineDashOffset = offset;
    ctx.strokeStyle = palette.error;
    ctx.stroke();
    ctx.lineDashOffset = offset + 0.5;
    ctx.strokeStyle = palette.glow;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.restore();
  fill_box(ctx, -3.2, -6.4, 3.2, -5.3, palette.pavement);
  stroke_box(ctx, -3.2, -6.4, 3.2, -5.3, palette.wall_edge, line);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = line;
  ctx.beginPath();
  for (let v = -6.15; v < -5.3; v += 0.27) {
    ctx.moveTo(-3.2, v);
    ctx.lineTo(3.2, v);
  }
  ctx.stroke();
  const square = 0.5;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < (DOOR_HALF * 2) / square; i++) {
      fill_box(ctx, -DOOR_HALF + i * square, 0.3 + row * square, -DOOR_HALF + (i + 1) * square, 0.3 + (row + 1) * square, (i + row) % 2 ? palette.ink : palette.glow);
    }
  }
}

function garden(pen: Pen) {
  const { ctx, palette, line, scale } = pen;
  const lawn = [box(-6.2, -9.2, -DOOR_HALF, -0.6), box(DOOR_HALF, -9.2, 6.2, -0.6), box(-DOOR_HALF, -9.2, DOOR_HALF, -RECESS)];
  outlined(ctx, lawn, palette.grass, palette.grass, 1 / scale);
  ctx.save();
  ctx.beginPath();
  for (const piece of lawn) {
    ctx.moveTo(piece[0].x, piece[0].y);
    for (const p of piece.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  }
  ctx.clip();
  ctx.fillStyle = palette.hedge;
  ctx.globalAlpha = 0.45;
  for (let u = -6.2; u < 6.2; u += 2) ctx.fillRect(u, -9.2, 1, 8.6);
  ctx.globalAlpha = 1;
  ctx.restore();
  const hedge = [box(-7, -10, 7, -9.2), box(-7, -10, -6.2, 0), box(6.2, -10, 7, 0), box(-6.2, -0.8, -DOOR_HALF, 0), box(DOOR_HALF, -0.8, 6.2, 0)];
  solids(
    ctx,
    hedge.map((shape) => ({ kind: SolidKind.HEDGE, shape })),
    scale,
    palette
  );
  fill_box(ctx, -2.2, -6.4, 2.2, -RECESS, palette.wood);
  stroke_box(ctx, -2.2, -6.4, 2.2, -RECESS, palette.ink, line);
  ctx.strokeStyle = palette.ink;
  ctx.beginPath();
  ctx.moveTo(-2.2, -4.95);
  ctx.lineTo(2.2, -4.95);
  ctx.stroke();
  for (const [u, colour] of [
    [-4.8, palette.error],
    [-3.6, palette.warning],
    [3.6, palette.info],
    [4.8, palette.error],
  ] as const) {
    for (const dv of [0, 0.7]) {
      circle(ctx, u + dv * 0.4, -8.6 + dv, 0.3);
      ctx.fillStyle = colour;
      ctx.fill();
    }
  }
  ctx.save();
  ctx.translate(-4.4, -4.2);
  ctx.rotate(0.35);
  fill_box(ctx, -0.55, -0.7, 0.55, 0.7, palette.target);
  stroke_box(ctx, -0.55, -0.7, 0.55, 0.7, palette.ink, line);
  fill_box(ctx, -0.35, 0.7, 0.35, 1.3, palette.ink);
  ctx.restore();
}

function apron(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen, palette.floor);
  fill_box(ctx, -7.4, -11.4, 7.4, -9.4, palette.pavement);
  stroke_box(ctx, -7.4, -11.4, 7.4, -9.4, palette.wall_edge, Math.max(0.1, 2 / pen.scale));
  ctx.strokeStyle = palette.info;
  ctx.lineWidth = 0.18;
  ctx.beginPath();
  ctx.moveTo(-7.1, -9.6);
  ctx.lineTo(7.1, -9.6);
  ctx.stroke();
  ctx.strokeStyle = palette.warning;
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(-3.6, -0.6);
  ctx.lineTo(-3.6, -8.9);
  ctx.moveTo(-4.4, -8.9);
  ctx.lineTo(-2.8, -8.9);
  ctx.stroke();
  fill_box(ctx, -2.3, -9.4, -1.5, -7.7, palette.pavement);
  stroke_box(ctx, -2.3, -9.4, -1.5, -7.7, palette.wall_edge, line);
  const jet = (u: number, v: number) => {
    ctx.save();
    ctx.translate(u, v);
    ctx.beginPath();
    ctx.moveTo(0, -0.1);
    ctx.lineTo(3.4, 2.3);
    ctx.lineTo(3.4, 2.75);
    ctx.lineTo(0.4, 1.75);
    ctx.lineTo(0.4, 3.9);
    ctx.lineTo(1.5, 4.6);
    ctx.lineTo(1.5, 4.9);
    ctx.lineTo(0, 4.7);
    ctx.lineTo(-1.5, 4.9);
    ctx.lineTo(-1.5, 4.6);
    ctx.lineTo(-0.4, 3.9);
    ctx.lineTo(-0.4, 1.75);
    ctx.lineTo(-3.4, 2.75);
    ctx.lineTo(-3.4, 2.3);
    ctx.closePath();
    ctx.fillStyle = palette.glow;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 1.7, 0.45, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    ctx.fillRect(-0.25, -1.25, 0.5, 0.25);
    ctx.restore();
  };
  jet(-3.6, -7.3);
  circle(ctx, 4.6, -6, 1.5);
  ctx.fillStyle = palette.pavement;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.1, 2 / pen.scale);
  ctx.stroke();
  circle(ctx, 4.6, -6, 1);
  ctx.strokeStyle = palette.info;
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.setLineDash([0.3, 0.3]);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(-DOOR_HALF, -0.15);
  ctx.lineTo(-7.25, -0.15);
  ctx.lineTo(-7.25, -9.4);
  ctx.moveTo(DOOR_HALF, -0.15);
  ctx.lineTo(7.25, -0.15);
  ctx.lineTo(7.25, -9.4);
  ctx.stroke();
  ctx.setLineDash([]);
}

function ferry(pen: Pen) {
  const { ctx, palette, line, scale } = pen;
  const water = shapes(pen.plan);
  outlined(ctx, water, palette.water, palette.water, 1 / scale);
  ctx.strokeStyle = palette.water_edge;
  ctx.lineWidth = Math.max(0.12, 2.5 / scale);
  ctx.beginPath();
  ctx.moveTo(-7.4, -12);
  ctx.lineTo(-7.4, 0);
  ctx.lineTo(-DOOR_HALF, 0);
  ctx.lineTo(-DOOR_HALF, -RECESS);
  ctx.lineTo(DOOR_HALF, -RECESS);
  ctx.lineTo(DOOR_HALF, 0);
  ctx.lineTo(7.4, 0);
  ctx.lineTo(7.4, -12);
  ctx.stroke();
  ctx.lineWidth = Math.max(line, 0.08);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [u, v] of [
    [-6.3, -2.2],
    [-5.6, -6.4],
    [5.8, -3.6],
    [6.1, -8.6],
    [-6.5, -10.3],
  ]) {
    ctx.moveTo(u - 0.5, v);
    ctx.quadraticCurveTo(u - 0.25, v - 0.3, u, v);
    ctx.quadraticCurveTo(u + 0.25, v + 0.3, u + 0.5, v);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3.3, -RECESS);
  ctx.lineTo(-3.3, -9.6);
  ctx.quadraticCurveTo(-3.1, -11.8, 0, -12.6);
  ctx.quadraticCurveTo(3.1, -11.8, 3.3, -9.6);
  ctx.lineTo(3.3, -RECESS);
  ctx.closePath();
  ctx.fillStyle = palette.pavement;
  ctx.fill();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.1, 2 / scale);
  ctx.stroke();
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(line, 0.08);
  ctx.beginPath();
  for (const u of [-1.1, 1.1]) {
    ctx.moveTo(u, -RECESS - 0.3);
    ctx.lineTo(u, -8.4);
  }
  ctx.stroke();
  fill_box(ctx, -2.6, -10.6, 2.6, -8.8, palette.glow);
  stroke_box(ctx, -2.6, -10.6, 2.6, -8.8, palette.ink, line);
  fill_box(ctx, -2.2, -10.3, 2.2, -10, palette.info);
  ctx.beginPath();
  ctx.roundRect(-0.5, -9.8, 1, 0.8, 0.2);
  ctx.fillStyle = palette.error;
  ctx.fill();
  fill_box(ctx, -2.8, -RECESS, 2.8, -0.1, palette.steel);
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = 0.14;
  ctx.beginPath();
  for (let v = -0.5; v > -RECESS; v -= 1) {
    ctx.moveTo(-1.2, v + 0.5);
    ctx.lineTo(0, v);
    ctx.lineTo(1.2, v + 0.5);
  }
  ctx.stroke();
  for (const u of [-6.6, -4.2, 4.2, 6.6]) {
    circle(ctx, u, -0.45, 0.25);
    ctx.fillStyle = palette.pillar;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
  }
}

function arena(pen: Pen) {
  const { ctx, palette, line, scale } = pen;
  ctx.globalAlpha = 0.55;
  outlined(ctx, shapes(pen.plan), palette.load, palette.load, 1 / scale);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.wood;
  ctx.lineWidth = 0.22;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-DOOR_HALF, -0.1);
  ctx.lineTo(-6.9, -0.1);
  ctx.lineTo(-6.9, -10.5);
  ctx.lineTo(6.9, -10.5);
  ctx.lineTo(6.9, -0.1);
  ctx.lineTo(DOOR_HALF, -0.1);
  ctx.lineTo(DOOR_HALF, -RECESS);
  ctx.lineTo(-DOOR_HALF, -RECESS);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  for (let u = -6.9; u <= 6.91; u += 1.15) {
    ctx.fillRect(u - 0.12, -10.62, 0.24, 0.24);
    if (Math.abs(u) > DOOR_HALF) ctx.fillRect(u - 0.12, -0.22, 0.24, 0.24);
  }
  for (let v = -10.5; v <= -0.1; v += 1.3) {
    ctx.fillRect(-7.02, v - 0.12, 0.24, 0.24);
    ctx.fillRect(6.78, v - 0.12, 0.24, 0.24);
  }
  fill_box(ctx, -4.5, -10.3, 4.5, -8.9, palette.pavement);
  stroke_box(ctx, -4.5, -10.3, 4.5, -8.9, palette.wall_edge, line);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = line;
  ctx.beginPath();
  for (let v = -10; v < -8.9; v += 0.35) {
    ctx.moveTo(-4.5, v);
    ctx.lineTo(4.5, v);
  }
  ctx.stroke();
  for (const [u, v] of [
    [-5.2, -6.8],
    [-3.6, -5.6],
    [5, -2.2],
    [5.4, -6.8],
    [-5.4, -2.3],
    [0, -7.5],
  ]) {
    circle(ctx, u, v, 0.32);
    ctx.fillStyle = palette.warning;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
  }
  for (const [u, v] of [
    [3.4, -6.4],
    [2.2, -7.6],
  ]) {
    circle(ctx, u, v, 0.4);
    ctx.fillStyle = palette.info;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }
  ctx.strokeStyle = palette.wood;
  ctx.lineWidth = 0.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-DOOR_HALF, 0);
  ctx.lineTo(-DOOR_HALF - 1.6, 1.7);
  ctx.moveTo(DOOR_HALF, 0);
  ctx.lineTo(DOOR_HALF + 1.6, 1.7);
  ctx.stroke();
}

function star(ctx: CanvasRenderingContext2D, u: number, v: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    ctx.lineTo(u + Math.cos(a) * radius, v + Math.sin(a) * radius);
  }
  ctx.closePath();
}

function hotel(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen);
  ctx.beginPath();
  ctx.roundRect(-6.2, -9.2, 3.8, 2.6, 0.5);
  ctx.fillStyle = palette.water;
  ctx.fill();
  ctx.strokeStyle = palette.water_edge;
  ctx.lineWidth = Math.max(line, 0.1);
  ctx.stroke();
  for (const v of [-5.9, -5.2]) {
    fill_box(ctx, -6, v, -4.6, v + 0.45, palette.glow);
    stroke_box(ctx, -6, v, -4.6, v + 0.45, palette.ink, line);
  }
  for (const [u, v] of [
    [3.6, -8.4],
    [5, -8.6],
    [4.4, -7.2],
    [5.8, -7.3],
  ]) {
    circle(ctx, u, v, 0.6);
    ctx.fillStyle = palette.hedge;
    ctx.fill();
    ctx.strokeStyle = palette.hedge_edge;
    ctx.lineWidth = line;
    ctx.stroke();
  }
  ctx.fillStyle = palette.warning;
  for (let i = -2; i <= 2; i++) {
    star(ctx, i * 0.9, -4.3, 0.36);
    ctx.fill();
  }
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 8; i++) {
    const u = -3.4 + i * 0.85;
    fill_box(ctx, u, -RECESS, u + 0.85, 1.6, i % 2 ? palette.glow : palette.error);
  }
  ctx.globalAlpha = 1;
  stroke_box(ctx, -3.4, -RECESS, 3.4, 1.6, palette.ink, Math.max(line, 0.08));
  fill_box(ctx, 3.7, -1.1, 4.5, -0.3, palette.wood);
  stroke_box(ctx, 3.7, -1.1, 4.5, -0.3, palette.ink, line);
}

function test_centre(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen, palette.hedge);
  ctx.beginPath();
  ctx.moveTo(-7, -0.4);
  ctx.lineTo(-7, -9.2);
  ctx.lineTo(7, -9.2);
  ctx.lineTo(7, -0.4);
  ctx.lineTo(3.6, -0.4);
  ctx.lineTo(3.6, -7.6);
  ctx.lineTo(-3.6, -7.6);
  ctx.lineTo(-3.6, -0.4);
  ctx.closePath();
  ctx.fillStyle = palette.asphalt;
  ctx.fill();
  ctx.strokeStyle = palette.kerb;
  ctx.lineWidth = Math.max(line, 0.1);
  ctx.stroke();
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = 0.1;
  ctx.setLineDash([0.6, 0.5]);
  ctx.beginPath();
  ctx.moveTo(-5.3, -0.4);
  ctx.lineTo(-5.3, -8.4);
  ctx.lineTo(5.3, -8.4);
  ctx.lineTo(5.3, -5.6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = palette.glow;
  for (let v = -4.4; v < -2.4; v += 0.5) ctx.fillRect(-7, v, 3.4, 0.25);
  ctx.fillRect(3.6, -1.6, 3.4, 0.22);
  circle(ctx, 5.3, -4.4, 0.6);
  ctx.fillStyle = palette.glow;
  ctx.fill();
  fill_box(ctx, -3.3, -7.2, 3.3, -RECESS, palette.pavement);
  stroke_box(ctx, -3.3, -7.2, 3.3, -RECESS, palette.wall_edge, Math.max(0.1, 2 / pen.scale));
  upright(ctx, 0, -5.35, () => {
    ctx.beginPath();
    ctx.roundRect(-0.85, -0.85, 1.7, 1.7, 0.18);
    ctx.fillStyle = palette.glow;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.fillStyle = palette.error;
    ctx.fillRect(-0.4, -0.55, 0.32, 1.1);
    ctx.fillRect(-0.4, 0.25, 0.85, 0.3);
  });
}

function plain(pen: Pen) {
  const { ctx, palette, line } = pen;
  roof(pen);
  for (const [u, v] of [
    [-4, -6],
    [4, -6],
  ]) {
    fill_box(ctx, u - 0.8, v - 0.8, u + 0.8, v + 0.8, palette.floor);
    stroke_box(ctx, u - 0.8, v - 0.8, u + 0.8, v + 0.8, palette.wall_edge, line);
    circle(ctx, u, v, 0.55);
    ctx.stroke();
  }
}

function shutter(pen: Pen) {
  const { ctx, palette, line } = pen;
  fill_box(ctx, -DOOR_HALF, -RECESS, DOOR_HALF, 0, palette.floor);
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = line;
  ctx.beginPath();
  for (let v = -RECESS + 0.3; v < 0; v += 0.45) {
    ctx.moveTo(-DOOR_HALF + 0.1, v);
    ctx.lineTo(DOOR_HALF - 0.1, v);
  }
  ctx.stroke();
}

const DRAW: Record<Building, (pen: Pen) => void> = {
  [Building.CAR_PARK]: car_park,
  [Building.WAREHOUSE]: warehouse,
  [Building.TRACK]: track,
  [Building.GARDEN]: garden,
  [Building.APRON]: apron,
  [Building.FERRY]: ferry,
  [Building.ARENA]: arena,
  [Building.VALET_STAND]: hotel,
  [Building.TEST_CENTRE]: test_centre,
};

export function in_plan(ctx: CanvasRenderingContext2D, plot: Plot, draw: () => void) {
  const fx = Math.cos(plot.facing);
  const fy = Math.sin(plot.facing);
  ctx.save();
  ctx.transform(-fy, fx, fx, fy, plot.mouth.x, plot.mouth.y);
  draw();
  ctx.restore();
}

export function shadow_of(plot: Plot): Polygon[] {
  const plan = blueprint(plot.building);
  return plan.pieces.map((piece) => piece.shape.map((p) => to_town(plot, p.x, p.y)));
}

export function building(ctx: CanvasRenderingContext2D, plot: Plot, scale: number, palette: Palette) {
  const plan = blueprint(plot.building);
  const pen = { ctx, palette, scale, line: Math.max(0.05, 1 / scale), plan };
  in_plan(ctx, plot, () => {
    (plot.building ? DRAW[plot.building] : plain)(pen);
    if (!plot.open) shutter(pen);
  });
}

export function house(ctx: CanvasRenderingContext2D, item: House, scale: number, palette: Palette) {
  const paint = palette.cars[item.paint % palette.cars.length];
  outlined(ctx, [item.shape], paint.roof, palette.wall_edge, Math.max(0.12, 2.5 / scale));
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = Math.max(0.06, 1.25 / scale);
  ctx.beginPath();
  const [a, b] = item.ridge;
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  for (const end of [a, b]) {
    const corners = item.shape.filter((p) => Math.hypot(p.x - end.x, p.y - end.y) < Math.hypot(a.x - b.x, a.y - b.y) / 2 + 3);
    for (const corner of corners.sort((p, q) => Math.hypot(p.x - end.x, p.y - end.y) - Math.hypot(q.x - end.x, q.y - end.y)).slice(0, 2)) {
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(corner.x, corner.y);
    }
  }
  ctx.stroke();
}

export function tree(ctx: CanvasRenderingContext2D, at: Vec, scale: number, palette: Palette) {
  circle(ctx, at.x + 0.3, at.y + 0.4, 1.1);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  circle(ctx, at.x, at.y, 1.1);
  ctx.fillStyle = palette.hedge;
  ctx.fill();
  ctx.strokeStyle = palette.hedge_edge;
  ctx.lineWidth = Math.max(0.08, 1.5 / scale);
  ctx.stroke();
  circle(ctx, at.x - 0.3, at.y - 0.3, 0.45);
  ctx.fillStyle = palette.hedge_leaf;
  ctx.fill();
}
