import type { Insets } from "../../core/camera";
import { bay_pointer, begin_frame, contact_rings, fill, guides, outlined, path, player, type Palette, type View } from "../../core/draw";
import { flashes } from "../../core/draw-vehicles";
import { oriented_box, type Pose, type Vec } from "../../core/geometry";
import { Gear, to_world, Vehicle, type VehicleSpec } from "../../core/vehicle";
import { AircraftPart, aircraft_parts, NOSE, NOSE_GEAR, pose_from_nose_gear, SHAPES, TAIL } from "./aircraft";
import { tunnel, type Apron } from "./apron";
import { aircraft_pose, SPEC, Status, type GameState } from "./game";

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  font: string;
}

const TUG_ALONE: VehicleSpec = { ...SPEC, hitches: [] };
const TAXIWAY = 11.5;
const STOP_BAR = 4;

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
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

function line(ctx: CanvasRenderingContext2D, points: Vec[]) {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

function ground(ctx: CanvasRenderingContext2D, apron: Apron, scale: number, palette: Palette) {
  const { bounds, centreline } = apron;
  ctx.fillStyle = palette.floor;
  ctx.fillRect(bounds.x0, 0, bounds.x1 - bounds.x0, bounds.y1);
  ctx.fillStyle = palette.asphalt;
  ctx.fillRect(bounds.x0, centreline - TAXIWAY, bounds.x1 - bounds.x0, TAXIWAY * 2);
  fill(ctx, apron.grass, palette.grass);
  outlined(ctx, [apron.terminal], palette.pavement, palette.wall_edge, 3 / scale);
  outlined(ctx, apron.fences, palette.wall, palette.wall_edge, 1.5 / scale);

  // Taxi lines are yellow at any airport: the warning token is the closest the theme has.
  ctx.strokeStyle = palette.warning;
  ctx.lineWidth = Math.max(0.15, 1.5 / scale);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  line(ctx, [
    { x: bounds.x0, y: centreline },
    { x: bounds.x1, y: centreline },
  ]);
  const r = apron.lead_radius;
  for (const stand of apron.stands) {
    const { x, y } = stand.at;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, centreline - r);
    ctx.arc(x + r, centreline - r, r, Math.PI, Math.PI / 2, true);
    ctx.moveTo(x, centreline - r);
    ctx.arc(x - r, centreline - r, r, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 1.5, y);
    ctx.lineTo(x + 1.5, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = palette.error;
  ctx.globalAlpha = 0.45;
  ctx.setLineDash([1.2, 0.9]);
  line(ctx, [
    { x: bounds.x0, y: centreline - TAXIWAY - 0.6 },
    { x: bounds.x1, y: centreline - TAXIWAY - 0.6 },
  ]);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function bridges(ctx: CanvasRenderingContext2D, apron: Apron, scale: number, palette: Palette) {
  for (const bridge of apron.bridges) {
    const shape = tunnel(bridge);
    outlined(ctx, [shape], palette.pavement, palette.wall_edge, 1.5 / scale);
    const dx = bridge.to.x - bridge.from.x;
    const dy = bridge.to.y - bridge.from.y;
    const length = Math.hypot(dx, dy);
    ctx.strokeStyle = palette.faint;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (let d = 2; d < length - 1; d += 1.6) {
      const at = { x: bridge.from.x + (dx / length) * d, y: bridge.from.y + (dy / length) * d };
      ctx.moveTo(at.x - (dy / length) * 1.2, at.y + (dx / length) * 1.2);
      ctx.lineTo(at.x + (dy / length) * 1.2, at.y - (dx / length) * 1.2);
    }
    ctx.stroke();
    outlined(ctx, [oriented_box(bridge.to.x, bridge.to.y, Math.atan2(dy, dx), 2.4, 3.2)], palette.stock, palette.ink, 1 / scale);
    ctx.beginPath();
    ctx.arc(bridge.from.x, bridge.from.y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = palette.pillar;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.stroke();
  }
}

interface Livery {
  fin: string;
  beacon: number;
}

function aircraft(ctx: CanvasRenderingContext2D, pose: Pose, livery: Livery, scale: number, palette: Palette, ghost = false) {
  const parts = aircraft_parts(pose);
  if (ghost) {
    ctx.strokeStyle = palette.free;
    ctx.lineWidth = Math.max(0.12, 1.5 / scale);
    ctx.setLineDash([0.8, 0.6]);
    for (const shape of parts) {
      path(ctx, shape);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    return;
  }
  ctx.save();
  ctx.translate(0.5, 0.8);
  ctx.fillStyle = palette.shadow;
  for (const shape of parts) {
    path(ctx, shape);
    ctx.fill();
  }
  ctx.restore();
  const body = palette.cars[4];
  const edge = Math.max(0.05, 1 / scale);
  parts.forEach((shape, i) => {
    const part = SHAPES[i].part;
    const colour = part === AircraftPart.ENGINE ? palette.steel : part === AircraftPart.FUSELAGE ? body.body : palette.pavement;
    outlined(ctx, [shape], colour, palette.edge, edge);
  });

  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.heading);
  ctx.fillStyle = livery.fin;
  ctx.beginPath();
  ctx.moveTo(-12.5, -0.18);
  ctx.lineTo(TAIL + 0.6, -0.12);
  ctx.lineTo(TAIL + 0.6, 0.12);
  ctx.lineTo(-12.5, 0.18);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) ctx.fillRect(-4.2, side * 17.9 - (side > 0 ? 0.35 : 0), 1.6, 0.35);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(7.3, side * 5.75, 0.25, 0.95, 0, 0, Math.PI * 2);
    ctx.fillStyle = palette.ink;
    ctx.fill();
  }
  ctx.fillStyle = body.glass;
  ctx.beginPath();
  ctx.moveTo(NOSE - 1.1, -0.95);
  ctx.quadraticCurveTo(NOSE - 0.5, 0, NOSE - 1.1, 0.95);
  ctx.lineTo(NOSE - 1.9, 1.15);
  ctx.lineTo(NOSE - 1.9, -1.15);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = edge;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(NOSE - 2.2, 0);
  ctx.stroke();
  // Gear, faintly through the body, so the nose gear can be put on the mark.
  ctx.fillStyle = palette.ink;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(NOSE_GEAR - 0.5, -0.2, 1, 0.4);
  for (const side of [-1, 1]) ctx.fillRect(-0.6, side * 3.8 - 0.35, 1.2, 0.7);
  ctx.globalAlpha = 1;
  if (livery.beacon > 0) {
    ctx.fillStyle = palette.brake_glow;
    ctx.globalAlpha = livery.beacon;
    ctx.beginPath();
    ctx.arc(1.5, 0, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.brake;
    ctx.beginPath();
    ctx.arc(1.5, 0, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function towbar(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const front = to_world(state.car, { x: SPEC.length - SPEC.rear_overhang, y: 0 });
  const gear = to_world(aircraft_pose(state.car), { x: NOSE_GEAR, y: 0 });
  ctx.strokeStyle = palette.ink;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.22, 2.5 / scale);
  line(ctx, [front, gear]);
  ctx.strokeStyle = palette.steel;
  ctx.lineWidth = Math.max(0.12, 1.2 / scale);
  line(ctx, [front, gear]);
  ctx.lineCap = "butt";
}

function stop_mark(ctx: CanvasRenderingContext2D, apron: Apron, scale: number, palette: Palette, pulse: number, playing: boolean) {
  const { stop, heading } = apron;
  const across = heading + Math.PI / 2;
  const a = { x: stop.x + Math.cos(across) * STOP_BAR, y: stop.y + Math.sin(across) * STOP_BAR };
  const b = { x: stop.x - Math.cos(across) * STOP_BAR, y: stop.y - Math.sin(across) * STOP_BAR };
  ctx.save();
  if (playing) {
    ctx.shadowColor = palette.target;
    ctx.shadowBlur = 10 + 6 * pulse;
  }
  ctx.strokeStyle = palette.target;
  ctx.lineWidth = Math.max(0.5, 3 / scale);
  line(ctx, [a, b]);
  ctx.restore();
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { apron } = state;
  begin_frame(ctx, view, palette);
  ground(ctx, apron, scale, palette);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const playing = state.status !== Status.DONE && state.status !== Status.CRASHED;
  if (playing) aircraft(ctx, pose_from_nose_gear(apron.stop, apron.heading), { fin: palette.free, beacon: 0 }, scale, palette, true);
  stop_mark(ctx, apron, scale, palette, pulse, playing);

  apron.parked.forEach((pose, i) => aircraft(ctx, pose, { fin: palette.cars[i % 2].body, beacon: 0 }, scale, palette));
  bridges(ctx, apron, scale, palette);

  const moving = state.status === Status.DRIVING && state.car.gear !== Gear.PARK;
  const plane = aircraft_pose(state.car);
  const on = state.status === Status.READY ? 0 : flashes(extras.time / 1.6, true)[0] > 0.5 ? 0.85 : 0.15;
  aircraft(ctx, plane, { fin: palette.player.body, beacon: on }, scale, palette);
  if (extras.guides && moving) guides(ctx, state.car, SPEC, scale, palette);
  towbar(ctx, state, scale, palette);
  player(ctx, { ...state.car, trailers: undefined }, Vehicle.BAGGAGE, TUG_ALONE, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);

  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, Math.min(scale, 12), palette);

  const label = Math.max(11, Math.min(16, scale * 0.9));
  const items: Tag[] = apron.stands.map((stand) => ({
    at: { x: stand.at.x + 4.5, y: 1.8 },
    text: String(stand.number),
    size: label,
    colour: stand.mine ? palette.void : palette.paint,
    ...(stand.mine ? { pill: palette.target } : {}),
  }));
  if (playing) items.push({ at: apron.stop, text: "STOP", size: label, colour: palette.void, pill: palette.target });
  tags(ctx, items, view, extras.font, palette);

  if (state.status === Status.DRIVING) {
    const mark = oriented_box(apron.stop.x, apron.stop.y, apron.heading, 2, STOP_BAR * 2);
    ctx.save();
    bay_pointer(ctx, { shape: mark, heading: apron.heading, either: false }, view, extras.insets, palette);
    ctx.restore();
  }
}
