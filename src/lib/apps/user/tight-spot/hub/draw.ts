import type { Polygon, Vec } from "../core/geometry";
import {
  beams,
  begin_frame,
  contact_rings,
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
  /** Per plot: the game's name, or the name of the one coming there. */
  names: string[];
  /** Per plot: the game's icon once it has decoded. */
  icons: (HTMLImageElement | null)[];
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

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

function screen_text(ctx: CanvasRenderingContext2D, view: View, font: string) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = font;
  ctx.textBaseline = "middle";
}

function label(ctx: CanvasRenderingContext2D, at: Vec, text: string, view: View, size: number, colour: string, font: string) {
  const { x, y } = to_screen(at, view);
  ctx.save();
  screen_text(ctx, view, `600 ${size}px ${font}`);
  ctx.textAlign = "center";
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const extent = (shape: Polygon, axis: "x" | "y") => ({
  min: Math.min(...shape.map((p) => p[axis])),
  max: Math.max(...shape.map((p) => p[axis])),
});

// Sized to the building rather than the screen, like a name painted on its roof, so it reads from across the yard.
function sign(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, view: View, palette: Palette, font: string) {
  const plot = scene.yard.plots[index];
  const across = extent(plot.shape, "x");
  const roof = extent(plot.recess, "y").min - extent(plot.shape, "y").min;
  const centre = to_screen({ x: plot.mouth.x, y: extent(plot.shape, "y").min + roof / 2 }, view);
  const room = (across.max - across.min) * view.scale * 0.86;
  const icon = plot.open ? scene.icons[index] : null;
  let size = Math.max(13, Math.min(44, view.scale * 2.2));
  ctx.save();
  screen_text(ctx, view, `700 ${size}px ${font}`);
  const measure = () => ctx.measureText(scene.names[index]).width + (icon ? size * 1.5 : 0);
  const wide = measure();
  if (wide > room) {
    size = Math.max(8, size * (room / wide));
    ctx.font = `700 ${size}px ${font}`;
  }
  const width = measure();
  const sub = plot.open ? 0 : size * 0.62;
  const y = centre.y - sub * 0.6;
  let x = centre.x - width / 2;
  if (icon && icon.complete && icon.naturalWidth) {
    const box = size * 1.2;
    ctx.drawImage(icon, x, y - box / 2, box, box);
  }
  if (icon) x += size * 1.5;
  ctx.textAlign = "left";
  ctx.fillStyle = plot.open ? palette.paint : palette.faint;
  ctx.fillText(scene.names[index], x, y);
  if (!plot.open) {
    ctx.font = `600 ${sub}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("Soon", centre.x, y + size * 0.62 + sub * 0.5);
  }
  ctx.restore();
}

// The light inside a doorway spills out over its apron, so an open building shows where to drive in.
function doorway(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, pulse: number, palette: Palette) {
  const plot = scene.yard.plots[index];
  const active = scene.at_door === index;
  const glow = active || scene.last === index;
  const back = extent(plot.recess, "y").min;
  const light = ctx.createLinearGradient(0, back, 0, extent(plot.door, "y").max);
  light.addColorStop(0, palette.target);
  light.addColorStop(1, palette.glow_clear);
  ctx.globalAlpha = glow ? 0.5 + 0.2 * pulse : 0.36;
  path(ctx, plot.door);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.globalAlpha = 1;
  const side = extent(plot.recess, "x");
  ctx.strokeStyle = palette.target;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.3, 4 / scale);
  ctx.beginPath();
  ctx.moveTo(side.min + 0.6, back + 0.15);
  ctx.lineTo(side.max - 0.6, back + 0.15);
  ctx.stroke();
  ctx.globalAlpha = glow ? 0.7 + 0.3 * pulse : 1;
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

// Drawn bigger than they are when the view is far out (a cone the size of a pixel is no slalom), but never into each other.
function cones(ctx: CanvasRenderingContext2D, at: Vec[], scale: number, palette: Palette) {
  const r = Math.max(0.34, Math.min(1, 6.5 / scale));
  const line = Math.max(0.05, 1.25 / scale);
  for (const cone of at) {
    ctx.beginPath();
    ctx.roundRect(cone.x - r + r * 0.25, cone.y - r + r * 0.35, r * 2, r * 2, r * 0.35);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cone.x - r, cone.y - r, r * 2, r * 2, r * 0.35);
    ctx.fillStyle = palette.warning;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = palette.warning;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = r * 0.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = palette.glow;
    ctx.fill();
  }
}

function bollards(ctx: CanvasRenderingContext2D, at: Vec[], scale: number, palette: Palette) {
  const r = Math.max(0.24, Math.min(0.75, 5.5 / scale));
  const line = Math.max(0.05, 1.25 / scale);
  for (const post of at) {
    ctx.beginPath();
    ctx.arc(post.x + r * 0.25, post.y + r * 0.35, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(post.x, post.y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.pillar;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(post.x, post.y, r * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = palette.warning;
    ctx.lineWidth = r * 0.34;
    ctx.stroke();
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
  bollards(ctx, yard.bollards, scale, palette);

  if (extras.guides && car.gear !== Gear.PARK) guides(ctx, car, spec, scale, palette);
  player(ctx, car, scene.vehicle, spec, car.brake > 0.05 && car.gear !== Gear.PARK, scale, palette);
  sensor_arcs(ctx, car, spec, extras.sensors, scale, palette);

  if (scene.contact && scene.contact.fade > 0) {
    ctx.globalAlpha = scene.contact.fade;
    contact_rings(ctx, scene.contact.at, pulse, scale, palette);
    ctx.globalAlpha = 1;
  }

  yard.plots.forEach((_, index) => sign(ctx, scene, index, view, palette, extras.font));
}
