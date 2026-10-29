import type { Insets } from "../../core/camera";
import { bay_arrow, bay_pointer, beams, begin_frame, contact_rings, fill, guides, outlined, path, player, type Palette, type View } from "../../core/draw";
import { SolidKind } from "../../core/scene";
import type { Pose, Vec } from "../../core/geometry";
import { Gear } from "../../core/vehicle";
import { BOX_HEADING, StepKind, type Gate } from "./course";
import { spec_of, Status, step_target, type GameState } from "./game";

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  font: string;
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

// Drawn bigger than they are when the view is far out, like the yard's, so a slalom reads from the start card.
function cone(ctx: CanvasRenderingContext2D, at: Vec, scale: number, palette: Palette, glow: boolean) {
  const r = Math.max(0.3, Math.min(0.9, 5.5 / scale));
  const line = Math.max(0.04, 1.25 / scale);
  if (glow) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = palette.target_fill;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(at.x - r + r * 0.25, at.y - r + r * 0.35, r * 2, r * 2, r * 0.35);
  ctx.fillStyle = palette.shadow;
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(at.x - r, at.y - r, r * 2, r * 2, r * 0.35);
  ctx.fillStyle = palette.warning;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(at.x, at.y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = palette.warning;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(at.x, at.y, r * 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = r * 0.2;
  ctx.stroke();
}

function fallen(ctx: CanvasRenderingContext2D, pose: Pose, scale: number, palette: Palette) {
  const r = Math.max(0.3, Math.min(0.9, 5.5 / scale));
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.8);
  ctx.lineTo(r * 1.4, 0);
  ctx.lineTo(-r, r * 0.8);
  ctx.closePath();
  ctx.fillStyle = palette.warning;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.04, 1.25 / scale);
  ctx.stroke();
  ctx.restore();
}

function gate_line(ctx: CanvasRenderingContext2D, gate: Gate, colour: string, width: number, dash: number[]) {
  ctx.beginPath();
  ctx.moveTo(gate.a.x, gate.a.y);
  ctx.lineTo(gate.b.x, gate.b.y);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function chevron(ctx: CanvasRenderingContext2D, at: Vec, heading: number, size: number, colour: string) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(-size * 0.5, -size * 0.6);
  ctx.lineTo(size * 0.4, 0);
  ctx.lineTo(-size * 0.5, size * 0.6);
  ctx.strokeStyle = colour;
  ctx.lineWidth = size * 0.28;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

interface Tag {
  at: Vec;
  text: string;
  size: number;
  colour: string;
  pill?: string;
}

function tags(ctx: CanvasRenderingContext2D, items: Tag[], view: View, font: string, palette: Palette) {
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tag of items) {
    const { x, y } = to_screen(tag.at, view);
    ctx.font = `600 ${tag.size}px ${font}`;
    if (tag.pill) {
      const width = ctx.measureText(tag.text).width + tag.size * 0.9;
      const height = tag.size * 1.5;
      ctx.beginPath();
      ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
      ctx.fillStyle = tag.pill;
      ctx.fill();
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = tag.colour;
    ctx.fillText(tag.text, x, y + 0.5);
  }
  ctx.restore();
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { course } = state;
  const spec = spec_of(state.round);
  begin_frame(ctx, view, palette);
  fill(ctx, course.floor, palette.floor);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const playing = state.status !== Status.DONE && state.status !== Status.CRASHED;
  const line = Math.max(0.08, 1.5 / scale);
  const [s0, s1] = course.start_line;
  ctx.beginPath();
  ctx.moveTo(s0.x, s0.y);
  ctx.lineTo(s1.x, s1.y);
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.15, 2 / scale);
  ctx.stroke();

  const box_step = course.steps.findIndex((step) => step.kind === StepKind.STOP);
  const box_current = playing && state.current === box_step;
  const box_done = state.current > box_step;
  ctx.save();
  if (box_current) {
    ctx.shadowColor = palette.target;
    ctx.shadowBlur = 8 * view.dpr;
  }
  fill(ctx, course.box, box_done ? palette.parked_fill : box_current ? palette.target_fill : palette.pavement);
  path(ctx, course.box);
  ctx.strokeStyle = box_done ? palette.parked : box_current ? palette.target : palette.paint;
  ctx.lineWidth = Math.max(0.1, (box_current ? 3 : 1.5) / scale);
  ctx.lineJoin = "miter";
  ctx.stroke();
  ctx.restore();
  bay_arrow(ctx, { shape: course.box, heading: BOX_HEADING, either: false }, box_done ? palette.parked : palette.paint);

  // Pass lines: the next one bright, later ones faint, done ones gone. A slalom's line only shows near its cone.
  course.steps.forEach((step, i) => {
    if (!step.gate || i < state.current) return;
    const next = playing && i === state.current;
    const colour = next ? palette.target : palette.faint;
    if (step.kind === StepKind.SLALOM) {
      const side = Math.sign(step.gate.b.y - step.gate.a.y);
      const reach = spec.width + 1.5;
      const end = { x: step.gate.a.x, y: step.gate.a.y + side * reach };
      if (next) {
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        gate_line(ctx, { ...step.gate, b: end }, colour, line, [0.4, 0.3]);
        ctx.globalAlpha = 1;
      }
      chevron(ctx, { x: step.gate.a.x - 0.6, y: step.gate.a.y + side * (spec.width / 2 + 0.9) }, Math.PI, 0.9, colour);
      return;
    }
    if (next) ctx.globalAlpha = 0.6 + 0.4 * pulse;
    gate_line(ctx, step.gate, colour, next ? Math.max(0.12, 2.5 / scale) : line, next ? [] : [0.5, 0.35]);
    ctx.globalAlpha = 1;
    const mid = { x: (step.gate.a.x + step.gate.b.x) / 2, y: (step.gate.a.y + step.gate.b.y) / 2 };
    const heading = Math.atan2(step.gate.normal.y, step.gate.normal.x);
    if (step.kind === StepKind.REVERSE) {
      if (state.current >= box_step) chevron(ctx, { x: mid.x + step.gate.normal.x * 0.8, y: mid.y }, heading, 0.9, colour);
    } else chevron(ctx, { x: mid.x + step.gate.normal.x * 0.8, y: mid.y }, heading, 0.9, colour);
  });

  outlined(
    ctx,
    course.solids.filter((solid) => solid.kind === SolidKind.WALL).map((solid) => solid.shape),
    palette.wall,
    palette.wall_edge,
    3 / scale
  );

  if (palette.beams) beams(ctx, state.car, spec, palette);
  for (const each of state.cones) if (each.down) fallen(ctx, each.down, scale, palette);
  if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, spec, scale, palette);
  player(ctx, state.car, state.round.vehicle, spec, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
  const next = playing ? course.steps[state.current] : undefined;
  const hot = new Set<Vec>(next?.gate ? (next.kind === StepKind.SLALOM ? [next.gate.a] : [next.gate.a, next.gate.b]) : []);
  for (const each of state.cones) if (!each.down) cone(ctx, each.at, scale, palette, hot.has(each.at));

  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);

  const badge = Math.max(10, Math.min(14, scale * 0.6));
  const items: Tag[] = [];
  let gate_number = 0;
  course.steps.forEach((step, i) => {
    if (step.kind !== StepKind.GATE) return;
    gate_number++;
    if (i < state.current) return;
    const mid = { x: step.gate!.a.x, y: Math.min(step.gate!.a.y, step.gate!.b.y) - 1.1 };
    const mine = playing && i === state.current;
    items.push({ at: mid, text: String(gate_number), size: badge, colour: mine ? palette.void : palette.paint, pill: mine ? palette.target : palette.floor });
  });
  const box_xs = course.box.map((p) => p.x);
  const box_ys = course.box.map((p) => p.y);
  if (scale * (Math.max(...box_xs) - Math.min(...box_xs)) > badge * 4) {
    items.push({ at: { x: (Math.min(...box_xs) + Math.max(...box_xs)) / 2, y: Math.min(...box_ys) - 0.9 }, text: "STOP", size: badge, colour: palette.paint });
  }
  tags(ctx, items, view, extras.font, palette);

  if (next && state.status === Status.DRIVING) {
    ctx.save();
    bay_pointer(ctx, { shape: step_target(next), heading: 0, either: false }, view, extras.insets, palette);
    ctx.restore();
  }
}
