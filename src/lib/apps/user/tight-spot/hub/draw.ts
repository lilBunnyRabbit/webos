import type { Vec } from "../core/geometry";
import {
  beams,
  begin_frame,
  contact_rings,
  fill,
  ground,
  guides,
  outlined,
  path,
  player,
  sensor_arcs,
  solids,
  type Palette,
  type View,
} from "../core/draw";
import type { End } from "../core/sensors";
import { Gear, type Car, type Vehicle, type VehicleSpec } from "../core/vehicle";
import { Building } from "../games/define";
import type { Yard } from "./yard";

export interface YardScene {
  yard: Yard;
  car: Car;
  vehicle: Vehicle;
  spec: VehicleSpec;
  names: (string | null)[];
  buildings: (Building | null)[];
  /** The plot of the game played last, whose door glows. */
  last: number | null;
  at_door: number | null;
  on_pad: boolean;
  /** `fade` runs from 1 at the touch down to 0. */
  contact: { at: Vec; fade: number } | null;
}

export interface YardExtras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  font: string;
}

function label(ctx: CanvasRenderingContext2D, at: Vec, text: string, view: View, size: number, colour: string, font: string) {
  const x = view.width / 2 + (at.x - view.x) * view.scale;
  const y = view.height / 2 + (at.y - view.y) * view.scale;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = `600 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function doorway(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, pulse: number, palette: Palette) {
  const plot = scene.yard.plots[index];
  const active = scene.at_door === index;
  const glow = active || scene.last === index;
  ctx.globalAlpha = glow ? 0.7 + 0.3 * pulse : 1;
  fill(ctx, plot.door, glow ? palette.target_fill : palette.asphalt);
  path(ctx, plot.door);
  ctx.strokeStyle = glow ? palette.target : palette.free;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.12, 2 / scale);
  ctx.setLineDash(active ? [] : [0.6, 0.4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function shutter(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, palette: Palette) {
  const { mouth } = scene.yard.plots[index];
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.06, 1 / scale);
  ctx.beginPath();
  for (let y = mouth.y - 4.6; y < mouth.y; y += 0.5) {
    ctx.moveTo(mouth.x - 2.9, y);
    ctx.lineTo(mouth.x + 2.9, y);
  }
  ctx.stroke();
}

// A car park reads from above by the bays painted on its roof deck.
function roof_bays(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, palette: Palette) {
  const { shape, mouth } = scene.yard.plots[index];
  const x0 = shape[0].x;
  const x1 = shape[2].x;
  const top = shape[0].y;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.08, 1.25 / scale);
  ctx.beginPath();
  for (let x = x0 + 1; x <= x1 - 1 + 1e-9; x += 2.5) {
    if (Math.abs(x - mouth.x) < 3.6) continue;
    ctx.moveTo(x, top + 5.2);
    ctx.lineTo(x, top + 10.4);
  }
  ctx.stroke();
}

function buildings(ctx: CanvasRenderingContext2D, scene: YardScene, scale: number, palette: Palette) {
  outlined(ctx, scene.yard.structures, palette.pavement, palette.wall_edge, 3 / scale);
  scene.yard.plots.forEach((plot, index) => {
    if (!plot.open) shutter(ctx, scene, index, scale, palette);
    else if (scene.buildings[index] === Building.CAR_PARK) roof_bays(ctx, scene, index, scale, palette);
  });
}

function cones(ctx: CanvasRenderingContext2D, at: Vec[], scale: number, palette: Palette) {
  for (const cone of at) {
    ctx.beginPath();
    ctx.arc(cone.x + 0.06, cone.y + 0.1, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = palette.warning;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, 0.15, 0, Math.PI * 2);
    ctx.fillStyle = palette.glow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = palette.warning;
    ctx.fill();
  }
}

function pad(ctx: CanvasRenderingContext2D, scene: YardScene, scale: number, pulse: number, palette: Palette) {
  path(ctx, scene.yard.pad);
  ctx.strokeStyle = scene.on_pad ? palette.target : palette.paint;
  ctx.globalAlpha = scene.on_pad ? 0.7 + 0.3 * pulse : 1;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.15, 2.5 / scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function draw_yard(ctx: CanvasRenderingContext2D, scene: YardScene, view: View, palette: Palette, extras: YardExtras) {
  const { scale } = view;
  const { yard, car, spec } = scene;
  begin_frame(ctx, view, palette);
  ground(ctx, yard.surfaces, yard.marks, scale, palette);
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  pad(ctx, scene, scale, pulse, palette);
  const top = yard.pad.reduce((min, p) => Math.min(min, p.y), Infinity);
  const mid = yard.pad.reduce((sum, p) => sum + p.x, 0) / yard.pad.length;
  label(ctx, { x: mid, y: top + 1.4 }, "Garage", view, Math.max(10, Math.min(15, scale * 0.9)), palette.paint, extras.font);
  yard.plots.forEach((plot, index) => {
    if (plot.open) doorway(ctx, scene, index, scale, pulse, palette);
  });

  if (palette.beams) beams(ctx, car, spec, palette);
  buildings(ctx, scene, scale, palette);
  solids(ctx, yard.props, scale, palette);
  cones(ctx, yard.cones, scale, palette);

  if (extras.guides && car.gear !== Gear.PARK) guides(ctx, car, spec, scale, palette);
  player(ctx, car, scene.vehicle, spec, car.brake > 0.05 && car.gear !== Gear.PARK, scale, palette);
  sensor_arcs(ctx, car, spec, extras.sensors, scale, palette);

  if (scene.contact && scene.contact.fade > 0) {
    ctx.globalAlpha = scene.contact.fade;
    contact_rings(ctx, scene.contact.at, pulse, scale, palette);
    ctx.globalAlpha = 1;
  }

  const size = Math.max(11, Math.min(18, scale * 1.1));
  yard.plots.forEach((plot, index) => {
    const name = scene.names[index];
    const centre = { x: plot.mouth.x, y: plot.shape[0].y + 3 };
    label(ctx, centre, name ?? "Soon", view, size, name ? palette.paint : palette.faint, extras.font);
  });
}
